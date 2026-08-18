import { readFile } from 'node:fs/promises';
import { join, relative, sep } from 'node:path';
import { parse } from 'yaml';
import type { CommandCategory } from '../model/verification.js';
import { resolveInsideProject, resolveProjectRoot } from './project-path.js';

export interface PortableVerificationConfig {
  schemaVersion: '0.1';
  commands: Array<{
    id: string;
    category: CommandCategory;
    argv: string[];
    cwd: string;
    timeoutSeconds?: number;
  }>;
}

const CONFIG_LOCATION = 'postvibe.verification.yaml';
const COMMAND_KEYS = new Set(['id', 'category', 'argv', 'cwd', 'timeoutSeconds']);
const CATEGORIES = new Set<CommandCategory>(['build', 'test', 'type-check', 'lint']);
const ID_PATTERN = /^[a-z0-9][a-z0-9:._-]*$/;

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value) as unknown;
  return prototype === Object.prototype || prototype === null;
}

function rejectUnknownKeys(value: Record<string, unknown>, allowed: Set<string>, context: string): void {
  const unknown = Object.keys(value).find((key) => !allowed.has(key));
  if (unknown !== undefined) throw new Error(`${context} has unknown key "${unknown}".`);
}

function configError(message: string): Error {
  return new Error(`${CONFIG_LOCATION}: ${message}`);
}

export async function loadVerificationConfig(root: string): Promise<PortableVerificationConfig | undefined> {
  const resolvedRoot = await resolveProjectRoot(root);
  let source: string;
  try {
    source = await readFile(join(resolvedRoot, CONFIG_LOCATION), 'utf8');
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return undefined;
    throw error;
  }

  let input: unknown;
  try {
    input = parse(source) as unknown;
  } catch (error) {
    throw configError(`invalid YAML (${error instanceof Error ? error.message : 'parse failure'}).`);
  }

  try {
    if (!isPlainRecord(input)) throw new Error('root must be a plain object.');
    rejectUnknownKeys(input, new Set(['schemaVersion', 'commands']), 'root');
    if (input.schemaVersion !== '0.1') throw new Error('schemaVersion must equal "0.1".');
    if (!Array.isArray(input.commands)) throw new Error('commands must be an array.');

    const commands: PortableVerificationConfig['commands'] = [];
    const ids = new Set<string>();
    for (const [index, value] of input.commands.entries()) {
      if (!isPlainRecord(value)) throw new Error(`commands[${index}] must be a plain object.`);
      rejectUnknownKeys(value, COMMAND_KEYS, `commands[${index}]`);
      if (typeof value.id !== 'string' || !ID_PATTERN.test(value.id)) {
        throw new Error(`commands[${index}].id must match ${ID_PATTERN.source}.`);
      }
      if (ids.has(value.id)) throw new Error(`duplicate command id "${value.id}".`);
      ids.add(value.id);
      if (typeof value.category !== 'string' || !CATEGORIES.has(value.category as CommandCategory)) {
        throw new Error(`commands[${index}].category is invalid.`);
      }
      if (!Array.isArray(value.argv) || value.argv.length === 0
        || !value.argv.every((argument) => typeof argument === 'string' && argument.length > 0)) {
        throw new Error(`commands[${index}].argv must be a non-empty array of non-empty literal strings.`);
      }
      if (typeof value.cwd !== 'string' || value.cwd.length === 0) {
        throw new Error(`commands[${index}].cwd must be a non-empty relative path.`);
      }
      if (value.timeoutSeconds !== undefined
        && (!Number.isInteger(value.timeoutSeconds) || (value.timeoutSeconds as number) < 1 || (value.timeoutSeconds as number) > 3600)) {
        throw new Error(`commands[${index}].timeoutSeconds must be an integer from 1 through 3600.`);
      }

      const resolvedCwd = await resolveInsideProject(resolvedRoot, value.cwd);
      const normalizedCwd = relative(resolvedRoot, resolvedCwd).split(sep).join('/') || '.';
      const command: PortableVerificationConfig['commands'][number] = {
        id: value.id,
        category: value.category as CommandCategory,
        argv: [...value.argv] as string[],
        cwd: normalizedCwd,
      };
      if (value.timeoutSeconds !== undefined) command.timeoutSeconds = value.timeoutSeconds as number;
      commands.push(command);
    }

    return { schemaVersion: '0.1', commands };
  } catch (error) {
    if (error instanceof Error && error.message.startsWith(`${CONFIG_LOCATION}:`)) throw error;
    throw configError(error instanceof Error ? error.message : 'configuration is invalid.');
  }
}
