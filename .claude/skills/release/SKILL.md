---
name: release
description: Use when performing a release to automate the full release flow - versioning, CHANGELOG update, git tagging, and deploy trigger via push.
---

# release

## Overview

Orchestrates the complete release workflow by running two sub-skills in sequence:

1. **`/release-branch`** — version bump, CHANGELOG update, build verification, commit, and wait for branch merge
2. **`/release-tag`** — fetch latest main, create annotated git tag, push to trigger deploy

---

## Workflow

### Phase 1: Prepare and commit the release branch

Run the `/release-branch` skill. It will:
- Verify you are on main and tests pass
- Determine the version bump (MAJOR / MINOR / PATCH)
- Bump version in `package.json`
- Update `CHANGELOG.md`
- Build and verify
- Commit the changes
- Ask you to merge the release branch into main

**Wait for the user to confirm the merge is complete before continuing.**

### Phase 2: Tag and deploy

Run the `/release-tag` skill. It will:
- Fetch and switch to the latest main
- Create an annotated git tag (`v<NEW_VERSION>`)
- Push the tag to trigger the `.github/workflows/release.yml` pipeline

---

## Important Notes

- Always run tests before releasing. Never release from a failing state.
- Tags must use the `v` prefix (e.g., `v2.5.0`).
- Tags are applied to the `main` branch only.
- If `npm publish` is applicable for this project, the `.github/workflows/release.yml` workflow handles it automatically on tag push.
