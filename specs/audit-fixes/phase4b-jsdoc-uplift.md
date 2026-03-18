# Phase 4B — JSDoc/Documentation Uplift

**Branch name:** `docs/jsdoc-uplift`
**Risk:** Zero — docs-only changes, no behavior changes.
**Estimated scope:** ~15 files modified, ~500 lines of JSDoc added.
**Can run in parallel with:** `fix/audit-naming` (Spec A) — no file overlap.

## Pre-Flight

```bash
git fetch origin main
git checkout -b docs/jsdoc-uplift origin/main
```

Verify you're on `docs/jsdoc-uplift` before touching any file.

---

## Conventions

Model all JSDoc after `packages/core/src/logic/stat-calc.ts` — it is the best example in the codebase (formula, `@param`, `@returns`, edge cases).

Rules:
- Use `/** */` block comments, never `//` for JSDoc
- Add `@param` for every parameter: name, type description, and valid range or expected values
- Add `@returns` with type and semantics
- For interfaces: add a block comment above the interface declaration explaining its purpose (no `@interface` needed — TypeScript convention)
- For discriminated unions: add an intro comment listing all variants with a one-line description each
- For constants: use a `/** */` block with a description
- Do NOT change any code, types, or behavior — documentation only

---

## Group 1: Score 0 — Battle State/Events (highest consumer impact)

These files have no JSDoc at all. They are the most important to document because they form the public contract that consumers interact with.

### `packages/battle/src/events/BattleEvent.ts`

Add JSDoc to:
1. The `BattleEvent` discriminated union — intro comment listing all event types and when each is emitted
2. Every individual event interface (30+ types). For each:
   - Explain when this event is emitted
   - Document every field (`@param`-style inline comment or `/** */` above each field)

Key events to prioritize (check file for complete list):
- `BattleStartEvent` — when battle begins
- `TurnStartEvent` — start of each turn
- `TurnEndEvent` — after all actions resolve
- `MoveUseEvent` — when a Pokémon attempts a move
- `DamageEvent` — when damage is dealt (include: source, target, amount, whether it was a crit)
- `FaintEvent` — when a Pokémon faints
- `StatusApplyEvent` — when a status condition is applied
- `StatusCureEvent` — when a status is cured
- `SwitchEvent` — when a Pokémon switches in/out
- `WeatherChangeEvent` — when weather changes
- `BattleEndEvent` — when the battle concludes (winner, reason)
- `ExpGainEvent` — experience gained
- `LevelUpEvent` — Pokémon levels up

### `packages/battle/src/events/BattleAction.ts`

Add JSDoc to:
1. The `BattleAction` discriminated union — intro comment describing the 6 action types and when each is submitted
2. Every action interface:
   - `MoveAction` — submitted during ACTION_SELECT; fields: `pokemonId`, `moveIndex`, `target`
   - `SwitchAction` — voluntary switch; fields: `pokemonId`, `switchToIndex`
   - `ForcedSwitchAction` — after faint; fields: `pokemonId`, `switchToIndex`
   - `FleeBattleAction` — flee in wild battles
   - `UseItemAction` — item use (future)
   - `PassAction` — skip turn (e.g., recharging)

### `packages/battle/src/context/types.ts`

Add JSDoc to all ~20 types. Read the file first to confirm the complete list. Priority types:

- `DamageContext` — all inputs needed to calculate damage (attacker, defender, move, weather, etc.)
- `DamageResult` — output of damage calculation (final damage, whether it was a crit, KO flag)
- `DamageBreakdown` — individual multipliers that composed the final damage; useful for damage log display
- `CritContext` — inputs for critical hit determination
- `AccuracyContext` — inputs for accuracy/evasion check
- `MoveEffectContext` — context passed to `executeMoveEffect()`
- `MoveEffectResult` — what the move effect produced (damage, status, stat changes, etc.)
- `AbilityContext` / `AbilityResult` — context + result for ability triggers
- `ItemContext` / `ItemResult` — context + result for held item triggers
- `ExpContext` — inputs for EXP gain calculation
- `BattleGimmick` — mega evolution, z-move, dynamax, terastallize; document which gens use each
- `EndOfTurnEffect` — scheduled effect applied at turn end (leech seed, burn, weather, etc.)
- `BattleConfig` — configuration passed to `BattleEngine` constructor; document every field
- `AvailableMove` — what `getAvailableMoves()` returns; document `usable`, `disabled`, `pp` fields
- `ValidationResult` — result of `validatePokemon()`; document `valid`, `errors`, `warnings` fields
- `WeatherEffectResult` / `TerrainEffectResult` / `EntryHazardResult`

### `packages/battle/src/state/BattleState.ts`

Add JSDoc to:
- `BattlePhase` union — document each phase and valid transitions:
  - `BATTLE_START` → `ACTION_SELECT`
  - `ACTION_SELECT` → `TURN_RESOLVE` (both sides submitted)
  - `TURN_RESOLVE` → `TURN_END`
  - `TURN_END` → `FAINT_CHECK`
  - `FAINT_CHECK` → `SWITCH_PROMPT | ACTION_SELECT | BATTLE_END`
- `BattleFormat` — `singles`, `doubles`, `triples` (or whatever variants are defined)
- `WeatherState` — current weather, turns remaining, source Pokémon
- `TerrainState` — current terrain, turns remaining (Gen 6+)
- `TurnRecord` — a record of one turn's actions and outcomes (used for replay/history)
- `BattleState` — the full mutable battle state; for each field explain what it represents and who mutates it

### `packages/battle/src/state/BattleSide.ts`

Add JSDoc to:
- `BattleSide` — one side of the battle (trainer + team + active slot)
- `TrainerRef` — reference to a trainer (id, name)
- `ActivePokemon` — the Pokémon currently in battle; document volatile state fields vs. persistent fields
- `VolatileStatusState` — per-battle status (confusion, flinch, encore, etc.); document each field
- `EntryHazardState` — current hazards on each side (spikes layers, stealth rock present, etc.)
- `ScreenState` — reflect/light screen; turns remaining
- `FutureAttackState` — future sight, doom desire; turn countdown

---

## Group 2: Score 0 — Core Classes

### `packages/core/src/data/data-manager.ts`

Add JSDoc to:
1. The `DataManager` class itself — explain: loads per-gen JSON data, provides typed accessors, lazy-loads by default
2. All 13 public methods. For each:
   - `@param` for every parameter
   - `@returns` with the return type and what it contains
   - `@throws` if the method can throw (e.g., species not found)

Example method to model:
```typescript
/**
 * Returns the species data for the given Pokédex ID.
 *
 * @param id - National Pokédex number (1–151 for Gen 1, etc.)
 * @returns The species data object, or `undefined` if not found in this generation's data.
 */
getSpecies(id: number): Species | undefined
```

### `packages/core/src/data/types.ts`

Add JSDoc to:
- `DataPaths` — object describing file paths for each data category (pokemon, moves, abilities, items, etc.)
- `RawDataObjects` — the raw deserialized JSON shapes before transformation into typed entities

---

## Group 3: Score 1 — Critical Methods

### `packages/battle/src/engine/BattleEngine.ts`

Add JSDoc to the 9 public methods:

1. `start()` — begins the battle; transitions from `BATTLE_START` to `ACTION_SELECT`; emits `BattleStartEvent`
2. `submitAction(action: BattleAction)` — submits a player action for the current turn; when both sides have submitted, triggers turn resolution; `@throws` if action is invalid for current phase
3. `submitSwitchChoice(choice: ForcedSwitchAction)` — submits a forced switch after a faint; `@throws` if not in `SWITCH_PROMPT` phase
4. `on(event, handler)` — subscribe to a battle event type; returns unsubscribe function
5. `off(event, handler)` — unsubscribe from a battle event type
6. `getEventLog()` — returns all events emitted since `start()` was called; useful for replay
7. `getAvailableMoves(pokemonId)` — returns `AvailableMove[]` for the given Pokémon; includes `usable`, `disabled`, `pp` for each move slot
8. `getAvailableSwitches(pokemonId)` — returns indices of team members that can be switched to
9. `getPhase()` — returns the current `BattlePhase`

### `packages/core/src/prng/seeded-random.ts`

Add JSDoc to all 7 public methods:

1. `next()` — returns next float in `[0, 1)`; advances the internal state
2. `int(min, max)` — returns random integer in `[min, max]` inclusive
3. `chance(probability)` — returns `true` with the given probability (0–1); convenience for `next() < probability`
4. `pick(array)` — returns a uniformly random element from the array; `@throws` if array is empty
5. `shuffle(array)` — Fisher-Yates in-place shuffle; returns the same array (mutates)
6. `getState()` — returns current PRNG state (a number); use with `setState()` to checkpoint/restore
7. `setState(state)` — restores PRNG to a prior state; useful for deterministic replay

---

## Group 4: Score 0-1 — Gen Data Factories + Misc

### `packages/gen1/src/data/index.ts`

Add JSDoc to `createGen1DataManager()`:
```typescript
/**
 * Creates a DataManager pre-loaded with complete Gen 1 data (151 Pokémon, 165 moves,
 * no abilities, no held items).
 *
 * @returns A DataManager instance ready for use with Gen1Ruleset.
 */
```

### `packages/gen2/src/data/index.ts`

Add JSDoc to `createGen2DataManager()`:
```typescript
/**
 * Creates a DataManager pre-loaded with complete Gen 2 data (251 Pokémon, 251 moves,
 * no abilities, held items included, Dark/Steel types added).
 *
 * @returns A DataManager instance ready for use with Gen2Ruleset.
 */
```

### `packages/core/src/entities/gender.ts`

Add JSDoc to the `Gender` type explaining:
- Valid values and their meaning
- When `undefined`/`null` is used (genderless species)
- Gen 2+ feature (Gen 1 has no gender mechanic)

### `packages/core/src/entities/validation.ts`

Add JSDoc to:
- `DataValidationResult` — the top-level result of a data validation pass
- `DataValidationError` — a hard error that makes a Pokémon illegal (e.g., impossible move, illegal ability)
- `DataValidationWarning` — a soft warning that doesn't prevent battle start (e.g., non-optimal EV spread)

---

## Order of Work

Work within each group top-to-bottom. Groups can be worked in order (1 → 2 → 3 → 4), or if the agent has capacity, groups 3 and 4 can be done concurrently with group 1 (they are in different files).

Read each file before editing to confirm current state and line numbers.

---

## Verification

```bash
# 1. Auto-fix formatting (Biome)
npx @biomejs/biome check --write .

# 2. TypeScript — JSDoc must not break type checking
npm run typecheck
```

Tests are not required for this branch (docs-only change per CLAUDE.md), but running them confirms nothing was accidentally changed:

```bash
npm run test  # should pass unchanged
```

**No behavior changes are acceptable in this branch.** If `npm run test` fails, you accidentally modified code. Revert the code change and re-apply only the JSDoc.
