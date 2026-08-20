import { Buffer } from 'node:buffer';
import { access, mkdir, mkdtemp, readFile, realpath, rm, writeFile } from 'node:fs/promises';
import { constants } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { afterEach, describe, expect, it } from 'vitest';
import type { VerificationCommand } from '../../src/model/verification.js';
import { LocalCommandExecutor } from '../../src/verification/local-command-executor.js';
import { COMMAND_OUTPUT_LIMIT_BYTES } from '../../src/verification/redact-command-output.js';

const temporaryDirectories: string[] = [];
const fixturePids: number[] = [];
const fixturePidFiles: string[] = [];

async function temporaryProject(files: Record<string, string> = {}): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), 'postvibe-local-executor-'));
  temporaryDirectories.push(root);
  await Promise.all(Object.entries(files).map(async ([path, contents]) => {
    const destination = join(root, path);
    await mkdir(dirname(destination), { recursive: true });
    await writeFile(destination, contents);
  }));
  return root;
}

function command(argv: string[], overrides: Partial<VerificationCommand> = {}): VerificationCommand {
  return {
    id: 'test:root',
    category: 'test',
    argv,
    cwd: '.',
    timeoutSeconds: 10,
    requiredAccess: ['local-command'],
    source: {
      kind: 'portable-config',
      location: 'postvibe.verification.yaml',
      declaration: argv.join(' '),
      sha256: 'a'.repeat(64),
    },
    ...overrides,
  };
}

function context(root: string, signal: AbortSignal, environment: NodeJS.ProcessEnv = {}) {
  return {
    root,
    signal,
    inheritedEnvironment: environment,
    excludedArtifactPaths: [],
    now: () => '2026-08-20T12:00:00.000Z',
  };
}

async function fileExists(path: string): Promise<boolean> {
  try {
    await access(path, constants.F_OK);
    return true;
  } catch {
    return false;
  }
}

async function waitForFile(path: string): Promise<void> {
  await expect.poll(() => fileExists(path), { timeout: 3_000, interval: 25 }).toBe(true);
}

async function rememberFixturePid(path: string): Promise<number> {
  await waitForFile(path);
  const pid = Number(await readFile(path, 'utf8'));
  fixturePids.push(pid);
  return pid;
}

function forceCleanup(pid: number): void {
  if (process.platform === 'win32') {
    spawnSync('taskkill', ['/pid', String(pid), '/T', '/F'], {
      shell: false,
      stdio: 'ignore',
      timeout: 2_000,
    });
    return;
  }
  try {
    process.kill(pid, 'SIGKILL');
  } catch {
    // The process has already exited.
  }
}

function processIsAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    return (error as NodeJS.ErrnoException).code !== 'ESRCH';
  }
}

afterEach(async () => {
  for (const path of fixturePidFiles.splice(0)) {
    try {
      fixturePids.push(Number(await readFile(path, 'utf8')));
    } catch {
      // The fixture did not reach the point where it recorded its PID.
    }
  }
  fixturePids.splice(0).forEach(forceCleanup);
  await Promise.all(temporaryDirectories.splice(0).map(
    (directory) => rm(directory, { recursive: true, force: true }),
  ));
});

describe('local command executor', () => {
  it('passes shell metacharacters as literal direct arguments without starting a second command', async () => {
    const root = await temporaryProject();
    const marker = join(root, 'shell-created.txt');
    const literalArguments = [';', '&&', `$(touch ${marker})`, 'space value', '*.txt'];
    const script = 'process.stdout.write(JSON.stringify(process.argv.slice(1)))';

    const execution = await new LocalCommandExecutor().execute(
      command([process.execPath, '-e', script, ...literalArguments]),
      context(root, new AbortController().signal, { PATH: process.env.PATH }),
    );

    expect(JSON.parse(execution.result.output)).toEqual(literalArguments);
    expect(execution.result.status).toBe('passed');
    expect(await fileExists(marker)).toBe(false);
  });

  it('runs from the approved contained working directory', async () => {
    const root = await temporaryProject({ 'packages/api/input.txt': 'input' });

    const execution = await new LocalCommandExecutor().execute(
      command([process.execPath, '-e', 'process.stdout.write(process.cwd())'], { cwd: 'packages/api' }),
      context(root, new AbortController().signal),
    );

    expect(execution.result.output).toBe(await realpath(join(root, 'packages', 'api')));
  });

  it('filters inherited credentials while retaining ordinary environment variables', async () => {
    const root = await temporaryProject();
    const controlledPath = process.env.PATH ?? '';
    const script = "process.stdout.write(JSON.stringify({ token: process.env.APP_TOKEN, path: process.env.PATH }))";

    const execution = await new LocalCommandExecutor().execute(
      command([process.execPath, '-e', script]),
      context(root, new AbortController().signal, {
        PATH: controlledPath,
        APP_TOKEN: 'child-must-not-read-this',
      }),
    );

    expect(JSON.parse(execution.result.output)).toEqual({ path: controlledPath });
    expect(execution.removedEnvironmentVariables).toEqual(['APP_TOKEN']);
    expect(JSON.stringify(execution)).not.toContain('child-must-not-read-this');
  });

  it.each([
    [0, 'passed'],
    [7, 'failed'],
  ] as const)('maps exit code %i to %s', async (exitCode, status) => {
    const root = await temporaryProject();

    const execution = await new LocalCommandExecutor().execute(
      command([process.execPath, '-e', `process.exit(${exitCode})`]),
      context(root, new AbortController().signal),
    );

    expect(execution.result).toMatchObject({
      commandId: 'test:root',
      status,
      startedAt: '2026-08-20T12:00:00.000Z',
      exitCode,
      signal: null,
      output: '',
      outputTruncated: false,
      fileChanges: [],
    });
    expect(execution.result.durationMs).toBeGreaterThanOrEqual(0);
  });

  it('returns a sanitized could-not-start result for a nonexistent executable', async () => {
    const root = await temporaryProject();
    const executable = `postvibe-missing-${process.pid}`;

    const execution = await new LocalCommandExecutor().execute(
      command([executable]),
      context(root, new AbortController().signal),
    );

    expect(execution.result).toMatchObject({
      status: 'could-not-start',
      exitCode: null,
      signal: null,
      output: '',
      outputTruncated: false,
      fileChanges: [],
    });
    expect(execution.result.unverifiedReason).toMatch(/could not be started.*ENOENT/i);
    expect(execution.result.unverifiedReason).not.toContain(root);
  });

  it('returns could-not-start when process creation rejects the approved argv synchronously', async () => {
    const root = await temporaryProject();

    const execution = await new LocalCommandExecutor().execute(
      command(['invalid\0executable']),
      context(root, new AbortController().signal),
    );

    expect(execution.result).toMatchObject({
      status: 'could-not-start',
      exitCode: null,
      signal: null,
      output: '',
      outputTruncated: false,
      fileChanges: [],
    });
    expect(execution.result.unverifiedReason).toBe('Command could not be started (ERR_INVALID_ARG_VALUE).');
  });

  it('records additions, modifications, and removals without cleaning them up', async () => {
    const root = await temporaryProject({
      'modified.txt': 'before',
      'removed.txt': 'before',
    });
    const script = [
      "const fs = require('node:fs');",
      "fs.writeFileSync('added.txt', 'added');",
      "fs.writeFileSync('modified.txt', 'after');",
      "fs.unlinkSync('removed.txt');",
    ].join('');

    const execution = await new LocalCommandExecutor().execute(
      command([process.execPath, '-e', script]),
      context(root, new AbortController().signal),
    );

    expect(execution.result.fileChanges).toEqual([
      { path: 'added.txt', kind: 'added' },
      { path: 'modified.txt', kind: 'modified' },
      { path: 'removed.txt', kind: 'removed' },
    ]);
    await expect(readFile(join(root, 'added.txt'), 'utf8')).resolves.toBe('added');
    await expect(readFile(join(root, 'modified.txt'), 'utf8')).resolves.toBe('after');
    expect(await fileExists(join(root, 'removed.txt'))).toBe(false);
  });

  it('drains both stdout and stderr', async () => {
    const root = await temporaryProject();
    const script = [
      "process.stdout.write('stdout-evidence\\n');",
      "process.stderr.write('stderr-evidence\\n');",
    ].join('');

    const execution = await new LocalCommandExecutor().execute(
      command([process.execPath, '-e', script]),
      context(root, new AbortController().signal),
    );

    expect(execution.result.output).toContain('stdout-evidence');
    expect(execution.result.output).toContain('stderr-evidence');
  });

  it('redacts and bounds output split across chunks', async () => {
    const root = await temporaryProject();
    const script = [
      "process.stdout.write('first-evidence\\nAPP_TO');",
      'setImmediate(() => {',
      "process.stdout.write('KEN=split-secret\\n');",
      `process.stdout.write('x'.repeat(${COMMAND_OUTPUT_LIMIT_BYTES + 1024}));`,
      "process.stdout.write('\\nlast-evidence');",
      '});',
    ].join('');

    const execution = await new LocalCommandExecutor().execute(
      command([process.execPath, '-e', script]),
      context(root, new AbortController().signal),
    );

    expect(execution.result.status).toBe('passed');
    expect(execution.result.outputTruncated).toBe(true);
    expect(Buffer.byteLength(execution.result.output, 'utf8')).toBeLessThanOrEqual(COMMAND_OUTPUT_LIMIT_BYTES);
    expect(execution.result.output).toContain('first-evidence');
    expect(execution.result.output).toContain('last-evidence');
    expect(execution.result.output).not.toContain('split-secret');
  });

  it('rejects a working-directory symlink escape immediately before spawn', async () => {
    const root = await temporaryProject();
    const outside = await temporaryProject();
    const { symlink } = await import('node:fs/promises');
    await symlink(outside, join(root, 'escape'));
    const marker = join(outside, 'started.txt');

    await expect(new LocalCommandExecutor().execute(
      command([process.execPath, '-e', `require('node:fs').writeFileSync(${JSON.stringify(marker)}, 'started')`], { cwd: 'escape' }),
      context(root, new AbortController().signal),
    )).rejects.toThrow(/inside the project/i);
    expect(await fileExists(marker)).toBe(false);
  });

  it('does not spawn when interrupted during contained cwd re-resolution', async () => {
    const root = await temporaryProject();
    const marker = join(root, 'late-abort-started.txt');
    const controller = new AbortController();
    const approvedCommand = command([
      process.execPath,
      '-e',
      `require('node:fs').writeFileSync(${JSON.stringify(marker)}, 'started')`,
    ]);
    Object.defineProperty(approvedCommand, 'cwd', {
      get: () => {
        controller.abort();
        return '.';
      },
    });

    const execution = await new LocalCommandExecutor().execute(
      approvedCommand,
      context(root, controller.signal),
    );

    expect(execution.result.status).toBe('interrupted');
    expect(execution.result.unverifiedReason).toMatch(/before the command started/i);
    expect(await fileExists(marker)).toBe(false);
  });

  it('times out and terminates the spawned child tree', async () => {
    const root = await temporaryProject();
    const heartbeat = join(root, 'timeout-heartbeat.txt');
    const childPidFile = join(root, 'timeout-child.pid');
    const parentPidFile = join(root, 'timeout-parent.pid');
    fixturePidFiles.push(childPidFile, parentPidFile);
    const childScript = [
      "const fs = require('node:fs');",
      'fs.writeFileSync(process.argv[1], String(process.pid));',
      "setInterval(() => fs.appendFileSync(process.argv[2], 'x'), 25);",
    ].join('');
    const parentScript = [
      "const fs = require('node:fs');",
      "const { spawn } = require('node:child_process');",
      'fs.writeFileSync(process.argv[4], String(process.pid));',
      'spawn(process.execPath, [\'-e\', process.argv[1], process.argv[2], process.argv[3]],',
      "{ stdio: 'ignore' });",
      'setInterval(() => {}, 1000);',
    ].join('');

    const execution = await new LocalCommandExecutor().execute(
      command([process.execPath, '-e', parentScript, childScript, childPidFile, heartbeat, parentPidFile], { timeoutSeconds: 1 }),
      context(root, new AbortController().signal),
    );
    const childPid = await rememberFixturePid(childPidFile);

    expect(execution.result.status).toBe('timed-out');
    expect(execution.result.unverifiedReason).toMatch(/timed out after 1 second/i);
    expect(execution.result.unverifiedReason).toMatch(
      process.platform === 'win32' ? /taskkill/i : /process group/i,
    );
    await expect.poll(() => processIsAlive(childPid), { timeout: 2_000, interval: 25 }).toBe(false);
    const heartbeatAtTermination = (await readFile(heartbeat)).length;
    await new Promise((resolve) => setTimeout(resolve, 150));
    expect((await readFile(heartbeat)).length).toBe(heartbeatAtTermination);
  });

  it('interrupts exactly once and terminates the spawned child tree', async () => {
    const root = await temporaryProject();
    const heartbeat = join(root, 'abort-heartbeat.txt');
    const childPidFile = join(root, 'abort-child.pid');
    const parentPidFile = join(root, 'abort-parent.pid');
    fixturePidFiles.push(childPidFile, parentPidFile);
    const childScript = [
      "const fs = require('node:fs');",
      'fs.writeFileSync(process.argv[1], String(process.pid));',
      "setInterval(() => fs.appendFileSync(process.argv[2], 'x'), 25);",
    ].join('');
    const parentScript = [
      "const fs = require('node:fs');",
      "const { spawn } = require('node:child_process');",
      'fs.writeFileSync(process.argv[4], String(process.pid));',
      'spawn(process.execPath, [\'-e\', process.argv[1], process.argv[2], process.argv[3]],',
      "{ stdio: 'ignore' });",
      'setInterval(() => {}, 1000);',
    ].join('');
    const controller = new AbortController();
    const executionPromise = new LocalCommandExecutor().execute(
      command([process.execPath, '-e', parentScript, childScript, childPidFile, heartbeat, parentPidFile]),
      context(root, controller.signal),
    );
    const childPid = await rememberFixturePid(childPidFile);
    await waitForFile(heartbeat);
    controller.abort();
    controller.abort();
    const execution = await executionPromise;

    expect(execution.result.status).toBe('interrupted');
    expect(execution.result.unverifiedReason).toMatch(/interrupted/i);
    expect(execution.result.unverifiedReason).toMatch(
      process.platform === 'win32' ? /taskkill/i : /process group/i,
    );
    await expect.poll(() => processIsAlive(childPid), { timeout: 2_000, interval: 25 }).toBe(false);
    const heartbeatAtTermination = (await readFile(heartbeat)).length;
    await new Promise((resolve) => setTimeout(resolve, 150));
    expect((await readFile(heartbeat)).length).toBe(heartbeatAtTermination);
  });
});
