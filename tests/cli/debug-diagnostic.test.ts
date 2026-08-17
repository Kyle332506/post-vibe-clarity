import { describe, expect, it } from 'vitest';
import { debugDiagnostic } from '../../src/cli/debug-diagnostic.js';

const controlledGetterValue = 'controlled-name-getter-value-never-emit';

describe('debugDiagnostic', () => {
  it('snapshots an allowlisted error name exactly once', () => {
    let nameReads = 0;
    const error = new Error('fixture');
    Object.defineProperty(error, 'name', {
      get() {
        nameReads += 1;
        return nameReads === 1 ? 'YAMLParseError' : controlledGetterValue;
      },
    });

    const diagnostic = debugDiagnostic(error);
    const diagnosticContainsControlledValue = diagnostic.includes(controlledGetterValue);
    const diagnosticHasAllowlistedCategory = diagnostic.includes('Error category: YAMLParseError');

    expect(nameReads).toBe(1);
    expect(diagnosticContainsControlledValue).toBe(false);
    expect(diagnosticHasAllowlistedCategory).toBe(true);
  });

  it('returns a fixed fallback when an error name getter throws', () => {
    const error = new Error('fixture');
    Object.defineProperty(error, 'name', {
      get() {
        throw new Error(controlledGetterValue);
      },
    });
    let formatterThrew = false;
    let diagnostic = '';

    try {
      diagnostic = debugDiagnostic(error);
    } catch {
      formatterThrew = true;
    }

    const diagnosticContainsControlledValue = diagnostic.includes(controlledGetterValue);
    const diagnosticIsFixedFallback = diagnostic === 'Review failed.\nError category: Error';
    expect(formatterThrew).toBe(false);
    expect(diagnosticContainsControlledValue).toBe(false);
    expect(diagnosticIsFixedFallback).toBe(true);
  });
});
