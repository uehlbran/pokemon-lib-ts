# Test Integrity

## TDD is mandatory: Red, Green, Refactor

1. **Red**: Write a failing test that defines the expected behavior
2. **Green**: Write the minimum implementation to make it pass
3. **Refactor**: Clean up without changing behavior

## Existing test assertions are protected

When an implementation change causes existing tests to fail:
- The failure is a SIGNAL that you may be breaking a contract
- Read the failing test to understand what behavior it protects
- If the test is correct: fix the implementation, not the test
- If the test is genuinely wrong: document WHY before changing it
- NEVER silently rewrite assertions to match new implementation

## Tests must verify behavior through the engine, not handler return values

For every MoveEffectResult field the engine processes, there must be at least
one integration test that:
1. Executes through BattleEngine (not calling executeMoveEffect directly)
2. Verifies events are emitted
3. Verifies final state is correct

Handler unit tests provide fast feedback but CANNOT verify engine contracts.

## Source verification before writing test expectations

Every hardcoded expected value must be verified against the authoritative source
for that generation before writing the assertion. See source-verification.md for
the per-generation source authority hierarchy.

## Assume you are wrong until proven correct

Before implementing any change:
1. Write the test that defines correct behavior
2. Verify the test fails without your change (Red)
3. Make the minimum change to pass (Green)
4. If existing tests break, your change is probably wrong

## Never

- Modify test assertions to make a failing test pass without documenting why
- Write implementation before tests
- Treat passing handler unit tests as proof that engine contracts are honored
- Skip the Red phase
