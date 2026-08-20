import { spawn } from 'node:child_process';

const gracefulTerminationMs = 250;
const forcedTerminationMs = 750;
const taskkillTimeoutMs = 2_000;
const pollIntervalMs = 25;

export interface ProcessTreeTermination {
  terminationBoundary: 'unix-process-group' | 'windows-taskkill-tree';
  verified: boolean;
  limitation?: string;
}

function wait(milliseconds: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

function isMissingProcess(error: unknown): boolean {
  return (error as NodeJS.ErrnoException).code === 'ESRCH';
}

function unixProcessGroupExists(pid: number): boolean {
  try {
    process.kill(-pid, 0);
    return true;
  } catch (error) {
    if (isMissingProcess(error)) return false;
    throw error;
  }
}

async function waitForUnixProcessGroupExit(pid: number, timeoutMs: number): Promise<boolean> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (!unixProcessGroupExists(pid)) return true;
    await wait(pollIntervalMs);
  }
  return !unixProcessGroupExists(pid);
}

async function terminateUnixProcessGroup(pid: number): Promise<ProcessTreeTermination> {
  const terminationBoundary = 'unix-process-group' as const;
  try {
    process.kill(-pid, 'SIGTERM');
  } catch (error) {
    if (isMissingProcess(error)) return { terminationBoundary, verified: true };
    return {
      terminationBoundary,
      verified: false,
      limitation: 'The Unix process group could not be signaled with SIGTERM.',
    };
  }

  try {
    if (await waitForUnixProcessGroupExit(pid, gracefulTerminationMs)) {
      return { terminationBoundary, verified: true };
    }
    try {
      process.kill(-pid, 'SIGKILL');
    } catch (error) {
      if (isMissingProcess(error)) return { terminationBoundary, verified: true };
      return {
        terminationBoundary,
        verified: false,
        limitation: 'The Unix process group could not be escalated to SIGKILL.',
      };
    }
    if (await waitForUnixProcessGroupExit(pid, forcedTerminationMs)) {
      return { terminationBoundary, verified: true };
    }
    return {
      terminationBoundary,
      verified: false,
      limitation: 'The Unix process group remained observable after SIGKILL.',
    };
  } catch {
    return {
      terminationBoundary,
      verified: false,
      limitation: 'The Unix process-group termination state could not be verified.',
    };
  }
}

async function terminateWindowsProcessTree(pid: number): Promise<ProcessTreeTermination> {
  const terminationBoundary = 'windows-taskkill-tree' as const;
  return new Promise((resolve) => {
    let settled = false;
    const taskkill = spawn('taskkill', ['/pid', String(pid), '/T', '/F'], {
      shell: false,
      stdio: ['ignore', 'ignore', 'ignore'],
      windowsHide: true,
    });
    const settle = (result: ProcessTreeTermination): void => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      resolve(result);
    };
    const timeout = setTimeout(() => {
      taskkill.kill();
      settle({
        terminationBoundary,
        verified: false,
        limitation: 'Windows taskkill did not finish within the cleanup timeout.',
      });
    }, taskkillTimeoutMs);

    taskkill.once('error', () => settle({
      terminationBoundary,
      verified: false,
      limitation: 'Windows taskkill could not be started.',
    }));
    taskkill.once('close', (code) => settle(code === 0
      ? { terminationBoundary, verified: true }
      : {
          terminationBoundary,
          verified: false,
          limitation: 'Windows taskkill did not confirm process-tree termination.',
        }));
  });
}

export async function terminateProcessTree(pid: number): Promise<ProcessTreeTermination> {
  if (!Number.isSafeInteger(pid) || pid <= 0) {
    return process.platform === 'win32'
      ? {
          terminationBoundary: 'windows-taskkill-tree',
          verified: false,
          limitation: 'Process-tree cleanup could not start because no valid process identifier was available.',
        }
      : {
          terminationBoundary: 'unix-process-group',
          verified: false,
          limitation: 'Process-tree cleanup could not start because no valid process identifier was available.',
        };
  }
  return process.platform === 'win32'
    ? terminateWindowsProcessTree(pid)
    : terminateUnixProcessGroup(pid);
}
