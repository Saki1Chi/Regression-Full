// src/components/distribucion_t.tsx
import { useEffect, useMemo, useRef, useState } from "react";
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

/** ===== util numérica =====
 * pdf_t, cdf_t (integración numérica), inv_t (bisección usando cdf_t)
 */

function gammaLn(z: number): number {
  // log Γ(z) usando aproximación de Lanczos
  const p = [
    676.5203681218851,
    -1259.1392167224028,
    771.32342877765313,
    -176.61502916214059,
    12.507343278686905,
    -0.13857109526572012,
    9.9843695780195716e-6,
    1.5056327351493116e-7,
  ];
  const g = 7;
  if (z < 0.5) {
    // reflexión
    return Math.log(Math.PI) - Math.log(Math.sin(Math.PI * z)) - gammaLn(1 - z);
  }
  z -= 1;
  let x = 0.99999999999980993;
  for (let i = 0; i < p.length; i++) {
    x += p[i] / (z + i + 1);
  }
  const t = z + g + 0.5;
  return (
    0.5 * Math.log(2 * Math.PI) +
    (z + 0.5) * Math.log(t) -
    t +
    Math.log(x)
  );
}

function pdf_t(x: number, df: number): number {
  // f_t(x;ν) = Γ((ν+1)/2) / ( sqrt(νπ) Γ(ν/2) ) * (1 + x²/ν)^(-(ν+1)/2)
  const v = df;
  const a = Math.exp(
    gammaLn((v + 1) / 2) -
      gammaLn(v / 2) -
      0.5 * (Math.log(v) + Math.log(Math.PI))
  );
  return a * Math.pow(1 + (x * x) / v, -(v + 1) / 2);
}

// integración numérica simpson adaptativo en [-A, x] convirtiendo simetría
function simpsonIntegral(
  f: (xx: number) => number,
  a: number,
  b: number,
  nSteps = 256
): number {
  if (b === a) return 0;
  const n = nSteps % 2 === 0 ? nSteps : nSteps + 1;
  const h = (b - a) / n;
  let s = f(a) + f(b);
  for (let i = 1; i < n; i++) {
    const x = a + i * h;
    s += f(x) * (i % 2 === 0 ? 2 : 4);
  }
  return (h / 3) * s;
}

function cdf_t(x: number, df: number): number {
  // F_t(x;ν). Usamos simetría:
  // F_t(0)=0.5; para x>0: 0.5 + ∫0→x pdf_t; para x<0: 0.5 - ∫0→|x| pdf_t
  if (!Number.isFinite(x)) {
    return x < 0 ? 0 : 1;
  }
  const v = df;
  const f = (u: number) => pdf_t(u, v);
  if (x === 0) return 0.5;
  if (x > 0) {
    const area = simpsonIntegral(f, 0, x, 512);
    return 0.5 + area;
  } else {
    const area = simpsonIntegral(f, 0, -x, 512);
    return 0.5 - area;
  }
}

function inv_t(p: number, df: number): number {
  // inversa por bisección
  // buscamos t tal que cdf_t(t,df)=p
  const target = Math.min(Math.max(p, 1e-12), 1 - 1e-12);
  // rango inicial amplio
  let lo = -10;
  let hi = 10;
  // expandir si hace falta
  while (cdf_t(lo, df) > target) lo *= 2;
  while (cdf_t(hi, df) < target) hi *= 2;

  for (let i = 0; i < 80; i++) {
    const mid = (lo + hi) / 2;
    const cmid = cdf_t(mid, df);
    if (cmid < target) {
      lo = mid;
    } else {
      hi = mid;
    }
  }
  return (lo + hi) / 2;
}

/** ===== Tipos ===== */
type Tail = "left" | "right" | "two" | "center";

export default function DistribucionT() {
  // grados de libertad ν
  const [df, setDf] = useState<number>(10);

  // selector de colas
  const [tail, setTail] = useState<Tail>("left");

  // valores numéricos válidos
  const [tVal, setTVal] = useState<number>(1);
  const [pVal, setPVal] = useState<number>(cdf_t(1, 10));

  // strings editables
  const [tText, setTText] = useState<string>("1");
  const [pText, setPText] = useState<string>(cdf_t(1, 10).toFixed(4));
  const [pLeftText, setPLeftText] = useState<string>(cdf_t(-1, 10).toFixed(4));
  const [pRightText, setPRightText] = useState<string>((1 - cdf_t(1, 10)).toFixed(4));
  const [pCenterLeftText, setPCenterLeftText] = useState<string>(cdf_t(-1, 10).toFixed(4));
  const [pCenterRightText, setPCenterRightText] = useState<string>((1 - cdf_t(1, 10)).toFixed(4));
  const [dfText, setDfText] = useState<string>("10");

  // quién fue editado por última vez: "t" | "p" | "df"
  const [lastEdited, setLastEdited] = useState<"t" | "p" | "df">("t");
  const [twoTLeft, setTwoTLeft] = useState(-1);
  const [twoTRight, setTwoTRight] = useState(1);
  const [twoTLeftText, setTwoTLeftText] = useState("-1.0000");
  const [twoTRightText, setTwoTRightText] = useState("1.0000");
  const [twoTailManual, setTwoTailManual] = useState(false);
  const prevTailRef = useRef<Tail>(tail);

  const twoTailProbabilities = useMemo(() => {
    if (tail !== "two") return { left: 0, right: 0 };
    const leftProb = cdf_t(twoTLeft, df);
    const rightProb = 1 - cdf_t(twoTRight, df);
    return { left: leftProb, right: rightProb };
  }, [tail, twoTLeft, twoTRight, df]);
  const twoLeftProb = twoTailProbabilities.left;
  const twoRightProb = twoTailProbabilities.right;

  const centerProbabilities = useMemo(() => {
    if (tail !== "center") return { left: 0, right: 0 };
    const leftProb = cdf_t(twoTLeft, df);
    const rightProb = 1 - cdf_t(twoTRight, df);
    return { left: leftProb, right: rightProb };
  }, [tail, twoTLeft, twoTRight, df]);
  const centerLeftProb = centerProbabilities.left;
  const centerRightProb = centerProbabilities.right;

// P desde t según cola
  const pFromT = useMemo(() => {
    const F = (x: number) => cdf_t(x, df);
    const t = tVal;
    const absT = Math.abs(t);

    if (tail === "left") return F(t); // P(T ≤ t)
    if (tail === "right") return 1 - F(t); // P(T ≥ t)
    if (tail === "two") return twoLeftProb + twoRightProb; // P(|T| ≥ t)
    return 1 - (centerLeftProb + centerRightProb); // P(t1 ≤ T ≤ t2)
  }, [tVal, tail, df, twoLeftProb, twoRightProb, centerLeftProb, centerRightProb]);

  // t desde P según cola
  const tFromP = useMemo(() => {
    const clampP = Math.min(Math.max(pVal, 1e-12), 1 - 1e-12);
    if (tail === "left") {
      return inv_t(clampP, df);
    }
    if (tail === "right") {
      return inv_t(1 - clampP, df);
    }
    if (tail === "two") {
      // p = 2*(1-F(|t|))  => F(|t|)=1-p/2  => |t| = inv_t(1-p/2)
      const crit = inv_t(1 - clampP / 2, df);
      return Math.abs(crit);
    }
    // center:
    // p = 2F(|t|)-1 => F(|t|)=(1+p)/2 => |t| = inv_t((1+p)/2)
    const crit = inv_t((1 + clampP) / 2, df);
    return Math.abs(crit);
  }, [pVal, tail, df]);

  // sincronizados
  const tSync =
    tail === "two" || tail === "center"
      ? Math.max(Math.abs(twoTLeft), Math.abs(twoTRight))
      : lastEdited === "p" || lastEdited === "df"
      ? tFromP
      : tVal;
  const pSync = lastEdited === "t" || lastEdited === "df" ? pFromT : pVal;

  useEffect(() => {
    const enteringTwo = tail === "two" && prevTailRef.current !== "two";
    const enteringCenter = tail === "center" && prevTailRef.current !== "center";
    if (enteringTwo || enteringCenter) {
      const mag = Math.abs(tSync);
      const leftVal = -mag;
      const rightVal = mag;
      setTwoTLeft(leftVal);
      setTwoTRight(rightVal);
      setTwoTLeftText(leftVal.toFixed(4));
      setTwoTRightText(rightVal.toFixed(4));
      setTwoTailManual(false);
      if (tail === "two") {
        setPLeftText(cdf_t(leftVal, df).toFixed(4));
        setPRightText((1 - cdf_t(rightVal, df)).toFixed(4));
      }
      if (tail === "center") {
        setPCenterLeftText(cdf_t(leftVal, df).toFixed(4));
        setPCenterRightText((1 - cdf_t(rightVal, df)).toFixed(4));
      }
    }
    prevTailRef.current = tail;
  }, [tail, tSync, df]);

  useEffect(() => {
    if (tail !== "two") return;
    const mag = Math.abs(tSync);
    const leftVal = -mag;
    const rightVal = mag;

    if (lastEdited === "p") {
      const leftProb = cdf_t(twoTLeft, df);
      const rightProb = 1 - cdf_t(twoTRight, df);
      const total = Math.min(Math.max(leftProb + rightProb, 0), 1);
      setPVal(total);
      setPText(total.toString());
      return;
    }

    if (lastEdited === "df" && !twoTailManual) {
      setTwoTLeft(leftVal);
      setTwoTRight(rightVal);
      setTwoTLeftText(leftVal.toFixed(4));
      setTwoTRightText(rightVal.toFixed(4));
    }

    const leftProb = cdf_t(twoTLeft, df);
    const rightProb = 1 - cdf_t(twoTRight, df);
    setPLeftText(leftProb.toFixed(4));
    setPRightText(rightProb.toFixed(4));
    const total = Math.min(Math.max(leftProb + rightProb, 0), 1);
    setPVal(total);
    setPText(total.toString());
  }, [tail, lastEdited, tSync, twoTailManual, twoTLeft, twoTRight, df]);

  useEffect(() => {
    if (tail !== "center") return;
    const leftProb = cdf_t(twoTLeft, df);
    const rightProb = 1 - cdf_t(twoTRight, df);
    const totalCenter = Math.max(0, 1 - (leftProb + rightProb));

    if (lastEdited === "p") {
      setPVal(totalCenter);
      setPText(totalCenter.toString());
      return;
    }

    setPCenterLeftText(leftProb.toFixed(4));
    setPCenterRightText(rightProb.toFixed(4));
    setPVal(totalCenter);
    setPText(totalCenter.toString());
  }, [tail, lastEdited, twoTLeft, twoTRight, df]);

  const handleSidePChange = (val: string, side: "left" | "right") => {
    setLastEdited("p");
    setTwoTailManual(true);
    if (side === "left") setPLeftText(val);
    else setPRightText(val);
    const parsed = parseFloat(val);
    if (!Number.isFinite(parsed)) return;
    const clamped = Math.min(Math.max(parsed, 0), 1);
    const otherParsed = parseFloat(side === "left" ? pRightText : pLeftText);
    const otherClamped = Number.isFinite(otherParsed) ? Math.min(Math.max(otherParsed, 0), 1) : 0;
    const leftProb = side === "left" ? clamped : otherClamped;
    const rightProb = side === "right" ? clamped : otherClamped;
    const safeLeft = Math.min(Math.max(leftProb, 1e-12), 1 - 1e-12);
    const safeRight = Math.min(Math.max(rightProb, 1e-12), 1 - 1e-12);
    const leftT = inv_t(safeLeft, df);
    const rightT = inv_t(1 - safeRight, df);
    setTwoTLeft(leftT);
    setTwoTRight(rightT);
    setTwoTLeftText(leftT.toFixed(4));
    setTwoTRightText(rightT.toFixed(4));
    const total = Math.min(Math.max(leftProb + rightProb, 0), 1);
    setPVal(total);
    setPText(total.toString());
    const mag = Math.max(Math.abs(leftT), Math.abs(rightT));
    setTVal(mag);
    setTText(mag.toString());
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
    const leftT = inv_t(safeLeft, df);
    const rightT = inv_t(1 - safeRight, df);
    setTwoTLeft(leftT);
    setTwoTRight(rightT);
    setTwoTLeftText(leftT.toFixed(4));
    setTwoTRightText(rightT.toFixed(4));
    const totalCenter = Math.max(0, 1 - (leftProb + rightProb));
    setPVal(totalCenter);
    setPText(totalCenter.toString());
    const mag = Math.max(Math.abs(leftT), Math.abs(rightT));
    setTVal(mag);
    setTText(mag.toString());
  };

  // separación de etiquetas para colas simétricas
  const isCenter = tail === "center";
  const pairDxTwo = Math.min(Math.abs(twoTLeft), Math.abs(twoTRight)) < 0.5 ? 18 : 0;
  const pairDx = tail === "two" ? pairDxTwo : Math.abs(tSync) < 0.5 ? 18 : 0;
  const pairDxCenter = isCenter && Math.abs(tSync) < 0.75 ? 64 : 0;
  const bottomDyCenter = isCenter && Math.abs(tSync) < 0.75 ? 20 : 14;

  // datos para gráfica
  const graph = useMemo(() => {
    const data: Array<{
      x: number;
      pdf: number;
      shade: number | null;
      shade2?: number | null;
    }> = [];

    const step = 0.02;
    const tAbs = Math.abs(tSync);
    const twoLeftBound = tail === "two" ? twoTLeft : tail === "center" ? twoTLeft : -tAbs;
    const twoRightBound = tail === "two" ? twoTRight : tail === "center" ? twoTRight : tAbs;

    let leftA = -5,
      leftB = -5,
      rightA = 5,
      rightB = 5,
      centerA = -tAbs,
      centerB = tAbs;

    if (tail === "left") {
      leftA = -5;
      leftB = tSync;
    } else if (tail === "right") {
      rightA = tSync;
      rightB = 5;
    } else if (tail === "two") {
      leftA = -5;
      leftB = twoLeftBound;
      rightA = twoRightBound;
      rightB = 5;
    } else {
      centerA = twoLeftBound;
      centerB = twoRightBound;
    }

    for (let x = -5; x <= 5 + 1e-9; x += step) {
      const y = pdf_t(x, df);
      let s: number | null = null,
        s2: number | null = null;
      if (tail === "left" || tail === "right") {
        const inL = x >= leftA && x <= leftB;
        const inR = x >= rightA && x <= rightB;
        s = inL || inR ? y : null;
      } else if (tail === "two") {
        const inL = x >= leftA && x <= leftB;
        const inR = x >= rightA && x <= rightB;
        s = inL ? y : null;
        s2 = inR ? y : null;
      } else {
        const inC = x >= centerA && x <= centerB;
        s = inC ? y : null;
      }

      data.push({
        x: Number(x.toFixed(3)),
        pdf: y,
        shade: s,
        shade2: s2 ?? null,
      });
    }

    return {
      data,
      markers:
        tail === "two" || tail === "center"
          ? [twoLeftBound, twoRightBound]
          : [tSync],
    };
  }, [tSync, tail, df, twoTLeft, twoTRight]);

  return (
    <div
      style={{
        display: "grid",
        gap: 16,
        maxWidth: 1100,
        margin: "0 auto",
      }}
    >
      {/* Info de distribución */}
      <div className="kpi" style={{ flexWrap: "wrap", gap: 8 }}>
        <span className="pill">
          Distribución t de Student
        </span>
        <span className="pill">
          μ = <b>0</b>
        </span>
        <span className="pill">
          Simétrica
        </span>
        <span className="pill">
          ν = df ={" "}
          <b>{df}</b>
        </span>
      </div>

      {/* Controles */}
      <div
        className="card"
        style={{
          display: "grid",
          gap: 16,
          padding: 16,
          borderRadius: 12,
        }}
      >
        {/* Selector cola */}
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(4, minmax(140px, 1fr))",
            gap: 12,
            alignItems: "stretch",
            justifyItems: "stretch",
          }}
        >
          {(
            [
              { key: "left", label: "Cola izquierda" },
              { key: "right", label: "Cola derecha" },
              { key: "two", label: "Dos colas" },
              { key: "center", label: "Centro" },
            ] as Array<{ key: Tail; label: string }>
          ).map((opt) => (
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
              {/* Icono mini de las colas (igual que en tu versión) */}
              <svg
                width="72"
                height="36"
                viewBox="0 0 72 36"
                aria-hidden="true"
              >
                <defs>
                  <path
                    id="underPath"
                    d="M2,28 C 22,4 50,4 70,28 L70,28 L2,28 Z"
                  />
                  <clipPath id="clipLeft">
                    <rect x="2" y="0" width="28" height="28" />
                  </clipPath>
                  <clipPath id="clipRight">
                    <rect x="42" y="0" width="28" height="28" />
                  </clipPath>
                  <clipPath id="clipCenter">
                    <rect x="28" y="0" width="16" height="28" />
                  </clipPath>
                </defs>

                {opt.key === "left" && (
                  <use
                    xlinkHref="#underPath"
                    fill="#22c55e"
                    opacity="0.45"
                    clipPath="url(#clipLeft)"
                  />
                )}
                {opt.key === "right" && (
                  <use
                    xlinkHref="#underPath"
                    fill="#22c55e"
                    opacity="0.45"
                    clipPath="url(#clipRight)"
                  />
                )}
                {opt.key === "two" && (
                  <>
                    <use
                      xlinkHref="#underPath"
                      fill="#22c55e"
                      opacity="0.45"
                      clipPath="url(#clipLeft)"
                    />
                    <use
                      xlinkHref="#underPath"
                      fill="#22c55e"
                      opacity="0.45"
                      clipPath="url(#clipRight)"
                    />
                  </>
                )}
                {opt.key === "center" && (
                  <use
                    xlinkHref="#underPath"
                    fill="#22c55e"
                    opacity="0.45"
                    clipPath="url(#clipCenter)"
                  />
                )}

                <line
                  x1="2"
                  y1="28"
                  x2="70"
                  y2="28"
                  stroke="var(--border)"
                  strokeWidth="1"
                />
                <path
                  d="M2,28 C 22,4 50,4 70,28"
                  fill="none"
                  stroke="#3b82f6"
                  strokeWidth="2"
                />
              </svg>
              <div
                style={{
                  fontWeight: tail === opt.key ? 700 : 600,
                  textAlign: "center",
                }}
              >
                {opt.label}
              </div>
            </label>
          ))}
        </div>

        {/* Inputs */}
        {tail === "two" ? (
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(5, minmax(140px, 1fr))",
              gap: 12,
            }}
          >
            <label>
              t₁ <span style={{ fontSize: 12, marginLeft: 6, opacity: 0.75 }}>(auto)</span>
              <input
                type="number"
                step="0.01"
                value={twoTLeftText}
                onChange={(e) => {
                  const val = e.target.value;
                  setTwoTLeftText(val);
                  const parsed = parseFloat(val);
                  if (Number.isFinite(parsed)) {
                    setLastEdited("t");
                    setTwoTailManual(true);
                    setTwoTLeft(parsed);
                    const leftProb = cdf_t(parsed, df);
                    const rightProb = 1 - cdf_t(twoTRight, df);
                    setPLeftText(leftProb.toFixed(4));
                    setPRightText(rightProb.toFixed(4));
                    const total = Math.min(Math.max(leftProb + rightProb, 0), 1);
                    setPVal(total);
                    setPText(total.toString());
                    const mag = Math.max(Math.abs(parsed), Math.abs(twoTRight));
                    setTVal(mag);
                    setTText(mag.toString());
                  }
                }}
              />
            </label>
            <label>
              t₂ <span style={{ fontSize: 12, marginLeft: 6, opacity: 0.75 }}>(auto)</span>
              <input
                type="number"
                step="0.01"
                value={twoTRightText}
                onChange={(e) => {
                  const val = e.target.value;
                  setTwoTRightText(val);
                  const parsed = parseFloat(val);
                  if (Number.isFinite(parsed)) {
                    setLastEdited("t");
                    setTwoTailManual(true);
                    setTwoTRight(parsed);
                    const leftProb = cdf_t(twoTLeft, df);
                    const rightProb = 1 - cdf_t(parsed, df);
                    setPLeftText(leftProb.toFixed(4));
                    setPRightText(rightProb.toFixed(4));
                    const total = Math.min(Math.max(leftProb + rightProb, 0), 1);
                    setPVal(total);
                    setPText(total.toString());
                    const mag = Math.max(Math.abs(twoTLeft), Math.abs(parsed));
                    setTVal(mag);
                    setTText(mag.toString());
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
            <label>
              df (ν &gt; 1)
              <input
                type="number"
                min={1}
                step="1"
                value={dfText}
                onChange={(e) => {
                  const val = e.target.value;
                  setLastEdited("df");
                  setDfText(val);
                  const parsed = parseFloat(val);
                  if (Number.isFinite(parsed) && parsed > 0) {
                    setDf(parsed);
                  }
                }}
              />
            </label>
          </div>
        ) : tail === "center" ? (
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(5, minmax(140px, 1fr))",
              gap: 12,
            }}
          >
            <label>
              t₁ <span style={{ fontSize: 12, marginLeft: 6, opacity: 0.75 }}>(auto)</span>
              <input
                type="number"
                step="0.01"
                value={twoTLeftText}
                onChange={(e) => {
                  const val = e.target.value;
                  setTwoTLeftText(val);
                  const parsed = parseFloat(val);
                  if (Number.isFinite(parsed)) {
                    setLastEdited("t");
                    setTwoTLeft(parsed);
                    const leftProb = cdf_t(parsed, df);
                    const rightProb = 1 - cdf_t(twoTRight, df);
                    setPCenterLeftText(leftProb.toFixed(4));
                    setPCenterRightText(rightProb.toFixed(4));
                    const totalCenter = Math.max(0, 1 - (leftProb + rightProb));
                    setPVal(totalCenter);
                    setPText(totalCenter.toString());
                    const mag = Math.max(Math.abs(parsed), Math.abs(twoTRight));
                    setTVal(mag);
                    setTText(mag.toString());
                  }
                }}
              />
            </label>
            <label>
              t₂ <span style={{ fontSize: 12, marginLeft: 6, opacity: 0.75 }}>(auto)</span>
              <input
                type="number"
                step="0.01"
                value={twoTRightText}
                onChange={(e) => {
                  const val = e.target.value;
                  setTwoTRightText(val);
                  const parsed = parseFloat(val);
                  if (Number.isFinite(parsed)) {
                    setLastEdited("t");
                    setTwoTRight(parsed);
                    const leftProb = cdf_t(twoTLeft, df);
                    const rightProb = 1 - cdf_t(parsed, df);
                    setPCenterLeftText(leftProb.toFixed(4));
                    setPCenterRightText(rightProb.toFixed(4));
                    const totalCenter = Math.max(0, 1 - (leftProb + rightProb));
                    setPVal(totalCenter);
                    setPText(totalCenter.toString());
                    const mag = Math.max(Math.abs(twoTLeft), Math.abs(parsed));
                    setTVal(mag);
                    setTText(mag.toString());
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
            <label>
              df (ν &gt; 1)
              <input
                type="number"
                min={1}
                step="1"
                value={dfText}
                onChange={(e) => {
                  const val = e.target.value;
                  setLastEdited("df");
                  setDfText(val);
                  const parsed = parseFloat(val);
                  if (Number.isFinite(parsed) && parsed > 0) {
                    setDf(parsed);
                  }
                }}
              />
            </label>
          </div>
        ) : (
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(3, minmax(160px, 1fr))",
              gap: 12,
            }}
          >
            <label>
              t
              <input
                type="number"
                step="0.01"
                value={
                  lastEdited === "t"
                    ? tText
                    : Number.isFinite(tFromP)
                    ? tFromP.toFixed(4)
                    : ""
                }
                onChange={(e) => {
                  const val = e.target.value;
                  setLastEdited("t");
                  setTText(val);
                  const parsed = parseFloat(val);
                  if (Number.isFinite(parsed)) {
                    setTVal(parsed);
                  }
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
                value={lastEdited === "p" ? pText : pFromT.toFixed(4)}
                onChange={(e) => {
                  const val = e.target.value;
                  setLastEdited("p");
                  setPText(val);
                  const parsed = parseFloat(val);
                  if (Number.isFinite(parsed)) {
                    const clamped = Math.min(Math.max(parsed, 0), 1);
                    setPVal(clamped);
                  }
                }}
              />
            </label>

            <label>
              df (ν &gt; 1)
              <input
                type="number"
                min={1}
                step="1"
                value={dfText}
                onChange={(e) => {
                  const val = e.target.value;
                  setLastEdited("df");
                  setDfText(val);
                  const parsed = parseFloat(val);
                  if (Number.isFinite(parsed) && parsed > 0) {
                    setDf(parsed);
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
          <AreaChart
            data={graph.data}
            margin={{ top: 10, right: 20, bottom: 40, left: 0 }}
          >
            <defs>
              <linearGradient id="fillCurve" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopOpacity={0.6} />
                <stop offset="100%" stopOpacity={0.1} />
              </linearGradient>
              <linearGradient id="fillShade" x1="0" y1="0" x2="0" y2="1">
                <stop
                  offset="0%"
                  stopColor="#22c55e"
                  stopOpacity={0.9}
                />
                <stop
                  offset="100%"
                  stopColor="#22c55e"
                  stopOpacity={0.3}
                />
              </linearGradient>
            </defs>

            <CartesianGrid />
            <XAxis type="number" dataKey="x" domain={[-5, 5]} />
            <YAxis type="number" domain={[0, 0.45]} />

            {/* Línea en 0 */}
            <ReferenceLine x={0} strokeDasharray="3 3" />

            {/* Límites + etiquetas P bajo el eje */}
            {tail === "left" && (
              <>
                <ReferenceLine
                  x={tSync}
                  strokeDasharray="3 3"
                  stroke="red"
                  label={{
                    value: `P = ${pSync.toFixed(4)}`,
                    position: "bottom",
                    dy: 14,
                  }}
                />
                <ReferenceLine x={tSync} stroke="transparent">
                  <Label
                    value={`t = ${tSync.toFixed(3)}`}
                    position="insideTop"
                    dy={8}
                    fill="var(--text)"
                  />
                </ReferenceLine>
              </>
            )}

            {tail === "right" && (
              <>
                <ReferenceLine
                  x={tSync}
                  strokeDasharray="3 3"
                  stroke="red"
                  label={{
                    value: `P = ${pSync.toFixed(4)}`,
                    position: "bottom",
                    dy: 14,
                  }}
                />
                <ReferenceLine x={tSync} stroke="transparent">
                  <Label
                    value={`t = ${tSync.toFixed(3)}`}
                    position="insideTop"
                    dy={8}
                    fill="var(--text)"
                  />
                </ReferenceLine>
              </>
            )}

            {tail === "two" && (
              <>
                <ReferenceLine
                  x={twoTLeft}
                  strokeDasharray="3 3"
                  stroke="red"
                  label={{
                    value: `P₁ = ${twoLeftProb.toFixed(4)}`,
                    position: "bottom",
                    dy: 14,
                    dx: -pairDx,
                  }}
                />
                <ReferenceLine x={twoTLeft} stroke="transparent">
                  <Label
                    value={`t₁ = ${twoTLeft.toFixed(3)}`}
                    position="insideTop"
                    dy={8}
                    dx={-pairDx}
                    fill="var(--text)"
                  />
                </ReferenceLine>

                <ReferenceLine
                  x={twoTRight}
                  strokeDasharray="3 3"
                  stroke="red"
                  label={{
                    value: `P₂ = ${twoRightProb.toFixed(4)}`,
                    position: "bottom",
                    dy: 14,
                    dx: pairDx,
                  }}
                />
                <ReferenceLine x={twoTRight} stroke="transparent">
                  <Label
                    value={`t₂ = ${twoTRight.toFixed(3)}`}
                    position="insideTop"
                    dy={8}
                    dx={pairDx}
                    fill="var(--text)"
                  />
                </ReferenceLine>
              </>
            )}

            {tail === "center" && (
              <>
                <ReferenceLine
                  x={twoTLeft}
                  strokeDasharray="3 3"
                  stroke="red"
                  label={{
                    value: `P₁ = ${centerLeftProb.toFixed(4)}`,
                    position: "bottom",
                    dy: bottomDyCenter,
                    dx: -pairDxCenter,
                  }}
                />
                <ReferenceLine x={twoTLeft} stroke="transparent">
                  <Label
                    value={`t₁ = ${twoTLeft.toFixed(3)}`}
                    position="insideTop"
                    dy={8}
                    dx={-pairDxCenter}
                    fill="var(--text)"
                  />
                </ReferenceLine>

                <ReferenceLine
                  x={twoTRight}
                  strokeDasharray="3 3"
                  stroke="red"
                  label={{
                    value: `P₂ = ${centerRightProb.toFixed(4)}`,
                    position: "bottom",
                    dy: bottomDyCenter,
                    dx: pairDxCenter,
                  }}
                />
                <ReferenceLine x={twoTRight} stroke="transparent">
                  <Label
                    value={`t₂ = ${twoTRight.toFixed(3)}`}
                    position="insideTop"
                    dy={8}
                    dx={pairDxCenter}
                    fill="var(--text)"
                  />
                </ReferenceLine>
              </>
            )}

            {/* Sombreado y curva */}
            <Area
              dataKey="shade"
              type="monotone"
              baseLine={0}
              fill="url(#fillShade)"
              stroke="none"
            />
            <Area
              dataKey="shade2"
              type="monotone"
              baseLine={0}
              fill="url(#fillShade)"
              stroke="none"
            />
            <Area
              dataKey="pdf"
              type="monotone"
              baseLine={0}
              fill="url(#fillCurve)"
              stroke="#2563eb"
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>

      {/* Pie info */}
      <div className="meta" style={{ textAlign: "center" }}>
        f<sub>t</sub>(t; ν) = Γ((ν+1)/2) / [ √(νπ) · Γ(ν/2 ) ] · (1+t²/ν)<sup>−(ν+1)/2</sup>,
        &nbsp; F<sub>t</sub>(t; ν) = P(T ≤ t)
      </div>
    </div>
  );
}
