#!/usr/bin/env python3
import argparse
import socket
import sys


def main() -> None:
    args = parse_args()
    sock = connect(args)
    with sock:
        sock.sendall(sys.stdin.buffer.read())
        sock.shutdown(socket.SHUT_WR)
        while True:
            chunk = sock.recv(65536)
            if chunk == b"":
                return
            sys.stdout.buffer.write(chunk)
            sys.stdout.buffer.flush()


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Send framed bytes over vsock")
    parser.add_argument("--mode", choices=["vsock", "tcp"], default="vsock")
    parser.add_argument("--cid", type=int)
    parser.add_argument("--host", default="127.0.0.1")
    parser.add_argument("--port", type=int, required=True)
    return parser.parse_args()


def connect(args: argparse.Namespace) -> socket.socket:
    if args.mode == "tcp":
        sock = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
        sock.connect((args.host, args.port))
        return sock

    if args.cid is None:
        raise SystemExit("--cid is required for vsock mode")
    if not hasattr(socket, "AF_VSOCK"):
        raise SystemExit("Python socket.AF_VSOCK is unavailable")

    sock = socket.socket(socket.AF_VSOCK, socket.SOCK_STREAM)
    sock.connect((args.cid, args.port))
    return sock


if __name__ == "__main__":
    main()
