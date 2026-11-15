# Troubleshooting

## Registration or setup

Use at least 8 characters with a letter and digit (at most 72 UTF-8 bytes). Duplicate username/email returns 409; invalid fields return 422. Public signup creates only STUDENT. Staff accounts are created in Users by an administrator. A student account needs an administrator to link its roll number and student code before My Attendance has records.

Setup closes when an ADMIN exists, including a disabled admin. Ask another administrator to reactivate/reset an account; setup is not a bypass for existing installations. `python -m scripts.create_admin` creates the first admin interactively. The development seed runs only with zero users and only in development. Change its password before production. Production startup/login rejects the default development admin password; production also requires a non-default SECRET_KEY.

## Camera permissions, black video, device in use

Open `http://localhost:5173` or `http://127.0.0.1:5173` on the laptop. Plain HTTP at a LAN IP is not a secure context and cannot access the camera. Allow the camera in browser site settings, close video-call apps, choose the correct device, and click Stop/Start camera. Check OS-level camera privacy settings. If permissions are denied, reset them for this origin. Changing ports changes the browser origin.

For optional phone testing, activate the backend venv and start its server, then `cd frontend && npm run dev:https`. The HTTPS dev server binds the LAN interfaces. Trust its self-signed certificate on the phone, and use a reachable backend/proxy configuration. Self-signed trust and physical phone streaming have not been validated here. The main launcher intentionally binds localhost.

## AI engine unavailable / models will not download

Activate `.venv-attedel` and run `python -m scripts.check_models`. It runs real detection and embeddings on InsightFace's t1 sample and prints the ONNX providers. On download failure it prints manual-install instructions. Get buffalo_l.zip from the official InsightFace v0.7 model release and extract its ONNX files directly into `~/.insightface/models/buffalo_l/`, including `det_10g.onnx` and `w600k_r50.onnx`. Avoid a second nested buffalo_l directory. Restart and check `/health` and System Health.

The app can start with an unavailable AI engine so login/data management remain reachable. Enrollment and recognition need working model files. The clean-source startup test used an already cached model set; downloading from an empty model cache is not verified.

## Port already in use

The launcher reports the occupied port without killing its owner. Close your earlier server or choose other ports. Linux/macOS: `BACKEND_PORT=18080 FRONTEND_PORT=15173 ./start.sh`. PowerShell: set `$env:BACKEND_PORT='18080'` and `$env:FRONTEND_PORT='15173'` before running `./start.bat`. The Vite proxy follows BACKEND_PORT. Ctrl+C stops this launcher's own processes.

## Install/startup failures

Python 3.11 is the verified version. A system Python 3.14 can run the launcher if uv is installed; uv then creates a Python 3.11 app environment. Otherwise install Python 3.11–3.13. Node.js/npm are required. Watch the first dependency error rather than repeatedly restarting. The launcher retries dependency installation when requirements change. `.env.example` documents the FastAPI configuration; the old teacher-PIN app's settings are separate.

## Slow CPU, poor recognition or false matches

Use a close, evenly lit face and a sharp camera. Avoid backlighting, motion blur, small faces and extreme head angles. Enrollment reports sharpness, brightness and approximate pose. Checks run sequentially: slow CPU reduces FPS instead of queuing frames. The real-image HTTP check reached PRESENT in 1.39 seconds on this machine, but this is not a latency guarantee for other laptops.

Compare Recognition Test's top candidates and margin. Similarity is not a calibrated probability. Higher verified thresholds and larger margins reduce false matches at the cost of more unknowns. Live changes are development-only and reset on restart. Do not force an uncertain face into attendance; use reviewed photo/manual attendance with remarks. A single-pose test is not a substitute for seven-pose enrollment. Basic passive liveness can accept a displayed photograph; this is not a high-assurance anti-spoofing system.

## Database and runtime deployment

SQLite is the development default; PostgreSQL is configurable but was not integration-tested in this run. Use a single backend worker: recognition galleries, trackers and per-stream locks are process-local. The SQL attendance uniqueness constraint is retained. Multiple workers need shared gallery invalidation/tracking before they can be supported reliably.

Enrollment persists in SQL face_profiles and refreshes the runtime gallery. Retakes replace a pose. Do not load random vectors into the gallery. The demo seeder adds academic data only and never resets existing records or creates embeddings. Keep `.env`, database files, enrollment images and embedding artifacts out of version control.
