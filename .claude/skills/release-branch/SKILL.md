---
name: release-branch
description: Use when preparing a release branch - version bump, CHANGELOG update, build verification, and commit. Stops after commit and asks user to merge the branch.
---

# release-branch

## Overview

Prepares a release branch by bumping the version, updating CHANGELOG, verifying the build, and committing. Pauses after the commit and asks the user to merge the branch into main.

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
git add package.json package-lock.json CHANGELOG.md
git commit -m "chore: release v<NEW_VERSION>"
```

### 8. Push the branch and create a pull request

```bash
git push -u origin HEAD
```

Then create a pull request:

```
/pull-request
```

### 9. Ask user to merge the release branch

Ask the user to merge the release branch into main, then wait for confirmation before proceeding:

> "Please merge the release branch into main. Let me know when the merge is complete."

Pause and wait for the user to confirm that the merge is done before continuing.

Once the user confirms, suggest running `/release-tag` to complete the release.

---

## Important Notes

- Always run tests before releasing (step 2). Never release from a failing state.
- Use `--no-git-tag-version` with `npm version` to prevent npm from creating its own commit/tag — we handle that manually for full control.
- The `## [Unreleased]` section must always exist in CHANGELOG.md after release.
