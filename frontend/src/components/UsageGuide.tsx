export default function UsageGuide() {
  return (
    <div className="card" style={{ maxWidth: 1000, margin: "0 auto", textAlign: "left" }}>
      <h1 style={{ fontSize: "28px", marginBottom: "12px", textAlign: "center" }}>
        📘 Guía de uso: Análisis de Regresiones
      </h1>

      <p>
        Esta aplicación permite realizar <b>análisis de regresión simple</b> y
        <b> múltiple</b>, ya sea ingresando los datos manualmente en una tabla
        o cargándolos desde un archivo Excel. A continuación se explican las
        secciones de la página y cómo interpretar los resultados.
      </p>

      <h2 style={{ marginTop: "20px" }}>🔹 Regresión Lineal Simple</h2>
      <p>
        Se usa cuando tenemos <b>una variable independiente (X)</b> y una{" "}
        <b>dependiente (Y)</b>. El resultado es una <b>recta</b> de la forma:
      </p>
      <pre style={{ background: "#0c1330", padding: "10px", borderRadius: "8px", color: "#22c55e" }}>
        y = b₀ + b₁·x
      </pre>
      <ul>
        <li><b>b₀</b>: Intercepto (valor de Y cuando X=0).</li>
        <li><b>b₁</b>: Pendiente (cuánto cambia Y por cada aumento de 1 en X).</li>
        <li><b>r²</b>: Mide qué tan bien la recta se ajusta a los datos (1 = ajuste perfecto).</li>
      </ul>
      <p>
        En la pestaña <b>Tabla</b> puedes ingresar los datos manualmente, ver la
        ecuación obtenida, los indicadores (r², n) y la gráfica de los puntos
        junto con la recta.
      </p>

      <h2 style={{ marginTop: "20px" }}>🔹 Regresión Lineal Múltiple</h2>
      <p>
        Se usa cuando tenemos <b>más de una variable independiente</b> (X₁, X₂,
        …). El modelo busca la combinación lineal que mejor explique Y:
      </p>
      <pre style={{ background: "#0c1330", padding: "10px", borderRadius: "8px", color: "#22c55e" }}>
        y = b₀ + b₁·x₁ + b₂·x₂ + ... + bₙ·xₙ
      </pre>
      <ul>
        <li>
          Cada <b>bᵢ</b> indica cuánto aporta esa variable al valor de Y, manteniendo
          las demás constantes.
        </li>
        <li>
          <b>R² ajustado</b> se usa aquí porque penaliza por usar más variables.
        </li>
      </ul>
      <p>
        En la pestaña <b>Excel</b> puedes cargar un archivo con los datos, elegir
        la columna de Y y las columnas de X, y el programa devuelve la ecuación,
        los coeficientes y las métricas de ajuste.
      </p>

      <h2 style={{ marginTop: "20px" }}>🔹 Interpretación de Resultados</h2>
      <ul>
        <li>
          <b>Ecuación:</b> fórmula que relaciona las variables.
        </li>
        <li>
          <b>Coeficientes:</b> importancia de cada variable en el modelo.
        </li>
        <li>
          <b>r²:</b> proporción de la variabilidad de Y explicada por el modelo.
        </li>
        <li>
          <b>n:</b> cantidad de datos usados.
        </li>
        <li>
          <b>Gráfica:</b> muestra los puntos observados y la recta de regresión
          (solo en el caso de una X).
        </li>
      </ul>

      <h2 style={{ marginTop: "20px" }}>🔹 Flujo de uso</h2>
      <ol>
        <li>Ve a la pestaña <b>Tabla</b> si quieres probar con pocos datos a mano.</li>
        <li>Ve a la pestaña <b>Excel</b> si tienes conjuntos de datos grandes.</li>
        <li>Interpreta la ecuación y los indicadores para evaluar tu modelo.</li>
      </ol>
    </div>
  )
}
