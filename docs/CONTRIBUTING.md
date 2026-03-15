# Contributing

## Dev Setup

```bash
# Clone and install
git clone https://github.com/uehlbran/pokemon-lib.git
cd pokemon-lib
npm install

# Build all packages
npm run build

# Run all tests
npm run test

# Type check
npm run typecheck
```

**Requires**: Node 20+, npm 10+

## Running Tests

```bash
# All packages
npm run test

# Single package (from package directory)
cd packages/core && npx vitest run

# With coverage
npx vitest run --coverage

# Specific test file
npx vitest run src/__tests__/stat-calc.test.ts

# Tests matching a pattern
npx vitest run -t "damage calculation"
```

**Coverage threshold**: 80% (lines, branches, functions, statements). CI will fail below this.

## Code Style

**Biome** handles all formatting and linting. Do not use ESLint or Prettier.

```bash
# Check and auto-fix
npx @biomejs/biome check --write .
```

Key conventions:
- Indent: 2 spaces
- Line width: 100
- No semicolons (Biome default)
- Organize imports enabled
- Lowercase string literals for types: `'fire'`, `'physical'`, `'paralysis'`
- Readonly interfaces for data, mutable only where needed
- Discriminated unions over class hierarchies

## Test Requirements

- **80% coverage** minimum (lines, branches, functions, statements)
- **AAA pattern**: Arrange, Act, Assert — clearly separated sections
- **Descriptive names**: `it('should calculate correct HP given level 50 Charizard with max IVs when using Gen 3 formula')`
- **Known values**: Test against Bulbapedia/Showdown data, not invented numbers
- **Gen quirks**: Every generation-specific mechanic gets a dedicated test
- **Property-based tests**: For formulas (stats always positive, type effectiveness in valid set)
- **Determinism**: Same PRNG seed = same results, always

## PR Process

1. Create a feature branch from `main`
2. Make changes, write tests
3. Ensure all checks pass: `npm run build && npm run test && npm run typecheck`
4. Run linting: `npx @biomejs/biome check --write .`
5. Push and create a PR

### PR Reviews

Every PR is reviewed by:
- **CodeRabbit** — automated inline comments, security scan
- **Qodo Merge** — structured review with severity ratings
- **Human reviewer** — required approval (1 reviewer minimum)

AI reviews are advisory only (comments, never approvals). Human approval is required to merge.

## Commit Messages

- Concise, descriptive messages focused on "why" not "what"
- Keep the first line under 72 characters
- Use imperative mood: "Add stat calculation" not "Added stat calculation"

## Package Dependencies

```
core (zero deps) ← battle ← genN
```

- **core** must never depend on any other package
- **battle** depends on core only
- **genN** depends on core + battle
- No circular dependencies, no cross-gen dependencies
