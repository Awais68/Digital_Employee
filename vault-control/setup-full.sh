#!/bin/bash
# Full PostgreSQL + Auth Setup for Vault Control
# Run with: sudo bash setup-full.sh
# Reads DB_PASSWORD from .env or generates one

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ENV_FILE="${SCRIPT_DIR}/.env"

# Read password from .env or generate
if [ -f "$ENV_FILE" ]; then
    DB_PASSWORD=$(grep '^DB_PASSWORD=' "$ENV_FILE" | cut -d'=' -f2-)
fi

if [ -z "$DB_PASSWORD" ]; then
    DB_PASSWORD=$(openssl rand -hex 16)
    echo "Generated DB_PASSWORD: ${DB_PASSWORD}"
    # Update .env
    if [ -f "$ENV_FILE" ]; then
        sed -i "s/^DB_PASSWORD=.*/DB_PASSWORD=${DB_PASSWORD}/" "$ENV_FILE"
    else
        echo "DB_PASSWORD=${DB_PASSWORD}" >> "$ENV_FILE"
    fi
fi

DB_NAME="vault_control"
DB_USER="postgres"
PG_HBA="/etc/postgresql/16/main/pg_hba.conf"

echo "============================================"
echo "  Vault Control - PostgreSQL Auth Setup"
echo "============================================"
echo ""

# 1. Check PostgreSQL
echo "[1/5] Checking PostgreSQL..."
if ! pg_isready -q 2>/dev/null; then
    echo "  Starting PostgreSQL..."
    service postgresql start
    sleep 2
fi
echo "  ✓ PostgreSQL is running"

# 2. Set PostgreSQL password
echo "[2/5] Setting PostgreSQL password..."
su - postgres -c "psql -c \"ALTER USER postgres WITH PASSWORD '${DB_PASSWORD}';\"" 2>/dev/null || \
sudo -u postgres psql -c "ALTER USER postgres WITH PASSWORD '${DB_PASSWORD}';"
echo "  ✓ Password set"

# 3. Enable password auth in pg_hba.conf
echo "[3/5] Enabling password authentication..."
if [ -f "$PG_HBA" ]; then
    cp "$PG_HBA" "${PG_HBA}.bak.$(date +%Y%m%d%H%M%S)"
    
    if ! grep -q "^local.*all.*all.*scram-sha-256" "$PG_HBA" 2>/dev/null; then
        sed -i "s/^local.*all.*all.*peer/local   all             all                                     scram-sha-256/" "$PG_HBA"
        sed -i "s/^local.*all.*all.*md5/local   all             all                                     scram-sha-256/" "$PG_HBA"
    fi
    echo "  ✓ Authentication configured"
else
    echo "  WARNING: pg_hba.conf not found at $PG_HBA"
fi

# 4. Create database and apply schema
echo "[4/5] Creating database and applying schema..."

su - postgres -c "psql -tc \"SELECT 1 FROM pg_database WHERE datname = '${DB_NAME}'\"" 2>/dev/null | grep -q 1 || \
sudo -u postgres PGPASSWORD="${DB_PASSWORD}" psql -h localhost -U postgres -c "CREATE DATABASE ${DB_NAME};" 2>/dev/null || \
su - postgres -c "psql -c \"CREATE DATABASE ${DB_NAME};\""

echo "  ✓ Database '${DB_NAME}' ready"

su - postgres -c "psql -d ${DB_NAME} -f '${SCRIPT_DIR}/server/database/schema.sql'" 2>/dev/null || \
PGPASSWORD="${DB_PASSWORD}" psql -h localhost -U postgres -d ${DB_NAME} -f "${SCRIPT_DIR}/server/database/schema.sql" 2>/dev/null || \
su - postgres -c "psql -d ${DB_NAME} -f '${SCRIPT_DIR}/server/database/schema.sql'"

echo "  ✓ Schema applied"

# 5. Reload PostgreSQL
echo "[5/5] Reloading PostgreSQL..."
service postgresql reload 2>/dev/null || systemctl reload postgresql 2>/dev/null || true
sleep 1
echo "  ✓ PostgreSQL reloaded"

echo ""
echo "============================================"
echo "  Setup Complete!"
echo "============================================"
echo ""
echo "Database:    ${DB_NAME}"
echo "Host:        localhost:5432"
echo "User:        ${DB_USER}"
echo ""
echo "Default Admin:"
echo "  Username: admin"
echo "  Password: (set during first login or in .env)"
echo ""
echo "IMPORTANT: Change admin password after first login!"
echo "DB_PASSWORD has been saved to .env"
echo ""
