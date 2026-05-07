#!/bin/sh
set -eu

IMAGE_NAME="${IMAGE_NAME:-o1js-nitro-verifier:dev}"
EIF_PATH="${EIF_PATH:-o1js-nitro-verifier.eif}"
MEASUREMENTS_PATH="${MEASUREMENTS_PATH:-measurements.json}"
DOCKER_BIN="${DOCKER_BIN:-docker}"

if ! command -v "$DOCKER_BIN" >/dev/null 2>&1; then
  echo "missing Docker CLI: $DOCKER_BIN" >&2
  exit 1
fi

if ! command -v nitro-cli >/dev/null 2>&1; then
  echo "missing nitro-cli; run this on a Nitro Enclaves-enabled EC2 host" >&2
  exit 1
fi

"$DOCKER_BIN" build \
  -f Dockerfile.enclave \
  -t "$IMAGE_NAME" \
  .

nitro-cli build-enclave \
  --docker-uri "$IMAGE_NAME" \
  --output-file "$EIF_PATH" \
  > "$MEASUREMENTS_PATH"

echo "built $EIF_PATH"
echo "wrote $MEASUREMENTS_PATH"
