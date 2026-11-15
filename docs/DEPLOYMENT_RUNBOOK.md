# SAMS / AttedDEL Production Deployment Runbook

This document is the **single source of truth** for deploying, operating, maintaining, and recovering the AttedDEL (Smart Attendance Management System) platform for a private college pilot.

---

## 1. System Architecture & Pilot Scope

The system consists of three primary tiers:

```
┌─────────────────────────────────────────────────────────────┐
│                       Client Tier                           │
│  • Mobile Browser (Rear-Camera Scan / Group Photo / QR)    │
│  • Desktop / Laptop Browser (Roster Review / Session Start) │
└──────────────────────────────┬──────────────────────────────┘
                               │ HTTPS (Port 443) / WSS
┌──────────────────────────────▼──────────────────────────────┐
│                  Nginx Reverse Proxy & TLS                  │
│  • Terminates TLS (Port 443) & Enforces HTTPS               │
│  • Serves Compiled React SPA Bundles                        │
│  • Proxies /api/ and /ws/ to FastAPI Backend                │
│  • Buffers and allows large media uploads up to 25MB        │
└──────────────────────────────┬──────────────────────────────┘
                               │ HTTP / WS
┌──────────────────────────────▼──────────────────────────────┐
│                    FastAPI Backend (Port 8000)              │
│  • Authentication (JWT & Revocable Session Store)           │
│  • Computer Vision Pipeline (SCRFD Detection + ArcFace R50) │
│  • Attendance State Machine & Roster Verification           │
│  • Static File Storage (/data/uploads, /outputs)            │
└──────────────────────────────┬──────────────────────────────┘
                               │ AsyncPG (Port 5432)
┌──────────────────────────────▼──────────────────────────────┐
│               PostgreSQL 16 + pgvector Database             │
│  • Relational Academic & Attendance Schema                  │
│  • Vector Store & Biometric Gallery Mirror                  │
└─────────────────────────────────────────────────────────────┘
```

### Core Product Workflow
1. **Session Setup**: Lecturer opens the class session on a desktop/laptop or directly on a phone.
2. **Attendance Capture**:
   - **On Phone**: Lecturer scans student faces using the rear camera (`facingMode: environment`) or snaps a classroom group photograph.
   - **Laptop + Phone Pairing (Optional)**: Lecturer clicks **Pair phone** on their laptop to display a secure QR code. The lecturer or assistant scans the QR with their phone, which opens a dedicated token-scoped capture portal while the laptop displays live roster updates.
3. **Review & Corrections**: Lecturer reviews the attendance roster, manually adjusts any missed or false detections (`MANUAL_PRESENT`, `MANUAL_ABSENT`), and reviews unverified students.
4. **Finalization**: Lecturer saves the session (`COMPLETED`). Any remaining unverified students are automatically marked `ABSENT`, and the session is locked against further scans.

---

## 2. Infrastructure Prerequisites

| Component | Minimum Specification | Recommended (Pilot) |
| :--- | :--- | :--- |
| **CPU** | 4 Cores (x86_64) | 8 Cores (AVX2 support for ONNX Runtime) |
| **RAM** | 8 GB | 16 GB |
| **Disk** | 25 GB SSD | 50 GB NVMe SSD |
| **OS** | Ubuntu 22.04+ / Debian 12 / RHEL 9 | Ubuntu 24.04 LTS |
| **Docker** | Docker Engine 24.0+ & Compose v2 | Docker Engine 26.0+ |
| **Network** | Static Local LAN IP or Institutional FQDN | Institutional FQDN with DNS entry |

---

## 3. InsightFace Model Licensing & Regulatory Advisory

> [!WARNING]
> **InsightFace License Notice**: The bundled face recognition models (`buffalo_l`: SCRFD `det_10g.onnx` and ArcFace `w600k_r50.onnx`) are distributed by DeepInsight under a **Non-Commercial / Academic Research Only License**.
> - **Permitted**: Use within an educational institution for non-commercial academic research, pilot evaluation, or internal educational use.
> - **Restricted**: Commercial deployment, SaaS commercialization, or fee-charging enterprise usage requires a commercial license agreement from InsightFace, or migration to an open-source permissive model (e.g., AdaFace or FaceNet with Apache 2.0 / MIT weights).

> [!IMPORTANT]
> **Biometric Privacy Compliance**: In accordance with student privacy regulations (FERPA, GDPR, or applicable national data protection acts):
> - Obtain written institutional and student consent before capturing face enrollment templates.
> - Student biometric data is stored as non-invertible 512-dimensional float32 vector embeddings.
> - Raw enrollment images stored under `data/enrollment_images/` should be encrypted at rest and restricted via file system permissions.

---

## 4. HTTPS & TLS Configuration (Strict Camera Requirement)

Mobile web browsers (Apple Safari on iOS and Google Chrome on Android) **strictly disable** access to the camera (`navigator.mediaDevices.getUserMedia`) when accessed over insecure HTTP, unless the hostname is literally `localhost`. When deploying on an institutional LAN IP (e.g. `192.168.1.150`) or internal domain (`attendance.college.local`), **HTTPS on port 443 is mandatory**.

### Option A: Local Pilot Self-Signed SAN Certificate
Use the included script to generate a 2048-bit RSA TLS certificate with Subject Alternative Names (SAN) for your host IP and hostname:

```bash
# Generate certs for your server's local LAN IP (replace with your server IP)
./scripts/generate_self_signed_cert.sh attendance.college.local 192.168.1.150
```
This writes:
- `infra/certs/cert.pem`
- `infra/certs/key.pem`

*Note: Mobile browsers will show a certificate warning when using self-signed certs. Tap "Advanced -> Proceed" or install the root certificate into the mobile device profile.*

### Option B: Trusted Local CA via `mkcert` (Recommended for Internal Pilot)
To prevent mobile security warnings across testing phones without a public domain:
```bash
# On your admin workstation:
sudo apt install libnss3-tools
curl -JLO "https://dl.filippo.io/mkcert/latest?for=linux/amd64"
chmod +x mkcert-v*-linux-amd64 && sudo mv mkcert-v*-linux-amd64 /usr/local/bin/mkcert
mkcert -install

# Generate certs for server IP and hostname
mkcert -cert-file infra/certs/cert.pem -key-file infra/certs/key.pem attendance.college.local 192.168.1.150 localhost 127.0.0.1

# Install mkcert's root CA (rootCA.pem) onto test faculty phones via AirDrop, Email, or local download
```

### Option C: Production Public FQDN (Let's Encrypt / Certbot)
If the server has a public domain name (`attendance.college.edu`):
```bash
sudo certbot certonly --standalone -d attendance.college.edu
cp /etc/letsencrypt/live/attendance.college.edu/fullchain.pem infra/certs/cert.pem
cp /etc/letsencrypt/live/attendance.college.edu/privkey.pem infra/certs/key.pem
```

---

## 5. First-Boot & Deployment Setup (Step-by-Step)

Follow these exact commands to boot a fresh deployment.

### Step 1: Clone Repository and Checkout Production Branch
```bash
git clone https://github.com/Joyson01/SAMS.git /opt/sams
cd /opt/sams
git checkout deployment/pilot-readiness
```

### Step 2: Configure Environment Variables
Copy `.env.example` to `.env` and generate production secrets:
```bash
cp .env.example .env

# Generate a cryptographically secure 64-character SECRET_KEY
JWT_SECRET=$(openssl rand -hex 32)
sed -i "s|SECRET_KEY=.*|SECRET_KEY=\"${JWT_SECRET}\"|g" .env
sed -i "s|ENVIRONMENT=.*|ENVIRONMENT=\"production\"|g" .env
sed -i "s|DEBUG=.*|DEBUG=false|g" .env

# Configure Postgres Credentials
DB_PASSWORD=$(openssl rand -hex 16)
sed -i "s|POSTGRES_PASSWORD=.*|POSTGRES_PASSWORD=\"${DB_PASSWORD}\"|g" .env
sed -i "s|DATABASE_URL=.*|DATABASE_URL=\"postgresql+asyncpg://postgres:${DB_PASSWORD}@postgres:5432/atteddel_db\"|g" .env
sed -i "s|DATABASE_SYNC_URL=.*|DATABASE_SYNC_URL=\"postgresql://postgres:${DB_PASSWORD}@postgres:5432/atteddel_db\"|g" .env

# Set Base App URL for Mobile QR Code Pairing (use your server LAN IP or FQDN)
echo "VITE_APP_URL=https://192.168.1.150" >> .env
```

### Step 3: Generate or Place TLS Certificates
```bash
./scripts/generate_self_signed_cert.sh attendance.college.local 192.168.1.150
```

### Step 4: Build and Launch Containers
```bash
docker compose up -d --build
```

### Step 5: Verify Container Health
```bash
docker compose ps
curl -k https://localhost/health
```
Expected output:
```json
{
  "status": "healthy",
  "service": "AttedDEL — Smart Attendance Management System",
  "version": "1.0.0",
  "database": {
    "status": "connected",
    "type": "PostgreSQL ...",
    "latency_ms": 1.45
  }
}
```

### Step 6: Bootstrap Initial Administrator / Faculty Account
Execute the idempotent bootstrapping script inside the running backend container:
```bash
docker compose exec backend python -m scripts.bootstrap_admin \
  --username college_admin \
  --email admin@college.edu \
  --password "InitialSecurePass2026!" \
  --role ADMIN \
  --full-name "Campus Lead Administrator"
```

### Step 7 (Optional): Seed Demonstration Curriculum
If you need sample classes, subjects, and timetable slots for testing:
```bash
docker compose exec backend python -m scripts.seed_demo_data
```

---

## 6. Day-2 Operations & Maintenance

### Checking Service Logs
```bash
# Stream backend logs (FastAPI + CV inference)
docker compose logs -f --tail=100 backend

# Stream proxy and access logs (Nginx)
docker compose logs -f --tail=100 frontend

# Check PostgreSQL database status
docker compose logs -f --tail=50 postgres
```

### Stopping and Restarting Services
```bash
# Graceful restart
docker compose restart

# Complete stop
docker compose down

# Start up without rebuilding
docker compose up -d
```

### Managing Student Face Vector Gallery
Student embeddings are stored in `data/enrollment_images/` and the database gallery. If manual embeddings need synchronization:
```bash
# Force resynchronization of in-memory gallery from database
curl -X POST https://localhost/api/v1/sync/gallery \
  -H "Authorization: Bearer <ADMIN_OR_FACULTY_TOKEN>" \
  -k
```

---

## 7. Backup & Restore Procedures

### Automated Database Backup
Execute a live dump of the PostgreSQL database without downtime:
```bash
TIMESTAMP=$(date +"%Y%m%d_%H%M%S")
mkdir -p /opt/sams/backups

docker compose exec -T postgres pg_dump -U postgres atteddel_db \
  | gzip > "/opt/sams/backups/db_${TIMESTAMP}.sql.gz"

echo "Backup created at /opt/sams/backups/db_${TIMESTAMP}.sql.gz"
```

### Backing Up Media & Biometric Data
```bash
tar -czvf "/opt/sams/backups/media_${TIMESTAMP}.tar.gz" \
  /opt/sams/data/enrollment_images \
  /opt/sams/data/uploads \
  /opt/sams/outputs
```

### Database Restore Procedure
To restore a database backup:
```bash
# 1. Stop backend traffic
docker compose stop backend frontend

# 2. Drop existing connections and restore
gunzip -c /opt/sams/backups/db_YYYYMMDD_HHMMSS.sql.gz | \
  docker compose exec -T postgres psql -U postgres -d atteddel_db

# 3. Restart backend and frontend
docker compose start backend frontend
```

### Media Restore Procedure
```bash
tar -xzvf /opt/sams/backups/media_YYYYMMDD_HHMMSS.tar.gz -C /
```

---

## 8. Zero-Downtime Update & Rollback Procedures

### Performing an Application Update
```bash
cd /opt/sams

# 1. Capture a pre-update backup snapshot
./scripts/backup.sh || docker compose exec -T postgres pg_dump -U postgres atteddel_db > pre_update.sql

# 2. Fetch latest changes
git fetch origin
git checkout deployment/pilot-readiness
git pull origin deployment/pilot-readiness

# 3. Rebuild and restart containers
docker compose up -d --build

# 4. Verify system health
curl -k -f https://localhost/health || echo "Deployment health check failed!"
```

### Rollback Procedure
If an issue occurs after deploying a new release:
```bash
cd /opt/sams

# 1. Revert to previous working git tag or commit
git checkout <PREVIOUS_STABLE_COMMIT_OR_TAG>

# 2. Restore database if schema changes were introduced
docker compose exec -T postgres psql -U postgres -d atteddel_db < pre_update.sql

# 3. Rebuild and launch containers from clean state
docker compose up -d --build --force-recreate

# 4. Verify health
curl -k -f https://localhost/health
```

---

## 9. Troubleshooting & Common Pitfalls

| Symptom | Root Cause | Solution |
| :--- | :--- | :--- |
| **"Camera access denied" or `navigator.mediaDevices` undefined on phone** | Phone connected over plain HTTP (`http://192.168.x.x`). Mobile browsers disable camera on insecure origins. | Ensure phone accesses `https://<ip>` on port 443. Accept the TLS certificate warning or install local CA. |
| **QR code shows `http://localhost:5173` on laptop** | `VITE_APP_URL` was not configured prior to frontend build. | Set `VITE_APP_URL=https://<SERVER_IP>` in `.env` and rebuild frontend container (`docker compose up -d --build frontend`). |
| **HTTP 413 Payload Too Large on Group Photo Upload** | Uploaded classroom photo exceeds Nginx limit. | Nginx has been configured with `client_max_body_size 25M;`. Ensure custom reverse proxies also configure `25M`. |
| **Initial Login Fails / No Admin Account** | Fresh database has no pre-existing admin accounts. Public registration is restricted to `STUDENT`. | Run `docker compose exec backend python -m scripts.bootstrap_admin` to create the initial admin account. |
| **First-Frame Camera Lag** | ONNX Runtime cold-start and gallery vector initialization. | The backend lifespan automatically runs `get_pipeline()` and `sync_gallery_from_db()` on boot, eliminating runtime startup delay. |
