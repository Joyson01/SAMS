#!/usr/bin/env bash
# ==============================================================================
# Generate Self-Signed TLS Certificates for Local Pilot / Staging Deployment
# ==============================================================================
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "${SCRIPT_DIR}/.." && pwd)"
CERTS_DIR="${ROOT_DIR}/infra/certs"

mkdir -p "${CERTS_DIR}"

DOMAIN="${1:-localhost}"
IP_ADDR="${2:-127.0.0.1}"

echo "Generating self-signed TLS certificates in ${CERTS_DIR}..."
echo "  Primary Domain: ${DOMAIN}"
echo "  SAN IP:         ${IP_ADDR}"

openssl req -x509 -nodes -days 365 -newkey rsa:2048 \
  -keyout "${CERTS_DIR}/key.pem" \
  -out "${CERTS_DIR}/cert.pem" \
  -subj "/C=US/ST=State/L=City/O=SAMS/OU=Attendance/CN=${DOMAIN}" \
  -addext "subjectAltName=DNS:${DOMAIN},DNS:localhost,IP:${IP_ADDR},IP:127.0.0.1"

chmod 600 "${CERTS_DIR}/key.pem"
chmod 644 "${CERTS_DIR}/cert.pem"

echo "✓ Certificate and key generated successfully:"
echo "  Cert: ${CERTS_DIR}/cert.pem"
echo "  Key:  ${CERTS_DIR}/key.pem"
