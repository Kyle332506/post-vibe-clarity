import { access, mkdir, mkdtemp, readFile, readdir, rm, unlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import {
  ArtifactFileCollisionError,
  ArtifactFileOwnershipError,
  acquireOwnedFileExclusively,
  publishOwnedFileExclusively,
  releaseOwnedFile,
  writeArtifactExclusively,
} from '../../src/cli/artifact-output.js';

const temporaryRoots: string[] = [];

afterEach(async () => {
  await Promise.all(temporaryRoots.splice(0).map((directory) => rm(directory, { recursive: true, force: true })));
});

async function temporaryRoot(label: string): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), label));
  temporaryRoots.push(root);
  return root;
}

async function expectMissing(path: string): Promise<void> {
  await expect(access(path)).rejects.toMatchObject({ code: 'ENOENT' });
}

describe('writeArtifactExclusively', () => {
  it('publishes a completed artifact and removes its deterministic temporary file', async () => {
    const root = await temporaryRoot('postvibe-artifact-output-');
    const path = join(root, 'approved-plan.json');

    await writeArtifactExclusively(path, '{"complete":true}\n');

    expect(await readFile(path, 'utf8')).toBe('{"complete":true}\n');
    await expectMissing(`${path}.tmp`);
  });

  it('never overwrites an existing completed artifact', async () => {
    const root = await temporaryRoot('postvibe-artifact-collision-');
    const path = join(root, 'pve-20260818120100000.execution.json');
    await writeFile(path, 'existing evidence\n');

    await expect(writeArtifactExclusively(path, 'replacement evidence\n')).rejects.toThrow(
      new ArtifactFileCollisionError(`Artifact file already exists; no file was overwritten: ${path}`),
    );
    expect(await readFile(path, 'utf8')).toBe('existing evidence\n');
  });

  it('does not publish a partial completed artifact when the temporary path collides', async () => {
    const root = await temporaryRoot('postvibe-artifact-temp-collision-');
    const path = join(root, 'pve-20260818120100000.execution.json');
    await writeFile(`${path}.tmp`, 'other writer\n');

    await expect(writeArtifactExclusively(path, '{"partial":')).rejects.toThrow(ArtifactFileCollisionError);

    await expectMissing(path);
    expect(await readFile(`${path}.tmp`, 'utf8')).toBe('other writer\n');
  });

  it('does not publish a completed artifact when writing its temporary file fails', async () => {
    const root = await temporaryRoot('postvibe-artifact-write-failure-');
    const path = join(root, 'pve-20260818120100000.report.json');
    await mkdir(`${path}.tmp`);

    await expect(writeArtifactExclusively(path, '{"partial":')).rejects.toThrow();

    await expectMissing(path);
  });

  it('fails closed and preserves a foreign replacement of its acquired temporary file', async () => {
    const root = await temporaryRoot('postvibe-artifact-temp-replacement-');
    const path = join(root, 'pve-20260818120100000.execution.json');
    const temporaryPath = `${path}.tmp`;
    const owned = await acquireOwnedFileExclusively(temporaryPath);
    await owned.handle.writeFile('{"owned":true}\n', 'utf8');
    await owned.handle.sync();
    await unlink(temporaryPath);
    await writeFile(temporaryPath, 'foreign replacement\n');

    await expect(publishOwnedFileExclusively(owned, path)).rejects.toThrow(ArtifactFileOwnershipError);

    await expectMissing(path);
    expect(await readFile(temporaryPath, 'utf8')).toBe('foreign replacement\n');
  });

  it('links only the quarantined owned source when the deterministic temporary name is replaced', async () => {
    const root = await temporaryRoot('postvibe-artifact-source-race-');
    const path = join(root, 'pve-20260818120100000.execution.json');
    const temporaryPath = `${path}.tmp`;
    const owned = await acquireOwnedFileExclusively(temporaryPath);
    await owned.handle.writeFile('owned completed evidence\n', 'utf8');
    await owned.handle.sync();

    await publishOwnedFileExclusively(owned, path, {
      async afterSourceQuarantine() {
        await writeFile(temporaryPath, 'foreign temporary replacement\n');
      },
    });

    expect(await readFile(path, 'utf8')).toBe('owned completed evidence\n');
    expect(await readFile(temporaryPath, 'utf8')).toBe('foreign temporary replacement\n');
  });

  it('removes no foreign final when post-link verification observes replacement', async () => {
    const root = await temporaryRoot('postvibe-artifact-final-race-');
    const path = join(root, 'pve-20260818120100000.execution.json');
    const temporaryPath = `${path}.tmp`;
    const owned = await acquireOwnedFileExclusively(temporaryPath);
    await owned.handle.writeFile('owned completed evidence\n', 'utf8');
    await owned.handle.sync();

    await expect(publishOwnedFileExclusively(owned, path, {
      async afterFinalLink() {
        await unlink(path);
        await writeFile(path, 'foreign completed replacement\n');
      },
    })).rejects.toThrow(ArtifactFileOwnershipError);

    expect(await readFile(path, 'utf8')).toBe('foreign completed replacement\n');
    expect((await readdir(root)).some((name) => name.includes('.quarantine-'))).toBe(false);
  });

  it('rolls back the completed name when owned temporary cleanup fails before commit', async () => {
    const root = await temporaryRoot('postvibe-artifact-cleanup-failure-');
    const path = join(root, 'pve-20260818120100000.execution.json');
    const temporaryPath = `${path}.tmp`;
    const owned = await acquireOwnedFileExclusively(temporaryPath);
    await owned.handle.writeFile('owned completed evidence\n', 'utf8');
    await owned.handle.sync();

    await expect(publishOwnedFileExclusively(owned, path, {
      async beforeSourceCleanup() {
        throw new Error('simulated owned temporary cleanup failure');
      },
    })).rejects.toThrow(/cleanup failure/i);

    await expectMissing(path);
    expect((await readdir(root)).some((name) => name.includes('.quarantine-'))).toBe(false);
  });

  it('atomically quarantines lock release and restores a foreign last-moment replacement', async () => {
    const root = await temporaryRoot('postvibe-lock-release-race-');
    const lockPath = join(root, 'pve-20260818120100000.lock');
    const owned = await acquireOwnedFileExclusively(lockPath);
    await owned.handle.writeFile('owned lock\n', 'utf8');
    await owned.handle.sync();

    await expect(releaseOwnedFile(owned, {
      async beforeQuarantine() {
        await unlink(lockPath);
        await writeFile(lockPath, 'foreign lock replacement\n');
      },
    })).rejects.toThrow(ArtifactFileOwnershipError);

    expect(await readFile(lockPath, 'utf8')).toBe('foreign lock replacement\n');
  });

  it('deletes only the quarantined owned lock when the public name changes before unlink', async () => {
    const root = await temporaryRoot('postvibe-lock-unlink-race-');
    const lockPath = join(root, 'pve-20260818120100000.lock');
    const owned = await acquireOwnedFileExclusively(lockPath);
    await owned.handle.writeFile('owned lock\n', 'utf8');
    await owned.handle.sync();

    await releaseOwnedFile(owned, {
      async afterOwnedQuarantine() {
        await writeFile(lockPath, 'foreign lock after ownership transfer\n');
      },
    });

    expect(await readFile(lockPath, 'utf8')).toBe('foreign lock after ownership transfer\n');
    expect((await readdir(root)).some((name) => name.includes('.quarantine-'))).toBe(false);
  });
});
