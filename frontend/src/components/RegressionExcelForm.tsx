import { useEffect, useMemo, useRef, useState } from 'react'
import { ScatterChart, CartesianGrid, XAxis, YAxis, Tooltip, Scatter, ResponsiveContainer } from 'recharts'
import * as XLSX from 'xlsx'

const API_BASE = 'http://localhost:8000'

type Point = { x: number; y: number }

function varToSub(v: string) {
  const m = v.match(/^([a-zA-Z]+)(\d+)$/)
  if (!m) return v
  const [_, name, digits] = m
  const map = 'â‚€â‚â‚‚â‚ƒâ‚„â‚…â‚†â‚‡â‚ˆâ‚‰'
  const sub = digits.split('').map(d => map['0123456789'.indexOf(d)]).join('')
  return `${name}${sub}`
}

export default function RegressionExcelForm() {
  const [file, setFile] = useState<File | null>(null)
  const [yColumn, setYColumn] = useState('y')
  const [xColumns, setXColumns] = useState('x1,x2')
  const [fitIntercept, setFitIntercept] = useState(true)

  const [loading, setLoading] = useState(false)
  // Mantengo el estado de error por si lo necesitas internamente, pero ya NO lo muestro
  const [error, setError] = useState<string | null>(null)
  const [result, setResult] = useState<any>(null)

  const [loaded, setLoaded] = useState(false)
  const [serverHasFile, setServerHasFile] = useState(false)
  const [points, setPoints] = useState<Point[]>([])
  // Tabla manual
  const [manualRows, setManualRows] = useState<Record<string, string>[]>([])
  const manualSchemaKey = `${yColumn}|${xColumns}`
  // Fuente de cÃ¡lculo: archivo o tabla
  const [calcSource, setCalcSource] = useState<'file' | 'table'>('file')
  const yHatSymbol = '\u0177'

  const fileInputRef = useRef<HTMLInputElement | null>(null)

  useEffect(() => {
    (async () => {
      try {
        await fetch(`${API_BASE}/api/session`, { credentials: 'include' })
        const sres = await fetch(`${API_BASE}/api/state/excel`, { credentials: 'include' })
        const sdata = await sres.json()
        if (sdata?.exists) {
          if (typeof sdata.y_column === 'string') setYColumn(sdata.y_column || 'y')
          if (Array.isArray(sdata.x_columns)) setXColumns(sdata.x_columns.join(','))
          setFitIntercept(!!sdata.fit_intercept)
          if (sdata.has_file) setServerHasFile(true)
        }
        const rres = await fetch(`${API_BASE}/api/state/excel/result`, { credentials: 'include' })
        const rdata = await rres.json()
        if (rdata?.exists && rdata.result) setResult(rdata.result)
      } catch {
        // ignore
      } finally {
        setLoaded(true)
      }
    })()
  }, [])

  // Decide una fuente inicial cuando hay datos
  useEffect(() => {
    if (file) setCalcSource('file')
    else if (serverHasFile) setCalcSource('file')
    else if (manualRows.length > 0) setCalcSource('table')
  }, [file, serverHasFile, manualRows.length])

  // Cargar filas manuales desde localStorage por esquema
  useEffect(() => {
    try {
      const raw = localStorage.getItem('excel_manual_rows')
      if (raw) {
        const parsed = JSON.parse(raw)
        if (parsed && parsed.schema === manualSchemaKey && Array.isArray(parsed.rows)) {
          setManualRows(parsed.rows)
        }
      }
    } catch {}
  }, [manualSchemaKey])

  // Guardar filas manuales
  useEffect(() => {
    try {
      const payload = { schema: manualSchemaKey, rows: manualRows }
      localStorage.setItem('excel_manual_rows', JSON.stringify(payload))
    } catch {}
  }, [manualRows, manualSchemaKey])

  // Guardar params (debounced)
  const saveTimer = useRef<number | null>(null)
  useEffect(() => {
    if (!loaded) return
    const payload = {
      y_column: yColumn.trim(),
      x_columns: xColumns.split(',').map(s => s.trim()).filter(Boolean),
      fit_intercept: fitIntercept,
    }
    if (saveTimer.current) window.clearTimeout(saveTimer.current)
    saveTimer.current = window.setTimeout(() => {
      fetch(`${API_BASE}/api/state/excel`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(payload),
      }).catch(() => {})
    }, 500)
    return () => { if (saveTimer.current) window.clearTimeout(saveTimer.current) }
  }, [yColumn, xColumns, fitIntercept, loaded])

  // Â¿solo 1 X? => grÃ¡fica local
  const singleX = useMemo(() => {
    const xs = xColumns.split(',').map(s => s.trim()).filter(Boolean)
    return xs.length === 1 ? xs[0] : null
  }, [xColumns])

  // Lee el archivo local para graficar
  useEffect(() => {
    if (!file || !singleX) { setPoints([]); return }
    const reader = new FileReader()
    reader.onload = (e) => {
      try {
        const data = new Uint8Array(e.target?.result as ArrayBuffer)
        const wb = XLSX.read(data, { type: 'array' })
        const ws = wb.Sheets[wb.SheetNames[0]]
        const rows: any[] = XLSX.utils.sheet_to_json(ws, { defval: null })
        const pts: Point[] = []
        for (const r of rows) {
          const xv = Number(r[singleX])
          const yv = Number(r[yColumn])
          if (Number.isFinite(xv) && Number.isFinite(yv)) pts.push({ x: xv, y: yv })
        }
        setPoints(pts)
      } catch { setPoints([]) }
    }
    reader.readAsArrayBuffer(file)
  }, [file, singleX, yColumn])

  // Helpers para la tabla manual
  const xList = useMemo(() => xColumns.split(',').map(s => s.trim()).filter(Boolean), [xColumns])
  const computeFromManual = async () => {
    const xs = xList
    const yArr: number[] = []
    const X: Record<string, number[]> = {}
    xs.forEach((x) => (X[x] = []))
    for (const r of manualRows) {
      const yv = Number(r[yColumn])
      if (!Number.isFinite(yv)) continue
      let ok = true
      const vals: number[] = []
      for (const x of xs) {
        const xv = Number(r[x])
        if (!Number.isFinite(xv)) { ok = false; break }
        vals.push(xv)
      }
      if (!ok) continue
      yArr.push(yv)
      xs.forEach((x, i) => X[x].push(vals[i]))
    }
    if (yArr.length < 2) throw new Error('Agrega al menos 2 filas vÃ¡lidas')
    const resp = await fetch(`${API_BASE}/api/regression/json`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'include',
      body: JSON.stringify({ y: yArr, X, fit_intercept: fitIntercept }),
    })
    const json = await resp.json()
    if (!resp.ok) throw new Error(json.error || 'Error desconocido')
    setResult(json)
    if (xList.length === 1) {
      const pts: Point[] = []
      manualRows.forEach(r => {
        const xv = Number(r[xList[0]]), yv = Number(r[yColumn])
        if (Number.isFinite(xv) && Number.isFinite(yv)) pts.push({ x: xv, y: yv })
      })
      setPoints(pts)
    }
  }
  const addXColumn = () => {
    const xs = xList
    let maxN = 0
    xs.forEach((x) => { const m = x.match(/^x(\d+)$/i); if (m) maxN = Math.max(maxN, parseInt(m[1], 10)) })
    let candidate = `x${Math.max(maxN + 1, 1)}`
    let i = 2
    while (xs.includes(candidate)) { candidate = `x${maxN + i}`; i++ }
    setXColumns(prev => {
      const arr = prev.split(',').map(s => s.trim()).filter(Boolean)
      arr.push(candidate)
      return Array.from(new Set(arr)).join(',')
    })
  }
  const removeXColumn = (name: string) => {
    if (xList.length <= 1) return // al menos una X requerida
    setXColumns(prev => prev.split(',').map(s => s.trim()).filter(Boolean).filter(x => x !== name).join(','))
    setManualRows(prev => prev.map(r => { const { [name]: _, ...rest } = r; return rest }))
  }
  useEffect(() => {
    // cuando cambie el esquema, normalizar las filas existentes a nuevas columnas
    setManualRows((rows) => rows.map(r => {
      const next: Record<string, string> = {}
      for (const k of [...xList, yColumn]) next[k] = (r[k] ?? '')
      return next
    }))
  }, [xList.join(','), yColumn])

  const addManualRow = () => setManualRows(prev => {
    const row: Record<string, string> = {}
    for (const k of [...xList, yColumn]) row[k] = ''
    const next = [...prev, row]
    // Si el usuario empieza a usar la tabla, elegimos esa fuente
    setCalcSource('table')
    return next
  })
  const removeManualRow = (i: number) => setManualRows(prev => prev.filter((_, idx) => idx !== i))
  const clearManual = () => setManualRows([])

  const onChangeManual = (i: number, key: string, val: string) =>
    setManualRows(prev => prev.map((r, idx) => idx === i ? { ...r, [key]: val } : r))

  const onCalculateManual = async () => {
    try {
      setResult(null); setError(null); setLoading(true)
      const yArr: number[] = []
      const X: Record<string, number[]> = {}
      for (const x of xList) X[x] = []
      for (const r of manualRows) {
        const yv = Number(r[yColumn])
        if (!Number.isFinite(yv)) continue
        let ok = true
        const xvals: number[] = []
        for (const x of xList) {
          const xv = Number(r[x])
          if (!Number.isFinite(xv)) { ok = false; break }
          xvals.push(xv)
        }
        if (!ok) continue
        yArr.push(yv)
        xList.forEach((x, idx) => X[x].push(xvals[idx]))
      }
      if (yArr.length < 2) throw new Error('Agrega al menos 2 filas vÃ¡lidas')
      const resp = await fetch(`${API_BASE}/api/regression/json`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'include',
        body: JSON.stringify({ y: yArr, X, fit_intercept: fitIntercept }),
      })
      const json = await resp.json()
      if (!resp.ok) throw new Error(json.error || 'Error desconocido')
      setResult(json)
      // Si es una sola X, arma puntos para graficar
      if (xList.length === 1) {
        const pts: Point[] = []
        manualRows.forEach(r => {
          const xv = Number(r[xList[0]]), yv = Number(r[yColumn])
          if (Number.isFinite(xv) && Number.isFinite(yv)) pts.push({ x: xv, y: yv })
        })
        setPoints(pts)
      }
    } catch (e: any) {
      setError(e.message)
    } finally { setLoading(false) }
  }

  // Recalcular con archivo del servidor (si no hay local)
  const recalcTimer = useRef<number | null>(null)
  useEffect(() => {
    if (!loaded || !serverHasFile || file) return
    if (recalcTimer.current) window.clearTimeout(recalcTimer.current)
    recalcTimer.current = window.setTimeout(async () => {
      try {
        setLoading(true); setError(null)
        const fd = new FormData()
        fd.append('y_column', yColumn.trim())
        fd.append('x_columns', xColumns.trim())
        fd.append('fit_intercept', String(fitIntercept))
        const resp = await fetch(`${API_BASE}/api/regression/excel/reuse`, {
          method: 'POST',
          body: fd,
          credentials: 'include',
        })
        const json = await resp.json()
        if (!resp.ok) throw new Error(json.error || 'Error desconocido')
        setResult(json)
        setServerHasFile(true)
      } catch (err: any) {
        setError(err.message)
        setServerHasFile(false)
      } finally {
        setLoading(false)
      }
    }, 600)
    return () => { if (recalcTimer.current) window.clearTimeout(recalcTimer.current) }
  }, [loaded, serverHasFile, file, yColumn, xColumns, fitIntercept])

  const ready = useMemo(
    () => yColumn.trim().length > 0 && xColumns.trim().length > 0 && !loading,
    [yColumn, xColumns, loading]
  )

  // BotÃ³n calcular
  const onCalculate = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!ready) return
    // Calcula segÃºn la fuente seleccionada

    setLoading(true); setError(null)
    try {
      if (calcSource === 'file') {
        if (!file && !serverHasFile) throw new Error('Selecciona un archivo o cambia a "Tabla"')
        if (file) {
          const fd = new FormData()
          fd.append('file', file)
          fd.append('y_column', yColumn.trim())
          fd.append('x_columns', xColumns.trim())
          fd.append('fit_intercept', String(fitIntercept))
          const resp = await fetch(`${API_BASE}/api/regression/excel`, { method: 'POST', body: fd, credentials: 'include' })
          const json = await resp.json()
          if (!resp.ok) throw new Error(json.error || 'Error desconocido')
          setResult(json)
          setServerHasFile(true)
        } else if (serverHasFile) {
          const fd = new FormData()
          fd.append('y_column', yColumn.trim())
          fd.append('x_columns', xColumns.trim())
          fd.append('fit_intercept', String(fitIntercept))
          const resp = await fetch(`${API_BASE}/api/regression/excel/reuse`, { method: 'POST', body: fd, credentials: 'include' })
          const json = await resp.json()
          if (!resp.ok) throw new Error(json.error || 'Error desconocido')
          setResult(json)
          setServerHasFile(true)
        }
      } else {
        const fd = new FormData()
        await computeFromManual()
      }
    } catch (err: any) {
      // guardamos por si quieres inspeccionarlo en consola, pero NO lo mostramos
      setError(err.message || 'error')
      console.warn('Excel calc error:', err)
    } finally {
      setLoading(false)
    }
  }

  const buttonLabel = calcSource === 'file'
    ? (file ? 'Calcular (archivo seleccionado)' : (serverHasFile ? 'Calcular (archivo guardado)' : 'Calcular (archivo)'))
    : 'Calcular (tabla)'

  const singleEquation = useMemo(() => {
    if (!result || !singleX) return ''
    const subX = varToSub(singleX)
    const b0 = Number(result?.coefficients?.intercept ?? 0)
    const b1 = Number(result?.coefficients?.[singleX] ?? 0)
    const b0s = b0.toFixed(4)
    const b1s = b1 >= 0 ? `+ ${b1.toFixed(4)}Â·${subX}` : `- ${Math.abs(b1).toFixed(4)}Â·${subX}`
    return fitIntercept ? `y = ${b0s} ${b1s}` : `y = ${b1.toFixed(4)}Â·${subX}`
  }, [result, singleX, fitIntercept])

  const multiEquation = useMemo(() => {
    if (!result) return ''
    const coeffs = result.coefficients || {}
    const terms = Object.entries(coeffs)
      .filter(([k]) => k !== 'intercept')
      .map(([k, v]) => {
        const val = Number(v)
        const sign = val >= 0 ? '+' : '-'
        return `${sign} ${Math.abs(val).toFixed(4)}Â·${k}`
      })
    const b0 = coeffs.intercept !== undefined ? Number(coeffs.intercept).toFixed(4) : ''
    return b0 ? `y = ${b0} ${terms.join(' ')}` : `y = ${terms.join(' ')}`
  }, [result])
  const coeffEntries = useMemo(() => {
    if (!result?.coefficients) return []
    const coeffs = result.coefficients as Record<string, number>
    const orderedKeys = [
      ...(coeffs.intercept !== undefined ? ['intercept'] : []),
      ...Object.keys(coeffs).filter((k) => k !== 'intercept'),
    ]
    const entries: { key: string; coef: number; yTerm: string }[] = []
    let yStarted = false
    for (const key of orderedKeys) {
      const value = Number(coeffs[key])
      let yTerm = ''
      if (Number.isFinite(value)) {
        if (key === 'intercept') {
          yTerm = `${yHatSymbol} = ${value.toFixed(4)}`
          yStarted = true
        } else if (!yStarted) {
          const abs = Math.abs(value).toFixed(4)
          const prefix = value >= 0 ? '' : '-'
          yTerm = `${yHatSymbol} = ${prefix}${abs}Â·${key}`
          yStarted = true
        } else {
          const abs = Math.abs(value).toFixed(4)
          const sign = value >= 0 ? '+' : '-'
          yTerm = `${sign} ${abs}Â·${key}`
        }
      }
      entries.push({ key, coef: value, yTerm })
    }
    return entries
  }, [result, yHatSymbol])

  const linePoints = useMemo(() => {
    if (!result || !singleX || points.length === 0) return [] as Point[]
    const b0 = Number(result?.coefficients?.intercept ?? 0)
    const b1 = Number(result?.coefficients?.[singleX] ?? 0)
    const xs = points.map(p => p.x)
    if (xs.length === 0) return []
    const minX = Math.min(...xs), maxX = Math.max(...xs)
    const f = (x: number) => (fitIntercept ? b0 : 0) + b1 * x
    return [{ x: minX, y: f(minX) }, { x: maxX, y: f(maxX) }]
  }, [result, singleX, points, fitIntercept])

  return (
    <form onSubmit={onCalculate} className="form-grid" style={{ maxWidth: 1100, margin: '0 auto' }}>
      <label>
        Archivo Excel (.xlsx)
        <div className="file-picker">
          <input
            ref={fileInputRef}
            type="file"
            accept=".xlsx"
            style={{ display: 'none' }}
            onChange={(e) => {
              const f = e.target.files?.[0] || null
              setFile(f)
              if (f) { setServerHasFile(false); setError(null) }
              if (f) setCalcSource('file')
            }}
          />
          <button
            type="button"
            className="btn secondary"
            onClick={() => fileInputRef.current?.click()}
            style={{ width: 'fit-content' }}
          >
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                <path d="M12 16V4" stroke="#2563eb" strokeWidth="2" strokeLinecap="round"/>
                <path d="M8 8L12 4L16 8" stroke="#2563eb" strokeWidth="2" strokeLinecap="round"/>
                <rect x="4" y="14" width="16" height="6" rx="2" stroke="#2563eb" strokeWidth="2"/>
              </svg>
              Seleccionar archivo (.xlsx)
            </span>
          </button>
          <div className="file-name">
            {file ? file.name : (serverHasFile ? 'Usando archivo guardado en el servidor' : 'No has seleccionado archivo')}
          </div>
        </div>
      </label>

      {/* Biblioteca eliminada para un flujo mÃ¡s simple */}

      <label>
        Columna y
        <input value={yColumn} onChange={(e) => setYColumn(e.target.value)} placeholder="y" />
      </label>

      <div>
        <div style={{ marginBottom: 6, fontWeight: 600 }}>Columnas X</div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center' }}>
          {xList.map((x) => (
            <span key={x} className="pill" style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
              {varToSub(x)}
              {xList.length > 1 && (
                <button type="button" className="btn secondary" onClick={() => removeXColumn(x)} style={{ padding: '6px 10px' }}>âœ•</button>
              )}
            </span>
          ))}
          <button type="button" className="btn secondary" onClick={addXColumn} style={{ padding: '10px 14px' }}>+ Columna X</button>
        </div>
      </div>

      <div className="toggle-card-group" style={{ gridTemplateColumns: 'auto', justifyContent: 'center' }}>
        <button
          type="button"
          className={`toggle-card ${fitIntercept ? 'active' : ''}`}
          onClick={() => setFitIntercept(v => !v)}
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

      {/* Selector de fuente de cÃ¡lculo */}
      <div className="toggle-card-group">
        <button type="button" className={`toggle-card ${calcSource === 'file' ? 'active' : ''}`} onClick={() => setCalcSource('file')}>
          Archivo
        </button>
        <button type="button" className={`toggle-card ${calcSource === 'table' ? 'active' : ''}`} onClick={() => setCalcSource('table')}>
          Tabla manual
        </button>
      </div>

      <button className="btn" disabled={!ready || (calcSource === 'file' && !file && !serverHasFile) || (calcSource === 'table' && manualRows.length === 0)}>
        {loading ? 'Calculandoâ€¦' : buttonLabel}
      </button>

      {/* Ya NO mostramos bloque de errores */}

      {result && (
        <div className={`result-grid ${!singleX ? 'multi' : 'single'}`} style={{ display: 'grid', gap: 16, marginTop: 12 }}>
          {singleX && (
            <div className="equation-pill" style={{
              fontSize: 20, fontWeight: 700, padding: '10px 14px',
              borderRadius: 12, background: '#0c1330', border: '1px solid var(--border)',
              boxShadow: '0 6px 20px rgba(0,0,0,.25)', color: '#22c55e', textAlign: 'center',
            }}>
              EcuaciÃ³n: {singleEquation}
            </div>
          )}

          {!singleX && false && (
            <div style={{
              fontSize: 20, fontWeight: 700, padding: '10px 14px',
              borderRadius: 12, background: '#0c1330', border: '1px solid var(--border)',
              boxShadow: '0 6px 20px rgba(0,0,0,.25)', color: '#22c55e', textAlign: 'center',
            }}>
              EcuaciÃ³n: {multiEquation}
            </div>
          )}

          <div className="kpi">
            <span className="pill"><b>rÂ²:</b> {Number(result.r2).toFixed(4)}</span>
            <span className="pill"><b>RÂ² ajustado:</b> {Number(result.adj_r2).toFixed(4)}</span>
            <span className="pill"><b>n:</b> {result.n}</span>
          </div>

          {singleX && points.length > 0 && (
            <div className="chart">
              <ResponsiveContainer>
                <ScatterChart>
                  <CartesianGrid />
                  <XAxis type="number" dataKey="x" name="X" />
                  <YAxis type="number" dataKey="y" name="Y" />
                  <Tooltip cursor={{ strokeDasharray: '3 3' }} />
                  <Scatter data={points} name="Datos" />
                </ScatterChart>
              </ResponsiveContainer>
            </div>
          )}

          {!singleX && (
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Variable</th>
                    <th>Coeficiente</th>
                    <th>{`Y estimada (${yHatSymbol})`}</th>
                  </tr>
                </thead>
                <tbody>
                  {coeffEntries.map(({ key, coef, yTerm }) => (
                    <tr key={key}>
                      <td>{key}</td>
                      <td>{Number.isFinite(coef) ? coef.toFixed(6) : '\u2014'}</td>
                      <td>{yTerm || '\u2014'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}



          {!singleX && (
            <div className="equation-pill" style={{
              fontSize: 20, fontWeight: 700, padding: '10px 14px',
              borderRadius: 12, background: '#0c1330', border: '1px solid var(--border)',
              boxShadow: '0 6px 20px rgba(0,0,0,.25)', color: '#22c55e', textAlign: 'center',
            }}>
              EcuaciÃ³n: {multiEquation}
            </div>
          )}
        </div>
      )}

      {/* ---------- Datos manuales ---------- */}
      <div className="section" style={{ marginTop: 28 }}>
        <h2 style={{ marginTop: 0 }}>Ingresar datos manualmente</h2>
        {/* Chips de columnas ya estÃ¡n arriba para controlar los coeficientes */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 8 }}>
          <button className="btn secondary" type="button" onClick={addManualRow}>+ Fila</button>
          <button className="btn secondary" type="button" onClick={clearManual}>Limpiar</button>
        </div>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                {xList.map((x) => (<th key={x}>{varToSub(x)}</th>))}
                <th>{varToSub(yColumn)}</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {manualRows.map((r, i) => (
                <tr key={i}>
                  {xList.map((x) => (
                    <td key={x}><input value={r[x] || ''} onChange={(e) => onChangeManual(i, x, e.target.value)} placeholder={`ej. 1`} /></td>
                  ))}
                  <td><input value={r[yColumn] || ''} onChange={(e) => onChangeManual(i, yColumn, e.target.value)} placeholder={`ej. 0.7`} /></td>
                  <td><button className="btn secondary" type="button" onClick={() => removeManualRow(i)}>Eliminar</button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {/* El cÃ¡lculo se realiza con el botÃ³n principal */}
      </div>
    </form>
  )
}
