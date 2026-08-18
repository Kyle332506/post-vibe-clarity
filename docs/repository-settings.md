# Repository settings runbook

This maintainer runbook applies the approved GitHub presentation and controls after the public repository exists. Run each command only after confirming the authenticated owner; record the result of every unavailable control rather than silently claiming it was applied.

## Resolve the repository owner

```bash
PVC_OWNER="$(gh api user --jq .login)"
```

Confirm that `PVC_OWNER` is the intended personal account before continuing.

## Repository presentation and features

Set the approved repository description and feature toggles:

```bash
gh repo edit "$PVC_OWNER/post-vibe-clarity" \
  --description "Evidence-backed production preparation for vibe-coded apps and projects." \
  --enable-issues=true \
  --enable-discussions=false \
  --enable-wiki=false \
  --enable-projects=false \
  --enable-squash-merge=true \
  --enable-merge-commit=false \
  --enable-rebase-merge=false \
  --delete-branch-on-merge
```

Apply all eight approved topics in one command:

```bash
gh repo edit "$PVC_OWNER/post-vibe-clarity" --add-topic "vibe-coding,production,production-readiness,agent-skills,launch-checklist,developer-tools,security,open-source"
```

The approved topics are `vibe-coding`, `production`, `production-readiness`, `agent-skills`, `launch-checklist`, `developer-tools`, `security`, and `open-source`. The merge policy is squash merge only, with source branches deleted after merge.

## Security controls and branch protection

Enable each control that GitHub makes available to this repository and account:

```bash
gh repo edit "$PVC_OWNER/post-vibe-clarity" --enable-secret-scanning=true
gh repo edit "$PVC_OWNER/post-vibe-clarity" --enable-secret-scanning-push-protection=true
gh api --method PUT "repos/$PVC_OWNER/post-vibe-clarity/private-vulnerability-reporting"
gh api --method PUT "repos/$PVC_OWNER/post-vibe-clarity/branches/main/protection" --input .github/branch-protection.json
```

The protection payload in `.github/branch-protection.json` requires the `verify` status check, strict up-to-date checks, linear history, resolved conversations, and disallows force pushes and deletions. If a GitHub plan, repository type, or API response prevents a requested control, record that control as **unavailable** with the response and date; do not silently claim it is enabled.

## Social preview upload

Upload [`assets/social-preview.png`](../assets/social-preview.png) in the repository’s **Settings → General → Social preview** section. The image is the upload-ready 1280 by 640 PNG prepared for this repository. This remains a documented Settings-page action because GitHub does not expose social-preview upload through the chosen CLI workflow.

## CI audit

After the default branch is available, audit the applied state and the Foundation CI workflow:

```bash
gh repo view "$PVC_OWNER/post-vibe-clarity" --json nameWithOwner,visibility,description,defaultBranchRef,hasIssuesEnabled,hasDiscussionsEnabled,hasWikiEnabled,deleteBranchOnMerge,url
gh api "repos/$PVC_OWNER/post-vibe-clarity/branches/main/protection"
gh run list --repo "$PVC_OWNER/post-vibe-clarity" --workflow "Foundation CI" --limit 5
```

Confirm the exact description, `main` default branch, issues enabled, discussions and wiki disabled, delete-on-merge enabled, branch protection present, and a successful `verify` run. Record any unavailable control in the release record.

## Release gate

Do not create the `v0.1.0` tag or release until a maintainer has separately approved publication after reviewing successful default-branch CI, the [release notes](releases/v0.1.0.md), [known limitations](foundation-coverage.md), compatibility labels, and the [disclaimer](../DISCLAIMER.md). A release describes the available evidence; it must not claim that applications are production-ready or fully secured.
