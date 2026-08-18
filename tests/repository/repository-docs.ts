import { access, readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { expect } from 'vitest';

export const repositoryRoot = fileURLToPath(new URL('../../', import.meta.url));

export function repositoryPath(path: string): string {
  return resolve(repositoryRoot, path);
}

export async function readRepositoryFile(path: string): Promise<string> {
  return readFile(repositoryPath(path), 'utf8');
}

export function headingPosition(source: string, heading: string): number {
  return source.indexOf(`\n## ${heading}\n`);
}

export function localMarkdownLinks(source: string): string[] {
  return [...source.matchAll(/\[[^\]]+\]\((?!https?:|#|mailto:)([^)]+)\)/g)]
    .map((match) => match[1])
    .filter((value): value is string => value !== undefined)
    .map((value) => value.split('#', 1)[0] ?? value)
    .filter((value) => value.length > 0);
}

export async function expectLocalLinksResolve(sourcePath: string, source: string): Promise<void> {
  for (const link of localMarkdownLinks(source)) {
    await expect(access(resolve(repositoryRoot, dirname(sourcePath), link))).resolves.toBeUndefined();
  }
}

export function expectNoEmoji(source: string, label: string): void {
  expect(source, `${label} contains an emoji`).not.toMatch(/\p{Extended_Pictographic}/u);
}
