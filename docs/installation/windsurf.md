# Install PostVibeClarity with Windsurf

Install these skills only in the current project's `.agents/skills` directory.

## Install

From the project root, run:

```bash
PVC_SOURCE="$(mktemp -d)/post-vibe-clarity"
PVC_REPO_URL="https://github.com/Kyle332506/post-vibe-clarity.git"
git clone --depth 1 "$PVC_REPO_URL" "$PVC_SOURCE"
mkdir -p .agents/skills
cp -R "$PVC_SOURCE/skills/post-vibe-clarity" .agents/skills/
cp -R "$PVC_SOURCE/skills/project-discovery" .agents/skills/
cp -R "$PVC_SOURCE/skills/secret-exposure" .agents/skills/
cp -R "$PVC_SOURCE/skills/launch-essentials" .agents/skills/
```

You can remove the temporary source directory represented by `PVC_SOURCE` after the copy.

## Verify

In this project, confirm Windsurf discovers `post-vibe-clarity`, `project-discovery`, `secret-exposure`, and `launch-essentials`. Invoke `@post-vibe-clarity`. If Windsurf does not discover a newly created top-level skill directory, restart Windsurf and verify again.

## Run a review

Invoke `@post-vibe-clarity` and request a read-only launch review of the current project. Do not change project files during the review.

## Update

Before copying, remove exactly these four directories from the current project's `.agents/skills`: `post-vibe-clarity`, `project-discovery`, `secret-exposure`, and `launch-essentials`. Then, from the project root, repeat the install procedure and verify discovery again.

## Uninstall

Remove only these four directories from the current project's `.agents/skills`: `post-vibe-clarity`, `project-discovery`, `secret-exposure`, and `launch-essentials`.

## Compatibility evidence

Windsurf's [skill documentation](https://docs.windsurf.com/windsurf/cascade/skills) is the compatibility evidence for this entry.

Documented means the host documents the required skill format or location. It does not mean PostVibeClarity has completed runtime acceptance on this version.
