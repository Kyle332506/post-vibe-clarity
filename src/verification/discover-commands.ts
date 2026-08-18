import { createHash } from 'node:crypto';
import { access, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import type {
  CommandCategory,
  VerificationCategoryAssessment,
  VerificationCommand,
  VerificationCoverageGap,
} from '../model/verification.js';
import { loadVerificationConfig, type PortableVerificationConfig } from './load-verification-config.js';
import { resolveProjectRoot } from './project-path.js';
import { discoverWorkspaceRoots } from './discover-workspaces.js';

export interface CommandDiscoveryResult {
  commands: VerificationCommand[];
  excludedCommands: VerificationCommand[];
  categoryAssessments: VerificationCategoryAssessment[];
  coverageGaps: VerificationCoverageGap[];
  inputLocations: string[];
  workspaceRoots: string[];
}

type PackageManager = 'npm' | 'pnpm' | 'yarn' | 'bun';

const CATEGORY_ORDER: CommandCategory[] = ['build', 'type-check', 'lint', 'test'];
const LOCKFILES: Array<[string, PackageManager]> = [
  ['package-lock.json', 'npm'],
  ['npm-shrinkwrap.json', 'npm'],
  ['pnpm-lock.yaml', 'pnpm'],
  ['yarn.lock', 'yarn'],
  ['bun.lock', 'bun'],
  ['bun.lockb', 'bun'],
];

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function sha256(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

async function exists(path: string): Promise<boolean> {
  try {
    await access(path);
    return true;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return false;
    throw error;
  }
}

async function packageManagerEvidence(
  root: string,
  manifest: Record<string, unknown>,
): Promise<{ manager?: PackageManager; problem?: string; locations: string[] }> {
  const presentLockfiles: Array<[string, PackageManager]> = [];
  for (const lockfile of LOCKFILES) {
    if (await exists(join(root, lockfile[0]))) presentLockfiles.push(lockfile);
  }
  const locations = presentLockfiles.map(([location]) => location);
  const lockManagers = new Set(presentLockfiles.map(([, manager]) => manager));

  if (manifest.packageManager !== undefined) {
    const match = typeof manifest.packageManager === 'string'
      ? /^(npm|pnpm|yarn|bun)@.+$/.exec(manifest.packageManager)
      : null;
    if (match === null) return { problem: 'Unsupported packageManager declaration; use postvibe.verification.yaml.', locations };
    const manager = match[1] as PackageManager;
    if ([...lockManagers].some((lockManager) => lockManager !== manager)) {
      return { problem: 'Conflicting package-manager evidence; use postvibe.verification.yaml.', locations };
    }
    return { manager, locations };
  }

  const [lockfileManager] = lockManagers;
  if (lockfileManager !== undefined && lockManagers.size === 1) return { manager: lockfileManager, locations };
  if (lockManagers.size > 1) {
    return { problem: 'Conflicting package-manager evidence; use postvibe.verification.yaml.', locations };
  }
  return { problem: 'No supported package-manager evidence; use postvibe.verification.yaml.', locations };
}

function packageCommand(
  manager: PackageManager,
  scriptName: string,
  category: CommandCategory,
  declaration: string,
): VerificationCommand {
  return {
    id: `package-script:${category}`,
    category,
    argv: [manager, 'run', scriptName],
    cwd: '.',
    timeoutSeconds: 600,
    requiredAccess: ['local-command'],
    source: {
      kind: 'package-script',
      location: `package.json#scripts.${scriptName}`,
      declaration,
      sha256: sha256(declaration),
    },
  };
}

function portableCommand(
  command: PortableVerificationConfig['commands'][number],
  index: number,
): VerificationCommand {
  const declaration = JSON.stringify(command);
  return {
    id: command.id,
    category: command.category,
    argv: [...command.argv],
    cwd: command.cwd,
    timeoutSeconds: command.timeoutSeconds ?? 600,
    requiredAccess: ['local-command'],
    source: {
      kind: 'portable-config',
      location: `postvibe.verification.yaml#commands[${index}]`,
      declaration,
      sha256: sha256(declaration),
    },
  };
}

function workspaceGapId(workspace: string): string {
  const normalized = workspace
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, '.')
    .replace(/^\.+|\.+$/g, '')
    .replace(/\.{2,}/g, '.');
  return `workspace.${normalized}`;
}

export async function discoverVerificationCommands(
  root: string,
  excludedIds: Set<string>,
): Promise<CommandDiscoveryResult> {
  const resolvedRoot = await resolveProjectRoot(root);
  const inputLocations = new Set<string>();
  const discovered: VerificationCommand[] = [];
  const categoryProblems = new Map<CommandCategory, string>();
  const packagePath = join(resolvedRoot, 'package.json');

  if (await exists(packagePath)) {
    inputLocations.add('package.json');
    let manifest: unknown;
    try {
      manifest = JSON.parse(await readFile(packagePath, 'utf8')) as unknown;
    } catch {
      throw new Error('package.json contains invalid JSON.');
    }
    if (!isPlainRecord(manifest)) throw new Error('package.json root must be an object.');
    const scripts = isPlainRecord(manifest.scripts) ? manifest.scripts : {};
    const scriptDeclarations = new Map<CommandCategory, { name: string; declaration: string }>();

    const ordinaryScripts: Array<[CommandCategory, string]> = [
      ['build', 'build'],
      ['lint', 'lint'],
      ['test', 'test'],
    ];
    for (const [category, name] of ordinaryScripts) {
      const value = scripts[name];
      if (typeof value === 'string' && value.length > 0) scriptDeclarations.set(category, { name, declaration: value });
      else if (value !== undefined) categoryProblems.set(category, `package.json#scripts.${name} is not a non-empty string.`);
    }

    const typecheck = scripts.typecheck;
    const typeCheck = scripts['type-check'];
    if (typecheck !== undefined && typeCheck !== undefined) {
      categoryProblems.set('type-check', 'Both typecheck and type-check scripts are declared; neither was selected.');
    } else {
      const name = typecheck !== undefined ? 'typecheck' : 'type-check';
      const value = scripts[name];
      if (typeof value === 'string' && value.length > 0) {
        scriptDeclarations.set('type-check', { name, declaration: value });
      } else if (value !== undefined) {
        categoryProblems.set('type-check', `package.json#scripts.${name} is not a non-empty string.`);
      }
    }

    if (scriptDeclarations.size > 0) {
      const evidence = await packageManagerEvidence(resolvedRoot, manifest);
      evidence.locations.forEach((location) => inputLocations.add(location));
      if (evidence.manager === undefined) {
        for (const category of scriptDeclarations.keys()) categoryProblems.set(category, evidence.problem ?? 'Package manager is unverified.');
      } else {
        for (const category of CATEGORY_ORDER) {
          const script = scriptDeclarations.get(category);
          if (script !== undefined) discovered.push(packageCommand(evidence.manager, script.name, category, script.declaration));
        }
      }
    } else {
      for (const [location] of LOCKFILES) {
        if (await exists(join(resolvedRoot, location))) inputLocations.add(location);
      }
    }
  }

  const portable = await loadVerificationConfig(resolvedRoot);
  if (portable !== undefined) {
    inputLocations.add('postvibe.verification.yaml');
    portable.commands.forEach((command, index) => discovered.push(portableCommand(command, index)));
  }

  const seenIds = new Set<string>();
  for (const command of discovered) {
    if (seenIds.has(command.id)) throw new Error(`Duplicate command id "${command.id}" across discovery sources.`);
    seenIds.add(command.id);
  }
  for (const excludedId of excludedIds) {
    if (!seenIds.has(excludedId)) throw new Error(`Unknown command id "${excludedId}" in exclusions.`);
  }

  const commands = discovered.filter(({ id }) => !excludedIds.has(id));
  const excludedCommands = discovered.filter(({ id }) => excludedIds.has(id));
  const coverageGaps: VerificationCoverageGap[] = excludedCommands.map((command) => ({
    id: `command.${command.id}`,
    category: command.category,
    reason: `The declared ${command.category} command was excluded from this plan.`,
    workspace: command.cwd,
  }));

  const hasRootIndex = await exists(join(resolvedRoot, 'index.html'));
  if (hasRootIndex) inputLocations.add('index.html');
  const staticHtml = hasRootIndex
    && !await exists(packagePath)
    && portable === undefined;
  const categoryAssessments: VerificationCategoryAssessment[] = CATEGORY_ORDER.map((category) => {
    if (discovered.some((command) => command.category === category)) {
      return { category, state: 'applicable', reason: `A ${category} command is declared.` };
    }
    if (category === 'build' && staticHtml) {
      return { category, state: 'not-applicable', reason: 'The root is a static HTML project with no declared build system.' };
    }
    const reason = categoryProblems.get(category) ?? `No declared ${category} command was discovered.`;
    coverageGaps.push({ id: `category.${category}`, category, reason });
    return { category, state: 'unverified', reason };
  });

  const workspaceDiscovery = await discoverWorkspaceRoots(resolvedRoot);
  workspaceDiscovery.inputLocations.forEach((location) => inputLocations.add(location));
  const coveredWorkspaces = new Set(commands.filter(({ cwd }) => cwd !== '.').map(({ cwd }) => cwd));
  const workspaceGapIds = new Set<string>();
  for (const workspace of workspaceDiscovery.workspaceRoots) {
    if (coveredWorkspaces.has(workspace)) continue;
    const id = workspaceGapId(workspace);
    if (workspaceGapIds.has(id)) throw new Error(`Workspace paths produce duplicate coverage gap id "${id}".`);
    workspaceGapIds.add(id);
    coverageGaps.push({
      id,
      reason: 'Detected workspace was not directly covered by an approved command.',
      workspace,
    });
  }

  return {
    commands,
    excludedCommands,
    categoryAssessments,
    coverageGaps,
    inputLocations: [...inputLocations].sort(),
    workspaceRoots: workspaceDiscovery.workspaceRoots,
  };
}
