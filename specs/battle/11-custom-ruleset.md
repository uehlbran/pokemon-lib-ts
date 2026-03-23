# Custom Ruleset System

## Overview

`CustomRuleset` is a configuration-driven wrapper class that lives in `@pokemon-lib-ts/battle`. It wraps any existing gen's `GenerationRuleset` and overrides specific behaviors — gimmick availability and use policy, ban lists, competitive clauses, and mechanical subsystem swaps. The result implements `GenerationRuleset` and plugs directly into `BattleEngine` unchanged.

This is the foundation for TPPC custom battle formats, Battle Tower rulesets, and any consumer that wants to run a non-standard format.

## Design Decisions

Three design patterns were evaluated before settling on this approach. See the decision log at the end of this document.

## Consumer API

```typescript
import { CustomRuleset } from '@pokemon-lib-ts/battle';
import { Gen9Ruleset } from '@pokemon-lib-ts/gen9';
import { Gen7MegaEvolution } from '@pokemon-lib-ts/gen7';

// Minimal: just ban some items
const ruleset = new CustomRuleset({
  base: new Gen9Ruleset(dataManager),
  bans: { items: ['soul-dew', 'kings-rock'] },
});

// Full: mix gimmicks + clauses + bans + mechanic overrides
const ruleset = new CustomRuleset({
  base: new Gen9Ruleset(dataManager),
  name: 'TPPC Battle Tower',
  gimmicks: {
    available: {
      tera: true,                    // use Gen 9's Terastallization as-is
      mega: new Gen7MegaEvolution(), // bring in Gen 7's Mega Evolution
    },
    usePolicy: 'one-per-type',       // each gimmick type can be used once per side
  },
  bans: {
    species: ['arceus', 'mewtwo'],
    items: ['soul-dew'],
    moves: ['double-team', 'minimize'],
    abilities: ['moody'],
  },
  clauses: [
    { type: 'sleep', maxPerSide: 1 },
    { type: 'species' },
    { type: 'item' },
    { type: 'level-cap', maxLevel: 50 },
    { type: 'evasion' },
  ],
  mechanics: {
    leafOverrides: {
      critMultiplier: 2.0,     // restore Gen 5 crit damage
    },
  },
});

// Validate teams before battle start
const p1Result = ruleset.validateTeam(team1);
const p2Result = ruleset.validateTeam(team2);
if (!p1Result.valid || !p2Result.valid) { /* handle */ }

// Drop into BattleEngine exactly like any other ruleset
const engine = new BattleEngine(config, ruleset, dataManager);
engine.start();
```

## Configuration Types

### `CustomRulesetConfig`

```typescript
interface CustomRulesetConfig {
  /** The base generation ruleset. All unmodified behavior delegates here. */
  readonly base: GenerationRuleset;
  /** Override the generation identifier (e.g., for display). Defaults to base.generation. */
  readonly generation?: Generation;
  /** Override the ruleset name. Defaults to `"Custom (${base.name})"`. */
  readonly name?: string;
  /** Gimmick availability and use policy. If omitted, uses base ruleset's gimmicks unchanged. */
  readonly gimmicks?: GimmickConfig;
  /** Ban list. Enforced at team validation and at runtime. */
  readonly bans?: BanListConfig;
  /** Active competitive clauses. Enforced at team validation and during battle. */
  readonly clauses?: readonly ClauseConfig[];
  /** Mechanical subsystem overrides. */
  readonly mechanics?: MechanicOverrides;
}
```

### `GimmickConfig`

```typescript
type GimmickUsePolicy =
  | 'one-per-battle'  // One total gimmick activation per side (default)
  | 'one-per-type'    // Each gimmick type can be used once per side (Gen 7 model)
  | 'unlimited';      // No usage restrictions

interface GimmickConfig {
  /**
   * Which gimmicks are enabled and which implementations to use.
   *   true         → use the base ruleset's implementation for this type
   *   BattleGimmick → use this custom implementation
   *   omitted key  → gimmick is disabled
   */
  readonly available: Partial<Record<BattleGimmickType, true | BattleGimmick>>;
  /** Default: 'one-per-battle'. */
  readonly usePolicy?: GimmickUsePolicy;
  /**
   * Whether a single Pokemon can accumulate multiple gimmick transformations
   * (e.g., Mega Evolve AND Terastallize the same Pokemon). Default: false.
   */
  readonly allowStacking?: boolean;
}
```

#### Forward-Only Gimmick Constraint

Gimmicks can only be enabled on base rulesets from their introduction generation or later. The `CustomRuleset` constructor validates this using each `BattleGimmick`'s `generations` field:

| Gimmick | Minimum Base Gen |
|---------|-----------------|
| Mega Evolution | Gen 6+ |
| Z-Moves | Gen 7+ |
| Dynamax/Gigantamax | Gen 8+ |
| Terastallization | Gen 9+ |

Attempting to enable a gimmick on a base gen that predates it (e.g., Mega Evolution on a Gen 3 base) throws a construction-time error. This ensures the base ruleset has the required infrastructure (abilities, held items, stat recalc, type chart) that gimmicks depend on.

#### Gimmick Portability

All gimmick implementations were analyzed for cross-gen portability:

| Gimmick | Portability | Notes |
|---------|------------|-------|
| `Gen6MegaEvolution` | High | Self-contained `MEGA_STONE_DATA`, uses core `calculateStat` (identical Gen 3-9), no gen-specific damage/type references |
| `Gen7MegaEvolution` | High | Same as Gen 6 + Rayquaza. Already uses internal `usedBySide` tracking, compatible with multi-gimmick scenarios |
| `Gen7ZMove` | High | Self-contained power tables (`Z_MOVE_NAMES`, `SPECIES_Z_BASE_MOVES`), `modifyMove` only touches `MoveData` fields |
| `Gen8Dynamax` | Medium | Self-contained HP scaling and Max Move conversion. Cross-cutting: engine has hardcoded `isDynamaxed` Choice lock check; anti-Dynamax moves live in `Gen8DamageCalc` |
| `Gen9Terastallization` | High (gimmick) / Low (STAB) | Gimmick class is self-contained. However `calculateTeraStab` is consumed by `Gen9DamageCalc` — any non-Gen-9 base using Tera must integrate STAB calculation into its damage calc |

**Gimmick behavior follows home gen rules.** Gimmick implementations carry their own data tables (`MEGA_STONE_DATA`, `Z_MOVE_NAMES`, `SPECIES_Z_BASE_MOVES`, Max Move power tables, etc.). No cross-gen data merging is needed. Cross-cutting concerns (Tera STAB, anti-Dynamax moves) are handled by the base gen's damage calc hooks.

#### Use Policy Implementation

`CustomRuleset` wraps each enabled `BattleGimmick` in a `PolicyWrappedGimmick` (internal class) that intercepts `canUse()` and `activate()` to enforce the configured policy. This requires zero engine changes.

`PolicyWrappedGimmick` uses internal `usedBySide: Set<0 | 1>` tracking (same pattern as Gen 7's dual-gimmick implementation) and conditionally manages `BattleSide.gimmickUsed` for backward compatibility.

Policy behavior:
- `'one-per-battle'`: any gimmick activation marks all gimmick types as used for that side
- `'one-per-type'`: activation marks only the activated gimmick type as used
- `'unlimited'`: no usage tracking, `canUse()` only checks the gimmick's own preconditions

### `BanListConfig`

```typescript
interface BanListConfig {
  readonly items?: readonly string[];
  readonly moves?: readonly string[];
  readonly species?: readonly string[];
  readonly abilities?: readonly string[];
}
```

Ban list IDs use the same string format as the gen data files (lowercase hyphenated, e.g., `'soul-dew'`, `'double-team'`, `'arceus'`).

**Enforcement:**
- **Pre-battle** (team validation): `CustomRuleset.validatePokemon()` extends the base gen's validation to check species, ability, item, and move bans.
- **Runtime** (during battle): Move bans enforced via `checkMoveRestriction?()` hook (see Engine Changes below).

### `ClauseConfig`

```typescript
type ClauseConfig =
  | { readonly type: 'sleep'; readonly maxPerSide: number }
  | { readonly type: 'species' }
  | { readonly type: 'item' }
  | { readonly type: 'level-cap'; readonly maxLevel: number }
  | { readonly type: 'evasion' }
  | { readonly type: 'ohko' }
  | { readonly type: 'endless-battle' }
  | {
      readonly type: 'custom';
      readonly id: string;
      /** Runs at team validation time. */
      readonly validate?: (teams: [PokemonInstance[], PokemonInstance[]]) => ValidationResult;
      /** Runs during battle. */
      readonly enforce?: ClauseEnforcer;
    };

interface ClauseEnforcer {
  /** Called when checking if an action can be submitted. Return false to reject. */
  canSubmitAction?(action: BattleAction, state: BattleState): { allowed: boolean; reason?: string };
  /** Called before move execution. Return false to block the move. */
  canExecuteMove?(actor: ActivePokemon, move: MoveData, state: BattleState): { allowed: boolean; reason?: string };
}
```

**Built-in clause behavior:**

| Clause | Pre-battle | In-battle |
|--------|-----------|----------|
| `sleep` | — | Block sleep-inflicting moves when `maxPerSide` Pokemon already asleep on target's side |
| `species` | No duplicate species on a team | — |
| `item` | No duplicate held items on a team | — |
| `level-cap` | Reject Pokemon above `maxLevel` | — |
| `evasion` | — | Block moves that unconditionally boost evasion (Double Team, Minimize) |
| `ohko` | — | Block OHKO moves (Fissure, Guillotine, Horn Drill, Sheer Cold) |
| `endless-battle` | — | Future: detect and terminate infinite loops |
| `custom` | `validate()` callback | `enforce` callbacks |

### `MechanicOverrides`

```typescript
interface MechanicOverrides {
  /**
   * Swap entire subsystems from another gen's ruleset.
   * All methods belonging to that sub-interface are sourced from the provided ruleset instance.
   * That instance's private state and `this` context are preserved.
   */
  readonly subsystems?: Partial<Record<SubsystemName, GenerationRuleset>>;
  /**
   * Declarative overrides for individual leaf methods.
   * These are methods with no internal `this` dependencies or `super` calls —
   * safe to override as pure values.
   */
  readonly leafOverrides?: LeafOverrides;
}

interface LeafOverrides {
  /** Crit damage multiplier. Gen 3-5: 2.0. Gen 6+: 1.5. */
  readonly critMultiplier?: number;
  /** Sleep duration range [min, max] inclusive turns. */
  readonly sleepTurns?: [min: number, max: number];
  /** Burn damage as 1/N of max HP per turn. Gen 1-5: 8 (1/8). Gen 6+: 16 (1/16). */
  readonly burnDamageFraction?: number;
  /** Confusion self-hit chance. Gen 1-6: 0.5. Gen 7+: 0.33. */
  readonly confusionSelfHitChance?: number;
  /** Protect success decay formula. Default: 'halving' (Gen 3+). */
  readonly protectStaling?: 'halving' | 'thirding' | 'none';
}

type SubsystemName =
  | 'typeSystem'
  | 'statCalculator'
  | 'damageSystem'
  | 'criticalHitSystem'
  | 'turnOrderSystem'
  | 'moveSystem'
  | 'statusSystem'
  | 'abilitySystem'
  | 'itemSystem'
  | 'bagItemSystem'
  | 'weatherSystem'
  | 'terrainSystem'
  | 'hazardSystem'
  | 'switchSystem'
  | 'fleeSystem'
  | 'catchSystem'
  | 'endOfTurnSystem'
  | 'validationSystem';
```

#### Subsystem Swap Safety

**Do not mix methods within a subsystem across different gen instances.** Several subsystems have private state that binds their methods together:
- `TurnOrderSystem`: `Gen5Ruleset._currentWeather` is set in `resolveTurnOrder` and read in `getEffectiveSpeed`. Splitting these methods across instances breaks Chlorophyll/Swift Swim speed doubling silently.
- `SwitchSystem`: `Gen9Ruleset._pendingShedTailSub` is set in `onSwitchOut` and read in `onSwitchIn`. Splitting breaks Shed Tail.

Subsystem-level swaps are safe because all methods in a subsystem stay on the same instance, preserving private state and `super` chain.

**High-value subsystem swaps:**
- `damageSystem` — use Gen 5's damage formula with Gen 9's everything else
- `typeSystem` — use a custom type chart (add/remove types, change effectiveness)
- `criticalHitSystem` — change crit frequency and multiplier together
- `statusSystem` — change status damage rates and duration tables
- `endOfTurnSystem` — change end-of-turn ordering and Protect staling

**Construction-time diagnostics:** The constructor warns about known-dangerous subsystem swaps, e.g., swapping `typeSystem` from a pre-Gen-6 ruleset onto a Gen 6+ base causes Fairy-type moves to produce undefined behavior.

## Team Validation

`CustomRuleset` adds a `validateTeam()` method (not part of `GenerationRuleset`) for team-level cross-Pokemon checks:

```typescript
class CustomRuleset implements GenerationRuleset {
  /** Per-Pokemon validation including ban checks. */
  validatePokemon(pokemon: PokemonInstance, species: PokemonSpeciesData): ValidationResult;

  /** Team-level validation for clauses that span multiple Pokemon. */
  validateTeam(team: PokemonInstance[]): ValidationResult;
}
```

`validateTeam` checks: Species Clause (no duplicate species IDs), Item Clause (no duplicate held items), Level Cap (all Pokemon below `maxLevel`), and any `custom` clause `validate` callbacks.

## `CustomRuleset` Class Sketch

```typescript
class CustomRuleset implements GenerationRuleset {
  readonly generation: Generation;
  readonly name: string;
  /** The resolved, frozen config. Readable at runtime for debugging/serialization. */
  readonly config: Readonly<CustomRulesetConfig>;

  constructor(config: CustomRulesetConfig) { ... }

  // INTERCEPTED: gimmick dispatch with policy wrapping
  getBattleGimmick(type: BattleGimmickType): BattleGimmick | null { ... }

  // INTERCEPTED: per-Pokemon validation with ban checks
  validatePokemon(pokemon: PokemonInstance, species: PokemonSpeciesData): ValidationResult { ... }

  // NEW: team-level validation for clauses
  validateTeam(team: PokemonInstance[]): ValidationResult { ... }

  // INTERCEPTED: move restriction hook (bans + clause enforcers)
  checkMoveRestriction?(actor: ActivePokemon, move: MoveData, state: BattleState):
    { allowed: boolean; reason?: string } | undefined { ... }

  // ALL OTHER METHODS: delegate to base (or subsystem override source)
  getTypeChart() { return this._resolveSubsystem('typeSystem').getTypeChart(); }
  calculateDamage(ctx) { return this._resolveSubsystem('damageSystem').calculateDamage(ctx); }
  // ... all ~55 remaining GenerationRuleset methods
}
```

Delegation for subsystem overrides:
```typescript
private _resolveSubsystem(name: SubsystemName): GenerationRuleset {
  return this._subsystemOverrides.get(name) ?? this.config.base;
}
```

## Engine Changes Required

### 1. `checkMoveRestriction?()` hook on `GenerationRuleset`

Add to `MoveSystem` sub-interface in `GenerationRuleset.ts`:

```typescript
/** Optional: called to check if a move is restricted under the active format rules.
 *  Return undefined (or omit the method) to allow all moves.
 *  Used by CustomRuleset to enforce ban lists and clause enforcers. */
checkMoveRestriction?(
  actor: ActivePokemon,
  move: MoveData,
  state: BattleState,
): { readonly allowed: boolean; readonly reason?: string } | undefined;
```

Add default no-op to `BaseRuleset`:
```typescript
checkMoveRestriction?() { return undefined; }
```

`BattleEngine` calls this in two places:
1. `getAvailableMoves()` — to filter moves at action selection time
2. `canExecuteMove()` — as a final check before execution (catches mid-turn restrictions)

### 2. No other engine changes

`BattleConfig` stays unchanged. The Dynamax `!actor.isDynamaxed` Choice lock check at `BattleEngine.ts:1152` is left as-is — it is harmless when Dynamax is disabled (flag is always false) and correct when Dynamax is enabled.

## File Locations

All new code in `packages/battle/src/`:

| File | Changes |
|------|---------|
| `ruleset/CustomRuleset.ts` | New file: `CustomRuleset` class + `PolicyWrappedGimmick` internal class |
| `context/types.ts` | Add: `CustomRulesetConfig`, `GimmickConfig`, `GimmickUsePolicy`, `BanListConfig`, `ClauseConfig`, `ClauseEnforcer`, `MechanicOverrides`, `LeafOverrides`, `SubsystemName` |
| `ruleset/GenerationRuleset.ts` | Add `checkMoveRestriction?()` to `MoveSystem` sub-interface |
| `ruleset/BaseRuleset.ts` | Add default no-op for `checkMoveRestriction?()` |
| `index.ts` | Export `CustomRuleset` + all new config types |

## Tests

### Unit Tests (`packages/battle/tests/CustomRuleset.test.ts`)

- Ban enforcement: item, move, species, ability bans at `validatePokemon()` and `validateTeam()`
- Each clause: sleep (count tracking), species (dupe detection), item (dupe detection), level-cap, evasion (block Double Team/Minimize), ohko (block Fissure/Guillotine/Horn Drill/Sheer Cold), custom (callbacks invoked)
- Gimmick policies: one-per-battle, one-per-type, unlimited — verify use tracking
- Gimmick stacking: `allowStacking: false` blocks a mega-evolved Pokemon from also terastallizing
- `PolicyWrappedGimmick`: verify internal `usedBySide` tracking with side 0 and side 1 independently
- Leaf overrides: `critMultiplier`, `sleepTurns`, `burnDamageFraction`, `confusionSelfHitChance`, `protectStaling`
- Subsystem swap: delegate correct subsystem methods to override source, all other methods to base
- `validateTeam()`: species clause (reject duplicate species), item clause (reject duplicate items), level cap (reject overlevel)
- Backward compatibility: existing gen rulesets pass through `new CustomRuleset({ base: genXRuleset })` unchanged

### Integration Tests (`packages/battle/tests/CustomRulesetIntegration.test.ts`)

- Gen 9 base + Mega Evolution (`Gen7MegaEvolution`) + Terastallization, `one-per-type` policy: verify both gimmicks work in the same battle on the same side
- Gen 9 base + all four gimmicks, `one-per-battle` policy: verify only one gimmick activates per side
- Gen 9 base + ban list + Sleep Clause: verify banned move blocked at move selection, sleep correctly capped
- Sub-interface swap: Gen 9 base with `criticalHitSystem` from a Gen 5-equivalent instance returning `getCritMultiplier: () => 2.0` — verify crit deals 2× not 1.5×

## Design Decision Log

### API Pattern

Three patterns were evaluated: Builder, Config Object (factory function), and Decorator/Wrapper Class.

**Builder** was rejected: mutable intermediate state, weak type safety on accumulated config, harder to unit-test individual build steps.

**Config Object** was preferred for ergonomics: full shape validated at call site, serializable, testable as data.

**Wrapper Class** was chosen for its addition of `instanceof` introspection, runtime `ruleset.config` access, and clean delegation structure.

The final design is a **Config Object + Wrapper Class** hybrid.

### Mechanic Override Granularity

Three granularities were evaluated: sub-interface level, method level, layered (both).

**Method level was rejected** due to private state coupling discovered in the implementations:
- `Gen5Ruleset._currentWeather` is set by `resolveTurnOrder` and read by `getEffectiveSpeed` — splitting these across instances silently breaks speed modifiers
- `Gen9Ruleset._pendingShedTailSub` is set by `onSwitchOut` and read by `onSwitchIn` — splitting breaks Shed Tail
- Cross-sub-interface calls (`resolveTurnOrder` → `applyAbility`, `executeMoveEffect` → `rollProtectSuccess`) cause silent semantic errors when methods are split across instances
- `super` calls resolve at class definition time; method-level overrides cannot redirect them

**Sub-interface level** was chosen because the ISP decomposition already reflects the coupling boundaries. Subsystem swaps preserve all private state and `super` chains within a subsystem.

**Declarative leaf overrides** (a small supplement to sub-interface swaps) cover the most commonly customized individual parameters — these are provably safe because they are pure value returns with no `this` dependencies.

### Gimmick Portability

**Home gen rules** was chosen over "adapt to base gen" or "consumer decides."

Evidence: all gimmick implementations are self-contained data bundles that do not reference gen-specific damage calcs or type charts. The stat recalc formula used by Mega Evolution (`calculateStat` from core) is identical across Gen 3-9. Z-Move power tables and Max Move conversions are generation-invariant. Only Tera's STAB calculation is gen-dependent, and it is handled by the base gen's damage calc, not by the gimmick class itself.
