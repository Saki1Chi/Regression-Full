# backend/state_db.py
from datetime import datetime
from pathlib import Path

from sqlalchemy import create_engine, Column, Integer, String, DateTime, Text, Boolean
from sqlalchemy.orm import declarative_base, sessionmaker

DB_PATH = Path(__file__).parent / "app.db"
engine = create_engine(f"sqlite:///{DB_PATH}", connect_args={"check_same_thread": False})
SessionLocal = sessionmaker(bind=engine, autocommit=False, autoflush=False)
Base = declarative_base()

# Estado de la tabla (Tabla Simple)
class TableState(Base):
    __tablename__ = "table_state"
    id = Column(Integer, primary_key=True, index=True)
    sid = Column(String(64), index=True)          # cookie session id
    rows_json = Column(Text)                      # JSON como string
    fit_intercept = Column(Boolean, default=True)
    updated_at = Column(DateTime, default=datetime.utcnow)

# Estado de la sección Excel (últimos parámetros usados)
class ExcelState(Base):
    __tablename__ = "excel_state"
    id = Column(Integer, primary_key=True, index=True)
    sid = Column(String(64), index=True)
    y_column = Column(String(128))
    x_columns = Column(String(512))               # "x1,x2,x3"
    fit_intercept = Column(Boolean, default=True)
    file_path = Column(String(1024), nullable=True)
    updated_at = Column(DateTime, default=datetime.utcnow)

# Biblioteca de archivos subidos
class ExcelFile(Base):
    __tablename__ = "excel_files"
    id = Column(Integer, primary_key=True, index=True)
    sid = Column(String(64), index=True)        # por sesión (cookie)
    filename = Column(String(256))
    file_path = Column(String(1024))
    size_bytes = Column(Integer, default=0)
    kind = Column(String(32), default="auto")   # "simple" | "multiple" | "auto"
    y_column = Column(String(128), nullable=True)
    x_columns = Column(String(512), nullable=True)
    uploaded_at = Column(DateTime, default=datetime.utcnow)

def init_db():
    Base.metadata.create_all(bind=engine)


# --- Último resultado de la sección Excel (cache por sesión) ---
class ExcelResultState(Base):
    __tablename__ = "excel_result_state"
    id = Column(Integer, primary_key=True, index=True)
    sid = Column(String(64), index=True)   # cookie de sesión
    result_json = Column(Text)             # JSON de la última respuesta de /api/regression/excel
    updated_at = Column(DateTime, default=datetime.utcnow)