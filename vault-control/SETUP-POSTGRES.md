# PostgreSQL Auth Setup

## Quick Start

```bash
# 1. Set PostgreSQL password (requires sudo)
sudo -u postgres psql -c "ALTER USER postgres WITH PASSWORD '$(openssl rand -hex 16)';"

# 2. Enable password auth
sudo sed -i 's/^local.*all.*all.*peer/local   all   all   scram-sha-256/' /etc/postgresql/16/main/pg_hba.conf
sudo systemctl reload postgresql

# 3. Create database
createdb -h localhost -U postgres vault_control

# 4. Apply schema
psql -h localhost -U postgres -d vault_control -f server/database/schema.sql

# 5. Update .env with your DB password
```

## Default Admin
- **Username:** admin
- **Password:** admin123

⚠️ Change the admin password after first login!
