import { useEffect, useState } from "react";
import RegressionExcelForm from "./components/RegressionExcelForm";
import RegressionTableSimple from "./components/RegressionTableSimple";
import HomeIntro from "./components/HomeIntro";
import UsageGuide from "./components/UsageGuide";
import ThemeToggle from "./components/ThemeToggle";
import StandardNormalTool from "./components/StandardNormalTool"; // <= CAMBIADO

const API_BASE = "http://localhost:8000";

export default function App() {
  const [tab, setTab] = useState<"intro" | "guide" | "table" | "excel" | "normal">("intro");

  useEffect(() => {
    fetch(`${API_BASE}/api/session`, { credentials: "include" }).catch(() => {});
  }, []);

  return (
    <>
      <ThemeToggle />
      <div className="container">
        <div className="header">
          <div className="title">Regresiones (Simple y Múltiple)</div>
          <div className="badge">
            Backend: <code>{API_BASE}</code>
          </div>
        </div>

        <div className="tabs">
          <button className={`tab ${tab === "intro" ? "active" : ""}`} onClick={() => setTab("intro")}>
            Inicio
          </button>
          <button className={`tab ${tab === "guide" ? "active" : ""}`} onClick={() => setTab("guide")}>
            Guía de uso
          </button>
          <button className={`tab ${tab === "table" ? "active" : ""}`} onClick={() => setTab("table")}>
            Tabla (Simple)
          </button>
          <button className={`tab ${tab === "excel" ? "active" : ""}`} onClick={() => setTab("excel")}>
            Desde Excel
          </button>
          <button className={`tab ${tab === "normal" ? "active" : ""}`} onClick={() => setTab("normal")}>
            Probabilidad Z
          </button>
        </div>

        <div className="card">
          {tab === "intro" && <HomeIntro />}
          {tab === "guide" && <UsageGuide />}
          {tab === "table" && <RegressionTableSimple />}
          {tab === "excel" && <RegressionExcelForm />}
          {tab === "normal" && <StandardNormalTool />} {/* <= CAMBIADO */}
        </div>
      </div>
    </>
  );
}
