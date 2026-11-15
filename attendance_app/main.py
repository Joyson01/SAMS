import secrets
import numpy as np
from fastapi import FastAPI, File, Form, Request, UploadFile
from fastapi.responses import HTMLResponse, RedirectResponse
from starlette.middleware.sessions import SessionMiddleware
from sqlalchemy import select
from .config import Settings
from .db import make_session_factory
from .models import Classroom, Student, FaceEmbedding, AttendanceSession, AttendanceRecord
from .recognition.engine import InsightFaceEngine
from .recognition.matching import GalleryEntry, match_faces
from .services.students import enroll_student
from .services.attendance import confirm_attendance


def create_app() -> FastAPI:
    settings = Settings.from_env()
    app = FastAPI(title="Local Attendance")
    app.add_middleware(SessionMiddleware, secret_key=settings.session_secret, same_site="lax")
    sessions = make_session_factory(settings.data_dir)
    app.state.engine = InsightFaceEngine()

    def allowed(request: Request) -> bool: return bool(request.session.get("teacher"))
    def page(title: str, body: str) -> HTMLResponse:
        return HTMLResponse(f"<!doctype html><meta name='viewport' content='width=device-width'><style>body{{font:16px system-ui;max-width:800px;margin:30px auto;padding:16px}}input,select,button{{font:inherit;padding:10px;margin:5px}}.card{{padding:16px;margin:12px 0;border:1px solid #ddd;border-radius:12px}}</style><h1>{title}</h1><p><a href='/'>Home</a> · <a href='/students'>Students</a> · <a href='/attendance'>Take attendance</a> · <a href='/history'>History</a></p>{body}")

    @app.get("/health")
    def health() -> dict[str, str]:
        return {"status": "ok"}

    @app.get("/", response_class=HTMLResponse)
    def home(request: Request):
        if not request.session.get("teacher"):
            return RedirectResponse("/login", status_code=303)
        return page("Local Attendance","<div class='card'>Choose Students to enroll faces, then Take attendance.</div>")

    @app.get("/login", response_class=HTMLResponse)
    def login_page():
        return HTMLResponse("<h1>Teacher login</h1><form method='post'><input name='pin' type='password' inputmode='numeric' required><button>Open</button></form>")

    @app.post("/login")
    def login(request: Request, pin: str = Form(...)):
        if not secrets.compare_digest(pin, settings.teacher_pin):
            return HTMLResponse("Incorrect PIN", status_code=401)
        request.session["teacher"] = True
        return RedirectResponse("/", status_code=303)

    @app.post("/logout")
    def logout(request: Request):
        request.session.clear()
        return RedirectResponse("/login", status_code=303)

    @app.post("/classes")
    def create_class(request:Request,name:str=Form(...)):
        if not allowed(request): return RedirectResponse("/login",303)
        with sessions() as db: db.add(Classroom(name=name.strip())); db.commit()
        return RedirectResponse("/students",303)

    @app.get("/students",response_class=HTMLResponse)
    def students(request:Request):
        if not allowed(request): return RedirectResponse("/login",303)
        with sessions() as db:
            rooms=db.scalars(select(Classroom).order_by(Classroom.name)).all(); people=db.scalars(select(Student).where(Student.active.is_(True))).all()
            body="<form method='post' action='/classes'><input name='name' placeholder='Class name' required><button>Add class</button></form>"
            for c in rooms:
                body+=f"<div class='card'><b>{c.name}</b><form method='post' action='/students/enroll' enctype='multipart/form-data'><input type='hidden' name='classroom_id' value='{c.id}'><input name='roll_number' placeholder='Roll no.' required><input name='name' placeholder='Student name' required><input name='photos' type='file' accept='image/*' capture='user' multiple required><button>Enroll with 3 photos</button></form>"
                body+="".join(f"<div>{s.roll_number} — {s.name}</div>" for s in people if s.classroom_id==c.id)+"</div>"
        return page("Students",body)

    @app.post("/students/enroll")
    async def enroll(request:Request,classroom_id:int=Form(...),name:str=Form(...),roll_number:str=Form(...),photos:list[UploadFile]=File(...)):
        if not allowed(request): return RedirectResponse("/login",303)
        with sessions() as db: enroll_student(db,app.state.engine,classroom_id,name,roll_number,[await p.read() for p in photos])
        return RedirectResponse("/students",303)

    @app.get("/attendance",response_class=HTMLResponse)
    def attendance(request:Request):
        if not allowed(request): return RedirectResponse("/login",303)
        with sessions() as db: rooms=db.scalars(select(Classroom)).all()
        opts="".join(f"<option value='{c.id}'>{c.name}</option>" for c in rooms)
        return page("Take attendance",f"<form method='post' enctype='multipart/form-data'><select name='classroom_id'>{opts}</select><input name='subject' placeholder='Subject' required><input name='photo' type='file' accept='image/*' capture='environment' required><button>Recognize</button></form>")

    @app.post("/attendance",response_class=HTMLResponse)
    async def analyze(request:Request,classroom_id:int=Form(...),subject:str=Form(...),photo:UploadFile=File(...)):
        if not allowed(request): return RedirectResponse("/login",303)
        faces=app.state.engine.analyze(await photo.read())
        with sessions() as db:
            people=db.scalars(select(Student).where(Student.classroom_id==classroom_id,Student.active.is_(True))).all(); entries=[]
            for s in people:
                for e in s.embeddings: entries.append(GalleryEntry(s.id,np.frombuffer(e.vector,dtype=np.float32)))
            matches=match_faces(faces,entries); present={m.student_id for m in matches if m.student_id}
            checks="".join(f"<label><input type='checkbox' name='present' value='{s.id}' {'checked' if s.id in present else ''}>{s.roll_number} — {s.name}</label><br>" for s in people)
        return page("Review attendance",f"<form method='post' action='/attendance/confirm'><input type='hidden' name='classroom_id' value='{classroom_id}'><input type='hidden' name='subject' value='{subject}'>{checks}<button>Confirm attendance</button></form><p>{sum(m.student_id is None for m in matches)} unknown face(s)</p>")

    @app.post("/attendance/confirm")
    def confirm(request:Request,classroom_id:int=Form(...),subject:str=Form(...),present:list[int]=Form(default=[])):
        if not allowed(request): return RedirectResponse("/login",303)
        with sessions() as db: confirm_attendance(db,classroom_id,subject,set(present),{})
        return RedirectResponse("/history",303)

    @app.get("/history",response_class=HTMLResponse)
    def history(request:Request):
        if not allowed(request): return RedirectResponse("/login",303)
        with sessions() as db:
            rows=db.scalars(select(AttendanceSession).order_by(AttendanceSession.id.desc())).all(); body=""
            for a in rows:
                records=db.scalars(select(AttendanceRecord).where(AttendanceRecord.attendance_session_id==a.id)).all(); body+=f"<div class='card'><b>{a.confirmed_at:%Y-%m-%d %H:%M}</b> — {sum(r.status=='present' for r in records)} present / {len(records)} students</div>"
        return page("Attendance history",body or "<p>No attendance yet.</p>")

    return app


app = create_app()
