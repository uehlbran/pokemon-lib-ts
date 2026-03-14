# Pokemon Fan Game — Testing Strategy

> What gets tested, priority levels, example test cases, and test helper functions.

---

## 13. Testing Strategy

### What Gets Tested

The battle engine is the #1 testing priority. It's where most bugs will occur and it's fully testable without Phaser.

| System | Test Type | Runner | Priority |
|--------|----------|--------|----------|
| Damage formula | Unit | Vitest | P0 |
| Type chart | Unit | Vitest | P0 |
| Stat calculation | Unit | Vitest | P0 |
| Status effects | Unit | Vitest | P0 |
| Turn order | Unit | Vitest | P0 |
| Full battle flow | Integration | Vitest | P0 |
| Ability triggers | Unit | Vitest | P1 |
| Weather/terrain | Unit | Vitest | P1 |
| Catch rate | Unit | Vitest | P1 |
| EXP calculation | Unit | Vitest | P1 |
| Data validation | Validation | Vitest | P0 |
| PRNG determinism | Unit | Vitest | P0 |
| Save/load | Unit | Vitest | P2 |

### Example Test Cases

```typescript
// tests/battle/DamageCalc.test.ts
describe('Gen 9 Damage Calculator', () => {
  it('should calculate correct base damage for Flamethrower', () => {
    // Known good values from Showdown damage calc or Bulbapedia
    const attacker = createTestPokemon({ species: 'charizard', level: 50, spAttack: 159 });
    const defender = createTestPokemon({ species: 'venusaur', level: 50, spDefense: 120 });
    const move = getMove('flamethrower');

    // Fix RNG for deterministic test
    seedRng(12345);

    const result = calculateDamage(attacker, defender, move, defaultBattleState, rng);

    // Flamethrower: 90 power, special, Fire vs Grass/Poison = 4x effective, STAB 1.5x
    expect(result.effectiveness).toBe(2); // Grass resists, Poison neutral = 2x? Actually Fire vs Grass = 2x, Fire vs Poison = 1x, so total = 2x
    expect(result.damage).toBeGreaterThan(0);
  });

  it('should apply burn reduction to physical moves', () => {
    const attacker = createTestPokemon({ status: 'burn' });
    const move = getMove('earthquake');
    const result1 = calculateDamage(attacker, defender, move, state, rng);

    attacker.status = null;
    seedRng(12345); // Same seed
    const result2 = calculateDamage(attacker, defender, move, state, rng);

    expect(result1.damage).toBeLessThan(result2.damage);
  });

  it('should not apply burn reduction with Guts ability', () => {
    // ...
  });
});

// tests/battle/TypeChart.test.ts
describe('Type Chart', () => {
  it('Fire should be super effective against Grass', () => {
    expect(getTypeEffectiveness('fire', 'grass')).toBe(2);
  });

  it('Normal should have no effect on Ghost', () => {
    expect(getTypeEffectiveness('normal', 'ghost')).toBe(0);
  });

  it('should handle dual types (Fire vs Grass/Poison = 2x)', () => {
    expect(getMultiTypeEffectiveness('fire', ['grass', 'poison'])).toBe(2);
  });

  it('should handle 4x weakness (Ice vs Dragon/Flying)', () => {
    expect(getMultiTypeEffectiveness('ice', ['dragon', 'flying'])).toBe(4);
  });
});
```

### Test Helpers

```typescript
// tests/helpers.ts
function createTestPokemon(overrides?: Partial<ActivePokemon>): ActivePokemon;
function createTestBattleState(overrides?: Partial<BattleState>): BattleState;
function createTestTrainer(party: PokemonInstance[]): Trainer;
function runBattleTurn(state: BattleState, playerAction: BattleAction, opponentAction: BattleAction): BattleEvent[];
```

---

