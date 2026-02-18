# Contributing to agkan

Thank you for your interest in contributing to this project.

## Development Environment Setup

### Requirements

- Node.js 18 or higher
- npm 9 or higher
- Git

### Setup Instructions

```bash
# Clone the repository
git clone https://github.com/gendosu/agkan.git
cd agkan

# Install dependencies
npm install

# Verify the build
npm run build

# Run tests
npm test
```

## Development Process

### Branch Strategy

- `main`: Stable branch for production
- `feature/*`: For new feature development
- `fix/*`: For bug fixes
- `refactor/*`: For refactoring

### Commit Convention

Follow [Conventional Commits](https://www.conventionalcommits.org/):

- `feat:` Add a new feature
- `fix:` Fix a bug
- `refactor:` Refactor code
- `test:` Add or update tests
- `docs:` Update documentation
- `chore:` Changes to build process or tools

Examples:
```
feat: add task priority feature
fix: resolve database connection issue
test: add unit tests for TaskService
```

## Test-Driven Development (TDD)

This project encourages **Test-Driven Development (TDD)**.

### The TDD Cycle

1. **Red**: Write a failing test first
2. **Green**: Implement the minimum code to make the test pass
3. **Refactor**: Improve the code

### TDD Commit Order

When practicing TDD, commit in the following order:

1. **test**: Commit the test code first
2. **feat/fix**: Commit the implementation code

Example:
```bash
# 1. Write the test first
git add tests/TaskService.test.ts
git commit -m "test: add test for new task priority feature"

# 2. Implement the feature
git add src/services/TaskService.ts
git commit -m "feat: implement task priority feature"
```

### TDD Detailed Guide

For detailed TDD practices, refer to [TDD-GUIDE.md](./TDD-GUIDE.md).

## Coding Standards

### Linter and Formatter

This project uses ESLint and Prettier.

```bash
# Format code
npm run format

# Check formatting
npm run format:check

# Run linter
npm run lint

# Auto-fix lint issues
npm run lint:fix

# Type check
npm run type-check
```

### Code Style

- Indentation: 2 spaces
- Semicolons: required
- Quotes: single quotes
- Trailing commas: required

## Testing

### Running Tests

```bash
# Run all tests
npm test

# Generate coverage report
npm run test -- --coverage

# Run E2E tests
./test-e2e.sh
```

### Writing Tests

- Unit tests: place in the `tests/` directory
- Test file naming: `*.test.ts`
- Coverage targets:
  - Line coverage: 80% or higher
  - Branch coverage: 80% or higher

For details, refer to [TESTING.md](./TESTING.md).

## CI/CD Pipeline

This project uses a CI/CD pipeline with GitHub Actions.

### Automated Checks

The following checks run automatically on pull requests and pushes to the main branch:

1. **Type Check**: TypeScript type checking
2. **Lint**: Code checking with ESLint
3. **Format Check**: Format checking with Prettier
4. **Test**: Run all tests
5. **Build**: Production build
6. **Coverage Check**: Fails if coverage is below 80%

### Pre-push Hook

Tests are automatically run when executing `git push`. If tests fail, the push is blocked.

```bash
# Normal push (tests are run)
git push

# Push skipping tests (use only in emergencies)
git push --no-verify
```

### Coverage Report

Coverage reports are saved as GitHub Actions artifacts.
They can be viewed from the Checks tab of a pull request.

## Pull Requests

### Before Submitting a Pull Request

1. Verify all tests pass
   ```bash
   npm test
   ```

2. Check linter and formatter
   ```bash
   npm run check
   ```

3. Verify the build succeeds
   ```bash
   npm run build
   ```

**Note**: The pre-push hook automatically runs tests before pushing.

### Pull Request Description

Include the following in your pull request:

- Summary of changes
- Related issue numbers
- Test additions/modifications
- Screenshots (for UI changes)

## Documentation

When making code changes, update the following documentation as needed:

- `README.md`: User-facing usage instructions
- `CHANGELOG.md`: Change history
- `TESTING.md`: How to run tests
- JSDoc in code: API specifications

## Questions and Discussions

If you have questions or want to discuss something, please create an Issue.

## License

By contributing to this project, you agree that your contributions will be
released under the same license as the project.

---

Thank you!
