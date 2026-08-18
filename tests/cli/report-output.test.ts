import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { writeReportExclusively } from '../../src/cli/report-output.js';

const temporaryRoots: string[] = [];

afterEach(async () => {
  await Promise.all(temporaryRoots.splice(0).map((directory) => rm(directory, { recursive: true, force: true })));
});

describe('writeReportExclusively', () => {
  it('creates a new report file', async () => {
    const root = await mkdtemp(join(tmpdir(), 'postvibe-report-output-'));
    temporaryRoots.push(root);
    const path = join(root, 'pvc-20260817120000000.json');

    await writeReportExclusively(path, 'new report\n');

    expect(await readFile(path, 'utf8')).toBe('new report\n');
  });

  it('fails clearly without overwriting an existing run ID', async () => {
    const root = await mkdtemp(join(tmpdir(), 'postvibe-report-collision-'));
    temporaryRoots.push(root);
    const path = join(root, 'pvc-20260817120000000.json');
    await writeFile(path, 'existing report\n');

    await expect(writeReportExclusively(path, 'replacement report\n')).rejects.toThrow(
      `Report file already exists; no file was overwritten: ${path}`,
    );
    expect(await readFile(path, 'utf8')).toBe('existing report\n');
  });
});
