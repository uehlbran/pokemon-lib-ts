# Phase 4C — Architecture Improvements

**Branch name:** `refactor/audit-architecture`
**Risk:** Medium — structural changes to the core interface and engine.
**Depends on:** Spec A (`fix/audit-naming`) merging first. Naming changes affect `GenerationRuleset.ts` and `BaseRuleset.ts`. Create this branch from `main` after Spec A merges.

## Pre-Flight

```bash
# Only after fix/audit-naming has merged to main
git fetch origin main
git checkout -b refactor/audit-architecture origin/main
```

Verify you're on `refactor/audit-architecture` and that `getAvailableTypes` (Spec A rename) is present in `GenerationRuleset.ts` before proceeding.

---

## Section 1: GenerationRuleset ISP Sub-Interface Extraction [CRITICAL]

**Goal:** Split the 35-method `GenerationRuleset` interface into ~15 focused sub-interfaces that are then composed back into `GenerationRuleset`. All existing implementations continue to work without modification — they already satisfy all methods.

**File to modify:** `packages/battle/src/ruleset/GenerationRuleset.ts`

Read the file first to confirm exact method names and signatures. Then restructure as follows:

### Sub-Interface Definitions

Define each sub-interface in `GenerationRuleset.ts` above the `GenerationRuleset` interface. Use this grouping:

```typescript
/** Type chart lookup and available type list for this generation. */
export interface TypeSystem {
  getTypeChart(): TypeChart;
  getAvailableTypes(): Type[];
}

/** Base stat and in-battle stat calculation. */
export interface StatCalculator {
  calculateStats(pokemon: Pokemon): StatBlock;
}

/** Damage formula and damage breakdown. */
export interface DamageSystem {
  calculateDamage(ctx: DamageContext): DamageResult;
}

/** Critical hit rate table, multiplier, and roll. */
export interface CriticalHitSystem {
  getCritRateTable(): CritRateTable;
  getCritMultiplier(isCrit: boolean): number;
  rollCritical(ctx: CritContext): boolean;
}

/** Priority sort and turn order resolution. */
export interface TurnOrderSystem {
  resolveTurnOrder(actions: BattleAction[], state: BattleState): BattleAction[];
}

/** Accuracy check and move effect execution. */
export interface MoveSystem {
  doesMoveHit(ctx: AccuracyContext): boolean;
  executeMoveEffect(ctx: MoveEffectContext): MoveEffectResult;
}

/**
 * All status condition mechanics: damage ticks, cure rolls, sleep/paralysis/confusion.
 *
 * Gen 1–2 implement this directly; Gen 3+ inherit Gen 3+ defaults from BaseRuleset.
 */
export interface StatusSystem {
  applyStatusDamage(pokemon: ActivePokemon, state: BattleState): EndOfTurnEffect[];
  checkFreezeThaw(pokemon: ActivePokemon, rng: SeededRandom): boolean;
  rollSleepTurns(rng: SeededRandom): number;
  checkFullParalysis(pokemon: ActivePokemon, rng: SeededRandom): boolean;
  rollConfusionSelfHit(rng: SeededRandom): boolean;
  processSleepTurn(pokemon: ActivePokemon, rng: SeededRandom): boolean;
  calculateConfusionDamage(pokemon: ActivePokemon, rng: SeededRandom): number;
}

/** Whether this generation has abilities, and how to apply them. */
export interface AbilitySystem {
  hasAbilities(): boolean;
  applyAbility(ctx: AbilityContext): AbilityResult;
}

/** Whether this generation has held items, and how to apply them. */
export interface ItemSystem {
  hasHeldItems(): boolean;
  applyHeldItem(ctx: ItemContext): ItemResult;
}

/** Whether this generation has weather, and how to apply weather effects. */
export interface WeatherSystem {
  hasWeather(): boolean;
  applyWeatherEffects(state: BattleState): WeatherEffectResult;
}

/** Whether this generation has terrain, and how to apply terrain effects (Gen 6+). */
export interface TerrainSystem {
  hasTerrain(): boolean;
  applyTerrainEffects(state: BattleState): TerrainEffectResult;
}

/** Entry hazard list and application on switch-in. */
export interface HazardSystem {
  getAvailableHazards(): EntryHazard[];
  applyEntryHazards(pokemon: ActivePokemon, side: BattleSide): EntryHazardResult;
}

/** Switch legality, Pursuit interaction, and switch-out hooks. */
export interface SwitchSystem {
  canSwitch(pokemon: ActivePokemon, state: BattleState): boolean;
  shouldExecutePursuitPreSwitch(attacker: ActivePokemon, target: ActivePokemon): boolean;
  onSwitchOut(pokemon: ActivePokemon, state: BattleState): void;
}

/**
 * End-of-turn damage sources and multi-turn mechanics.
 *
 * Covers: leech seed, curse, nightmare, struggle recoil, bind, perish song, protect, multi-hit.
 */
export interface EndOfTurnSystem {
  calculateLeechSeedDrain(pokemon: ActivePokemon): number;
  calculateCurseDamage(pokemon: ActivePokemon): number;
  calculateNightmareDamage(pokemon: ActivePokemon): number;
  calculateStruggleRecoil(pokemon: ActivePokemon, damageTaken: number): number;
  rollMultiHitCount(rng: SeededRandom): number;
  rollProtectSuccess(consecutiveUses: number, rng: SeededRandom): boolean;
  calculateBindDamage(pokemon: ActivePokemon): number;
  processPerishSong(pokemon: ActivePokemon): boolean;
  getEndOfTurnOrder(state: BattleState): ActivePokemon[];
}

/** Pokémon validation, EXP gain, and battle gimmick (Mega/Z-Move/Dynamax/Tera). */
export interface ValidationSystem {
  validatePokemon(pokemon: Pokemon): ValidationResult;
  calculateExpGain(ctx: ExpContext): number;
  getBattleGimmick(): BattleGimmick | null;
}
```

### Recompose `GenerationRuleset`

After all sub-interfaces are defined, rewrite `GenerationRuleset` to extend them all:

```typescript
/**
 * The complete interface that a generation ruleset must implement.
 *
 * Composed from focused sub-interfaces; each sub-interface can be used
 * independently (e.g., pass only `DamageSystem` to a damage calculator).
 *
 * Gen 1–2 implement this interface directly.
 * Gen 3+ extend `BaseRuleset` and override generation-specific methods.
 */
export interface GenerationRuleset extends
  TypeSystem,
  StatCalculator,
  DamageSystem,
  CriticalHitSystem,
  TurnOrderSystem,
  MoveSystem,
  StatusSystem,
  AbilitySystem,
  ItemSystem,
  WeatherSystem,
  TerrainSystem,
  HazardSystem,
  SwitchSystem,
  EndOfTurnSystem,
  ValidationSystem {
  /** The generation number this ruleset implements (1–9). */
  readonly generation: number;
  /** Human-readable name, e.g. "Generation I". */
  readonly name: string;
}
```

**No changes needed to:** `Gen1Ruleset.ts`, `Gen2Ruleset.ts`, `BaseRuleset.ts` — they already implement all methods and TypeScript will verify this.

### Export Sub-Interfaces

**File:** `packages/battle/src/index.ts`

Add exports for all sub-interfaces so consumers can type-narrow their dependencies:

```typescript
export type {
  TypeSystem,
  StatCalculator,
  DamageSystem,
  CriticalHitSystem,
  TurnOrderSystem,
  MoveSystem,
  StatusSystem,
  AbilitySystem,
  ItemSystem,
  WeatherSystem,
  TerrainSystem,
  HazardSystem,
  SwitchSystem,
  EndOfTurnSystem,
  ValidationSystem,
  GenerationRuleset,
} from "./ruleset/GenerationRuleset.js";
```

**Verify:** Run `npm run typecheck` — all three implementations (`Gen1Ruleset`, `Gen2Ruleset`, `BaseRuleset`) should still satisfy `GenerationRuleset` with no new errors.

---

## Section 2: Shared Gen 1–2 Utility Extraction [IMPORTANT]

**Goal:** Extract 4 formulas that are currently duplicated between `gen1` and `gen2` into `packages/core/src/logic/gen12-shared.ts`.

### New File: `packages/core/src/logic/gen12-shared.ts`

Create this file with the following exports (copy the implementation from Gen1Ruleset — verify it's identical in Gen2Ruleset before deleting):

```typescript
import type { SeededRandom } from "../prng/seeded-random.js";

/**
 * Gen 1–2: ~24.6% chance (63/256) to be fully paralyzed and lose the turn.
 *
 * @param rng - The battle's seeded PRNG
 * @returns `true` if the Pokémon is fully paralyzed this turn
 */
export function gen1to2FullParalysisCheck(rng: SeededRandom): boolean {
  return rng.int(0, 255) < 63;
}

/**
 * Gen 1–4: Weighted multi-hit distribution [2,2,2,3,3,3,4,5].
 *
 * Hit counts: 2 (37.5%), 3 (37.5%), 4 (12.5%), 5 (12.5%).
 *
 * @param rng - The battle's seeded PRNG
 * @returns Number of hits: 2, 3, 4, or 5
 */
export function gen1to4MultiHitRoll(rng: SeededRandom): number {
  const roll = rng.int(0, 7);
  if (roll < 3) return 2;
  if (roll < 6) return 3;
  if (roll < 7) return 4;
  return 5;
}

/**
 * Gen 1–6: 50% chance to hit self in confusion.
 *
 * @param rng - The battle's seeded PRNG
 * @returns `true` if the Pokémon hits itself in confusion
 */
export function gen1to6ConfusionSelfHitRoll(rng: SeededRandom): boolean {
  return rng.chance(0.5);
}

/**
 * Gen 1–2: Stat EXP contribution = floor(ceil(sqrt(statExp)) / 4).
 *
 * Used in both Gen1StatCalc and Gen2StatCalc. statExp range: 0–65535.
 *
 * @param statExp - Accumulated stat experience points (0–65535)
 * @returns The contribution value added to the base stat formula
 */
export function calculateStatExpContribution(statExp: number): number {
  return Math.floor(Math.ceil(Math.sqrt(statExp)) / 4);
}
```

**IMPORTANT before implementing:** Verify the actual implementations in Gen1 and Gen2 match these formulas exactly. If there are any differences, use the correct formula (not the one above) and note the discrepancy.

### Re-export from core

**File:** `packages/core/src/logic/index.ts`

Add:
```typescript
export {
  gen1to2FullParalysisCheck,
  gen1to4MultiHitRoll,
  gen1to6ConfusionSelfHitRoll,
  calculateStatExpContribution,
} from "./gen12-shared.js";
```

### Update Gen 1 Ruleset

**File:** `packages/gen1/src/Gen1Ruleset.ts`

Add import at the top:
```typescript
import {
  gen1to2FullParalysisCheck,
  gen1to4MultiHitRoll,
  gen1to6ConfusionSelfHitRoll,
} from "@pokemon-lib-ts/core";
```

Replace:
- Line ~614: Replace inline `checkFullParalysis` implementation with a call to `gen1to2FullParalysisCheck(rng)`
- Line ~619: Replace inline `rollConfusionSelfHit` implementation with a call to `gen1to6ConfusionSelfHitRoll(rng)`
- Line ~848: Replace inline `rollMultiHitCount` implementation with a call to `gen1to4MultiHitRoll(rng)`

**File:** `packages/gen1/src/Gen1StatCalc.ts`

Replace the inline `statExpContribution` helper (line ~14) with an import and call:
```typescript
import { calculateStatExpContribution } from "@pokemon-lib-ts/core";
```

Delete the local function and use the import.

### Update Gen 2 Ruleset

**File:** `packages/gen2/src/Gen2Ruleset.ts`

Same as Gen 1 above — add import and replace:
- Line ~629: `gen1to2FullParalysisCheck(rng)`
- Line ~634: `gen1to6ConfusionSelfHitRoll(rng)`
- Line ~858: `gen1to4MultiHitRoll(rng)`

**File:** `packages/gen2/src/Gen2StatCalc.ts`

Same as Gen 1 stat calc — replace inline `calculateStatExpContribution` (line ~10) with the core import.

### Verify Identical Logic

Before deleting any Gen 1/Gen 2 inline implementations, verify they produce identical results:

```typescript
// Quick sanity check — add to a scratch test file, then delete
import { gen1to2FullParalysisCheck, gen1to4MultiHitRoll } from "@pokemon-lib-ts/core";
// Run and confirm distributions match Bulbapedia values
```

---

## Section 3: BattleEngine Silent Fallback Cleanup [IMPORTANT]

**File:** `packages/battle/src/engine/BattleEngine.ts`

Read the file first to confirm exact line numbers. Then fix these 5 try/catch blocks:

### Fix 1: Constructor Species Lookup (lines ~63-79)

**Current behavior:** Species not found → silently continues or uses undefined.

**New behavior:** Throw a descriptive error at battle start, before any turn resolves.

Option A — throw in constructor:
```typescript
const species = dataManager.getSpecies(pokemon.speciesId);
if (!species) {
  throw new Error(
    `BattleEngine: species "${pokemon.speciesId}" not found in data. ` +
    `Validate your team before starting a battle.`
  );
}
```

Option B — call `ruleset.validatePokemon()` on each team member before starting, and throw if any validation fails. This is cleaner if validation is already implemented.

Choose whichever is simpler given the current constructor structure.

### Fix 2: `getAvailableMoves` Move Lookup (lines ~220-224)

**Current behavior:** Move not found → silently omits the move slot.

**New behavior:** Emit a warning event and skip the slot (keep the skip behavior, but make it visible):

```typescript
} catch {
  this.emit({
    type: "engine-warning",
    message: `Move "${moveId}" not found in data for Pokémon "${pokemon.name}". Slot skipped.`,
  });
  // continue (skip this slot)
}
```

If `engine-warning` is not an existing event type, add it to `BattleEvent` as:
```typescript
export interface EngineWarningEvent {
  type: "engine-warning";
  message: string;
}
```

And add it to the `BattleEvent` union.

### Fix 3: `sendOut` Species Lookup (lines ~382-387)

**Current behavior:** Species not found on switch-in → silently skips or errors silently.

**New behavior:** Throw. If the species was valid at battle start (Fix 1 ensures it was), it should never be missing here:

```typescript
const species = this.dataManager.getSpecies(pokemon.speciesId);
if (!species) {
  throw new Error(
    `BattleEngine: species "${pokemon.speciesId}" missing during switch-in. ` +
    `This should not happen if validatePokemon() passed at battle start.`
  );
}
```

### Fix 4: Pursuit Pre-Switch Move Lookup (lines ~459-463)

**Current behavior:** Pursuit move data not found → silently skips Pursuit.

**New behavior:** Emit a warning event (same pattern as Fix 2):

```typescript
} catch {
  this.emit({
    type: "engine-warning",
    message: `Pursuit move data not found. Skipping Pursuit execution.`,
  });
}
```

### Fix 5: `executeMove` Move Lookup (lines ~570-581)

**Current behavior:** Move not found → emits `move-fail` event. This is acceptable.

**Enhancement only (optional):** Add a `console.warn` or `engine-warning` event for debugging, but do not change the `move-fail` emission:

```typescript
} catch {
  // Move data missing — this should not happen for pre-validated moves.
  // If it does, fail gracefully with a move-fail event.
  this.emit({ type: "engine-warning", message: `Move "${moveId}" data missing during execution.` });
  this.emit({ type: "move-fail", ... });
}
```

---

## Section 4: Event-Driven Framing Clarification [IMPORTANT]

### Spec Update

**File:** `specs/battle/01-core-engine.md`

Find the section describing the event system and add or update to clarify:

> **State is the source of truth. Events are notifications.**
>
> `BattleState` is mutated in-place during turn resolution. Events are emitted *after* state mutations, as notifications for UI and replay consumers. Do not reconstruct game state from events — query `BattleState` directly.

### BattleEngine Inline Comment

**File:** `packages/battle/src/engine/BattleEngine.ts`

Add a comment at the top of the class body (after the class declaration, before the first field):

```typescript
// ─── State mutation model ───────────────────────────────────────────────────
// BattleState is the source of truth. It is mutated in-place during turn
// resolution. Events (BattleEvent[]) are emitted as notifications for UI/replay
// consumers — do not reconstruct state from events.
// ────────────────────────────────────────────────────────────────────────────
```

---

## Section 5: Phase Transition Diagram [SUGGESTION]

**File:** `packages/battle/src/engine/BattleEngine.ts`

Find `resolveTurn()` and add the following comment at the very start of the function body:

```typescript
// ─── Turn state machine ──────────────────────────────────────────────────────
// BATTLE_START → ACTION_SELECT
// ACTION_SELECT → TURN_RESOLVE     (both sides submit actions)
// TURN_RESOLVE  → TURN_END         (all actions execute)
// TURN_END      → FAINT_CHECK      (end-of-turn effects)
// FAINT_CHECK   → SWITCH_PROMPT    (if a Pokémon fainted and replacement needed)
//              → ACTION_SELECT     (normal next turn)
//              → BATTLE_END        (all Pokémon on one side fainted)
// ────────────────────────────────────────────────────────────────────────────
```

---

## Section 6: GenerationRegistry Resolution [SUGGESTION]

The codebase may or may not have a `GenerationRegistry`. If it exists, choose one of these two approaches:

**Option A: Remove the registry** (simpler, current de-facto pattern)
- Delete `GenerationRegistry` if it exists but is unused
- Document in code comments that the pattern is "inject `GenerationRuleset` directly into `BattleEngine`"

**Option B: Keep the registry, add a factory method**
- Add `BattleEngine.fromGeneration(gen: number, config: BattleConfig, dataManager: DataManager): BattleEngine`
- The factory looks up the registered ruleset for `gen` and constructs the engine
- Useful for consumers who don't want to import each gen ruleset individually

If the registry is not present in the codebase, skip this section entirely.

---

## Section 7: AbilityResult/ItemResult Effect Typing [SUGGESTION]

**File:** `packages/battle/src/context/types.ts`

If `AbilityResult` and `ItemResult` currently use `type: string, value: unknown` for their effect fields, tighten the types:

**For AbilityResult:**
```typescript
export type AbilityEffectType =
  | "stat-change"
  | "status-cure"
  | "damage-reduction"
  | "type-change"
  | "weather-immunity"
  | "ability-change"
  | "none";

export interface AbilityEffect {
  effectType: AbilityEffectType;
  // discriminated union: add specific fields per effectType as needed
}
```

**For ItemResult:**
```typescript
export type ItemEffectType =
  | "stat-boost"
  | "heal"
  | "damage-boost"
  | "status-prevention"
  | "speed-boost"
  | "none";

export interface ItemEffect {
  effectType: ItemEffectType;
  // discriminated union: add specific fields per effectType as needed
}
```

Replace `type: string` / `value: unknown` in `AbilityResult` and `ItemResult` with the typed union.

**Only implement if** the current types actually use `string`/`unknown` — read `context/types.ts` first to confirm.

---

## Verification

Run after completing all changes:

```bash
# 1. Auto-fix formatting
npx @biomejs/biome check --write .

# 2. Stage any files Biome modified
git add -A

# 3. Typecheck — must pass (sub-interface extraction is non-breaking)
npm run typecheck

# 4. Tests — must pass
npm run test

# 5. Smoke tests (confirms engine still works after structural changes)
npx tsx tools/replay-parser/src/index.ts simulate --gen 1 --battles 100
npx tsx tools/replay-parser/src/index.ts simulate --gen 2 --battles 100
```

**If typecheck fails after Section 1:** Check that `GenerationRuleset` correctly re-exports sub-interface method names. The most likely cause is a method listed in a sub-interface that does not exist in the implementation — check the error message for the missing method name.

**If tests fail after Section 2:** The extracted utility function likely has a subtle formula difference from the original. Compare the new `gen12-shared.ts` implementation against what was in `Gen1Ruleset` and `Gen2Ruleset` line-by-line. Do not proceed until the formulas match.

## Execution Order for This Spec

1. Section 1 (ISP extraction) — highest value, non-breaking
2. Section 2 (shared utilities) — run tests after to catch formula divergence
3. Section 3 (silent fallback cleanup) — may require adding `EngineWarningEvent` to BattleEvent
4. Section 4 (framing clarification) — quick, low-risk
5. Section 5 (phase diagram comment) — trivial
6. Section 6 (registry) — conditional on registry existing
7. Section 7 (effect typing) — conditional on `string`/`unknown` still being used
