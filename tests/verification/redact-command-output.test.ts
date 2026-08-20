import { Buffer } from 'node:buffer';
import { describe, expect, it } from 'vitest';
import {
  COMMAND_OUTPUT_LIMIT_BYTES,
  createCommandOutputCollector,
  redactCommandOutput,
} from '../../src/verification/redact-command-output.js';

describe('command output redaction', () => {
  it.each([
    ['APP_TOKEN=token-value', 'APP_TOKEN=[REDACTED]'],
    ['databasePassword: password-value', 'databasePassword: [REDACTED]'],
    ['Authorization: Bearer bearer-token', 'Authorization: Bearer [REDACTED]'],
    ['Cookie: sessionId=cookie-value; theme=dark', 'Cookie: [REDACTED]'],
    ['cookie=cookie-value', 'cookie=[REDACTED]'],
    ['authorization=basic-value', 'authorization=[REDACTED]'],
    ['session=session-value', 'session=[REDACTED]'],
    ['{"api_key":"json-value"}', '{"api_key":[REDACTED]}'],
    [
      '-----BEGIN PRIVATE KEY-----\nprivate-key-value\n-----END PRIVATE KEY-----',
      '[REDACTED]',
    ],
  ])('redacts credential evidence in %j', (input, expected) => {
    expect(redactCommandOutput(input)).toBe(expected);
  });

  it('leaves unrelated command output unchanged', () => {
    const output = 'build completed\nfiles: 17\nduration: 2.4s';

    expect(redactCommandOutput(output)).toBe(output);
  });

  it('bounds direct redaction results without splitting UTF-8 code points', () => {
    const output = redactCommandOutput(`first-🙂-${'x'.repeat(COMMAND_OUTPUT_LIMIT_BYTES)}-last-🙃`);

    expect(output).toContain('[... output truncated ...]');
    expect(output.startsWith('first-🙂-')).toBe(true);
    expect(output.endsWith('-last-🙃')).toBe(true);
    expect(output).not.toContain('\uFFFD');
    expect(Buffer.byteLength(output, 'utf8')).toBeLessThanOrEqual(COMMAND_OUTPUT_LIMIT_BYTES);
  });

  it('joins stream chunk boundaries before redacting', () => {
    const collector = createCommandOutputCollector();
    collector.append('APP_TO');
    collector.append('KEN=split-secret\nAuthorization: Bear');
    collector.append('er second-split-secret\n');

    expect(collector.finish()).toEqual({
      output: 'APP_TOKEN=[REDACTED]\nAuthorization: Bearer [REDACTED]\n',
      truncated: false,
    });
  });

  it('does not mark output at the exact byte limit as truncated', () => {
    const collector = createCommandOutputCollector();
    collector.append('x'.repeat(COMMAND_OUTPUT_LIMIT_BYTES));

    const result = collector.finish();

    expect(result.truncated).toBe(false);
    expect(Buffer.byteLength(result.output, 'utf8')).toBe(COMMAND_OUTPUT_LIMIT_BYTES);
  });

  it('retains valid UTF-8 evidence from both ends within the byte limit', () => {
    const collector = createCommandOutputCollector();
    collector.append(`first-🙂-${'x'.repeat(COMMAND_OUTPUT_LIMIT_BYTES)}-last-🙃`);

    const result = collector.finish();

    expect(result.truncated).toBe(true);
    expect(result.output).toContain('[... output truncated ...]');
    expect(result.output.startsWith('first-🙂-')).toBe(true);
    expect(result.output.endsWith('-last-🙃')).toBe(true);
    expect(result.output).not.toContain('\uFFFD');
    expect(Buffer.byteLength(result.output, 'utf8')).toBeLessThanOrEqual(COMMAND_OUTPUT_LIMIT_BYTES);
  });
});
