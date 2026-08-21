import type { ArtifactType, Detection } from '../model/capability.js';

const backendDependencies = new Set(['express', 'fastify', 'koa', 'hapi', '@hapi/hapi', '@nestjs/core']);
const desktopDependencies = new Set(['electron', '@tauri-apps/api']);
const workerDependencies = new Set(['bullmq', 'agenda', 'bee-queue']);
const persistentDataDependencies = new Set([
  '@prisma/client', 'prisma', 'pg', 'mysql2', 'mongoose', 'mongodb',
  'better-sqlite3', 'sqlite3', 'drizzle-orm', 'sequelize', 'typeorm',
]);

export interface OperationalSignals {
  artifacts: Detection<ArtifactType>[];
  capabilities: Detection<string>[];
}

function detection<T extends string>(
  value: T,
  location: string,
  summary: string,
  confidence: 'confirmed' | 'likely' = 'confirmed',
): Detection<T> {
  return { value, confidence, evidence: [{ kind: 'file', location, summary }] };
}

function hasDependency(dependencies: ReadonlySet<string>, candidates: ReadonlySet<string>): boolean {
  return [...candidates].some((candidate) => dependencies.has(candidate));
}

function isExcludedPath(file: string): boolean {
  return /(?:^|\/)(?:test|tests|spec|specs|story|stories|example|examples)(?:\/|$)/.test(file)
    || /\.(?:test|spec|story|example)\.[^/]+$/.test(file);
}

function firstMatchingFile(files: readonly string[], pattern: RegExp): string | undefined {
  return files.find((file) => !isExcludedPath(file) && pattern.test(file));
}

export function discoverOperationalSignals(
  files: readonly string[],
  dependencies: ReadonlySet<string>,
): OperationalSignals {
  const artifacts: Detection<ArtifactType>[] = [];
  const capabilities: Detection<string>[] = [];
  const backendFile = firstMatchingFile(files, /^(?:src\/server\.[^/]+|server\.[^/]+|api\/)/);
  const workerFile = firstMatchingFile(files, /^(?:src\/worker\.[^/]+|worker\.[^/]+|cron\/)/);
  const prismaSchema = firstMatchingFile(files, /^prisma\/schema\.prisma$/);
  const sqlSchema = firstMatchingFile(files, /^(?:data\/)?schema\.sql$/);
  const migration = firstMatchingFile(files, /^migrations\//);
  const hasBackendDependency = hasDependency(dependencies, backendDependencies);

  if (hasBackendDependency) {
    artifacts.push(detection('backend', 'package.json', 'Backend framework dependency detected'));
    capabilities.push(detection('network-service', 'package.json', 'Backend framework dependency indicates a network service'));
  } else if (backendFile) {
    artifacts.push(detection('backend', backendFile, 'Backend server entry point detected', 'likely'));
    capabilities.push(detection('network-service', backendFile, 'Backend server entry point indicates a network service', 'likely'));
  }

  if (hasDependency(dependencies, desktopDependencies)) {
    artifacts.push(detection('desktop', 'package.json', 'Desktop application dependency detected'));
  }

  if (hasDependency(dependencies, workerDependencies)) {
    artifacts.push(detection('worker', 'package.json', 'Background worker dependency detected'));
  } else if (workerFile) {
    artifacts.push(detection('worker', workerFile, 'Background worker entry point detected', 'likely'));
  }

  if (hasDependency(dependencies, persistentDataDependencies)) {
    capabilities.push(detection('persistent-data', 'package.json', 'Persistent data dependency detected'));
  } else if (prismaSchema) {
    capabilities.push(detection('persistent-data', prismaSchema, 'Prisma schema detected'));
  } else if (sqlSchema) {
    capabilities.push(detection('persistent-data', sqlSchema, 'SQL schema detected', 'likely'));
  } else if (migration) {
    capabilities.push(detection('persistent-data', migration, 'Database migration detected'));
  }

  return { artifacts, capabilities };
}
