#!/bin/sh
set -eu

CPU_COUNT="${CPU_COUNT:-2}"
MEMORY_MB="${MEMORY_MB:-4096}"
SETUP_NODE="${SETUP_NODE:-1}"
ALLOCATOR_YAML="${ALLOCATOR_YAML:-/etc/nitro_enclaves/allocator.yaml}"
CURRENT_USER="${SUDO_USER:-$(id -un)}"

require_command() {
  if ! command -v "$1" >/dev/null 2>&1; then
    echo "missing required command: $1" >&2
    exit 1
  fi
}

install_node_22() {
  if command -v node >/dev/null 2>&1; then
    node_major="$(node -p 'process.versions.node.split(".")[0]')"
    if [ "$node_major" -ge 22 ]; then
      return
    fi
  fi

  if [ "$SETUP_NODE" != "1" ]; then
    echo "Node.js >=22 is required; install it or rerun with SETUP_NODE=1" >&2
    exit 1
  fi

  require_command curl
  curl -fsSL https://rpm.nodesource.com/setup_22.x | sudo bash -

  if command -v dnf >/dev/null 2>&1; then
    sudo dnf install -y nodejs
  else
    sudo yum install -y nodejs
  fi
}

configure_allocator() {
  if [ ! -f "$ALLOCATOR_YAML" ]; then
    echo "missing allocator config: $ALLOCATOR_YAML" >&2
    exit 1
  fi

  sudo sed -i -E "s/^([[:space:]]*memory_mib[[:space:]]*:[[:space:]]*).*/\\1${MEMORY_MB}/" "$ALLOCATOR_YAML"
  sudo sed -i -E "s/^([[:space:]]*cpu_count[[:space:]]*:[[:space:]]*).*/\\1${CPU_COUNT}/" "$ALLOCATOR_YAML"
}

install_amazon_linux_2023() {
  sudo dnf install -y \
    aws-nitro-enclaves-cli \
    aws-nitro-enclaves-cli-devel \
    docker \
    git
}

install_amazon_linux_2() {
  sudo yum install -y docker git
  sudo amazon-linux-extras install -y aws-nitro-enclaves-cli
  sudo yum install -y aws-nitro-enclaves-cli-devel
}

if [ ! -r /etc/os-release ]; then
  echo "cannot detect OS; this script supports Amazon Linux 2023 and Amazon Linux 2" >&2
  exit 1
fi

. /etc/os-release

case "${ID:-}:${VERSION_ID:-}" in
  amzn:2023)
    install_amazon_linux_2023
    ;;
  amzn:2)
    install_amazon_linux_2
    ;;
  *)
    echo "unsupported OS: ${PRETTY_NAME:-unknown}" >&2
    echo "install Nitro CLI manually, then rerun ./scripts/test-nitro-live.sh" >&2
    exit 1
    ;;
esac

install_node_22
configure_allocator

sudo usermod -aG ne "$CURRENT_USER"
sudo usermod -aG docker "$CURRENT_USER"
sudo systemctl enable --now docker
sudo systemctl enable --now nitro-enclaves-allocator.service

require_command nitro-cli
require_command docker
require_command node
require_command npm

nitro-cli --version
docker --version
node --version
npm --version

cat <<EOF

EC2 Nitro prereqs installed.

Allocator configured:
  cpu_count: ${CPU_COUNT}
  memory_mib: ${MEMORY_MB}

Important: log out and reconnect so group membership changes take effect.
Then run:

  ./scripts/test-nitro-live.sh

EOF
