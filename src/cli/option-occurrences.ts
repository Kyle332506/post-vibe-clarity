interface ParseToken {
  kind: string;
  name?: string;
}

export function findRepeatedSingularOption(
  tokens: readonly ParseToken[],
  singularOptions: ReadonlySet<string>,
): string | undefined {
  const seen = new Set<string>();
  for (const token of tokens) {
    if (token.kind !== 'option' || token.name === undefined || !singularOptions.has(token.name)) continue;
    if (seen.has(token.name)) return token.name;
    seen.add(token.name);
  }
  return undefined;
}
