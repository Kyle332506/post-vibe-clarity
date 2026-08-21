import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';
import { parse } from 'yaml';

const skillRoot = new URL('../../skills/launch-operations/', import.meta.url);
const templateNames = [
  'release-and-deployment.md',
  'rollback-and-recovery.md',
  'monitoring-and-incident-response.md',
  'health-check.md',
  'backup-and-restore.md',
  'maintenance-ownership.md',
] as const;

const requiredTemplateHeadings = [
  '## Confirmed facts',
  '## Procedure',
  '## Ownership',
  '## Verification cadence',
  '## Unresolved decisions',
  '## Evidence boundary',
] as const;

async function loadSkill(): Promise<{ frontmatter: Record<string, unknown>; body: string; source: string }> {
  const source = await readFile(new URL('SKILL.md', skillRoot), 'utf8');
  const match = /^---\r?\n([\s\S]*?)\r?\n---\r?\n([\s\S]+)$/.exec(source);
  expect(match).not.toBeNull();
  if (!match?.[1] || !match[2]) throw new Error('launch-operations/SKILL.md has invalid frontmatter');

  return {
    frontmatter: parse(match[1]) as Record<string, unknown>,
    body: match[2],
    source,
  };
}

function expectInOrder(source: string, anchors: readonly string[]): void {
  let previous = -1;
  for (const anchor of anchors) {
    const next = source.indexOf(anchor, previous + 1);
    expect(next, `missing or out-of-order contract: ${anchor}`).toBeGreaterThan(previous);
    previous = next;
  }
}

describe('launch-operations guided remedies', () => {
  it('packages the exact portable skill identity', async () => {
    const { frontmatter } = await loadSkill();

    expect(frontmatter).toEqual({
      name: 'launch-operations',
      description:
        'Use when reviewing repository evidence for releases, rollback, monitoring, health checks, backups, restoration, or maintenance ownership and when drafting one approved operational runbook at a time.',
      license: 'Apache-2.0',
      metadata: {
        'postvibeclarity.dev/role': 'specialist',
        'postvibeclarity.dev/version': '0.1.0',
      },
    });
  });

  it('defines the guided workflow contracts and phases in order', async () => {
    const { body } = await loadSkill();

    for (const phrase of [
      'one finding at a time',
      'one question at a time',
      "I don't know",
      'exact target path',
      'explicit approval',
      'Level 2',
      'fresh repository check',
      'does not prove',
    ]) {
      expect(body).toContain(phrase);
    }

    expectInOrder(body, [
      '1. Read the latest audit',
      '2. Explain applicability',
      "3. Load only that finding's template",
      '4. Ask one question at a time',
      '5. Refuse secrets',
      '6. Preview the exact target path',
      '7. Obtain separate explicit approval',
      '8. Write only the approved Markdown file',
      '9. Show the diff',
      '10. Run a fresh repository check',
    ]);
  });

  it('closes repository-write, sensitive-data, and external-action loopholes', async () => {
    const { body } = await loadSkill();

    for (const protectedValue of ['credentials', 'private keys', 'recovery secrets', 'customer data']) {
      expect(body, `${protectedValue} must be refused`).toMatch(
        new RegExp(`(?:refuse|never request|do not request)[^\\n.]{0,180}${protectedValue}`, 'i'),
      );
    }

    for (const prohibitedAction of [
      'source',
      'configuration',
      'workflow',
      'infrastructure',
      'external services',
      'staging',
      'committing',
      'publishing',
    ]) {
      expect(body, `${prohibitedAction} must be prohibited`).toMatch(
        new RegExp(`(?:never|do not)[^\\n.]{0,240}${prohibitedAction}`, 'i'),
      );
    }

    expect(body).toMatch(/default[^\n.]{0,100}docs\/operations\//i);
    expect(body).toMatch(/preserve[^\n.]{0,100}existing project convention/i);
    expect(body).toMatch(/never overwrite silently/i);
    expect(body).toMatch(/broad[^\n.]{0,120}(?:request|instruction)[^\n.]{0,120}not[^\n.]{0,80}(?:approval|authorization)/i);
  });

  it('packages six provider-neutral guided-authoring templates with a stable output structure', async () => {
    const attribution =
      /\b(?:authored|created|generated|written)\s+(?:by|with)\s+(?:an?\s+)?(?:AI|artificial intelligence|language model|LLM)\b/i;
    const providerName = /\b(?:AWS|Amazon Web Services|Azure|Google Cloud|GCP|Vercel|Heroku|Datadog|PagerDuty|Sentry)\b/i;

    for (const templateName of templateNames) {
      const source = await readFile(new URL(`templates/${templateName}`, skillRoot), 'utf8');
      expect(source).toMatch(/^# .+\r?\n\r?\nStatus: Draft until reviewed by the named owner\.\r?\n/);
      expect(source, `${templateName} needs guided-authoring comments`).toMatch(/<!--[\s\S]+?-->/);
      expect(source, `${templateName} contains an emoji`).not.toMatch(/\p{Extended_Pictographic}/u);
      expect(source, `${templateName} contains authorship attribution`).not.toMatch(attribution);
      expect(source, `${templateName} contains a provider-specific claim`).not.toMatch(providerName);
      expectInOrder(source, requiredTemplateHeadings);
    }
  });

  it('defines the backup interview in the required plain-language order', async () => {
    const { body } = await loadSkill();
    const start = body.indexOf('## Backup and restore questions');
    expect(start).toBeGreaterThanOrEqual(0);
    const backupQuestions = body.slice(start);

    expectInOrder(backupQuestions, [
      '1. What important data',
      '2. Where is that data stored',
      '3. How much recent data loss is acceptable',
      '4. How quickly should recovery happen',
      '5. What creates or is intended to create backups',
      '6. How long are backups retained',
      '7. Who owns backup and recovery work',
      '8. How is restoration performed',
      '9. How often is restoration tested',
      '10. How are backup failures noticed',
    ]);
    expect(backupQuestions).toMatch(/recovery-point expectation[^\n.]{0,180}amount of recent data[^\n.]{0,80}(?:lose|loss)/i);
    expect(backupQuestions).toMatch(/recovery-time expectation[^\n.]{0,180}(?:quickly|time)[^\n.]{0,80}recover/i);
  });

  it('requires final writes to remove prompts and retain unresolved required answers explicitly', async () => {
    const { body } = await loadSkill();

    expect(body).toMatch(/HTML comments[^\n.]{0,180}(?:guided authoring|authoring)/i);
    expect(body).toMatch(/remove[^\n.]{0,120}answered[^\n.]{0,80}comments/i);
    expect(body).toContain('Unresolved decision:');
    expect(body).toMatch(/unanswered required items[^\n.]{0,160}Unresolved decision:/i);
    expect(body).toMatch(/passed or unverified/i);
    expect(body).toMatch(/does not prove[^\n.]{0,180}(?:live|production)/i);
  });
});
