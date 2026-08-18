import { describe, expect, it } from 'vitest';
import { expectNoEmoji, readRepositoryFile } from './repository-docs.js';

const approvalGates = [
  'Repository settings approval gate',
  'Security controls approval gate',
  'Branch protection approval gate',
  'Social preview approval gate',
] as const;

describe('repository settings runbook', () => {
  it('requires a separate target-and-effect approval gate for each external-state class', async () => {
    const runbook = await readRepositoryFile('docs/repository-settings.md');

    for (const gate of approvalGates) {
      expect(runbook).toContain(`## ${gate}`);
    }
    expect(runbook.match(/\*\*Target:\*\*/g)).toHaveLength(4);
    expect(runbook.match(/\*\*Effect:\*\*/g)).toHaveLength(4);
    expect(runbook.match(/Wait for explicit user approval before continuing\./g)).toHaveLength(4);
    expectNoEmoji(runbook, 'docs/repository-settings.md');
  });

  it('enables vulnerability alerts and audits the complete required state', async () => {
    const runbook = await readRepositoryFile('docs/repository-settings.md');

    expect(runbook).toContain('gh api --method PUT "repos/$PVC_OWNER/post-vibe-clarity/vulnerability-alerts"');
    for (const audit of [
      'Topics audit',
      'Merge methods and Projects audit',
      'Security controls audit',
      'Private vulnerability reporting audit',
      'Branch protection audit',
      'CI audit',
      'Manual social preview audit',
    ]) {
      expect(runbook).toContain(`### ${audit}`);
    }
    expect(runbook).toContain('gh api "repos/$PVC_OWNER/post-vibe-clarity/topics"');
    expect(runbook).toContain('allow_squash_merge, allow_merge_commit, allow_rebase_merge, has_projects');
    expect(runbook).toContain('gh api --method GET "repos/$PVC_OWNER/post-vibe-clarity/vulnerability-alerts" --include');
    expect(runbook).toContain('gh api "repos/$PVC_OWNER/post-vibe-clarity/private-vulnerability-reporting"');
    expect(runbook).toContain('gh api "repos/$PVC_OWNER/post-vibe-clarity/branches/main/protection"');
    expect(runbook).toContain('gh run list --repo "$PVC_OWNER/post-vibe-clarity" --workflow "Foundation CI" --limit 5');
    expect(runbook).toContain('configured, unavailable, or not approved');
  });
});
