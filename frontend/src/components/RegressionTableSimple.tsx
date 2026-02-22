// src/components/RegressionTableSimple.tsx
import { useEffect, useMemo, useRef, useState } from 'react'
import {
  ComposedChart,
  CartesianGrid,
  XAxis,
  YAxis,
  Tooltip,
  Scatter,
  Line,
  ReferenceDot,
  ResponsiveContainer,
} from 'recharts'
import * as XLSX from 'xlsx'

const API_BASE = 'http://localhost:8000'

type Row = { x: string; y: string; x2?: string }

export default function RegressionTableSimple() {
  const [rows, setRows] = useState<Row[]>([
    { x: '1', y: '0.7' },
    { x: '2', y: '0.6' },
    { x: '3', y: '0.7' },
    { x: '4', y: '0.5' },
  ])
  const [useX2, setUseX2] = useState(false)
  const [fitIntercept, setFitIntercept] = useState(true)
  const [result, setResult] = useState<any>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  const [loaded, setLoaded] = useState(false)
  const saveTimer = useRef<number | null>(null)
  const chartRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    ;(async () => {
      try {
        await fetch(`${API_BASE}/api/session`, { credentials: 'include' })
        const res = await fetch(`${API_BASE}/api/state/table`, { credentials: 'include' })
        const data = await res.json()
        if (data?.exists) {
          try {
            const parsed: any = JSON.parse(data.rows_json || '[]')
            if (Array.isArray(parsed) && parsed.length > 0) {
              setRows(parsed as Row[])
              setUseX2(parsed.some((r) => (r?.x2 ?? '') !== ''))
            }
          } catch {}
          setFitIntercept(!!data.fit_intercept)
        }
      } catch {
      } finally {
        setLoaded(true)
      }
    })()
  }, [])

  useEffect(() => {
    if (!loaded) return
    const payload = { rows_json: JSON.stringify(rows), fit_intercept: fitIntercept }
    if (saveTimer.current) window.clearTimeout(saveTimer.current)
    saveTimer.current = window.setTimeout(() => {
      fetch(`${API_BASE}/api/state/table`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(payload),
      }).catch(() => {})
    }, 500)
    return () => { if (saveTimer.current) window.clearTimeout(saveTimer.current) }
  }, [rows, fitIntercept, loaded])

  const onLoadExcel = async (file: File | null) => {
    if (!file) return
    try {
      const buf = await file.arrayBuffer()
      const wb = XLSX.read(new Uint8Array(buf), { type: 'array' })
      const ws = wb.Sheets[wb.SheetNames[0]]
      const raw: any[] = XLSX.utils.sheet_to_json(ws, { defval: null })

      const out: Row[] = []
      for (const r of raw) {
        const norm: Record<string, any> = {}
        for (const k of Object.keys(r)) norm[k.toString().trim().toLowerCase()] = r[k]
        const yv = norm['y']
        const x1v = norm['x'] ?? norm['x1']
        const x2v = norm['x2']
        if (yv !== undefined && x1v !== undefined) {
          out.push({
            x: String(x1v ?? ''),
            y: String(yv ?? ''),
            x2: x2v !== undefined && x2v !== null ? String(x2v) : '',
          })
        }
      }

      if (out.length > 0) {
        setRows(out)
        setUseX2(out.some(r => (r.x2 ?? '') !== ''))
        setResult(null)
      } else {
        setError('Excel inválido. Usa encabezados: y, x (o x1) y opcional x2.')
      }
    } catch {
      setError('No se pudo leer el Excel. Asegúrate de subir .xlsx con columnas: y, x (o x1) y opcional x2.')
    }
  }

  const data = useMemo(
    () => rows
      .map((r) => ({ x: Number(r.x), y: Number(r.y) }))
      .filter((p) => Number.isFinite(p.x) && Number.isFinite(p.y)),
    [rows],
  )

  // Valores estimados Ŷ para regresión simple (automáticos, no editables)
  const yhatValues = useMemo(() => {
    if (!result || useX2) return rows.map(() => '')
    const b0 = Number(result?.coefficients?.intercept ?? 0)
    const b1 = Number(result?.coefficients?.x1 ?? 0)
    return rows.map((r) => {
      const xv = Number(r.x)
      if (!Number.isFinite(xv)) return ''
      const yh = (fitIntercept ? b0 : 0) + b1 * xv
      return Number.isFinite(yh) ? yh.toFixed(4) : ''
    })
  }, [rows, result, useX2, fitIntercept])

  const onChangeCell = (i: number, key: 'x' | 'y' | 'x2', val: string) =>
    setRows((prev) => prev.map((r, idx) => (idx === i ? { ...r, [key]: val } : r)))

  const addRow = () => setRows((prev) => [...prev, { x: '', y: '', x2: '' }])
  const removeRow = (i: number) => setRows((prev) => prev.filter((_, idx) => idx !== i))
  const clear = () => setRows([{ x: '', y: '', x2: '' }])

  const onCalculate = async () => {
    setError(null); setResult(null); setLoading(true)
    try {
      const yArr: number[] = []
      const x1Arr: number[] = []
      const x2Arr: number[] = []
      for (const r of rows) {
        const x1 = Number(r.x), y = Number(r.y), x2 = Number(r.x2)
        if (!Number.isFinite(x1) || !Number.isFinite(y)) continue
        if (useX2 && !Number.isFinite(x2)) continue
        yArr.push(y); x1Arr.push(x1); if (useX2) x2Arr.push(x2)
      }
      if (yArr.length < 2) throw new Error('Agrega al menos 2 filas válidas')

      const X: any = { x1: x1Arr }
      if (useX2) {
        if (x2Arr.length !== yArr.length) throw new Error('Completa X2 con números para todas las filas usadas.')
        X['x2'] = x2Arr
      }

      const resp = await fetch(`${API_BASE}/api/regression/json`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ y: yArr, X, fit_intercept: fitIntercept }),
      })
      const json = await resp.json()
      if (!resp.ok) throw new Error(json.error || 'Error desconocido')
      setResult(json)
    } catch (e: any) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }

  const linePoints = useMemo(() => {
    // Show line only when fitIntercept is enabled (requested behavior)
    if (!result || useX2 || !fitIntercept) return [] as { x: number; y: number }[]
    const b0 = Number(result?.coefficients?.intercept ?? 0)
    const b1 = Number(result?.coefficients?.x1 ?? 0)
    const xs = data.map((d) => d.x)
    if (xs.length === 0) return []
    let minX = Math.min(...xs), maxX = Math.max(...xs)
    if (fitIntercept) { minX = Math.min(0, minX); maxX = Math.max(0, maxX) }
    const pad = (maxX - minX) * 0.05
    minX -= pad; maxX += pad
    const f = (x: number) => (fitIntercept ? b0 : 0) + b1 * x
    return [{ x: minX, y: f(minX) }, { x: maxX, y: f(maxX) }]
  }, [result, data, fitIntercept, useX2])

  const xDomain = useMemo((): [number, number] | undefined => {
    if (data.length === 0 || useX2 || !result) return undefined
    const xs = data.map((d) => d.x)
    let minX = Math.min(...xs), maxX = Math.max(...xs)
    if (fitIntercept) { minX = Math.min(0, minX); maxX = Math.max(0, maxX) }
    const pad = (maxX - minX) * 0.05
    return [minX - pad, maxX + pad]
  }, [data, useX2, result, fitIntercept])

  const equation = useMemo(() => {
    if (!result) return ''
    if (!useX2) {
      const b0 = Number(result?.coefficients?.intercept ?? 0)
      const b1 = Number(result?.coefficients?.x1 ?? 0)
      const b0s = b0.toFixed(4)
      const b1s = b1 >= 0 ? `+ ${b1.toFixed(4)}·x` : `- ${Math.abs(b1).toFixed(4)}·x`
      return fitIntercept ? `y = ${b0s} ${b1s}` : `y = ${b1.toFixed(4)}·x`
    } else {
      const c = result.coefficients || {}
      const b0 = c.intercept !== undefined ? Number(c.intercept).toFixed(4) : ''
      const b1 = Number(c.x1 ?? 0)
      const b2 = Number(c.x2 ?? 0)
      const t1 = `${b1 >= 0 ? '+' : '-'} ${Math.abs(b1).toFixed(4)}·x₁`
      const t2 = `${b2 >= 0 ? '+' : '-'} ${Math.abs(b2).toFixed(4)}·x₂`
      return b0 ? `y = ${b0} ${t1} ${t2}` : `y = ${t1} ${t2}`
    }
  }, [result, fitIntercept, useX2])

  const exportExcel = () => {
    try {
      const wb = XLSX.utils.book_new()

      // 1) Hoja Resumen (métricas + ecuación)
      const resumenAOA: any[] = []
      resumenAOA.push(["Regresión", useX2 ? "Múltiple" : "Simple"]) 
      resumenAOA.push(["Intercepto", fitIntercept ? "Sí" : "No"]) 
      resumenAOA.push(["Ecuación", equation || (result ? "" : "(calcula para ver ecuación)")])
      if (result) {
        resumenAOA.push([])
        resumenAOA.push(["Métrica", "Valor"]) 
        resumenAOA.push(["r2", Number(result.r2)])
        resumenAOA.push(["r2_ajustado", Number(result.adj_r2)])
        resumenAOA.push(["n", Number(result.n)])
        if (typeof result.sse !== 'undefined') resumenAOA.push(["sse", Number(result.sse)])
        if (typeof result.sigma2 !== 'undefined') resumenAOA.push(["sigma2", Number(result.sigma2)])

        // También incluir tabla de coeficientes aquí para que sea visible en la primera hoja
        resumenAOA.push([])
        resumenAOA.push(["Coeficientes"]) 
        resumenAOA.push(["variable", "coeficiente", "error_std", "t"]) 
        const ordered = ([...(result?.coefficients?.intercept !== undefined ? ['intercept'] : []), ...Object.keys(result?.coefficients || {}).filter(k => k !== 'intercept')])
        for (const k of ordered) {
          const coef = Number(result.coefficients?.[k] ?? '')
          const se = Number(result.std_errors?.[k] ?? '')
          const t = Number(result.t_stats?.[k] ?? '')
          resumenAOA.push([k, coef, se, t])
        }
      }
      const wsResumen = XLSX.utils.aoa_to_sheet(resumenAOA)
      wsResumen['!cols'] = [{ wch: 16 }, { wch: 60 }]
      XLSX.utils.book_append_sheet(wb, wsResumen, 'Resumen')

      // 2) Hoja Coeficientes (coef, error std, t)
      const coefAOA: any[] = [["variable", "coeficiente", "error_std", "t"]]
      if (result) {
        const ordered = ([...(result?.coefficients?.intercept !== undefined ? ['intercept'] : []), ...Object.keys(result?.coefficients || {}).filter(k => k !== 'intercept')])
        for (const k of ordered) {
          const coef = Number(result.coefficients?.[k] ?? '')
          const se = Number(result.std_errors?.[k] ?? '')
          const t = Number(result.t_stats?.[k] ?? '')
          coefAOA.push([k, coef, se, t])
        }
      }
      const wsCoef = XLSX.utils.aoa_to_sheet(coefAOA)
      wsCoef['!cols'] = [{ wch: 16 }, { wch: 16 }, { wch: 16 }, { wch: 16 }]
      XLSX.utils.book_append_sheet(wb, wsCoef, 'Coeficientes')

      // 3) Hoja Datos
      const headers = useX2 ? ['X1', 'X2', 'Y'] : ['X1', 'Y']
      const rowsOut: any[] = [headers]
      for (const r of rows) rowsOut.push(useX2 ? [r.x, r.x2 ?? '', r.y] : [r.x, r.y])
      const wsData = XLSX.utils.aoa_to_sheet(rowsOut)
      wsData['!cols'] = headers.map(() => ({ wch: 14 }))
      XLSX.utils.book_append_sheet(wb, wsData, 'Datos')

      // 4) Hoja Grafica (series para crear gráfico en Excel)
      const chartAOA: any[] = [["x", "y"]]
      for (const p of data) chartAOA.push([p.x, p.y])
      if (fitIntercept && linePoints.length === 2) {
        chartAOA.push([])
        chartAOA.push(["line_x", "line_y"]) 
        chartAOA.push([linePoints[0].x, linePoints[0].y])
        chartAOA.push([linePoints[1].x, linePoints[1].y])
        chartAOA.push([])
        chartAOA.push(["intercepto_x", "intercepto_y"]) 
        chartAOA.push([0, Number(result?.coefficients?.intercept ?? 0)])
      }
      const wsChart = XLSX.utils.aoa_to_sheet(chartAOA)
      wsChart['!cols'] = [{ wch: 16 }, { wch: 16 }]
      XLSX.utils.book_append_sheet(wb, wsChart, 'GraficaDatos')

      const fname = useX2 ? 'regresion_multiple.xlsx' : 'regresion_simple.xlsx'
      XLSX.writeFile(wb, fname)
    } catch (e) {
      console.warn('Excel export error:', e)
    }
  }

  const downloadChartPNG = async () => {
    try {
      const el = chartRef.current
      if (!el) return
      const svg = el.querySelector('svg') as SVGSVGElement | null
      if (!svg) return
      const serializer = new XMLSerializer()
      const src = serializer.serializeToString(svg)
      const svg64 = typeof btoa !== 'undefined' ? btoa(unescape(encodeURIComponent(src))) : ''
      const img = new Image()
      const url = 'data:image/svg+xml;base64,' + svg64
      const vb = svg.viewBox && svg.viewBox.baseVal ? svg.viewBox.baseVal : null
      const bbox = svg.getBoundingClientRect()
      const width = vb ? vb.width : Math.max(1, Math.round(bbox.width))
      const height = vb ? vb.height : Math.max(1, Math.round(bbox.height))
      const canvas = document.createElement('canvas')
      canvas.width = width; canvas.height = height
      const ctx = canvas.getContext('2d')!
      await new Promise<void>((resolve) => { img.onload = () => resolve(); img.src = url })
      ctx.drawImage(img, 0, 0, width, height)
      const pngUrl = canvas.toDataURL('image/png')
      const a = document.createElement('a')
      a.href = pngUrl
      a.download = 'grafica_regresion.png'
      document.body.appendChild(a); a.click(); a.remove()
    } catch (e) {
      console.warn('PNG export error:', e)
    }
  }

  return (
    <div style={{ display: 'grid', gap: 16 }}>
      {/* Controles de tabla */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
        <button className="btn secondary" onClick={addRow}>+ Fila</button>
        <button className="btn secondary" onClick={clear}>Limpiar</button>
      </div>
      {/* Opción de cargar Excel removida a petición */}

      {/* TABLA */}
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>X₁</th>
              {useX2 && <th>X₂</th>}
              <th>Y</th>
              {!useX2 && <th>Ŷ</th>}
              <th />
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => (
              <tr key={i}>
                <td><input value={r.x} onChange={(e) => onChangeCell(i, 'x', e.target.value)} placeholder={'x₁, ej. 1'} /></td>
                {useX2 && (
                  <td><input value={r.x2 ?? ''} onChange={(e) => onChangeCell(i, 'x2', e.target.value)} placeholder="x₂, ej. 2.5" /></td>
                )}
                <td><input value={r.y} onChange={(e) => onChangeCell(i, 'y', e.target.value)} placeholder="ej. 0.7" /></td>
                {!useX2 && (
                  <td><input value={yhatValues[i] ?? ''} readOnly placeholder="—" /></td>
                )}
                <td><button className="btn secondary" onClick={() => removeRow(i)}>Eliminar</button></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Opciones + Calcular */}
      <div className="toggle-card-group">
        <button
          className={`toggle-card ${useX2 ? 'active' : ''}`}
          type="button"
          onClick={() => { setUseX2(v => !v); setResult(null); }}
          title="Usar X₂ (opcional)"
        >
          <svg width="36" height="20" viewBox="0 0 36 20" fill="none" xmlns="http://www.w3.org/2000/svg">
            <rect x="4" y="6" width="6" height="8" rx="2" fill="#93c5fd"/>
            <rect x="15" y="4" width="6" height="12" rx="2" fill="#60a5fa"/>
            <rect x="26" y="2" width="6" height="16" rx="2" fill="#2563eb"/>
          </svg>
          <span>Usar X₂</span>
        </button>
        <button
          className={`toggle-card ${fitIntercept ? 'active' : ''}`}
          type="button"
          onClick={() => { setFitIntercept(v => !v); setResult(null); }}
          title="Agregar intercepto"
        >
          <svg width="36" height="20" viewBox="0 0 36 20" fill="none" xmlns="http://www.w3.org/2000/svg">
            <line x1="1" y1="19" x2="35" y2="5" stroke="#2563eb" strokeWidth="3"/>
            <circle cx="4" cy="14" r="3" fill="#22c55e" />
            <line x1="4" y1="2" x2="4" y2="18" stroke="#94a3b8" strokeWidth="1"/>
          </svg>
          <span>Intercepto</span>
        </button>
      </div>
      <button className="btn" onClick={onCalculate} disabled={loading}>
        {loading ? 'Calculando…' : 'Calcular'}
      </button>

      {error && <div style={{ color: 'var(--danger)', fontWeight: 600 }}>⚠️ {error}</div>}

      {/* Resultados */}
      {result && (
        <div style={{ display: 'grid', gap: 16 }}>
          <div
            style={{
              fontSize: 22, fontWeight: 700, padding: '10px 14px',
              borderRadius: 12, background: '#0c1330', border: '1px solid var(--border)',
              boxShadow: '0 6px 20px rgba(0,0,0,.25)', color: '#22c55e', textAlign: 'center',
            }}
          >
            Ecuación: {equation}
          </div>

          <div className="kpi">
            <span className="pill"><b>r²:</b> {Number(result.r2).toFixed(4)}</span>
            <span className="pill"><b>R² ajustado:</b> {Number(result.adj_r2).toFixed(4)}</span>
            {(!useX2 && result?.t_stats && (result.t_stats.x1 !== undefined)) && (
              <span className="pill"><b>t:</b> {Number(result.t_stats.x1).toFixed(4)}</span>
            )}
            <span className="pill"><b>n:</b> {result.n}</span>
          </div>

          {/* Tabla de coeficientes (siempre visible) */}
          <div className="table-wrap">
            <table className="table-small">
              <thead>
                <tr><th>Variable</th><th>Coeficiente</th><th>t</th></tr>
              </thead>
              <tbody>
                {([
                  ...(result?.coefficients?.intercept !== undefined ? ['intercept'] : []),
                  ...Object.keys(result?.coefficients || {}).filter((k) => k !== 'intercept'),
                ]).map((k) => (
                  <tr key={k}>
                    <td>{k}</td>
                    <td>{Number(result.coefficients[k]).toFixed(6)}</td>
                    <td>{result?.t_stats && result.t_stats[k] !== undefined ? Number(result.t_stats[k]).toFixed(4) : ''}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          

          {!useX2 && (
            <div className="chart" ref={chartRef}>
              <ResponsiveContainer>
                <ComposedChart margin={{ top: 10, right: 24, left: 8, bottom: 10 }}>
                  <defs>
                    <linearGradient id="regLine" x1="0" y1="0" x2="1" y2="0">
                      <stop offset="0%" stopColor="#60a5fa" />
                      <stop offset="100%" stopColor="#2563eb" />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                  <XAxis
                    type="number"
                    dataKey="x"
                    name="X"
                    domain={xDomain as any}
                    tick={{ fill: '#64748b' }}
                    axisLine={{ stroke: '#cbd5e1' }}
                    tickLine={false}
                  />
                  <YAxis
                    type="number"
                    dataKey="y"
                    name="Y"
                    tick={{ fill: '#64748b' }}
                    axisLine={{ stroke: '#cbd5e1' }}
                    tickLine={false}
                  />
                  <Tooltip
                    cursor={{ strokeDasharray: '3 3' }}
                    formatter={(v: any) => (typeof v === 'number' ? v.toFixed(4) : v)}
                    labelFormatter={(l: any) => (typeof l === 'number' ? `x = ${l.toFixed(4)}` : l)}
                    contentStyle={{ borderRadius: 12, border: '1px solid #e2e8f0', boxShadow: '0 6px 20px rgba(0,0,0,.08)' }}
                  />
                  <Scatter data={data} name="Datos" fill="#2563eb" fillOpacity={0.9} stroke="#ffffff" strokeWidth={1} />
                  {fitIntercept && linePoints.length === 2 && (
                    <Line type="linear" data={linePoints} dataKey="y" stroke="url(#regLine)" strokeWidth={3.5} dot={false} />
                  )}
                  {fitIntercept && result?.coefficients?.intercept !== undefined && (
                    <ReferenceDot x={0} y={Number(result.coefficients.intercept)} r={4} fill="#22c55e" stroke="#0c1330" ifOverflow="discard" />
                  )}
                </ComposedChart>
              </ResponsiveContainer>
            </div>
          )}

          {useX2 && null}

          {/* Exportar */}
          <div style={{ display: 'grid', gridTemplateColumns: !useX2 ? '1fr 1fr' : '1fr', gap: 12 }}>
            <button className="btn secondary" onClick={exportExcel}>Descargar Excel (.xlsx)</button>
            {!useX2 && <button className="btn secondary" onClick={downloadChartPNG}>Descargar Gráfica (PNG)</button>}
          </div>
        </div>
      )}
    </div>
  )
}
