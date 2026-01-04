from fastapi import FastAPI
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from typing import List
from pathlib import Path
import json
import random

# ---------- app ----------
app = FastAPI()

# ---------- CORS ----------
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

# ---------- paths ----------
BASE_DIR = Path(__file__).resolve().parent
DATA_DIR = BASE_DIR / "data"
FRONTEND_DIR = BASE_DIR.parent / "frontend"

# ---------- subjects ----------
SUBJECTS = {
    "Computer Networks": "computer_networks.json",
    "Advanced Data Structures": "advanced_data_structures.json",
    "Python and Shell Scripting": "python_shell_scripting.json",
}

# ---------- utils ----------
def load_subject(subject_name: str):
    file_name = SUBJECTS.get(subject_name)
    if not file_name:
        return None

    path = DATA_DIR / file_name
    if not path.exists():
        return None

    with open(path, encoding="utf-8") as f:
        return json.load(f)

# ---------- API ----------
@app.get("/subjects")
def get_subjects():
    return list(SUBJECTS.keys())

@app.get("/questions/{subject_name}")
def get_questions(subject_name: str):
    questions = load_subject(subject_name)
    if questions is None:
        return {"error": "Subject not found"}
    return questions

# ---------- exam ----------
@app.get("/exam/{subject_name}")
def generate_exam(subject_name: str):
    questions = load_subject(subject_name)
    if not questions:
        return {"error": "Subject not found"}

    def by_modules(mods):
        return [q for q in questions if q.get("module") in mods]

    block_a_pool = by_modules(["m1", "m2"])
    block_b_pool = by_modules(["m3", "m4"])
    block_c_pool = by_modules(["m5"])

    if len(block_a_pool) < 4:
        return {"error": "Not enough questions for block A"}
    if len(block_b_pool) < 3:
        return {"error": "Not enough questions for block B"}
    if len(block_c_pool) < 1:
        return {"error": "Not enough questions for block C"}

    return {
        "A": random.sample(block_a_pool, 4),
        "B": random.sample(block_b_pool, 3),
        "C": random.sample(block_c_pool, 1),
    }

# ---------- answer check ----------
class CheckRequest(BaseModel):
    notes: str
    checkpoints: List[str]

@app.post("/check")
def check_answer_api(req: CheckRequest):
    notes_l = req.notes.lower()

    hits = 0
    details = []

    # --- базовая проверка чекпоинтов ---
    for cp in req.checkpoints:
        ok = cp.lower() in notes_l
        details.append({
            "checkpoint": cp,
            "hit": ok
        })
        if ok:
            hits += 1

    if not req.checkpoints:
        return {
            "coverage": 0,
            "details": [],
            "comment": "Нет чекпоинтов для проверки"
        }

    coverage = int((hits / len(req.checkpoints)) * 100)

    # ===============================
    # УРОВЕНЬ 1 — штрафы
    # ===============================

    comment = []
    word_count = len(req.notes.split())
    line_count = len(req.notes.strip().splitlines())

    penalty = 0

    # слишком коротко
    if word_count < 40:
        penalty += 20
        comment.append("Ответ слишком короткий, не хватает объяснений")

    # похоже на список
    if line_count >= word_count / 2:
        penalty += 30
        comment.append("Ответ выглядит как список, а не связный текст")

    coverage = max(0, coverage - penalty)

    # ===============================
    # УРОВЕНЬ 3 — комментарий экзаменатора
    # ===============================

    if coverage >= 85:
        comment.append("Ответ полный и хорошо структурирован")
    elif coverage >= 65:
        comment.append("Ответ частично раскрыт, но не хватает деталей")
    else:
        comment.append("Ответ поверхностный, требуется объяснение")

    return {
        "coverage": coverage,
        "details": details,
        "comment": comment
    }
# ---------- frontend ----------
app.mount(
    "/static",
    StaticFiles(directory=FRONTEND_DIR),
    name="static"
)

@app.get("/")
def index():
    return FileResponse(FRONTEND_DIR / "index.html")