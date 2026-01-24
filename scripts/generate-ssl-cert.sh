#!/bin/bash

# Generate self-signed SSL certificate for local development
# Usage: bash scripts/generate-ssl-cert.sh

set -e

CERT_DIR="./certs"
KEY_FILE="$CERT_DIR/key.pem"
CERT_FILE="$CERT_DIR/cert.pem"

echo "=========================================="
echo "Generating Self-Signed SSL Certificate"
echo "=========================================="

# Create certs directory if it doesn't exist
mkdir -p "$CERT_DIR"

# Generate private key and certificate
echo "Generating RSA private key and self-signed certificate..."
openssl req -x509 -newkey rsa:4096 -keyout "$KEY_FILE" -out "$CERT_FILE" \
  -days 365 -nodes \
  -subj "/C=US/ST=State/L=City/O=Central Auth/CN=localhost" \
  -addext "subjectAltName=DNS:localhost,DNS:*.localhost,IP:127.0.0.1,IP:::1"

# Set proper permissions
chmod 600 "$KEY_FILE"
chmod 644 "$CERT_FILE"

echo ""
echo "✅ SSL certificate generated successfully!"
echo ""
echo "Certificate files:"
echo "  Private Key: $KEY_FILE"
echo "  Certificate: $CERT_FILE"
echo ""
echo "⚠️  This is a self-signed certificate for development only."
echo "   Browsers will show a security warning - this is expected."
echo ""
echo "To use these certificates, update your .env file:"
echo "  SSL_KEY_PATH=$KEY_FILE"
echo "  SSL_CERT_PATH=$CERT_FILE"
