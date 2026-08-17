import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { ArtifactType, CapabilityManifest, Detection } from '../model/capability.js';
import { listProjectFiles } from './file-index.js';

interface PackageJson {
  bin?: unknown;
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
  peerDependencies?: Record<string, string>;
  exports?: unknown;
}

function detection<T extends string>(
  value: T,
  location: string,
  summary: string,
  confidence: 'confirmed' | 'likely' = 'confirmed',
): Detection<T> {
  return { value, confidence, evidence: [{ kind: 'file', location, summary }] };
}

export async function discoverProject(root: string, now: () => string): Promise<CapabilityManifest> {
  const files = await listProjectFiles(root);
  const artifacts: Detection<ArtifactType>[] = [];
  const frameworks: Detection<string>[] = [];
  const capabilities: Detection<string>[] = [];
  const packagePath = files.includes('package.json') ? join(root, 'package.json') : undefined;
  let packageJson: PackageJson = {};

  if (packagePath) packageJson = JSON.parse(await readFile(packagePath, 'utf8')) as PackageJson;
  const dependencies = new Set([
    ...Object.keys(packageJson.dependencies ?? {}),
    ...Object.keys(packageJson.devDependencies ?? {}),
    ...Object.keys(packageJson.peerDependencies ?? {}),
  ]);
  const hasNext = dependencies.has('next');
  const hasReact = dependencies.has('react');
  const hasReactDom = dependencies.has('react-dom');
  const hasExpo = dependencies.has('expo');
  const hasReactNative = dependencies.has('react-native');
  const hasMobileFramework = hasExpo || hasReactNative;

  if (hasNext) {
    artifacts.push(detection('web', 'package.json', 'Next.js dependency identifies a web application'));
  } else if (files.includes('index.html')) {
    artifacts.push(detection('web', 'index.html', 'Static HTML browser entry point detected'));
  } else if (hasReactDom && !hasMobileFramework) {
    artifacts.push(detection('web', 'package.json', 'React DOM dependency identifies a browser application'));
  }
  if (hasMobileFramework) {
    artifacts.push(detection('mobile', 'package.json', 'Expo or React Native dependency identifies a mobile application'));
  }
  if (packageJson.exports !== undefined) {
    artifacts.push(detection('library', 'package.json', 'Package exports a public library entry point'));
  }
  if (packageJson.bin !== undefined) artifacts.push(detection('cli', 'package.json', 'Package exposes a command-line binary'));

  if (hasExpo) frameworks.push(detection('expo', 'package.json', 'Expo dependency detected'));
  if (hasNext) frameworks.push(detection('next', 'package.json', 'Next.js dependency detected'));
  if (hasReact) frameworks.push(detection('react', 'package.json', 'React dependency detected'));
  if (hasReactNative) frameworks.push(detection('react-native', 'package.json', 'React Native dependency detected'));

  const sourceFiles = files.filter((file) => /\.(?:js|jsx|ts|tsx|py|rb|go|rs|java|kt|swift)$/.test(file));
  for (const file of sourceFiles) {
    const content = await readFile(join(root, file), 'utf8');
    if (/\bemail\b/i.test(content) && /\b(?:register|signup|user|account)\b/i.test(content)) {
      capabilities.push(detection('collects-personal-data', file, 'Account-related source references an email field', 'likely'));
      break;
    }
  }

  return {
    schemaVersion: '0.1',
    projectRoot: root,
    generatedAt: now(),
    artifacts,
    frameworks,
    services: [],
    capabilities,
  };
}
