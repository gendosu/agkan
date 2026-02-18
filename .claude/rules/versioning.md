---
paths: **/*
---
# Versioning Rules

## 1. Semantic Versioning

We follow semantic versioning (MAJOR.MINOR.PATCH) for all our releases:
- **MAJOR** version when you make incompatible API changes
- **MINOR** version when you add functionality in a backward-compatible manner
- **PATCH** version when you make backward-compatible bug fixes

### Version Bump Examples

#### MAJOR (Breaking Changes)
- Removing or renaming CLI commands
- Changing command argument structure
- Removing or changing configuration file format
- Changing database schema in a non-backward-compatible way
- Removing public APIs or changing their signatures

#### MINOR (New Features)
- Adding new CLI commands or subcommands
- Adding new options to existing commands (backward-compatible)
- Adding new features without breaking existing functionality
- Adding new APIs or extending existing ones
- Enhancing output format while maintaining compatibility

#### PATCH (Bug Fixes)
- Fixing bugs without changing functionality
- Fixing typos in output messages
- Performance improvements
- Documentation updates
- Dependency updates (without breaking changes)

## 2. Release Process

### Before Release
1. **Run Tests**: Ensure all tests pass
   ```bash
   npm test
   ```

2. **Build**: Create a production build
   ```bash
   npm run build
   ```

3. **Update Version**: Update version in `package.json`
   - Manually edit `package.json`
   - Or use npm version command:
     ```bash
     npm version patch|minor|major
     ```

4. **Update CHANGELOG**: Document changes in `CHANGELOG.md`
   - See CHANGELOG section below for format

5. **Commit Changes**: Commit version bump and CHANGELOG
   ```bash
   git add package.json CHANGELOG.md
   git commit -m "chore: release v1.2.0"
   ```

6. **Create Git Tag**: Tag the release
   ```bash
   git tag -a v1.2.0 -m "Release v1.2.0"
   ```

7. **Push**: Push commits and tags
   ```bash
   git push origin main
   git push origin v1.2.0
   ```

### After Release
1. **Build Package**: Create distributable package
   ```bash
   npm pack
   ```

2. **Test Installation**: Test the package locally
   ```bash
   npm install -g .
   agkan --version
   ```

3. **Publish** (if applicable): Publish to npm registry
   ```bash
   npm publish
   ```

## 3. CHANGELOG Management

### File Location
- `CHANGELOG.md` in the project root

### Format
Follow [Keep a Changelog](https://keepachangelog.com/) format:

```markdown
# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added
- New features that are not yet released

### Changed
- Changes in existing functionality

### Deprecated
- Soon-to-be removed features

### Removed
- Removed features

### Fixed
- Bug fixes

### Security
- Security fixes

## [1.2.0] - YYYY-MM-DD

### Added
- Add `task count` command to show task count by status
- Add `-s` option to `task count` command to filter by specific status

### Fixed
- Fix database path resolution in test reset function

## [1.1.0] - 2026-02-14

### Added
- Add configurable database path via `.agkan.yml`

### Changed
- Change default database location to `.agkan/data.db`

## [1.0.0] - YYYY-MM-DD

### Added
- Initial release
- Basic task management (add, list, get, update, delete)
- Status management (backlog, ready, in_progress, done, closed)
```

### Update Rules
1. **Always update CHANGELOG** before releasing a new version
2. **Group changes by category**: Added, Changed, Deprecated, Removed, Fixed, Security
3. **Write user-facing descriptions**: Focus on what users will experience, not implementation details
4. **Include issue/PR references** when applicable: `(#123)`
5. **Move Unreleased to version section** when releasing:
   - Change `## [Unreleased]` to `## [X.Y.Z] - YYYY-MM-DD`
   - Add new `## [Unreleased]` section at the top

### Example Workflow
```bash
# 1. Make changes and commit
git commit -m "feat: add new feature"

# 2. Update CHANGELOG.md (add to Unreleased section)
# Edit CHANGELOG.md manually

# 3. When ready to release
npm version minor  # This updates package.json

# 4. Update CHANGELOG.md (move Unreleased to new version)
# Edit CHANGELOG.md: change [Unreleased] to [1.2.0] - 2026-02-14

# 5. Commit and tag
git add package.json CHANGELOG.md
git commit -m "chore: release v1.2.0"
git tag -a v1.2.0 -m "Release v1.2.0"

# 6. Push
git push origin main --tags
```

## 4. Best Practices

1. **Never skip versions**: Always increment from the current version
2. **Test before releasing**: Run full test suite and manual tests
3. **Document breaking changes**: Clearly note breaking changes in CHANGELOG
4. **Consistent tagging**: Always use `v` prefix for git tags (e.g., `v1.2.0`)
5. **Keep CHANGELOG updated**: Update CHANGELOG with each significant change, not just at release time
