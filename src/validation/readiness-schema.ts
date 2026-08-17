import { createRequire } from 'node:module';
import { readFile } from 'node:fs/promises';
import { Ajv2020 as Ajv2020Constructor } from 'ajv/dist/2020.js';
import type { FormatsPlugin } from 'ajv-formats';

export type ValidationResult =
  | { ok: true }
  | { ok: false; errors: string[] };

const schemaUrl = new URL('../../schemas/readiness.schema.json', import.meta.url);
const require = createRequire(import.meta.url);
const Ajv2020 = require('ajv/dist/2020.js') as typeof Ajv2020Constructor;
const addFormats = require('ajv-formats') as FormatsPlugin;

export async function validateReadinessManifest(input: unknown): Promise<ValidationResult> {
  const schema = JSON.parse(await readFile(schemaUrl, 'utf8')) as object;
  const ajv = new Ajv2020({ allErrors: true, strict: true });
  addFormats(ajv);
  const validate = ajv.compile(schema);
  if (validate(input)) return { ok: true };
  return {
    ok: false,
    errors: (validate.errors ?? []).map((error) => `${error.instancePath || '/'} ${error.message ?? 'is invalid'}`),
  };
}
