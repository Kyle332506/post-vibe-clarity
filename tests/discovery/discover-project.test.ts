import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { discoverProject } from '../../src/discovery/discover-project.js';

const fixture = (name: string) => fileURLToPath(new URL(`../../fixtures/${name}`, import.meta.url));
const now = () => '2026-08-17T12:00:00.000Z';

describe('discoverProject', () => {
  it('detects a web project and likely personal-data collection', async () => {
    const manifest = await discoverProject(fixture('web-missing-basics'), now);
    expect(manifest.artifacts).toContainEqual({
      value: 'web',
      confidence: 'confirmed',
      evidence: [{
        kind: 'file',
        location: 'package.json',
        summary: 'Next.js dependency identifies a web application',
      }],
    });
    expect(manifest.frameworks).toContainEqual({
      value: 'next',
      confidence: 'confirmed',
      evidence: [{ kind: 'file', location: 'package.json', summary: 'Next.js dependency detected' }],
    });
    expect(manifest.capabilities.map((item) => item.value)).toContain('collects-personal-data');
    expect(manifest.generatedAt).toBe('2026-08-17T12:00:00.000Z');
  });

  it('uses the static HTML entry point as the evidence for a browser artifact', async () => {
    const manifest = await discoverProject(fixture('static-html'), now);

    expect(manifest.artifacts).toEqual([{
      value: 'web',
      confidence: 'confirmed',
      evidence: [{ kind: 'file', location: 'index.html', summary: 'Static HTML browser entry point detected' }],
    }]);
    expect(manifest.frameworks).toEqual([]);
  });

  it('classifies a React package export as a library without inferring a web application', async () => {
    const manifest = await discoverProject(fixture('react-library'), now);

    expect(manifest.artifacts).toEqual([{
      value: 'library',
      confidence: 'confirmed',
      evidence: [{ kind: 'file', location: 'package.json', summary: 'Package exports a public library entry point' }],
    }]);
    expect(manifest.frameworks).toEqual([{
      value: 'react',
      confidence: 'confirmed',
      evidence: [{ kind: 'file', location: 'package.json', summary: 'React dependency detected' }],
    }]);
  });

  it('classifies Expo and React Native signals as mobile without inferring web', async () => {
    const manifest = await discoverProject(fixture('expo-mobile'), now);

    expect(manifest.artifacts).toEqual([{
      value: 'mobile',
      confidence: 'confirmed',
      evidence: [{ kind: 'file', location: 'package.json', summary: 'Expo or React Native dependency identifies a mobile application' }],
    }]);
    expect(manifest.frameworks).toEqual([
      {
        value: 'expo',
        confidence: 'confirmed',
        evidence: [{ kind: 'file', location: 'package.json', summary: 'Expo dependency detected' }],
      },
      {
        value: 'react',
        confidence: 'confirmed',
        evidence: [{ kind: 'file', location: 'package.json', summary: 'React dependency detected' }],
      },
      {
        value: 'react-native',
        confidence: 'confirmed',
        evidence: [{ kind: 'file', location: 'package.json', summary: 'React Native dependency detected' }],
      },
    ]);
    expect(manifest.artifacts.some(({ value }) => value === 'web')).toBe(false);
  });

  it('detects a CLI without inventing personal-data collection', async () => {
    const manifest = await discoverProject(fixture('cli-clean'), now);
    expect(manifest.artifacts.map((item) => item.value)).toEqual(['cli']);
    expect(manifest.capabilities.map((item) => item.value)).not.toContain('collects-personal-data');
  });
});
