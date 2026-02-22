import React from "react";

export default function HomeIntro() {
  return (
    <div style={{ maxWidth: 1000, margin: "0 auto" }}>
      {/* Cabecera / Hero */}
      <div
        style={{
          display: "grid",
          gap: 14,
          padding: "28px 24px",
          borderRadius: 16,
          background:
            "radial-gradient(1200px 220px at 50% -40%, rgba(99,102,241,.25), rgba(0,0,0,0))",
          border: "1px solid var(--border)",
          boxShadow: "0 10px 30px rgba(0,0,0,.35)",
          textAlign: "center",
        }}
      >
        {/* Ícono */}
        <div style={{ display: "flex", justifyContent: "center" }}>
          <div
            style={{
              width: 70,
              height: 70,
              borderRadius: 16,
              display: "grid",
              placeItems: "center",
              background: "#111a44",
              border: "1px solid var(--border)",
              boxShadow: "0 8px 24px rgba(0,0,0,.35)",
            }}
            aria-hidden
          >
            {/* gráfico/ícono simple con svg */}
            <svg width="38" height="38" viewBox="0 0 24 24" fill="none">
              <path d="M4 18V6" stroke="#93c5fd" strokeWidth="2" />
              <path d="M10 18V10" stroke="#93c5fd" strokeWidth="2" />
              <path d="M16 18V3" stroke="#93c5fd" strokeWidth="2" />
              <path d="M2 20h20" stroke="#64748b" strokeWidth="1.5" />
            </svg>
          </div>
        </div>

        <h1 style={{ margin: 0, fontSize: 28 }}>
          <span style={{ color: "#a5b4fc" }}>Regression App Web</span>
        </h1>
        <p style={{ margin: 0, color: "var(--muted)" }}>
          Una aplicación ligera y moderna para calcular{" "}
          <b>regresión lineal simple y múltiple</b>, cargar datos desde{" "}
          <b>Excel</b> y visualizar resultados clave (ecuación, r², r²
          ajustado, tablas y gráficas).
        </p>

        {/* "Gráfico" decorativo simple */}
        <div style={{ width: "100%", height: 120 }}>
          <svg viewBox="0 0 600 120" width="100%" height="120" aria-hidden>
            <defs>
              <linearGradient id="g1" x1="0" x2="1">
                <stop offset="0%" stopColor="#60a5fa" stopOpacity="0.9" />
                <stop offset="100%" stopColor="#a78bfa" stopOpacity="0.9" />
              </linearGradient>
            </defs>
            <polyline
              points="0,90 80,70 130,78 180,60 240,65 300,48 360,45 420,35 480,40 540,30 600,26"
              fill="none"
              stroke="url(#g1)"
              strokeWidth="3"
            />
            <circle cx="180" cy="60" r="4" fill="#60a5fa" />
            <circle cx="300" cy="48" r="4" fill="#60a5fa" />
            <circle cx="420" cy="35" r="4" fill="#60a5fa" />
          </svg>
        </div>
      </div>

      {/* Secciones con fondo blanco */}
      <div style={{ display: "grid", gap: 18, marginTop: 18 }}>
        <section className="section">
          <h2 style={{ marginTop: 0, fontSize: 18, color: "var(--text)", fontWeight: 700 }}>
            Objetivo general
          </h2>
          <p style={{ margin: 0, color: "var(--text)", lineHeight: 1.6 }}>
            Brindar una herramienta web sencilla y accesible que permita
            <b> ajustar modelos de regresión lineal</b> con datos ingresados en
            tabla o leídos desde Excel, mostrando <b>ecuaciones</b>,
            <b> indicadores de ajuste</b> y <b>gráficas</b> claras para facilitar
            la interpretación.
          </p>
        </section>

        <section className="section">
          <h2 style={{ marginTop: 0, fontSize: 18, color: "var(--text)", fontWeight: 700 }}>
            ¿A quién está dirigida?
          </h2>
          <p style={{ margin: 0, color: "var(--text)", lineHeight: 1.6 }}>
            Estudiantes, docentes e investigadores que necesitan realizar
            análisis de <b>regresión simple</b> (una X) y <b>múltiple</b> (varias X),
            sin depender de software pesado. Ideal para prácticas, reportes y
            proyectos académicos.
          </p>
        </section>

        <section className="section">
          <h2 style={{ marginTop: 0, fontSize: 18, color: "var(--text)", fontWeight: 700 }}>
            ¿Qué puedes hacer?
          </h2>
          <ul style={{ margin: 0, paddingLeft: 18, color: "var(--text)", lineHeight: 1.6 }}>
            <li>Cargar datos desde Excel o ingresarlos en una tabla.</li>
            <li>
              Obtener la <b>ecuación</b>, <b>r²</b>, <b>r² ajustado</b> y
              coeficientes.
            </li>
            <li>
              Visualizar <b>gráfica</b> (simple) y tablas/diagnósticos (múltiple).
            </li>
          </ul>
          
          <div style={{ marginTop: 24, textAlign: "center", color: "var(--muted)", fontSize: 14 }}>
            <p style={{ margin: "4px 0" }}><strong>Año de creación:</strong> 2025</p>
            <p style={{ margin: "4px 0" }}><strong>Instituto:</strong> Facultad de Ingeniería</p>
          </div>
        </section>
      </div>
    </div>
  );
}