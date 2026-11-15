import secrets
from fastapi import FastAPI, Form, Request
from fastapi.responses import HTMLResponse, RedirectResponse
from starlette.middleware.sessions import SessionMiddleware
from .config import Settings


def create_app() -> FastAPI:
    settings = Settings.from_env()
    app = FastAPI(title="Local Attendance")
    app.add_middleware(SessionMiddleware, secret_key=settings.session_secret, same_site="lax")

    @app.get("/health")
    def health() -> dict[str, str]:
        return {"status": "ok"}

    @app.get("/", response_class=HTMLResponse)
    def home(request: Request):
        if not request.session.get("teacher"):
            return RedirectResponse("/login", status_code=303)
        return HTMLResponse("<h1>Local Attendance</h1><p><a href='/students'>Students</a> · <a href='/attendance'>Take attendance</a> · <a href='/history'>History</a></p>")

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

    return app


app = create_app()
