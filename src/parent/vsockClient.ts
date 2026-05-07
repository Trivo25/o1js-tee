import { spawn } from 'node:child_process';
import path from 'node:path';
import {
  decodeLengthPrefixedJson,
  encodeLengthPrefixedJson,
} from '../protocol/lengthPrefixedJson.js';

export type VsockClientOptions = {
  port: number;
  cid?: number;
  mode?: 'vsock' | 'tcp';
  host?: string;
  maxFrameBytes?: number;
  pythonBin?: string;
  helperPath?: string;
};

export async function sendFramedJson(
  request: unknown,
  options: VsockClientOptions
): Promise<unknown> {
  const stdout = await runClientHelper(
    helperArgs(options),
    encodeLengthPrefixedJson(request),
    options
  );
  return decodeLengthPrefixedJson(
    stdout,
    options.maxFrameBytes ?? 16 * 1024 * 1024
  );
}

function helperArgs(options: VsockClientOptions): string[] {
  const mode = options.mode ?? 'vsock';
  const args = [helperPath(options), '--mode', mode, '--port', String(options.port)];

  if (mode === 'tcp') {
    args.push('--host', options.host ?? '127.0.0.1');
  } else {
    if (options.cid === undefined) {
      throw new Error('cid is required for vsock mode');
    }
    args.push('--cid', String(options.cid));
  }

  return args;
}

function helperPath(options: VsockClientOptions): string {
  return options.helperPath ?? path.join('parent-shim', 'vsock_client.py');
}

function runClientHelper(
  args: string[],
  input: Buffer,
  options: VsockClientOptions
): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const child = spawn(options.pythonBin ?? 'python3', args, {
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    const stdout: Buffer[] = [];
    const stderr: Buffer[] = [];

    child.stdout.on('data', (chunk: Buffer) => stdout.push(chunk));
    child.stderr.on('data', (chunk: Buffer) => stderr.push(chunk));
    child.once('error', reject);
    child.once('exit', (code) => {
      if (code === 0) {
        resolve(Buffer.concat(stdout));
      } else {
        reject(
          new Error(
            `vsock client exited with ${code}: ${Buffer.concat(stderr).toString(
              'utf8'
            )}`
          )
        );
      }
    });

    child.stdin.end(input);
  });
}
