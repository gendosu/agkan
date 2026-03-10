---
name: release
description: Use when performing a release to automate the full release flow - versioning, CHANGELOG update, git tagging, and deploy trigger via push.
---

# release

## Overview

Automates the complete release workflow: version bump, CHANGELOG update, git tag creation, and deploy trigger (push to remote). Eliminates manual steps and standardizes the release process end-to-end.

---

## Workflow

### 1. Confirm you are on main and up-to-date

```bash
git checkout main && git pull -p
```

### 2. Confirm all tests pass

```bash
npm run test:all
```

If tests fail, abort the release and fix the issues first.

### 3. Determine the version bump type

Inspect commits since the last tag to determine whether to bump MAJOR, MINOR, or PATCH.

```bash
# Get last tag
git describe --tags --abbrev=0

# List commits since last tag
git log <last-tag>..HEAD --oneline
```

Apply semantic versioning rules (from `.claude/rules/versioning.md`):

| Bump | When |
|------|------|
| MAJOR | Breaking changes (renamed/removed commands, incompatible config changes) |
| MINOR | New features, new commands, new options (backward-compatible) |
| PATCH | Bug fixes, docs, dependency updates |

### 4. Bump version in package.json

```bash
# Choose one based on step 3:
npm version patch --no-git-tag-version
npm version minor --no-git-tag-version
npm version major --no-git-tag-version
```

Read the new version:

```bash
node -p "require('./package.json').version"
# Example output: 2.5.0
NEW_VERSION=<version>
```

### 5. Update CHANGELOG.md

Edit `CHANGELOG.md`:

1. Change `## [Unreleased]` to `## [<NEW_VERSION>] - <TODAY_DATE>` (e.g., `## [2.5.0] - 2026-03-10`)
2. Add a new `## [Unreleased]` section at the top (empty)

The format follows [Keep a Changelog](https://keepachangelog.com/en/1.0.0/):

```markdown
## [Unreleased]

## [2.5.0] - 2026-03-10

### Added
- ...

### Fixed
- ...
```

### 6. Build and verify

```bash
npm run build
```

### 7. Commit version bump and CHANGELOG

```bash
git add package.json CHANGELOG.md
git commit -m "chore: release v<NEW_VERSION>"
```

### 8. Create git tag

```bash
git tag -a v<NEW_VERSION> -m "Release v<NEW_VERSION>"
```

### 9. Push commits and tag (deploy trigger)

```bash
git push origin main
git push origin v<NEW_VERSION>
```

Pushing the tag triggers the `.github/workflows/release.yml` workflow which runs the full release pipeline (build, publish).

---

## Important Notes

- Always run tests before releasing (step 2). Never release from a failing state.
- Use `--no-git-tag-version` with `npm version` to prevent npm from creating its own commit/tag — we handle that manually for full control.
- The `## [Unreleased]` section must always exist in CHANGELOG.md after release.
- Tags must use the `v` prefix (e.g., `v2.5.0`).
- Tags are applied to the `main` branch only.
- If `npm publish` is applicable for this project, the `.github/workflows/release.yml` workflow handles it automatically on tag push.
