// src/components/NormalZChart.tsx
import { useMemo, useRef, useState } from "react";
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  CartesianGrid,
  XAxis,
  YAxis,
  Tooltip,
  ReferenceLine,
} from "recharts";
import * as XLSX from "xlsx";
import FileLibrary from "./FileLibrary";

const API_BASE = "http://localhost:8000";

/* ===================== Normal(0,1): utilidades ===================== */
function pdf(z: number) {
  return Math.exp(-0.5 * z * z) / Math.sqrt(2 * Math.PI);
}
function erf(x: number) {
  const sign = x < 0 ? -1 : 1;
  x = Math.abs(x);
  const a1 = 0.254829592,
    a2 = -0.284496736,
    a3 = 1.421413741,
    a4 = -1.453152027,
    a5 = 1.061405429,
    p = 0.3275911;
  const t = 1 / (1 + p * x);
  const y = 1 - (((((a5 * t + a4) * t + a3) * t + a2) * t + a1) * t) * Math.exp(-x * x);
  return sign * y;
}
function cdf(z: number) {
  return 0.5 * (1 + erf(z / Math.SQRT2));
}
// erfinv (Winitzki)
function erfinv(x: number) {
  const a = 0.147;
  const ln = Math.log((1 - x) * (1 + x));
  const tt1 = 2 / (Math.PI * a) + ln / 2;
  const tt2 = (1 / a) * ln;
  const sign = x < 0 ? -1 : 1;
  return sign * Math.sqrt(Math.max(0, Math.sqrt(tt1 * tt1 - tt2) - tt1));
}
// Φ^{-1}(p)
function invPhi(p: number) {
  p = Math.min(Math.max(p, 1e-12), 1 - 1e-12);
  return Math.SQRT2 * erfinv(2 * p - 1);
}

/* ===================== Student t (df): utilidades ===================== */
function gammaln(x: number): number {
  const cof = [
    76.18009172947146, -86.50532032941677, 24.01409824083091,
    -1.231739572450155, 0.001208650973866179, -5.395239384953e-6,
  ];
  let y = x;
  let tmp = x + 5.5;
  tmp -= (x + 0.5) * Math.log(tmp);
  let ser = 1.000000000190015;
  for (let j = 0; j < cof.length; j++) {
    y += 1;
    ser += cof[j] / y;
  }
  return -tmp + Math.log(2.5066282746310005 * ser / x);
}

function tPdf(t: number, v: number): number {
  const c = Math.exp(gammaln((v + 1) / 2) - (Math.log(Math.sqrt(v * Math.PI)) + gammaln(v / 2)));
  return c * Math.pow(1 + (t * t) / v, -(v + 1) / 2);
}

function simpsonIntegral(f: (x: number) => number, a: number, b: number, n = 800): number {
  if (b < a) [a, b] = [b, a];
  if (n % 2 === 1) n += 1;
  const h = (b - a) / n;
  let s = f(a) + f(b);
  for (let i = 1; i < n; i++) {
    const x = a + i * h;
    s += f(x) * (i % 2 === 0 ? 2 : 4);
  }
  return (s * h) / 3;
}

function tCdf(x: number, v: number): number {
  if (!Number.isFinite(x)) return x > 0 ? 1 : 0;
  if (x === 0) return 0.5;
  const xx = Math.abs(x);
  const integral = simpsonIntegral((u) => tPdf(u, v), 0, xx);
  const res = 0.5 + (x >= 0 ? 1 : -1) * integral;
  return Math.min(1, Math.max(0, res));
}

function tInvP(p: number, v: number): number {
  // simple binary search using tCdf
  p = Math.min(Math.max(p, 1e-8), 1 - 1e-8);
  let lo = -12, hi = 12;
  for (let iter = 0; iter < 80; iter++) {
    const mid = (lo + hi) / 2;
    const cm = tCdf(mid, v);
    if (cm < p) lo = mid; else hi = mid;
  }
  return (lo + hi) / 2;
}

/* ===================== Tipos UI ===================== */
type TailMode = "between" | "left" | "right";
type UIMode = "prob" | "inverse";

type InvBetween = { type: "between"; z1: number; z2: number };
type InvOne = { type: "one"; z: number };
type InvResult = InvBetween | InvOne | null;

type Row = Record<string, any>;

/* ===================== Componente ===================== */
export default function NormalZChart() {
  // “menú de distribuciones” estilo pizarrón (solo Z activa aquí)
  const distributions = ["Normal (Z)", "t", "F", "χ²", "Exp."];
  const [activeDist, setActiveDist] = useState(0); // 0: Normal(Z), 1: t
  const [df, setDf] = useState(10);

  // Modo de trabajo y tipo de cola
  const [uiMode, setUiMode] = useState<UIMode>("prob");
  const [tail, setTail] = useState<TailMode>("between");

  // Entradas
  const [z1, setZ1] = useState(-1.0);
  const [z2, setZ2] = useState(1.0);
  const [zSingle, setZSingle] = useState(1.0);
  const [pTarget, setPTarget] = useState(0.95);

  // Muestra opcional (columna z), para KPIs observados
  const [sampleZ, setSampleZ] = useState<number[] | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  /* --------- Curva y sombreado --------- */
  const variableLabel = activeDist === 0 ? "z" : "t";
  const graph = useMemo(() => {
    const arr: Array<{ z: number; pdf: number; shade: number | null }> = [];
    const step = 0.02;

    let a = -4,
      b = -4;
    if (uiMode === "prob") {
      if (tail === "between") {
        a = Math.min(z1, z2);
        b = Math.max(z1, z2);
      } else if (tail === "left") {
        a = -4;
        b = zSingle;
      } else {
        a = zSingle;
        b = 4;
      }
    } else {
      if (tail === "between") {
        const q = Math.abs(activeDist === 0 ? invPhi((1 + pTarget) / 2) : tInvP((1 + pTarget) / 2, df));
        a = -q;
        b = q;
      } else if (tail === "left") {
        a = -4;
        b = activeDist === 0 ? invPhi(pTarget) : tInvP(pTarget, df);
      } else {
        a = activeDist === 0 ? invPhi(1 - pTarget) : tInvP(1 - pTarget, df);
        b = 4;
      }
    }

    const minX = activeDist === 0 ? -4 : -6;
    const maxX = activeDist === 0 ? 4 : 6;
    for (let z = minX; z <= maxX + 1e-9; z += step) {
      const p = activeDist === 0 ? pdf(z) : tPdf(z, df);
      arr.push({ z: Number(z.toFixed(3)), pdf: p, shade: z >= a && z <= b ? p : null });
    }
    return { data: arr, a, b };
  }, [uiMode, tail, z1, z2, zSingle, pTarget, activeDist, df]);

  /* --------- Probabilidad teórica --------- */
  const prob = useMemo(() => {
    if (uiMode === "prob") {
      if (tail === "between") {
        const a = Math.min(z1, z2),
          b = Math.max(z1, z2);
        const F = (x: number) => (activeDist === 0 ? cdf(x) : tCdf(x, df));
        return Math.max(0, Math.min(1, F(b) - F(a)));
      } else if (tail === "left") {
        return Math.max(0, Math.min(1, activeDist === 0 ? cdf(zSingle) : tCdf(zSingle, df)));
      }
      const Fz = activeDist === 0 ? cdf(zSingle) : tCdf(zSingle, df);
      return Math.max(0, Math.min(1, 1 - Fz));
    }
    return pTarget;
  }, [uiMode, tail, z1, z2, zSingle, pTarget, activeDist, df]);

  /* --------- Inversa: z dado P --------- */
  const invResult: InvResult = useMemo(() => {
    if (uiMode !== "inverse") return null;
    if (tail === "between") {
      const z = Math.abs(activeDist === 0 ? invPhi((1 + pTarget) / 2) : tInvP((1 + pTarget) / 2, df));
      return { type: "between", z1: -z, z2: z };
    } else if (tail === "left") {
      return { type: "one", z: activeDist === 0 ? invPhi(pTarget) : tInvP(pTarget, df) };
    } else {
      return { type: "one", z: activeDist === 0 ? invPhi(1 - pTarget) : tInvP(1 - pTarget, df) };
    }
  }, [uiMode, tail, pTarget, activeDist, df]);

  /* --------- Muestra (Excel) --------- */
  const onLocalExcel = async (file: File | null) => {
    if (!file) {
      setSampleZ(null);
      return;
    }
    const ab = await file.arrayBuffer();
    const wb = XLSX.read(new Uint8Array(ab), { type: "array" });
    const ws = wb.Sheets[wb.SheetNames[0]];
    const rows: Row[] = XLSX.utils.sheet_to_json(ws, { defval: null });
    const colName = activeDist === 0 ? "z" : "t";
    const colz = rows.map((r) => Number(r[colName])).filter(Number.isFinite) as number[];
    setSampleZ(colz.length ? colz : null);
  };

  const onPickFromLibrary = async (fileMeta: { id: number; filename: string }) => {
    try {
      const resp = await fetch(`${API_BASE}/api/library/excel/download?id=${fileMeta.id}`, {
        credentials: "include",
      });
      if (!resp.ok) return;
      const blob = await resp.blob();
      const ab = await blob.arrayBuffer();
      const wb = XLSX.read(new Uint8Array(ab), { type: "array" });
      const ws = wb.Sheets[wb.SheetNames[0]];
      const rows: Row[] = XLSX.utils.sheet_to_json(ws, { defval: null });
      const colName = activeDist === 0 ? "z" : "t";
      const colz = rows.map((r) => Number(r[colName])).filter(Number.isFinite) as number[];
      setSampleZ(colz.length ? colz : null);
      if (fileInputRef.current) fileInputRef.current.value = "";
    } catch {
      /* silencio */
    }
  };

  /* --------- Presets estilo pizarrón/Minitab --------- */
  const preset = (kind: "pm1" | "p95" | "pm2" | "pm3" | "all") => {
    setUiMode("prob");
    setTail("between");
    if (kind === "pm1") {
      setZ1(-1);
      setZ2(1);
    }
    if (kind === "p95") {
      setZ1(-1.96);
      setZ2(1.96);
    }
    if (kind === "pm2") {
      setZ1(-2);
      setZ2(2);
    }
    if (kind === "pm3") {
      setZ1(-3);
      setZ2(3);
    }
    if (kind === "all") {
      setZ1(-4);
      setZ2(4);
    }
  };

  /* --------- KPIs de muestra --------- */
  const sampleStats = useMemo(() => {
    if (!sampleZ || sampleZ.length === 0) return null;
    const n = sampleZ.length;
    const mean = sampleZ.reduce((s, v) => s + v, 0) / n;
    const sd = Math.sqrt(sampleZ.reduce((s, v) => s + (v - mean) ** 2, 0) / (n - 1 || 1));
    const inside = sampleZ.filter((v) => v >= graph.a && v <= graph.b).length / n;
    return { n, mean, sd, inside };
  }, [sampleZ, graph.a, graph.b]);

  /* ===================== UI ===================== */
  return (
    <div style={{ maxWidth: 1100, margin: "0 auto", display: "grid", gap: 14 }}>
      {/* Encabezado estilo pizarrón: lista de distribuciones */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "220px 1fr",
          gap: 16,
          alignItems: "start",
        }}
      >
        {/* Panel izquierdo: “Dist. prob.” */}
        <div
          style={{
            background: "#0c1330",
            border: "1px solid var(--border)",
            borderRadius: 12,
            padding: 12,
            boxShadow: "0 6px 20px rgba(0,0,0,.25)",
          }}
        >
          <div style={{ fontWeight: 800, marginBottom: 10 }}>Dist. prob.</div>
          <div style={{ display: "grid", gap: 6 }}>
            {distributions.map((d, i) => (
              <button
                key={d}
                className={`btn ${i === activeDist ? '' : 'secondary'}`}
                onClick={() => { if (i <= 1) setActiveDist(i); }}
                disabled={i > 1}
                style={{ padding: '10px 12px', opacity: i > 1 ? 0.5 : 1, cursor: i > 1 ? 'not-allowed' as any : 'pointer' }}
              >
                {d}
              </button>
            ))}
          </div>
        </div>

        {/* Panel derecho: controles “Z” como en el pizarrón/Minitab */}
        <div className="card" style={{ display: "grid", gap: 12 }}>
          {activeDist === 0 ? (
            <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
              <div className="pill">μ = 0</div>
              <div className="pill">σ = 1</div>
            </div>
          ) : (
            <div style={{ display: "grid", gridTemplateColumns: '1fr', gap: 8 }}>
              <label>
                Grados de libertad (ν)
                <input type="number" min={1} step={1} value={df} onChange={(e) => setDf(Math.max(1, Math.floor(Number(e.target.value)||1)))} />
              </label>
            </div>
          )}

          {/* Modo */}
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <button
              className={`btn ${uiMode === "prob" ? "" : "secondary"}`}
              onClick={() => setUiMode("prob")}
            >
              P dado {variableLabel}
            </button>
            <button
              className={`btn ${uiMode === "inverse" ? "" : "secondary"}`}
              onClick={() => setUiMode("inverse")}
            >
              {variableLabel} dado P
            </button>
          </div>

          {/* Controles */}
          {uiMode === "prob" ? (
            <div style={{ display: "grid", gap: 10 }}>
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                <label className="pill" style={{ cursor: "pointer" }}>
                  <input
                    type="radio"
                    checked={tail === "between"}
                    onChange={() => setTail("between")}
                  />{" "}
                  {variableLabel}₁ &lt; {variableLabel.toUpperCase()} &lt; {variableLabel}₂
                </label>
                <label className="pill" style={{ cursor: "pointer" }}>
                  <input
                    type="radio"
                    checked={tail === "left"}
                    onChange={() => setTail("left")}
                  />{" "}
                  {variableLabel.toUpperCase()} ≤ {variableLabel}
                </label>
                <label className="pill" style={{ cursor: "pointer" }}>
                  <input
                    type="radio"
                    checked={tail === "right"}
                    onChange={() => setTail("right")}
                  />{" "}
                  {variableLabel.toUpperCase()} ≥ {variableLabel}
                </label>
              </div>

              {tail === "between" ? (
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                  <label>
                    {variableLabel}₁
                    <input
                      type="number"
                      step="0.1"
                      value={z1}
                      onChange={(e) => setZ1(Number(e.target.value))}
                    />
                  </label>
                  <label>
                    {variableLabel}₂
                    <input
                      type="number"
                      step="0.1"
                      value={z2}
                      onChange={(e) => setZ2(Number(e.target.value))}
                    />
                  </label>
                </div>
              ) : (
                <div style={{ display: "grid", gridTemplateColumns: "1fr", gap: 12 }}>
                  <label>
                    {variableLabel}
                    <input
                      type="number"
                      step="0.1"
                      value={zSingle}
                      onChange={(e) => setZSingle(Number(e.target.value))}
                    />
                  </label>
                </div>
              )}
            </div>
          ) : (
            <div style={{ display: "grid", gap: 10 }}>
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                <label className="pill" style={{ cursor: "pointer" }}>
                  <input
                    type="radio"
                    checked={tail === "between"}
                    onChange={() => setTail("between")}
                  />{" "}
                  P({variableLabel}₁ &lt; {variableLabel.toUpperCase()} &lt; {variableLabel}₂) = P
                </label>
                <label className="pill" style={{ cursor: "pointer" }}>
                  <input
                    type="radio"
                    checked={tail === "left"}
                    onChange={() => setTail("left")}
                  />{" "}
                  P({variableLabel.toUpperCase()} ≤ {variableLabel}) = P
                </label>
                <label className="pill" style={{ cursor: "pointer" }}>
                  <input
                    type="radio"
                    checked={tail === "right"}
                    onChange={() => setTail("right")}
                  />{" "}
                  P({variableLabel.toUpperCase()} ≥ {variableLabel}) = P
                </label>
              </div>

              <label>
                P (0–1)
                <input
                  type="number"
                  min={0}
                  max={1}
                  step="0.001"
                  value={pTarget}
                  onChange={(e) => setPTarget(Number(e.target.value))}
                />
              </label>

              {/* Resultado inverso (con tipos discriminados, sin warnings) */}
              {invResult && invResult.type === "one" && (
                <div className="meta">
                  {variableLabel} ≈ <b>{invResult.z.toFixed(3)}</b>
                </div>
              )}
              {invResult && invResult.type === "between" && (
                <div className="meta">
                  {variableLabel}₁ ≈ <b>{invResult.z1.toFixed(3)}</b>, {variableLabel}₂ ≈ <b>{invResult.z2.toFixed(3)}</b>
                </div>
              )}
            </div>
          )}

          {/* Presets rápidos tipo pizarrón */}
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
            <button className="btn secondary" onClick={() => preset("pm1")}>
              ±1σ
            </button>
            <button className="btn secondary" onClick={() => preset("p95")}>
              95% (±1.96σ)
            </button>
            <button className="btn secondary" onClick={() => preset("pm2")}>
              ±2σ
            </button>
            <button className="btn secondary" onClick={() => preset("pm3")}>
              ±3σ
            </button>
            <button className="btn secondary" onClick={() => preset("all")}>
              Todo
            </button>
          </div>

          {/* Carga de Excel (local + biblioteca) */}
          <div style={{ display: "grid", gap: 10 }}>
            <label>
              Excel con columna <code>{variableLabel}</code>
              <input
                ref={fileInputRef}
                type="file"
                accept=".xlsx"
                onChange={(e) => onLocalExcel(e.target.files?.[0] || null)}
              />
            </label>

            <FileLibrary mode="excel" onPickExcel={(meta) => onPickFromLibrary(meta)} />
          </div>
        </div>
      </div>

      {/* KPIs estilo etiqueta */}
      <div className="kpi" style={{ marginTop: 6 }}>
        <span className="pill">
          <b>P:</b> {prob.toFixed(4)}
        </span>
        <span className="pill">
          <b>área sombreada:</b> [{graph.a.toFixed(2)}, {graph.b.toFixed(2)}]
        </span>
        {sampleStats && (
          <>
            <span className="pill">
              <b>P_muestra:</b> {sampleStats.inside.toFixed(4)}
            </span>
            <span className="pill">
              <b>n:</b> {sampleStats.n}
            </span>
            <span className="pill">
              <b>media({variableLabel}):</b> {sampleStats.mean.toFixed(3)}
            </span>
            <span className="pill">
              <b>sd({variableLabel}):</b> {sampleStats.sd.toFixed(3)}
            </span>
          </>
        )}
      </div>

      {/* Gráfica principal */}
      <div
        className="chart"
        style={{
          height: 380,
          background: "#0c1330",
          border: "1px solid var(--border)",
          borderRadius: 12,
          boxShadow: "0 6px 20px rgba(0,0,0,.25)",
        }}
      >
        <ResponsiveContainer>
          <AreaChart data={graph.data} margin={{ top: 10, right: 20, bottom: 10, left: 0 }}>
            <defs>
              <linearGradient id="fillCurve" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopOpacity={0.6} />
                <stop offset="100%" stopOpacity={0.1} />
              </linearGradient>
              <linearGradient id="fillShade" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopOpacity={0.9} />
                <stop offset="100%" stopOpacity={0.3} />
              </linearGradient>
            </defs>
            <CartesianGrid />
            <XAxis type="number" dataKey="z" domain={activeDist===0?[-4,4]:[-6,6]} ticks={activeDist===0?[-4,-3,-2,-1,0,1,2,3,4]:[-6,-4,-2,0,2,4,6]} />
            <YAxis type="number" domain={[0, activeDist===0?0.45:Math.min(0.5, tPdf(0, df)*1.5)]} />
            <Tooltip />
            <ReferenceLine x={0} strokeDasharray="3 3" />
            <ReferenceLine x={graph.a} strokeDasharray="3 3" />
            <ReferenceLine x={graph.b} strokeDasharray="3 3" />
            <Area dataKey="pdf" type="monotone" baseLine={0} fill="url(#fillCurve)" />
            <Area dataKey="shade" type="monotone" baseLine={0} fill="url(#fillShade)" />
          </AreaChart>
        </ResponsiveContainer>
      </div>

      <div className="meta">
        {activeDist===0 ? (
          <>φ(z) = (1/√(2π))·e<sup>−z²/2</sup>, &nbsp; Φ(z) = P(Z ≤ z)</>
        ) : (
          <>f(t;ν) = Γ((ν+1)/2)/(√(νπ)·Γ(ν/2))·(1+t²/ν)<sup>−(ν+1)/2</sup>, &nbsp; F(t;ν) = P(T ≤ t)</>
        )}
      </div>
    </div>
  );
}
