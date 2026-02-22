import { useEffect, useMemo, useState } from "react";
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

type Tail = "left" | "right" | "two" | "center";

const pdfExp = (x: number, lambda: number) =>
  x < 0 ? 0 : lambda * Math.exp(-lambda * x);
const cdfExp = (x: number, lambda: number) =>
  x < 0 ? 0 : 1 - Math.exp(-lambda * x);
const invExp = (p: number, lambda: number) => {
  const safe = Math.min(Math.max(p, 1e-12), 1 - 1e-12);
  return -Math.log(1 - safe) / lambda;
};

export default function DistribucionExponencial() {
  const [lambda, setLambda] = useState(1);
  const [tail, setTail] = useState<Tail>("right");

  const [xValue, setXValue] = useState(1);
  const [pValue, setPValue] = useState(cdfExp(1, 1));
  const [xText, setXText] = useState("1");
  const [pText, setPText] = useState(cdfExp(1, 1).toFixed(4));
  const [lastEdited, setLastEdited] = useState<"x" | "p">("x");

  const clampProb = (p: number) => Math.min(Math.max(p, 1e-6), 1 - 1e-6);

  // === Dos colas: P izquierda y P derecha ===
  const initialHalf = Math.min(Math.max(cdfExp(1, 1) / 2, 1e-6), 0.5 - 1e-6);
  const [twoLeftProb, setTwoLeftProb] = useState(initialHalf);
  const [twoRightProb, setTwoRightProb] = useState(initialHalf);
  const [twoLeftProbText, setTwoLeftProbText] = useState(
    initialHalf.toFixed(4)
  );
  const [twoRightProbText, setTwoRightProbText] = useState(
    initialHalf.toFixed(4)
  );

  const twoXLower = useMemo(
    () => invExp(clampProb(twoLeftProb), lambda),
    [twoLeftProb, lambda]
  );
  const twoXUpper = useMemo(
    () => invExp(clampProb(1 - twoRightProb), lambda),
    [twoRightProb, lambda]
  );

  // === Centro: x1, x2 y P1, P2 ===
  const [centerX1, setCenterX1] = useState(0.5);
  const [centerX2, setCenterX2] = useState(1.5);
  const [centerX1Text, setCenterX1Text] = useState("0.5");
  const [centerX2Text, setCenterX2Text] = useState("1.5");
  const [centerP1, setCenterP1] = useState(cdfExp(0.5, 1));
  const [centerP2, setCenterP2] = useState(cdfExp(1.5, 1));
  const [centerP1Text, setCenterP1Text] = useState(cdfExp(0.5, 1).toFixed(4));
  const [centerP2Text, setCenterP2Text] = useState(cdfExp(1.5, 1).toFixed(4));

  const pFromX = useMemo(() => {
    const cdf = cdfExp(xValue, lambda);
    if (tail === "left") return cdf;
    if (tail === "right") return 1 - cdf;
    if (tail === "two") return Math.min(1, twoLeftProb + twoRightProb);
    if (tail === "center") {
      const lower = Math.max(centerX1, 0);
      const upper = Math.max(centerX2, 0);
      return Math.max(0, cdfExp(upper, lambda) - cdfExp(lower, lambda));
    }
    return 0;
  }, [xValue, lambda, tail, twoLeftProb, twoRightProb, centerX1, centerX2]);

  const xFromP = useMemo(() => {
    const prob = clampProb(pValue);
    if (tail === "left") return invExp(prob, lambda);
    if (tail === "right") return invExp(1 - prob, lambda);
    if (tail === "two") return invExp(prob / 2, lambda);
    if (tail === "center") {
      const half = prob / 2;
      return Math.max(0, invExp(half, lambda));
    }
    return xValue;
  }, [pValue, lambda, tail, xValue]);

  const twoTailBounds =
    tail === "two"
      ? {
          lower: twoXLower,
          upper: twoXUpper,
        }
      : null;

  const centerProb = Math.max(
    0,
    cdfExp(Math.max(centerX2, 0), lambda) - cdfExp(Math.max(centerX1, 0), lambda)
  );

  const xSync =
    tail === "two"
      ? twoXUpper
      : tail === "center"
      ? centerX2
      : lastEdited === "p"
      ? xFromP
      : xValue;
  const pSync =
    tail === "two"
      ? Math.min(Math.max(twoLeftProb + twoRightProb, 0), 1)
      : tail === "center"
      ? centerProb
      : lastEdited === "x"
      ? pFromX
      : pValue;

  const totalProbClamped = Math.min(Math.max(pSync, 0), 1);
  const twoTotalProb = Math.min(Math.max(twoLeftProb + twoRightProb, 0), 1);

  // Recalcular P1 / P2 y sus textos solo cuando cambia lambda
  useEffect(() => {
    const prob1 = clampProb(cdfExp(Math.max(centerX1, 0), lambda));
    const prob2 = clampProb(cdfExp(Math.max(centerX2, 0), lambda));
    setCenterP1(prob1);
    setCenterP2(prob2);
    setCenterP1Text(prob1.toFixed(4));
    setCenterP2Text(prob2.toFixed(4));
  }, [lambda, centerX1, centerX2]);

  const baseInputStyle = {
    width: "100%",
    padding: "11px 12px",
    borderRadius: 12,
    border: "1px solid #d8e1f3",
    background: "#fff",
    fontWeight: 600,
  } as const;

  const pillStyle = {
    padding: "8px 12px",
    borderRadius: 12,
    background: "#e8edf7",
    fontWeight: 600,
    display: "inline-flex",
    alignItems: "center",
    gap: 6,
    boxShadow: "inset 0 1px 0 rgba(255,255,255,0.6)",
  } as const;

  const graph = useMemo(() => {
    const dominantX =
      tail === "two" && twoTailBounds
        ? twoTailBounds.upper
        : tail === "center"
        ? Math.max(centerX2, centerX1)
        : xSync;

    const xMax = Math.max(6 / lambda, dominantX * 1.5, 10);
    const data: Array<{
      x: number;
      pdf: number;
      shade: number | null;
      shade2?: number | null;
    }> = [];
    const step = xMax / 300;

    let leftBound = 0;
    let rightBound = xSync;
    let centerLeft = 0;
    let centerRight = 0;

    if (tail === "right") {
      leftBound = xSync;
      rightBound = xMax;
    } else if (tail === "two" && twoTailBounds) {
      leftBound = twoTailBounds.lower;
      rightBound = twoTailBounds.upper;
    } else if (tail === "center") {
      centerLeft = Math.max(0, centerX1);
      centerRight = Math.max(centerX2, centerLeft);
    }

    for (let x = 0; x <= xMax; x += step) {
      const y = pdfExp(x, lambda);
      let shade: number | null = null;
      let shade2: number | null = null;
      if (tail === "left") {
        if (x <= xSync) shade = y;
      } else if (tail === "right") {
        if (x >= leftBound) shade = y;
      } else if (tail === "two" && twoTailBounds) {
        if (x <= twoTailBounds.lower) shade = y;
        if (x >= twoTailBounds.upper) shade2 = y;
      } else if (tail === "center") {
        if (x >= centerLeft && x <= centerRight) shade = y;
      }
      data.push({ x, pdf: y, shade, shade2 });
    }
    return { data, xMax };
  }, [xSync, lambda, tail, twoTailBounds, centerX1, centerX2]);

  const formatVal = (val: number) =>
    Number.isFinite(val) ? val.toFixed(4) : "";

  return (
    <div
      className="card"
      style={{
        marginTop: 16,
        padding: 18,
        borderRadius: 18,
        border: "1px solid #e2e8f0",
        background: "linear-gradient(180deg, #f8fafc 0%, #f1f5f9 100%)",
        boxShadow: "0 12px 30px rgba(15,23,42,0.08)",
      }}
    >
      <h3 style={{ marginTop: 0, marginBottom: 10 }}>
        Distribucion exponencial
      </h3>

      <div
        style={{
          display: "flex",
          gap: 10,
          flexWrap: "wrap",
          alignItems: "center",
        }}
      >
        <span style={pillStyle}>
          lambda = <b>{lambda}</b>
        </span>
        <span style={pillStyle}>
          media = <b>{(1 / lambda).toFixed(2)}</b>
        </span>
        <span style={pillStyle}>
          P ={" "}
          <b>
            {(tail === "two" ? twoTotalProb : totalProbClamped).toFixed(4)}
          </b>
        </span>
      </div>

      <div
        className="card"
        style={{
          display: "grid",
          gap: 16,
          padding: 16,
          borderRadius: 14,
          marginTop: 14,
          background: "#ffffff",
          border: "1px solid #e5e7eb",
          boxShadow: "0 10px 25px rgba(15,23,42,0.05)",
        }}
      >
        {/* Botones de cola */}
{/* Botones de cola */}
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(4, minmax(120px, 1fr))",
            gap: 12,
          }}
        >
          {(
            [
              { key: "left", label: "Cola izquierda" },
              { key: "right", label: "Cola derecha" },
              { key: "two", label: "Dos colas" },
              { key: "center", label: "Centro" },
            ] as { key: Tail; label: string }[]
          ).map((opt) => (
            <label
              key={opt.key}
              style={{
                cursor: "pointer",
                border: "1px solid #d8e1f3",
                borderRadius: 14,
                padding: "20px 12px",
                display: "grid",
                gap: 12,
                justifyItems: "center",
                alignContent: "center",
                background: tail === opt.key ? "#1a2353" : "transparent",
                color: tail === opt.key ? "#ffffff" : "inherit",
                boxShadow:
                  tail === opt.key
                    ? "0 10px 25px rgba(37,99,235,0.35)"
                    : "0 4px 12px rgba(15,23,42,0.04)",
                minHeight: "100px",
              }}
            >
              <input
                type="radio"
                name="tailExp"
                checked={tail === opt.key}
                onChange={() => {
                  setTail(opt.key);
                  setLastEdited("x");
                }}
                style={{ display: "none" }}
              />
              <svg width="72" height="40" viewBox="0 0 72 40" aria-hidden="true">
                <defs>
                  <path
                    id={`exp-under-${opt.key}`}
                    d="M2,32 Q10,6 20,12 Q30,18 40,22 Q50,24 70,26 L70,32 L2,32 Z"
                  />
                  <clipPath id={`exp-left-${opt.key}`}>
                    <rect x="2" y="0" width="24" height="32" />
                  </clipPath>
                  <clipPath id={`exp-right-${opt.key}`}>
                    <rect x="46" y="0" width="24" height="32" />
                  </clipPath>
                  <clipPath id={`exp-center-${opt.key}`}>
                    <rect x="28" y="0" width="20" height="32" />
                  </clipPath>
                </defs>
                {opt.key === "left" && (
                  <use
                    xlinkHref={`#exp-under-${opt.key}`}
                    fill="#22c55e"
                    opacity="0.45"
                    clipPath={`url(#exp-left-${opt.key})`}
                  />
                )}
                {opt.key === "right" && (
                  <use
                    xlinkHref={`#exp-under-${opt.key}`}
                    fill="#22c55e"
                    opacity="0.45"
                    clipPath={`url(#exp-right-${opt.key})`}
                  />
                )}
                {opt.key === "two" && (
                  <>
                    <use
                      xlinkHref={`#exp-under-${opt.key}`}
                      fill="#22c55e"
                      opacity="0.45"
                      clipPath={`url(#exp-left-${opt.key})`}
                    />
                    <use
                      xlinkHref={`#exp-under-${opt.key}`}
                      fill="#22c55e"
                      opacity="0.45"
                      clipPath={`url(#exp-right-${opt.key})`}
                    />
                  </>
                )}
                {opt.key === "center" && (
                  <use
                    xlinkHref={`#exp-under-${opt.key}`}
                    fill="#22c55e"
                    opacity="0.45"
                    clipPath={`url(#exp-center-${opt.key})`}
                  />
                )}
                <line
                  x1="2"
                  y1="32"
                  x2="70"
                  y2="32"
                  stroke="#d8e1f3"
                  strokeWidth="1"
                />
                <path
                  d="M2,32 Q10,6 20,12 Q30,18 40,22 Q50,24 70,26"
                  fill="none"
                  stroke="#3b82f6"
                  strokeWidth="2"
                />
              </svg>
              <div style={{ fontWeight: tail === opt.key ? 700 : 600, fontSize: "14px" }}>
                {opt.label}
              </div>
            </label>
          ))}
        </div>

        {/* === Controles para DOS COLAS === */}
        {tail === "two" && (
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(4, minmax(160px, 1fr))",
              gap: 10,
            }}
          >
            <label style={{ display: "grid", gap: 6 }}>
              x1 <span style={{ fontSize: 12, opacity: 0.75 }}></span>
              <input
                type="number"
                readOnly
                style={baseInputStyle}
                value={formatVal(twoXLower)}
              />
            </label>
            <label style={{ display: "grid", gap: 6 }}>
              x2 <span style={{ fontSize: 12, opacity: 0.75 }}></span>
              <input
                type="number"
                readOnly
                style={baseInputStyle}
                value={formatVal(twoXUpper)}
              />
            </label>
            <label style={{ display: "grid", gap: 6 }}>
              P izquierda (0-1)
              <input
                type="number"
                min={0}
                max={1}
                step="0.0001"
                style={baseInputStyle}
                value={twoLeftProbText}
                onChange={(e) => {
                  const val = e.target.value;
                  setTwoLeftProbText(val);
                  if (val.trim() === "") return;
                  const parsed = parseFloat(val);
                  if (Number.isFinite(parsed)) {
                    setTwoLeftProb(clampProb(parsed));
                  }
                }}
              />
            </label>
            <label style={{ display: "grid", gap: 6 }}>
              P derecha (0-1)
              <input
                type="number"
                min={0}
                max={1}
                step="0.0001"
                style={baseInputStyle}
                value={twoRightProbText}
                onChange={(e) => {
                  const val = e.target.value;
                  setTwoRightProbText(val);
                  if (val.trim() === "") return;
                  const parsed = parseFloat(val);
                  if (Number.isFinite(parsed)) {
                    setTwoRightProb(clampProb(parsed));
                  }
                }}
              />
            </label>
          </div>
        )}

        {/* === Controles para CENTRO === */}
        {tail === "center" && (
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(4, minmax(160px, 1fr))",
              gap: 10,
            }}
          >
            <label style={{ display: "grid", gap: 6 }}>
              x1
              <input
                type="number"
                min={0}
                step="0.0001"
                style={baseInputStyle}
                value={centerX1Text}
                onChange={(e) => {
                  const val = e.target.value;
                  setCenterX1Text(val);
                  if (val.trim() === "") return;
                  const parsed = parseFloat(val);
                  if (Number.isFinite(parsed) && parsed >= 0) {
                    const xVal = parsed;
                    const prob = clampProb(cdfExp(xVal, lambda));
                    setCenterX1(xVal);
                    setCenterP1(prob);
                    setCenterP1Text(prob.toFixed(4));
                  }
                }}
              />
            </label>
            <label style={{ display: "grid", gap: 6 }}>
              x2
              <input
                type="number"
                min={0}
                step="0.0001"
                style={baseInputStyle}
                value={centerX2Text}
                onChange={(e) => {
                  const val = e.target.value;
                  setCenterX2Text(val);
                  if (val.trim() === "") return;
                  const parsed = parseFloat(val);
                  if (Number.isFinite(parsed) && parsed >= 0) {
                    const xVal = parsed;
                    const prob = clampProb(cdfExp(xVal, lambda));
                    setCenterX2(xVal);
                    setCenterP2(prob);
                    setCenterP2Text(prob.toFixed(4));
                  }
                }}
              />
            </label>
            <label style={{ display: "grid", gap: 6 }}>
              P1 (0-1)
              <input
                type="number"
                min={0}
                max={1}
                step="0.0001"
                style={baseInputStyle}
                value={centerP1Text}
                onChange={(e) => {
                  const val = e.target.value;
                  setCenterP1Text(val);
                  if (val.trim() === "") return;
                  const parsed = parseFloat(val);
                  if (Number.isFinite(parsed) && parsed >= 0 && parsed <= 1) {
                    const safe = clampProb(parsed);
                    setCenterP1(safe);
                    const xVal = invExp(safe, lambda);
                    setCenterX1(xVal);
                    setCenterX1Text(xVal.toFixed(4));
                  }
                }}
              />
            </label>
            <label style={{ display: "grid", gap: 6 }}>
              P2 (0-1)
              <input
                type="number"
                min={0}
                max={1}
                step="0.0001"
                style={baseInputStyle}
                value={centerP2Text}
                onChange={(e) => {
                  const val = e.target.value;
                  setCenterP2Text(val);
                  if (val.trim() === "") return;
                  const parsed = parseFloat(val);
                  if (Number.isFinite(parsed) && parsed >= 0 && parsed <= 1) {
                    const safe = clampProb(parsed);
                    setCenterP2(safe);
                    const xVal = invExp(safe, lambda);
                    setCenterX2(xVal);
                    setCenterX2Text(xVal.toFixed(4));
                  }
                }}
              />
            </label>
          </div>
        )}

        {/* === Controles para COLA IZQ / DER === */}
        {tail !== "two" && tail !== "center" && (
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(2, minmax(220px, 1fr))",
              gap: 12,
            }}
          >
            <label style={{ display: "grid", gap: 6 }}>
              x
              <input
                type="number"
                min={0}
                step="0.001"
                style={baseInputStyle}
                value={lastEdited === "x" ? xText : formatVal(xFromP)}
                onChange={(e) => {
                  const val = e.target.value;
                  setLastEdited("x");
                  setXText(val);
                  if (val.trim() === "") return;
                  const parsed = parseFloat(val);
                  if (Number.isFinite(parsed) && parsed >= 0) {
                    setXValue(parsed);
                  }
                }}
              />
            </label>
            <label style={{ display: "grid", gap: 6 }}>
              P (0-1)
              <input
                type="number"
                min={0}
                max={1}
                step="0.0001"
                style={baseInputStyle}
                value={lastEdited === "p" ? pText : formatVal(pFromX)}
                onChange={(e) => {
                  const val = e.target.value;
                  setLastEdited("p");
                  setPText(val);
                  if (val.trim() === "") return;
                  const parsed = parseFloat(val);
                  if (Number.isFinite(parsed)) {
                    setPValue(Math.min(Math.max(parsed, 0), 1));
                  }
                }}
              />
            </label>
          </div>
        )}

        <label style={{ display: "grid", gap: 6 }}>
          lambda (rate)
          <input
            type="number"
            min={0.001}
            step="0.1"
            style={baseInputStyle}
            value={lambda}
            onChange={(e) => {
              const val = parseFloat(e.target.value);
              if (Number.isFinite(val) && val > 0)
                setLambda(Math.min(val, 10));
            }}
          />
        </label>
      </div>

      <div style={{ height: 360, marginTop: 20 }}>
        <ResponsiveContainer>
          <AreaChart
            data={graph.data}
            margin={{ left: 0, right: 0, top: 10, bottom: 0 }}
          >
            <defs>
              <linearGradient id="expShade" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#22c55e" stopOpacity={0.8} />
                <stop offset="100%" stopColor="#22c55e" stopOpacity={0.1} />
              </linearGradient>
              <linearGradient id="expCurve" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#2563eb" stopOpacity={0.9} />
                <stop offset="100%" stopColor="#60a5fa" stopOpacity={0.4} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="4 4" />
            <XAxis type="number" domain={[0, graph.xMax]} dataKey="x" />
            <YAxis />
            <Tooltip
              formatter={(val: number | null, key: string): [string, string] => {
                if (key === "pdf" && typeof val === "number") {
                  return [`${val.toFixed(4)}`, "f(x)"];
                }
                const safe =
                  typeof val === "number" ? val.toFixed(4) : "0.0000";
                return [safe, "Area"];
              }}
            />
            <Area
              type="monotone"
              dataKey="shade"
              stroke="none"
              fill="url(#expShade)"
              baseLine={0}
            />
            <Area
              type="monotone"
              dataKey="shade2"
              stroke="none"
              fill="url(#expShade)"
              baseLine={0}
            />
            <Area
              type="monotone"
              dataKey="pdf"
              stroke="#2563eb"
              fill="url(#expCurve)"
              baseLine={0}
            />

            {/* Líneas para colas simples */}
            {(tail === "left" || tail === "right") && (
              <>
                <ReferenceLine x={xSync} stroke="red" strokeDasharray="3 3">
                  <Label
                    value={`x = ${xSync.toFixed(3)}`}
                    position="insideTop"
                    fill="var(--text)"
                  />
                </ReferenceLine>
                <ReferenceLine x={xSync} stroke="transparent">
                  <Label
                    value={`P = ${formatVal(pSync)}`}
                    position="bottom"
                    dy={12}
                    fill="red"
                  />
                </ReferenceLine>
              </>
            )}

            {/* Líneas para dos colas */}
            {tail === "two" && twoTailBounds && (
              <>
                <ReferenceLine
                  x={twoTailBounds.lower}
                  stroke="red"
                  strokeDasharray="3 3"
                >
                  <Label
                    value={`x1 = ${twoTailBounds.lower.toFixed(3)}`}
                    position="insideTop"
                    fill="var(--text)"
                  />
                </ReferenceLine>
                <ReferenceLine x={twoTailBounds.lower} stroke="transparent">
                  <Label
                    value={`P1 = ${formatVal(twoLeftProb)}`}
                    position="bottom"
                    dy={12}
                    fill="red"
                  />
                </ReferenceLine>
                <ReferenceLine
                  x={twoTailBounds.upper}
                  stroke="red"
                  strokeDasharray="3 3"
                >
                  <Label
                    value={`x2 = ${twoTailBounds.upper.toFixed(3)}`}
                    position="insideTop"
                    fill="var(--text)"
                  />
                </ReferenceLine>
                <ReferenceLine x={twoTailBounds.upper} stroke="transparent">
                  <Label
                    value={`P2 = ${formatVal(twoRightProb)}`}
                    position="bottom"
                    dy={12}
                    fill="red"
                  />
                </ReferenceLine>
              </>
            )}

            {/* Líneas para centro */}
            {tail === "center" && (
              <>
                <ReferenceLine
                  x={centerX1}
                  stroke="red"
                  strokeDasharray="3 3"
                >
                  <Label
                    value={`x1 = ${centerX1.toFixed(3)}`}
                    position="insideTop"
                    fill="var(--text)"
                  />
                </ReferenceLine>
                <ReferenceLine x={centerX1} stroke="transparent">
                  <Label
                    value={`P1 = ${formatVal(centerP1)}`}
                    position="bottom"
                    dy={12}
                    fill="red"
                  />
                </ReferenceLine>
                <ReferenceLine
                  x={centerX2}
                  stroke="red"
                  strokeDasharray="3 3"
                >
                  <Label
                    value={`x2 = ${centerX2.toFixed(3)}`}
                    position="insideTop"
                    fill="var(--text)"
                  />
                </ReferenceLine>
                <ReferenceLine x={centerX2} stroke="transparent">
                  <Label
                    value={`P2 = ${formatVal(centerP2)}`}
                    position="bottom"
                    dy={12}
                    fill="red"
                  />
                </ReferenceLine>
              </>
            )}
          </AreaChart>
        </ResponsiveContainer>
      </div>

      <div className="meta" style={{ textAlign: "center", fontSize: 14 }}>
        {
          "f(x; lambda) = lambda e^{-lambda x}, x >= 0  |  F(x; lambda) = 1 - e^{-lambda x}"
        }
      </div>
    </div>
  );
}
