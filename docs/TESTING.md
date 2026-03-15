# Testing Examples

Code examples for each test type used in this project. For testing philosophy, coverage thresholds, AAA pattern, naming conventions, and determinism requirements, see root `CLAUDE.md`.

## Unit Tests

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

## Integration Tests

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

## Data Validation Tests

Verify imported data files have correct shapes and counts.

```typescript
describe('Gen 1 Pokemon Data', () => {
  it('should contain exactly 151 Pokemon', () => {
    const pokemon = loadPokemonData()
    expect(pokemon).toHaveLength(151)
  })
})
```

## Property-Based Tests

Verify invariants that must always hold, regardless of inputs. Requires [fast-check](https://github.com/dubzzz/fast-check) (`npm install -D fast-check`).

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

## Replay Tests

Compare engine output against Pokemon Showdown battle logs. Used for end-to-end validation.

## Authoritative Sources

When choosing expected values for tests:

1. **Pokemon Showdown** — primary source for battle mechanics
2. **Bulbapedia** — secondary source, especially for formulas and edge cases
3. **In-game testing** — for behaviors that Showdown and Bulbapedia disagree on
