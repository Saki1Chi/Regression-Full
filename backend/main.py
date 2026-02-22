from fastapi import FastAPI, UploadFile, File, Form, Request, Response, Depends
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from pydantic import BaseModel, field_validator
from typing import Dict, List, Optional
import numpy as np, pandas as pd, io, logging, uuid, json, os, re, math
from datetime import datetime
from pathlib import Path

from state_db import init_db, SessionLocal, TableState, ExcelState, ExcelFile, ExcelResultState

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("regresiones")

app = FastAPI(title="API de Regresiones", version="1.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://127.0.0.1:5173"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# -------------------- DB session dependency --------------------
def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()

# -------------------- Archivos --------------------
UPLOAD_ROOT = Path(__file__).parent / "uploads"
UPLOAD_ROOT.mkdir(parents=True, exist_ok=True)

# -------------------- Session cookie --------------------
COOKIE_NAME = "sid"

def _ensure_sid(request: Request, response: Response) -> str:
    sid = request.cookies.get(COOKIE_NAME)
    if not sid:
        sid = uuid.uuid4().hex[:32]
        response.set_cookie(
            key=COOKIE_NAME,
            value=sid,
            httponly=False,
            samesite="Lax",
            secure=False,                 # en prod con HTTPS -> True
            max_age=60 * 60 * 24 * 30,   # 30 días
        )
    return sid

# usa el mismo cookie-name para la librería
def _ensure_sid_lib(request: Request, response: Response) -> str:
    return _ensure_sid(request, response)

# ---------------- utilidades ----------------
def _is_number(x) -> bool:
    return isinstance(x, (int, float)) and not (isinstance(x, float) and (np.isnan(x) or np.isinf(x)))

class RegressionJSONPayload(BaseModel):
    y: List[float]
    X: Dict[str, List[float]]
    fit_intercept: Optional[bool] = True

    @field_validator("y")
    def _check_y_numeric(cls, v: List[float]) -> List[float]:
        if not isinstance(v, list) or len(v) == 0:
            raise ValueError("'y' debe ser lista no vacía")
        if not all(_is_number(t) for t in v):
            raise ValueError("'y' debe contener únicamente números")
        return v

    @field_validator("X")
    def _check_X_numeric(cls, v: Dict[str, List[float]]) -> Dict[str, List[float]]:
        if not isinstance(v, dict) or len(v) == 0:
            raise ValueError("'X' debe ser un diccionario no vacío")
        for k, col in v.items():
            if not isinstance(k, str) or not k.strip():
                raise ValueError("Llaves de 'X' deben ser strings no vacíos")
            if not isinstance(col, list) or len(col) == 0:
                raise ValueError(f"Columna '{k}' debe ser lista no vacía")
            if not all(_is_number(t) for t in col):
                raise ValueError(f"'{k}' debe contener únicamente números")
        return v

# ---------------- OLS ----------------
def _ols(y, X):
    n = y.shape[0]
    XtX = X.T @ X
    # Intentar inversión directa; si falla (singularidad), usar pseudo-inversa
    try:
        XtX_inv = np.linalg.inv(XtX)
        beta = XtX_inv @ (X.T @ y)
    except np.linalg.LinAlgError:
        XtX_inv = np.linalg.pinv(XtX)
        beta = XtX_inv @ (X.T @ y)
    y_hat = X @ beta
    residuals = y - y_hat
    sse = float(residuals.T @ residuals)
    sst = float(((y - y.mean()) ** 2).sum())
    r2 = 1.0 - (sse / sst if sst > 0 else 0.0)
    k = X.shape[1]
    dof = max(n - k, 1)
    sigma2 = sse / dof
    # Var(beta) = sigma^2 * (X'X)^{-1}. Aseguramos no tomar sqrt de valores negativos por redondeo
    var_beta_diag = np.diag(sigma2 * XtX_inv)
    se_beta = np.sqrt(np.clip(var_beta_diag, a_min=0.0, a_max=None))
    # Evitar divisiones por cero en t-stats
    with np.errstate(divide='ignore', invalid='ignore'):
        t_stats_arr = np.where(se_beta > 0, beta.flatten() / se_beta, 0.0)
    t_stats = t_stats_arr.tolist()
    adj_r2 = 1.0 - (1.0 - r2) * (n - 1) / max(n - k, 1)
    return {
        "beta": beta.flatten().tolist(),
        "se_beta": se_beta.tolist(),
        "t_stats": t_stats,
        "r2": float(r2),
        "adj_r2": float(adj_r2),
        "sse": float(sse),
        "sigma2": float(sigma2),
    }

# Reemplaza NaN/Inf por 0.0 para respuestas JSON válidas
def _sanitize_numbers(obj):
    if isinstance(obj, dict):
        return {k: _sanitize_numbers(v) for k, v in obj.items()}
    if isinstance(obj, list):
        return [_sanitize_numbers(v) for v in obj]
    try:
        if isinstance(obj, (np.floating, float)):
            v = float(obj)
            if not math.isfinite(v):
                return 0.0
            return v
        if isinstance(obj, (np.integer, int)):
            return int(obj)
    except Exception:
        pass
    return obj

def _prepare_matrix(y_list, X_dict, fit_intercept):
    y = np.asarray(y_list, dtype=float).reshape(-1, 1)
    Xc = [np.asarray(X_dict[n], dtype=float).reshape(-1, 1) for n in sorted(X_dict)]
    if not Xc:
        raise ValueError("Se requiere al menos una columna en X")
    X = np.hstack(Xc)
    if fit_intercept:
        X = np.hstack([np.ones((X.shape[0], 1)), X])
    return y, X

def _format_response(features, fit_intercept, out):
    names = (["intercept"] if fit_intercept else []) + sorted(features)
    return {
        "coefficients": {n: out["beta"][i] for i, n in enumerate(names)},
        "std_errors": {n: out["se_beta"][i] for i, n in enumerate(names)},
        "t_stats": {n: out["t_stats"][i] for i, n in enumerate(names)},
        "r2": out["r2"],
        "adj_r2": out["adj_r2"],
        "sse": out["sse"],
        "sigma2": out["sigma2"],
    }

# ---------------- helpers Excel state/result ----------------
def _save_uploaded_file_for_sid(sid: str, content: bytes) -> str:
    # guarda un único archivo ligado a la sesión (para /api/regression/excel/reuse)
    path = UPLOAD_ROOT / f"{sid}.xlsx"
    with open(path, "wb") as f:
        f.write(content)
    return str(path)

def _save_excel_state(db, sid: str, y_column: str, x_columns_list: List[str], fit_intercept: bool, file_path: Optional[str]):
    row = db.query(ExcelState).filter(ExcelState.sid == sid).first()
    now = datetime.utcnow()
    x_join = ",".join(x_columns_list or [])
    if row:
        row.y_column = y_column
        row.x_columns = x_join
        row.fit_intercept = bool(fit_intercept)
        if file_path:
            row.file_path = file_path
        row.updated_at = now
    else:
        row = ExcelState(
            sid=sid,
            y_column=y_column,
            x_columns=x_join,
            fit_intercept=bool(fit_intercept),
            file_path=file_path,
            updated_at=now,
        )
        db.add(row)
    db.commit()
    return row

def _get_excel_state(db, sid: str):
    return db.query(ExcelState).filter(ExcelState.sid == sid).order_by(ExcelState.updated_at.desc()).first()

def _save_excel_result(db, sid: str, result_dict: dict):
    row = db.query(ExcelResultState).filter(ExcelResultState.sid == sid).first()
    now = datetime.utcnow()
    payload = json.dumps(result_dict, ensure_ascii=False)
    if row:
        row.result_json = payload
        row.updated_at = now
    else:
        row = ExcelResultState(sid=sid, result_json=payload, updated_at=now)
        db.add(row)
    db.commit()

def _get_excel_result(db, sid: str):
    row = db.query(ExcelResultState).filter(ExcelResultState.sid == sid).order_by(ExcelResultState.updated_at.desc()).first()
    if not row or not row.result_json:
        return None
    try:
        return json.loads(row.result_json)
    except Exception:
        return None

# ---------------- rutas ----------------
@app.on_event("startup")
def _startup():
    init_db()
    logger.info("DB inicializada.")

@app.get("/")
def root():
    return {"message": "API de Regresiones lista. Rutas: POST /api/regression/json, POST /api/regression/excel, estado en /api/state/*"}

@app.get("/api/session")
def ensure_session(request: Request, response: Response):
    sid = _ensure_sid(request, response)
    return {"sid": sid}

# ---- JSON regression
@app.post("/api/regression/json")
def regression_from_json(payload: RegressionJSONPayload):
    lengths = {k: len(v) for k, v in payload.X.items()}
    lengths["y"] = len(payload.y)
    if len(set(lengths.values())) != 1:
        return JSONResponse(status_code=400, content={"error": "Longitudes inconsistentes", "detalle": lengths})
    try:
        y, X = _prepare_matrix(payload.y, payload.X, payload.fit_intercept)
        out = _ols(y, X)
        resp = _format_response(list(payload.X.keys()), payload.fit_intercept, out)
        resp.update({
            "n": len(payload.y),
            "k": X.shape[1],
            "fit_intercept": payload.fit_intercept,
            "debug": {"columns": sorted(list(payload.X.keys())), "design_matrix_shape": [int(X.shape[0]), int(X.shape[1])]},
        })
        return _sanitize_numbers(resp)
    except ValueError as e:
        return JSONResponse(status_code=400, content={"error": str(e)})

# ---- Estado TABLA
class SaveTableStatePayload(BaseModel):
    rows_json: str
    fit_intercept: bool = True

@app.get("/api/state/table")
def get_table_state(request: Request, response: Response, db=Depends(get_db)):
    sid = _ensure_sid(request, response)
    row = db.query(TableState).filter(TableState.sid == sid).order_by(TableState.updated_at.desc()).first()
    if not row:
        return {"exists": False, "rows_json": "[]", "fit_intercept": True, "updated_at": None}
    return {
        "exists": True,
        "rows_json": row.rows_json or "[]",
        "fit_intercept": bool(row.fit_intercept),
        "updated_at": row.updated_at.isoformat() if row.updated_at else None,
    }

@app.post("/api/state/table")
def save_table_state(payload: SaveTableStatePayload, request: Request, response: Response, db=Depends(get_db)):
    sid = _ensure_sid(request, response)
    row = db.query(TableState).filter(TableState.sid == sid).first()
    now = datetime.utcnow()
    if row:
        row.rows_json = payload.rows_json
        row.fit_intercept = bool(payload.fit_intercept)
        row.updated_at = now
    else:
        row = TableState(
            sid=sid,
            rows_json=payload.rows_json,
            fit_intercept=bool(payload.fit_intercept),
            updated_at=now,
        )
        db.add(row)
    db.commit()
    return {"ok": True, "updated_at": now.isoformat()}

# ---- Estado EXCEL (campos)
class SaveExcelStatePayload(BaseModel):
    y_column: str
    x_columns: List[str]
    fit_intercept: bool = True

@app.get("/api/state/excel")
def get_excel_state(request: Request, response: Response, db=Depends(get_db)):
    sid = _ensure_sid(request, response)
    row = _get_excel_state(db, sid)
    if not row:
        return {"exists": False, "y_column": "", "x_columns": [], "fit_intercept": True, "updated_at": None, "has_file": False}
    xs = (row.x_columns or "").split(",") if row.x_columns else []
    has_file = bool(row.file_path) and os.path.exists(row.file_path)
    return {
        "exists": True,
        "y_column": row.y_column or "",
        "x_columns": [c for c in xs if c],
        "fit_intercept": bool(row.fit_intercept),
        "updated_at": row.updated_at.isoformat() if row.updated_at else None,
        "has_file": has_file,
    }

@app.post("/api/state/excel")
def save_excel_state(payload: SaveExcelStatePayload, request: Request, response: Response, db=Depends(get_db)):
    sid = _ensure_sid(request, response)
    _save_excel_state(db, sid, payload.y_column, payload.x_columns, payload.fit_intercept, file_path=None)
    return {"ok": True}

# ---- Resultado EXCEL (último)
@app.get("/api/state/excel/result")
def get_excel_last_result(request: Request, response: Response, db=Depends(get_db)):
    sid = _ensure_sid(request, response)
    data = _get_excel_result(db, sid)
    if not data:
        return {"exists": False}
    return {"exists": True, "result": data}

# ---- Excel: subir y calcular (guarda archivo + estado + resultado)
@app.post("/api/regression/excel")
async def regression_from_excel(
    request: Request,
    response: Response,
    db=Depends(get_db),
    file: UploadFile = File(...),
    y_column: str = Form(...),
    x_columns: str = Form(...),
    fit_intercept: bool = Form(True),
):
    sid = _ensure_sid(request, response)
    content = await file.read()
    try:
        df = pd.read_excel(io.BytesIO(content), engine="openpyxl")
    except Exception as e:
        return JSONResponse(status_code=400, content={"error": f"No se pudo leer el Excel: {e}"})

    df.columns = [str(c).strip() for c in df.columns]
    if y_column not in df.columns:
        return JSONResponse(status_code=400, content={"error": f"Columna y '{y_column}' no existe en el archivo"})

    x_list = [c.strip() for c in x_columns.split(",") if c.strip()]
    if not x_list:
        return JSONResponse(status_code=400, content={"error": "Debes especificar al menos una columna X en 'x_columns'"})
    for c in x_list:
        if c not in df.columns:
            return JSONResponse(status_code=400, content={"error": f"La columna X '{c}' no existe en el archivo"})

    def ensure_numeric(s, name):
        coerced = pd.to_numeric(s, errors="coerce")
        if coerced.isna().any():
            idx_bad = list(s[coerced.isna()].index[:5])
            raise ValueError(f"La columna '{name}' debe ser completamente numérica. Filas problemáticas: {idx_bad}")
        return coerced

    try:
        y = ensure_numeric(df[y_column], y_column).to_numpy().reshape(-1, 1)
        X_cols = {c: ensure_numeric(df[c], c).to_numpy().tolist() for c in x_list}
    except ValueError as e:
        return JSONResponse(status_code=400, content={"error": str(e)})

    lengths = {c: len(df[c]) for c in [y_column] + x_list}
    if len(set(lengths.values())) != 1:
        return JSONResponse(status_code=400, content={"error": "Las columnas seleccionadas no tienen la misma longitud", "detalle": lengths})

    try:
        y_list = y.flatten().tolist()
        X = {c: X_cols[c] for c in x_list}
        y_arr, X_arr = _prepare_matrix(y_list, X, fit_intercept)
        out = _ols(y_arr, X_arr)
        resp = _format_response(x_list, fit_intercept, out)
        resp.update({
            "n": int(y_arr.shape[0]),
            "k": int(X_arr.shape[1]),
            "fit_intercept": fit_intercept,
            "debug": {"design_matrix_shape": [int(X_arr.shape[0]), int(X_arr.shape[1])], "columns_used": {"y": y_column, "X": x_list}},
        })

        # Guardar archivo y estado + resultado
        path = _save_uploaded_file_for_sid(sid, content)
        _save_excel_state(db, sid, y_column, x_list, fit_intercept, path)
        _save_excel_result(db, sid, resp)

        return _sanitize_numbers(resp)
    except ValueError as e:
        return JSONResponse(status_code=400, content={"error": str(e)})

# ---- Recalcular usando el archivo guardado (sin re-subir)
@app.post("/api/regression/excel/reuse")
def regression_from_saved_file(
    request: Request,
    response: Response,
    db=Depends(get_db),
    y_column: str = Form(...),
    x_columns: str = Form(...),
    fit_intercept: bool = Form(True),
):
    sid = _ensure_sid(request, response)
    state = _get_excel_state(db, sid)
    if not state or not state.file_path or not os.path.exists(state.file_path):
        return JSONResponse(status_code=400, content={"error": "No hay archivo guardado para esta sesión. Sube un Excel primero."})

    try:
        df = pd.read_excel(state.file_path, engine="openpyxl")
    except Exception as e:
        return JSONResponse(status_code=400, content={"error": f"No se pudo leer el archivo guardado: {e}"})

    df.columns = [str(c).strip() for c in df.columns]
    if y_column not in df.columns:
        return JSONResponse(status_code=400, content={"error": f"Columna y '{y_column}' no existe en el archivo"})

    x_list = [c.strip() for c in x_columns.split(",") if c.strip()]
    if not x_list:
        return JSONResponse(status_code=400, content={"error": "Debes especificar al menos una columna X en 'x_columns'"})
    for c in x_list:
        if c not in df.columns:
            return JSONResponse(status_code=400, content={"error": f"La columna X '{c}' no existe en el archivo"})

    def ensure_numeric(s, name):
        coerced = pd.to_numeric(s, errors="coerce")
        if coerced.isna().any():
            idx_bad = list(s[coerced.isna()].index[:5])
            raise ValueError(f"La columna '{name}' debe ser completamente numérica. Filas problemáticas: {idx_bad}")
        return coerced

    try:
        y = ensure_numeric(df[y_column], y_column).to_numpy().reshape(-1, 1)
        X_cols = {c: ensure_numeric(df[c], c).to_numpy().tolist() for c in x_list}
    except ValueError as e:
        return JSONResponse(status_code=400, content={"error": str(e)})

    lengths = {c: len(df[c]) for c in [y_column] + x_list}
    if len(set(lengths.values())) != 1:
        return JSONResponse(status_code=400, content={"error": "Las columnas seleccionadas no tienen la misma longitud", "detalle": lengths})

    try:
        y_list = y.flatten().tolist()
        X = {c: X_cols[c] for c in x_list}
        y_arr, X_arr = _prepare_matrix(y_list, X, fit_intercept)
        out = _ols(y_arr, X_arr)
        resp = _format_response(x_list, fit_intercept, out)
        resp.update({
            "n": int(y_arr.shape[0]),
            "k": int(X_arr.shape[1]),
            "fit_intercept": fit_intercept,
            "debug": {"design_matrix_shape": [int(X_arr.shape[0]), int(X_arr.shape[1])], "columns_used": {"y": y_column, "X": x_list}},
        })

        _save_excel_state(db, sid, y_column, x_list, fit_intercept, file_path=None)
        _save_excel_result(db, sid, resp)

        return _sanitize_numbers(resp)
    except ValueError as e:
        return JSONResponse(status_code=400, content={"error": str(e)})

# ===================== Biblioteca de archivos (EXCEL) =====================

# Subir archivo a biblioteca
@app.post("/api/library/excel/upload")
async def library_upload_excel(
    request: Request,
    response: Response,
    file: UploadFile = File(...),
    db=Depends(get_db),
):
    sid = _ensure_sid_lib(request, response)
    user_dir = UPLOAD_ROOT / sid
    user_dir.mkdir(parents=True, exist_ok=True)

    base = Path(file.filename or "archivo.xlsx").name
    safe = re.sub(r"[^A-Za-z0-9_.-]+", "_", base)
    fname = f"{uuid.uuid4().hex}_{safe}"
    fpath = user_dir / fname

    content = await file.read()
    with open(fpath, "wb") as fh:
        fh.write(content)

    row = ExcelFile(
        sid=sid,
        filename=base,
        file_path=str(fpath),
        size_bytes=len(content),
        kind="auto",
    )
    db.add(row); db.commit(); db.refresh(row)

    return {"ok": True, "file": {
        "id": row.id,
        "filename": row.filename,
        "size_kb": round((row.size_bytes or 0)/1024.0, 1),
        "uploaded_at": row.uploaded_at.isoformat()
    }}

# Listar archivos en biblioteca (formato que espera FileLibrary: {items: [...]})
@app.get("/api/library/excel/list")
def library_list_excel(request: Request, response: Response, db=Depends(get_db)):
    sid = _ensure_sid_lib(request, response)
    rows = db.query(ExcelFile).filter(ExcelFile.sid == sid).order_by(ExcelFile.uploaded_at.desc()).all()
    items = [{
        "id": r.id,
        "filename": r.filename,
        "size_kb": round((r.size_bytes or 0)/1024.0, 1),
        "uploaded_at": (r.uploaded_at.isoformat() if r.uploaded_at else ""),
    } for r in rows]
    return {"items": items}

# Enviar contenido del archivo a la tabla (tolerante a x/x1 y case-insensitive)
@app.post("/api/library/excel/to_table")
def library_to_table(
    request: Request,
    response: Response,
    file_id: int = Form(...),
    y_column: str = Form("y"),
    x1_column: str = Form("x"),
    x2_column: Optional[str] = Form(None),
    db=Depends(get_db)
):
    sid = _ensure_sid_lib(request, response)
    row = db.query(ExcelFile).filter(ExcelFile.sid == sid, ExcelFile.id == file_id).first()
    if not row or not os.path.exists(row.file_path):
        return JSONResponse(status_code=404, content={"error": "Archivo no encontrado"})

    try:
        with open(row.file_path, "rb") as fh:
            content = fh.read()
        df = pd.read_excel(io.BytesIO(content), engine="openpyxl")
    except Exception as e:
        return JSONResponse(status_code=400, content={"error": f"No se pudo leer: {e}"})

    # normaliza a minúsculas/trim para hacer matching flexible
    df2 = df.copy()
    df2.columns = [str(c).strip().lower() for c in df2.columns]
    cols = set(df2.columns)

    y_req  = (y_column or "y").strip().lower()
    x1_req = (x1_column or "x").strip().lower()
    x2_req = (x2_column or "").strip().lower()

    # resolver y
    if y_req not in cols:
        return JSONResponse(status_code=400, content={"error": f"Columna '{y_column}' no existe en el archivo"})

    # resolver x principal: acepta lo que tecleó el usuario o los alias x/x1
    x1_name = None
    if x1_req in cols:
        x1_name = x1_req
    elif x1_req in {"x", "x1"}:
        if "x" in cols:   x1_name = "x"
        elif "x1" in cols: x1_name = "x1"
    if x1_name is None:
        return JSONResponse(status_code=400, content={"error": f"Columna '{x1_column}' no existe (prueba con 'x' o 'x1')"})

    # resolver x2 opcional (si lo piden, también aceptar alias x2)
    x2_name = None
    if x2_req:
        if x2_req in cols:
            x2_name = x2_req
        elif x2_req == "x2" and "x2" in cols:
            x2_name = "x2"

    # construir filas
    out_rows = []
    for _, r in df2.iterrows():
        item = {"x": str(r[x1_name]), "y": str(r[y_req])}
        if x2_name:
            item["x2"] = str(r[x2_name])
        out_rows.append(item)

    return {"rows": out_rows, "columns_used": {"y": y_req, "x1": x1_name, "x2": x2_name}}

# Calcular desde biblioteca (acepta id o file_id)
@app.post("/api/library/excel/calc")
async def library_calc(request: Request, response: Response, db=Depends(get_db)):
    sid = _ensure_sid_lib(request, response)
    form = await request.form()

    file_id = int((form.get("id") or form.get("file_id") or 0))
    y_column = (form.get("y_column") or "").strip()
    x_columns = (form.get("x_columns") or "").strip()
    fit_intercept = (form.get("fit_intercept") or "true").lower() in ("1","true","t","yes","y")

    row = db.query(ExcelFile).filter(ExcelFile.sid == sid, ExcelFile.id == file_id).first()
    if not row or not os.path.exists(row.file_path):
        return JSONResponse(status_code=404, content={"error": "Archivo no encontrado"})

    try:
        with open(row.file_path, "rb") as fh:
            content = fh.read()
        df = pd.read_excel(io.BytesIO(content), engine="openpyxl")
    except Exception as e:
        return JSONResponse(status_code=400, content={"error": f"No se pudo leer: {e}"})

    df.columns = [str(c).strip() for c in df.columns]
    if y_column not in df.columns:
        return JSONResponse(status_code=400, content={"error": f"Columna y '{y_column}' no existe"})
    xs = [c.strip() for c in x_columns.split(",") if c.strip()]
    if not xs:
        return JSONResponse(status_code=400, content={"error": "Debes especificar al menos una X en 'x_columns'"})
    for c in xs:
        if c not in df.columns:
            return JSONResponse(status_code=400, content={"error": f"La columna X '{c}' no existe"})

    def ensure_numeric(s, name):
        coerced = pd.to_numeric(s, errors="coerce")
        if coerced.isna().any():
            idx_bad = list(s[coerced.isna()].index[:5])
            raise ValueError(f"La columna '{name}' debe ser completamente numérica. Filas problemáticas: {idx_bad}")
        return coerced

    try:
        y = ensure_numeric(df[y_column], y_column).to_numpy().reshape(-1, 1)
        X_cols = {c: ensure_numeric(df[c], c).to_numpy().tolist() for c in xs}
    except ValueError as e:
        return JSONResponse(status_code=400, content={"error": str(e)})

    lengths = {c: len(df[c]) for c in [y_column] + xs}
    if len(set(lengths.values())) != 1:
        return JSONResponse(status_code=400, content={"error": "Longitudes inconsistentes", "detalle": lengths})

    try:
        y_list = y.flatten().tolist()
        X = {c: X_cols[c] for c in xs}
        y_arr, X_arr = _prepare_matrix(y_list, X, fit_intercept)
        out = _ols(y_arr, X_arr)
        resp = _format_response(xs, fit_intercept, out)
        resp.update({
            "n": int(y_arr.shape[0]),
            "k": int(X_arr.shape[1]),
            "fit_intercept": fit_intercept,
            "debug": {"design_matrix_shape": [int(X_arr.shape[0]), int(X_arr.shape[1])], "columns_used": {"y": y_column, "X": xs}},
        })

        # metadatos + cache último resultado
        row.kind = "simple" if len(xs) == 1 else "multiple"
        row.y_column = y_column
        row.x_columns = ",".join(xs)
        db.add(row); db.commit()
        _save_excel_result(db, sid, resp)

        return _sanitize_numbers(resp)
    except ValueError as e:
        return JSONResponse(status_code=400, content={"error": str(e)})

# Eliminar archivo (acepta JSON { id } y también form id/file_id por compatibilidad)
@app.post("/api/library/excel/delete")
async def library_delete_excel(request: Request, response: Response, db=Depends(get_db)):
    sid = _ensure_sid_lib(request, response)

    file_id = 0
    try:
        data = await request.json()
        file_id = int(data.get("id") or 0)
    except Exception:
        pass
    if not file_id:
        form = await request.form()
        file_id = int((form.get("id") or form.get("file_id") or 0))

    if not file_id:
        return JSONResponse(status_code=400, content={"error": "Falta id"})

    row = db.query(ExcelFile).filter(ExcelFile.sid == sid, ExcelFile.id == file_id).first()
    if not row:
        return JSONResponse(status_code=404, content={"error": "Archivo no encontrado"})

    try:
        if row.file_path and os.path.exists(row.file_path):
            os.remove(row.file_path)
    except Exception:
        pass

    db.delete(row)
    db.commit()
    return {"ok": True}
