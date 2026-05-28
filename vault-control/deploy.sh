#!/usr/bin/env bash
set -euo pipefail

# ─────────────────────────────────────────────────────────────
# Digital Employee — Production Deploy Script
# Supports: bare-metal, Docker Compose, Oracle Cloud (OCI)
# ─────────────────────────────────────────────────────────────

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
cd "$SCRIPT_DIR"

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
NC='\033[0m'

log()  { echo -e "${GREEN}[✓]${NC} $1"; }
warn() { echo -e "${YELLOW}[!]${NC} $1"; }
err()  { echo -e "${RED}[✗]${NC} $1"; }
info() { echo -e "${CYAN}[i]${NC} $1"; }

# ── Pre-flight checks ───────────────────────────────────────
preflight() {
  info "Running pre-flight checks..."

  if [[ ! -f .env ]]; then
    warn "No .env file found. Copying from .env.example..."
    if [[ -f .env.example ]]; then
      cp .env.example .env
      warn "Edit .env with your secrets before deploying!"
    else
      err "No .env or .env.example found. Create one first."
      exit 1
    fi
  fi

  if ! command -v docker &>/dev/null; then
    err "Docker is not installed. Install it first."
    info "  curl -fsSL https://get.docker.com | sh"
    exit 1
  fi

  if ! docker compose version &>/dev/null; then
    warn "Docker Compose v2 not found; trying docker-compose..."
    if ! command -v docker-compose &>/dev/null; then
      err "Docker Compose is not installed."
      exit 1
    fi
  fi

  log "Pre-flight checks passed"
}

# ── Build all Docker images ──────────────────────────────────
build() {
  info "Building Docker images..."
  docker compose -f docker-compose.prod.yml build --pull
  log "Build complete"
}

# ── Start services ──────────────────────────────────────────
start() {
  info "Starting services..."
  docker compose -f docker-compose.prod.yml up -d
  log "Services started"

  info "Waiting for backend health check..."
  sleep 5
  if curl -sf http://localhost:3000/api/health &>/dev/null; then
    log "Backend is healthy"
  else
    warn "Backend health check pending — check logs: docker compose logs backend"
  fi

  echo -e "\n${GREEN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
  echo -e "${GREEN}  Digital Employee is running!${NC}"
  echo -e "${GREEN}  Frontend: http://localhost${NC}"
  echo -e "${GREEN}  Backend:  http://localhost:3000${NC}"
  echo -e "${GREEN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}\n"
}

# ── Stop services ───────────────────────────────────────────
stop() {
  info "Stopping services..."
  docker compose -f docker-compose.prod.yml down
  log "Services stopped"
}

# ── Restart services ────────────────────────────────────────
restart() {
  stop
  start
}

# ── Show logs ───────────────────────────────────────────────
logs() {
  docker compose -f docker-compose.prod.yml logs -f "$@"
}

# ── Update (pull + rebuild + restart) ───────────────────────
update() {
  info "Pulling latest images..."
  docker compose -f docker-compose.prod.yml pull
  build
  restart
  log "Update complete"
}

# ── Backup PostgreSQL database ──────────────────────────────
backup() {
  local backup_dir="${BACKUP_DIR:-./backups}"
  mkdir -p "$backup_dir"
  local filename="de-backup-$(date +%Y%m%d-%H%M%S).sql"

  info "Backing up PostgreSQL database..."
  docker compose -f docker-compose.prod.yml exec -T postgres \
    pg_dump -U postgres vault_control > "$backup_dir/$filename"
  log "Backup saved: $backup_dir/$filename"
}

# ── Restore PostgreSQL database ─────────────────────────────
restore() {
  local file="$1"
  if [[ ! -f "$file" ]]; then
    err "Backup file not found: $file"
    exit 1
  fi

  warn "This will OVERWRITE the current database!"
  read -rp "Are you sure? (y/N) " confirm
  if [[ "$confirm" != "y" ]]; then
    info "Restore cancelled."
    exit 0
  fi

  info "Restoring database from $file..."
  docker compose -f docker-compose.prod.yml exec -T postgres \
    psql -U postgres vault_control < "$file"
  log "Database restored"
}

# ── Oracle Cloud (OCI) setup ────────────────────────────────
oracle() {
  info "Setting up for Oracle Cloud (OCI)..."

  if ! command -v oci &>/dev/null; then
    warn "OCI CLI not found. Installing..."
    bash -c "$(curl -L https://raw.githubusercontent.com/oracle/oci-cli/master/scripts/install/install.sh)"
  fi

  # Check for OCI config
  if [[ ! -f ~/.oci/config ]]; then
    err "OCI config not found at ~/.oci/config"
    info "Run: oci setup config"
    exit 1
  fi

  log "OCI CLI is configured"

  info "Creating OCI resources if needed..."

  local COMPARTMENT_OCID="${OCI_COMPARTMENT_OCID:-}"
  if [[ -z "$COMPARTMENT_OCID" ]]; then
    COMPARTMENT_OCID=$(oci iam compartment list --query "data[0].id" --raw-output 2>/dev/null || true)
  fi

  if [[ -z "$COMPARTMENT_OCID" ]]; then
    err "Could not determine compartment OCID. Set OCI_COMPARTMENT_OCID in .env"
    exit 1
  fi

  local INSTANCE_NAME="${OCI_INSTANCE_NAME:-digital-employee}"

  info "Checking for existing instance..."
  local EXISTING
  EXISTING=$(oci compute instance list \
    --compartment-id "$COMPARTMENT_OCID" \
    --display-name "$INSTANCE_NAME" \
    --query "data[0].id" --raw-output 2>/dev/null || true)

  if [[ -n "$EXISTING" ]]; then
    log "Instance $INSTANCE_NAME already exists (OCID: $EXISTING)"
    info "SSH: ssh -i ~/.ssh/opc opc@<public-ip>"
  else
    warn "No existing instance found. Create one via OCI Console:"
    info "  Shape: VM.Standard.E2.1.Micro (Always Free)"
    info "  Image: Canonical Ubuntu 22.04"
    info "  Subnet: Public"
    info "  Add SSH key"
    info "  After creation, run this script on the instance."
  fi

  echo -e "\n${YELLOW}OCI Deployment steps:${NC}"
  echo "  1. SSH into OCI instance"
  echo "  2. Install Docker + Docker Compose"
  echo "  3. Clone repo: git clone <repo> digital-employee"
  echo "  4. cp .env.example .env && edit secrets"
  echo "  5. Run: ./deploy.sh build && ./deploy.sh start"
  echo "  6. Open ports 80, 443, 3000 in OCI Security List"
}

# ── Status ──────────────────────────────────────────────────
status() {
  docker compose -f docker-compose.prod.yml ps
  echo ""
  docker compose -f docker-compose.prod.yml top 2>/dev/null || true
}

# ── Cleanup ─────────────────────────────────────────────────
cleanup() {
  warn "This will remove ALL containers, volumes, and the database!"
  read -rp "Are you sure? (y/N) " confirm
  if [[ "$confirm" != "y" ]]; then
    info "Cleanup cancelled."
    exit 0
  fi

  info "Stopping and removing everything..."
  docker compose -f docker-compose.prod.yml down -v
  log "Cleanup complete"
}

# ── Help ────────────────────────────────────────────────────
help() {
  echo "Digital Employee — Deploy Script"
  echo ""
  echo "Usage: ./deploy.sh <command>"
  echo ""
  echo "Commands:"
  echo "  build             Build all Docker images"
  echo "  start             Start all services"
  echo "  stop              Stop all services"
  echo "  restart           Restart all services"
  echo "  logs [service]    Tail logs (optional: filter by service)"
  echo "  update            Pull, rebuild, and restart"
  echo "  backup            Backup PostgreSQL database"
  echo "  restore <file>    Restore PostgreSQL database from backup"
  echo "  oracle            Oracle Cloud setup guide"
  echo "  status            Show service status"
  echo "  cleanup           Remove ALL containers and volumes"
  echo "  preflight         Run pre-flight checks only"
}

# ── Main ────────────────────────────────────────────────────
case "${1:-help}" in
  preflight) preflight ;;
  build)     preflight && build ;;
  start)     start ;;
  stop)      stop ;;
  restart)   restart ;;
  logs)      shift; logs "$@" ;;
  update)    update ;;
  backup)    backup ;;
  restore)   restore "${2:-}" ;;
  oracle)    oracle ;;
  status)    status ;;
  cleanup)   cleanup ;;
  help|*)    help ;;
esac
