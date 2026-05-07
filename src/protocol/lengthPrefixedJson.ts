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
