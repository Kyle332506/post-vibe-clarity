import { Buffer } from 'node:buffer';
import { TextDecoder } from 'node:util';

export const COMMAND_OUTPUT_LIMIT_BYTES = 262_144;

const truncationMarker = '\n[... output truncated ...]\n';
const markerBytes = Buffer.byteLength(truncationMarker, 'utf8');
const retainedBytes = COMMAND_OUTPUT_LIMIT_BYTES - markerBytes;
const boundedHeadCapacity = Math.floor(retainedBytes / 2);
const boundedTailCapacity = retainedBytes - boundedHeadCapacity;
const rawHeadCapacity = Math.floor(COMMAND_OUTPUT_LIMIT_BYTES / 2);
const rawTailCapacity = COMMAND_OUTPUT_LIMIT_BYTES - rawHeadCapacity;
const utf8Decoder = new TextDecoder('utf-8');
const sensitiveAssignmentParts = [
  'TOKEN',
  'SECRET',
  'PASSWORD',
  'PASSWD',
  'PRIVATE_KEY',
  'CREDENTIAL',
  'API_KEY',
  'COOKIE',
  'SESSION',
];

export interface CollectedCommandOutput {
  output: string;
  truncated: boolean;
}

export interface CommandOutputCollector {
  append(chunk: string | Uint8Array): void;
  finish(): CollectedCommandOutput;
  dispose(): void;
}

function isUtf8ContinuationByte(byte: number): boolean {
  return byte >= 0x80 && byte <= 0xbf;
}

function utf8SequenceLength(byte: number): number {
  if (byte >= 0xc2 && byte <= 0xdf) return 2;
  if (byte >= 0xe0 && byte <= 0xef) return 3;
  if (byte >= 0xf0 && byte <= 0xf4) return 4;
  return 1;
}

function decodeCompletePrefix(bytes: Uint8Array): string {
  if (bytes.byteLength === 0) return '';
  let sequenceStart = bytes.byteLength - 1;
  while (sequenceStart > 0 && isUtf8ContinuationByte(bytes[sequenceStart]!)) {
    sequenceStart -= 1;
  }
  const expectedLength = utf8SequenceLength(bytes[sequenceStart]!);
  const availableLength = bytes.byteLength - sequenceStart;
  const end = expectedLength > availableLength ? sequenceStart : bytes.byteLength;
  return utf8Decoder.decode(bytes.subarray(0, end));
}

function decodeCompleteSuffix(bytes: Uint8Array): string {
  let start = 0;
  while (start < Math.min(3, bytes.byteLength) && isUtf8ContinuationByte(bytes[start]!)) start += 1;
  return utf8Decoder.decode(bytes.subarray(start));
}

function redactCompletePrivateKeys(input: string): string {
  return input.replace(
    /-----BEGIN ([A-Z0-9 ]*PRIVATE KEY)-----[\s\S]*?-----END \1-----/giu,
    '[REDACTED]',
  );
}

function redactPrivateKeys(input: string): string {
  return redactCompletePrivateKeys(input)
    .replace(/-----BEGIN [A-Z0-9 ]*PRIVATE KEY-----[\s\S]*$/giu, '[REDACTED]');
}

function redactHeaders(input: string): string {
  return input
    .replace(
      /(\bAuthorization\s*:\s*)(Bearer\s+)?[^\r\n]*/giu,
      (_match, prefix: string, bearer: string | undefined) => `${prefix}${bearer ?? ''}[REDACTED]`,
    )
    .replace(/(\bAuthorization\s*=\s*)(?:"[^"\r\n]*"|'[^'\r\n]*'|[^\s,;\r\n]+)/giu, '$1[REDACTED]')
    .replace(/(\b(?:Set-Cookie|Cookie)\s*:\s*)[^\r\n]*/giu, '$1[REDACTED]');
}

function redactAssignments(input: string): string {
  return input.replace(
    /((?<![A-Z0-9_.-])["']?(?=[A-Z0-9_.-]*(?:TOKEN|SECRET|PASSWORD|PASSWD|PRIVATE_KEY|CREDENTIAL|API_KEY|COOKIE|SESSION))[A-Z_][A-Z0-9_.-]*["']?\s*[:=]\s*)(?:"[^"\r\n]*"|'[^'\r\n]*'|[^\s,;\r\n]+)/giu,
    '$1[REDACTED]',
  );
}

function redactPrivateKeyTail(input: string): string {
  return redactCompletePrivateKeys(input)
    .replace(/^[\s\S]*?-----END [A-Z0-9 ]*PRIVATE KEY-----/iu, '[REDACTED]');
}

function hasOpenSensitiveLine(input: string): boolean {
  const line = input.slice(Math.max(input.lastIndexOf('\n'), input.lastIndexOf('\r')) + 1);
  return /\bAuthorization\s*:\s*Bearer\s+[^\s\r\n]*$/iu.test(line)
    || /\bAuthorization\s*[:=]/iu.test(line)
    || /\b(?:Set-Cookie|Cookie)\s*:/iu.test(line)
    || /(?<![A-Z0-9_.-])["']?(?=[A-Z0-9_.-]*(?:TOKEN|SECRET|PASSWORD|PASSWD|PRIVATE_KEY|CREDENTIAL|API_KEY|COOKIE|SESSION))[A-Z_][A-Z0-9_.-]*["']?\s*[:=]/iu.test(line);
}

function redactBoundaryTail(input: string): string {
  return input.replace(/^[^\r\n]*/u, '[REDACTED]');
}

function hasCrossGapSensitiveAssignment(head: string, tail: string, gapBytes: number): boolean {
  const headIdentifier = /[A-Z0-9_.-]+$/iu.exec(head)?.[0]?.toUpperCase();
  const tailIdentifier = /^([A-Z0-9_.-]*)\s*[:=]/iu.exec(tail)?.[1]?.toUpperCase();
  if (headIdentifier === undefined || tailIdentifier === undefined) return false;

  return sensitiveAssignmentParts.some((part) => {
    for (let retainedHeadLength = 1; retainedHeadLength < part.length; retainedHeadLength += 1) {
      if (!headIdentifier.endsWith(part.slice(0, retainedHeadLength))) continue;
      const maximumOmittedLength = Math.min(gapBytes, part.length - retainedHeadLength - 1);
      for (let omittedLength = 0; omittedLength <= maximumOmittedLength; omittedLength += 1) {
        if (tailIdentifier.startsWith(part.slice(retainedHeadLength + omittedLength))) return true;
      }
    }
    return false;
  });
}

function redactLikelySecrets(input: string): string {
  return redactAssignments(redactHeaders(redactPrivateKeys(input)));
}

function boundRedactedOutput(input: string): { output: string; truncated: boolean } {
  const bytes = Buffer.from(input, 'utf8');
  if (bytes.byteLength <= COMMAND_OUTPUT_LIMIT_BYTES) return { output: input, truncated: false };
  return {
    output: `${decodeCompletePrefix(bytes.subarray(0, boundedHeadCapacity))}${truncationMarker}${decodeCompleteSuffix(bytes.subarray(bytes.byteLength - boundedTailCapacity))}`,
    truncated: true,
  };
}

export function redactCommandOutput(input: string): string {
  return boundRedactedOutput(redactLikelySecrets(input)).output;
}

export function createCommandOutputCollector(): CommandOutputCollector {
  const head = Buffer.alloc(rawHeadCapacity);
  const tail = Buffer.alloc(rawTailCapacity);
  let headLength = 0;
  let tailLength = 0;
  let totalBytes = 0;
  let finished = false;

  function clearRawBuffers(): void {
    head.fill(0);
    tail.fill(0);
    headLength = 0;
    tailLength = 0;
    totalBytes = 0;
  }

  return {
    append(chunk): void {
      if (finished) throw new Error('Command output collector is already finished.');
      let bytes: Buffer | undefined;
      try {
        bytes = typeof chunk === 'string' ? Buffer.from(chunk, 'utf8') : Buffer.from(chunk);
        totalBytes += bytes.byteLength;

        const headBytes = Math.min(rawHeadCapacity - headLength, bytes.byteLength);
        if (headBytes > 0) {
          bytes.copy(head, headLength, 0, headBytes);
          headLength += headBytes;
        }

        const remainder = bytes.subarray(headBytes);
        if (remainder.byteLength >= rawTailCapacity) {
          remainder.copy(tail, 0, remainder.byteLength - rawTailCapacity);
          tailLength = rawTailCapacity;
        } else if (remainder.byteLength > 0) {
          const overflow = Math.max(0, tailLength + remainder.byteLength - rawTailCapacity);
          if (overflow > 0) tail.copyWithin(0, overflow, tailLength);
          tailLength -= overflow;
          remainder.copy(tail, tailLength);
          tailLength += remainder.byteLength;
        }
      } catch (error) {
        finished = true;
        clearRawBuffers();
        throw error;
      } finally {
        bytes?.fill(0);
      }
    },

    finish(): CollectedCommandOutput {
      if (finished) throw new Error('Command output collector is already finished.');
      finished = true;
      let raw = '';
      try {
        const rawTruncated = totalBytes > COMMAND_OUTPUT_LIMIT_BYTES;
        if (rawTruncated) {
          const gapBytes = totalBytes - headLength - tailLength;
          const rawHead = decodeCompletePrefix(head.subarray(0, headLength));
          const rawTail = decodeCompleteSuffix(tail.subarray(0, tailLength));
          const boundarySensitive = hasOpenSensitiveLine(rawHead)
            || hasCrossGapSensitiveAssignment(rawHead, rawTail, gapBytes);
          raw = `${redactPrivateKeys(rawHead)}${truncationMarker}${redactPrivateKeyTail(
            boundarySensitive ? redactBoundaryTail(rawTail) : rawTail,
          )}`;
        } else {
          const decoder = new TextDecoder('utf-8');
          raw = decoder.decode(head.subarray(0, headLength), { stream: true })
            + decoder.decode(tail.subarray(0, tailLength));
        }

        const bounded = boundRedactedOutput(redactLikelySecrets(raw));
        raw = '';
        return {
          output: bounded.output,
          truncated: rawTruncated || bounded.truncated,
        };
      } finally {
        raw = '';
        clearRawBuffers();
      }
    },

    dispose(): void {
      finished = true;
      clearRawBuffers();
    },
  };
}
