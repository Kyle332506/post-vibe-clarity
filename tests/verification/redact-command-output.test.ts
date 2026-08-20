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

  it('does not persist a credential value whose name straddles the retention gap', () => {
    const firstEvidence = 'first evidence\n';
    const lastEvidence = '\nlast evidence';
    const head = `${firstEvidence}${'h'.repeat((COMMAND_OUTPUT_LIMIT_BYTES / 2) - firstEvidence.length - 6)}APP_TO`;
    const tailPrefix = 'EN=0123456789abcdefretention-gap-secret';
    const tail = `${tailPrefix}${'t'.repeat((COMMAND_OUTPUT_LIMIT_BYTES / 2) - tailPrefix.length - lastEvidence.length)}${lastEvidence}`;
    const collector = createCommandOutputCollector();
    collector.append(`${head}K${tail}`);

    const result = collector.finish();

    expect(result.truncated).toBe(true);
    expect(result.output.includes('retention-gap-secret')).toBe(false);
    expect(result.output.startsWith(firstEvidence)).toBe(true);
    expect(result.output.endsWith(lastEvidence)).toBe(true);
  });

  it('redacts an interrupted private-key block below the output limit', () => {
    const output = redactCommandOutput('before key\n-----BEGIN PRIVATE KEY-----\ninterrupted-private-key-body');

    expect(output).toBe('before key\n[REDACTED]');
  });

  it('decodes arbitrary non-truncated process bytes without losing surrounding evidence', () => {
    const collector = createCommandOutputCollector();
    collector.append(Buffer.concat([
      Buffer.from('before-', 'utf8'),
      Buffer.from([0xff, 0xfe]),
      Buffer.from('-after', 'utf8'),
    ]));

    expect(collector.finish()).toEqual({
      output: 'before-��-after',
      truncated: false,
    });
  });

  it('decodes arbitrary truncated process bytes while retaining evidence from both ends', () => {
    const firstEvidence = Buffer.concat([Buffer.from('first-', 'utf8'), Buffer.from([0xff])]);
    const lastEvidence = Buffer.concat([Buffer.from([0xfe]), Buffer.from('-last', 'utf8')]);
    const head = Buffer.concat([
      firstEvidence,
      Buffer.alloc((COMMAND_OUTPUT_LIMIT_BYTES / 2) - firstEvidence.byteLength, 0x68),
    ]);
    const tail = Buffer.concat([
      Buffer.alloc((COMMAND_OUTPUT_LIMIT_BYTES / 2) - lastEvidence.byteLength, 0x74),
      lastEvidence,
    ]);
    const collector = createCommandOutputCollector();
    collector.append(head);
    collector.append(Buffer.from([0x6d]));
    collector.append(tail);

    const result = collector.finish();

    expect(result.truncated).toBe(true);
    expect(result.output.startsWith('first-�')).toBe(true);
    expect(result.output.endsWith('�-last')).toBe(true);
    expect(Buffer.byteLength(result.output, 'utf8')).toBeLessThanOrEqual(COMMAND_OUTPUT_LIMIT_BYTES);
  });

  it('disposes raw command output without allowing later persistence', () => {
    const collector = createCommandOutputCollector();
    collector.append('APP_TOKEN=dispose-secret');

    collector.dispose();

    expect(() => collector.finish()).toThrow(/already finished/i);
    expect(() => collector.append('later output')).toThrow(/already finished/i);
    expect(() => collector.dispose()).not.toThrow();
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

  it('preserves unrelated head evidence after a complete private-key block', () => {
    const prefix = 'head-before-key\n';
    const key = '-----BEGIN PRIVATE KEY-----\nhead-private-key\n-----END PRIVATE KEY-----\n';
    const suffix = 'head-after-key\n';
    const retainedHead = `${prefix}${key}${suffix}${'h'.repeat((COMMAND_OUTPUT_LIMIT_BYTES / 2) - prefix.length - key.length - suffix.length)}`;
    const collector = createCommandOutputCollector();
    collector.append(`${retainedHead}omitted${'t'.repeat((COMMAND_OUTPUT_LIMIT_BYTES / 2) - 13)}\ntail evidence`);

    const result = collector.finish();

    expect(result.output.includes('head-before-key\n[REDACTED]\nhead-after-key')).toBe(true);
    expect(result.output.includes('tail evidence')).toBe(true);
    expect(result.output.includes('head-private-key')).toBe(false);
  });

  it('preserves unrelated tail evidence around a complete private-key block', () => {
    const prefix = 'tail-before-key\n';
    const key = '-----BEGIN PRIVATE KEY-----\ntail-private-key\n-----END PRIVATE KEY-----\n';
    const suffix = 'tail-after-key';
    const tail = `${prefix}${key}${'t'.repeat((COMMAND_OUTPUT_LIMIT_BYTES / 2) - prefix.length - key.length - suffix.length)}${suffix}`;
    const collector = createCommandOutputCollector();
    collector.append(`${'h'.repeat(COMMAND_OUTPUT_LIMIT_BYTES / 2)}omitted${tail}`);

    const result = collector.finish();

    expect(result.output.includes('tail-before-key\n[REDACTED]\n')).toBe(true);
    expect(result.output.includes('tail-after-key')).toBe(true);
    expect(result.output.includes('tail-private-key')).toBe(false);
  });
});
