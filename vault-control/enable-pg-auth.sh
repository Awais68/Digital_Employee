#!/bin/bash
# Enable password authentication for PostgreSQL
echo "Enabling password authentication for PostgreSQL..."

PG_HBA="/etc/postgresql/16/main/pg_hba.conf"

if [ ! -f "$PG_HBA" ]; then
    echo "ERROR: pg_hba.conf not found at $PG_HBA"
    exit 1
fi

# Backup
sudo cp "$PG_HBA" "${PG_HBA}.bak.$(date +%Y%m%d%H%M%S)"

# Update local connections to use scram-sha-256
sudo sed -i "s/^local.*all.*all.*peer/local   all             all                                     scram-sha-256/" "$PG_HBA"
sudo sed -i "s/^local.*all.*all.*md5/local   all             all                                     scram-sha-256/" "$PG_HBA"

# Reload PostgreSQL
sudo systemctl reload postgresql 2>/dev/null || sudo service postgresql reload 2>/dev/null

echo "PostgreSQL authentication updated. Reloading..."
pg_isready
