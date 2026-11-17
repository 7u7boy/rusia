"""Ruso A1 · Práctica — aplicación Flask con cuentas y progreso."""
import os
import re
import time
from collections import defaultdict
from datetime import datetime, timedelta, timezone

from flask import Flask, jsonify, request, send_from_directory, session
from flask_sqlalchemy import SQLAlchemy
from sqlalchemy import UniqueConstraint, func
from werkzeug.security import check_password_hash, generate_password_hash

BASE_DIR = os.path.dirname(os.path.abspath(__file__))


def database_url():
    url = os.environ.get("DATABASE_URL", "sqlite:///" + os.path.join(BASE_DIR, "local.db"))
    for prefix in ("postgres://", "postgresql://"):
        if url.startswith(prefix):
            url = "postgresql+psycopg://" + url[len(prefix):]
    return url


app = Flask(__name__, static_folder="static", static_url_path="")
if os.environ.get("DATABASE_URL") and not os.environ.get("SECRET_KEY"):
    raise RuntimeError("Falta la variable SECRET_KEY en producción.")
app.config.update(
    SECRET_KEY=os.environ.get("SECRET_KEY", "dev-solo-local-cambiar"),
    SQLALCHEMY_DATABASE_URI=database_url(),
    SQLALCHEMY_ENGINE_OPTIONS={"pool_pre_ping": True},
    SESSION_COOKIE_HTTPONLY=True,
    SESSION_COOKIE_SAMESITE="Lax",
    SESSION_COOKIE_SECURE=os.environ.get("COOKIE_SECURE", "1" if os.environ.get("DATABASE_URL") else "0") == "1",
    PERMANENT_SESSION_LIFETIME=timedelta(days=60),
    MAX_CONTENT_LENGTH=512 * 1024,
)
db = SQLAlchemy(app)


def now():
    return datetime.now(timezone.utc).replace(tzinfo=None)


# ---------------------------------------------------------------- modelos
class User(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    username = db.Column(db.String(32), unique=True, nullable=False, index=True)
    name = db.Column(db.String(60), nullable=False)
    password_hash = db.Column(db.String(255), nullable=False)
    created_at = db.Column(db.DateTime, default=now, nullable=False)


class ItemStat(db.Model):
    """Resultado acumulado de un usuario en una pregunta o palabra concreta."""
    id = db.Column(db.Integer, primary_key=True)
    user_id = db.Column(db.Integer, db.ForeignKey("user.id", ondelete="CASCADE"), nullable=False, index=True)
    key = db.Column(db.String(24), nullable=False)          # p. ej. "v:ab12cd34ef"
    kind = db.Column(db.String(8), nullable=False)          # vocab | gram | sent
    section = db.Column(db.String(80), nullable=False)
    right = db.Column(db.Integer, default=0, nullable=False)
    wrong = db.Column(db.Integer, default=0, nullable=False)
    last_ok = db.Column(db.Boolean, default=False, nullable=False)
    updated_at = db.Column(db.DateTime, default=now, onupdate=now, nullable=False)
    __table_args__ = (UniqueConstraint("user_id", "key", name="uq_user_key"),)


class StudySession(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    user_id = db.Column(db.Integer, db.ForeignKey("user.id", ondelete="CASCADE"), nullable=False, index=True)
    kind = db.Column(db.String(8), nullable=False)
    mode = db.Column(db.String(16), nullable=False, default="")
    total = db.Column(db.Integer, nullable=False)
    correct = db.Column(db.Integer, nullable=False)
    created_at = db.Column(db.DateTime, default=now, nullable=False, index=True)


with app.app_context():
    db.create_all()


# ---------------------------------------------------------------- utilidades
USERNAME_RE = re.compile(r"^[a-zA-Z0-9_.-]{3,32}$")
KINDS = {"vocab", "gram", "sent"}
_login_attempts = defaultdict(list)  # ip -> [timestamps]


def too_many_attempts(ip, limit=10, window=600):
    t = time.time()
    _login_attempts[ip] = [x for x in _login_attempts[ip] if t - x < window]
    return len(_login_attempts[ip]) >= limit


def current_user():
    uid = session.get("uid")
    return db.session.get(User, uid) if uid else None


def user_json(u):
    return {"username": u.username, "name": u.name}


def err(msg, code=400):
    return jsonify({"error": msg}), code


@app.before_request
def json_only_for_writes():
    # Las escrituras solo aceptan JSON: un formulario de otro sitio no puede enviarlo sin CORS.
    if request.method == "POST" and request.path.startswith("/api/") and not request.is_json:
        return err("Se esperaba JSON.", 415)


@app.after_request
def security_headers(resp):
    resp.headers.setdefault("X-Content-Type-Options", "nosniff")
    resp.headers.setdefault("Referrer-Policy", "same-origin")
    resp.headers.setdefault("X-Frame-Options", "DENY")
    if request.path.startswith(("/audio/", "/data/")):
        resp.headers["Cache-Control"] = "public, max-age=604800"
    return resp


# ---------------------------------------------------------------- páginas
@app.route("/")
def index():
    return send_from_directory(app.static_folder, "index.html")


@app.route("/health")
def health():
    return {"ok": True}


# ---------------------------------------------------------------- autenticación
@app.post("/api/register")
def register():
    d = request.get_json(silent=True) or {}
    username = (d.get("username") or "").strip().lower()
    name = (d.get("name") or "").strip()[:60]
    password = d.get("password") or ""
    if not USERNAME_RE.match(username):
        return err("El usuario debe tener entre 3 y 32 caracteres: letras, números, punto, guion o guion bajo.")
    if len(password) < 8:
        return err("La contraseña debe tener al menos 8 caracteres.")
    if not name:
        name = username
    if User.query.filter_by(username=username).first():
        return err("Ese nombre de usuario ya existe.", 409)
    u = User(username=username, name=name, password_hash=generate_password_hash(password))
    db.session.add(u)
    db.session.commit()
    session.clear()
    session.permanent = True
    session["uid"] = u.id
    return jsonify({"user": user_json(u)}), 201


@app.post("/api/login")
def login():
    ip = request.headers.get("X-Forwarded-For", request.remote_addr or "").split(",")[0].strip()
    if too_many_attempts(ip):
        return err("Demasiados intentos. Espera unos minutos.", 429)
    d = request.get_json(silent=True) or {}
    username = (d.get("username") or "").strip().lower()
    u = User.query.filter_by(username=username).first()
    if not u or not check_password_hash(u.password_hash, d.get("password") or ""):
        _login_attempts[ip].append(time.time())
        return err("Usuario o contraseña incorrectos.", 401)
    session.clear()
    session.permanent = True
    session["uid"] = u.id
    return jsonify({"user": user_json(u)})


@app.post("/api/logout")
def logout():
    session.clear()
    return jsonify({"ok": True})


@app.get("/api/me")
def me():
    u = current_user()
    return jsonify({"user": user_json(u) if u else None})


@app.post("/api/password")
def change_password():
    u = current_user()
    if not u:
        return err("Inicia sesión.", 401)
    d = request.get_json(silent=True) or {}
    if not check_password_hash(u.password_hash, d.get("old") or ""):
        return err("La contraseña actual no es correcta.", 401)
    new = d.get("new") or ""
    if len(new) < 8:
        return err("La nueva contraseña debe tener al menos 8 caracteres.")
    u.password_hash = generate_password_hash(new)
    db.session.commit()
    return jsonify({"ok": True})


# ---------------------------------------------------------------- progreso
@app.post("/api/session")
def save_session():
    u = current_user()
    if not u:
        return err("Inicia sesión para guardar tu progreso.", 401)
    d = request.get_json(silent=True) or {}
    kind = d.get("kind")
    results = d.get("results") or []
    if kind not in KINDS or not isinstance(results, list) or not results or len(results) > 1000:
        return err("Datos de sesión no válidos.")
    clean = []
    for r in results:
        if not isinstance(r, dict):
            continue
        key, section, ok = str(r.get("key", ""))[:24], str(r.get("section", ""))[:80], bool(r.get("ok"))
        if key and section:
            clean.append((key, section, ok))
    if not clean:
        return err("Datos de sesión no válidos.")
    existing = {s.key: s for s in ItemStat.query.filter(ItemStat.user_id == u.id, ItemStat.key.in_({c[0] for c in clean}))}
    for key, section, ok in clean:
        s = existing.get(key)
        if not s:
            s = ItemStat(user_id=u.id, key=key, kind=kind, section=section, right=0, wrong=0)
            db.session.add(s)
            existing[key] = s
        if ok:
            s.right += 1
        else:
            s.wrong += 1
        s.last_ok = ok
        s.section = section
        s.updated_at = now()
    db.session.add(StudySession(user_id=u.id, kind=kind, mode=str(d.get("mode", ""))[:16],
                                total=len(clean), correct=sum(1 for c in clean if c[2])))
    db.session.commit()
    return jsonify({"ok": True})


@app.get("/api/stats")
def stats():
    u = current_user()
    if not u:
        return err("Inicia sesión.", 401)
    items = ItemStat.query.filter_by(user_id=u.id).all()
    by_section = defaultdict(lambda: {"seen": 0, "mastered": 0, "right": 0, "wrong": 0})
    for s in items:
        b = by_section[(s.kind, s.section)]
        b["seen"] += 1
        b["right"] += s.right
        b["wrong"] += s.wrong
        if s.last_ok and s.right > s.wrong:
            b["mastered"] += 1
    weak = [s.key for s in items if not s.last_ok]
    sessions = StudySession.query.filter_by(user_id=u.id).order_by(StudySession.created_at.desc()).all()
    days = sorted({s.created_at.date() for s in sessions}, reverse=True)
    streak, today = 0, now().date()
    if days and (today - days[0]).days <= 1:
        streak, prev = 1, days[0]
        for d in days[1:]:
            if (prev - d).days == 1:
                streak, prev = streak + 1, d
            else:
                break
    week_ago = now() - timedelta(days=7)
    return jsonify({
        "totals": {
            "answers": sum(s.right + s.wrong for s in items),
            "right": sum(s.right for s in items),
            "items_seen": len(items),
            "mastered": sum(1 for s in items if s.last_ok and s.right > s.wrong),
            "sessions": len(sessions),
            "week_sessions": sum(1 for s in sessions if s.created_at >= week_ago),
            "streak": streak,
        },
        "sections": [{"kind": k, "section": sec, **v} for (k, sec), v in by_section.items()],
        "weak": weak,
        "recent": [{"kind": s.kind, "mode": s.mode, "total": s.total, "correct": s.correct,
                    "at": s.created_at.isoformat() + "Z"} for s in sessions[:10]],
    })


@app.post("/api/reset")
def reset_progress():
    u = current_user()
    if not u:
        return err("Inicia sesión.", 401)
    ItemStat.query.filter_by(user_id=u.id).delete()
    StudySession.query.filter_by(user_id=u.id).delete()
    db.session.commit()
    return jsonify({"ok": True})


@app.get("/api/leaderboard")
def leaderboard():
    """Ranking semanal (solo nombre visible y número de respuestas correctas)."""
    week_ago = now() - timedelta(days=7)
    rows = (db.session.query(User.name, func.sum(StudySession.correct).label("pts"))
            .join(StudySession, StudySession.user_id == User.id)
            .filter(StudySession.created_at >= week_ago)
            .group_by(User.id, User.name).order_by(func.sum(StudySession.correct).desc()).limit(10).all())
    return jsonify({"top": [{"name": n, "points": int(p or 0)} for n, p in rows]})


if __name__ == "__main__":
    app.run(debug=True, port=int(os.environ.get("PORT", 5000)))
