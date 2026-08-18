# Install PostVibeClarity with Claude Code

Install these skills only in the current project's `.claude/skills` directory.

## Install

From the project root, run:

```bash
PVC_SOURCE="$(mktemp -d)/post-vibe-clarity"
PVC_REPO_URL="https://github.com/Kyle332506/post-vibe-clarity.git"
git clone --depth 1 "$PVC_REPO_URL" "$PVC_SOURCE"
mkdir -p .claude/skills
cp -R "$PVC_SOURCE/skills/post-vibe-clarity" .claude/skills/
cp -R "$PVC_SOURCE/skills/project-discovery" .claude/skills/
cp -R "$PVC_SOURCE/skills/secret-exposure" .claude/skills/
cp -R "$PVC_SOURCE/skills/launch-essentials" .claude/skills/
```

You can remove the temporary source directory represented by `PVC_SOURCE` after the copy.

## Verify

In this project, confirm Claude Code discovers `post-vibe-clarity`, `project-discovery`, `secret-exposure`, and `launch-essentials`. Invoke `/post-vibe-clarity`. If Claude Code does not discover a newly created top-level skill directory, restart Claude Code and verify again.

## Run a review

Invoke `/post-vibe-clarity` and request a read-only launch review of the current project. Do not change project files during the review.

## Update

From the project root, repeat the install procedure to replace the four project-scoped skill directories with the current repository contents, then verify discovery again.

## Uninstall

Remove only these four directories from the current project's `.claude/skills`: `post-vibe-clarity`, `project-discovery`, `secret-exposure`, and `launch-essentials`.

## Compatibility evidence

Claude Code's [slash-command documentation](https://code.claude.com/docs/en/slash-commands) is the compatibility evidence for this entry.

Documented means the host documents the required skill format or location. It does not mean PostVibeClarity has completed runtime acceptance on this version.
