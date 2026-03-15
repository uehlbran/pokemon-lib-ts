# Testing Guide

## Philosophy

Tests are the primary way we prove correctness. Pokemon battle mechanics are well-documented — if our implementation disagrees with Bulbapedia or Pokemon Showdown, our implementation is wrong.

## Test Framework

**Vitest** with v8 coverage provider. Configuration in each package's `vitest.config.ts`.

```bash
npx vitest run                    # Run all tests
npx vitest run --coverage         # With coverage report
npx vitest run -t "pattern"       # Tests matching pattern
npx vitest run src/__tests__/     # Specific directory
```

## Coverage Requirements

**80% minimum** across all metrics:
- Lines
- Branches
- Functions
- Statements

CI enforces these thresholds. PRs below 80% will fail checks.

## Test Types

### Unit Tests

Test individual functions in isolation. Most of the test suite.

```typescript
describe('calculateHP', () => {
  it('should return 153 given level 50 Charizard with 31 IVs and 252 EVs', () => {
    // Arrange
    const base = 78, iv = 31, ev = 252, level = 50

    // Act
    const result = calculateHP(base, iv, ev, level)

    // Assert
    expect(result).toBe(153)
  })
})
```

### Integration Tests

Test components working together. Used for battle engine + ruleset combinations.

```typescript
describe('Gen 1 Battle Integration', () => {
  it('should apply 1/256 miss bug given 100% accuracy move', () => {
    // Arrange — set up engine with Gen1Ruleset and seeded PRNG
    // Act — execute a 100% accuracy move with the unlucky seed
    // Assert — move misses despite 100% accuracy
  })
})
```

### Data Validation Tests

Verify imported data files have correct shapes and counts.

```typescript
describe('Gen 1 Pokemon Data', () => {
  it('should contain exactly 151 Pokemon', () => {
    const pokemon = loadPokemonData()
    expect(pokemon).toHaveLength(151)
  })
})
```

### Property-Based Tests

Verify invariants that must always hold, regardless of inputs.

```typescript
it('should always return a positive stat value given any valid inputs', () => {
  fc.assert(fc.property(
    fc.integer({ min: 1, max: 255 }),  // base
    fc.integer({ min: 0, max: 31 }),   // iv
    fc.integer({ min: 0, max: 252 }),  // ev
    fc.integer({ min: 1, max: 100 }),  // level
    (base, iv, ev, level) => {
      expect(calculateStat(base, iv, ev, level, 1.0)).toBeGreaterThan(0)
    }
  ))
})
```

### Replay Tests

Compare engine output against Pokemon Showdown battle logs. Used for end-to-end validation.

## AAA Pattern

Every test follows **Arrange, Act, Assert**:

```typescript
it('should [expected behavior] given [condition] when [action]', () => {
  // Arrange — set up test data and dependencies
  const pokemon = createTestPokemon({ species: 'Charizard', level: 50 })
  const move = createTestMove({ type: 'fire', power: 120 })

  // Act — perform the action being tested
  const damage = calculateDamage(pokemon, move, target)

  // Assert — verify the result
  expect(damage).toBe(expectedValue)
})
```

Keep sections visually separated with comments. One logical assertion per test (multiple `expect` calls are fine if they verify one behavior).

## Naming Convention

Use **Given/When/Then** in test names:

```
should [expected behavior] given [precondition] when [action]
```

Examples:
- `should return 153 HP given level 50 Charizard with max IVs when calculating HP`
- `should miss given 100% accuracy move when 1/256 roll triggers`
- `should divide crit rate by 4 given Focus Energy is active when calculating crit`

## Determinism

All battle tests must be deterministic. Use `SeededRandom` with known seeds:

```typescript
const rng = new SeededRandom(12345)
// Same seed always produces the same sequence
```

Never use `Math.random()` in tests or battle code.

## Authoritative Sources

When choosing expected values for tests:

1. **Pokemon Showdown** — primary source for battle mechanics
2. **Bulbapedia** — secondary source, especially for formulas and edge cases
3. **In-game testing** — for behaviors that Showdown and Bulbapedia disagree on
