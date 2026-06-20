import os
from datetime import datetime
from sqlalchemy import create_engine, Column, Integer, String, Text, DateTime, ForeignKey
from sqlalchemy.orm import declarative_base, sessionmaker, relationship

DATABASE_URL = os.getenv("DATABASE_URL", "sqlite:///./data/papers.db")
engine = create_engine(DATABASE_URL, connect_args={"check_same_thread": False})
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
Base = declarative_base()


class User(Base):
    __tablename__ = "users"
    id           = Column(Integer, primary_key=True, index=True)
    name         = Column(String(100), nullable=False)
    email        = Column(String(200), unique=True, nullable=False, index=True)
    password_hash = Column(String(200), nullable=False)
    created_at   = Column(DateTime, default=datetime.utcnow)
    papers       = relationship("Paper", back_populates="user", cascade="all, delete-orphan")


class Paper(Base):
    __tablename__ = "papers"
    id         = Column(Integer, primary_key=True, index=True)
    user_id    = Column(Integer, ForeignKey("users.id"), nullable=False)
    title      = Column(String(300), nullable=False)
    markdown   = Column(Text, nullable=False)
    mode       = Column(String(20), default="edited")
    created_at = Column(DateTime, default=datetime.utcnow)
    user       = relationship("User", back_populates="papers")


def init_db():
    os.makedirs("data", exist_ok=True)
    Base.metadata.create_all(bind=engine)


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
