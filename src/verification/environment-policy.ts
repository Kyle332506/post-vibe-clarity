import { compareOrdinal } from '../ordinal.js';

export interface FilteredEnvironment {
  environment: NodeJS.ProcessEnv;
  removedNames: string[];
}

const sensitiveNameParts = [
  'TOKEN',
  'SECRET',
  'PASSWORD',
  'PASSWD',
  'PRIVATE_KEY',
  'CREDENTIAL',
  'API_KEY',
  'AUTHORIZATION',
  'COOKIE',
  'SESSION',
];

const runtimeInjectionNames = new Set([
  'NODE_OPTIONS',
  'NODE_PATH',
  'BASH_ENV',
  'ENV',
  'ZDOTDIR',
  'PYTHONPATH',
  'PYTHONSTARTUP',
  'RUBYOPT',
  'PERL5OPT',
  'GIT_ASKPASS',
  'SSH_ASKPASS',
]);

function shouldRemoveEnvironmentName(name: string): boolean {
  const normalized = name.toUpperCase();
  return sensitiveNameParts.some((part) => normalized.includes(part))
    || runtimeInjectionNames.has(normalized)
    || normalized.startsWith('LD_')
    || normalized.startsWith('DYLD_');
}

export function filterExecutionEnvironment(input: NodeJS.ProcessEnv): FilteredEnvironment {
  const environment: NodeJS.ProcessEnv = {};
  const removedNames: string[] = [];

  for (const [name, value] of Object.entries(input)) {
    if (shouldRemoveEnvironmentName(name)) {
      removedNames.push(name);
    } else {
      environment[name] = value;
    }
  }

  return { environment, removedNames: removedNames.sort(compareOrdinal) };
}
