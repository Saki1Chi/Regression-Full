// src/components/ZProbabilityYTool.tsx
import { useEffect, useMemo, useRef, useState } from "react";
import DistribucionT from "./Distribucion_t";
import DistribucionF from "./DistribucionF";
import DistribucionChi2 from "./DistribucionChi2";
import DistribucionExponencial from "./DistribucionExponencial";
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  CartesianGrid,
  XAxis,
  YAxis,
  Tooltip,
  ReferenceLine,
  Label,
} from "recharts";

/** ===== Normal estándar ===== */
function pdf(z: number) {
  return Math.exp(-0.5 * z * z) / Math.sqrt(2 * Math.PI);
}
function erf(x: number) {
  const sign = x < 0 ? -1 : 1;
  x = Math.abs(x);
  const a1 = 0.254829592, a2 = -0.284496736, a3 = 1.421413741, a4 = -1.453152027, a5 = 1.061405429, p = 0.3275911;
  const t = 1 / (1 + p * x);
  const y = 1 - (((((a5 * t + a4) * t + a3) * t + a2) * t + a1) * t) * Math.exp(-x * x);
  return sign * y;
}
function cdf(z: number) { return 0.5 * (1 + erf(z / Math.SQRT2)); }
function erfinv(x: number) {
  const a = 0.147;
  const ln = Math.log((1 - x) * (1 + x));
  const tt1 = 2 / (Math.PI * a) + ln / 2;
  const tt2 = (1 / a) * ln;
  const sign = x < 0 ? -1 : 1;
  const inside = Math.max(0, Math.sqrt(tt1 * tt1 - tt2) - tt1);
  return sign * Math.sqrt(inside);
}
function invPhi(p: number) {
  const pp = Math.min(Math.max(p, 1e-12), 1 - 1e-12);
  return Math.SQRT2 * erfinv(2 * pp - 1);
}

/** ===== Tipos ===== */
type Tail = "left" | "right" | "two" | "center";

export default function ZProbabilityYTool() {
  // Submenú (solo visual)
  const dists = [
    { key: "normal", label: "Distribución normal estándar", active: true },
    { key: "t", label: "Distribución t", active: true },
    { key: "f", label: "Distribución F", active: true },
    { key: "chi2", label: "Distribución χ²", active: true },
    { key: "exp", label: "Distribución exponencial", active: true },
  ];
  const [menuOpen, setMenuOpen] = useState<boolean>(false);
  const [activeKey, setActiveKey] = useState<"normal" | "t" | "f" | "chi2" | "exp">("normal");

  const [tail, setTail] = useState<Tail>("left");
  // Valores numéricos válidos (últimos confirmados)
  const [z, setZ] = useState<number>(1);
  const [p, setP] = useState<number>(cdf(1));
  // Cadenas para edición (permiten vacío/parciales como "-" o "")
  const [zText, setZText] = useState<string>("1");
  const [pText, setPText] = useState<string>(cdf(1).toFixed(4));
  const [pLeftText, setPLeftText] = useState<string>((cdf(1) / 2).toFixed(4));
  const [pRightText, setPRightText] = useState<string>((cdf(1) / 2).toFixed(4));
  const [pCenterLeftText, setPCenterLeftText] = useState<string>((cdf(1) / 2).toFixed(4));
  const [pCenterRightText, setPCenterRightText] = useState<string>((cdf(1) / 2).toFixed(4));
  const [lastEdited, setLastEdited] = useState<"z" | "p">("z");
  const [twoZLeft, setTwoZLeft] = useState(-1);
  const [twoZRight, setTwoZRight] = useState(1);
  const [twoZLeftText, setTwoZLeftText] = useState("-1.0000");
  const [twoZRightText, setTwoZRightText] = useState("1.0000");
  const prevTailRef = useRef<Tail>(tail);

  const twoTailProbabilities = useMemo(() => {
    if (tail !== "two") return { left: 0, right: 0 };
    const leftProb = cdf(twoZLeft);
    const rightProb = 1 - cdf(twoZRight);
    return { left: leftProb, right: rightProb };
  }, [tail, twoZLeft, twoZRight]);
  const twoLeftProb = twoTailProbabilities.left;
  const twoRightProb = twoTailProbabilities.right;

  const centerProbabilities = useMemo(() => {
    if (tail !== "center") return { left: 0, right: 0 };
    const leftProb = cdf(twoZLeft);
    const rightProb = 1 - cdf(twoZRight);
    return { left: leftProb, right: rightProb };
  }, [tail, twoZLeft, twoZRight]);
  const centerLeftProb = centerProbabilities.left;
  const centerRightProb = centerProbabilities.right;

  // P desde Z (según cola)
  const pFromZ = useMemo(() => {
    if (tail === "left")  return cdf(z);                           // P(Z ≤ z)
    if (tail === "right") return 1 - cdf(z);                       // P(Z ≥ z)
    if (tail === "two")   return twoLeftProb + twoRightProb;
    return 1 - (centerLeftProb + centerRightProb);                 // P(z_L ≤ Z ≤ z_R)
  }, [z, tail, twoLeftProb, twoRightProb, centerLeftProb, centerRightProb]);

  // Z desde P (según cola)
  const zFromP = useMemo(() => {
    const pp = Math.min(Math.max(p, 1e-12), 1 - 1e-12);
    if (tail === "left")  return invPhi(pp);
    if (tail === "right") return invPhi(1 - pp);
    if (tail === "two")   return Math.abs(invPhi(1 - pp / 2));     // z* ≥ 0
    return Math.abs(invPhi((1 + pp) / 2));                         // centro
  }, [p, tail]);

  // valores sincronizados
  const zSync = lastEdited === "p"
    ? (tail === "two" || tail === "center" ? Math.max(Math.abs(twoZLeft), Math.abs(twoZRight)) : zFromP)
    : z;
  const pSync = lastEdited === "z" ? pFromZ : p;

  useEffect(() => {
    const enteringTwo = tail === "two" && prevTailRef.current !== "two";
    const enteringCenter = tail === "center" && prevTailRef.current !== "center";
    if (enteringTwo || enteringCenter) {
      const mag = Math.abs(zSync);
      const leftVal = -mag;
      const rightVal = mag;
      if (twoZLeft !== leftVal) setTwoZLeft(leftVal);
      if (twoZRight !== rightVal) setTwoZRight(rightVal);
      setTwoZLeftText(leftVal.toFixed(4));
      setTwoZRightText(rightVal.toFixed(4));
      if (tail === "two") {
        setPLeftText(cdf(leftVal).toFixed(4));
        setPRightText((1 - cdf(rightVal)).toFixed(4));
      }
      if (tail === "center") {
        setPCenterLeftText((pSync / 2).toFixed(4));
        setPCenterRightText((pSync / 2).toFixed(4));
      }
    }
    prevTailRef.current = tail;
  }, [tail, zSync, twoZLeft, twoZRight, pSync]);

  useEffect(() => {
    if (tail === "two" && lastEdited !== "p") {
      setPLeftText(twoLeftProb.toFixed(4));
      setPRightText(twoRightProb.toFixed(4));
    }
    if (tail === "center" && lastEdited !== "p") {
      setPCenterLeftText(centerLeftProb.toFixed(4));
      setPCenterRightText(centerRightProb.toFixed(4));
    }
  }, [tail, lastEdited, pFromZ, twoLeftProb, twoRightProb, centerLeftProb, centerRightProb]);

  const handleSidePChange = (val: string, side: "left" | "right") => {
    setLastEdited("p");
    if (side === "left") setPLeftText(val);
    else setPRightText(val);
    const parsed = parseFloat(val);
    if (!Number.isFinite(parsed)) return;
    const clamped = Math.min(Math.max(parsed, 0), 1);
    const otherParsed = parseFloat(side === "left" ? pRightText : pLeftText);
    const otherClamped = Number.isFinite(otherParsed) ? Math.min(Math.max(otherParsed, 0), 1) : 0;
    const total = Math.min(Math.max(clamped + otherClamped, 0), 1);
    const leftProb = side === "left" ? clamped : otherClamped;
    const rightProb = side === "right" ? clamped : otherClamped;
    const safeLeft = Math.min(Math.max(leftProb, 1e-12), 1 - 1e-12);
    const safeRight = Math.min(Math.max(rightProb, 1e-12), 1 - 1e-12);
    const leftZ = invPhi(safeLeft);
    const rightZ = invPhi(1 - safeRight);
    setP(total);
    setPText(total.toString());
    setTwoZLeft(leftZ);
    setTwoZRight(rightZ);
    setTwoZLeftText(leftZ.toFixed(4));
    setTwoZRightText(rightZ.toFixed(4));
    const mag = Math.max(Math.abs(leftZ), Math.abs(rightZ));
    setZ(mag);
    setZText(mag.toString());
  };

  const handleCenterSidePChange = (val: string, side: "left" | "right") => {
    setLastEdited("p");
    if (side === "left") setPCenterLeftText(val);
    else setPCenterRightText(val);
    const parsed = parseFloat(val);
    if (!Number.isFinite(parsed)) return;
    const clamped = Math.min(Math.max(parsed, 0), 1);
    const otherParsed = parseFloat(side === "left" ? pCenterRightText : pCenterLeftText);
    const otherClamped = Number.isFinite(otherParsed) ? Math.min(Math.max(otherParsed, 0), 1) : 0;
    const leftProb = side === "left" ? clamped : otherClamped;
    const rightProb = side === "right" ? clamped : otherClamped;
    const safeLeft = Math.min(Math.max(leftProb, 1e-12), 1 - 1e-12);
    const safeRight = Math.min(Math.max(rightProb, 1e-12), 1 - 1e-12);
    const leftZ = invPhi(safeLeft);
    const rightZ = invPhi(1 - safeRight);
    setTwoZLeft(leftZ);
    setTwoZRight(rightZ);
    setTwoZLeftText(leftZ.toFixed(4));
    setTwoZRightText(rightZ.toFixed(4));
    const totalCenter = Math.max(0, 1 - (leftProb + rightProb));
    setP(totalCenter);
    setPText(totalCenter.toString());
    const mag = Math.max(Math.abs(leftZ), Math.abs(rightZ));
    setZ(mag);
    setZText(mag.toString());
  };

  // Separación de etiquetas cuando hay dos líneas muy cercanas
  const isCenter = tail === "center";
  const pairDxTwo = Math.min(Math.abs(twoZLeft), Math.abs(twoZRight)) < 0.5 ? 18 : 0;
  const pairDx = tail === "two" ? pairDxTwo : Math.abs(zSync) < 0.5 ? 18 : 0; // usado en "two"
  const pairDxCenter = isCenter && Math.abs(zSync) < 0.75 ? 64 : 0; // más separación en "center" (doble)
  const bottomDyCenter = isCenter && Math.abs(zSync) < 0.75 ? 20 : 14;

  // datos para gráfica y sombreado
  const graph = useMemo(() => {
    const data: Array<{ x: number; pdf: number; shade: number | null; shade2?: number | null; }> = [];
    const step = 0.02;
    const zz = Math.abs(zSync);
    const twoLeftBound = tail === "two" ? twoZLeft : tail === "center" ? twoZLeft : -zz;
    const twoRightBound = tail === "two" ? twoZRight : tail === "center" ? twoZRight : zz;

    let leftA = -4, leftB = -4, rightA = 4, rightB = 4, centerA = -zz, centerB = zz;

    if (tail === "left")  { leftA = -4; leftB = zSync; }
    else if (tail === "right") { rightA = zSync; rightB = 4; }
    else if (tail === "two") { leftA = -4; leftB = twoLeftBound; rightA = twoRightBound; rightB = 4; }
    else { centerA = twoLeftBound; centerB = twoRightBound; }

    for (let x = -4; x <= 4 + 1e-9; x += step) {
      const y = pdf(x);
      let s: number | null = null, s2: number | null = null;
      if (tail === "left" || tail === "right") {
        const inL = x >= leftA && x <= leftB;
        const inR = x >= rightA && x <= rightB;
        s = inL || inR ? y : null;
      } else if (tail === "two") {
        const inL = x >= leftA && x <= leftB;
        const inR = x >= rightA && x <= rightB;
        s = inL ? y : null; s2 = inR ? y : null;
      } else {
        const inC = x >= centerA && x <= centerB;
        s = inC ? y : null;
      }
      data.push({ x: Number(x.toFixed(3)), pdf: y, shade: s, shade2: s2 ?? null });
    }

    return {
      data,
      markers:
        tail === "two" || tail === "center"
          ? [twoLeftBound, twoRightBound]
          : [zSync],
  };
  }, [zSync, tail, twoZLeft, twoZRight]);

  return (
    <div style={{ display: "grid", gap: 16, maxWidth: 1100, margin: "0 auto" }}>
      {/* Menú desplegable: Gráficas de Distribución */}
      <div className="card" style={{ padding: 0 }}>
        <button
          onClick={() => setMenuOpen((v) => !v)}
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            width: "100%",
            padding: 14,
            border: "none",
            background: "transparent",
            borderRadius: 16,
            cursor: "pointer",
            fontWeight: 800,
            fontSize: 16,
          }}
        >
          <span>Gráficas de distribución</span>
          <svg
            width="18" height="18" viewBox="0 0 24 24"
            style={{ transform: menuOpen ? "rotate(180deg)" : "rotate(0deg)", transition: "transform .2s" }}
            aria-hidden="true"
          >
            <path d="M7 10l5 5 5-5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>
        {menuOpen && (
          <div style={{ display: "grid", gap: 10, padding: 12 }}>
            {dists.map((d) => (
              <button
                key={d.key}
                className={`btn ${activeKey === (d.key as any) ? "" : "secondary"}`}
                title={d.label}
                disabled={!d.active}
                onClick={() => d.active && setActiveKey(d.key as any)}
                style={{ width: "100%" }}
              >
                {d.label}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Si está activa la t o la F, renderizamos sus componentes dedicados */}
      {activeKey === "t" && (
        <div>
          <DistribucionT />
        </div>
      )}

      {activeKey === "f" && (
        <div>
          <DistribucionF />
        </div>
      )}

      {activeKey === "chi2" && (
        <div>
          <DistribucionChi2 />
        </div>
      )}

      {activeKey === "exp" && (
        <div>
          <DistribucionExponencial />
        </div>
      )}

      {activeKey === "normal" && (
      <>
      {/* μ y σ */}
      <div className="kpi">
        <span className="pill">μ = <b>0</b></span>
        <span className="pill">σ = <b>1</b></span>
      </div>

      {/* Controles */}
      <div className="card" style={{ display: "grid", gap: 16, padding: 16, borderRadius: 12 }}>
        {/* Selector de colas con iconos */}
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(4, minmax(140px, 1fr))",
            gap: 12,
            alignItems: "stretch",
            justifyItems: "stretch",
          }}
        >
          {([
            { key: "left", label: "Cola izquierda" },
            { key: "right", label: "Cola derecha" },
            { key: "two", label: "Dos colas" },
            { key: "center", label: "Centro" },
          ] as Array<{ key: Tail; label: string }>).map((opt) => (
            <label
              key={opt.key}
              style={{
                cursor: "pointer",
                border: "1px solid var(--border)",
                borderRadius: 12,
                padding: 12,
                display: "grid",
                gap: 8,
                justifyItems: "center",
                alignContent: "center",
                background: tail === opt.key ? "#1a2353" : "transparent",
                color: tail === opt.key ? "#ffffff" : "inherit",
              }}
            >
              <input
                type="radio"
                name="tail"
                checked={tail === opt.key}
                onChange={() => setTail(opt.key)}
                style={{ display: "none" }}
              />
              {/* Icono */}
              <svg width="72" height="36" viewBox="0 0 72 36" aria-hidden="true">
                <defs>
                  {/* área bajo la curva */}
                  <path id="underPath" d="M2,28 C 22,4 50,4 70,28 L70,28 L2,28 Z" />
                  {/* zonas de recorte */}
                  <clipPath id="clipLeft"><rect x="2" y="0" width="28" height="28" /></clipPath>
                  <clipPath id="clipRight"><rect x="42" y="0" width="28" height="28" /></clipPath>
                  <clipPath id="clipCenter"><rect x="28" y="0" width="16" height="28" /></clipPath>
                </defs>

                {/* sombreado suave siguiendo la curva */}
                {opt.key === "left" && (
                  <use xlinkHref="#underPath" fill="#22c55e" opacity="0.45" clipPath="url(#clipLeft)" />
                )}
                {opt.key === "right" && (
                  <use xlinkHref="#underPath" fill="#22c55e" opacity="0.45" clipPath="url(#clipRight)" />
                )}
                {opt.key === "two" && (
                  <>
                    <use xlinkHref="#underPath" fill="#22c55e" opacity="0.45" clipPath="url(#clipLeft)" />
                    <use xlinkHref="#underPath" fill="#22c55e" opacity="0.45" clipPath="url(#clipRight)" />
                  </>
                )}
                {opt.key === "center" && (
                  <use xlinkHref="#underPath" fill="#22c55e" opacity="0.45" clipPath="url(#clipCenter)" />
                )}

                {/* eje */}
                <line x1="2" y1="28" x2="70" y2="28" stroke="var(--border)" strokeWidth="1" />
                {/* curva normal aproximada */}
                <path d="M2,28 C 22,4 50,4 70,28" fill="none" stroke="#3b82f6" strokeWidth="2" />
              </svg>
              <div style={{ fontWeight: tail === opt.key ? 700 : 600, textAlign: "center" }}>{opt.label}</div>
            </label>
          ))}
        </div>

        {/* Z y P (condicional) */}
        {tail === "two" ? (
          <div style={{ display: "grid", gridTemplateColumns: "repeat(4, minmax(160px, 1fr))", gap: 12 }}>
            <label>
              Z₁
              <span style={{ fontSize: 12, marginLeft: 6, opacity: 0.75 }}>(auto)</span>
              <input
                type="number"
                step="0.01"
                value={twoZLeftText}
                onChange={(e) => {
                  const val = e.target.value;
                  setTwoZLeftText(val);
                  const parsed = parseFloat(val);
                  if (Number.isFinite(parsed)) {
                    setLastEdited("z");
                    setTwoZLeft(parsed);
                    const mag = Math.abs(parsed);
                    setZ(mag);
                    setZText(mag.toString());
                    setPLeftText(cdf(parsed).toFixed(4));
                    setPRightText((1 - cdf(twoZRight)).toFixed(4));
                    const total = Math.min(Math.max(cdf(parsed) + (1 - cdf(twoZRight)), 0), 1);
                    setP(total);
                    setPText(total.toString());
                  }
                }}
              />
            </label>
            <label>
              Z₂
              <span style={{ fontSize: 12, marginLeft: 6, opacity: 0.75 }}>(auto)</span>
              <input
                type="number"
                step="0.01"
                value={twoZRightText}
                onChange={(e) => {
                  const val = e.target.value;
                  setTwoZRightText(val);
                  const parsed = parseFloat(val);
                  if (Number.isFinite(parsed)) {
                    setLastEdited("z");
                    setTwoZRight(parsed);
                    const mag = Math.abs(parsed);
                    setZ(mag);
                    setZText(mag.toString());
                    setPLeftText(cdf(twoZLeft).toFixed(4));
                    setPRightText((1 - cdf(parsed)).toFixed(4));
                    const total = Math.min(Math.max(cdf(twoZLeft) + (1 - cdf(parsed)), 0), 1);
                    setP(total);
                    setPText(total.toString());
                  }
                }}
              />
            </label>
            <label>
              P1 (0–1)
              <input
                type="number"
                min={0}
                max={1}
                step="0.0001"
                value={pLeftText}
                onChange={(e) => handleSidePChange(e.target.value, "left")}
              />
            </label>
            <label>
              P2 (0–1)
              <input
                type="number"
                min={0}
                max={1}
                step="0.0001"
                value={pRightText}
                onChange={(e) => handleSidePChange(e.target.value, "right")}
              />
            </label>
          </div>
        ) : tail === "center" ? (
          <div style={{ display: "grid", gridTemplateColumns: "repeat(4, minmax(160px, 1fr))", gap: 12 }}>
            <label>
              Z₁
              <span style={{ fontSize: 12, marginLeft: 6, opacity: 0.75 }}>(auto)</span>
              <input
                type="number"
                step="0.01"
                value={twoZLeftText}
                onChange={(e) => {
                  const val = e.target.value;
                  setTwoZLeftText(val);
                  const parsed = parseFloat(val);
                  if (Number.isFinite(parsed)) {
                    setLastEdited("z");
                    setTwoZLeft(parsed);
                    setPCenterLeftText(cdf(parsed).toFixed(4));
                    setPCenterRightText((1 - cdf(twoZRight)).toFixed(4));
                    const totalCenter = Math.max(0, 1 - (cdf(parsed) + (1 - cdf(twoZRight))));
                    setP(totalCenter);
                    setPText(totalCenter.toString());
                    setZ(Math.max(Math.abs(parsed), Math.abs(twoZRight)));
                    setZText(Math.max(Math.abs(parsed), Math.abs(twoZRight)).toString());
                  }
                }}
              />
            </label>
            <label>
              Z₂
              <span style={{ fontSize: 12, marginLeft: 6, opacity: 0.75 }}>(auto)</span>
              <input
                type="number"
                step="0.01"
                value={twoZRightText}
                onChange={(e) => {
                  const val = e.target.value;
                  setTwoZRightText(val);
                  const parsed = parseFloat(val);
                  if (Number.isFinite(parsed)) {
                    setLastEdited("z");
                    setTwoZRight(parsed);
                    setPCenterLeftText(cdf(twoZLeft).toFixed(4));
                    setPCenterRightText((1 - cdf(parsed)).toFixed(4));
                    const totalCenter = Math.max(0, 1 - (cdf(twoZLeft) + (1 - cdf(parsed))));
                    setP(totalCenter);
                    setPText(totalCenter.toString());
                    setZ(Math.max(Math.abs(twoZLeft), Math.abs(parsed)));
                    setZText(Math.max(Math.abs(twoZLeft), Math.abs(parsed)).toString());
                  }
                }}
              />
            </label>
            <label>
              P1 (0–1)
              <input
                type="number"
                min={0}
                max={1}
                step="0.0001"
                value={pCenterLeftText}
                onChange={(e) => handleCenterSidePChange(e.target.value, "left")}
              />
            </label>
            <label>
              P2 (0–1)
              <input
                type="number"
                min={0}
                max={1}
                step="0.0001"
                value={pCenterRightText}
                onChange={(e) => handleCenterSidePChange(e.target.value, "right")}
              />
            </label>
          </div>
        ) : (
          <div style={{ display: "grid", gridTemplateColumns: "repeat(2, minmax(240px, 1fr))", gap: 12 }}>
            <label>
              Z
              <input
                type="number"
                step="0.01"
                value={lastEdited === "z" ? zText : (Number.isFinite(zFromP) ? zFromP.toFixed(4) : "")}
                onChange={(e) => {
                  const val = e.target.value;
                  setLastEdited("z");
                  setZText(val);
                  const parsed = parseFloat(val);
                  if (Number.isFinite(parsed)) setZ(parsed);
                }}
              />
            </label>

            <label>
              P (0–1)
              <input
                type="number"
                min={0}
                max={1}
                step="0.0001"
                value={lastEdited === "p" ? pText : pFromZ.toFixed(4)}
                onChange={(e) => {
                  const val = e.target.value;
                  setLastEdited("p");
                  setPText(val);
                  const parsed = parseFloat(val);
                  if (Number.isFinite(parsed)) {
                    const clamped = Math.min(Math.max(parsed, 0), 1);
                    setP(clamped);
                  }
                }}
              />
            </label>
          </div>
        )}
      </div>

      {/* Gráfica */}
      <div className="chart" style={{ height: 380 }}>
        <ResponsiveContainer>
          {/* margen inferior mayor para separar más las etiquetas bajo el eje */}
          <AreaChart data={graph.data} margin={{ top: 10, right: 20, bottom: 40, left: 0 }}>
            <defs>
              <linearGradient id="fillCurve" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopOpacity={0.6} />
                <stop offset="100%" stopOpacity={0.1} />
              </linearGradient>
              <linearGradient id="fillShade" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#22c55e" stopOpacity={0.9} />
                <stop offset="100%" stopColor="#22c55e" stopOpacity={0.3} />
              </linearGradient>
            </defs>

            <CartesianGrid />
            <XAxis type="number" dataKey="x" domain={[-4, 4]} />
            <YAxis type="number" domain={[0, 0.45]} />

            {/* Tooltip oculto */}
           

            {/* Línea en 0 */}
            <ReferenceLine x={0} strokeDasharray="3 3" />

            {/* Límites + etiquetas P bajo el eje */}
            {tail === "left" && (
              <>
                <ReferenceLine
                  x={zSync}
                  strokeDasharray="3 3" stroke="red"
                  label={{ value: `P = ${pSync.toFixed(4)}`, position: "bottom", dy: 14 }}
                />
                {/* etiqueta superior con z */}
                <ReferenceLine x={zSync} stroke="transparent">
                  <Label value={`z = ${zSync.toFixed(3)}`} position="insideTop" dy={8} fill="var(--text)" />
                </ReferenceLine>
              </>
            )}
            {tail === "right" && (
              <>
                <ReferenceLine
                  x={zSync}
                  strokeDasharray="3 3" stroke="red"
                  label={{ value: `P = ${pSync.toFixed(4)}`, position: "bottom", dy: 14 }}
                />
                <ReferenceLine x={zSync} stroke="transparent">
                  <Label value={`z = ${zSync.toFixed(3)}`} position="insideTop" dy={8} fill="var(--text)" />
                </ReferenceLine>
              </>
            )}
            {tail === "two" && (
              <>
                <ReferenceLine
                  x={twoZLeft}
                  strokeDasharray="3 3" stroke="red"
                  label={{ value: `P₁ = ${twoLeftProb.toFixed(4)}`, position: "bottom", dy: 14, dx: -pairDx }}
                />
                {/* etiquetas z arriba */}
                <ReferenceLine x={twoZLeft} stroke="transparent">
                  <Label value={`Z₁ = ${twoZLeft.toFixed(3)}`} position="insideTop" dy={8} dx={-pairDx} fill="var(--text)" />
                </ReferenceLine>
                
                <ReferenceLine
                  x={twoZRight}
                  strokeDasharray="3 3" stroke="red"
                  label={{ value: `P₂ = ${twoRightProb.toFixed(4)}`, position: "bottom", dy: 14, dx: pairDx }}
                />
                <ReferenceLine x={twoZRight} stroke="transparent">
                  <Label value={`Z₂ = ${twoZRight.toFixed(3)}`} position="insideTop" dy={8} dx={pairDx} fill="var(--text)" />
                </ReferenceLine>
              </>
            )}
            {tail === "center" && (
              <>
                <ReferenceLine
                  x={twoZLeft}
                  strokeDasharray="3 3" stroke="red"
                  label={{ value: `P₁ = ${centerLeftProb.toFixed(4)}`, position: "bottom", dy: bottomDyCenter, dx: -pairDxCenter }}
                />
                <ReferenceLine x={twoZLeft} stroke="transparent">
                  <Label value={`Z₁ = ${twoZLeft.toFixed(3)}`} position="insideTop" dy={8} dx={-pairDxCenter} fill="var(--text)" />
                </ReferenceLine>
                <ReferenceLine
                  x={twoZRight}
                  strokeDasharray="3 3" stroke="red"
                  label={{ value: `P₂ = ${centerRightProb.toFixed(4)}`, position: "bottom", dy: bottomDyCenter, dx: pairDxCenter }}
                />
                <ReferenceLine x={twoZRight} stroke="transparent">
                  <Label value={`Z₂ = ${twoZRight.toFixed(3)}`} position="insideTop" dy={8} dx={pairDxCenter} fill="var(--text)" />
                </ReferenceLine>
              </>
            )}

            {/* Sombreado verde (debajo), curva azul (encima) */}
            <Area dataKey="shade" type="monotone" baseLine={0} fill="url(#fillShade)" stroke="none" />
            <Area dataKey="shade2" type="monotone" baseLine={0} fill="url(#fillShade)" stroke="none" />
            <Area dataKey="pdf" type="monotone" baseLine={0} fill="url(#fillCurve)" stroke="#2563eb" />
          </AreaChart>
        </ResponsiveContainer>
      </div>

      {/* Pie informativo */}
      <div className="meta" style={{ textAlign: "center" }}>
        φ(z) = (1/√(2π))·e<sup>−z²/2</sup>, &nbsp; Φ(z) = P(Z ≤ z)
      </div>
      </>
      )}
    </div>
  );
}
