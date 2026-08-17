import { createRequire } from 'node:module';
import { readFile, realpath } from 'node:fs/promises';
import { dirname, extname, isAbsolute, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Ajv2020 as Ajv2020Constructor } from 'ajv/dist/2020.js';
import type { FormatsPlugin } from 'ajv-formats';

export type ValidationResult =
  | { ok: true }
  | { ok: false; errors: string[] };

const require = createRequire(import.meta.url);
const Ajv2020 = require('ajv/dist/2020.js') as typeof Ajv2020Constructor;
const addFormats = require('ajv-formats') as FormatsPlugin;

interface SchemaLocation {
  packageRoot: string;
  schemaPath: string;
}

function schemaLocationForModule(moduleUrl: URL): SchemaLocation {
  const modulePath = fileURLToPath(moduleUrl);
  const extension = extname(modulePath);
  const moduleDirectory = dirname(modulePath);
  let packageRoot: string;
  let expectedModulePath: string;

  if (extension === '.ts') {
    packageRoot = resolve(moduleDirectory, '..', '..');
    expectedModulePath = join(packageRoot, 'src', 'validation', 'readiness-schema.ts');
  } else if (extension === '.js') {
    packageRoot = resolve(moduleDirectory, '..', '..', '..');
    expectedModulePath = join(packageRoot, 'dist', 'src', 'validation', 'readiness-schema.js');
  } else {
    throw new Error('Cannot resolve the readiness schema from an unrecognized module layout.');
  }

  if (resolve(modulePath) !== expectedModulePath) {
    throw new Error('Cannot resolve the readiness schema from an unrecognized module layout.');
  }

  const schemaPath = join(packageRoot, 'schemas', 'readiness.schema.json');
  const packageRelativePath = relative(packageRoot, schemaPath);
  if (packageRelativePath.startsWith('..') || isAbsolute(packageRelativePath)) {
    throw new Error('Readiness schema path must remain inside the package root.');
  }
  return { packageRoot, schemaPath };
}

export function resolveReadinessSchemaPath(moduleUrl: URL): string {
  return schemaLocationForModule(moduleUrl).schemaPath;
}

const schemaLocation = schemaLocationForModule(new URL(import.meta.url));

export async function validateReadinessManifest(input: unknown): Promise<ValidationResult> {
  const schema = JSON.parse(await readSchema()) as object;
  const ajv = new Ajv2020({ allErrors: true, strict: true });
  addFormats(ajv);
  const validate = ajv.compile(schema);
  if (validate(input)) return { ok: true };
  return {
    ok: false,
    errors: (validate.errors ?? []).map((error) => `${error.instancePath || '/'} ${error.message ?? 'is invalid'}`),
  };
}

async function readSchema(): Promise<string> {
  const [realPackageRoot, realSchemaPath] = await Promise.all([
    realpath(schemaLocation.packageRoot),
    realpath(schemaLocation.schemaPath),
  ]);
  const packageRelativePath = relative(realPackageRoot, realSchemaPath);
  if (packageRelativePath.startsWith('..') || isAbsolute(packageRelativePath)) {
    throw new Error('Readiness schema path must remain inside the package root.');
  }
  return readFile(realSchemaPath, 'utf8');
}
