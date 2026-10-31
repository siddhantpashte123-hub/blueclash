#!/usr/bin/env bash
# BlueClash manager for Debian/Ubuntu VPS with systemd.
set -Eeuo pipefail

REPO_URL="https://github.com/siddhantpashte123-hub/blueclash.git"
REPO_REF="${BLUECLASH_REF:-arena/27134d7a-blueclash}"
NODE_VERSION="v22.22.3"
APP_DIR="/opt/blueclash"
NODE_DIR="/opt/blueclash-node"
DATA_DIR="/var/lib/blueclash"
SERVICE_FILE="/etc/systemd/system/blueclash.service"
MANAGER="/usr/local/bin/blueclash"
WORK_DIR=""

say() { printf '\n\033[1;34m[BlueClash]\033[0m %s\n' "$*"; }
warn() { printf '\n\033[1;33m[BlueClash]\033[0m %s\n' "$*" >&2; }
die() { printf '\n\033[1;31m[BlueClash]\033[0m %s\n' "$*" >&2; exit 1; }
cleanup() { if [[ -n "$WORK_DIR" && -d "$WORK_DIR" ]]; then rm -rf -- "$WORK_DIR"; fi; }
trap cleanup EXIT
trap 'warn "Command failed on line $LINENO. Your existing data in $DATA_DIR was not deleted."' ERR

if [[ ${EUID} -ne 0 ]]; then
  command -v sudo >/dev/null 2>&1 || die "Run this manager as root, or install sudo and try again."
  [[ -f "$0" ]] || die "Download the installer to a file first, then run: bash install.sh"
  exec sudo env "BLUECLASH_REF=$REPO_REF" bash "$0" "$@"
fi

has_tty() { ( : < /dev/tty ) 2>/dev/null; }
read_tty() { local prompt="$1" var="$2"; IFS= read -r -p "$prompt" "$var" < /dev/tty; }

check_system() {
  [[ -r /etc/os-release ]] || die "Cannot identify this Linux distribution."
  # shellcheck disable=SC1091
  . /etc/os-release
  case "${ID:-} ${ID_LIKE:-}" in *ubuntu*|*debian*) ;; *) die "The installer currently supports Debian or Ubuntu with systemd." ;; esac
  command -v systemctl >/dev/null 2>&1 || die "systemd is required on this VPS."
  [[ -d /run/systemd/system ]] || die "systemd is not running. Use a Debian/Ubuntu VPS booted with systemd."
  case "$(uname -m)" in x86_64|aarch64|arm64) ;; *) die "Supported CPU architectures are x86_64 and arm64." ;; esac
}

install_dependencies() {
  local missing=0 bin
  for bin in git curl tar xz sha256sum runuser; do command -v "$bin" >/dev/null 2>&1 || missing=1; done
  if (( missing )); then
    say "Installing required system packages..."
    export DEBIAN_FRONTEND=noninteractive
    apt-get update
    apt-get install -y ca-certificates curl git xz-utils coreutils util-linux
  fi
}

install_blueclash() {
  check_system
  install_dependencies
  if [[ -e "$APP_DIR" ]]; then
    say "An installation already exists. This will update the application and keep the database and uploads."
  else
    say "Installing BlueClash on port 8989."
  fi
  local admin_email='' admin_password='' confirm='' needs_admin=0
  if [[ ! -f "$DATA_DIR/blueclash.sqlite" ]]; then
    needs_admin=1
    echo "Create your first administrator account (you will use this to open /admin)."
    while true; do
      read_tty "Admin email: " admin_email || return 1
      [[ "$admin_email" =~ ^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$ ]] && break
      echo "Please enter a valid email address."
    done
    while true; do
      IFS= read -r -s -p "Admin password (10–128 characters): " admin_password < /dev/tty || return 1; echo
      IFS= read -r -s -p "Confirm password: " confirm < /dev/tty || return 1; echo
      if [[ ${#admin_password} -ge 10 && ${#admin_password} -le 128 && "$admin_password" == "$confirm" ]]; then break; fi
      echo "Passwords must match and contain 10–128 characters."
    done
  fi
  WORK_DIR="$(mktemp -d /tmp/blueclash-install.XXXXXX)"
  chmod 755 "$WORK_DIR"
  local arch archive node_path
  case "$(uname -m)" in x86_64) arch="x64" ;; *) arch="arm64" ;; esac
  node_path="$NODE_DIR/bin/node"
  if [[ ! -x "$node_path" ]] || [[ "$("$node_path" -p 'process.version' 2>/dev/null || true)" != "$NODE_VERSION" ]]; then
    say "Downloading the dedicated Node.js runtime ($NODE_VERSION)..."
    archive="node-${NODE_VERSION}-linux-${arch}.tar.xz"
    curl -fsSL --retry 3 "https://nodejs.org/dist/${NODE_VERSION}/${archive}" -o "$WORK_DIR/$archive"
    curl -fsSL --retry 3 "https://nodejs.org/dist/${NODE_VERSION}/SHASUMS256.txt" -o "$WORK_DIR/SHASUMS256.txt"
    (cd "$WORK_DIR" && grep -F "  $archive" SHASUMS256.txt | sha256sum --check --status) || die "Node.js download checksum verification failed."
    mkdir -p "$WORK_DIR/node"
    tar -xJf "$WORK_DIR/$archive" -C "$WORK_DIR/node" --strip-components=1
    node_path="$WORK_DIR/node/bin/node"
  fi
  say "Downloading BlueClash from GitHub ($REPO_REF)..."
  git clone --quiet --depth 1 --branch "$REPO_REF" "$REPO_URL" "$WORK_DIR/app"
  say "Installing dependencies and building the website..."
  (cd "$WORK_DIR/app" && export PATH="$(dirname "$node_path"):$PATH" && npm ci --no-audit --no-fund && npm run build)

  if ! getent group blueclash >/dev/null 2>&1; then groupadd --system blueclash; fi
  if ! id blueclash >/dev/null 2>&1; then
    useradd --system --gid blueclash --home-dir "$DATA_DIR" --shell /usr/sbin/nologin blueclash
  fi
  mkdir -p "$DATA_DIR"
  chown -R blueclash:blueclash "$DATA_DIR"
  chmod 700 "$DATA_DIR"
  if (( needs_admin )); then
    say "Creating the administrator account..."
    printf '%s\n' "$admin_password" | (cd "$WORK_DIR/app" && runuser -u blueclash -- env "DATA_DIR=$DATA_DIR" "ADMIN_EMAIL=$admin_email" "$node_path" server/admin-cli.js --password-stdin)
    unset admin_password confirm
  else
    say "Existing database found; administrator accounts and uploads will be kept."
  fi

  say "Configuring the system service..."
  systemctl stop blueclash.service 2>/dev/null || true
  rm -rf -- "${APP_DIR}.previous" "${NODE_DIR}.previous"
  [[ ! -e "$APP_DIR" ]] || mv "$APP_DIR" "${APP_DIR}.previous"
  mv "$WORK_DIR/app" "$APP_DIR"
  if [[ -d "$WORK_DIR/node" ]]; then
    [[ ! -e "$NODE_DIR" ]] || mv "$NODE_DIR" "${NODE_DIR}.previous"
    mv "$WORK_DIR/node" "$NODE_DIR"
  fi
  chown -R root:root "$APP_DIR" "$NODE_DIR"
  cat > "$SERVICE_FILE" <<SERVICE
[Unit]
Description=BlueClash Tournament Platform
Wants=network-online.target
After=network-online.target

[Service]
Type=simple
User=blueclash
Group=blueclash
WorkingDirectory=$APP_DIR
Environment=NODE_ENV=production
Environment=PORT=8989
Environment=DATA_DIR=$DATA_DIR
ExecStart=$NODE_DIR/bin/node $APP_DIR/server/index.js
Restart=on-failure
RestartSec=3
NoNewPrivileges=true
PrivateTmp=true
ProtectHome=true
ProtectSystem=strict
ReadWritePaths=$DATA_DIR
UMask=0077

[Install]
WantedBy=multi-user.target
SERVICE
  systemctl daemon-reload
  local failed=0
  systemctl enable --now blueclash.service || failed=1
  if (( ! failed )); then
    local health
    health="$(curl --silent --show-error --fail --retry 8 --retry-connrefused --retry-delay 1 http://127.0.0.1:8989/api/health)" || failed=1
    [[ "$health" == '{"ok":true}' ]] || failed=1
    systemctl is-active --quiet blueclash.service || failed=1
  fi
  if (( failed )); then
    warn "The service did not start. Check: journalctl -u blueclash -n 100 --no-pager"
    if [[ -d "${APP_DIR}.previous" ]]; then
      warn "Restoring the previous application."
      systemctl stop blueclash.service 2>/dev/null || true
      rm -rf -- "$APP_DIR"
      mv "${APP_DIR}.previous" "$APP_DIR"
      if [[ -d "${NODE_DIR}.previous" ]]; then rm -rf -- "$NODE_DIR"; mv "${NODE_DIR}.previous" "$NODE_DIR"; fi
      systemctl start blueclash.service || true
    fi
    return 1
  fi
  rm -rf -- "${APP_DIR}.previous" "${NODE_DIR}.previous"
  install -m 0755 "$APP_DIR/install.sh" "$MANAGER"
  if command -v ufw >/dev/null 2>&1 && ufw status 2>/dev/null | grep -q '^Status: active'; then
    ufw allow 8989/tcp >/dev/null || warn "Could not update UFW. Allow TCP port 8989 manually."
  fi
  say "Installation complete!"
  printf '  Website:      http://YOUR_VPS_IP:8989\n  Admin panel:  http://YOUR_VPS_IP:8989/admin\n  Manage again: sudo blueclash\n\n'
  echo "In the admin panel, add your UPI ID under Payment settings and publish a real tournament."
  echo "Allow TCP port 8989 in your VPS/cloud firewall. Set up HTTPS before collecting real payments."
}

show_status() {
  echo
  echo '========== BLUECLASH STATUS =========='
  if systemctl is-active --quiet blueclash.service 2>/dev/null; then
    echo 'Service: RUNNING'
  elif [[ -f "$SERVICE_FILE" ]]; then
    echo 'Service: STOPPED'
  else
    echo 'Service: NOT INSTALLED'
  fi
  if command -v curl >/dev/null 2>&1 && curl -fsS --max-time 3 http://127.0.0.1:8989/api/health >/dev/null 2>&1; then
    echo 'Website: responding on port 8989'
  else
    echo 'Website: not responding on port 8989'
  fi
  echo "Data: $DATA_DIR"
  echo 'Logs: journalctl -u blueclash -n 100 --no-pager'
  echo '======================================'
}

uninstall_blueclash() {
  local answer=''
  read_tty 'Uninstall the BlueClash service and application? Type YES to continue: ' answer || return 1
  if [[ "$answer" != 'YES' ]]; then say 'Uninstall cancelled.'; return 0; fi
  systemctl disable --now blueclash.service 2>/dev/null || true
  rm -f -- "$SERVICE_FILE" "$MANAGER"
  systemctl daemon-reload 2>/dev/null || true
  rm -rf -- "$APP_DIR" "$NODE_DIR"
  say "Application removed. Your database and uploads remain in $DATA_DIR."
  read_tty 'To permanently delete all BlueClash data too, type DELETE (or press Enter to keep it): ' answer || true
  if [[ "$answer" == 'DELETE' ]]; then rm -rf -- "$DATA_DIR"; say 'BlueClash data deleted.'; else say 'BlueClash data preserved.'; fi
}

if [[ "${1:-}" == '--status' ]]; then show_status; exit 0; fi
has_tty || die "The menu needs an interactive terminal. Download the script and run it with bash."
while true; do
  printf '\n\033[1;34m  ____  _            ____ _           _     \033[0m\n'
  printf '\033[1;34m | __ )| |_   _  ___/ ___| | __ _ ___| |__  \033[0m\n'
  printf '\033[1;34m |  _ \\| | | | |/ _ \\___ \\ |/ _` / __| `_ \\ \033[0m\n'
  printf '\033[1;34m | |_) | | |_| |  __/___) | | (_| \\__ \\ | | |\033[0m\n'
  printf '\033[1;34m |____/|_|\\__,_|\\___|____/|_|\\__,_|___/_| |_|\033[0m\n'
  printf '\n  1) Install / update\n  2) Uninstall\n  3) Status\n  4) Back / exit\n\n'
  choice=''; read_tty 'Select an option [1-4]: ' choice || exit 0
  case "$choice" in
    1) install_blueclash ;;
    2) uninstall_blueclash; exit 0 ;;
    3) show_status ;;
    4) say 'Goodbye!'; exit 0 ;;
    *) echo 'Please choose 1, 2, 3, or 4.' ;;
  esac
done
