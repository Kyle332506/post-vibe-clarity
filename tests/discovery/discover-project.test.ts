import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { discoverProject } from '../../src/discovery/discover-project.js';

const fixture = (name: string) => fileURLToPath(new URL(`../../fixtures/${name}`, import.meta.url));
const now = () => '2026-08-17T12:00:00.000Z';

describe('discoverProject', () => {
  it('detects a web project and likely personal-data collection', async () => {
    const manifest = await discoverProject(fixture('web-missing-basics'), now);
    expect(manifest.artifacts.map((item) => item.value)).toContain('web');
    expect(manifest.frameworks.map((item) => item.value)).toContain('next');
    expect(manifest.capabilities.map((item) => item.value)).toContain('collects-personal-data');
    expect(manifest.generatedAt).toBe('2026-08-17T12:00:00.000Z');
  });

  it('detects a CLI without inventing personal-data collection', async () => {
    const manifest = await discoverProject(fixture('cli-clean'), now);
    expect(manifest.artifacts.map((item) => item.value)).toEqual(['cli']);
    expect(manifest.capabilities.map((item) => item.value)).not.toContain('collects-personal-data');
  });
});
