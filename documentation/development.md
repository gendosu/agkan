# Development

## Developer Setup

For contributors and developers who want to work on agkan itself:

1. Clone the repository:
```bash
git clone https://github.com/gendosu/agkan.git
cd agkan
```

2. Install dependencies:
```bash
pnpm install
```

3. Build the TypeScript code:
```bash
pnpm run build
```

4. Register as a global command:
```bash
pnpm link --global
```

## Development Guidelines

For comprehensive development information, see the following documentation:

- **[TESTING.md](TESTING.md)** - Testing guide, coverage execution, and test patterns
- **[CONTRIBUTING.md](../CONTRIBUTING.md)** - Contribution guidelines and TDD practices
- **[TDD-GUIDE.md](TDD-GUIDE.md)** - Test-Driven Development guide with practical examples
- **[ARCHITECTURE.md](ARCHITECTURE.md)** - Project architecture and design patterns

## Code Quality

This project uses ESLint and Prettier for code quality:

```bash
pnpm run lint        # Check code
pnpm run lint:fix    # Auto-fix issues
pnpm run format      # Format code
pnpm run check       # Run all checks
```

## Testing

For full testing documentation, see **[TESTING.md](TESTING.md)**.

Quick commands:
```bash
pnpm test          # Run unit tests
pnpm run test:e2e  # Run end-to-end tests
```

## Build

```bash
pnpm run build
```

## Auto-build During Development

```bash
pnpm run dev
```

## TypeScript Type Checking

```bash
npx tsc --noEmit
```

## Initialize Database

The database is automatically created on first command execution. To manually recreate:

```bash
rm -rf data/agkan.db
agkan task list  # Database will be recreated
```
