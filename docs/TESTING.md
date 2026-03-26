# Testing Guide

Examples and conventions for writing tests in this repo. For testing philosophy,
source authority, and repo-wide rules, see root `CLAUDE.md`.

## Core Rules

- Use Given/When/Then naming.
- Prefer exact assertions over proxy assertions.
- Use canonical generation data by default.
- Use explicit synthetic builders only when the scenario must diverge from real data.
- Add a source or derivation comment for non-trivial expected numeric values.

## Canonical vs Synthetic Fixtures

Use the owning generation data manager for canonical records:

```typescript
const dataManager = createGen7DataManager()
const moveIds = GEN7_MOVE_IDS

const thunderbolt = dataManager.getMove(moveIds.thunderbolt)
```

Use an explicit synthetic builder only when the test intentionally diverges from
 canonical data:

```typescript
const syntheticThunderbolt = createSyntheticMoveFrom(
  dataManager.getMove(moveIds.thunderbolt),
  { power: 120 },
)
```

Do not use ambiguous helpers that hide whether a fixture is canonical or synthetic.

## Unit Tests

Pure logic should use exact value assertions with provenance:

```typescript
describe("calculateHP", () => {
  it("given a level 50 Charizard with 31 HP IVs and 252 HP EVs, when HP is calculated, then it returns 153", () => {
    // Source: floor(((2*78 + 31 + floor(252/4)) * 50) / 100) + 50 + 10 = 153
    const result = calculateHP(78, 31, 252, 50)

    expect(result).toBe(153)
  })
})
```

## Stateful and Integration Tests

Stateful code should assert the state or emitted event that proves the behavior,
 not a weak proxy:

```typescript
describe("run action", () => {
  it("given a trainer battle, when run is submitted, then the trainer-battle message is emitted and no flee-attempt occurs", () => {
    const { engine, events } = createWildBattleEngine({ isWildBattle: false })
    engine.start()

    engine.submitAction(0, { type: "run", side: 0 })
    engine.submitAction(1, { type: "move", side: 1, moveIndex: 0 })

    expect(events.find((event) => event.type === "flee-attempt")).toBeUndefined()
    expect(events).toContainEqual({
      type: "message",
      text: "Can't run from a trainer battle!",
    })
  })
})
```

Exact text assertions are allowed only when the user-facing text itself is the
 contract under test.

## Property-Based Tests

Property tests should still use strong assertions:

```typescript
it("given valid stat inputs, when HP is calculated, then the result is always at least 1", () => {
  fc.assert(fc.property(
    fc.integer({ min: 1, max: 255 }),
    fc.integer({ min: 0, max: 31 }),
    fc.integer({ min: 0, max: 252 }),
    fc.integer({ min: 1, max: 100 }),
    (base, iv, ev, level) => {
      expect(calculateHP(base, iv, ev, level)).toBeGreaterThanOrEqual(1)
    }
  ))
})
```

## Bounded Inputs

When helpers exist for bounded inputs, use them instead of raw object literals:

```typescript
const ivs = createIvs({ speed: 0 })
const evs = createEvs({ hp: 4, spAttack: 252, speed: 252 })
const dvs = createDvs({ attack: 15, defense: 15, speed: 15, spAttack: 15 })
const statExp = createStatExp({ spAttack: MAX_STAT_EXP })
```

## Generation Validity

Tests must only use entities and mechanics that exist in the generation under
 test unless the scenario is explicitly cross-gen.

Examples:

- Do not use Dark type in Gen 1 tests.
- Do not use abilities in Gen 1 tests.
- Do not use Mega Evolution in pre-Gen 6 tests.

## Authoritative Sources

When choosing expected values for tests:

1. Use the source hierarchy in root `CLAUDE.md`.
2. Prefer ground-truth docs in `specs/reference/` when present.
3. Cite Bulbapedia, pret, Showdown, or an inline derivation for non-trivial values.
