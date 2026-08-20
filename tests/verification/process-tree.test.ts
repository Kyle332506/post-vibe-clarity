import { access, mkdtemp, readFile, rm } from 'node:fs/promises';
import { constants } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawn, spawnSync } from 'node:child_process';
import { afterEach, describe, expect, it } from 'vitest';
import { terminateProcessTree } from '../../src/verification/process-tree.js';

const temporaryDirectories: string[] = [];
const processGroups: number[] = [];
const childProcesses: number[] = [];

async function waitForFile(path: string): Promise<void> {
  await expect.poll(async () => {
    try {
      await access(path, constants.F_OK);
      return true;
    } catch {
      return false;
    }
  }, { timeout: 3_000, interval: 25 }).toBe(true);
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
    process.kill(-pid, 'SIGKILL');
  } catch {
    // The group has already exited.
  }
}

function forceCleanupChild(pid: number): void {
  if (process.platform === 'win32') {
    forceCleanup(pid);
    return;
  }
  try {
    process.kill(pid, 'SIGKILL');
  } catch {
    // The child has already exited.
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
  processGroups.splice(0).forEach(forceCleanup);
  childProcesses.splice(0).forEach(forceCleanupChild);
  await Promise.all(temporaryDirectories.splice(0).map(
    (directory) => rm(directory, { recursive: true, force: true }),
  ));
});

describe('process-tree termination', () => {
  it('terminates the command process and its child through the platform tree boundary', async () => {
    const root = await mkdtemp(join(tmpdir(), 'postvibe-process-tree-'));
    temporaryDirectories.push(root);
    const heartbeat = join(root, 'heartbeat.txt');
    const childPidFile = join(root, 'child.pid');
    const childScript = [
      "const fs = require('node:fs');",
      'fs.writeFileSync(process.argv[1], String(process.pid));',
      "setInterval(() => fs.appendFileSync(process.argv[2], 'x'), 25);",
    ].join('');
    const parentScript = [
      "const { spawn } = require('node:child_process');",
      "process.on('SIGTERM', () => {});",
      'spawn(process.execPath, [\'-e\', process.argv[1], process.argv[2], process.argv[3]],',
      "{ stdio: 'ignore' });",
      'setInterval(() => {}, 1000);',
    ].join('');
    const parent = spawn(process.execPath, ['-e', parentScript, childScript, childPidFile, heartbeat], {
      detached: process.platform !== 'win32',
      shell: false,
      stdio: 'ignore',
    });
    if (parent.pid === undefined) throw new Error('Fixture process did not start.');
    processGroups.push(parent.pid);
    await waitForFile(childPidFile);
    const childPid = Number(await readFile(childPidFile, 'utf8'));
    childProcesses.push(childPid);
    await waitForFile(heartbeat);

    const result = await terminateProcessTree(parent.pid);

    expect(result.terminationBoundary).toBe(
      process.platform === 'win32' ? 'windows-taskkill-tree' : 'unix-process-group',
    );
    expect(result.verified).toBe(true);
    expect(result.limitation).toBeUndefined();
    await expect.poll(() => processIsAlive(parent.pid!), { timeout: 2_000, interval: 25 }).toBe(false);
    await expect.poll(() => processIsAlive(childPid), { timeout: 2_000, interval: 25 }).toBe(false);
    const heartbeatAtTermination = (await readFile(heartbeat)).length;
    await new Promise((resolve) => setTimeout(resolve, 150));
    expect((await readFile(heartbeat)).length).toBe(heartbeatAtTermination);
  });
});
