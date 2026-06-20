from pathlib import Path
from fastapi import FastAPI, Depends, HTTPException, status
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel, EmailStr
from sqlalchemy.orm import Session
from dotenv import load_dotenv

load_dotenv()

from database import init_db, get_db, User, Paper
from auth import hash_password, verify_password, create_token, get_current_user, get_optional_user
from pipeline import run_pipeline

init_db()

app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)


# ── Auth ──────────────────────────────────────────────────────────────────────

class SignupBody(BaseModel):
    name: str
    email: str
    password: str

class LoginBody(BaseModel):
    email: str
    password: str


@app.post("/auth/signup")
def signup(body: SignupBody, db: Session = Depends(get_db)):
    if db.query(User).filter(User.email == body.email.lower()).first():
        raise HTTPException(status_code=400, detail="Email already registered")
    if len(body.password) < 6:
        raise HTTPException(status_code=400, detail="Password must be at least 6 characters")
    user = User(name=body.name.strip(), email=body.email.lower(), password_hash=hash_password(body.password))
    db.add(user); db.commit(); db.refresh(user)
    return {"token": create_token(user.id), "name": user.name, "email": user.email}


@app.post("/auth/login")
def login(body: LoginBody, db: Session = Depends(get_db)):
    user = db.query(User).filter(User.email == body.email.lower()).first()
    if not user or not verify_password(body.password, user.password_hash):
        raise HTTPException(status_code=401, detail="Incorrect email or password")
    return {"token": create_token(user.id), "name": user.name, "email": user.email}


@app.get("/auth/me")
def me(user: User = Depends(get_current_user)):
    return {"id": user.id, "name": user.name, "email": user.email}


# ── Papers ────────────────────────────────────────────────────────────────────

class PaperBody(BaseModel):
    title: str
    markdown: str
    mode: str = "edited"


@app.get("/papers")
def list_papers(user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    papers = db.query(Paper).filter(Paper.user_id == user.id).order_by(Paper.created_at.desc()).limit(50).all()
    return {"papers": [
        {"id": p.id, "title": p.title, "mode": p.mode,
         "markdown": p.markdown, "created_at": p.created_at.isoformat()}
        for p in papers
    ]}


@app.post("/papers", status_code=201)
def save_paper(body: PaperBody, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    paper = Paper(user_id=user.id, title=body.title[:300], markdown=body.markdown, mode=body.mode)
    db.add(paper); db.commit(); db.refresh(paper)
    return {"id": paper.id}


@app.delete("/papers/{paper_id}")
def delete_paper(paper_id: int, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    paper = db.query(Paper).filter(Paper.id == paper_id, Paper.user_id == user.id).first()
    if not paper:
        raise HTTPException(status_code=404, detail="Paper not found")
    db.delete(paper); db.commit()
    return {"ok": True}


# ── Chat ──────────────────────────────────────────────────────────────────────

class ChatRequest(BaseModel):
    message: str
    session_id: str


@app.post("/chat")
async def chat(body: ChatRequest):
    try:
        response = await run_pipeline(body.message, body.session_id)
        return {"response": response, "ok": True}
    except Exception as e:
        return {"response": f"Error: {str(e)}", "ok": False}


# ── Static files ──────────────────────────────────────────────────────────────

STATIC_DIR = Path(__file__).parent / "research-suite 2"
app.mount("/", StaticFiles(directory=str(STATIC_DIR), html=True), name="static")
