import { once } from 'node:events';
import type { Writable } from 'node:stream';

const HEADER_BYTES = 4;

export function encodeLengthPrefixedJson(value: unknown): Buffer {
  const payload = Buffer.from(JSON.stringify(value), 'utf8');
  const frame = Buffer.allocUnsafe(HEADER_BYTES + payload.length);
  frame.writeUInt32BE(payload.length, 0);
  payload.copy(frame, HEADER_BYTES);
  return frame;
}

export function decodeLengthPrefixedJson(
  frame: Buffer,
  maxFrameBytes: number
): unknown {
  if (frame.length < HEADER_BYTES) {
    throw new Error('truncated frame header');
  }

  const payloadLength = frame.readUInt32BE(0);
  if (payloadLength > maxFrameBytes) {
    throw new Error('frame exceeds maximum size');
  }

  const expectedFrameLength = HEADER_BYTES + payloadLength;
  if (frame.length < expectedFrameLength) {
    throw new Error('truncated frame payload');
  }

  if (frame.length > expectedFrameLength) {
    throw new Error('frame has trailing bytes');
  }

  return JSON.parse(frame.subarray(HEADER_BYTES).toString('utf8'));
}

export class LengthPrefixedJsonReader {
  private readonly iterator: AsyncIterator<Buffer | string>;
  private buffered = Buffer.alloc(0);

  constructor(readable: AsyncIterable<Buffer | string>) {
    this.iterator = readable[Symbol.asyncIterator]();
  }

  async read(maxFrameBytes: number): Promise<unknown | undefined> {
    while (this.buffered.length < HEADER_BYTES) {
      if (!(await this.readMore())) {
        if (this.buffered.length === 0) return undefined;
        throw new Error('truncated frame header');
      }
    }

    const payloadLength = this.buffered.readUInt32BE(0);
    if (payloadLength > maxFrameBytes) {
      throw new Error('frame exceeds maximum size');
    }

    const frameLength = HEADER_BYTES + payloadLength;
    while (this.buffered.length < frameLength) {
      if (!(await this.readMore())) {
        throw new Error('truncated frame payload');
      }
    }

    const payload = this.buffered.subarray(HEADER_BYTES, frameLength);
    this.buffered = this.buffered.subarray(frameLength);
    return JSON.parse(payload.toString('utf8'));
  }

  private async readMore(): Promise<boolean> {
    const { value, done } = await this.iterator.next();
    if (done) return false;
    const chunk = Buffer.isBuffer(value) ? value : Buffer.from(value);
    this.buffered = Buffer.concat([this.buffered, chunk]);
    return true;
  }
}

export async function writeLengthPrefixedJson(
  writable: Writable,
  value: unknown
): Promise<void> {
  if (!writable.write(encodeLengthPrefixedJson(value))) {
    await once(writable, 'drain');
  }
}
