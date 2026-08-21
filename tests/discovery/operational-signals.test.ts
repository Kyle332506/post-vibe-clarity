import { describe, expect, it } from 'vitest';
import { discoverOperationalSignals } from '../../src/discovery/operational-signals.js';

describe('discoverOperationalSignals', () => {
  const cases = [
    {
      name: 'backend service',
      files: ['package.json', 'src/server.ts'],
      dependencies: new Set(['fastify']),
      artifacts: ['backend'],
      capabilities: ['network-service'],
    },
    {
      name: 'desktop app',
      files: ['package.json', 'src/main.ts'],
      dependencies: new Set(['electron']),
      artifacts: ['desktop'],
      capabilities: [],
    },
    {
      name: 'worker',
      files: ['package.json', 'src/worker.ts'],
      dependencies: new Set<string>(),
      artifacts: ['worker'],
      capabilities: [],
    },
    {
      name: 'persistent data',
      files: ['package.json', 'prisma/schema.prisma'],
      dependencies: new Set<string>(),
      artifacts: [],
      capabilities: ['persistent-data'],
    },
  ] as const;

  for (const example of cases) {
    it(`detects ${example.name}`, () => {
      const result = discoverOperationalSignals(example.files, example.dependencies);

      expect(result.artifacts.map(({ value }) => value)).toEqual(example.artifacts);
      expect(result.capabilities.map(({ value }) => value)).toEqual(example.capabilities);
    });
  }

  it('does not infer operations from React alone', () => {
    const result = discoverOperationalSignals(['package.json'], new Set(['react']));

    expect(result.artifacts).toEqual([]);
    expect(result.capabilities).toEqual([]);
  });

  it('does not infer persistent data from a generic data source file', () => {
    const result = discoverOperationalSignals(['package.json', 'src/data.ts'], new Set());

    expect(result.capabilities).toEqual([]);
  });

  it('does not infer a worker from a worker test', () => {
    const result = discoverOperationalSignals(['package.json', 'src/worker.test.ts'], new Set());

    expect(result.artifacts).toEqual([]);
    expect(result.capabilities).toEqual([]);
  });
});
