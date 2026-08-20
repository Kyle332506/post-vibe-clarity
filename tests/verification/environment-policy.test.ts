import { describe, expect, it } from 'vitest';
import { filterExecutionEnvironment } from '../../src/verification/environment-policy.js';

describe('execution environment policy', () => {
  it('keeps ordinary variables while returning only sorted names for removed values', () => {
    const controlledValues = [
      'app-token-never-return',
      'database-password-never-return',
      'node-options-never-return',
      'python-path-never-return',
      'loader-preload-never-return',
      'dyld-insert-never-return',
    ];
    const result = filterExecutionEnvironment({
      PATH: '/controlled/bin',
      CI: 'true',
      APP_TOKEN: controlledValues[0],
      databasePassword: controlledValues[1],
      NODE_OPTIONS: controlledValues[2],
      PYTHONPATH: controlledValues[3],
      LD_PRELOAD: controlledValues[4],
      DYLD_INSERT_LIBRARIES: controlledValues[5],
    });

    expect(result).toEqual({
      environment: {
        PATH: '/controlled/bin',
        CI: 'true',
      },
      removedNames: [
        'APP_TOKEN',
        'databasePassword',
        'DYLD_INSERT_LIBRARIES',
        'LD_PRELOAD',
        'NODE_OPTIONS',
        'PYTHONPATH',
      ],
    });
    expect(controlledValues.some((value) => JSON.stringify(result).includes(value))).toBe(false);
  });

  it('removes every runtime-injection name plus case-insensitive sensitive parts and loader prefixes', () => {
    const removed = [
      'buildToken',
      'clientSecret',
      'databasePassword',
      'userPasswd',
      'signingPrivate_Key',
      'cloudCredential',
      'serviceApi_Key',
      'requestAuthorization',
      'browserCookie',
      'loginSession',
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
      'LD_LIBRARY_PATH',
      'DYLD_FRAMEWORK_PATH',
    ];
    const result = filterExecutionEnvironment(Object.fromEntries(removed.map((name) => [name, `value-for-${name}`])));

    expect(new Set(result.removedNames)).toEqual(new Set(removed));
    expect(result.environment).toEqual({});
  });
});
