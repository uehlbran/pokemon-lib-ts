# Phase 4A — Naming & Consistency Fixes

**Branch name:** `fix/audit-naming`
**Risk:** Low — mechanical renames, all existing tests cover correctness.
**Estimated scope:** ~20 files modified, ~100 lines changed.
**Can run in parallel with:** `docs/jsdoc-uplift` (Spec B) — no file overlap.
**Spec C depends on this merging first** — naming changes affect `GenerationRuleset`.

## Pre-Flight

```bash
git fetch origin main
git checkout -b fix/audit-naming origin/main
```

Verify you're on `fix/audit-naming` before touching any file.

---

## Section 1: Bug Fix — Remove Duplicate `"toxic-counter"` from `VolatileStatus`

**File:** `packages/core/src/entities/status.ts`

The string `"toxic-counter"` appears twice in the `VolatileStatus` union: once around line 43 (bare) and once around line 48 (with a Gen 2 comment). Remove the bare duplicate (line 43); keep the Gen 2 comment version (line 48).

**Before (approximate):**
```typescript
  | "toxic-counter"        // line 43 — bare duplicate, REMOVE THIS
  | ...
  | "toxic-counter"        // line 48 — with Gen 2 comment, KEEP THIS
```

**After:** Only one `"toxic-counter"` entry remains, with the Gen 2 comment.

**Verify:** `grep -n "toxic-counter" packages/core/src/entities/status.ts` should return exactly one line.

---

## Section 2: Renames

For each rename, update: the definition, all re-exports in `index.ts`, and all call sites (including test files). After every rename, run `npm run typecheck` to confirm no remaining references.

### 2.1 `getTypeFactor` → `getTypeMultiplier`

**Definition:**
- `packages/core/src/logic/type-effectiveness.ts:20` — rename the exported function

**Re-export:**
- `packages/core/src/logic/index.ts` — find the line re-exporting `getTypeFactor` and update to `getTypeMultiplier`

**Call sites:**
- `packages/core/src/logic/type-effectiveness.ts` — internal call around line 41 (the function calls itself or a helper)
- `packages/core/tests/logic/type-effectiveness.test.ts` — update all import references and call sites

**Before:**
```typescript
export function getTypeFactor(attacking: Type, defending: Type[]): number {
```

**After:**
```typescript
export function getTypeMultiplier(attacking: Type, defending: Type[]): number {
```

### 2.2 `DamageBreakdown` Fields: `*Mod` → `*Multiplier`

**Definition:**
- `packages/battle/src/context/types.ts:38-46` — rename all `*Mod` fields

Exact field renames:

| Old | New |
|-----|-----|
| `weatherMod` | `weatherMultiplier` |
| `critMod` | `critMultiplier` |
| `randomMod` | `randomMultiplier` |
| `stabMod` | `stabMultiplier` |
| `typeMod` | `typeMultiplier` |
| `burnMod` | `burnMultiplier` |
| `abilityMod` | `abilityMultiplier` |
| `itemMod` | `itemMultiplier` |
| `otherMod` | `otherMultiplier` |

**Before (approximate):**
```typescript
export interface DamageBreakdown {
  weatherMod: number;
  critMod: number;
  randomMod: number;
  stabMod: number;
  typeMod: number;
  burnMod: number;
  abilityMod: number;
  itemMod: number;
  otherMod: number;
}
```

**After:**
```typescript
export interface DamageBreakdown {
  weatherMultiplier: number;
  critMultiplier: number;
  randomMultiplier: number;
  stabMultiplier: number;
  typeMultiplier: number;
  burnMultiplier: number;
  abilityMultiplier: number;
  itemMultiplier: number;
  otherMultiplier: number;
}
```

**Consumers to update:**
- `packages/gen1/src/Gen1DamageCalc.ts:191` — update field assignments
- `packages/gen2/src/Gen2DamageCalc.ts:296` — update field assignments
- Any test files that construct or read `DamageBreakdown` objects

### 2.3 `GEN2_CRIT_STAGES` → `GEN2_CRIT_RATES`

**Definition:**
- `packages/gen2/src/Gen2CritCalc.ts:15` — rename the constant

**Call sites in same file:**
- Lines 77 and 97 of `Gen2CritCalc.ts`

**Call sites in other files:**
- `packages/gen2/src/Gen2Ruleset.ts:45` and `:54`
- `packages/gen2/tests/crit-calc.test.ts:5` (import), and lines 135-144, 298 (usages)

**Re-export:**
- `packages/gen2/src/index.ts:3` — update re-export name

**Before:**
```typescript
export const GEN2_CRIT_STAGES = { ... }
```

**After:**
```typescript
export const GEN2_CRIT_RATES = { ... }
```

### 2.4 `isHighCritMove` → `isGen1HighCritMove` (gen1 export only)

**Definition:**
- `packages/gen1/src/Gen1CritCalc.ts:58` — rename the exported function

**Re-export:**
- `packages/gen1/src/index.ts:3` — update re-export name

**Call sites:**
- All Gen 1 test files that import or call `isHighCritMove`

**IMPORTANT:** Gen 2 has its own `private isHighCritMove` in `Gen2CritCalc.ts` with a different move list. Leave it as-is — it is private (not exported) and is a different function.

**Before:**
```typescript
export function isHighCritMove(moveId: string): boolean {
```

**After:**
```typescript
export function isGen1HighCritMove(moveId: string): boolean {
```

### 2.5 `applyModifier` / `applyModifierChain` → `applyDamageModifier` / `applyDamageModifierChain`

**Definition:**
- `packages/core/src/logic/damage-utils.ts:8` — rename `applyModifier`
- `packages/core/src/logic/damage-utils.ts:16` — rename `applyModifierChain`

**Re-exports:**
- `packages/core/src/logic/index.ts:15-16` — update both re-export names

**Call sites:**
- Within `damage-utils.ts` itself: `applyModifierChain` calls `applyModifier` internally — update that internal call
- `packages/core/tests/logic/damage-utils.test.ts` — update all import references and call sites

**Note:** These are NOT used by gen1, gen2, or battle packages — only core-internal and core tests.

**Before:**
```typescript
export function applyModifier(value: number, modifier: number): number {
...
export function applyModifierChain(value: number, modifiers: number[]): number {
```

**After:**
```typescript
export function applyDamageModifier(value: number, modifier: number): number {
...
export function applyDamageModifierChain(value: number, modifiers: number[]): number {
```

### 2.6 `isPhysicalInGen1` → `isGen1PhysicalType` and `isPhysicalInGen2` → `isGen2PhysicalType`

**Gen 1:**
- Definition: `packages/gen1/src/Gen1DamageCalc.ts:33` — rename function
- Re-export: `packages/gen1/src/index.ts:4` — update re-export
- Internal call sites: all usages within `Gen1DamageCalc.ts`
- Test call sites: Gen 1 test files

**Gen 2:**
- Definition: `packages/gen2/src/Gen2DamageCalc.ts:38` — rename function
- Re-export: `packages/gen2/src/index.ts:4` — update re-export
- Internal call sites: all usages within `Gen2DamageCalc.ts`
- Test call sites: Gen 2 test files

**Before (gen1):**
```typescript
export function isPhysicalInGen1(type: Type): boolean {
```

**After (gen1):**
```typescript
export function isGen1PhysicalType(type: Type): boolean {
```

**Before (gen2):**
```typescript
export function isPhysicalInGen2(type: Type): boolean {
```

**After (gen2):**
```typescript
export function isGen2PhysicalType(type: Type): boolean {
```

---

## Section 3: Consistency Fixes

### 3.1 `SwitchOutEffect.who` → `SwitchOutEffect.target`

**File:** `packages/core/src/entities/move.ts:244`

Rename the field `who` to `target`. Keep the type `"self" | "foe"` unchanged.

**Before:**
```typescript
export interface SwitchOutEffect {
  type: "switch-out";
  who: "self" | "foe";
}
```

**After:**
```typescript
export interface SwitchOutEffect {
  type: "switch-out";
  target: "self" | "foe";
}
```

Search for all usages: `grep -rn "\.who" packages/` to find any call sites accessing `.who` on a `SwitchOutEffect`. Update all of them to `.target`.

### 3.2 `getWeatherModifier` → `getWeatherDamageModifier` (core only)

**File:** `packages/core/src/logic/damage-utils.ts:45`

Rename the function. Gen 2 already uses `getWeatherDamageModifier` — this rename makes core match gen2's naming.

**Re-export:** Update `packages/core/src/logic/index.ts` to re-export as `getWeatherDamageModifier`.

**Before:**
```typescript
export function getWeatherModifier(weather: WeatherState | undefined, moveType: Type): number {
```

**After:**
```typescript
export function getWeatherDamageModifier(weather: WeatherState | undefined, moveType: Type): number {
```

Check for any call sites: `grep -rn "getWeatherModifier" packages/` — update all.

### 3.3 `getValidTypes()` → `getAvailableTypes()` (all implementations)

This rename touches the interface definition, `BaseRuleset`, all gen implementations, and the mock. Do them all atomically.

**Interface:**
- `packages/battle/src/ruleset/GenerationRuleset.ts:55` — rename method signature

**BaseRuleset:**
- `packages/battle/src/ruleset/BaseRuleset.ts:45` — rename method implementation

**Gen 1:**
- `packages/gen1/src/Gen1Ruleset.ts:80` — rename method implementation

**Gen 2:**
- `packages/gen2/src/Gen2Ruleset.ts:85` — rename method implementation

**Test mock:**
- `packages/battle/tests/helpers/mock-ruleset.ts:76` — rename method

**All test files:** Search `grep -rn "getValidTypes" packages/` and update every reference.

### 3.4 Gen2 private `statExpContribution` → `calculateStatExpContribution`

**File:** `packages/gen2/src/Gen2StatCalc.ts:10`

This is a private function (not exported). Rename within the file only.

**Before:**
```typescript
function statExpContribution(statExp: number): number {
```

**After:**
```typescript
function calculateStatExpContribution(statExp: number): number {
```

Update any internal calls within `Gen2StatCalc.ts` (the function likely calls itself or is called by stat calc logic in the same file). Also update any Gen 2 test files that reference this name directly.

---

## Section 4: BaseRuleset Gen-Range Comments

**File:** `packages/battle/src/ruleset/BaseRuleset.ts`

Add or update `// Gen X+ default; Gen Y must override` comments to the following methods. These comments belong on the line immediately before the method signature (or as the first line of the JSDoc if JSDoc exists).

| Method | Line (approx) | Comment to add |
|--------|--------------|----------------|
| `getCritRateTable()` | 73 | `// Gen 6+ default; Gen 3-5 use a 2-stage table with 1/16 and 1/8 rates` |
| `getCritMultiplier()` | 78 | `// Gen 6+ default (1.5x); Gen 3-5 must override (2.0x)` |
| `rollSleepTurns()` | 192 | `// Gen 5+ default (1-3 turns); Gen 3-4 must override (2-5 turns)` |
| `rollMultiHitCount()` | 341 | `// Gen 5+ default (uniform 2-5); Gen 3-4 must override ([2,2,2,3,3,3,4,5] weighted)` |
| `checkFreezeThaw()` | 187 | `// Gen 3+ default (20% thaw); Gen 2 must override (25/256 ≈ 9.8%)` |
| `applyStatusDamage()` burn | 171 | `// Burn: Gen 7+ default (1/16 max HP); Gen 3-6 must override (1/8 max HP)` |
| `rollConfusionSelfHit()` | 202 | `// Gen 3-6 default (50% self-hit); Gen 7+ must override (33%)` |
| `shouldExecutePursuitPreSwitch()` | 306 | `// Gen 3-7 default (true); Gen 8+ must override (false)` |
| `calculateStruggleRecoil()` | 335 | `// Gen 4+ default (1/4 max HP); Gen 3 must override (1/2 damage dealt)` |
| `calculateBindDamage()` | 358 | `// Gen 5+ default (1/8 max HP); Gen 2-4 must override (1/16 max HP)` |
| `getAvailableHazards()` | 258 | `// Gen 4-5 defaults (spikes, stealth-rock, toxic-spikes); Gen 3 must override (spikes only); Gen 6+ must override (add sticky-web)` |

Read `BaseRuleset.ts` first to confirm actual line numbers before editing.

---

## Section 5: CLAUDE.md Documentation

**File:** `CLAUDE.md`

In the "How to Add a New Generation" section, add the following paragraph after the existing step list:

```markdown
> Gen 1–2 implement `GenerationRuleset` directly. Do **not** make them extend `BaseRuleset` — they are too mechanically different. Bug fixes to shared Gen 1–2 formulas (`checkFullParalysis`, `rollConfusionSelfHit`, `rollMultiHitCount`, stat EXP contribution) must be applied to each gen separately.
```

---

## Verification

Run after completing all changes, before pushing:

```bash
# 1. Auto-fix formatting
npx @biomejs/biome check --write .

# 2. Stage any files Biome modified
git add -A

# 3. Typecheck — must pass with zero errors
npm run typecheck

# 4. Tests — must pass
npm run test

# 5. Smoke test (after PR #33 merges and branch is rebased onto main)
npx tsx tools/replay-parser/src/index.ts simulate --gen 1 --battles 100
npx tsx tools/replay-parser/src/index.ts simulate --gen 2 --battles 100
```

If typecheck fails, search for unrenamed references:
```bash
# Check for stale names
grep -rn "getTypeFactor\|applyModifier\b\|applyModifierChain\b\|isPhysicalInGen[12]\|isHighCritMove\b\|GEN2_CRIT_STAGES\|getValidTypes\|getWeatherModifier\b\|statExpContribution\b\|\.who\b" packages/
```

## Post-Merge

After this branch merges, Spec C (`refactor/audit-architecture`) can be created from `main`. Spec C modifies `GenerationRuleset.ts` and `BaseRuleset.ts` — it depends on the `getValidTypes` → `getAvailableTypes` rename in this branch.
