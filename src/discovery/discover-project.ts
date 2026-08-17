import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { ArtifactType, CapabilityManifest, Detection } from '../model/capability.js';
import { listProjectFiles } from './file-index.js';

interface PackageJson {
  bin?: unknown;
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
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
  const dependencies = { ...packageJson.dependencies, ...packageJson.devDependencies };

  if ('next' in dependencies || 'react' in dependencies || files.includes('index.html')) {
    artifacts.push(detection('web', 'package.json', 'Browser application dependency detected'));
  }
  if ('next' in dependencies) frameworks.push(detection('next', 'package.json', 'Next.js dependency detected'));
  if (packageJson.bin !== undefined) artifacts.push(detection('cli', 'package.json', 'Package exposes a command-line binary'));

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
