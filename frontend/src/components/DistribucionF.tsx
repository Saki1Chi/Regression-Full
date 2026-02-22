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
type LastEdited = "f" | "p" | "df";

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

function betaLn(a: number, b: number) {
  return gammaLn(a) + gammaLn(b) - gammaLn(a + b);
}

function betacf(a: number, b: number, x: number) {
  const MAX_ITER = 200;
  const EPS = 3e-12;
  const FPMIN = 1e-300;
  let qab = a + b;
  let qap = a + 1;
  let qam = a - 1;
  let c = 1;
  let d = 1 - (qab * x) / qap;
  if (Math.abs(d) < FPMIN) d = FPMIN;
  d = 1 / d;
  let h = d;
  for (let m = 1, m2 = 2; m <= MAX_ITER; m++, m2 += 2) {
    let aa = (m * (b - m) * x) / ((qam + m2) * (a + m2));
    d = 1 + aa * d;
    if (Math.abs(d) < FPMIN) d = FPMIN;
    c = 1 + aa / c;
    if (Math.abs(c) < FPMIN) c = FPMIN;
    d = 1 / d;
    h *= d * c;
    aa = (-(a + m) * (qab + m) * x) / ((a + m2) * (qap + m2));
    d = 1 + aa * d;
    if (Math.abs(d) < FPMIN) d = FPMIN;
    c = 1 + aa / c;
    if (Math.abs(c) < FPMIN) c = FPMIN;
    d = 1 / d;
    const del = d * c;
    h *= del;
    if (Math.abs(del - 1) < EPS) break;
  }
  return h;
}

function regIncompleteBeta(x: number, a: number, b: number) {
  if (x <= 0) return 0;
  if (x >= 1) return 1;
  const bt =
    Math.exp(betaLn(a, b) * -1 + a * Math.log(x) + b * Math.log(1 - x));
  if (x < (a + 1) / (a + b + 2)) {
    return bt * betacf(a, b, x) / a;
  }
  return 1 - (bt * betacf(b, a, 1 - x)) / b;
}

function pdfF(x: number, df1: number, df2: number) {
  if (!Number.isFinite(x) || x <= 0) return 0;
  const a = df1 / 2;
  const b = df2 / 2;
  const logNum =
    a * Math.log(df1) + b * Math.log(df2) + (a - 1) * Math.log(x);
  const logDen =
    (a + b) * Math.log(df2 + df1 * x) + betaLn(a, b);
  return Math.exp(logNum - logDen);
}

function cdfF(x: number, df1: number, df2: number) {
  if (!Number.isFinite(x) || x <= 0) return 0;
  const a = df1 / 2;
  const b = df2 / 2;
  const xx = (df1 * x) / (df1 * x + df2);
  return regIncompleteBeta(xx, a, b);
}

function invF(p: number, df1: number, df2: number) {
  const target = Math.min(Math.max(p, 1e-12), 1 - 1e-12);
  let lo = 1e-8;
  let hi = 1;
  while (cdfF(hi, df1, df2) < target && hi < 1e6) {
    hi *= 2;
  }
  for (let i = 0; i < 80; i++) {
    const mid = (lo + hi) / 2;
    const cmid = cdfF(mid, df1, df2);
    if (cmid < target) lo = mid;
    else hi = mid;
  }
  return (lo + hi) / 2;
}

export default function DistribucionF() {
  const [df1, setDf1] = useState(5);
  const [df2, setDf2] = useState(10);
  const [tail, setTail] = useState<Tail>("right");

  const [fValue, setFValue] = useState(1);
  const [pValue, setPValue] = useState(0.5);
  const [fText, setFText] = useState("1");
  const [pText, setPText] = useState("0.5");
  const [pLeftText, setPLeftText] = useState("0.2500");
  const [pRightText, setPRightText] = useState("0.2500");
  const [pCenterLeftText, setPCenterLeftText] = useState("0.2500");
  const [pCenterRightText, setPCenterRightText] = useState("0.2500");

  const [lastEdited, setLastEdited] = useState<LastEdited>("f");

  const [twoFLower, setTwoFLower] = useState(0.5);
  const [twoFUpper, setTwoFUpper] = useState(1.5);
  const [twoFLowerText, setTwoFLowerText] = useState("0.5000");
  const [twoFUpperText, setTwoFUpperText] = useState("1.5000");
  const [twoTailManual, setTwoTailManual] = useState(false);

  // nuevo estado para df en los bloques de two/center
  const [dfText, setDfText] = useState(df1.toString());

  const prevTailRef = useRef<Tail>(tail);

  const EPS = 1e-6;
  const clampProb = (v: number) => Math.min(Math.max(v, EPS), 1 - EPS);
  const clampHalfProb = (v: number) => Math.min(Math.max(v, EPS), 0.5 - EPS);

  const twoTailProbabilities = useMemo(() => {
    if (tail !== "two") return { left: 0, right: 0 };
    const safeLower = Math.max(twoFLower, EPS);
    const safeUpper = Math.max(twoFUpper, safeLower + EPS);
    const leftProb = cdfF(safeLower, df1, df2);
    const rightProb = Math.max(0, 1 - cdfF(safeUpper, df1, df2));
    return { left: leftProb, right: rightProb };
  }, [tail, twoFLower, twoFUpper, df1, df2]);
  const twoLeftProb = twoTailProbabilities.left;
  const twoRightProb = twoTailProbabilities.right;
  const twoTotalProb = Math.min(1, Math.max(0, twoLeftProb + twoRightProb));

  const centerProbabilities = useMemo(() => {
    if (tail !== "center") return { left: 0, right: 0 };
    const safeLower = Math.max(twoFLower, EPS);
    const safeUpper = Math.max(twoFUpper, safeLower + EPS);
    const leftProb = cdfF(safeLower, df1, df2);
    const rightProb = Math.max(0, 1 - cdfF(safeUpper, df1, df2));
    return { left: leftProb, right: rightProb };
  }, [tail, twoFLower, twoFUpper, df1, df2]);
  const centerLeftProb = centerProbabilities.left;
  const centerRightProb = centerProbabilities.right;

  const pFromF = useMemo(() => {
    const cdfVal = cdfF(fValue, df1, df2);
    if (tail === "left") return cdfVal;
    if (tail === "right") return Math.max(0, 1 - cdfVal);
    return twoTotalProb;
  }, [fValue, df1, df2, tail, twoTotalProb]);

  const fFromP = useMemo(() => {
    const prob = clampProb(pValue);
    if (tail === "left") return invF(prob, df1, df2);
    if (tail === "right") return invF(1 - prob, df1, df2);
    return invF(1 - prob / 2, df1, df2);
  }, [pValue, df1, df2, tail]);

  const fSync =
    tail === "center" ? fValue : lastEdited === "p" ? fFromP : fValue;
  const pSync = lastEdited === "f" ? pFromF : pValue;

  const updateTwoTailFromProb = (prob: number) => {
    const bounded = clampProb(prob);
    const half = clampHalfProb(bounded / 2);
    const newLower = invF(half, df1, df2);
    const newUpper = invF(1 - half, df1, df2);
    setTwoFLower(newLower);
    setTwoFUpper(newUpper);
    setTwoFLowerText(newLower.toFixed(4));
    setTwoFUpperText(newUpper.toFixed(4));
    setFValue(newUpper);
    setFText(newUpper.toString());
  };

  const updateTwoTailFromUpper = (upperVal: number) => {
    const safeUpper = Math.max(upperVal, EPS);
    const tailProbRaw = Math.max(0, 1 - cdfF(safeUpper, df1, df2));
    const tailProb = clampHalfProb(tailProbRaw);
    const newLower = invF(tailProb, df1, df2);
    setTwoFUpper(safeUpper);
    setTwoFLower(newLower);
    setTwoFUpperText(safeUpper.toFixed(4));
    setTwoFLowerText(newLower.toFixed(4));
    setFValue(safeUpper);
    setFText(safeUpper.toString());
    setPLeftText(tailProb.toFixed(4));
    const rightProb = Math.max(0, 1 - cdfF(safeUpper, df1, df2));
    setPRightText(rightProb.toFixed(4));
    const total = Math.min(Math.max(tailProb + rightProb, 0), 1);
    setPValue(total);
    setPText(total.toString());
    setPCenterLeftText(tailProb.toFixed(4));
    setPCenterRightText(rightProb.toFixed(4));
  };

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
    const lower = invF(Math.min(leftProb, 1 - EPS), df1, df2);
    let upperCandidate = invF(Math.max(1 - rightProb, EPS), df1, df2);
    if (upperCandidate <= lower + EPS) {
      upperCandidate = lower + EPS;
    }
    const safeUpperProb = Math.max(0, 1 - cdfF(upperCandidate, df1, df2));
    const total = Math.min(Math.max(leftProb + safeUpperProb, 0), 1);
    setTwoFLower(lower);
    setTwoFUpper(upperCandidate);
    setTwoFLowerText(lower.toFixed(4));
    setTwoFUpperText(upperCandidate.toFixed(4));
    if (side === "left") {
      setPLeftText(val);
      setPRightText(safeUpperProb.toFixed(4));
    } else {
      setPLeftText(leftProb.toFixed(4));
      setPRightText(val);
    }
    setPValue(total);
    setPText(total.toString());
    setFValue(upperCandidate);
    setFText(upperCandidate.toString());
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
    const lower = invF(Math.min(leftProb, 1 - EPS), df1, df2);
    let upperCandidate = invF(Math.max(1 - rightProb, EPS), df1, df2);
    if (upperCandidate <= lower + EPS) upperCandidate = lower + EPS;
    const safeRightProb = Math.max(0, 1 - cdfF(upperCandidate, df1, df2));
    const totalCenter = Math.max(0, 1 - (leftProb + safeRightProb));
    setTwoFLower(lower);
    setTwoFUpper(upperCandidate);
    setTwoFLowerText(lower.toFixed(4));
    setTwoFUpperText(upperCandidate.toFixed(4));
    if (side === "left") {
      setPCenterLeftText(val);
      setPCenterRightText(safeRightProb.toFixed(4));
    } else {
      setPCenterLeftText(leftProb.toFixed(4));
      setPCenterRightText(val);
    }
    setPValue(totalCenter);
    setPText(totalCenter.toString());
    setFValue(upperCandidate);
    setFText(upperCandidate.toString());
  };

  useEffect(() => {
    if ((tail === "two" || tail === "center") && prevTailRef.current !== tail) {
      updateTwoTailFromUpper(Math.max(fSync, 1e-4));
      setTwoTailManual(false);
      const leftProb = cdfF(twoFLower, df1, df2);
      const rightProb = Math.max(0, 1 - cdfF(twoFUpper, df1, df2));
      setPLeftText(leftProb.toFixed(4));
      setPRightText(rightProb.toFixed(4));
      setPCenterLeftText(leftProb.toFixed(4));
      setPCenterRightText(rightProb.toFixed(4));
    }
    prevTailRef.current = tail;
  }, [tail, fSync, twoFLower, twoFUpper, df1, df2]);

  useEffect(() => {
    if (tail !== "two" || lastEdited !== "p" || twoTailManual) return;
    updateTwoTailFromProb(pSync);
    setTwoTailManual(false);
  }, [tail, lastEdited, pSync, df1, df2, twoTailManual]);

  useEffect(() => {
    if (tail !== "two" || twoTailManual) return;
    updateTwoTailFromUpper(twoFUpper);
  }, [tail, df1, df2, twoTailManual, twoFUpper]);

  // mantener dfText sincronizado con df1
  useEffect(() => {
    setDfText(df1.toString());
  }, [df1]);

  const lowerCritical =
    tail === "two"
      ? Math.max(twoFLower, EPS)
      : tail === "center"
      ? Math.max(twoFLower, EPS)
      : null;
  const upperCritical =
    tail === "two"
      ? Math.max(twoFUpper, (lowerCritical ?? 0) + EPS)
      : tail === "center"
      ? Math.max(twoFUpper, (lowerCritical ?? 0) + EPS)
      : Math.max(fSync, 1e-4);

  const graph = useMemo(() => {
    const data: Array<{
      x: number;
      pdf: number;
      shade: number | null;
      shade2?: number | null;
    }> = [];
    const reference = Math.max(
      upperCritical * 1.4,
      lowerCritical ? lowerCritical * 1.4 : 0,
      5
    );
    const xMax = Math.min(50, reference);
    const step = xMax / 400;
    for (let x = 0; x <= xMax + 1e-9; x += step) {
      const y = pdfF(x, df1, df2);
      let shade: number | null = null;
      let shade2: number | null = null;
      if (tail === "left") {
        if (x <= upperCritical) shade = y;
      } else if (tail === "right") {
        if (x >= upperCritical) shade = y;
      } else if (tail === "two") {
        if (lowerCritical && x <= lowerCritical) shade = y;
        if (x >= upperCritical) shade2 = y;
      } else {
        if (lowerCritical && x >= lowerCritical && x <= upperCritical)
          shade = y;
      }
      data.push({ x, pdf: y, shade, shade2 });
    }
    return { data, xMax };
  }, [upperCritical, lowerCritical, tail, df1, df2]);

  const formatProb = (val: number) =>
    Number.isFinite(val) ? val.toFixed(4) : "";

  return (
    <div
      className="card"
      style={{ marginTop: 16, padding: 16, borderRadius: 16 }}
    >
      <h3 style={{ marginTop: 0 }}>Distribución F</h3>

      <div className="kpi">
        <span className="pill">
          df₁ = <b>{df1}</b>
        </span>
        <span className="pill">
          df₂ = <b>{df2}</b>
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
            gridTemplateColumns: "repeat(4, minmax(140px, 1fr))",
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
                name="tailF"
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
                    id={`f-under-${opt.key}`}
                    d="M2,28 C 22,4 50,4 70,28 L70,28 L2,28 Z"
                  />
                  <clipPath id={`f-left-${opt.key}`}>
                    <rect x="2" y="0" width="28" height="28" />
                  </clipPath>
                  <clipPath id={`f-right-${opt.key}`}>
                    <rect x="42" y="0" width="28" height="28" />
                  </clipPath>
                  <clipPath id={`f-center-${opt.key}`}>
                    <rect x="28" y="0" width="16" height="28" />
                  </clipPath>
                </defs>
                {opt.key === "left" && (
                  <use
                    xlinkHref={`#f-under-${opt.key}`}
                    fill="#22c55e"
                    opacity="0.45"
                    clipPath={`url(#f-left-${opt.key})`}
                  />
                )}
                {opt.key === "right" && (
                  <use
                    xlinkHref={`#f-under-${opt.key}`}
                    fill="#22c55e"
                    opacity="0.45"
                    clipPath={`url(#f-right-${opt.key})`}
                  />
                )}
                {opt.key === "two" && (
                  <>
                    <use
                      xlinkHref={`#f-under-${opt.key}`}
                      fill="#22c55e"
                      opacity="0.45"
                      clipPath={`url(#f-left-${opt.key})`}
                    />
                    <use
                      xlinkHref={`#f-under-${opt.key}`}
                      fill="#22c55e"
                      opacity="0.45"
                      clipPath={`url(#f-right-${opt.key})`}
                    />
                  </>
                )}
                {opt.key === "center" && (
                  <use
                    xlinkHref={`#f-under-${opt.key}`}
                    fill="#22c55e"
                    opacity="0.45"
                    clipPath={`url(#f-center-${opt.key})`}
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
              gridTemplateColumns: "repeat(5, minmax(140px, 1fr))",
              gap: 12,
            }}
          >
            <label>
              F₁
              <span
                style={{ fontSize: 12, marginLeft: 6, opacity: 0.75 }}
              >
                (auto)
              </span>
              <input
                type="number"
                min={0}
                step="0.001"
                value={twoFLowerText}
                onChange={(e) => {
                  const val = e.target.value;
                  setTwoFLowerText(val);
                  const parsed = parseFloat(val);
                  if (Number.isFinite(parsed) && parsed > 0) {
                    setLastEdited("f");
                    setTwoTailManual(true);
                    const safeVal = Math.max(parsed, EPS);
                    setTwoFLower(safeVal);
                    setFValue(safeVal);
                    setFText(safeVal.toString());
                    if (safeVal >= twoFUpper - EPS) {
                      const bumped = safeVal + EPS;
                      setTwoFUpper(bumped);
                      setTwoFUpperText(bumped.toFixed(4));
                    }
                    const leftProb = cdfF(safeVal, df1, df2);
                    const rightProb = Math.max(
                      0,
                      1 - cdfF(twoFUpper, df1, df2)
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
              F₂
              <span
                style={{ fontSize: 12, marginLeft: 6, opacity: 0.75 }}
              >
                (auto)
              </span>
              <input
                type="number"
                min={0}
                step="0.001"
                value={twoFUpperText}
                onChange={(e) => {
                  const val = e.target.value;
                  setTwoFUpperText(val);
                  const parsed = parseFloat(val);
                  if (Number.isFinite(parsed) && parsed > 0) {
                    setLastEdited("f");
                    setTwoTailManual(true);
                    const safeVal = Math.max(parsed, EPS);
                    setTwoFUpper(safeVal);
                    setFValue(safeVal);
                    setFText(safeVal.toString());
                    if (safeVal <= twoFLower + EPS) {
                      const lowered = Math.max(safeVal - EPS, EPS);
                      setTwoFLower(lowered);
                      setTwoFLowerText(lowered.toFixed(4));
                    }
                    const leftProb = cdfF(twoFLower, df1, df2);
                    const rightProb = Math.max(
                      0,
                      1 - cdfF(safeVal, df1, df2)
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
              gridTemplateColumns: "repeat(5, minmax(140px, 1fr))",
              gap: 12,
            }}
          >
            <label>
              F₁
              <span
                style={{ fontSize: 12, marginLeft: 6, opacity: 0.75 }}
              >
                (auto)
              </span>
              <input
                type="number"
                min={0}
                step="0.001"
                value={twoFLowerText}
                onChange={(e) => {
                  const val = e.target.value;
                  setTwoFLowerText(val);
                  const parsed = parseFloat(val);
                  if (Number.isFinite(parsed) && parsed > 0) {
                    setLastEdited("f");
                    const safeVal = Math.max(parsed, EPS);
                    setTwoFLower(safeVal);
                    const leftProb = cdfF(safeVal, df1, df2);
                    const rightProb = Math.max(
                      0,
                      1 - cdfF(twoFUpper, df1, df2)
                    );
                    setPCenterLeftText(leftProb.toFixed(4));
                    setPCenterRightText(rightProb.toFixed(4));
                    const totalCenter = Math.max(
                      0,
                      1 - (leftProb + rightProb)
                    );
                    setPValue(totalCenter);
                    setPText(totalCenter.toString());
                    if (safeVal >= twoFUpper - EPS) {
                      const bumped = safeVal + EPS;
                      setTwoFUpper(bumped);
                      setTwoFUpperText(bumped.toFixed(4));
                    }
                  }
                }}
              />
            </label>
            <label>
              F₂
              <span
                style={{ fontSize: 12, marginLeft: 6, opacity: 0.75 }}
              >
                (auto)
              </span>
              <input
                type="number"
                min={0}
                step="0.001"
                value={twoFUpperText}
                onChange={(e) => {
                  const val = e.target.value;
                  setTwoFUpperText(val);
                  const parsed = parseFloat(val);
                  if (Number.isFinite(parsed) && parsed > 0) {
                    setLastEdited("f");
                    const safeVal = Math.max(parsed, EPS);
                    setTwoFUpper(safeVal);
                    const leftProb = cdfF(twoFLower, df1, df2);
                    const rightProb = Math.max(
                      0,
                      1 - cdfF(safeVal, df1, df2)
                    );
                    setPCenterLeftText(leftProb.toFixed(4));
                    setPCenterRightText(rightProb.toFixed(4));
                    const totalCenter = Math.max(
                      0,
                      1 - (leftProb + rightProb)
                    );
                    setPValue(totalCenter);
                    setPText(totalCenter.toString());
                    if (safeVal <= twoFLower + EPS) {
                      const lowered = Math.max(safeVal - EPS, EPS);
                      setTwoFLower(lowered);
                      setTwoFLowerText(lowered.toFixed(4));
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
              F
              <input
                type="number"
                min={0}
                step="0.001"
                value={lastEdited === "f" ? fText : formatProb(fFromP)}
                onChange={(e) => {
                  const val = e.target.value;
                  setLastEdited("f");
                  setFText(val);
                  const parsed = parseFloat(val);
                  if (Number.isFinite(parsed) && parsed > 0) {
                    setFValue(parsed);
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
                value={lastEdited === "p" ? pText : formatProb(pFromF)}
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
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(2, minmax(160px, 1fr))",
            gap: 12,
          }}
        >
          <label>
            df₁ (numerador)
            <input
              type="number"
              min={1}
              step="1"
              value={df1}
              onChange={(e) => {
                const val = parseInt(e.target.value, 10);
                if (Number.isFinite(val) && val >= 1)
                  setDf1(Math.min(val, 200));
              }}
            />
          </label>
          <label>
            df₂ (denominador)
            <input
              type="number"
              min={1}
              step="1"
              value={df2}
              onChange={(e) => {
                const val = parseInt(e.target.value, 10);
                if (Number.isFinite(val) && val >= 1)
                  setDf2(Math.min(val, 400));
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
              <linearGradient id="fShade" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#22c55e" stopOpacity={0.8} />
                <stop offset="100%" stopColor="#22c55e" stopOpacity={0.1} />
              </linearGradient>
              <linearGradient id="fCurve" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#2563eb" stopOpacity={0.9} />
                <stop offset="100%" stopColor="#60a5fa" stopOpacity={0.4} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="4 4" />
            <XAxis type="number" domain={[0, graph.xMax]} dataKey="x" />
            <YAxis />
            <Tooltip
              formatter={(val: number | null, key) => {
                if (key === "pdf" && typeof val === "number") {
                  return [`${val.toFixed(4)}`, "f(x)"];
                }
                if (val == null) return ["0.0000", "Área"];
                return [`${val.toFixed(4)}`, "Área"];
              }}
            />
            <Area
              type="monotone"
              dataKey="shade"
              stroke="none"
              fill="url(#fShade)"
              baseLine={0}
            />
            <Area
              type="monotone"
              dataKey="shade2"
              stroke="none"
              fill="url(#fShade)"
              baseLine={0}
            />
            <Area
              type="monotone"
              dataKey="pdf"
              stroke="#2563eb"
              fill="url(#fCurve)"
              baseLine={0}
            />

            <ReferenceLine x={upperCritical} stroke="red" strokeDasharray="3 3">
              <Label
                value={
                  tail === "two"
                    ? `F₂ = ${upperCritical.toFixed(3)}`
                    : `F = ${upperCritical.toFixed(3)}`
                }
                position="insideTop"
                fill="var(--text)"
              />
            </ReferenceLine>
            {(tail === "left" || tail === "right") && (
              <ReferenceLine x={upperCritical} stroke="transparent">
                <Label
                  value={`P = ${formatProb(pSync)}`}
                  position="bottom"
                  dy={12}
                  fill="red"
                />
              </ReferenceLine>
            )}
            {tail === "two" && lowerCritical && (
              <>
                <ReferenceLine
                  x={lowerCritical}
                  stroke="red"
                  strokeDasharray="3 3"
                >
                  <Label
                    value={`F₁ = ${lowerCritical.toFixed(3)}`}
                    position="insideTop"
                    fill="var(--text)"
                  />
                </ReferenceLine>
                <ReferenceLine x={lowerCritical} stroke="transparent">
                  <Label
                    value={`P₁ = ${formatProb(twoLeftProb)}`}
                    position="bottom"
                    dy={12}
                    fill="red"
                  />
                </ReferenceLine>
                <ReferenceLine x={upperCritical} stroke="transparent">
                  <Label
                    value={`P₂ = ${formatProb(twoRightProb)}`}
                    position="bottom"
                    dy={12}
                    fill="red"
                  />
                </ReferenceLine>
              </>
            )}
            {tail === "center" && (
              <>
                <ReferenceLine
                  x={lowerCritical ?? 0}
                  stroke="red"
                  strokeDasharray="3 3"
                >
                  <Label
                    value={`F₁ = ${(lowerCritical ?? 0).toFixed(3)}`}
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
                    value={`F₂ = ${upperCritical.toFixed(3)}`}
                    position="insideTop"
                    fill="var(--text)"
                  />
                </ReferenceLine>
                <ReferenceLine x={lowerCritical ?? 0} stroke="transparent">
                  <Label
                    value={`P₁ = ${centerLeftProb.toFixed(4)}`}
                    position="bottom"
                    dy={12}
                    fill="red"
                  />
                </ReferenceLine>
                <ReferenceLine x={upperCritical} stroke="transparent">
                  <Label
                    value={`P₂ = ${centerRightProb.toFixed(4)}`}
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

      <div
        className="meta"
        style={{ textAlign: "center", fontSize: 14 }}
      >
        f<sub>F</sub>(x; df₁, df₂) ={" "}
        {
          "[df₁^{df₁/2} df₂^{df₂/2} x^{df₁/2 - 1}] / [B(df₁/2, df₂/2) (df₁ x + df₂)^{(df₁+df₂)/2}]"
        }
      </div>
    </div>
  );
}
