#!/bin/sh
set -eu

IMAGE_NAME="${IMAGE_NAME:-o1js-nitro-verifier:dev}"
EIF_PATH="${EIF_PATH:-o1js-nitro-verifier.eif}"
MEASUREMENTS_PATH="${MEASUREMENTS_PATH:-measurements.json}"
ENCLAVE_CID="${ENCLAVE_CID:-16}"
VSOCK_PORT="${VSOCK_PORT:-5000}"
STARTUP_WAIT_SECONDS="${STARTUP_WAIT_SECONDS:-3}"
KEEP_ENCLAVE="${KEEP_ENCLAVE:-0}"

ENCLAVE_ID=""

cleanup() {
  status=$?

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

require_command nitro-cli
require_command npm
require_command node

if [ ! -d node_modules ]; then
  npm ci
fi

npm run build

IMAGE_NAME="$IMAGE_NAME" \
EIF_PATH="$EIF_PATH" \
MEASUREMENTS_PATH="$MEASUREMENTS_PATH" \
  scripts/build-enclave.sh

run_output="$(
  EIF_PATH="$EIF_PATH" \
  ENCLAVE_CID="$ENCLAVE_CID" \
    scripts/run-enclave.sh
)"
printf '%s\n' "$run_output"

ENCLAVE_ID="$(printf '%s\n' "$run_output" | node -e '
let input = "";
process.stdin.on("data", (chunk) => input += chunk);
process.stdin.on("end", () => {
  const start = input.indexOf("{");
  const end = input.lastIndexOf("}");
  if (start === -1 || end === -1 || end < start) return;
  const parsed = JSON.parse(input.slice(start, end + 1));
  if (typeof parsed.EnclaveID === "string") process.stdout.write(parsed.EnclaveID);
});
')"

if [ -z "$ENCLAVE_ID" ]; then
  echo "could not parse EnclaveID from nitro-cli output" >&2
  exit 1
fi

sleep "$STARTUP_WAIT_SECONDS"

response="$(
  ENCLAVE_CID="$ENCLAVE_CID" \
  VSOCK_PORT="$VSOCK_PORT" \
  npm --silent run parent:send-fixture
)"
printf '%s\n' "$response"

printf '%s\n' "$response" | node -e '
let input = "";
process.stdin.on("data", (chunk) => input += chunk);
process.stdin.on("end", () => {
  const response = JSON.parse(input);
  if (response.type !== "verifyResult") {
    throw new Error(`expected verifyResult, got ${response.type}`);
  }
  if (response.transcript?.ok !== true) {
    throw new Error("enclave proof verification did not return ok=true");
  }
  for (const field of [
    "transcriptHash",
    "signature",
    "signingPublicKeyDer",
    "attestationDocument",
  ]) {
    if (typeof response[field] !== "string" || response[field].length === 0) {
      throw new Error(`missing ${field}`);
    }
  }
  process.stdout.write("nitro live smoke ok\n");
});
'
