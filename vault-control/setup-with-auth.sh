#!/bin/bash
# Database setup with auth (reads password from .env)

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ENV_FILE="${SCRIPT_DIR}/.env"

if [ -f "$ENV_FILE" ]; then
    DB_PASSWORD=$(grep '^DB_PASSWORD=' "$ENV_FILE" | cut -d'=' -f2-)
fi

if [ -z "$DB_PASSWORD" ]; then
    DB_PASSWORD=$(openssl rand -hex 16)
    echo "Generated DB_PASSWORD: ${DB_PASSWORD}"
fi

DB_NAME="vault_control"

echo "Setting up PostgreSQL database for Vault Control..."

if ! pg_isready -q; then
    echo "PostgreSQL is not running. Starting..."
    sudo service postgresql start
    sleep 3
fi

echo "Setting PostgreSQL password..."
sudo -u postgres psql -c "ALTER USER postgres WITH PASSWORD '${DB_PASSWORD}';"

echo "Creating database '${DB_NAME}'..."
sudo -u postgres psql -tc "SELECT 1 FROM pg_database WHERE datname = '${DB_NAME}'" | grep -q 1 || \
    sudo -u postgres psql -c "CREATE DATABASE ${DB_NAME}"

echo "Applying schema..."
sudo -u postgres psql -d ${DB_NAME} -f server/database/schema.sql

echo ""
echo "Setup complete!"
echo "Default admin: admin / admin123"
echo ""
