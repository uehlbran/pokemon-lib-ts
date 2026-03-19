# Claude Code Spec: Cartridge Compliance System v2

## Goal

Build an automated cartridge compliance system that mechanically proves each generation matches its source-of-truth implementation. This is one unified system — oracle validation, compliance tracking, CI reporting, and a `/compliance` subagent command.

**Critical design principle**: Oracles (`@pkmn/data`, `@smogon/calc`, `@pkmn/sim`) are **sanity checks**, not authorities. They catch regressions and flag discrepancies. The actual authorities are pret disassemblies (Gen 1-3), pret decomps where available (Gen 4), Bulbapedia (for documented cartridge mechanics), and Showdown source (Gen 5-9 where no decomp exists). When an oracle disagrees with us, we investigate — we don't auto-correct to match the oracle.

---

## Source Authority Hierarchy

Every mechanic in every gen has a canonical source. When our engine disagrees with an oracle, this hierarchy determines who's right.

| Gen | Primary Source | Repo | Confidence | Notes |
|-----|---------------|------|------------|-------|
| 1 | pret/pokered | https://github.com/pret/pokered | **Cartridge (100%)** | Complete disassembly, byte-accurate |
| 2 | pret/pokecrystal | https://github.com/pret/pokecrystal | **Cartridge (100%)** | Complete disassembly, byte-accurate |
| 3 | pret/pokeemerald + pret/pokefirered | https://github.com/pret/pokeemerald | **Cartridge (100%)** | Complete C decompilations, matching ROMs |
| 4 | pret/pokeplatinum + pret/pokeheartgold | https://github.com/pret/pokeplatinum | **High (~75% C)** | Builds matching ROMs but battle code may still be partially assembly. Verify battle-relevant functions are decompiled to C before citing. Showdown is secondary. |
| 5 | Showdown + Bulbapedia | https://github.com/smogon/pokemon-showdown | **Medium** | No complete decomp. Showdown is the closest reference but intentionally deviates from cartridge for competitive balance. Always cross-check Bulbapedia for documented cartridge behavior. |
| 6–9 | Showdown + Bulbapedia | https://github.com/smogon/pokemon-showdown | **Medium** | Same as Gen 5. Showdown compliance ≠ cartridge accuracy. Prefer Bulbapedia for mechanics where Showdown is known to simplify. |

**Rules**:
1. When pret disassembly says X and Showdown says Y, we implement X and document the disagreement.
2. When Showdown intentionally patches a mechanic for competitive balance (e.g., sleep clause), document as `"resolution": "showdown-deviation"` — we implement cartridge behavior.
3. For Gen 5-9, when Bulbapedia documents cartridge behavior that differs from Showdown, prefer Bulbapedia and document the disagreement.
4. Oracles can also be wrong. If `@pkmn/data` has a bug that matches our bug, both pass but both are wrong. For Gen 1-3, spot-check 30+ canonical values against pret source. Track oracle bugs in `known-oracle-bugs.json`.

---

## What Already Exists (Do Not Duplicate)

Before writing any test, check these existing files:

- `tools/replay-parser/src/simulation/battle-runner.ts` — 200-battle AI-vs-AI smoke tests, 15 structural invariants per gen
- `packages/gen1/tests/deep-dive-validation.test.ts` — 51 ground-truth oracle tests against Bulbapedia
- `packages/gen1/tests/replay-validation.test.ts` — 3 Showdown replay differential tests
- `packages/*/tests/stat-calc.test.ts`, `damage-calc.test.ts`, `type-chart.test.ts`, `data-validation.test.ts`

These existing test files should NOT be modified. The oracle validation suite is new and separate.

---

## Part 1: Oracle Validation Harness

### 1.1: Dependencies

Pin exact versions (not ranges) to prevent oracle updates from breaking CI without code changes:

```bash
# IMPORTANT: The version numbers below are PLACEHOLDERS. Look up the actual latest
# versions on npm at implementation time. Pin to exact versions (no ^ or ~).
# As of early 2026, @pkmn packages are in the 0.x range (e.g., @pkmn/data@0.10.x).
npm install -D @pkmn/sim@<LATEST> @pkmn/data@<LATEST> @pkmn/dex@<LATEST> @smogon/calc@<LATEST> zod
```

**Important**: Look up the actual latest versions on npm (`npm view @pkmn/data versions`). Pin them exactly (no `^` or `~`). Also install `zod` for result schema validation. Document the chosen versions in `tools/oracle-validation/ORACLE-VERSIONS.md`:

```markdown
# Oracle Dependency Versions

Pinned to exact versions. Upgrading requires running `npm run compliance` and reviewing all new disagreements before committing.

| Package | Version | Pinned Date | Notes |
|---------|---------|-------------|-------|
| @pkmn/sim | <fill in> | <date> | Gen 1-9 support |
| @pkmn/data | <fill in> | <date> | Gen 1-9 species/moves/types |
| @pkmn/dex | <fill in> | <date> | Required by @pkmn/data |
| @smogon/calc | <fill in> | <date> | Damage calculator |
| zod | <fill in> | <date> | Result schema validation |

## Upgrade Procedure
1. `npm update @pkmn/data @pkmn/dex @pkmn/sim @smogon/calc`
2. `npm run compliance`
3. Review ALL new disagreements — are they oracle fixes or oracle regressions?
4. Update known-disagreements.json if needed
5. Update this file with new versions and notes
6. Commit as a standalone PR: "chore: upgrade oracle dependencies"
```

Dev-only — these never ship with our packages.

Verify imports work:
```typescript
import { Dex } from '@pkmn/dex';
import { Generations } from '@pkmn/data';
import { calculate, Pokemon, Move } from '@smogon/calc';
```

If any package has compatibility issues, document and work around. Don't let one package block the harness.

### 1.2: File Structure

```
tools/oracle-validation/
  package.json              # Pinned devDeps: @pkmn/sim, @pkmn/data, @pkmn/dex, @smogon/calc
  tsconfig.json             # target: ES2022, module: NodeNext, strict: true
  vitest.config.ts          # See section 1.3 for config
  ORACLE-VERSIONS.md        # Documents pinned versions and upgrade procedure
  src/
    runner.ts               # CLI entry: --gen N --suite data|damage|mechanics|replay|smoke|all
    gen-discovery.ts         # Determines which gens are implemented (see 1.3)
    compare-type-charts.ts
    compare-species.ts
    compare-moves.ts
    compare-damage.ts        # Programmatic scenario generation + edge case scenarios
    compare-stats.ts
    compare-mechanics.ts     # NEW: priority, abilities, items, status, field effects
    battle-replay.ts
    damage-trace.ts          # NEW: turn-by-turn HP delta comparison
    reporter.ts              # Reads JSON results, generates COMPLIANCE.md
    result-schema.ts         # Zod schema for results JSON validation
  tests/
    type-chart-oracle.test.ts
    species-oracle.test.ts
    move-oracle.test.ts
    damage-oracle.test.ts
    stat-oracle.test.ts
    mechanics-oracle.test.ts  # NEW
    battle-oracle.test.ts
    damage-trace.test.ts      # NEW
  data/
    replays/                  # Committed Showdown replays (JSON format)
      gen1/                   # gen1-replay-01.json through gen1-replay-12.json
      gen2/
    known-disagreements.json  # Our code vs oracle (we're right, oracle is wrong/different)
    known-oracle-bugs.json    # Cases where oracle itself is wrong (verified against pret/Bulbapedia)
    edge-case-scenarios/      # Hand-written scenarios for known edge cases (10-15 per gen)
      gen1-edge-cases.json
      gen2-edge-cases.json
    ground-truth/             # 30+ canonical values per gen verified against pret disassembly
      gen1-ground-truth.json  # Spot-checked species stats, move data, type effectiveness
      gen2-ground-truth.json
  results/                    # Committed to repo as regression baseline, updated by runner
    gen1-compliance.json
    gen2-compliance.json
```

### 1.3: Configuration and Gen Discovery

**Gen Discovery** (`src/gen-discovery.ts`):

A gen is "implemented" if ALL of these exist:
1. `packages/genN/` directory exists
2. `packages/genN/src/index.ts` exists (checking file presence is sufficient — the build step will catch export errors)
3. `packages/genN/data/` contains: `pokemon.json`, `moves.json`, `type-chart.json`
4. `packages/genN/package.json` exists and lists `@pokemon-lib-ts/core` and `@pokemon-lib-ts/battle` as dependencies (parse the JSON, check `dependencies` or `peerDependencies`)

All four checks are simple filesystem operations (no TypeScript compilation needed). The runner should check these before including a gen. If a gen is partially implemented (e.g., directory exists but data files missing), log a WARNING and skip.

**Vitest Config** (`vitest.config.ts`):

```typescript
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    testTimeout: 30_000,       // 30s per individual test
    hookTimeout: 10_000,       // 10s setup/teardown
    isolate: true,
    reporters: ['default', 'json'],
    outputFile: 'results/vitest-oracle.json',
  }
});
```

**Two entry points exist for different purposes:**
- **`runner.ts` (primary)**: The CLI orchestrator. `npm run compliance` invokes this. It discovers gens, runs suites, writes structured JSON results, and prints a summary. This is what CI and `/compliance` use.
- **`vitest` (secondary)**: The test files in `tests/` are standard vitest tests that call the same comparison functions as runner.ts. `npm run test:oracle` runs these via vitest for detailed per-test output, better IDE integration, and watch mode during development. They do NOT write results JSON.

Both use the same underlying comparison logic in `src/`. The runner orchestrates and reports; vitest provides developer ergonomics. Oracle tests run separately from the main test suite (not included in `npm run test`).

**CLI Flags**:

```bash
# Supported combinations:
npx tsx runner.ts --suite all                    # All suites, all implemented gens
npx tsx runner.ts --gen 1 --suite all            # All suites, Gen 1 only
npx tsx runner.ts --suite data                   # Data suite, all gens
npx tsx runner.ts --gen 2 --suite damage         # Damage suite, Gen 2 only
npx tsx runner.ts --suite data --suite damage    # Multiple suites, all gens

# Not supported:
npx tsx runner.ts --gen 1 --gen 2                # Use separate invocations
```

**Error Handling**:

1. If a gen exists but the ruleset isn't importable → log WARN, SKIP that gen
2. If a @pkmn package doesn't support a gen → the relevant suite is SKIPPED (not FAILED)
3. A gen is COMPLIANT only if ALL applicable suites PASS (SKIPPED suites don't count as passing — they show as ⬜)
4. Exit code 0 = all tests pass/skip as expected; exit code 1 = any test FAILS

Results JSON tracks skip reasons:
```json
{
  "suites": {
    "damage": {
      "status": "skipped",
      "skipReason": "@smogon/calc does not support this gen's damage formula"
    }
  }
}
```

Validate results JSON with Zod schema (`src/result-schema.ts`) before the reporter consumes them. If JSON is malformed (e.g., runner crashed mid-write), report that gen as INCOMPLETE and continue.

### 1.4: Data Validation Suites

**Type Chart Comparison** — For each implemented gen:
1. Load our type chart from `packages/genN/data/type-chart.json`
2. Load from `@pkmn/data`: `new Generations(Dex).get(N).types`
3. Compare every single-type attacker vs single-type defender pair
4. ALSO verify dual-type cross-check: for 20 representative dual-type defenders per gen, compute combined effectiveness and verify our engine applies type modifiers sequentially (not as a single float multiply)
5. Clear failure messages: `"Gen 1: Fire→Grass: ours=2x, @pkmn=2x ✓"` or `"Gen 1: Ghost→Psychic: ours=0x, @pkmn=2x (known disagreement, cartridge-accurate) ⊘"`

**Species Data Comparison** — For each implemented gen:
1. Load our `packages/genN/data/pokemon.json`
2. Load from `@pkmn/data`: `gen.species.get(name)`
3. Compare these fields explicitly:

| Gen Range | Fields to Compare |
|-----------|------------------|
| Gen 1-2 | id, name, types (both), baseStats (hp, atk, def, spc, spe for Gen 1; hp, atk, def, spa, spd, spe for Gen 2), weight |
| Gen 3+ | id, name, types (both), baseStats (hp, atk, def, spa, spd, spe), abilities (primary, secondary, hidden where applicable), weight |

4. Ignore: egg groups, flavor text, pokedex entries, form differences, growth rate, catch rate
5. Species that exist in our data but not in `@pkmn/data` (or vice versa) → FAIL with clear message
6. Flag stat changes between gens for the same Pokemon (e.g., Charizard SpA changes Gen 3→4)

**Move Data Comparison** — For each implemented gen:
1. Load our `packages/genN/data/moves.json`
2. Load from `@pkmn/data`: `gen.moves.get(name)`
3. Compare: basePower, accuracy, pp, type, priority, category (physical/special in Gen 4+, type-derived in Gen 1-3)
4. **Accuracy normalization**: Showdown stores accuracy as a percentage (100 = never misses in normal conditions). Our data files may store accuracy differently depending on how the data importer processed them. Before comparing:
   - Check what format our `moves.json` actually uses (run a quick sanity check: if any accuracy value > 100, it's likely /256 format)
   - If /256 format: convert with `percentage = Math.floor(ourValue / 256 * 100)` and compare with ±1% tolerance
   - If percentage format: compare directly
   - Note: pokered's `data/moves/moves.asm` stores accuracy as raw percentage values (e.g., Thunderbolt = 100, Guillotine = 30), NOT /256. However our data importer may have transformed these. Check the actual values in `packages/genN/data/moves.json` before assuming a format.
   - Moves that "never miss" (accuracy = null in Showdown) → match against our 0 or null
5. Moves in our data but not in oracle (or vice versa) → FAIL with clear message

### 1.5: Damage Oracle Suite

**Design**: Two tiers of scenarios — programmatically generated (broad coverage) and hand-written edge cases (deep coverage). These are ADDITIVE: Tier 1 generates 100+ scenarios, Tier 2 adds 15-20 hand-written edge cases on top, for 115-120+ total per gen.

**Tier 1: Generated Scenarios (100+ per gen)**

Write a scenario generator (`src/compare-damage.ts`) that automatically creates test cases:

```typescript
// DETERMINISTIC generation — use a fixed seed so scenarios are stable across runs.
// If species/moves change between oracle versions, the diff is visible in git.
const rng = seedrandom('pokemon-oracle-scenarios');

// For each implemented gen:
// 1. Pick 30 representative species using seeded RNG (mix of types, stat distributions)
// 2. For each species, pick 3 moves (STAB, off-type, coverage) — deterministic selection
// 3. For each move, create scenarios at levels 50 and 100
// 4. Vary spreads: perfect DVs/IVs, zero DVs/IVs, competitive spread
// 5. Compute expected damage from @smogon/calc
// 6. Compare against our engine
```

This generates 100+ scenarios per gen deterministically. Same seed = same scenarios every run. Regenerate on oracle upgrade (the diff shows exactly which scenarios changed).

**Tier 2: Hand-Written Edge Cases (15-20 per gen)**

Store in `data/edge-case-scenarios/genN-edge-cases.json`. These target known tricky mechanics:

1. STAB + 4x super effective (stacked multipliers)
2. Critical hit (Gen 1: ignore stat stages + defense, Gen 2+: 2x multiplier)
3. Burned attacker, physical move (Atk halved)
4. Max damage roll (255/255 Gen 1-2, 100/100 Gen 3+)
5. Min damage roll (217/255 Gen 1-2, 85/100 Gen 3+)
6. Level 1 attacker (edge case for integer division)
7. Level 100 max stats (overflow check)
8. Fixed damage (Seismic Toss = level, Dragon Rage = 40, Sonic Boom = 20)
9. Struggle recoil (50% Gen 1, 25% Gen 3+)
10. Self-Destruct/Explosion (defense halving Gen 1-2, Gen 5+ no halving)
11. Weather-boosted (Rain+Water 1.5x, Sun+Fire 1.5x — Gen 2+)
12. Light Ball Pikachu (Gen 2: doubles Special Attack)
13. Thick Club Marowak (doubles Attack)
14. Reflect/Light Screen (halves physical/special damage)
15. Multiple modifier stacking (STAB + super effective + weather + item)

**Per-Gen Scenario Schema**:

Gen 1-2 use DVs and stat exp:
```json
{
  "id": "gen1-stab-super-effective",
  "gen": 1,
  "attacker": { "species": "Charizard", "level": 50, "dvs": { "atk": 15, "def": 15, "spc": 15, "spe": 15 } },
  "defender": { "species": "Venusaur", "level": 50, "dvs": { "atk": 15, "def": 15, "spc": 15, "spe": 15 } },
  "move": "Flamethrower",
  "conditions": {},
  "note": "STAB Fire vs Grass/Poison"
}
```

Gen 3+ use IVs, EVs, and natures:
```json
{
  "id": "gen3-stab-super-effective",
  "gen": 3,
  "attacker": { "species": "Blaziken", "level": 50, "ivs": { "atk": 31 }, "evs": { "atk": 252 }, "nature": "adamant" },
  "defender": { "species": "Abomasnow", "level": 50, "ivs": { "def": 31 }, "evs": { "hp": 252 } },
  "move": "Blaze Kick",
  "conditions": {},
  "note": "STAB Fire vs Grass/Ice, 4x super effective"
}
```

Validate scenario JSON schemas per gen — reject any with mismatched fields (e.g., `nature` on a Gen 1 Pokemon).

**Comparison Logic**:

```typescript
const smogonResult = calculate(gen, smogonAttacker, smogonDefender, smogonMove, field);
const ourResult = ourDamageCalc(genRuleset, attacker, defender, move, field);

// Compare damage range with tolerance
const tolerance = Math.max(2, Math.floor(smogonResult.damage[0] * 0.02)); // ±2% or ±2, whichever is larger
expect(Math.abs(ourResult.minDamage - smogonResult.damage[0])).toBeLessThanOrEqual(tolerance);
```

Tolerance exists because `@smogon/calc` may use different rounding than cartridge. This is a SANITY CHECK, not a proof of correctness. For Gen 1-3, the pret disassembly is the actual proof.

**Pass threshold**: 98%+ of scenarios must match (not 95%). Remaining 2% must ALL be documented in known-disagreements.json with citations.

### 1.6: Stat Calculation Comparison

Compare stat calculations for every species at 3 configurations:
1. Perfect (max DVs/IVs, max stat exp/EVs)
2. Zero (min everything)
3. Competitive spread (252/252/4 or equivalent stat exp)

At levels 1, 50, and 100. This catches formula bugs.

### 1.7: Mechanics Oracle Suite (NEW)

This suite validates mechanics that data and damage comparisons miss. It's the hardest suite to build but catches the most important bugs.

**These are INTEGRATION tests, not unit tests.** Each scenario runs a full battle through BattleEngine with scripted moves and validates the outcome. This differs from existing `packages/*/tests/damage-calc.test.ts` (which unit-test individual functions) — the mechanics oracle tests the engine end-to-end, catching bugs where individual functions work correctly but integration is wrong.

**1.7a: Move Priority Validation**

For each implemented gen:
1. Load all moves and their priority values from `@pkmn/data`
2. Compare against our `moves.json` priority values
3. Create 5+ controlled battle scenarios per gen testing priority brackets:
   - Quick Attack (+1) goes before Tackle (0)
   - Protect (+4) goes before Quick Attack (+1)
   - Trick Room reverses order for 0-priority moves
   - Negative priority (Whirlwind at -6) goes last

**1.7b: Ability Validation (Gen 3+)**

For each implemented gen with abilities:
1. Load all abilities from `@pkmn/data`
2. Compare ability assignments per species (primary, secondary, hidden)
3. Create 10+ damage scenarios that differ WITH vs WITHOUT key abilities:
   - Levitate (Ground immunity)
   - Thick Fat (Fire/Ice resistance)
   - Flash Fire (Fire immunity + boost)
   - Intimidate (Attack drop on switch-in)
   - Static (30% paralysis on contact)
   - Synchronize (status reflection)

**1.7c: Status Effect Validation**

Create controlled scenarios testing:
1. Burn: Atk halved in damage calc, 1/8 HP per turn (Gen 2+), 1/16 HP per turn (Gen 1)
2. Paralysis: Speed quartered (Gen 1-6), halved (Gen 7+), 25% full paralysis chance
3. Poison: 1/16 HP per turn (Gen 1), 1/8 HP per turn (Gen 2+); Toxic escalates (1/16, 2/16, 3/16...)
4. Freeze: thaw chance per gen (Gen 1: Fire moves only, Gen 2: 25/256 per turn, Gen 3+: 20%)
5. Sleep: duration per gen (Gen 1: 1-7, Gen 2: 1-7, Gen 3+: 1-3)
6. Confusion: self-hit chance (Gen 1-6: 50%, Gen 7+: 33%)

**1.7d: Field Effect Validation**

Create controlled scenarios testing:
1. Weather damage modifiers (Rain+Water 1.5x, Sun+Fire 1.5x)
2. Weather + move accuracy (Thunder 100% in Rain, SolarBeam weakened in Rain)
3. Reflect/Light Screen damage reduction (correct percentage per gen)
4. Multiple field effects simultaneously (Reflect + Rain)
5. Weather/screen duration (5 turns default, extended by items)

**1.7e: Held Item Effect Validation (Gen 2+)**

Compare item effects against `@pkmn/data`:
1. Type-boosting items (Charcoal, Mystic Water — 1.1x Gen 2, 1.2x Gen 3+)
2. Stat-boosting items (Choice Band 1.5x Atk, Choice Specs 1.5x SpA)
3. Damage-calculating items (Life Orb 1.3x + 10% recoil)
4. Light Ball Pikachu, Thick Club Marowak
5. Berry healing (Sitrus Berry HP restoration)

**1.7f: Stat Stage Validation**

Test stat boost/drop mechanics:
1. Swords Dance: +2 Attack stages
2. Screech: -2 Defense stages
3. Stat stage caps (±6)
4. Stat multiplier application in damage calc (verify correct multiplier table)
5. Critical hits ignoring negative Attack/positive Defense stages (Gen 2+)

**1.7g: Gen 1-2 Unique Mechanics (MANDATORY for Gen 1-2 compliance)**

These mechanics only exist in Gen 1-2 and are the most likely source of bugs. Each must have at least one dedicated test:

Gen 1 specific:
1. 1/256 miss chance — all moves with 100% accuracy (except Swift) still miss 1/256 of the time on cartridge due to the `if random < accuracy` check where accuracy=255 but random is 0-255. Swift is the ONLY Gen 1 move that bypasses the accuracy check entirely and truly cannot miss. Verify with seeded PRNG: Swift should hit 1000/1000, Thunderbolt (accuracy 100%) should miss ~1/256.
2. Badge stat boosts — Brock's badge +12.5% DEF, etc. (Gen 1 specific). Verify damage with and without badges if implemented.
3. Focus Energy bug — multiplies crit rate by 1 instead of 4. Verify crit rate is LOWER with Focus Energy active.
4. Critical hit formula — uses base Speed, ignores stat stages and Reflect/Light Screen. Verify critical hit damage ignores all defense modifiers.
5. Ghost→Psychic immunity — cartridge bug, should be 0x not 2x. Already covered by type chart oracle, but add an integration test that runs a battle with Gengar vs Alakazam using Lick.

Gen 2 specific:
1. DV system (not IVs) — HP DV derived from other DVs. Verify HP DV calculation.
2. Stat Exp (not EVs) — different formula. Verify stat calculations use sqrt(statExp) not statExp/4.
3. Freeze thaw: 25/256 per turn (~9.77%, NOT 20%). Verify with seeded PRNG.
4. Light Ball doubles Pikachu's Special Attack (not Speed). Verify damage calc.
5. Leftovers heals BEFORE status damage (competitively significant ordering). Verify end-of-turn sequence.

**1.7h: Multi-Turn State Validation**

Bugs in state tracking only appear after multiple turns. Run 5+ turn scripted battles validating:

1. Toxic counter escalation: 1/16 → 2/16 → 3/16 → ... per turn. Record HP delta each turn and verify escalation.
2. Sleep counter: verify Pokemon wakes after correct number of turns per gen (Gen 1: 1-7, Gen 2: 1-7, Gen 3+: 1-3 selected at infliction). Use seeded PRNG.
3. Confusion counter: verify confusion ends after correct turns. Verify self-hit damage on confused turns.
4. Perish Song countdown: 3 → 2 → 1 → faint.
5. Encore duration: verify move lock expires after correct turns.
6. Disable duration: verify move restriction expires correctly.

**1.7i: Switch-In Mechanics Validation (Gen 2+)**

Switch mechanics are complex and have zero coverage in data/damage oracles. Run scripted battles with forced switches:

1. Entry hazards: Spikes damage varies by gen. Gen 2: 1 layer only, 1/8 max HP. Gen 3-5: 1 layer = 1/8, 2 layers = 1/6, 3 layers = 1/4 max HP. Gen 6+: same as Gen 3. Test the correct values for the gen being validated — do NOT assume modern values for older gens.
2. Stealth Rock (Gen 4+ only): damage = (1/8 max HP) × type effectiveness. 4x weak = 1/2, 2x weak = 1/4, neutral = 1/8, 2x resist = 1/16, 4x resist = 1/32 max HP.
3. Toxic Spikes: Poison on grounding switch-in (1 layer = poison, 2 layers = toxic). Poison types absorb.
4. Intimidate: verify Attack drop on switch-in
5. Weather damage on switch: Sandstorm/Hail deal 1/16 per turn to non-immune types after switch
6. Pursuit on switch: verify 2x damage when target is switching out

### 1.8: Battle Replay Comparison

**Tier 1: Structural Replay Validation** (existing approach, expanded)

Expand from 3 to 15+ replays per gen. Verify:
- Same Pokemon faint at same turns
- Same winner
- No HP < 0 or > max HP
- No impossible status states

Download replays from `https://replay.pokemonshowdown.com/` (raw log format). Convert to JSON using the existing `tools/replay-parser/` infrastructure — it already handles Showdown's log format. The JSON schema should match whatever the replay-parser outputs (check its existing types). Commit converted JSON to `data/replays/genN/genN-replay-NN.json`. No network access in CI.

Replay selection: for each gen, include replays covering:
- 3+ with weather mechanics
- 3+ with status conditions
- 3+ with varied move types (fixed damage, multi-hit, status moves)
- 3+ from diverse matchups (offensive, defensive, stall)
- 3+ that go to 20+ turns (tests end-of-turn logic)

**Tier 2: Damage Trace Validation (NEW)**

This is the key addition that addresses the "structural pass ≠ mechanical correctness" gap.

For 5-10 controlled battles per gen with a fixed seed:
1. Define fixed teams and a scripted move sequence (no randomness in move selection)
2. Run through our engine and record turn-by-turn: HP before, damage dealt, HP after, who moved first, status applied, ability triggered, end-of-turn effects and their ORDER
3. For damage validation: compare against `@smogon/calc` expected damage for that move/attacker/defender/field combination. Note: @smogon/calc is stateless, so you must feed it the game state at each turn. For turn 1 this is clean. For turn N, stat stages and status came from YOUR engine — this makes later turns partially self-referential. Accept this limitation: the primary value is turn 1-3 validation and invariant checking, not perfect turn-by-turn oracle matching.
4. For end-of-turn ordering: validate the ORDER of events in the BattleEvent stream against the expected sequence from the gen spec (e.g., Gen 2: Leftovers → poison/burn → weather). This is NOT circular — it's checking event ordering, not damage values.
5. For invariants: verify HP never goes negative, HP never exceeds max, status transitions are legal (can't freeze a Fire type), no impossible states.
6. Any invariant violation → FAIL. Any end-of-turn event in wrong order → FAIL. Damage deltas on turns 1-3 that deviate from oracle beyond ±2 → FAIL. Later turn damage deltas are advisory warnings, not failures.

This catches THREE blind spots in structural replay validation:
- Wrong damage but same winner (damage delta check)
- Wrong end-of-turn order (event sequence check — addresses known bug #54)
- Status/ability effects not triggering (event presence check)

**Implementation**: Post-process the existing BattleEvent stream (do NOT modify the battle engine). Write a trace extractor in `tools/oracle-validation/src/damage-trace.ts` that:
1. Consumes BattleEvent[] from a completed battle
2. Extracts per-turn: {turnNumber, attacker, move, defender, damageDealt, hpBefore, hpAfter, endOfTurnEffects: [{type, target, hpDelta, order}]}
3. Compares against independently computed expected values from @smogon/calc

### 1.9: Ground Truth Validation (NEW)

For Gen 1-3 (where pret decomps exist), maintain `data/ground-truth/genN-ground-truth.json` with 30+ canonical values manually verified against the disassembly:

```json
{
  "gen": 1,
  "source": "pret/pokered",
  "verifiedDate": "2026-03-15",
  "species": [
    { "name": "Charizard", "hp": 78, "atk": 84, "def": 78, "spc": 85, "spe": 100, "source": "data/pokemon/base_stats/charizard.asm" },
    { "name": "Mewtwo", "hp": 106, "atk": 110, "def": 90, "spc": 154, "spe": 130, "source": "data/pokemon/base_stats/mewtwo.asm" }
  ],
  "typeChart": [
    { "atk": "Ghost", "def": "Psychic", "effectiveness": 0, "source": "engine/battle/typechart.asm", "note": "Cartridge bug: Ghost immune to Psychic" }
  ],
  "moves": [
    { "name": "Thunderbolt", "power": 95, "accuracy": 100, "pp": 15, "type": "Electric", "source": "data/moves/moves.asm", "note": "pokered stores accuracy as percentage (100=never miss in normal conditions)" }
  ]
}
```

These are validated against pret, not @pkmn/data. They serve as the ultimate sanity check — if both `@pkmn/data` and our data agree but disagree with ground truth, both are wrong. Track oracle bugs in `known-oracle-bugs.json`.

### 1.10: Known Disagreements

Two separate files:

**`known-disagreements.json`** — Our engine vs oracle (we're right, oracle differs):

```json
[
  {
    "id": "gen1-ghost-psychic",
    "gen": 1,
    "suite": "typeChart",
    "description": "Ghost → Psychic is 0x on cartridge (bug), but @pkmn shows 2x",
    "ourValue": 0,
    "oracleValue": 2,
    "resolution": "cartridge-accurate",
    "source": "pret/pokered engine/battle/typechart.asm",
    "sourceUrl": "https://github.com/pret/pokered/blob/master/engine/battle/typechart.asm",
    "oracleVersion": "@pkmn/data@1.4.3",
    "addedDate": "2026-03-15"
  }
]
```

**`known-oracle-bugs.json`** — Cases where the oracle itself is wrong (verified against pret/Bulbapedia):

```json
[
  {
    "id": "example-oracle-bug",
    "gen": 1,
    "description": "@pkmn/data lists X but pret says Y",
    "oracleValue": "X",
    "cartridgeValue": "Y",
    "source": "pret/pokered <file>",
    "sourceUrl": "https://github.com/pret/pokered/blob/master/...",
    "oraclePackage": "@pkmn/data@1.4.3",
    "addedDate": "2026-03-15"
  }
]
```

**Disagreement matching logic**:
1. Each known disagreement has a unique `id` that encodes the specific test item (e.g., `gen1-typechart-ghost-psychic`, `gen1-damage-charizard-flamethrower-venusaur`, `gen1-species-pikachu-spe`). The `id` is the primary match key — NOT `(gen, suite, ourValue, oracleValue)` which would collide when two different items have the same values.
2. When a test finds a mismatch, look up `known-disagreements.json` by the test's computed `id`
3. If found and values match → SKIP (expected disagreement)
4. If found but values DON'T match → FAIL (disagreement changed — investigate)
5. If NOT found → FAIL with "NEW DISAGREEMENT DETECTED: [id] — investigate before adding to known-disagreements.json"

**Staleness detection**: On each run, check every known disagreement's `id` against current test results. If our value now matches the oracle for that specific item, add the `id` to the `staleDisagreements` array in results JSON. A gen with any stale disagreements is NOT COMPLIANT (Section 2.2). This prevents stale entries from accumulating — they must be reviewed and removed.

**Cartridge bug verification**: For each entry in known-disagreements.json where `resolution` = "cartridge-accurate", add a specific test that FAILS if the bug is NOT correctly implemented. Example: Gen 1 Ghost→Psychic must be 0x in our engine — if someone "fixes" it to 2x, the test catches the regression.

---

## Part 2: Compliance Automation

### 2.1: The Compliance Reporter (`src/reporter.ts`)

After all suites run, the reporter reads `results/genN-compliance.json` and generates a compliance report.

**COMPLIANCE.md is NOT committed to the repo.** Instead:
- During local dev: `npm run compliance` prints a summary to stdout and writes `results/compliance-summary.json`
- In CI: the workflow posts a compliance summary as a PR comment (via `gh pr comment`)
- The `/compliance` subagent reads `results/` directly

This avoids merge conflicts from a generated file. The source of truth is the test results, not a markdown file.

**Spec Verified Column**: The reporter reads `specs/SPEC-STATUS.md` and looks for the markdown table row matching `battle/NN-genN.md`. If the Status column says `**VERIFIED**`, the gen's spec is marked verified. Any other value → not verified. If the gen has no row → not started.

### 2.2: Results JSON Schema

```json
{
  "gen": 1,
  "timestamp": "2026-03-15T12:00:00Z",
  "oracleVersions": {
    "@pkmn/data": "1.4.3",
    "@pkmn/sim": "0.9.14",
    "@smogon/calc": "0.9.3"
  },
  "suites": {
    "typeChart": { "status": "pass", "total": 225, "passed": 225, "failed": 0, "skipped": 0, "knownDisagreements": 0 },
    "species": { "status": "pass", "total": 151, "passed": 151, "failed": 0, "skipped": 0, "knownDisagreements": 0 },
    "moves": { "status": "pass", "total": 165, "passed": 163, "failed": 0, "skipped": 2, "knownDisagreements": 2 },
    "damage": { "status": "pass", "total": 120, "passed": 118, "failed": 0, "skipped": 2, "knownDisagreements": 2 },
    "stats": { "status": "pass", "total": 453, "passed": 453, "failed": 0, "skipped": 0, "knownDisagreements": 0 },
    "mechanics": { "status": "pass", "total": 45, "passed": 45, "failed": 0, "skipped": 0, "knownDisagreements": 0, "note": "Includes 1.7a-1.7i: priority, abilities, status, fields, items, stat stages, gen-specific, multi-turn, switch-in" },
    "replay": { "status": "pass", "total": 15, "passed": 15, "failed": 0, "skipped": 0, "knownDisagreements": 0 },
    "damageTrace": { "status": "pass", "total": 8, "passed": 8, "failed": 0, "skipped": 0, "knownDisagreements": 0 },
    "smoke": { "status": "pass", "total": 200, "passed": 200, "failed": 0, "invariantViolations": 0 },
    "groundTruth": { "status": "pass", "total": 35, "passed": 35, "failed": 0, "skipped": 0, "knownDisagreements": 0 }
  },
  "specVerified": true,
  "staleDisagreements": [],
  "overallStatus": "COMPLIANT"
}
```

A gen is **COMPLIANT** only when:
- ALL suites have status "pass" (skipped suites show as ⬜, not ✅)
- `specVerified` is true
- Zero `staleDisagreements`

### 2.3: npm Scripts

Add to root `package.json`:

```json
{
  "scripts": {
    "oracle:data": "tsx tools/oracle-validation/src/runner.ts --suite data",
    "oracle:damage": "tsx tools/oracle-validation/src/runner.ts --suite damage",
    "oracle:mechanics": "tsx tools/oracle-validation/src/runner.ts --suite mechanics",
    "oracle:replay": "tsx tools/oracle-validation/src/runner.ts --suite replay",
    "oracle:trace": "tsx tools/oracle-validation/src/runner.ts --suite damageTrace",
    "oracle:stats": "tsx tools/oracle-validation/src/runner.ts --suite stats",
    "oracle:groundtruth": "tsx tools/oracle-validation/src/runner.ts --suite groundTruth",
    "smoke": "tsx tools/oracle-validation/src/runner.ts --suite smoke",
    "compliance": "tsx tools/oracle-validation/src/runner.ts --suite all",
    "test:oracle": "vitest run --config tools/oracle-validation/vitest.config.ts"
  }
}
```

`npm run compliance` = run all suites, write results JSON. No markdown generation step — results are the source of truth.

### 2.4: CI Integration

Add to `.github/workflows/ci.yml`:

```yaml
oracle-validation:
  runs-on: ubuntu-latest
  needs: [build]  # Must build first
  # Run on PRs and on main
  if: github.event_name == 'push' || github.event_name == 'pull_request'
  timeout-minutes: 8  # Smoke tests alone take ~3min; full suite ~5min with buffer
  steps:
    - uses: actions/checkout@v4
    - uses: actions/setup-node@v4
      with:
        node-version: 20
    - run: npm ci
    - run: npm run build
    - name: Run compliance suite
      run: npm run compliance
    - name: Post compliance summary
      if: github.event_name == 'pull_request'
      run: |
        # Read results and format as PR comment (uses Node built-in fs only, no external deps)
        node -e "
          const fs = require('fs');
          const path = require('path');
          const dir = 'tools/oracle-validation/results';
          const files = fs.readdirSync(dir).filter(f => f.match(/^gen\d+-compliance\.json$/));
          const results = files.map(f => JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8')));
          results.sort((a, b) => a.gen - b.gen);
          let summary = '## Compliance Report\n\n| Gen | Status |\n|-----|--------|\n';
          for (const r of results) {
            const icon = r.overallStatus === 'COMPLIANT' ? '✅' : '❌';
            summary += '| Gen ' + r.gen + ' | ' + icon + ' ' + r.overallStatus + ' |\n';
          }
          fs.writeFileSync('/tmp/compliance-comment.md', summary);
        "
        gh pr comment ${{ github.event.pull_request.number }} --body-file /tmp/compliance-comment.md
      env:
        GH_TOKEN: ${{ secrets.GITHUB_TOKEN }}
```

**Important**: The CI job does NOT commit or check COMPLIANCE.md. It runs the suites and posts results as a PR comment. No merge conflict risk.

If the suite exceeds the timeout, save partial results: "Gen 1: 25/50 scenarios, execution interrupted."

### 2.5: Compliance Subagent (Claude Code `/compliance` Command)

Add to `.claude/commands/compliance.md`:

```markdown
# /compliance

Run the cartridge compliance suite and report changes.

## Steps

1. Run `npm run compliance` from the repo root
2. Read `tools/oracle-validation/results/gen*-compliance.json` for all implemented gens
3. Compare current results against baseline:
   - Run `npm run compliance` on the current branch only (single run, not double)
   - For regression detection: compare suite totals/pass counts against the `results/` files committed on `origin/main`. If `results/` doesn't exist on main yet (first run), skip comparison and just report current status.
   - NOTE: This means `results/*.json` files should be committed to the repo (NOT gitignored) so they serve as the baseline. They change infrequently (only when suites run) and won't cause merge conflicts since they're JSON with stable keys.
   - Regression: passed count decreased OR new failures appeared → flag as CRITICAL
   - Improvement: passed count increased without new failures → note as IMPROVEMENT
   - New disagreement: moved from FAILED to KNOWN → flag as NEW DISAGREEMENT
   - Stale disagreement: our value now matches oracle → flag for cleanup
4. Report summary per gen:
   "Gen 1: COMPLIANT (120/120 damage, 225/225 types, 15/15 replays, 8/8 traces)"
   "Gen 2: 2 NEW FAILURES in damage suite — investigate before PR"
5. If any regressions, list the specific failing test IDs and values
6. Recommend: fix regressions before creating PR

## When to Run
- Before any PR touching `packages/`
- After fixing oracle-related issues
- Whenever you want to check overall status
```

---

## Part 3: CLAUDE.md and SPEC-STATUS Updates

### 3.1: CLAUDE.md Section

Add under a new `## Cartridge Compliance` heading:

```markdown
## Cartridge Compliance

Run `npm run compliance` to check per-gen compliance status. Results are in `tools/oracle-validation/results/`.

**Source Authority Hierarchy:**
- Gen 1-2: pret disassemblies (pokered, pokecrystal) — cartridge definitive
- Gen 3: pret C decomps (pokeemerald, pokefirered) — cartridge definitive
- Gen 4: pret WIP decomps (pokeplatinum, pokeheartgold) + Showdown — high confidence
- Gen 5-9: Showdown source + Bulbapedia — medium confidence. Showdown intentionally deviates from cartridge in some areas; prefer Bulbapedia for documented cartridge behavior.

**Oracles are sanity checks, not authorities.** `@pkmn/data`, `@smogon/calc`, and `@pkmn/sim` catch regressions and flag discrepancies. When they disagree with us, consult the hierarchy above. If pret says X and the oracle says Y, implement X and document in `known-disagreements.json`.

A generation is COMPLIANT when ALL suites pass: data match, damage match, mechanics match, replay validation, damage trace, smoke tests, ground truth, and spec verified. Agents must run `/compliance` before any PR touching `packages/`.
```

### 3.2: SPEC-STATUS.md Cross-Reference

Add at the top of `specs/SPEC-STATUS.md`:

```markdown
> **See also**: Run `npm run compliance` for the automated cartridge compliance dashboard covering oracle validation, replay testing, and smoke tests.
```

Update VERIFIED definition:
```markdown
| **VERIFIED** | Audited against primary source authority (pret for Gen 1-3, pret decomps where available for Gen 4, Showdown + Bulbapedia for Gen 5-9). Feeds the "Spec Verified" criterion in the compliance suite. |
```

---

## Implementation Order

**PR 1: Oracle Harness Foundation**
1. Install pinned dev dependencies
2. Create `tools/oracle-validation/` package structure (package.json, tsconfig, vitest config, Zod schemas)
3. Implement gen discovery logic
4. Implement runner with `--gen` and `--suite` flags
5. Implement data comparison suites (type chart with dual-type cross-check, species, moves with accuracy normalization)
6. Implement stat calculation comparison
7. Create `known-disagreements.json` and `known-oracle-bugs.json` with any found during development
8. Create `ground-truth/gen1-ground-truth.json` and `gen2-ground-truth.json` with 30+ verified values
9. Write vitest test wrappers
10. Add npm scripts to root package.json
11. Create `ORACLE-VERSIONS.md`

Dependencies: None (standalone, new package)

**PR 2: Damage + Mechanics Oracle**
1. Implement damage scenario generator (Tier 1: 100+ auto-generated per gen)
2. Create edge case scenarios (Tier 2: 15-20 hand-written per gen)
3. Implement mechanics oracle suite (priority, abilities, status, field effects, items, stat stages)
4. Implement damage trace validation
5. Expand replay tests from 3 to 15+ per gen, download and commit replays

Dependencies: Requires PR 1 (uses runner framework, gen discovery, schemas)

**PR 3: CI + Subagent + Docs**
1. Add CI workflow job (posts PR comment, no committed markdown)
2. Create `/compliance` Claude Code command
3. Update `CLAUDE.md` with cartridge compliance section
4. Update `SPEC-STATUS.md` with cross-reference
5. Add staleness detection for known-disagreements.json

Dependencies: Requires PR 2 (needs all suites to exist for meaningful CI)

PRs must merge sequentially: PR 1 → PR 2 → PR 3.

## Known Coverage Gaps (Out of Scope for PR 1-3)

The following mechanics are NOT covered by the initial compliance system. They should be added to the mechanics oracle incrementally as each gen is implemented:

- **Move categories**: Multi-hit moves (hit count distribution), two-turn moves (invulnerability), recoil moves (% per gen), draining moves (% and cap), OHKO moves (accuracy formula + level check), binding/trapping moves (damage + duration per gen)
- **Complex move effects**: Counter/Mirror Coat, Baton Pass (stat stage transfer), Protect/Detect (successive use failure rate), Substitute (HP cost + interaction rules), Destiny Bond
- **Battle formats**: Doubles/Triples (targeting, spread moves, ally interactions). The initial system is singles-only.
- **Gimmicks**: Mega Evolution, Z-Moves, Dynamax, Terastallize — tested when those gens are implemented
- **Miscellaneous**: PP tracking, Struggle trigger, forced switches (Roar/Whirlwind), trapping (Mean Look, Arena Trap, Shadow Tag), Transform/Ditto, simultaneous fainting rules, item consumption timing

These are real gaps. The initial system catches data errors, formula bugs, end-of-turn ordering, and status mechanics — which represent the highest-value, most-likely-wrong areas. Move-specific effects are validated per-gen as the mechanics oracle grows.

## Success Criteria

- `npm run compliance` runs all suites for all implemented gens and writes structured JSON results
- Oracle dependencies pinned to exact versions with documented upgrade procedure
- Every type chart cell matches `@pkmn/data` or is documented (including dual-type cross-checks)
- Every species' battle-relevant stats match
- Every move's properties match (with accuracy normalization)
- **98%+** of damage scenarios match `@smogon/calc` within ±2% tolerance
- Mechanics suite validates priority, abilities, status, field effects, items, stat stages, gen-specific quirks (1/256 miss, Focus Energy bug, DV system, etc.), multi-turn state (toxic escalation, sleep/confusion counters), and switch-in mechanics (entry hazards, Intimidate, Pursuit)
- 15+ replays per gen pass structural validation
- 5+ damage traces per gen validate turn-by-turn HP deltas
- 30+ ground truth values per gen verified against pret disassembly (Gen 1-3)
- All disagreements cite source authority with URL to exact file
- Stale disagreements detected and flagged
- Known oracle bugs tracked separately
- CI posts compliance summary as PR comment (no committed markdown, no merge conflicts)
- `/compliance` command works for agents and detects regressions
- Source authority hierarchy documented in CLAUDE.md
- Total oracle suite runs in under 5 minutes in CI (smoke tests alone take ~3 min for 200 battles per gen). If this becomes too slow, split into "fast path" (data + stats + ground truth, ~30s) run on every PR and "full path" (all suites) run nightly or on PRs touching `packages/`
