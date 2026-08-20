function visibleControlCharacter(character: string): string {
  if (character === '\n') return '\\n';
  if (character === '\r') return '\\r';
  if (character === '\t') return '\\t';
  const codePoint = character.codePointAt(0);
  if (codePoint === undefined) return '';
  return `\\u${codePoint.toString(16).padStart(4, '0')}`;
}

const lineOrControlCharacter = /[\u0000-\u001f\u007f-\u009f\u2028\u2029]/u;
const lineOrControlCharacters = /[\u0000-\u001f\u007f-\u009f\u2028\u2029]/gu;

export function containsMarkdownLineOrControl(value: string): boolean {
  return lineOrControlCharacter.test(value);
}

export function renderSafeMarkdownCode(value: string): string {
  const visible = value.replace(lineOrControlCharacters, visibleControlCharacter);
  const longestBacktickRun = Math.max(
    0,
    ...[...visible.matchAll(/`+/gu)].map(([run]) => run.length),
  );
  const fence = '`'.repeat(longestBacktickRun + 1);
  return `${fence} ${visible} ${fence}`;
}
