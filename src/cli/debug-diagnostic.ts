const safeErrorNames = new Set([
  'AggregateError',
  'Error',
  'RangeError',
  'SyntaxError',
  'TypeError',
  'URIError',
  'YAMLParseError',
]);
const debugDiagnosticFallback = 'Review failed.\nError category: Error';

function hasNameAccessor(error: Error): boolean {
  let current: object | null = error;

  while (current) {
    const descriptor = Object.getOwnPropertyDescriptor(current, 'name');
    if (descriptor) return descriptor.get !== undefined || descriptor.set !== undefined;
    current = Object.getPrototypeOf(current) as object | null;
  }

  return false;
}

function buildDebugDiagnostic(error: unknown): string {
  let errorName = 'Error';
  let nameUsesAccessor = false;

  if (error instanceof Error) {
    nameUsesAccessor = hasNameAccessor(error);
    const candidateName: unknown = error.name;
    if (typeof candidateName === 'string' && safeErrorNames.has(candidateName)) errorName = candidateName;
  }

  const lines = ['Review failed.', `Error category: ${errorName}`];
  let stack: string | undefined;

  if (error instanceof Error && !nameUsesAccessor) {
    try {
      stack = error.stack;
    } catch {
      stack = undefined;
    }
  }

  const frames: string[] = [];
  for (const line of stack?.split('\n') ?? []) {
    const location = /^\s*at\b.*?:(\d+):(\d+)\)?\s*$/.exec(line);
    if (!location) continue;
    frames.push(`  at frame-${frames.length + 1}:${location[1]}:${location[2]}`);
    if (frames.length === 12) break;
  }

  if (frames.length > 0) lines.push('Stack frames:', ...frames);
  return lines.join('\n');
}

export function debugDiagnostic(error: unknown): string {
  try {
    return buildDebugDiagnostic(error);
  } catch {
    return debugDiagnosticFallback;
  }
}
