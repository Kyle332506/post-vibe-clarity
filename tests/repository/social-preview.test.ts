import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';
import { repositoryPath } from './repository-docs.js';

describe('repository social preview', () => {
  it('is an upload-ready 1280 by 640 PNG under 1 MB', async () => {
    const image = await readFile(repositoryPath('assets/social-preview.png'));
    expect(image.subarray(0, 8).toString('hex')).toBe('89504e470d0a1a0a');
    expect(image.readUInt32BE(16)).toBe(1280);
    expect(image.readUInt32BE(20)).toBe(640);
    expect(image.byteLength).toBeLessThan(1_000_000);
  });
});
