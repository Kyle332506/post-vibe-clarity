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
const utf8Decoder = new TextDecoder('utf-8', { fatal: true });

export interface CollectedCommandOutput {
  output: string;
  truncated: boolean;
}

export interface CommandOutputCollector {
  append(chunk: string | Uint8Array): void;
  finish(): CollectedCommandOutput;
}

function decodeCompletePrefix(bytes: Uint8Array): string {
  for (let end = bytes.byteLength; end >= Math.max(0, bytes.byteLength - 3); end -= 1) {
    try {
      return utf8Decoder.decode(bytes.subarray(0, end));
    } catch {
      // Try again without the incomplete trailing code point.
    }
  }
  return '';
}

function decodeCompleteSuffix(bytes: Uint8Array): string {
  for (let start = 0; start <= Math.min(3, bytes.byteLength); start += 1) {
    try {
      return utf8Decoder.decode(bytes.subarray(start));
    } catch {
      // Try again without the incomplete leading code point.
    }
  }
  return '';
}

function redactPrivateKeys(input: string): string {
  return input.replace(
    /-----BEGIN ([A-Z0-9 ]*PRIVATE KEY)-----[\s\S]*?-----END \1-----/giu,
    '[REDACTED]',
  );
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

function redactUnterminatedPrivateKey(input: string): string {
  return input.replace(/-----BEGIN [A-Z0-9 ]*PRIVATE KEY-----[\s\S]*$/giu, '[REDACTED]');
}

function redactPrivateKeyTail(input: string): string {
  return input.replace(/^[\s\S]*?-----END [A-Z0-9 ]*PRIVATE KEY-----/iu, '[REDACTED]');
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

  return {
    append(chunk): void {
      if (finished) throw new Error('Command output collector is already finished.');
      const bytes = typeof chunk === 'string' ? Buffer.from(chunk, 'utf8') : Buffer.from(chunk);
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
      bytes.fill(0);
    },

    finish(): CollectedCommandOutput {
      if (finished) throw new Error('Command output collector is already finished.');
      finished = true;
      const rawTruncated = totalBytes > COMMAND_OUTPUT_LIMIT_BYTES;
      let raw: string;
      if (rawTruncated) {
        const rawHead = decodeCompletePrefix(head.subarray(0, headLength));
        let rawTail = decodeCompleteSuffix(tail.subarray(0, tailLength));
        if (hasOpenSensitiveLine(rawHead)) rawTail = redactBoundaryTail(rawTail);
        raw = `${redactUnterminatedPrivateKey(rawHead)}${truncationMarker}${redactPrivateKeyTail(rawTail)}`;
      } else {
        raw = utf8Decoder.decode(Buffer.concat([
          head.subarray(0, headLength),
          tail.subarray(0, tailLength),
        ]));
      }

      const redacted = redactLikelySecrets(raw);
      raw = '';
      head.fill(0);
      tail.fill(0);
      headLength = 0;
      tailLength = 0;
      totalBytes = 0;

      const bounded = boundRedactedOutput(redacted);
      return {
        output: bounded.output,
        truncated: rawTruncated || bounded.truncated,
      };
    },
  };
}
