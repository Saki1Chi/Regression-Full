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

type Tail = "left" | "right" | "two" | "center";

function gammaLn(z: number): number {
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
    return Math.log(Math.PI) - Math.log(Math.sin(Math.PI * z)) - gammaLn(1 - z);
  }
  z -= 1;
  let x = 0.99999999999980993;
  for (let i = 0; i < p.length; i++) x += p[i] / (z + i + 1);
  const t = z + g + 0.5;
  return (
    0.5 * Math.log(2 * Math.PI) +
    (z + 0.5) * Math.log(t) -
    t +
    Math.log(x)
  );
}

function regularizedGammaP(a: number, x: number) {
  const ITMAX = 120;
  const EPS = 1e-12;
  const FPMIN = 1e-30;
  if (x <= 0) return 0;
  if (x < a + 1) {
    let sum = 1 / a;
    let del = sum;
    for (let n = 1; n <= ITMAX; n++) {
      del *= x / (a + n);
      sum += del;
      if (Math.abs(del) < Math.abs(sum) * EPS) break;
    }
    return sum * Math.exp(-x + a * Math.log(x) - gammaLn(a));
  }
  let b = x + 1 - a;
  let c = 1 / FPMIN;
  let d = 1 / b;
  let h = d;
  for (let i = 1; i <= ITMAX; i++) {
    const an = -i * (i - a);
    b += 2;
    d = an * d + b;
    if (Math.abs(d) < FPMIN) d = FPMIN;
    c = b + an / c;
    if (Math.abs(c) < FPMIN) c = FPMIN;
    d = 1 / d;
    const del = d * c;
    h *= del;
    if (Math.abs(del - 1) < EPS) break;
  }
  return 1 - Math.exp(-x + a * Math.log(x) - gammaLn(a)) * h;
}

function pdfChi(x: number, df: number) {
  if (x <= 0) return 0;
  const k = df / 2;
  return Math.exp((k - 1) * Math.log(x) - x / 2 - k * Math.log(2) - gammaLn(k));
}

function cdfChi(x: number, df: number) {
  if (x <= 0) return 0;
  return regularizedGammaP(df / 2, x / 2);
}

function invChi(p: number, df: number) {
  const target = Math.min(Math.max(p, 1e-12), 1 - 1e-12);
  let lo = 1e-8;
  let hi = Math.max(df, 1);
  while (cdfChi(hi, df) < target) hi *= 2;
  for (let i = 0; i < 80; i++) {
    const mid = (lo + hi) / 2;
    const cmid = cdfChi(mid, df);
    if (cmid < target) lo = mid;
    else hi = mid;
  }
  return (lo + hi) / 2;
}

const DEFAULT_DF = 6;
const DEFAULT_LOWER = invChi(0.025, DEFAULT_DF);
const DEFAULT_UPPER = invChi(0.975, DEFAULT_DF);

export default function DistribucionChi2() {
  const [df, setDf] = useState(DEFAULT_DF);
  const [tail, setTail] = useState<Tail>("left");

  const [chiValue, setChiValue] = useState(4);
  const [pValue, setPValue] = useState(0.5);
  const [chiText, setChiText] = useState("4");
  const [pText, setPText] = useState("0.5");
  const [pLeftText, setPLeftText] = useState("0.2500");
  const [pRightText, setPRightText] = useState("0.2500");
  const [pCenterLeftText, setPCenterLeftText] = useState("0.2500");
  const [pCenterRightText, setPCenterRightText] = useState("0.2500");
  const [lastEdited, setLastEdited] = useState<"chi" | "p">("chi");

  const [twoChiLower, setTwoChiLower] = useState(DEFAULT_LOWER);
  const [twoChiUpper, setTwoChiUpper] = useState(DEFAULT_UPPER);
  const [twoChiLowerText, setTwoChiLowerText] = useState(DEFAULT_LOWER.toFixed(4));
  const [twoChiUpperText, setTwoChiUpperText] = useState(DEFAULT_UPPER.toFixed(4));
  const [twoTailManual, setTwoTailManual] = useState(false);

  const prevTailRef = useRef<Tail>(tail);

  const EPS = 1e-6;
  const clampProb = (v: number) => Math.min(Math.max(v, EPS), 1 - EPS);
  const clampHalfProb = (v: number) => Math.min(Math.max(v, EPS), 0.5 - EPS);

  const twoTailProbabilities = useMemo(() => {
    if (tail !== "two") return { left: 0, right: 0 };
    const lowerProb = cdfChi(Math.max(twoChiLower, EPS), df);
    const upperProb = Math.max(0, 1 - cdfChi(Math.max(twoChiUpper, EPS), df));
    return { left: lowerProb, right: upperProb };
  }, [tail, twoChiLower, twoChiUpper, df]);
  const twoLeftProb = twoTailProbabilities.left;
  const twoRightProb = twoTailProbabilities.right;

  const centerTailProbabilities = useMemo(() => {
    if (tail !== "center") return { left: 0, right: 0 };
    const lowerProb = cdfChi(Math.max(twoChiLower, EPS), df);
    const upperProb = Math.max(0, 1 - cdfChi(Math.max(twoChiUpper, EPS), df));
    return { left: lowerProb, right: upperProb };
  }, [tail, twoChiLower, twoChiUpper, df]);
  const centerLeftProb = centerTailProbabilities.left;
  const centerRightProb = centerTailProbabilities.right;

  const pFromChi = useMemo(() => {
    const cdf = cdfChi(chiValue, df);
    if (tail === "left") return cdf;
    if (tail === "right") return Math.max(0, 1 - cdf);
    if (tail === "two") return Math.min(1, twoLeftProb + twoRightProb);
    // center
    return Math.max(0, 1 - (centerLeftProb + centerRightProb));
  }, [chiValue, df, tail, twoLeftProb, twoRightProb, centerLeftProb, centerRightProb]);

  const chiFromP = useMemo(() => {
    const prob = clampProb(pValue);
    if (tail === "left") return invChi(prob, df);
    if (tail === "right") return invChi(1 - prob, df);
    return invChi(1 - prob / 2, df);
  }, [pValue, df, tail]);

  const chiSync = lastEdited === "p" ? chiFromP : chiValue;
  const pSync = lastEdited === "chi" ? pFromChi : pValue;

  const updateTwoTailFromProb = (prob: number) => {
    const bounded = clampProb(prob);
    const half = clampHalfProb(bounded / 2);
    const newLower = invChi(half, df);
    const newUpper = invChi(1 - half, df);
    setTwoChiLower(newLower);
    setTwoChiUpper(newUpper);
    setTwoChiLowerText(newLower.toFixed(4));
    setTwoChiUpperText(newUpper.toFixed(4));
    setChiValue(newUpper);
    setChiText(newUpper.toString());
  };

  const updateTwoTailFromUpper = (upperVal: number) => {
    const safeUpper = Math.max(upperVal, EPS);
    const tailProbRaw = Math.max(0, 1 - cdfChi(safeUpper, df));
    const half = clampHalfProb(tailProbRaw);
    const newLower = invChi(half, df);
    setTwoChiUpper(safeUpper);
    setTwoChiLower(newLower);
    setTwoChiUpperText(safeUpper.toFixed(4));
    setTwoChiLowerText(newLower.toFixed(4));
    setChiValue(safeUpper);
    setChiText(safeUpper.toString());
    setPLeftText(half.toFixed(4));
    setPRightText(tailProbRaw.toFixed(4));
    const total = Math.min(Math.max(half + tailProbRaw, 0), 1);
    setPValue(total);
    setPText(total.toString());
    setPCenterLeftText(half.toFixed(4));
    setPCenterRightText(tailProbRaw.toFixed(4));
  };

  useEffect(() => {
    if (tail === "two" && prevTailRef.current !== "two") {
      updateTwoTailFromUpper(Math.max(chiSync, EPS));
      setTwoTailManual(false);
      const leftProb = cdfChi(Math.max(twoChiLower, EPS), df);
      const rightProb = Math.max(0, 1 - cdfChi(Math.max(twoChiUpper, EPS), df));
      setPLeftText(leftProb.toFixed(4));
      setPRightText(rightProb.toFixed(4));
    }
    prevTailRef.current = tail;
  }, [tail, chiSync, df, twoChiLower, twoChiUpper]);

  useEffect(() => {
    if (tail !== "two" || lastEdited !== "p" || twoTailManual) return;
    updateTwoTailFromProb(pSync);
    setTwoTailManual(false);
    const leftProb = cdfChi(Math.max(twoChiLower, EPS), df);
    const rightProb = Math.max(0, 1 - cdfChi(Math.max(twoChiUpper, EPS), df));
    setPLeftText(leftProb.toFixed(4));
    setPRightText(rightProb.toFixed(4));
  }, [tail, lastEdited, pSync, df, twoChiLower, twoChiUpper, twoTailManual]);

  useEffect(() => {
    if (tail !== "two" || twoTailManual) return;
    updateTwoTailFromUpper(twoChiUpper);
  }, [tail, df, twoTailManual, twoChiUpper]);

  const handleTwoSidePChange = (val: string, side: "left" | "right") => {
    setLastEdited("p");
    setTwoTailManual(true);
    if (side === "left") setPLeftText(val);
    else setPRightText(val);
    const parsed = parseFloat(val);
    if (!Number.isFinite(parsed)) return;
    const clamped = Math.min(Math.max(parsed, EPS), 1 - EPS);
    const otherParsed = parseFloat(side === "left" ? pRightText : pLeftText);
    const otherClamped = Number.isFinite(otherParsed)
      ? Math.min(Math.max(otherParsed, EPS), 1 - EPS)
      : EPS;
    const leftProb = side === "left" ? clamped : otherClamped;
    const rightProb = side === "right" ? clamped : otherClamped;
    const lower = invChi(Math.min(leftProb, 1 - EPS), df);
    let upperCandidate = invChi(Math.max(1 - rightProb, EPS), df);
    if (upperCandidate <= lower + EPS) upperCandidate = lower + EPS;
    const safeRightProb = Math.max(0, 1 - cdfChi(upperCandidate, df));
    const total = Math.min(Math.max(leftProb + safeRightProb, 0), 1);
    setTwoChiLower(lower);
    setTwoChiUpper(upperCandidate);
    setTwoChiLowerText(lower.toFixed(4));
    setTwoChiUpperText(upperCandidate.toFixed(4));
    if (side === "left") {
      setPLeftText(val);
      setPRightText(safeRightProb.toFixed(4));
    } else {
      setPLeftText(leftProb.toFixed(4));
      setPRightText(val);
    }
    setPValue(total);
    setPText(total.toString());
    setChiValue(upperCandidate);
    setChiText(upperCandidate.toString());
  };

  const handleCenterSidePChange = (val: string, side: "left" | "right") => {
    setLastEdited("p");
    if (side === "left") setPCenterLeftText(val);
    else setPCenterRightText(val);
    const parsed = parseFloat(val);
    if (!Number.isFinite(parsed)) return;

    const clamped = Math.min(Math.max(parsed, EPS), 1 - EPS);
    const otherParsed = parseFloat(
      side === "left" ? pCenterRightText : pCenterLeftText
    );
    const otherClamped = Number.isFinite(otherParsed)
      ? Math.min(Math.max(otherParsed, EPS), 1 - EPS)
      : EPS;

    const leftProb = side === "left" ? clamped : otherClamped;
    const rightProb = side === "right" ? clamped : otherClamped;

    const lower = invChi(Math.min(leftProb, 1 - EPS), df);
    let upperCandidate = invChi(Math.max(1 - rightProb, EPS), df);
    if (upperCandidate <= lower + EPS) upperCandidate = lower + EPS;

    const safeRightProb = Math.max(0, 1 - cdfChi(upperCandidate, df));
    const totalCenter = Math.max(0, 1 - (leftProb + safeRightProb));

    setTwoChiLower(lower);
    setTwoChiUpper(upperCandidate);
    setTwoChiLowerText(lower.toFixed(4));
    setTwoChiUpperText(upperCandidate.toFixed(4));

    if (side === "left") {
      setPCenterLeftText(val);
      setPCenterRightText(safeRightProb.toFixed(4));
    } else {
      setPCenterLeftText(leftProb.toFixed(4));
      setPCenterRightText(val);
    }

    setPValue(totalCenter);
    setPText(totalCenter.toString());
    setChiValue(upperCandidate);
    setChiText(upperCandidate.toString());
  };

  const lowerCritical =
    tail === "two"
      ? Math.max(twoChiLower, EPS)
      : tail === "center"
      ? Math.max(twoChiLower, EPS)
      : null;
  const upperCritical =
    tail === "two"
      ? Math.max(twoChiUpper, (lowerCritical ?? 0) + EPS)
      : tail === "center"
      ? Math.max(twoChiUpper, (lowerCritical ?? 0) + EPS)
      : Math.max(chiSync, 1e-5);

  const graph = useMemo(() => {
    const data: Array<{
      x: number;
      pdf: number;
      shade: number | null;
      shade2?: number | null;
    }> = [];
    const base = df + Math.sqrt(2 * df) * 4;
    const approxMax = Math.max(
      upperCritical * 1.1,
      base,
      (lowerCritical ?? 0) * 4,
      20
    );
    const xMax = Math.min(approxMax, 80);
    const step = xMax / 350;
    for (let x = 0; x <= xMax + 1e-9; x += step) {
      const y = pdfChi(x, df);
      let shade: number | null = null;
      let shade2: number | null = null;
      if (tail === "left" && x <= upperCritical) shade = y;
      else if (tail === "right" && x >= upperCritical) shade = y;
      else if (tail === "two") {
        if (lowerCritical !== null && x <= lowerCritical) shade = y;
        if (x >= upperCritical) shade2 = y;
      } else if (tail === "center") {
        if (lowerCritical !== null && x >= lowerCritical && x <= upperCritical)
          shade = y;
      }
      data.push({ x, pdf: y, shade, shade2 });
    }
    return { data, xMax };
  }, [upperCritical, lowerCritical, df, tail]);

  const formatVal = (val: number) =>
    Number.isFinite(val) ? val.toFixed(4) : "";

  return (
    <div
      className="card"
      style={{ marginTop: 16, padding: 16, borderRadius: 16 }}
    >
      <h3 style={{ marginTop: 0 }}>Distribución χ²</h3>

      <div className="kpi">
        <span className="pill">
          df = <b>{df}</b>
        </span>
      </div>

      <div
        className="card"
        style={{
          display: "grid",
          gap: 16,
          padding: 16,
          borderRadius: 12,
          marginTop: 12,
        }}
      >
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(3, minmax(140px, 1fr))",
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
                border: "1px solid var(--border)",
                borderRadius: 14,
                padding: 12,
                display: "grid",
                gap: 8,
                justifyItems: "center",
                alignContent: "center",
                background: tail === opt.key ? "#1a2353" : "transparent",
                color: tail === opt.key ? "#ffffff" : "inherit",
                boxShadow:
                  tail === opt.key
                    ? "0 10px 25px rgba(37,99,235,0.35)"
                    : "0 4px 12px rgba(15,23,42,0.04)",
              }}
            >
              <input
                type="radio"
                name="tailChi"
                checked={tail === opt.key}
                onChange={() => {
                  setTail(opt.key);
                  if (opt.key === "two") setLastEdited("p");
                }}
                style={{ display: "none" }}
              />
              <svg width="72" height="36" viewBox="0 0 72 36" aria-hidden="true">
                <defs>
                  <path
                    id={`chi-under-${opt.key}`}
                    d="M2,28 C 30,2 60,2 70,28 L70,28 L2,28 Z"
                  />
                  <clipPath id={`chi-left-${opt.key}`}>
                    <rect x="2" y="0" width="28" height="28" />
                  </clipPath>
                  <clipPath id={`chi-right-${opt.key}`}>
                    <rect x="42" y="0" width="28" height="28" />
                  </clipPath>
                  <clipPath id={`chi-center-${opt.key}`}>
                    <rect x="28" y="0" width="16" height="28" />
                  </clipPath>
                </defs>
                {opt.key === "left" && (
                  <use
                    xlinkHref={`#chi-under-${opt.key}`}
                    fill="#22c55e"
                    opacity="0.45"
                    clipPath={`url(#chi-left-${opt.key})`}
                  />
                )}
                {opt.key === "right" && (
                  <use
                    xlinkHref={`#chi-under-${opt.key}`}
                    fill="#22c55e"
                    opacity="0.45"
                    clipPath={`url(#chi-right-${opt.key})`}
                  />
                )}
                {opt.key === "two" && (
                  <>
                    <use
                      xlinkHref={`#chi-under-${opt.key}`}
                      fill="#22c55e"
                      opacity="0.45"
                      clipPath={`url(#chi-left-${opt.key})`}
                    />
                    <use
                      xlinkHref={`#chi-under-${opt.key}`}
                      fill="#22c55e"
                      opacity="0.45"
                      clipPath={`url(#chi-right-${opt.key})`}
                    />
                  </>
                )}
                {opt.key === "center" && (
                  <use
                    xlinkHref={`#chi-under-${opt.key}`}
                    fill="#22c55e"
                    opacity="0.45"
                    clipPath={`url(#chi-center-${opt.key})`}
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
                  d="M2,28 C 30,2 60,2 70,28"
                  fill="none"
                  stroke="#3b82f6"
                  strokeWidth="2"
                />
              </svg>
              <div style={{ fontWeight: tail === opt.key ? 700 : 600 }}>
                {opt.label}
              </div>
            </label>
          ))}
        </div>

        {tail === "two" ? (
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(4, minmax(160px, 1fr))",
              gap: 12,
            }}
          >
            <label>
              χ₁²
              <span
                style={{ fontSize: 12, marginLeft: 6, opacity: 0.75 }}
              >
                
              </span>
              <input
                type="number"
                min={0}
                step="0.001"
                value={twoChiLowerText}
                onChange={(e) => {
                  const val = e.target.value;
                  setTwoChiLowerText(val);
                  const parsed = parseFloat(val);
                  if (Number.isFinite(parsed) && parsed > 0) {
                    setLastEdited("chi");
                    setTwoTailManual(true);
                    const safeVal = Math.max(parsed, EPS);
                    setTwoChiLower(safeVal);
                    setChiValue(safeVal);
                    setChiText(safeVal.toString());
                    if (safeVal >= twoChiUpper - EPS) {
                      const bumped = safeVal + EPS;
                      setTwoChiUpper(bumped);
                      setTwoChiUpperText(bumped.toFixed(4));
                    }
                    const leftProb = cdfChi(safeVal, df);
                    const rightProb = Math.max(
                      0,
                      1 - cdfChi(twoChiUpper, df)
                    );
                    setPLeftText(leftProb.toFixed(4));
                    setPRightText(rightProb.toFixed(4));
                    const total = Math.min(
                      Math.max(leftProb + rightProb, 0),
                      1
                    );
                    setPValue(total);
                    setPText(total.toString());
                  }
                }}
              />
            </label>
            <label>
              χ₂²
              <span
                style={{ fontSize: 12, marginLeft: 6, opacity: 0.75 }}
              >
                
              </span>
              <input
                type="number"
                min={0}
                step="0.001"
                value={twoChiUpperText}
                onChange={(e) => {
                  const val = e.target.value;
                  setTwoChiUpperText(val);
                  const parsed = parseFloat(val);
                  if (Number.isFinite(parsed) && parsed > 0) {
                    setLastEdited("chi");
                    setTwoTailManual(true);
                    const safeVal = Math.max(parsed, EPS);
                    setTwoChiUpper(safeVal);
                    setChiValue(safeVal);
                    setChiText(safeVal.toString());
                    if (safeVal <= twoChiLower + EPS) {
                      const lowered = Math.max(safeVal - EPS, EPS);
                      setTwoChiLower(lowered);
                      setTwoChiLowerText(lowered.toFixed(4));
                    }
                    const leftProb = cdfChi(twoChiLower, df);
                    const rightProb = Math.max(
                      0,
                      1 - cdfChi(safeVal, df)
                    );
                    setPLeftText(leftProb.toFixed(4));
                    setPRightText(rightProb.toFixed(4));
                    const total = Math.min(
                      Math.max(leftProb + rightProb, 0),
                      1
                    );
                    setPValue(total);
                    setPText(total.toString());
                  }
                }}
              />
            </label>
            <label>
              P1 (0-1)
              <input
                type="number"
                min={0}
                max={1}
                step="0.0001"
                value={pLeftText}
                onChange={(e) =>
                  handleTwoSidePChange(e.target.value, "left")
                }
              />
            </label>
            <label>
              P2 (0-1)
              <input
                type="number"
                min={0}
                max={1}
                step="0.0001"
                value={pRightText}
                onChange={(e) =>
                  handleTwoSidePChange(e.target.value, "right")
                }
              />
            </label>
          </div>
        ) : tail === "center" ? (
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(4, minmax(160px, 1fr))",
              gap: 12,
            }}
          >
            <label>
              χ₁²
              <span
                style={{ fontSize: 12, marginLeft: 6, opacity: 0.75 }}
              >
                
              </span>
              <input
                type="number"
                min={0}
                step="0.001"
                value={twoChiLowerText}
                onChange={(e) => {
                  const val = e.target.value;
                  setTwoChiLowerText(val);
                  const parsed = parseFloat(val);
                  if (Number.isFinite(parsed) && parsed > 0) {
                    setLastEdited("chi");
                    const safeVal = Math.max(parsed, EPS);
                    setTwoChiLower(safeVal);
                    const leftProb = cdfChi(safeVal, df);
                    const rightProb = Math.max(
                      0,
                      1 - cdfChi(Math.max(twoChiUpper, EPS), df)
                    );
                    setPCenterLeftText(leftProb.toFixed(4));
                    setPCenterRightText(rightProb.toFixed(4));
                    const totalCenter = Math.max(
                      0,
                      1 - (leftProb + rightProb)
                    );
                    setPValue(totalCenter);
                    setPText(totalCenter.toString());
                    if (safeVal >= twoChiUpper - EPS) {
                      const bumped = safeVal + EPS;
                      setTwoChiUpper(bumped);
                      setTwoChiUpperText(bumped.toFixed(4));
                    }
                  }
                }}
              />
            </label>
            <label>
              χ₂²
              <span
                style={{ fontSize: 12, marginLeft: 6, opacity: 0.75 }}
              >
                
              </span>
              <input
                type="number"
                min={0}
                step="0.001"
                value={twoChiUpperText}
                onChange={(e) => {
                  const val = e.target.value;
                  setTwoChiUpperText(val);
                  const parsed = parseFloat(val);
                  if (Number.isFinite(parsed) && parsed > 0) {
                    setLastEdited("chi");
                    const safeVal = Math.max(parsed, EPS);
                    setTwoChiUpper(safeVal);
                    const leftProb = cdfChi(Math.max(twoChiLower, EPS), df);
                    const rightProb = Math.max(
                      0,
                      1 - cdfChi(safeVal, df)
                    );
                    setPCenterLeftText(leftProb.toFixed(4));
                    setPCenterRightText(rightProb.toFixed(4));
                    const totalCenter = Math.max(
                      0,
                      1 - (leftProb + rightProb)
                    );
                    setPValue(totalCenter);
                    setPText(totalCenter.toString());
                    if (safeVal <= twoChiLower + EPS) {
                      const lowered = Math.max(safeVal - EPS, EPS);
                      setTwoChiLower(lowered);
                      setTwoChiLowerText(lowered.toFixed(4));
                    }
                  }
                }}
              />
            </label>
            <label>
              P1 (0-1)
              <input
                type="number"
                min={0}
                max={1}
                step="0.0001"
                value={pCenterLeftText}
                onChange={(e) =>
                  handleCenterSidePChange(e.target.value, "left")
                }
              />
            </label>
            <label>
              P2 (0-1)
              <input
                type="number"
                min={0}
                max={1}
                step="0.0001"
                value={pCenterRightText}
                onChange={(e) =>
                  handleCenterSidePChange(e.target.value, "right")
                }
              />
            </label>
          </div>
        ) : (
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(2, minmax(220px, 1fr))",
              gap: 12,
            }}
          >
            <label>
              χ²
              <input
                type="number"
                min={0}
                step="0.001"
                value={lastEdited === "chi" ? chiText : formatVal(chiFromP)}
                onChange={(e) => {
                  const val = e.target.value;
                  setLastEdited("chi");
                  setChiText(val);
                  const parsed = parseFloat(val);
                  if (Number.isFinite(parsed) && parsed > 0) {
                    setChiValue(parsed);
                  }
                }}
              />
            </label>
            <label>
              P (0-1)
              <input
                type="number"
                min={0}
                max={1}
                step="0.0001"
                value={lastEdited === "p" ? pText : formatVal(pFromChi)}
                onChange={(e) => {
                  const val = e.target.value;
                  setLastEdited("p");
                  setPText(val);
                  const parsed = parseFloat(val);
                  if (Number.isFinite(parsed)) {
                    setPValue(Math.min(Math.max(parsed, 0), 1));
                  }
                }}
              />
            </label>
          </div>
        )}

        <div
          style={{ display: "grid", gridTemplateColumns: "1fr", gap: 12 }}
        >
          <label>
            Grados de libertad (df)
            <input
              type="number"
              min={1}
              step={1}
              value={df}
              onChange={(e) => {
                const val = parseInt(e.target.value, 10);
                if (Number.isFinite(val) && val >= 1)
                  setDf(Math.min(200, val));
              }}
            />
          </label>
        </div>
      </div>

      <div style={{ height: 360, marginTop: 20 }}>
        <ResponsiveContainer>
          <AreaChart
            data={graph.data}
            margin={{ left: 0, right: 0, top: 10, bottom: 0 }}
          >
            <defs>
              <linearGradient id="chiShade" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#22c55e" stopOpacity={0.8} />
                <stop offset="100%" stopColor="#22c55e" stopOpacity={0.1} />
              </linearGradient>
              <linearGradient id="chiCurve" x1="0" y1="0" x2="0" y2="1">
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
                return [safe, "Área"];
              }}
            />
            <Area
              type="monotone"
              dataKey="shade"
              stroke="none"
              fill="url(#chiShade)"
              baseLine={0}
            />
            <Area
              type="monotone"
              dataKey="shade2"
              stroke="none"
              fill="url(#chiShade)"
              baseLine={0}
            />
            <Area
              type="monotone"
              dataKey="pdf"
              stroke="#2563eb"
              fill="url(#chiCurve)"
              baseLine={0}
            />

            {/* Línea principal (siempre la de la derecha) */}
            <ReferenceLine
              x={upperCritical}
              stroke="red"
              strokeDasharray="3 3"
            >
              <Label
                value={
                  tail === "two"
                    ? `χ²₂ = ${upperCritical.toFixed(3)}`
                    : `χ² = ${upperCritical.toFixed(3)}`
                }
                position="insideTop"
                fill="var(--text)"
              />
            </ReferenceLine>

            {/* Una sola cola: mostramos P total */}
            {(tail === "left" || tail === "right") && (
              <ReferenceLine x={upperCritical} stroke="transparent">
                <Label
                  value={`P = ${formatVal(pSync)}`}
                  position="bottom"
                  dy={12}
                  fill="red"
                />
              </ReferenceLine>
            )}

            {/* Dos colas: 2 líneas + P1/P2 */}
            {tail === "two" && lowerCritical !== null && (
              <>
                <ReferenceLine
                  x={lowerCritical}
                  stroke="red"
                  strokeDasharray="3 3"
                >
                  <Label
                    value={`χ²₁ = ${lowerCritical.toFixed(3)}`}
                    position="insideTop"
                    fill="var(--text)"
                  />
                </ReferenceLine>
                <ReferenceLine x={lowerCritical} stroke="transparent">
                  <Label
                    value={`P₁ = ${formatVal(twoLeftProb)}`}
                    position="bottom"
                    dy={12}
                    fill="red"
                  />
                </ReferenceLine>
                <ReferenceLine x={upperCritical} stroke="transparent">
                  <Label
                    value={`P₂ = ${formatVal(twoRightProb)}`}
                    position="bottom"
                    dy={12}
                    fill="red"
                  />
                </ReferenceLine>
              </>
            )}

            {/* Centro: 2 líneas + P1/P2 para las colas externas */}
            {tail === "center" && lowerCritical !== null && (
              <>
                <ReferenceLine
                  x={lowerCritical}
                  stroke="red"
                  strokeDasharray="3 3"
                >
                  <Label
                    value={`χ²₁ = ${lowerCritical.toFixed(3)}`}
                    position="insideTop"
                    fill="var(--text)"
                  />
                </ReferenceLine>
                <ReferenceLine
                  x={upperCritical}
                  stroke="red"
                  strokeDasharray="3 3"
                >
                  <Label
                    value={`χ²₂ = ${upperCritical.toFixed(3)}`}
                    position="insideTop"
                    fill="var(--text)"
                  />
                </ReferenceLine>
                <ReferenceLine x={lowerCritical} stroke="transparent">
                  <Label
                    value={`P₁ = ${formatVal(centerLeftProb)}`}
                    position="bottom"
                    dy={12}
                    fill="red"
                  />
                </ReferenceLine>
                <ReferenceLine x={upperCritical} stroke="transparent">
                  <Label
                    value={`P₂ = ${formatVal(centerRightProb)}`}
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
        {"f(x; df) = 1 / (2^{df/2} Γ(df/2)) x^{df/2 - 1} e^{-x/2}"}
      </div>
    </div>
  );
}
