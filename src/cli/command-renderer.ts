import { containsMarkdownLineOrControl } from '../report/markdown-safety.js';

export type CommandShell = 'posix-sh' | 'powershell';

export interface RenderedPlatformCommand {
  shellLabel: 'POSIX sh' | 'PowerShell';
  command: string;
}

const maximumRenderedLength = 16_384;

function quotePosixArgument(value: string): string {
  return `'${value.replaceAll("'", `'"'"'`)}'`;
}

function quotePowerShellArgument(value: string): string {
  return `'${value.replaceAll("'", "''")}'`;
}

export function renderCommandForShell(
  shell: CommandShell,
  executable: string,
  args: readonly string[],
): string {
  const values = [executable, ...args];
  if (values.some(containsMarkdownLineOrControl)) {
    throw new RangeError('Rendered command arguments must not contain line or control characters.');
  }
  const quote = shell === 'powershell' ? quotePowerShellArgument : quotePosixArgument;
  const rendered = `${shell === 'powershell' ? '& ' : ''}${values.map(quote).join(' ')}`;
  if (rendered.length > maximumRenderedLength) {
    throw new RangeError('Rendered command exceeds the bounded display length.');
  }
  return rendered;
}

export function renderPlatformCommand(
  platform: NodeJS.Platform,
  executable: string,
  args: readonly string[],
): RenderedPlatformCommand {
  const windows = platform === 'win32';
  return {
    shellLabel: windows ? 'PowerShell' : 'POSIX sh',
    command: renderCommandForShell(windows ? 'powershell' : 'posix-sh', executable, args),
  };
}
