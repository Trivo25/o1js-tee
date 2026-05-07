#!/bin/sh
set -eu

EIF_PATH="${EIF_PATH:-o1js-nitro-verifier.eif}"
ENCLAVE_CID="${ENCLAVE_CID:-16}"
CPU_COUNT="${CPU_COUNT:-2}"
MEMORY_MB="${MEMORY_MB:-4096}"
DEBUG_MODE="${DEBUG_MODE:-0}"
ATTACH_CONSOLE="${ATTACH_CONSOLE:-0}"

if ! command -v nitro-cli >/dev/null 2>&1; then
  echo "missing nitro-cli; run this on a Nitro Enclaves-enabled EC2 host" >&2
  exit 1
fi

if [ ! -f "$EIF_PATH" ]; then
  echo "missing EIF: $EIF_PATH" >&2
  echo "run scripts/build-enclave.sh first" >&2
  exit 1
fi

if [ "$DEBUG_MODE" = "1" ] && [ "$ATTACH_CONSOLE" = "1" ]; then
  nitro-cli run-enclave \
    --cpu-count "$CPU_COUNT" \
    --memory "$MEMORY_MB" \
    --eif-path "$EIF_PATH" \
    --enclave-cid "$ENCLAVE_CID" \
    --debug-mode \
    --attach-console
elif [ "$DEBUG_MODE" = "1" ]; then
  nitro-cli run-enclave \
    --cpu-count "$CPU_COUNT" \
    --memory "$MEMORY_MB" \
    --eif-path "$EIF_PATH" \
    --enclave-cid "$ENCLAVE_CID" \
    --debug-mode
else
  nitro-cli run-enclave \
    --cpu-count "$CPU_COUNT" \
    --memory "$MEMORY_MB" \
    --eif-path "$EIF_PATH" \
    --enclave-cid "$ENCLAVE_CID"
fi
