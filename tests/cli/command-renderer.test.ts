import { describe, expect, it } from 'vitest';
import { renderCommandForShell, renderPlatformCommand } from '../../src/cli/command-renderer.js';

describe('CLI command rendering', () => {
  it('single-quotes every POSIX argument and escapes embedded single quotes', () => {
    expect(renderCommandForShell('posix-sh', 'postvibe', [
      'space value',
      "single'quote",
      '$(touch substituted)',
      '`touch substituted`',
      '$VALUE',
      ';',
      '[glob]*',
    ])).toBe(
      "'postvibe' 'space value' 'single'\"'\"'quote' '$(touch substituted)' '`touch substituted`' '$VALUE' ';' '[glob]*'",
    );
  });

  it('uses PowerShell single-quoted literals for Windows shell metacharacters', () => {
    expect(renderCommandForShell('powershell', 'postvibe', [
      'space value',
      "single'quote",
      '$VALUE',
      '`value',
      '%VALUE%',
      ';&|<>*?(){}[]',
    ])).toBe(
      "& 'postvibe' 'space value' 'single''quote' '$VALUE' '`value' '%VALUE%' ';&|<>*?(){}[]'",
    );
  });

  it('labels the selected platform shell policy explicitly', () => {
    expect(renderPlatformCommand('win32', 'postvibe', ['execute'])).toEqual({
      shellLabel: 'PowerShell',
      command: "& 'postvibe' 'execute'",
    });
    expect(renderPlatformCommand('linux', 'postvibe', ['execute'])).toEqual({
      shellLabel: 'POSIX sh',
      command: "'postvibe' 'execute'",
    });
  });

  it('rejects an invocation that exceeds the bounded display length', () => {
    expect(() => renderCommandForShell('posix-sh', 'postvibe', ['x'.repeat(16_384)]))
      .toThrow('Rendered command exceeds the bounded display length.');
  });
});
