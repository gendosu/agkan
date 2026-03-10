---
name: release-tag
description: Use after a release branch has been merged into main - fetches latest main, creates an annotated git tag, and pushes it to trigger the release workflow.
---

# release-tag

## Overview

Completes the release by fetching the latest main, creating an annotated git tag, and pushing it to trigger the `.github/workflows/release.yml` deploy pipeline.

Run this after the release branch has been merged into main (i.e., after `/release-branch` completes and the merge is confirmed).

---

## Workflow

### 1. Determine the version to tag

Read the current version from package.json:

```bash
node -p "require('./package.json').version"
# Example output: 2.5.0
NEW_VERSION=<version>
```

### 2. Fetch and switch to latest main

```bash
git checkout main
git pull origin main
```

### 3. Create git tag

```bash
git tag -a v<NEW_VERSION> -m "Release v<NEW_VERSION>"
```

### 4. Push tag (deploy trigger)

```bash
git push origin v<NEW_VERSION>
```

Pushing the tag triggers the `.github/workflows/release.yml` workflow which runs the full release pipeline (build, publish).

---

## Important Notes

- Tags must use the `v` prefix (e.g., `v2.5.0`).
- Tags are applied to the `main` branch only.
- If `npm publish` is applicable for this project, the `.github/workflows/release.yml` workflow handles it automatically on tag push.
