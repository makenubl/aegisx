#!/usr/bin/env bash
# AegisX Install Script — Ubuntu 22.04
# Usage: sudo ./scripts/install.sh [--dry-run]
set -euo pipefail

DRY_RUN=false
[[ "${1:-}" == "--dry-run" ]] && DRY_RUN=true

AEGISX_USER="aegisx"
AEGISX_HOME="/opt/aegisx"
AEGISX_CONFIG="/etc/aegisx"
AEGISX_DATA="/var/lib/aegisx"
AEGISX_LOG="/var/log/aegisx"

RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'; NC='\033[0m'

info()    { echo -e "${GREEN}[INFO]${NC}  $*"; }
warn()    { echo -e "${YELLOW}[WARN]${NC}  $*"; }
error()   { echo -e "${RED}[ERROR]${NC} $*" >&2; }
run()     { $DRY_RUN && { echo "[DRY] $*"; return 0; }; "$@"; }

require_root() {
    [[ $EUID -eq 0 ]] || { error "Run as root: sudo $0"; exit 1; }
}

check_os() {
    if ! grep -q "Ubuntu 22" /etc/os-release 2>/dev/null; then
        warn "Tested on Ubuntu 22.04. Continuing anyway…"
    fi
}

install_dependencies() {
    info "Installing system dependencies…"
    run apt-get update -qq
    run apt-get install -y --no-install-recommends \
        nftables \
        suricata \
        haproxy \
        wireguard \
        wireguard-tools \
        curl \
        ca-certificates \
        gnupg \
        lsb-release \
        jq \
        net-tools \
        iproute2

    # Docker
    if ! command -v docker &>/dev/null; then
        info "Installing Docker…"
        run curl -fsSL https://get.docker.com | bash
    fi

    # Docker Compose plugin
    if ! docker compose version &>/dev/null 2>&1; then
        info "Installing Docker Compose plugin…"
        run apt-get install -y docker-compose-plugin
    fi
}

create_user() {
    info "Creating aegisx system user…"
    if ! id "$AEGISX_USER" &>/dev/null; then
        run useradd --system --no-create-home --shell /usr/sbin/nologin "$AEGISX_USER"
    fi
    run usermod -aG docker "$AEGISX_USER" || true
}

create_directories() {
    info "Creating directories…"
    for dir in "$AEGISX_HOME" "$AEGISX_CONFIG" "$AEGISX_DATA/rollback" "$AEGISX_LOG"; do
        run mkdir -p "$dir"
        run chown -R "$AEGISX_USER:$AEGISX_USER" "$dir"
    done
    run chmod 700 "$AEGISX_DATA"
    run chmod 755 "$AEGISX_CONFIG"
}

configure_nftables() {
    info "Configuring nftables…"
    run systemctl enable nftables
    run systemctl start nftables || true
}

configure_kernel() {
    info "Applying kernel parameters…"
    cat > /tmp/aegisx-sysctl.conf <<'EOF'
# AegisX kernel tuning
net.ipv4.ip_forward = 1
net.ipv6.conf.all.forwarding = 1
net.ipv4.conf.all.rp_filter = 1
net.ipv4.conf.default.rp_filter = 1
net.ipv4.conf.all.accept_redirects = 0
net.ipv4.conf.default.accept_redirects = 0
net.ipv4.conf.all.send_redirects = 0
net.ipv4.tcp_syncookies = 1
net.ipv4.tcp_max_syn_backlog = 4096
net.core.somaxconn = 65535
net.core.netdev_max_backlog = 5000
net.ipv4.tcp_fin_timeout = 15
net.netfilter.nf_conntrack_max = 2097152
EOF
    run cp /tmp/aegisx-sysctl.conf /etc/sysctl.d/99-aegisx.conf
    run sysctl -p /etc/sysctl.d/99-aegisx.conf
}

generate_secrets() {
    info "Generating secrets…"
    local env_file="$AEGISX_CONFIG/aegisx.env"
    if [[ -f "$env_file" ]]; then
        warn "Secrets file already exists — skipping generation"
        return
    fi

    JWT_SECRET=$(openssl rand -base64 48)
    PG_PASSWORD=$(openssl rand -base64 24 | tr -dc 'a-zA-Z0-9' | head -c 24)

    run tee "$env_file" > /dev/null <<EOF
POSTGRES_DB=aegisx
POSTGRES_USER=aegisx
POSTGRES_PASSWORD=${PG_PASSWORD}
JWT_SECRET=${JWT_SECRET}
ADMIN_USER=admin
ADMIN_PASSWORD=changeme   # Change this after first login!
FIREWALL_DRY_RUN=false
LOG_LEVEL=info
EOF
    run chmod 600 "$env_file"
    run chown "$AEGISX_USER:$AEGISX_USER" "$env_file"
    info "Secrets written to $env_file — KEEP THIS FILE SECURE"
}

install_systemd_units() {
    info "Installing systemd units…"
    cat > /tmp/aegisx-api.service <<EOF
[Unit]
Description=AegisX API Server
Documentation=https://github.com/aegisx/aegisx
After=network.target docker.service
Requires=docker.service

[Service]
Type=simple
User=${AEGISX_USER}
WorkingDirectory=${AEGISX_HOME}
EnvironmentFile=${AEGISX_CONFIG}/aegisx.env
ExecStart=/usr/bin/docker compose up
ExecStop=/usr/bin/docker compose down
Restart=on-failure
RestartSec=10

StandardOutput=journal
StandardError=journal
SyslogIdentifier=aegisx

[Install]
WantedBy=multi-user.target
EOF
    run cp /tmp/aegisx-api.service /etc/systemd/system/aegisx.service
    run systemctl daemon-reload
    run systemctl enable aegisx
}

print_summary() {
    echo ""
    echo "═══════════════════════════════════════════"
    info " AegisX installation complete!"
    echo "═══════════════════════════════════════════"
    echo ""
    echo "  Web UI:  http://$(hostname -I | awk '{print $1}'):3000"
    echo "  API:     http://$(hostname -I | awk '{print $1}'):8080"
    echo "  Grafana: http://$(hostname -I | awk '{print $1}'):3001"
    echo ""
    echo "  Start:   systemctl start aegisx"
    echo "  Logs:    journalctl -fu aegisx"
    echo ""
    warn " Change the default admin password after first login!"
    echo ""
}

main() {
    require_root
    check_os
    install_dependencies
    create_user
    create_directories
    configure_nftables
    configure_kernel
    generate_secrets
    install_systemd_units
    print_summary
}

main "$@"
