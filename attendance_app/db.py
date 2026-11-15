from pathlib import Path
from sqlalchemy import create_engine
from sqlalchemy.orm import Session, sessionmaker
from .models import Base

def make_session_factory(data_dir: Path) -> sessionmaker[Session]:
    data_dir.mkdir(parents=True, exist_ok=True)
    engine = create_engine(f"sqlite:///{data_dir / 'attendance.db'}")
    Base.metadata.create_all(engine)
    return sessionmaker(engine, expire_on_commit=False)
