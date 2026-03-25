# Testing Examples

Code examples for the test types used in this project. For testing philosophy, coverage thresholds, AAA pattern, naming conventions, determinism requirements, and TDD policy, see root `CLAUDE.md`.

## Hard Rules

- Tests are written first. TDD is mandatory for every behavior change.
- Use Given/When/Then test names.
- Use exact assertions for formulas and data validation.
- Do not use weak formula assertions such as `toBeTruthy()`, `toBeDefined()`, or `toBeGreaterThan(0)`.

## Unit Tests

Test individual functions in isolation. Most of the test suite.

```typescript
describe("calculateHp", () => {
  it("given a level 50 Charizard with 31 IVs and 252 EVs, when HP is calculated, then returns 153", () => {
    // Arrange
    const base = 78
    const iv = 31
    const ev = 252
    const level = 50

    // Act
    const result = calculateHp(base, iv, ev, level)

    // Assert
    expect(result).toBe(153)
  })
})
```

## Integration Tests

Test components working together. Used for battle engine plus ruleset combinations.

```typescript
describe("Gen 1 battle integration", () => {
  it("given a 100% accurate move and the Gen 1 miss-bug seed, when the turn resolves, then the move misses", () => {
    // Arrange: set up the engine with Gen1Ruleset and a seeded PRNG

    // Act: execute the move

    // Assert: the battle events include a miss even though the move is 100% accurate
  })
})
```

## Data Validation Tests

Verify imported data files have correct shapes and counts.

```typescript
describe("Gen 1 Pokemon data", () => {
  it("given the Gen 1 species data, when it is loaded, then it contains exactly 151 Pokemon", () => {
    const pokemon = loadPokemonData()
    expect(pokemon).toHaveLength(151)
  })
})
```

## Property-Based Tests

Verify invariants that must always hold, regardless of inputs. Requires [fast-check](https://github.com/dubzzz/fast-check).

```typescript
it("given valid type-chart inputs, when calculateTypeEffectiveness runs, then the result is one of the allowed multipliers", () => {
  fc.assert(
    fc.property(
      fc.constantFrom("normal", "fire", "water", "electric"),
      fc.constantFrom("grass", "ground", "flying", "ghost"),
      (attackingType, defendingType) => {
        const effectiveness = calculateTypeEffectiveness(attackingType, defendingType)
        expect([0, 0.25, 0.5, 1, 2, 4]).toContain(effectiveness)
      },
    ),
  )
})
```

## Replay Tests

Compare engine output against Pokemon Showdown battle logs. Use these for end-to-end validation and deterministic regression coverage.

## Authoritative Sources

When choosing expected values for tests:

1. **Pokemon Showdown** - primary source for battle mechanics
2. **Bulbapedia** - secondary source, especially for formulas and edge cases
3. **In-game testing** - for behaviors that Showdown and Bulbapedia disagree on
