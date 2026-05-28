#!/bin/bash
# Database setup script for vault-control
# Reads DB_PASSWORD from .env or generates one

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ENV_FILE="${SCRIPT_DIR}/.env"

if [ -f "$ENV_FILE" ]; then
    DB_PASSWORD=$(grep '^DB_PASSWORD=' "$ENV_FILE" | cut -d'=' -f2-)
fi

if [ -z "$DB_PASSWORD" ]; then
    DB_PASSWORD=$(openssl rand -hex 16)
    if [ -f "$ENV_FILE" ]; then
        sed -i "s/^DB_PASSWORD=.*/DB_PASSWORD=${DB_PASSWORD}/" "$ENV_FILE"
    else
        echo "DB_PASSWORD=${DB_PASSWORD}" > "$ENV_FILE"
    fi
fi

DB_NAME="vault_control"
DB_USER="postgres"

echo "Setting up PostgreSQL database for Vault Control..."

if ! pg_isready -q; then
    echo "PostgreSQL is not running. Starting..."
    sudo service postgresql start
    sleep 3
fi

echo "Creating database '$DB_NAME'..."
PGPASSWORD="$DB_PASSWORD" psql -h localhost -U $DB_USER -tc "SELECT 1 FROM pg_database WHERE datname = '$DB_NAME'" 2>/dev/null | grep -q 1 || \
su - postgres -c "psql -tc \"SELECT 1 FROM pg_database WHERE datname = '$DB_NAME'\"" 2>/dev/null | grep -q 1 || \
PGPASSWORD="$DB_PASSWORD" psql -h localhost -U $DB_USER -c "CREATE DATABASE $DB_NAME" 2>/dev/null || \
su - postgres -c "psql -c \"CREATE DATABASE $DB_NAME\""

echo "Applying schema..."
PGPASSWORD="$DB_PASSWORD" psql -h localhost -U $DB_USER -d $DB_NAME -f server/database/schema.sql 2>/dev/null || \
su - postgres -c "psql -d $DB_NAME -f $(pwd)/server/database/schema.sql"

echo ""
echo "Setup complete!"
echo "Default admin credentials are in the database (set during first run)"
