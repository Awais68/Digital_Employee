#!/bin/bash
# Database setup script for vault-control
echo "Setting up PostgreSQL database for Vault Control..."

DB_NAME="vault_control"
DB_USER="postgres"

# Check if PostgreSQL is running
if ! pg_isready -q; then
    echo "PostgreSQL is not running. Starting..."
    sudo service postgresql start
    sleep 3
fi

# Create database if not exists
echo "Creating database '$DB_NAME'..."
psql -U $DB_USER -tc "SELECT 1 FROM pg_database WHERE datname = '$DB_NAME'" | grep -q 1 || \
    psql -U $DB_USER -c "CREATE DATABASE $DB_NAME"

echo "Database created successfully."

# Run schema
echo "Applying schema..."
psql -U $DB_USER -d $DB_NAME -f server/database/schema.sql

echo ""
echo "Setup complete!"
echo ""
echo "Default admin credentials:"
echo "  Username: admin"
echo "  Password: admin123"
echo ""
echo "IMPORTANT: Change the default password after first login!"
echo "IMPORTANT: Update JWT_SECRET in .env for production!"
