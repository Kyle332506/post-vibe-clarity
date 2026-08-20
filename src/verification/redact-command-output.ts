import { Buffer } from 'node:buffer';
import { TextDecoder } from 'node:util';

export const COMMAND_OUTPUT_LIMIT_BYTES = 262_144;

const truncationMarker = '\n[... output truncated ...]\n';
const markerBytes = Buffer.byteLength(truncationMarker, 'utf8');
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
  'AUTHORIZATION',
];
const maximumSensitivePartLength = Math.max(...sensitiveAssignmentParts.map((part) => part.length));

interface SensitiveByteObservation {
  sensitive: boolean;
  sensitiveStart?: number;
}

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

function redactBoundaryTail(input: string): string {
  return input.replace(/^[^\r\n]*/u, '[REDACTED]');
}

function asciiUpper(byte: number): string {
  if (byte >= 0x61 && byte <= 0x7a) return String.fromCharCode(byte - 0x20);
  return byte <= 0x7f ? String.fromCharCode(byte) : '';
}

function isIdentifierByte(character: string): boolean {
  return /^[A-Z0-9_.-]$/u.test(character);
}

function isIdentifierStart(character: string): boolean {
  return /^[A-Z_]$/u.test(character);
}

function isLineBreak(character: string): boolean {
  return character === '\r' || character === '\n';
}

function isUnquotedValueTerminator(character: string): boolean {
  return character === ' ' || character === '\t' || character === '\f'
    || character === '\v' || character === ',' || character === ';'
    || isLineBreak(character);
}

function createAssignmentTracker(): {
  observe(byte: number, offset: number): SensitiveByteObservation;
  reset(): void;
} {
  const exactNames = ['AUTHORIZATION', 'COOKIE', 'SET-COOKIE'] as const;
  let valueMode: 'scan' | 'awaiting' | 'unquoted' | 'single-quoted' | 'double-quoted' | 'header' = 'scan';
  let identifierActive = false;
  let identifierEligible = false;
  let identifierStart = 0;
  let identifierLength = 0;
  let identifierWindow = '';
  let identifierSensitive = false;
  let exactMatches = exactNames.map(() => true);
  let pending: { assignment: boolean; header: boolean; start: number; quoteAllowed: boolean } | undefined;

  function resetIdentifier(): void {
    identifierActive = false;
    identifierEligible = false;
    identifierStart = 0;
    identifierLength = 0;
    identifierWindow = '';
    identifierSensitive = false;
    exactMatches = exactNames.map(() => true);
  }

  function reset(): void {
    valueMode = 'scan';
    pending = undefined;
    resetIdentifier();
  }

  function updateIdentifier(character: string): void {
    exactMatches = exactMatches.map(
      (matches, index) => matches && exactNames[index]![identifierLength] === character,
    );
    identifierLength += 1;
    identifierWindow = `${identifierWindow}${character}`.slice(-maximumSensitivePartLength);
    identifierSensitive ||= sensitiveAssignmentParts.some((part) => identifierWindow.endsWith(part));
  }

  function finishIdentifier(): void {
    if (!identifierActive) return;
    if (identifierEligible) {
      const authorization = exactMatches[0] === true && identifierLength === exactNames[0].length;
      const cookieHeader = (exactMatches[1] === true && identifierLength === exactNames[1].length)
        || (exactMatches[2] === true && identifierLength === exactNames[2].length);
      pending = {
        assignment: identifierSensitive || authorization,
        header: authorization || cookieHeader,
        start: identifierStart,
        quoteAllowed: true,
      };
    } else {
      pending = undefined;
    }
    resetIdentifier();
  }

  return {
    observe(byte, offset): SensitiveByteObservation {
      const character = asciiUpper(byte);

      if (valueMode === 'header') {
        if (isLineBreak(character)) valueMode = 'scan';
        return { sensitive: !isLineBreak(character) };
      }
      if (valueMode === 'awaiting') {
        if (isLineBreak(character) || character === ',' || character === ';') {
          valueMode = 'scan';
          return { sensitive: false };
        }
        if (character === "'") valueMode = 'single-quoted';
        else if (character === '"') valueMode = 'double-quoted';
        else if (!isUnquotedValueTerminator(character)) valueMode = 'unquoted';
        return { sensitive: true };
      }
      if (valueMode === 'unquoted') {
        if (isUnquotedValueTerminator(character)) {
          valueMode = 'scan';
          return { sensitive: false };
        }
        return { sensitive: true };
      }
      if (valueMode === 'single-quoted' || valueMode === 'double-quoted') {
        if (isLineBreak(character)) {
          valueMode = 'scan';
          return { sensitive: false };
        }
        const closingQuote = valueMode === 'single-quoted' ? "'" : '"';
        if (character === closingQuote) valueMode = 'scan';
        return { sensitive: true };
      }

      if (identifierActive && isIdentifierByte(character)) {
        updateIdentifier(character);
        return { sensitive: false };
      }
      finishIdentifier();

      if (pending !== undefined) {
        if ((character === "'" || character === '"') && pending.quoteAllowed) {
          pending.quoteAllowed = false;
          return { sensitive: false };
        }
        if (character === ' ' || character === '\t' || character === '\f' || character === '\v') {
          return { sensitive: false };
        }
        if ((character === ':' || character === '=') && pending.assignment) {
          const sensitiveStart = pending.start;
          valueMode = character === ':' && pending.header ? 'header' : 'awaiting';
          pending = undefined;
          return { sensitive: true, sensitiveStart };
        }
        pending = undefined;
      }

      if (isIdentifierByte(character)) {
        identifierActive = true;
        identifierEligible = isIdentifierStart(character);
        identifierStart = offset;
        updateIdentifier(character);
      } else if (isLineBreak(character)) {
        pending = undefined;
      }
      return { sensitive: false };
    },
    reset,
  };
}

function createPrivateKeyMarkerTracker(kind: 'BEGIN' | 'END'): {
  observe(byte: number, offset: number): number | undefined;
  reset(): void;
} {
  const prefix = `-----${kind} `;
  const suffix = 'PRIVATE KEY';
  let prefixWindow = '';
  let candidateStart: number | undefined;
  let allowedSuffix = '';
  let closingHyphens = 0;

  function resetCandidate(): void {
    candidateStart = undefined;
    allowedSuffix = '';
    closingHyphens = 0;
  }

  function updatePrefix(character: string, offset: number): void {
    if (character === '') {
      prefixWindow = '';
      return;
    }
    prefixWindow = `${prefixWindow}${character}`.slice(-prefix.length);
    if (prefixWindow.endsWith(prefix)) {
      candidateStart = offset - prefix.length + 1;
      prefixWindow = '';
      allowedSuffix = '';
      closingHyphens = 0;
    }
  }

  return {
    observe(byte, offset): number | undefined {
      const character = asciiUpper(byte);
      if (candidateStart === undefined) {
        updatePrefix(character, offset);
        return undefined;
      }
      if (closingHyphens > 0) {
        if (character === '-') {
          closingHyphens += 1;
          if (closingHyphens === 5) {
            const matchedStart = candidateStart;
            resetCandidate();
            prefixWindow = '';
            return matchedStart;
          }
          return undefined;
        }
        resetCandidate();
        updatePrefix(character, offset);
        return undefined;
      }
      if (/^[A-Z0-9 ]$/u.test(character)) {
        allowedSuffix = `${allowedSuffix}${character}`.slice(-suffix.length);
        return undefined;
      }
      if (character === '-' && allowedSuffix.endsWith(suffix)) {
        closingHyphens = 1;
        return undefined;
      }
      resetCandidate();
      updatePrefix(character, offset);
      return undefined;
    },
    reset(): void {
      prefixWindow = '';
      resetCandidate();
    },
  };
}

function createSensitiveBoundaryTracker(): {
  observe(byte: number, offset: number): SensitiveByteObservation;
  reset(): void;
} {
  const assignments = createAssignmentTracker();
  const privateKeyBegin = createPrivateKeyMarkerTracker('BEGIN');
  const privateKeyEnd = createPrivateKeyMarkerTracker('END');
  let privateKeyOpen = false;

  return {
    observe(byte, offset): SensitiveByteObservation {
      if (privateKeyOpen) {
        if (privateKeyEnd.observe(byte, offset) !== undefined) {
          privateKeyOpen = false;
          privateKeyBegin.reset();
          assignments.reset();
        }
        return { sensitive: true };
      }

      const assignment = assignments.observe(byte, offset);
      const privateKeyStart = privateKeyBegin.observe(byte, offset);
      if (privateKeyStart !== undefined) {
        privateKeyOpen = true;
        privateKeyEnd.reset();
        assignments.reset();
        return { sensitive: true, sensitiveStart: privateKeyStart };
      }
      return assignment;
    },
    reset(): void {
      privateKeyOpen = false;
      assignments.reset();
      privateKeyBegin.reset();
      privateKeyEnd.reset();
    },
  };
}

function redactLikelySecrets(input: string): string {
  return redactAssignments(redactHeaders(redactPrivateKeys(input)));
}

function boundRedactedOutput(
  input: string,
  limitBytes: number = COMMAND_OUTPUT_LIMIT_BYTES,
): { output: string; truncated: boolean } {
  const retainedBytes = limitBytes - markerBytes;
  const boundedHeadCapacity = Math.floor(retainedBytes / 2);
  const boundedTailCapacity = retainedBytes - boundedHeadCapacity;
  const bytes = Buffer.from(input, 'utf8');
  if (bytes.byteLength <= limitBytes) return { output: input, truncated: false };
  return {
    output: `${decodeCompletePrefix(bytes.subarray(0, boundedHeadCapacity))}${truncationMarker}${decodeCompleteSuffix(bytes.subarray(bytes.byteLength - boundedTailCapacity))}`,
    truncated: true,
  };
}

export function redactCommandOutput(input: string): string {
  return redactAndBoundCommandOutput(input).output;
}

export function redactAndBoundCommandOutput(input: string): CollectedCommandOutput {
  const bounded = boundRedactedOutput(redactLikelySecrets(input));
  return { output: bounded.output, truncated: bounded.truncated };
}

export function createCommandOutputCollector(
  limitBytes: number = COMMAND_OUTPUT_LIMIT_BYTES,
): CommandOutputCollector {
  if (!Number.isSafeInteger(limitBytes) || limitBytes < markerBytes) {
    throw new Error('Command output collector limit must fit the truncation marker.');
  }
  const rawHeadCapacity = Math.floor(limitBytes / 2);
  const rawTailCapacity = limitBytes - rawHeadCapacity;
  const head = Buffer.alloc(rawHeadCapacity);
  const tail = Buffer.alloc(rawTailCapacity);
  const tailSensitivity = Buffer.alloc(rawTailCapacity);
  const boundaryTracker = createSensitiveBoundaryTracker();
  let headLength = 0;
  let tailLength = 0;
  let totalBytes = 0;
  let finished = false;

  function clearRawBuffers(): void {
    head.fill(0);
    tail.fill(0);
    tailSensitivity.fill(0);
    boundaryTracker.reset();
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
        const previousTotalBytes = totalBytes;
        totalBytes += bytes.byteLength;

        const headBytes = Math.min(rawHeadCapacity - headLength, bytes.byteLength);
        if (headBytes > 0) {
          bytes.copy(head, headLength, 0, headBytes);
          headLength += headBytes;
        }

        const remainder = bytes.subarray(headBytes);
        if (remainder.byteLength >= rawTailCapacity) {
          remainder.copy(tail, 0, remainder.byteLength - rawTailCapacity);
          tailSensitivity.fill(0);
          tailLength = rawTailCapacity;
        } else if (remainder.byteLength > 0) {
          const overflow = Math.max(0, tailLength + remainder.byteLength - rawTailCapacity);
          if (overflow > 0) {
            tail.copyWithin(0, overflow, tailLength);
            tailSensitivity.copyWithin(0, overflow, tailLength);
          }
          tailLength -= overflow;
          remainder.copy(tail, tailLength);
          tailSensitivity.fill(0, tailLength, tailLength + remainder.byteLength);
          tailLength += remainder.byteLength;
        }

        const tailStartOffset = totalBytes - tailLength;
        for (let index = 0; index < bytes.byteLength; index += 1) {
          const offset = previousTotalBytes + index;
          const observation = boundaryTracker.observe(bytes[index]!, offset);
          if (offset >= tailStartOffset) {
            tailSensitivity[offset - tailStartOffset] = observation.sensitive ? 1 : 0;
          }
          if (observation.sensitiveStart !== undefined) {
            const start = Math.max(observation.sensitiveStart, tailStartOffset);
            const end = Math.min(offset + 1, totalBytes);
            if (start < end) tailSensitivity.fill(1, start - tailStartOffset, end - tailStartOffset);
          }
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
        const rawTruncated = totalBytes > limitBytes;
        if (rawTruncated) {
          const rawHead = decodeCompletePrefix(head.subarray(0, headLength));
          const rawTail = decodeCompleteSuffix(tail.subarray(0, tailLength));
          raw = `${redactPrivateKeys(rawHead)}${truncationMarker}${redactPrivateKeyTail(
            tailSensitivity[0] === 1 ? redactBoundaryTail(rawTail) : rawTail,
          )}`;
        } else {
          const decoder = new TextDecoder('utf-8');
          raw = decoder.decode(head.subarray(0, headLength), { stream: true })
            + decoder.decode(tail.subarray(0, tailLength));
        }

        const bounded = boundRedactedOutput(redactLikelySecrets(raw), limitBytes);
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
