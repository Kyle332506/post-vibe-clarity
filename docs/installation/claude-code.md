# Install PostVibeClarity with Claude Code

Install these skills only in the current project's `.claude/skills` directory.

## Install

From the project root, clone the reviewed release tag, stage all five skills, compare any existing copies, preserve them in a bounded backup, and record the exact installed commit:

```bash
set -eu
PVC_VERSION="v0.2.0"
PVC_REPO_URL="https://github.com/Kyle332506/post-vibe-clarity.git"
PVC_TEMP_ROOT="$(mktemp -d)"
PVC_SOURCE="$PVC_TEMP_ROOT/post-vibe-clarity"
git clone --branch "$PVC_VERSION" --depth 1 --single-branch "$PVC_REPO_URL" "$PVC_SOURCE"
PVC_REVISION="$(git -C "$PVC_SOURCE" rev-parse HEAD)"
PVC_INSTALL_ROOT=".claude/skills"
mkdir -p "$PVC_INSTALL_ROOT"
PVC_STAGE="$(mktemp -d "$PVC_INSTALL_ROOT/.postvibeclarity-stage.XXXXXX")"
for PVC_SKILL in post-vibe-clarity project-discovery secret-exposure launch-essentials universal-verification; do
  cp -R "$PVC_SOURCE/skills/$PVC_SKILL" "$PVC_STAGE/$PVC_SKILL"
done
for PVC_SKILL in post-vibe-clarity project-discovery secret-exposure launch-essentials universal-verification; do
  if [ ! -d "$PVC_STAGE/$PVC_SKILL" ]; then
    printf 'Staging failed: missing %s; live installation was not changed.\n' "$PVC_SKILL" >&2
    exit 1
  fi
done
mkdir -p "$PVC_INSTALL_ROOT/.postvibeclarity-backups"
PVC_BACKUP_ROOT="$(mktemp -d "$PVC_INSTALL_ROOT/.postvibeclarity-backups/update.XXXXXX")"
for PVC_SKILL in post-vibe-clarity project-discovery secret-exposure launch-essentials universal-verification; do
  if [ -e "$PVC_INSTALL_ROOT/$PVC_SKILL" ]; then
    diff -qr "$PVC_INSTALL_ROOT/$PVC_SKILL" "$PVC_STAGE/$PVC_SKILL" || true
    mv "$PVC_INSTALL_ROOT/$PVC_SKILL" "$PVC_BACKUP_ROOT/$PVC_SKILL"
  fi
  mv "$PVC_STAGE/$PVC_SKILL" "$PVC_INSTALL_ROOT/$PVC_SKILL"
done
if [ -f "$PVC_INSTALL_ROOT/.postvibeclarity-revision" ]; then
  cp "$PVC_INSTALL_ROOT/.postvibeclarity-revision" "$PVC_BACKUP_ROOT/previous-install-revision"
fi
printf 'version=%s\nrevision=%s\n' "$PVC_VERSION" "$PVC_REVISION" > "$PVC_INSTALL_ROOT/.postvibeclarity-revision"
rmdir "$PVC_STAGE"
```

The block exits on the first failed command and validates all five staged directories before moving any live skill. The `diff -qr` preflight reports changed paths without printing file contents. Existing destinations are moved, not deleted, and remain under the unique `PVC_BACKUP_ROOT`. Keep that backup until verification succeeds. You can then remove the explicit temporary directory represented by `PVC_TEMP_ROOT` and, after reviewing it, the specific backup directory printed in your shell state; do not use a broad or unresolved removal command.

## Verify

In this project, confirm Claude Code discovers `post-vibe-clarity`, `project-discovery`, `secret-exposure`, `launch-essentials`, and `universal-verification`. Invoke `/post-vibe-clarity`. If Claude Code does not discover a newly created top-level skill directory, restart Claude Code and verify again. Confirm `.claude/skills/.postvibeclarity-revision` records the expected tag and commit.

## Run a review

Invoke `/post-vibe-clarity` and request a read-only launch review of the current project. Do not change project files during the review.

## Update

Choose a reviewed release tag, change only `PVC_VERSION`, and repeat the install block. Do not update from a moving default branch. The staged copy is compared first, every existing skill directory is preserved under `PVC_BACKUP_ROOT`, and the new tag plus commit replace the revision record. Review the diff summary and backup before reapplying intentional local changes, then verify discovery again.

## Uninstall

Before uninstalling, compare the five installed directories with the revision recorded in `.claude/skills/.postvibeclarity-revision`. Move any locally changed `post-vibe-clarity`, `project-discovery`, `secret-exposure`, `launch-essentials`, or `universal-verification` directory into a named project backup before removing only those five bounded destinations and the revision record.

## Compatibility evidence

Claude Code's [slash-command documentation](https://code.claude.com/docs/en/slash-commands) is the compatibility evidence for this entry.

Documented means the host documents the required skill format or location. It does not mean PostVibeClarity has completed runtime acceptance on this version.
