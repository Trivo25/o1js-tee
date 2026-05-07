#!/usr/bin/env python3
import os
import shlex
import socket
import subprocess
import sys
import threading
from typing import BinaryIO


HEADER_BYTES = 4
DEFAULT_MAX_FRAME_BYTES = 16 * 1024 * 1024


class WorkerBridge:
    def __init__(self, command: list[str]):
        self.process = subprocess.Popen(
            command,
            stdin=subprocess.PIPE,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
        )
        if self.process.stdin is None or self.process.stdout is None:
            raise RuntimeError("worker pipes were not created")
        self.stdin = self.process.stdin
        self.stdout = self.process.stdout
        self.lock = threading.Lock()
        if self.process.stderr is not None:
            threading.Thread(
                target=copy_stderr,
                args=(self.process.stderr,),
                daemon=True,
            ).start()

    def round_trip(self, frame: bytes) -> bytes:
        with self.lock:
            if self.process.poll() is not None:
                raise RuntimeError(f"worker exited with {self.process.returncode}")
            write_frame(self.stdin, frame)
            return read_frame(self.stdout, DEFAULT_MAX_FRAME_BYTES)


def main() -> None:
    max_frame_bytes = int(os.environ.get("MAX_FRAME_BYTES", DEFAULT_MAX_FRAME_BYTES))
    worker = WorkerBridge(worker_command())
    server = listen_socket()

    while True:
        conn, _ = server.accept()
        thread = threading.Thread(
            target=handle_connection,
            args=(conn, worker, max_frame_bytes),
            daemon=True,
        )
        thread.start()


def worker_command() -> list[str]:
    command = os.environ.get(
        "WORKER_CMD",
        "node /app/dist/src/enclave/worker.js",
    )
    return shlex.split(command)


def listen_socket() -> socket.socket:
    mode = os.environ.get("SHIM_LISTEN_MODE", "vsock")
    if mode == "tcp":
        host = os.environ.get("TCP_HOST", "127.0.0.1")
        port = int(os.environ.get("TCP_PORT", os.environ.get("VSOCK_PORT", "5000")))
        server = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
        server.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
        server.bind((host, port))
        server.listen()
        return server

    if not hasattr(socket, "AF_VSOCK"):
        raise RuntimeError("Python socket.AF_VSOCK is unavailable")

    port = int(os.environ.get("VSOCK_PORT", "5000"))
    server = socket.socket(socket.AF_VSOCK, socket.SOCK_STREAM)
    server.bind((socket.VMADDR_CID_ANY, port))
    server.listen()
    return server


def handle_connection(
    conn: socket.socket,
    worker: WorkerBridge,
    max_frame_bytes: int,
) -> None:
    with conn:
        stream = conn.makefile("rwb", buffering=0)
        while True:
            try:
                frame = read_frame(stream, max_frame_bytes)
            except EOFError:
                return
            response = worker.round_trip(frame)
            write_frame(stream, response)


def read_frame(stream: BinaryIO, max_frame_bytes: int) -> bytes:
    header = read_exact(stream, HEADER_BYTES)
    if header == b"":
        raise EOFError
    payload_length = int.from_bytes(header, "big")
    if payload_length > max_frame_bytes:
        raise ValueError("frame exceeds maximum size")
    return read_exact(stream, payload_length)


def write_frame(stream: BinaryIO, payload: bytes) -> None:
    stream.write(len(payload).to_bytes(HEADER_BYTES, "big"))
    stream.write(payload)
    stream.flush()


def read_exact(stream: BinaryIO, length: int) -> bytes:
    chunks = bytearray()
    while len(chunks) < length:
        chunk = stream.read(length - len(chunks))
        if chunk == b"":
            if len(chunks) == 0:
                return b""
            raise EOFError("truncated frame")
        chunks.extend(chunk)
    return bytes(chunks)


def copy_stderr(stderr: BinaryIO) -> None:
    while True:
        chunk = stderr.readline()
        if chunk == b"":
            return
        sys.stderr.buffer.write(chunk)
        sys.stderr.buffer.flush()


if __name__ == "__main__":
    main()
