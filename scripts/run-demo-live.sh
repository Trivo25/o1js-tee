#!/bin/sh
set -eu

IMAGE_NAME="${IMAGE_NAME:-o1js-nitro-verifier:dev}"
EIF_PATH="${EIF_PATH:-o1js-nitro-verifier.eif}"
MEASUREMENTS_PATH="${MEASUREMENTS_PATH:-measurements.json}"
ENCLAVE_CID="${ENCLAVE_CID:-16}"
VSOCK_PORT="${VSOCK_PORT:-5000}"
CPU_COUNT="${CPU_COUNT:-2}"
MEMORY_MB="${MEMORY_MB:-4096}"
STARTUP_WAIT_SECONDS="${STARTUP_WAIT_SECONDS:-3}"
DEMO_HOST="${DEMO_HOST:-127.0.0.1}"
DEMO_PORT="${DEMO_PORT:-8080}"
KEEP_ENCLAVE="${KEEP_ENCLAVE:-0}"

ENCLAVE_ID=""
SERVER_PID=""

cleanup() {
  status=$?

  if [ -n "$SERVER_PID" ] && kill -0 "$SERVER_PID" >/dev/null 2>&1; then
    echo "stopping Project Teh Tarik server: $SERVER_PID"
    kill "$SERVER_PID" >/dev/null 2>&1 || true
    wait "$SERVER_PID" >/dev/null 2>&1 || true
  fi

  if [ "$KEEP_ENCLAVE" = "1" ]; then
    if [ -n "$ENCLAVE_ID" ]; then
      echo "leaving enclave running: $ENCLAVE_ID"
    fi
    exit "$status"
  fi

  if [ -n "$ENCLAVE_ID" ]; then
    echo "terminating enclave: $ENCLAVE_ID"
    nitro-cli terminate-enclave --enclave-id "$ENCLAVE_ID" >/dev/null 2>&1 || true
  fi

  exit "$status"
}

trap cleanup EXIT INT TERM

require_command() {
  if ! command -v "$1" >/dev/null 2>&1; then
    echo "missing required command: $1" >&2
    exit 1
  fi
}

parse_enclave_id() {
  node -e '
let input = "";
process.stdin.on("data", (chunk) => input += chunk);
process.stdin.on("end", () => {
  const start = input.indexOf("{");
  const end = input.lastIndexOf("}");
  if (start === -1 || end === -1 || end < start) return;
  const parsed = JSON.parse(input.slice(start, end + 1));
  if (typeof parsed.EnclaveID === "string") process.stdout.write(parsed.EnclaveID);
});
'
}

require_command nitro-cli
require_command npm
require_command node

if [ ! -d node_modules ]; then
  npm ci
fi

npm run demo:build-ui
npm run build

IMAGE_NAME="$IMAGE_NAME" \
EIF_PATH="$EIF_PATH" \
MEASUREMENTS_PATH="$MEASUREMENTS_PATH" \
  scripts/build-enclave.sh

run_output="$(
  EIF_PATH="$EIF_PATH" \
  ENCLAVE_CID="$ENCLAVE_CID" \
  CPU_COUNT="$CPU_COUNT" \
  MEMORY_MB="$MEMORY_MB" \
    scripts/run-enclave.sh
)"
printf '%s\n' "$run_output"

ENCLAVE_ID="$(printf '%s\n' "$run_output" | parse_enclave_id)"
if [ -z "$ENCLAVE_ID" ]; then
  echo "could not parse EnclaveID from nitro-cli output" >&2
  exit 1
fi

echo "waiting ${STARTUP_WAIT_SECONDS}s for enclave worker startup"
sleep "$STARTUP_WAIT_SECONDS"

ENCLAVE_CID="$ENCLAVE_CID" \
VSOCK_PORT="$VSOCK_PORT" \
DEMO_HOST="$DEMO_HOST" \
DEMO_PORT="$DEMO_PORT" \
  npm run demo:server &
SERVER_PID="$!"

sleep 1
if ! kill -0 "$SERVER_PID" >/dev/null 2>&1; then
  wait "$SERVER_PID"
fi

cat <<EOF

Project Teh Tarik demo is running.

Server:
  http://${DEMO_HOST}:${DEMO_PORT}/

If this is running on EC2, open it from your laptop through an SSH tunnel:
  ssh -L ${DEMO_PORT}:127.0.0.1:${DEMO_PORT} ec2-user@<instance-public-dns-or-ip>

Then open:
  http://127.0.0.1:${DEMO_PORT}/

Use Ctrl-C here to stop the server and terminate the enclave.

EOF

wait "$SERVER_PID"
