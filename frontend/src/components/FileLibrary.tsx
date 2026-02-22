import { useEffect, useRef, useState } from "react";

type ExcelItem = {
  id: number;
  filename: string;
  size_kb: number;
  uploaded_at: string;
};

type Props =
  | {
      mode: "table";
      onLoadToTable: (rows: any[]) => void;
    }
  | {
      mode: "excel";
      getCalcParams?: () => { y_column: string; x_columns: string; fit_intercept: boolean };
      onCalc?: (result: any) => void;
      onPickExcel?: (meta: { id: number; filename: string }) => void;
    };

const API_BASE = "http://localhost:8000";

export default function FileLibrary(props: Props) {
  const [items, setItems] = useState<ExcelItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [uploading, setUploading] = useState(false);
  const upRef = useRef<HTMLInputElement | null>(null);

  // columnas para "cargar a tabla"
  const [yCol, setYCol] = useState("y");
  const [x1Col, setX1Col] = useState("x");
  const [x2Col, setX2Col] = useState("x2");

  const list = async () => {
    try {
      const res = await fetch(`${API_BASE}/api/library/excel/list`, { credentials: "include" });
      const json = await res.json();
      // backend puede devolver { items: [...] } o { auto: [...] }
      const arr = Array.isArray(json?.items)
        ? json.items
        : Array.isArray(json?.auto)
        ? json.auto.map((r: any) => ({
            id: r.id,
            filename: r.filename,
            size_kb: (r.size_bytes || 0) / 1024,
            uploaded_at: r.uploaded_at,
          }))
        : [];
      setItems(arr);
    } catch (err) {
      console.error("list error", err);
      setItems([]);
    }
  };

  useEffect(() => {
    list();
  }, []);

  const upload = async (file: File | null) => {
    if (!file) return;
    setUploading(true);
    try {
      const fd = new FormData();
      fd.append("file", file);
      const res = await fetch(`${API_BASE}/api/library/excel/upload`, {
        method: "POST",
        body: fd,
        credentials: "include",
      });
      if (!res.ok) console.error("upload error", await res.text());
      await list();
      if (upRef.current) upRef.current.value = "";
    } catch (err) {
      console.error("upload error", err);
    } finally {
      setUploading(false);
    }
  };

  const del = async (id: number) => {
    setLoading(true);
    try {
      const res = await fetch(`${API_BASE}/api/library/excel/delete`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ id }),
      });
      if (!res.ok) console.error("delete error", await res.text());
      await list();
    } catch (err) {
      console.error("delete error", err);
    } finally {
      setLoading(false);
    }
  };

  const runCalc = async (id: number) => {
    if (!("getCalcParams" in props) || !props.onCalc || !props.getCalcParams) return;
    setLoading(true);
    try {
      const params = props.getCalcParams();
      const fd = new FormData();
      fd.append("file_id", String(id));               // <-- clave correcta
      fd.append("y_column", params.y_column);
      fd.append("x_columns", params.x_columns);
      fd.append("fit_intercept", String(params.fit_intercept));
      const res = await fetch(`${API_BASE}/api/library/excel/calc`, {
        method: "POST",
        body: fd,
        credentials: "include",
      });
      if (!res.ok) {
        console.error("calc error", await res.text());
      } else {
        const json = await res.json();
        props.onCalc?.(json);
      }
    } catch (err) {
      console.error("calc error", err);
    } finally {
      setLoading(false);
    }
  };

// dentro de FileLibrary.tsx
const runToTable = async (id: number) => {
  if (!("mode" in props) || props.mode !== "table") return;
  setLoading(true);
  try {
    const fd = new FormData();
    fd.append("file_id", String(id));   // <<-- CLAVE CORRECTA
    fd.append("y_column", yCol.trim());
    fd.append("x1_column", x1Col.trim());
    if (x2Col.trim()) fd.append("x2_column", x2Col.trim());

    const res = await fetch(`${API_BASE}/api/library/excel/to_table`, {
      method: "POST",
      body: fd,
      credentials: "include",
    });

    if (!res.ok) {
      console.error("to_table error", await res.text());
      return;
    }
    const json = await res.json();
    if (Array.isArray(json?.rows) && "onLoadToTable" in props) {
      props.onLoadToTable(json.rows);
    }
  } finally {
    setLoading(false);
  }
};


  const pickExcel = (meta: { id: number; filename: string }) => {
    if (!("onPickExcel" in props) || !props.onPickExcel) return;
    props.onPickExcel(meta);
  };

  return (
    <div className="card" style={{ display: "grid", gap: 8 }}>
      {/* Subir */}
      <div style={{ display: "flex", gap: 8, alignItems: "center", justifyContent: "space-between" }}>
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <label className="btn secondary" style={{ cursor: "pointer" }}>
            <input
              ref={upRef}
              type="file"
              accept=".xlsx"
              onChange={(e) => upload(e.target.files?.[0] || null)}
              style={{ display: "none" }}
            />
            Subir a biblioteca (.xlsx)
          </label>
          <div className="meta">Archivos</div>
        </div>

        {"mode" in props && props.mode === "table" && (
          <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
            <input value={yCol} onChange={(e) => setYCol(e.target.value)} placeholder="y" title="Columna y" style={{ width: 48, textAlign: "center" }} />
            <input value={x1Col} onChange={(e) => setX1Col(e.target.value)} placeholder="x" title="Columna x (o x1)" style={{ width: 48, textAlign: "center" }} />
            <input value={x2Col} onChange={(e) => setX2Col(e.target.value)} placeholder="x2" title="Columna x2 (opcional)" style={{ width: 48, textAlign: "center" }} />
          </div>
        )}
      </div>

      {/* Lista */}
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Archivo</th>
              <th>Tamaño</th>
              <th>Fecha</th>
              <th style={{ width: 280 }}>Acciones</th>
            </tr>
          </thead>
          <tbody>
            {items.length === 0 && (
              <tr>
                <td colSpan={4} style={{ textAlign: "center", color: "var(--muted)" }}>Sin archivos</td>
              </tr>
            )}
            {items.map((it) => (
              <tr key={it.id}>
                <td>{it.filename}</td>
                <td>{it.size_kb.toFixed(1)} KB</td>
                <td>{it.uploaded_at}</td>
                <td style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                  {"mode" in props && props.mode === "table" ? (
                    <button className="btn secondary" disabled={loading} onClick={() => runToTable(it.id)}>
                      Cargar a tabla
                    </button>
                  ) : null}
                  {"onCalc" in props && props.onCalc ? (
                    <button className="btn secondary" disabled={loading} onClick={() => runCalc(it.id)}>
                      Calcular aquí
                    </button>
                  ) : null}
                  {"onPickExcel" in props && props.onPickExcel ? (
                    <button className="btn secondary" disabled={loading} onClick={() => pickExcel({ id: it.id, filename: it.filename })}>
                      Cargar aquí
                    </button>
                  ) : null}
                  <button className="btn secondary" disabled={loading} onClick={() => del(it.id)}>
                    Eliminar
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {(uploading || loading) && <div className="meta">Procesando…</div>}
    </div>
  );
}
