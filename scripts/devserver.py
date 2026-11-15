"""Cross-platform development launcher. Only terminates child processes it starts."""
from __future__ import annotations
import argparse
import hashlib
import json
import os
from pathlib import Path
import secrets
import signal
import shutil
import socket
import subprocess
import sys
import time
import urllib.request

ROOT=Path(__file__).resolve().parents[1]

def ensure_free(port):
    with socket.socket() as sock:
        try: sock.bind(('127.0.0.1',port))
        except OSError as exc: raise RuntimeError(f'Port {port} is in use. Stop its owner or choose BACKEND_PORT / FRONTEND_PORT. No processes were killed.') from exc

def run(command, **kwargs):
    print('+ '+' '.join(map(str,command)),flush=True)
    subprocess.run(command,check=True,**kwargs)

def main():
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--check',action='store_true',help='Start both services, check HTTP readiness, then stop them')
    args=parser.parse_args()
    os.chdir(ROOT)
    backend_port=int(os.environ.get('BACKEND_PORT','8000'))
    frontend_port=int(os.environ.get('FRONTEND_PORT','5173'))
    ensure_free(backend_port);ensure_free(frontend_port)
    npm=shutil.which('npm')
    if not npm: raise RuntimeError('Node.js and npm are required. Install Node.js 20+ and rerun.')
    npm_cmd=['cmd','/c','npm'] if os.name=='nt' else [npm]
    env_path=Path(os.environ.get('ATTEDDEL_VENV',str(ROOT/'.venv-attedel')))
    python=env_path/('Scripts/python.exe' if os.name=='nt' else 'bin/python')
    uv=shutil.which('uv')
    if not python.exists():
        if uv:
            run([uv,'venv','--python','3.11',str(env_path)])
        elif (3,11)<=sys.version_info[:2]<(3,14):
            run([sys.executable,'-m','venv',str(env_path)])
        else:
            raise RuntimeError('Use Python 3.11–3.13, or install uv so the launcher can select Python 3.11.')
    digest=hashlib.sha256((ROOT/'requirements.txt').read_bytes()).hexdigest()
    marker=env_path/'.requirements-sha256'
    if not marker.exists() or marker.read_text()!=digest:
        if uv: run([uv,'pip','install','--python',str(python),'-r','requirements.txt'])
        else: run([str(python),'-m','pip','install','-r','requirements.txt'])
        marker.write_text(digest)
    if not (ROOT/'.env').exists():
        contents=(ROOT/'.env.example').read_text().replace('development-only-change-me-before-deploying',secrets.token_urlsafe(48))
        (ROOT/'.env').write_text(contents)
        if os.name!='nt': (ROOT/'.env').chmod(0o600)
    run(npm_cmd+['install'],cwd=ROOT/'frontend')
    env=os.environ.copy()
    env.update(AUTH_BYPASS='false',VITE_AUTH_BYPASS='false',BACKEND_PORT=str(backend_port),FRONTEND_PORT=str(frontend_port),PYTHONUNBUFFERED='1')
    children=[]
    try:
        children.append(subprocess.Popen([str(python),'-m','uvicorn','backend.app.main:app','--host','127.0.0.1','--port',str(backend_port)],env=env,start_new_session=os.name!="nt"))
        children.append(subprocess.Popen(npm_cmd+['run','dev','--','--host','127.0.0.1','--port',str(frontend_port),'--strictPort'],cwd=ROOT/'frontend',env=env,start_new_session=os.name!="nt"))
        health=None
        for _ in range(180):
            if any(p.poll() is not None for p in children): raise RuntimeError('A service exited. See the error above (dependencies, model files or database).')
            try:
                with urllib.request.urlopen(f'http://127.0.0.1:{backend_port}/health',timeout=2) as response: health=json.load(response)
                with urllib.request.urlopen(f'http://127.0.0.1:{frontend_port}',timeout=2) as response:
                    if response.status==200: break
            except Exception: time.sleep(1)
        else: raise RuntimeError('Startup timed out. Check model download and database connection. Run python -m scripts.check_models.')
        if health.get("database",{}).get("status") != "connected":
            raise RuntimeError("Database unavailable. Check DATABASE_URL and /health.")
        print(f'\nAttedDEL ready\nApp: http://localhost:{frontend_port}\nAPI: http://localhost:{backend_port}/api/v1/docs\nAI: {health.get("ai",{}).get("message","unknown")}\nFirst run: development seeds admin / Admin@12345 only when there are zero users.\nUse /setup or python -m scripts.create_admin for manual setup.\nPress Ctrl+C to stop both services.\n',flush=True)
        if args.check: return
        while all(p.poll() is None for p in children): time.sleep(1)
        raise RuntimeError('A service stopped. See its console output above.')
    except KeyboardInterrupt:
        print('\nStopping AttedDEL…',flush=True)
    finally:
        for child in reversed(children):
            if child.poll() is None:
                if os.name=='nt': subprocess.run(['taskkill','/PID',str(child.pid),'/T','/F'],capture_output=True)
                else: os.killpg(child.pid,signal.SIGTERM)
        for child in children:
            try: child.wait(timeout=8)
            except subprocess.TimeoutExpired: child.kill()

if __name__=='__main__':
    try: main()
    except (RuntimeError,subprocess.CalledProcessError) as exc:
        print(f'AttedDEL startup error: {exc}',file=sys.stderr)
        raise SystemExit(1)
