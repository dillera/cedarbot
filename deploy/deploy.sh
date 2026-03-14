#!/usr/bin/env bash
#
# CedarBot deploy script — idempotent setup for Linux hosts.
#
# Installs/updates the backend (Python/FastAPI) and frontend (Next.js),
# manages systemd services and nginx config without disrupting existing
# nginx sites on the host.
#
# Usage:
#   sudo ./deploy/deploy.sh              # full deploy (install + update)
#   sudo ./deploy/deploy.sh --update     # pull latest code and restart services
#
# Expects:
#   - Ubuntu/Debian-family Linux (apt)
#   - Script is run from the repo root (or the repo will be cloned)
#   - Root / sudo privileges
#
set -euo pipefail

# ── Configuration ─────────────────────────────────────────────────────────────

INSTALL_DIR="/opt/cedarbot"
REPO_URL="https://github.com/dillera/cedarbot.git"
BRANCH="ascendkit"
SERVICE_USER="cedarbot"
SERVICE_GROUP="cedarbot"
PYTHON_MIN="3.12"
NODE_MIN="20"

NGINX_CONF_NAME="cedarbot.conf"
NGINX_AVAILABLE="/etc/nginx/sites-available"
NGINX_ENABLED="/etc/nginx/sites-enabled"
SYSTEMD_DIR="/etc/systemd/system"

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
NC='\033[0m'

log()  { echo -e "${GREEN}[cedarbot]${NC} $*"; }
warn() { echo -e "${YELLOW}[cedarbot]${NC} $*"; }
err()  { echo -e "${RED}[cedarbot]${NC} $*" >&2; }
step() { echo -e "\n${CYAN}── $* ──${NC}"; }

# ── Preflight checks ─────────────────────────────────────────────────────────

if [[ $EUID -ne 0 ]]; then
    err "This script must be run as root (or with sudo)."
    exit 1
fi

UPDATE_ONLY=false
if [[ "${1:-}" == "--update" ]]; then
    UPDATE_ONLY=true
fi

# ── Helper: compare files, return 0 if different or dest missing ──────────────

needs_update() {
    local src="$1" dest="$2"
    if [[ ! -f "$dest" ]]; then
        return 0
    fi
    ! cmp -s "$src" "$dest"
}

# ── 1. System dependencies ───────────────────────────────────────────────────

install_system_deps() {
    step "Checking system dependencies"

    local pkgs_needed=()

    command -v python3 &>/dev/null || pkgs_needed+=(python3 python3-venv python3-pip)
    command -v node    &>/dev/null || pkgs_needed+=(nodejs npm)
    command -v nginx   &>/dev/null || pkgs_needed+=(nginx)
    command -v git     &>/dev/null || pkgs_needed+=(git)

    if [[ ${#pkgs_needed[@]} -gt 0 ]]; then
        log "Installing: ${pkgs_needed[*]}"
        apt-get update -qq
        apt-get install -y -qq "${pkgs_needed[@]}"
    else
        log "All system packages present."
    fi

    # Verify minimum versions
    local py_ver
    py_ver=$(python3 -c 'import sys; print(f"{sys.version_info.major}.{sys.version_info.minor}")')
    if ! python3 -c "import sys; exit(0 if sys.version_info >= (3,12) else 1)" 2>/dev/null; then
        warn "Python $py_ver found, but $PYTHON_MIN+ recommended."
    fi

    local node_ver
    node_ver=$(node --version | sed 's/^v//' | cut -d. -f1)
    if (( node_ver < 20 )); then
        warn "Node $node_ver found, but $NODE_MIN+ recommended."
    fi
}

# ── 2. Service user ──────────────────────────────────────────────────────────

ensure_service_user() {
    step "Ensuring service user"

    if id "$SERVICE_USER" &>/dev/null; then
        log "User '$SERVICE_USER' already exists."
    else
        log "Creating system user '$SERVICE_USER'..."
        useradd --system --shell /usr/sbin/nologin --home-dir "$INSTALL_DIR" \
            --create-home "$SERVICE_USER"
    fi
}

# ── 3. Clone or update the repo ──────────────────────────────────────────────

sync_repo() {
    step "Syncing repository to $INSTALL_DIR"

    if [[ -d "$INSTALL_DIR/.git" ]]; then
        log "Repo exists, pulling latest..."
        cd "$INSTALL_DIR"
        sudo -u "$SERVICE_USER" git fetch origin
        sudo -u "$SERVICE_USER" git checkout "$BRANCH"
        sudo -u "$SERVICE_USER" git reset --hard "origin/$BRANCH"
    else
        log "Cloning repo..."
        # If INSTALL_DIR was created by useradd but is empty, remove and clone
        if [[ -d "$INSTALL_DIR" ]]; then
            rm -rf "$INSTALL_DIR"
        fi
        git clone --branch "$BRANCH" "$REPO_URL" "$INSTALL_DIR"
        chown -R "$SERVICE_USER:$SERVICE_GROUP" "$INSTALL_DIR"
    fi

    cd "$INSTALL_DIR"
}

# ── 4. Backend setup ─────────────────────────────────────────────────────────

setup_backend() {
    step "Setting up backend (Python/FastAPI)"

    local venv="$INSTALL_DIR/backend/venv"

    # Create venv if missing
    if [[ ! -d "$venv" ]]; then
        log "Creating Python virtual environment..."
        sudo -u "$SERVICE_USER" python3 -m venv "$venv"
    fi

    # Install/upgrade dependencies
    log "Installing Python dependencies..."
    sudo -u "$SERVICE_USER" "$venv/bin/pip" install --quiet --upgrade pip
    sudo -u "$SERVICE_USER" "$venv/bin/pip" install --quiet -r "$INSTALL_DIR/backend/requirements.txt"

    # Create .env from example if it doesn't exist
    if [[ ! -f "$INSTALL_DIR/backend/.env" ]]; then
        warn "Backend .env not found — creating from .env.example."
        warn ">>> You MUST edit $INSTALL_DIR/backend/.env with your API keys! <<<"
        sudo -u "$SERVICE_USER" cp "$INSTALL_DIR/backend/.env.example" "$INSTALL_DIR/backend/.env"
        chmod 600 "$INSTALL_DIR/backend/.env"
    else
        log "Backend .env already exists (not overwriting)."
    fi
}

# ── 5. Frontend setup ────────────────────────────────────────────────────────

setup_frontend() {
    step "Setting up frontend (Next.js)"

    cd "$INSTALL_DIR/frontend"

    # Install npm dependencies
    log "Installing npm dependencies..."
    sudo -u "$SERVICE_USER" npm ci --omit=dev --quiet 2>&1 | tail -3

    # Create .env.local from template if it doesn't exist
    if [[ ! -f "$INSTALL_DIR/frontend/.env.local" ]]; then
        warn "Frontend .env.local not found — creating template."
        warn ">>> Run 'ascendkit set-env <key>' or edit $INSTALL_DIR/frontend/.env.local <<<"
        sudo -u "$SERVICE_USER" tee "$INSTALL_DIR/frontend/.env.local" > /dev/null <<'ENVEOF'
# AscendKit Auth — fill in with your keys
NEXT_PUBLIC_ASCENDKIT_API_URL=https://api.ascendkit.dev
ASCENDKIT_API_URL=https://api.ascendkit.dev
NEXT_PUBLIC_ASCENDKIT_ENV_KEY=
ASCENDKIT_ENV_KEY=
ASCENDKIT_SECRET_KEY=
ASCENDKIT_WEBHOOK_SECRET=
ENVEOF
        chmod 600 "$INSTALL_DIR/frontend/.env.local"
    else
        log "Frontend .env.local already exists (not overwriting)."
    fi

    # Build the production bundle
    log "Building Next.js production bundle..."
    sudo -u "$SERVICE_USER" npm run build 2>&1 | tail -5

    cd "$INSTALL_DIR"
}

# ── 6. Systemd services ─────────────────────────────────────────────────────

setup_systemd() {
    step "Configuring systemd services"

    local changed=false

    for unit in cedarbot-backend.service cedarbot-frontend.service; do
        local src="$INSTALL_DIR/deploy/systemd/$unit"
        local dest="$SYSTEMD_DIR/$unit"

        if needs_update "$src" "$dest"; then
            log "Installing/updating $unit..."
            cp "$src" "$dest"
            chmod 644 "$dest"
            changed=true
        else
            log "$unit is up to date."
        fi
    done

    if $changed; then
        log "Reloading systemd daemon..."
        systemctl daemon-reload
    fi

    # Enable services (idempotent)
    systemctl enable cedarbot-backend.service 2>/dev/null || true
    systemctl enable cedarbot-frontend.service 2>/dev/null || true
}

# ── 7. Nginx configuration ──────────────────────────────────────────────────

setup_nginx() {
    step "Configuring nginx"

    # Ensure sites-available and sites-enabled directories exist
    mkdir -p "$NGINX_AVAILABLE" "$NGINX_ENABLED"

    # Check that nginx.conf includes sites-enabled
    if ! grep -q "include.*sites-enabled" /etc/nginx/nginx.conf 2>/dev/null; then
        # Check for conf.d style instead
        if grep -q "include.*conf\.d" /etc/nginx/nginx.conf 2>/dev/null; then
            warn "nginx uses conf.d/ style — installing to /etc/nginx/conf.d/ instead."
            NGINX_AVAILABLE="/etc/nginx/conf.d"
            NGINX_ENABLED="/etc/nginx/conf.d"
        else
            warn "nginx.conf doesn't include sites-enabled/ or conf.d/."
            warn "Adding 'include /etc/nginx/sites-enabled/*;' to nginx.conf..."
            # Insert inside the http block, before the closing brace
            sed -i '/^http\s*{/a\    include /etc/nginx/sites-enabled/*;' /etc/nginx/nginx.conf
        fi
    fi

    local src="$INSTALL_DIR/deploy/nginx/$NGINX_CONF_NAME"
    local dest="$NGINX_AVAILABLE/$NGINX_CONF_NAME"

    if needs_update "$src" "$dest"; then
        log "Installing/updating nginx config..."
        cp "$src" "$dest"
        chmod 644 "$dest"

        # Create symlink if using sites-available/sites-enabled pattern
        if [[ "$NGINX_AVAILABLE" != "$NGINX_ENABLED" ]]; then
            if [[ ! -L "$NGINX_ENABLED/$NGINX_CONF_NAME" ]]; then
                log "Symlinking to sites-enabled..."
                ln -sf "$NGINX_AVAILABLE/$NGINX_CONF_NAME" "$NGINX_ENABLED/$NGINX_CONF_NAME"
            fi
        fi

        # Test config before reloading — never break existing sites
        if nginx -t 2>&1; then
            log "nginx config test passed — reloading..."
            systemctl reload nginx
        else
            err "nginx config test FAILED — rolling back cedarbot config."
            err "Existing nginx sites are NOT affected."
            rm -f "$dest"
            rm -f "$NGINX_ENABLED/$NGINX_CONF_NAME"
            nginx -t 2>/dev/null && systemctl reload nginx
            err "Fix $src and re-run this script."
            return 1
        fi
    else
        log "nginx config is up to date."
    fi
}

# ── 8. Start / restart services ──────────────────────────────────────────────

restart_services() {
    step "Starting services"

    systemctl restart cedarbot-backend.service
    log "Waiting for backend to start..."
    sleep 3

    # Quick health check
    if curl -sf http://127.0.0.1:8000/api/health > /dev/null 2>&1; then
        log "Backend is healthy."
    else
        warn "Backend health check failed — check: journalctl -u cedarbot-backend -n 30"
    fi

    systemctl restart cedarbot-frontend.service
    log "Waiting for frontend to start..."
    sleep 3

    if curl -sf http://127.0.0.1:3000 > /dev/null 2>&1; then
        log "Frontend is healthy."
    else
        warn "Frontend health check failed — check: journalctl -u cedarbot-frontend -n 30"
    fi
}

# ── 9. Print status ─────────────────────────────────────────────────────────

print_status() {
    step "Deployment complete"

    echo ""
    systemctl --no-pager status cedarbot-backend.service 2>/dev/null | head -5 || true
    echo ""
    systemctl --no-pager status cedarbot-frontend.service 2>/dev/null | head -5 || true
    echo ""

    log "Service logs:  journalctl -u cedarbot-backend -f"
    log "               journalctl -u cedarbot-frontend -f"

    if [[ ! -s "$INSTALL_DIR/backend/.env" ]] || grep -q "your-api-key-here" "$INSTALL_DIR/backend/.env" 2>/dev/null; then
        echo ""
        warn "ACTION REQUIRED: Edit $INSTALL_DIR/backend/.env with your LLM API key."
    fi

    if grep -q "^ASCENDKIT_SECRET_KEY=$" "$INSTALL_DIR/frontend/.env.local" 2>/dev/null; then
        echo ""
        warn "ACTION REQUIRED: Edit $INSTALL_DIR/frontend/.env.local with AscendKit keys."
        warn "  Or run: cd $INSTALL_DIR && ascendkit set-env <public-key>"
    fi
}

# ── Main ─────────────────────────────────────────────────────────────────────

main() {
    echo ""
    echo -e "${CYAN}╔══════════════════════════════════════╗${NC}"
    echo -e "${CYAN}║        CedarBot Deploy Script        ║${NC}"
    echo -e "${CYAN}╚══════════════════════════════════════╝${NC}"
    echo ""

    if $UPDATE_ONLY; then
        log "Running in --update mode (skip system deps / user creation)"
        sync_repo
        setup_backend
        setup_frontend
        setup_systemd
        setup_nginx
        restart_services
        print_status
    else
        install_system_deps
        ensure_service_user
        sync_repo
        setup_backend
        setup_frontend
        setup_systemd
        setup_nginx
        restart_services
        print_status
    fi
}

main "$@"
