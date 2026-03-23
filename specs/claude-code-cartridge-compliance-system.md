# Claude Code Spec: Cartridge Compliance System v3

## Goal

Build an automated cartridge compliance system that mechanically proves each generation matches its source-of-truth implementation. This is one unified system — oracle validation, compliance tracking, CI reporting, and a `/compliance` subagent command.

**Scope**: All 9 generations are fully implemented as of 2026-03. This spec covers the compliance system for Gen 1-9. It was originally drafted for Gen 1-2 (Phase 2) and updated in v3 to cover the complete codebase.

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
| 6 | Showdown + Bulbapedia | https://github.com/smogon/pokemon-showdown | **Medium** | Same as Gen 5. Fairy type introduced. Mega Evolution introduced. Knock Off 1.5× boost introduced. |
| 7 | Showdown + Bulbapedia | https://github.com/smogon/pokemon-showdown | **Medium** | Z-Moves, Alolan Forms, Ultra Burst. Terrain boost is 1.5× (not 1.3× — see ERRATA #17). Paralysis speed halved (see ERRATA #14). Parental Bond second hit nerfed to 25% (was 50% in Gen 6 — see ERRATA #12). |
| 8 | Showdown + Bulbapedia | https://github.com/smogon/pokemon-showdown | **Medium** | Dynamax/Gigantamax, Galarian Forms. Terrain boost nerfed to 1.3×. Libero/Protean activate every move (nerfed in Gen 9 — see ERRATA #23). |
| 9 | Showdown + Bulbapedia | https://github.com/smogon/pokemon-showdown | **Medium** | Terastallization, Snow replaces Hail, Libero/Protean once-per-switch-in. Tera STAB: base types retain 1.5× (see ERRATA #30). Adaptability caps at 2.0×/2.25× (not 3×/4× — see ERRATA #26). |

**Rules**:
1. When pret disassembly says X and Showdown says Y, we implement X and document the disagreement.
2. When Showdown intentionally patches a mechanic for competitive balance (e.g., sleep clause), document as `"resolution": "showdown-deviation"` — we implement cartridge behavior.
3. For Gen 5-9, when Bulbapedia documents cartridge behavior that differs from Showdown, prefer Bulbapedia and document the disagreement.
4. Oracles can also be wrong. If `@pkmn/data` has a bug that matches our bug, both pass but both are wrong. For Gen 1-3, spot-check 30+ canonical values against pret source. Track oracle bugs in `known-oracle-bugs.json`.
5. Before accepting any mechanic, check `specs/ERRATA.md` — it documents 30 categories of known errors found during implementation. See Part 4 for the ERRATA cross-reference.

---

## What Already Exists (Do Not Duplicate)

Before writing any test, check these existing files:

- `tools/replay-parser/src/simulation/battle-runner.ts` — AI-vs-AI smoke tests, 14 structural invariants (10 active, 2 stubs, 1 partial). **Currently Gen 1-2 only** — extending to Gen 3-9 is PR 4 work.
- `packages/gen1/tests/deep-dive-validation.test.ts` — 51 ground-truth oracle tests against Bulbapedia. **Gen 1 only.** No equivalent exists for Gen 2-9.
- `packages/gen1/tests/replay-validation.test.ts` — dynamic tests covering 15 Gen 1 Showdown replays. **Gen 1 only.**
- `packages/*/tests/stat-calc.test.ts`, `damage-calc.test.ts`, `type-chart.test.ts`, `data-validation.test.ts` — exist across all gens

These existing test files should NOT be modified. The oracle validation suite is new and separate.

---

## Part 1: Oracle Validation Harness

### 1.1: Dependencies

Pin exact versions (not ranges) to prevent oracle updates from breaking CI without code changes:

```bash
# IMPORTANT: The version numbers below are PLACEHOLDERS. Look up the actual latest
# versions on npm at implementation time. Pin to exact versions (no ^ or ~).
# As of early 2026, @pkmn packages are in the 0.x range (e.g., @pkmn/data@0.10.x).
# NOTE: @pkmn/data and @pkmn/dex are already installed in tools/data-importer/ at
# ^0.10.7 — use the same version here but pin exactly (no ^).
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
    compare-mechanics.ts     # Priority, abilities, status, field effects, items, stat stages
    compare-gimmicks.ts      # NEW: Mega Evolution, Z-Moves, Dynamax, Terastallization
    compare-terrain.ts       # NEW: Electric/Grassy/Misty/Psychic terrain validation
    battle-replay.ts
    damage-trace.ts          # Turn-by-turn HP delta comparison
    reporter.ts              # Reads JSON results, generates compliance summary
    result-schema.ts         # Zod schema for results JSON validation
  tests/
    type-chart-oracle.test.ts
    species-oracle.test.ts
    move-oracle.test.ts
    damage-oracle.test.ts
    stat-oracle.test.ts
    mechanics-oracle.test.ts
    gimmicks-oracle.test.ts  # NEW
    terrain-oracle.test.ts   # NEW
    battle-oracle.test.ts
    damage-trace.test.ts
  data/
    replays/                  # Committed Showdown replays (JSON format)
      gen1/                   # gen1-replay-01.json through gen1-replay-15.json (already exist as .log)
      gen2/                   # gen2-replay-01.json through gen2-replay-15.json (to be added)
      gen3/
      gen4/
      gen5/
      gen6/
      gen7/
      gen8/
      gen9/
    known-disagreements/      # Per-gen disagreement files (see 1.10)
      gen1-known-disagreements.json
      gen2-known-disagreements.json
      gen3-known-disagreements.json
      gen4-known-disagreements.json
      gen5-known-disagreements.json
      gen6-known-disagreements.json
      gen7-known-disagreements.json
      gen8-known-disagreements.json
      gen9-known-disagreements.json
    known-oracle-bugs.json    # Cases where oracle itself is wrong (verified against pret/Bulbapedia)
    edge-case-scenarios/      # Hand-written scenarios for known edge cases (20-25 per gen)
      gen1-edge-cases.json
      gen2-edge-cases.json
      gen3-edge-cases.json
      gen4-edge-cases.json
      gen5-edge-cases.json
      gen6-edge-cases.json
      gen7-edge-cases.json
      gen8-edge-cases.json
      gen9-edge-cases.json
    ground-truth/             # Canonical values per gen verified against authoritative source
      gen1-ground-truth.json  # Verified against pret/pokered
      gen2-ground-truth.json  # Verified against pret/pokecrystal
      gen3-ground-truth.json  # Verified against pret/pokeemerald
      gen4-ground-truth.json  # Verified against pret/pokeplatinum (where decompiled)
      gen5-ground-truth.json  # Verified against Showdown + Bulbapedia (medium confidence)
      gen6-ground-truth.json
      gen7-ground-truth.json
      gen8-ground-truth.json  # Already exists at specs/reference/gen8-ground-truth.md — convert to JSON
      gen9-ground-truth.json
  results/                    # Committed to repo as regression baseline, updated by runner
    gen1-compliance.json
    gen2-compliance.json
    gen3-compliance.json
    gen4-compliance.json
    gen5-compliance.json
    gen6-compliance.json
    gen7-compliance.json
    gen8-compliance.json
    gen9-compliance.json
```

### 1.3: Configuration and Gen Discovery

**Gen Discovery** (`src/gen-discovery.ts`):

A gen is "implemented" if ALL of these exist:
1. `packages/genN/` directory exists
2. `packages/genN/src/index.ts` exists
3. `packages/genN/data/` contains: `pokemon.json`, `moves.json`, `type-chart.json`
4. `packages/genN/package.json` exists and lists `@pokemon-lib-ts/core` and `@pokemon-lib-ts/battle` as dependencies

All four checks are simple filesystem operations (no TypeScript compilation needed). If a gen is partially implemented (e.g., directory exists but data files missing), log a WARNING and skip.

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
- **`runner.ts` (primary)**: The CLI orchestrator. `npm run compliance` invokes this. It discovers gens, runs suites, writes structured JSON results, and prints a summary.
- **`vitest` (secondary)**: The test files in `tests/` are standard vitest tests for developer ergonomics, watch mode, and IDE integration. They do NOT write results JSON.

Both use the same underlying comparison logic in `src/`.

**CLI Flags**:

```bash
npx tsx runner.ts --suite all                    # All suites, all implemented gens
npx tsx runner.ts --gen 1 --suite all            # All suites, Gen 1 only
npx tsx runner.ts --suite data                   # Data suite, all gens
npx tsx runner.ts --gen 2 --suite damage         # Damage suite, Gen 2 only
npx tsx runner.ts --suite data --suite damage    # Multiple suites, all gens
npx tsx runner.ts --suite fast                   # Fast path: data + stats + groundTruth only
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

Validate results JSON with Zod schema (`src/result-schema.ts`) before the reporter consumes them.

### 1.4: Data Validation Suites

**Type Chart Comparison** — For each implemented gen:
1. Load our type chart from `packages/genN/data/type-chart.json`
2. Load from `@pkmn/data`: `new Generations(Dex).get(N).types`
3. Compare every single-type attacker vs single-type defender pair
4. ALSO verify dual-type cross-check: for 20 representative dual-type defenders per gen, compute combined effectiveness and verify our engine applies type modifiers sequentially (not as a single float multiply)
5. Verify type count: Gen 1 = 15 types, Gen 2-5 = 17 types (Dark + Steel), Gen 6+ = 18 types (Fairy added). Fairy must NOT appear in type chart for Gen 1-5.
6. Clear failure messages: `"Gen 1: Fire→Grass: ours=2x, @pkmn=2x ✓"` or `"Gen 1: Ghost→Psychic: ours=0x, @pkmn=2x (known disagreement, cartridge-accurate) ⊘"`

**Species Data Comparison** — For each implemented gen:
1. Load our `packages/genN/data/pokemon.json`
2. Load from `@pkmn/data`: `gen.species.get(name)`
3. Compare these fields explicitly:

| Gen Range | Fields to Compare |
|-----------|------------------|
| Gen 1-2 | id, name, types (both), baseStats (hp, atk, def, spc, spe for Gen 1; hp, atk, def, spa, spd, spe for Gen 2), weight |
| Gen 3-4 | id, name, types (both), baseStats (hp, atk, def, spa, spd, spe), abilities (primary, secondary), weight |
| Gen 5+ | id, name, types (both), baseStats (hp, atk, def, spa, spd, spe), abilities (primary, secondary, hidden), weight |

4. **Hidden abilities** (Dream World, introduced Gen 5): only compare `hidden` ability field for Gen 5+. Do not expect a hidden ability field for Gen 3-4 data.
5. **Form data**: Forms that affect battle mechanics must be correct. Specifically:
   - Mega Evolutions (Gen 6+): verify Mega form stat blocks exist in our data and match `@pkmn/data`
   - Alolan Forms (Gen 7): verify type changes and stat blocks
   - Galarian Forms (Gen 8): verify type changes and stat blocks
   - Paldean Forms (Gen 9): verify type changes and stat blocks
   - Ignore: egg groups, flavor text, non-battle form differences
6. Flag stat changes between gens for the same Pokemon (e.g., Charizard SpA changes Gen 3→4)

**Move Data Comparison** — For each implemented gen:
1. Load our `packages/genN/data/moves.json`
2. Load from `@pkmn/data`: `gen.moves.get(name)`
3. Compare: basePower, accuracy, pp, type, priority, category (physical/special in Gen 4+, type-derived in Gen 1-3)
4. **Accuracy normalization**: Showdown stores accuracy as a percentage. Before comparing, check the actual format in `moves.json`. Moves that never miss (accuracy = null) → match against our 0 or null.
5. **Z-Move power validation (Gen 7+)**: For each Z-Move, verify base power maps correctly to the 11-range table (ERRATA Category 15). The table: BP 0→100, 1-59→100, 60-69→120, 70-79→140, 80-89→160, 90-99→175, 100-109→180, 110-119→185, 120-129→190, 130-139→195, 140+→200.
6. **Max Move power validation (Gen 8)**: Verify Max Move power uses the DUAL table — Fighting/Poison use a lower table, all others use a higher table (ERRATA Category 20). Flamethrower (90 BP) → Max Flare 130, not 85.
7. Moves in our data but not in oracle (or vice versa) → FAIL with clear message

### 1.5: Damage Oracle Suite

**Design**: Two tiers of scenarios — programmatically generated (broad coverage) and hand-written edge cases (deep coverage). These are ADDITIVE: Tier 1 generates 100+ scenarios, Tier 2 adds 20-25 hand-written edge cases on top.

**Tier 1: Generated Scenarios (100+ per gen)**

Write a scenario generator (`src/compare-damage.ts`) that automatically creates test cases:

```typescript
// DETERMINISTIC generation — use a fixed seed so scenarios are stable across runs.
const rng = seedrandom('pokemon-oracle-scenarios');

// For each implemented gen:
// 1. Pick 30 representative species using seeded RNG (mix of types, stat distributions)
// 2. For each species, pick 3 moves (STAB, off-type, coverage) — deterministic selection
// 3. For each move, create scenarios at levels 50 and 100
// 4. Vary spreads: perfect DVs/IVs, zero DVs/IVs, competitive spread
// 5. Compute expected damage from @smogon/calc
// 6. Compare against our engine
```

**Tier 2: Hand-Written Edge Cases (20-25 per gen)**

Store in `data/edge-case-scenarios/genN-edge-cases.json`. The following scenarios are required. Scenarios marked with an ERRATA reference catch a documented spec error if it regresses.

**Gen 1 edge cases** (ERRATA Categories 3, 4, 7):
1. STAB + 4x super effective (stacked multipliers, sequential floor — ERRATA #3C)
2. Critical hit (ignores stat stages and Reflect/Light Screen, uses base Speed)
3. Burned attacker, physical move (Atk halved)
4. Max damage roll (255/255)
5. Min damage roll (217/255)
6. Level 1 attacker (edge case for integer division)
7. Level 100 max stats (overflow check)
8. Fixed damage (Seismic Toss = level, Dragon Rage = 40, Sonic Boom = 20)
9. Struggle recoil (50% max HP Gen 1)
10. Self-Destruct/Explosion (defense halved)
11. Ghost→Psychic immunity (0x, cartridge bug — verify NOT 2x)
12. 1/256 miss chance (Swift hits 1000/1000; Thunderbolt misses ~1/256 with seeded PRNG)
13. Focus Energy bug (crit rate LOWER with Focus Energy active, not higher)
14. Reflect/Light Screen (halves physical/special damage)
15. Dual-type sequential effectiveness (floor between each type, not combined multiply — ERRATA #3C)

**Gen 2 edge cases** (ERRATA Category 4):
1. Gen 2 DV system (HP DV derived from other DVs)
2. Gen 2 Stat Exp with sqrt formula (ERRATA #1)
3. Freeze thaw: 25/256 per turn (~9.77%, not 20%) — verify with seeded PRNG (ERRATA #4)
4. Light Ball doubles Pikachu's Special Attack
5. Leftovers heals BEFORE status damage (end-of-turn ordering)
6. Toxic escalation (1/16 → 2/16 → 3/16 per turn)
7. Leech Seed drains 1/8 max HP (Gen 2+, was 1/16 in Gen 1)
8. Weather damage (Sandstorm 1/16 per turn to non-Rock/Steel/Ground types)

**Gen 3 edge cases** (ERRATA Category 8):
1. Ability-modified damage: Flash Fire boosted Fire move
2. Levitate grants Ground immunity (verify 0x vs Earthquake)
3. Thick Fat halves Fire and Ice damage
4. Iron Fist boost list (verify correct 15 moves — ERRATA #8)
5. Multi-hit distribution: 37.5/37.5/12.5/12.5 (Gen 3-4 specific — ERRATA #10)
6. Protect consecutive use (4-tier cap — ERRATA #9)
7. Struggle recoil (25% max HP, Gen 3+ formula)
8. Weather + Swift Swim interaction (Speed doubles in Rain)

**Gen 4 edge cases** (ERRATA Categories 7, 9, 10):
1. Physical/Special split: Crunch is Physical (was Special in Gen 1-3), Flamethrower is Special
2. Stealth Rock type effectiveness tiers (4x weak = 50% HP, 2x weak = 25%, neutral = 12.5%, 2x resist = 6.25%, 4x resist = 3.125%)
3. Trick Room priority reversal for bracket-0 moves (ERRATA #7: Trick Room = priority -7)
4. Protect consecutive rate (4 tiers: 100% → 50% → 25% → 12.5% cap — ERRATA #9)
5. Feint's +2 priority (ERRATA #7: new in Gen 4)
6. Knock Off does NOT get 1.5x boost in Gen 4 (boost is Gen 6+ — ERRATA #25)

**Gen 5 edge cases** (ERRATA Categories 9, 10):
1. Sheer Force: suppresses secondary effects AND Life Orb recoil when triggered
2. Sturdy at full HP: survives OHKO with 1 HP
3. Multi-hit distribution: 35/35/15/15 (changed from Gen 4's 37.5/37.5/12.5/12.5 — ERRATA #10)
4. ExtremeSpeed priority: +2 in Gen 5 (was +1 in Gen 1-4 — ERRATA #7)
5. Protect consecutive rate: doubling (2→4→8→256, then ~0 — ERRATA #9)
6. Magic Bounce: reflects status moves back to sender
7. Prankster: +1 priority for status moves

**Gen 6 edge cases** (ERRATA Categories 12, 18, 25):
1. Mega Evolution stat changes in damage calc (Charizard-X: Base Atk 130 not 84)
2. Mega Evolution persists through switches — not reverted on switch-out (ERRATA #18)
3. Parental Bond double hit: 50% second hit in Gen 6 (not 25% — ERRATA #12)
4. Fairy type chart: Fairy deals 2x to Dragon/Fighting/Dark, 0.5x to Fire/Poison/Steel (ERRATA #11)
5. Knock Off 1.5x boost introduced in Gen 6 (ERRATA #25)
6. Protect consecutive rate: tripling (3→9→27→729 — ERRATA #9)
7. Gale Wings: ALL Flying moves +1 priority, no HP condition (HP condition is Gen 7+ — ERRATA #13)

**Gen 7 edge cases** (ERRATA Categories 12, 14, 15, 16, 17):
1. Z-Move base power from correct 11-range table (ERRATA #15): verify Close Combat (120 BP) → 190 Z-power, not 180
2. Status Z-Moves: grant stat boost, do NOT become damage moves (ERRATA #16)
3. Z-Move + Protect: deals 25% damage through Protect
4. Terrain boost: 1.5x in Gen 7 (not 1.3x — ERRATA #17)
5. Parental Bond: 25% second hit in Gen 7 (nerfed from Gen 6's 50% — ERRATA #12)
6. Paralysis speed: 50% reduction in Gen 7 (not 25% — ERRATA #14)
7. Disguise: absorbs one hit, form changes to Busted
8. Gale Wings Gen 7: requires full HP (ERRATA #13)

**Gen 8 edge cases** (ERRATA Categories 19, 20, 21, 23):
1. Dynamax HP formula: 1.5 + (dynamaxLevel × 0.05), so level 0 = 1.5× max HP (ERRATA #19)
2. Max Flare (Fire, 90 BP) → 130 power (higher table — ERRATA #20)
3. Max Knuckle (Fighting, 90 BP) → 90 power (lower table — ERRATA #20)
4. G-Max Wildfire: deals residual fire damage, does NOT set Sunny weather (ERRATA #21)
5. Libero/Protean: activates every move (NOT once-per-switch — that's Gen 9 — ERRATA #23)
6. Neutralizing Gas: all abilities suppressed while active
7. Body Press: 80 BP (not 130 — ERRATA #22)

**Gen 9 edge cases** (ERRATA Categories 23, 26, 27, 28, 29, 30):
1. Tera STAB: base types retain 1.5× STAB after Terastallization — Fire/Flying Charizard with Fire Tera still has 1.5× STAB on Flying moves (ERRATA #30)
2. Adaptability + Tera: base type STAB = 2.0×, Tera type STAB = 2.25× (not 3×/4× — ERRATA #26)
3. Libero/Protean: once per switch-in (ERRATA #23)
4. Stellar Tera: one-time 2× per type, Tera Blast gets 100 BP with -1 Atk/-1 SpA
5. Salt Cure: 1/8 max HP per turn; 1/4 if target is Water or Steel type
6. Supreme Overlord: 10% per fainted ally, max 50%
7. Protosynthesis/Quark Drive: Speed gets 50% boost (other stats get 30% — ERRATA #28)
8. Electric Terrain: prevents Sleep, boosts Electric 1.3×; does NOT halve speed or heal Electric types (ERRATA #27)
9. Orichalcum Pulse: sets Sun + 33% Atk boost; does NOT change move type (ERRATA #29)

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

Gen 3-6 use IVs, EVs, and natures:
```json
{
  "id": "gen3-stab-super-effective",
  "gen": 3,
  "attacker": { "species": "Blaziken", "level": 50, "ivs": { "atk": 31 }, "evs": { "atk": 252 }, "nature": "adamant" },
  "defender": { "species": "Abomasnow", "level": 50, "ivs": { "def": 31 }, "evs": { "hp": 252 } },
  "move": "Blaze Kick",
  "conditions": {},
  "note": "STAB Fire vs Grass/Ice"
}
```

Gen 7+ include optional gimmick flags:
```json
{
  "id": "gen7-z-move-close-combat",
  "gen": 7,
  "attacker": { "species": "Lucario", "level": 50, "ivs": { "atk": 31 }, "evs": { "atk": 252 }, "nature": "jolly" },
  "defender": { "species": "Ferrothorn", "level": 50, "ivs": { "def": 31 }, "evs": { "hp": 252 } },
  "move": "Close Combat",
  "conditions": { "zMove": true },
  "note": "Z-Close Combat (190 BP per 11-range table) STAB vs Grass/Steel — verifies ERRATA #15"
}
```

```json
{
  "id": "gen9-tera-fire-stab-retention",
  "gen": 9,
  "attacker": { "species": "Charizard", "level": 50, "tera": "fire", "terastallized": true, "ivs": { "spa": 31 }, "evs": { "spa": 252 }, "nature": "modest" },
  "defender": { "species": "Ferrothorn", "level": 50, "ivs": { "spd": 31 }, "evs": { "hp": 252 } },
  "move": "Air Slash",
  "conditions": {},
  "note": "Fire Tera Charizard: Flying STAB should still be 1.5× (base type retained) — verifies ERRATA #30"
}
```

Validate scenario JSON schemas per gen — reject any with mismatched fields (e.g., `nature` on a Gen 1 Pokemon, `zMove` on a Gen 6 scenario).

**Comparison Logic**:

```typescript
const smogonResult = calculate(gen, smogonAttacker, smogonDefender, smogonMove, field);
const ourResult = ourDamageCalc(genRuleset, attacker, defender, move, field);

// Compare damage range with tolerance
const tolerance = Math.max(2, Math.floor(smogonResult.damage[0] * 0.02)); // ±2% or ±2, whichever is larger
expect(Math.abs(ourResult.minDamage - smogonResult.damage[0])).toBeLessThanOrEqual(tolerance);
```

Tolerance exists because `@smogon/calc` may use different rounding than cartridge. This is a SANITY CHECK, not a proof of correctness. For Gen 1-3, the pret disassembly is the actual proof.

**Pass threshold**: 98%+ of scenarios must match (not 95%). Remaining 2% must ALL be documented in known-disagreements files with citations.

### 1.6: Stat Calculation Comparison

Compare stat calculations for every species at 3 configurations:
1. Perfect (max DVs/IVs, max stat exp/EVs)
2. Zero (min everything)
3. Competitive spread (252/252/4 or equivalent stat exp)

At levels 1, 50, and 100. This catches formula bugs (ERRATA Category 1).

### 1.7: Mechanics Oracle Suite

This suite validates mechanics that data and damage comparisons miss. Each scenario runs a full battle through BattleEngine with scripted moves and validates the outcome. This is INTEGRATION testing — it catches bugs where individual functions work correctly but integration is wrong.

**1.7a: Move Priority Validation**

For each implemented gen:
1. Load all moves and their priority values from `@pkmn/data`
2. Compare against our `moves.json` priority values
3. Create 5+ controlled battle scenarios per gen testing priority brackets:
   - Quick Attack (+1) goes before Tackle (0)
   - Protect (+3 Gen 3+, +3 Gen 2) goes before Quick Attack
   - Gen 2: Protect = +3, Quick Attack = +2 (ERRATA #7)
   - Gen 4: Feint = +2, Trick Room = -7, Avalanche = -4 (ERRATA #7)
   - Gen 5: ExtremeSpeed = +2 (was +1 in Gen 1-4 — ERRATA #7)
   - Negative priority (Whirlwind -6) goes last
   - Trick Room reverses order for bracket-0 moves

**1.7b: Ability Validation (Gen 3+)**

For each implemented gen with abilities:
1. Load all abilities from `@pkmn/data`
2. Compare ability assignments per species (primary, secondary; hidden for Gen 5+)
3. Create 10+ damage scenarios that differ WITH vs WITHOUT key abilities.

**Core abilities (Gen 3-4)**:
- Levitate (Ground immunity)
- Thick Fat (Fire/Ice resistance)
- Flash Fire (Fire immunity + 50% boost)
- Intimidate (Attack drop on switch-in)
- Static (30% paralysis on contact)
- Synchronize (status reflection)
- Iron Fist (correct 15-move list — ERRATA #8)

**Gen 5+ abilities**:
- Sheer Force: suppresses secondary effects and Life Orb recoil when triggered
- Magic Bounce: reflects status moves (verify correct move list)
- Prankster: +1 priority for status moves; Dark types immune to Prankster moves in Gen 7+
- Sturdy at full HP: survives any one-hit KO (reworked in Gen 5 from Gen 3-4 behavior)
- Magic Guard: immune to all indirect damage (weather, hazards, status, recoil)
- Regenerator: restores 1/3 HP on switch-out
- Moody: raises one stat 2 stages, lowers another 1 stage per turn

**Gen 6+ abilities**:
- Parental Bond: second hit at 50% in Gen 6, 25% in Gen 7+ (ERRATA #12)
- Gale Wings: all Flying moves +1 priority in Gen 6 (full HP required in Gen 7+ — ERRATA #13)
- -ate abilities (Pixilate, Refrigerate, Aerilate, Galvanize): 20% boost + type change

**Gen 7+ abilities**:
- Disguise: absorbs one hit, transforms to Busted form
- Beast Boost: raises highest stat on KO
- Neutralizing Gas: suppresses all abilities while active

**Gen 9 abilities**:
- Protean/Libero: once-per-switch-in (was every move in Gen 8 — ERRATA #23)
- Protosynthesis: Speed gets 50% boost, others 30% (ERRATA #28)
- Quark Drive: same split as Protosynthesis (ERRATA #28)
- Orichalcum Pulse: sets Sun + Atk boost (does NOT change move type — ERRATA #29)
- Hadron Engine: sets Electric Terrain + SpA boost (does NOT change move type — ERRATA #29)

**1.7c: Status Effect Validation**

Create controlled scenarios testing:
1. Burn: Atk halved in damage calc; 1/16 HP Gen 1, 1/8 HP Gen 2-6, 1/16 HP Gen 7+ (ERRATA #4)
2. Paralysis: Speed ×0.25 Gen 1-6, Speed ×0.5 Gen 7+ (ERRATA #14); 25% full paralysis chance
3. Poison: 1/16 HP Gen 1, 1/8 HP Gen 2+; Toxic escalates 1/16→2/16→3/16 per turn (ERRATA #4)
4. Freeze: No natural thaw Gen 1 (ERRATA #4); 25/256 per turn Gen 2 (ERRATA #4, Showdown bug: no thaw); 20% (1/5) Gen 3+
5. Sleep: 1-7 turns Gen 1-2; 2-5 turns Gen 3; 1-5 turns Gen 4; 1-3 turns Gen 5+ (ERRATA #4)
6. Confusion: self-hit chance 50% Gen 1-6, 33% Gen 7+; duration 2-5 turns all gens (ERRATA #4)

**1.7d: Field Effect Validation (weather and screens)**

Create controlled scenarios testing:
1. Weather damage modifiers (Rain+Water 1.5x, Sun+Fire 1.5x, Sun+Water 0.5x)
2. Weather + move accuracy (Thunder 100% in Rain, SolarBeam weakened in Rain)
3. Reflect/Light Screen damage reduction (correct percentage per gen)
4. Multiple field effects simultaneously (Reflect + Rain)
5. Weather duration: move-summoned = 5 turns base, 8 with weather rock (ERRATA #24). Ability-summoned = permanent Gen 3-5, 5/8 turns Gen 6+ (ERRATA #24)
6. Sandstorm damage (Gen 2+): 1/16 per turn to non-Rock/Steel/Ground types
7. Hail damage (Gen 3-8): 1/16 per turn to non-Ice types
8. Snow (Gen 9): replaces Hail, no chip damage; doubles Defense for Ice types

**1.7e: Held Item Effect Validation (Gen 2+)**

Compare item effects against `@pkmn/data`:
1. Type-boosting items (Charcoal, Mystic Water — 1.1x Gen 2, 1.2x Gen 3+)
2. Stat-boosting items (Choice Band 1.5x Atk, Choice Specs 1.5x SpA)
3. Damage-calculating items (Life Orb 1.3x + 10% recoil; Sheer Force suppresses Life Orb recoil — verify)
4. Light Ball Pikachu, Thick Club Marowak
5. Berry healing (Sitrus Berry HP restoration)
6. Knock Off boost (1.5x damage introduced Gen 6, not Gen 5 — ERRATA #25)

**1.7f: Stat Stage Validation**

Test stat boost/drop mechanics:
1. Swords Dance: +2 Attack stages
2. Screech: -2 Defense stages
3. Stat stage caps (±6)
4. Stat multiplier application in damage calc
5. Critical hits ignoring negative Attack/positive Defense stages (Gen 2+)
6. Adaptability with Tera STAB: 1.5×→2.0×, 2.0×→2.25× (not 3×/4× — ERRATA #26)

**1.7g: Gen 1-2 Unique Mechanics (MANDATORY for Gen 1-2 compliance)**

Gen 1 specific:
1. 1/256 miss chance — Swift hits 1000/1000; Thunderbolt misses ~1/256. Use seeded PRNG.
2. Badge stat boosts — verify damage with and without badges if implemented.
3. Focus Energy bug — crit rate is LOWER with Focus Energy active.
4. Critical hit formula — uses base Speed, ignores stat stages and Reflect/Light Screen.
5. Ghost→Psychic immunity — 0x (cartridge bug). Verify Lick vs Alakazam = 0 damage.

Gen 2 specific:
1. DV system — HP DV derived from other DVs. Verify HP DV calculation.
2. Stat Exp — uses sqrt formula, not linear. Verify `floor(ceil(sqrt(statExp)) / 4)` (ERRATA #1).
3. Freeze thaw — 25/256 per turn (~9.77%). Use seeded PRNG. Showdown gen2 mod has a known bug (no random thaw) — our implementation should match cartridge, not Showdown here.
4. Light Ball doubles Pikachu's Special Attack (not Speed). Verify damage calc.
5. Leftovers heals BEFORE status damage (competitively significant ordering). Verify end-of-turn sequence.

**1.7h: Multi-Turn State Validation**

Bugs in state tracking only appear after multiple turns. Run 5+ turn scripted battles validating:

1. Toxic counter escalation: 1/16 → 2/16 → 3/16 → ... per turn. Record HP delta each turn.
2. Sleep counter: verify Pokemon wakes after correct number of turns per gen (ERRATA #4). Use seeded PRNG.
3. Confusion counter: verify confusion ends after correct turns; verify self-hit damage on confused turns.
4. Perish Song countdown: 3 → 2 → 1 → faint.
5. Encore duration: verify move lock expires after correct turns.
6. Disable duration: verify move restriction expires correctly.
7. **Dynamax (Gen 8)**: 3-turn countdown. Verify Pokemon reverts to base form after 3 turns. Verify HP returns from Dynamax max HP to pre-Dynamax max HP. Verify Max Move effects (weather, terrain) persist after revert.
8. **Terrain/weather from gimmick sources**: verify terrain set by G-Max moves persists for the correct duration (5 or 8 turns with extender).

**1.7i: Switch-In Mechanics Validation (Gen 2+)**

1. Entry hazards: Spikes (Gen 2: 1 layer only = 1/8 HP; Gen 3+: 1 layer = 1/8, 2 layers = 1/6, 3 layers = 1/4). Verify correct gen-specific values.
2. Stealth Rock (Gen 4+ only): damage = (1/8 max HP) × type effectiveness. 4x weak = 50%, 2x weak = 25%, neutral = 12.5%, 2x resist = 6.25%, 4x resist = 3.125% max HP. Fairy type in Stealth Rock damage table only for Gen 6+ (ERRATA #6).
3. Toxic Spikes (Gen 4+): 1 layer = poison, 2 layers = toxic. Poison types absorb.
4. Sticky Web (Gen 6+): -1 Speed on grounded switch-in.
5. Intimidate: verify Attack drop on switch-in.
6. Weather damage on switch: Sandstorm/Hail deal 1/16 per turn to non-immune types after switch.
7. Pursuit on switch: verify 2x damage when target is switching out.

**1.7j: Terrain Validation (Gen 6+)**

Terrain is complex enough to warrant its own sub-section. Create 5+ controlled battle scenarios per terrain type.

1. **Electric Terrain** (Gen 6+):
   - Prevents Sleep for grounded Pokemon
   - Boosts Electric-type moves: 1.5× in Gen 7, 1.3× in Gen 8+ (ERRATA #17)
   - Does NOT halve speed of Pokemon; does NOT heal Electric types (ERRATA #27)
   - Tapu Koko's Electric Surge sets on switch-in

2. **Grassy Terrain** (Gen 6+):
   - 1/16 HP heal per turn for grounded Pokemon
   - Boosts Grass moves: 1.5× in Gen 7, 1.3× in Gen 8+
   - Halves damage from Earthquake, Bulldoze, and Magnitude

3. **Misty Terrain** (Gen 6+):
   - Prevents status conditions for grounded Pokemon
   - Halves damage from Dragon-type moves vs grounded Pokemon (NOT "reduces all damage" — ERRATA #27)
   - Tapu Fini's Misty Surge sets on switch-in

4. **Psychic Terrain** (Gen 7+):
   - Prevents priority moves from targeting grounded Pokemon (Prankster moves, Quick Attack, etc.)
   - Boosts Psychic moves: 1.5× in Gen 7, 1.3× in Gen 8+
   - Does NOT extend by 1 turn (ERRATA #27)
   - Tapu Lele's Psychic Surge sets on switch-in

5. **Terrain duration**: 5 turns base, 8 turns with Terrain Extender

6. **Terrain + seed items**: Misty Seed, Electric Seed, Grassy Seed, Psychic Seed grant Defense or Sp.Def boost on correct terrain

7. **Terrain grounding**: Flying types and Pokemon with Levitate are not affected by terrain (and are not affected by Psychic Terrain's priority block)

**1.7k: Gimmick Validation (Gen 6+)**

Each gimmick has its own sub-suite. Gimmick files: `Gen6MegaEvolution.ts`, `Gen7MegaEvolution.ts`, `Gen7ZMove.ts`, `Gen8Dynamax.ts`, `Gen9Terastallization.ts`.

**Mega Evolution (Gen 6-7)**:
1. Stat changes apply immediately upon Mega Evolution
2. Mega Evolution persists through switches — NOT reverted on switch-out (ERRATA #18)
3. Only one Mega Evolution per team per battle
4. Speed recalculation: in Gen 6, a Pokemon acts at pre-Mega speed on the turn it Mega Evolves; in Gen 7, it acts at post-Mega speed
5. Type changes apply for damage calc (Charizard-X becomes Fire/Dragon, Charizard-Y remains Fire/Flying)
6. Mega stone item cannot be knocked off or swapped

**Z-Moves (Gen 7)**:
1. Z-Move power from correct 11-range table (ERRATA #15): BP 110-119 → 185, not 180
2. Status Z-Moves grant Z-Power bonus (stat boost/heal/etc.); do NOT become damage moves (ERRATA #16)
3. Z-Move + Protect: deals 25% damage through Protect (canBypassProtect returns a fraction)
4. Only one Z-Move per battle per team
5. Z-Crystal determines compatible Z-Move; species-specific Z-Crystals only work for that species

**Dynamax (Gen 8)**:
1. HP formula: `floor(baseMaxHP × (1.5 + dynamaxLevel × 0.05))` (ERRATA #19). Level 0 = 1.5×, Level 10 = 2.0×.
2. Max Move dual power table (ERRATA #20): verify Flamethrower (90 BP Fire) → 130 power, Close Combat (120 BP Fighting) → 95 power
3. Duration: exactly 3 turns, then auto-revert
4. Max Move secondary effects: Max Flare sets Sun, Max Quake raises SpDef on user's side, etc.
5. G-Max Wildfire: residual Fire damage for 4 turns, does NOT set Sunny weather (ERRATA #21)
6. No fabricated G-Max moves — every G-Max move must be verified against Showdown `data/moves.ts` (ERRATA #21)
7. Dynamax cannot be paired with Mega Evolution or Z-Moves in the same battle

**Terastallization (Gen 9)**:
1. Tera STAB: original types retain 1.5× STAB after Tera (ERRATA #30)
2. Tera type gets: 1.5× STAB if it doesn't match original types; 2.0× STAB if it matches an original type
3. Adaptability with Tera: base type STAB 1.5×→2.0×, Tera match 2.0×→2.25× (ERRATA #26)
4. Stellar Tera type: one-time 2× multiplier per type; Tera Blast with Stellar = 100 BP + -1 Atk + -1 SpA after use
5. Tera persists for the rest of the battle; can be used once per battle per Pokemon

**1.7l: Room and Gravity Effects (Gen 4+)**

Room effects and Gravity exist in BattleState (`trickRoom`, `magicRoom`, `wonderRoom`, `gravity`) with duration tracking. Create 2+ controlled scenarios per effect.

1. **Trick Room** (Gen 4+, priority -7):
   - Reverses turn order for priority bracket 0 moves only (slower Pokemon moves first)
   - Higher-priority moves still go in their normal order
   - Duration: 5 turns

2. **Magic Room** (Gen 5+):
   - All held items are suppressed (cannot activate or provide stat boosts)
   - Duration: 5 turns

3. **Wonder Room** (Gen 5+):
   - Swaps Defense and Special Defense stats for all active Pokemon
   - Duration: 5 turns

4. **Gravity** (Gen 4+):
   - Grounds all Pokemon (Flying types and Levitate users lose immunity to Ground moves)
   - Disables certain moves (Fly, Bounce, Sky Drop, Splash, Jump Kick, High Jump Kick)
   - Accuracy multiplied by 5/3 for all moves
   - Duration: 5 turns

### 1.8: Battle Replay Comparison

**Current state**: 15 Gen 1 replays exist as `.log` files in `tools/replay-parser/replays/gen1/`. No replays exist for Gen 2-9. The replay-parser currently only handles Gen 1 format. Extending to Gen 2-9 is PR 4 work.

**Tier 1: Structural Replay Validation**

Target: 15+ replays per gen. Verify:
- Same Pokemon faint at same turns
- Same winner
- No HP < 0 or > max HP
- No impossible status states

Download replays from `https://replay.pokemonshowdown.com/` (raw log format). Convert to JSON using the existing `tools/replay-parser/` infrastructure (needs extension to Gen 2-9 in PR 4). Commit converted JSON to `data/replays/genN/genN-replay-NN.json`. No network access in CI.

**Replay selection** — for each gen, include replays covering:
- 3+ with weather mechanics (gen-appropriate: Sandstorm, Rain, Sun, Snow/Hail)
- 3+ with status conditions (burn, sleep, paralysis)
- 3+ with varied move types (fixed damage, multi-hit, status moves)
- 3+ that go to 20+ turns (tests end-of-turn logic)
- 3+ with entry hazards (Spikes Gen 2+, Stealth Rock Gen 4+)
- For Gen 3+: 3+ with ability interactions
- For Gen 6+: 3+ with gimmick usage (Mega Evolution, Z-Move, Dynamax, Tera as applicable)

**Tier 2: Damage Trace Validation**

For 5-10 controlled battles per gen with a fixed seed:
1. Define fixed teams and a scripted move sequence
2. Run through our engine and record turn-by-turn: HP before, damage dealt, HP after, who moved first, status applied, ability triggered, end-of-turn effects and their ORDER
3. Compare damage against `@smogon/calc` for turns 1-3 (later turns are advisory — state becomes self-referential)
4. Validate end-of-turn event ORDER against the expected sequence (e.g., Gen 2: Leftovers → poison/burn → weather)
5. Validate invariants: HP never goes negative, HP never exceeds max, status transitions are legal

Any invariant violation → FAIL. End-of-turn event in wrong order → FAIL. Damage deltas on turns 1-3 beyond ±2 → FAIL.

**Implementation**: Post-process the existing BattleEvent stream (do NOT modify the battle engine). Write a trace extractor in `tools/oracle-validation/src/damage-trace.ts` that consumes `BattleEvent[]` and extracts per-turn state diffs.

### 1.9: Ground Truth Validation

Maintain `data/ground-truth/genN-ground-truth.json` with 30+ canonical values verified against the authoritative source for that gen.

**Confidence levels by gen:**
- Gen 1-3: Cartridge-accurate (pret disassemblies). Values here override any oracle disagreement.
- Gen 4: High (~75% where decompiled to C). Cross-reference Showdown for anything not yet decompiled.
- Gen 5-9: Medium (Showdown + Bulbapedia). A disagreement may indicate our bug OR Showdown's deviation from cartridge.

**Status of ground truth docs:**
- Gen 1: `specs/reference/gen1-ground-truth.md` exists — convert to JSON format
- Gen 2: `specs/reference/gen2-ground-truth.md` exists — convert to JSON format
- Gen 3: Needs creation — use pret/pokeemerald as primary source
- Gen 4: Needs creation — use pret/pokeplatinum where decompiled, Showdown fallback
- Gen 5-9: Needs creation — use Showdown + Bulbapedia
- Gen 8: `specs/reference/gen8-ground-truth.md` exists — convert to JSON format

```json
{
  "gen": 1,
  "source": "pret/pokered",
  "confidence": "cartridge",
  "verifiedDate": "2026-03-15",
  "species": [
    { "name": "Charizard", "hp": 78, "atk": 84, "def": 78, "spc": 85, "spe": 100, "source": "data/pokemon/base_stats/charizard.asm" }
  ],
  "typeChart": [
    { "atk": "Ghost", "def": "Psychic", "effectiveness": 0, "source": "engine/battle/typechart.asm", "note": "Cartridge bug: Ghost immune to Psychic" }
  ],
  "moves": [
    { "name": "Thunderbolt", "power": 95, "accuracy": 100, "pp": 15, "type": "Electric", "source": "data/moves/moves.asm" }
  ]
}
```

These are validated against pret/Showdown, not `@pkmn/data`. They serve as the ultimate sanity check — if both oracle and our data agree but disagree with ground truth, both are wrong.

### 1.10: Known Disagreements

**Per-gen files** — as the codebase grows to 9 gens, a single monolithic file becomes unwieldy. Use separate files per gen: `data/known-disagreements/gen1-known-disagreements.json` through `gen9-known-disagreements.json`. The runner loads all applicable files for the gen under test.

**`known-disagreements/genN-known-disagreements.json`** — Our engine vs oracle (we're right, oracle differs):

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
    "id": "gen2-freeze-no-random-thaw",
    "gen": 2,
    "description": "@pkmn/sim gen2 mod has no random thaw for Freeze (Showdown known bug). Cartridge has 25/256 per turn.",
    "oracleValue": "no-thaw",
    "cartridgeValue": "25/256-per-turn",
    "source": "pret/pokecrystal engine/battle/core.asm",
    "sourceUrl": "https://github.com/pret/pokecrystal/blob/master/engine/battle/core.asm",
    "oraclePackage": "@pkmn/sim@<version>",
    "addedDate": "2026-03-15"
  }
]
```

**Disagreement matching logic**:
1. Each known disagreement has a unique `id`. The `id` is the primary match key.
2. When a test finds a mismatch, look up the applicable gen's `genN-known-disagreements.json` by the test's computed `id`
3. If found and values match → SKIP (expected disagreement)
4. If found but values DON'T match → FAIL (disagreement changed — investigate)
5. If NOT found → FAIL with "NEW DISAGREEMENT DETECTED: [id] — investigate before adding to known-disagreements file"

**Staleness detection**: On each run, check every known disagreement's `id` against current test results. If our value now matches the oracle, add the `id` to `staleDisagreements` in results JSON. A gen with any stale disagreements is NOT COMPLIANT.

**Cartridge bug verification**: For each entry where `resolution` = "cartridge-accurate", add a specific test that FAILS if the bug is NOT correctly implemented.

---

## Part 2: Compliance Automation

### 2.1: The Compliance Reporter (`src/reporter.ts`)

After all suites run, the reporter reads `results/genN-compliance.json` and generates a compliance report.

**COMPLIANCE.md is NOT committed to the repo.** Instead:
- During local dev: `npm run compliance` prints a summary to stdout and writes `results/compliance-summary.json`
- In CI: the workflow posts a compliance summary as a PR comment (via `gh pr comment`)
- The `/compliance` subagent reads `results/` directly

**Spec Verified Column**: The reporter reads `specs/SPEC-STATUS.md` and looks for the table row matching `battle/NN-genN.md`. If the Status column says `**VERIFIED**`, the gen's spec is marked verified.

### 2.2: Results JSON Schema

**Scale context**: The oracle runs cover substantial data volumes.

| Gen | Species | Moves | Type cells |
|-----|---------|-------|-----------|
| 1 | 151 | 165 | 225 (15×15) |
| 2 | 251 | 251 | 324 (18×18) |
| 5 | 649 | 559 | 324 (18×18) |
| 9 | 1025 | 900+ | 324 (18×18) |

This affects timing estimates — see CI Integration (2.4).

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
    "damage": { "status": "pass", "total": 130, "passed": 128, "failed": 0, "skipped": 2, "knownDisagreements": 2 },
    "stats": { "status": "pass", "total": 453, "passed": 453, "failed": 0, "skipped": 0, "knownDisagreements": 0 },
    "mechanics": { "status": "pass", "total": 55, "passed": 55, "failed": 0, "skipped": 0, "knownDisagreements": 0 },
    "terrain": { "status": "skipped", "skipReason": "Gen 1 has no terrain", "total": 0 },
    "gimmicks": { "status": "skipped", "skipReason": "Gen 1 has no gimmicks", "total": 0 },
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
- ALL applicable suites have status "pass" (skipped suites show as ⬜, not ✅)
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
    "oracle:terrain": "tsx tools/oracle-validation/src/runner.ts --suite terrain",
    "oracle:gimmicks": "tsx tools/oracle-validation/src/runner.ts --suite gimmicks",
    "oracle:replay": "tsx tools/oracle-validation/src/runner.ts --suite replay",
    "oracle:trace": "tsx tools/oracle-validation/src/runner.ts --suite damageTrace",
    "oracle:stats": "tsx tools/oracle-validation/src/runner.ts --suite stats",
    "oracle:groundtruth": "tsx tools/oracle-validation/src/runner.ts --suite groundTruth",
    "oracle:fast": "tsx tools/oracle-validation/src/runner.ts --suite fast",
    "smoke": "tsx tools/oracle-validation/src/runner.ts --suite smoke",
    "compliance": "tsx tools/oracle-validation/src/runner.ts --suite all",
    "test:oracle": "vitest run --config tools/oracle-validation/vitest.config.ts"
  }
}
```

`npm run oracle:fast` = data + stats + ground truth (~2 min). `npm run compliance` = all suites (~15 min).

### 2.4: CI Integration

The CI architecture has two paths:

- **Fast path** (`oracle-fast` job): data + stats + ground truth. Runs on every PR. ~2 minutes.
- **Full path** (`oracle-full` job): all suites including smoke, replay, trace, mechanics, terrain, gimmicks. Runs on PRs touching `packages/*/src/` or `packages/*/data/`, and nightly. ~15 minutes for all 9 gens.

Add to `.github/workflows/ci.yml`:

```yaml
oracle-fast:
  runs-on: ubuntu-latest
  needs: [build]
  if: github.event_name == 'push' || github.event_name == 'pull_request'
  timeout-minutes: 5
  steps:
    - uses: actions/checkout@v4
    - uses: actions/setup-node@v4
      with:
        node-version: 20
    - run: npm ci
    - run: npm run build
    - name: Run fast oracle suite
      run: npm run oracle:fast
    - name: Post compliance summary
      if: github.event_name == 'pull_request'
      run: |
        node -e "
          const fs = require('fs');
          const path = require('path');
          const dir = 'tools/oracle-validation/results';
          const files = fs.readdirSync(dir).filter(f => f.match(/^gen\d+-compliance\.json$/));
          const results = files.map(f => JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8')));
          results.sort((a, b) => a.gen - b.gen);
          let summary = '## Fast Compliance Check (data + stats + ground truth)\n\n| Gen | Status |\n|-----|--------|\n';
          for (const r of results) {
            const icon = r.overallStatus === 'COMPLIANT' ? '✅' : '❌';
            summary += '| Gen ' + r.gen + ' | ' + icon + ' ' + r.overallStatus + '\n';
          }
          fs.writeFileSync('/tmp/compliance-comment.md', summary);
        "
        gh pr comment ${{ github.event.pull_request.number }} --body-file /tmp/compliance-comment.md
      env:
        GH_TOKEN: ${{ secrets.GITHUB_TOKEN }}

oracle-full:
  runs-on: ubuntu-latest
  needs: [build]
  # Only on PRs touching packages/, and on nightly schedule
  if: |
    (github.event_name == 'pull_request' && contains(github.event.pull_request.changed_files, 'packages/')) ||
    github.event_name == 'schedule'
  timeout-minutes: 25
  steps:
    - uses: actions/checkout@v4
    - uses: actions/setup-node@v4
      with:
        node-version: 20
    - run: npm ci
    - run: npm run build
    - name: Run full compliance suite
      run: npm run compliance
    - name: Post full compliance summary
      if: github.event_name == 'pull_request'
      run: |
        # Similar to oracle-fast but with full suite results
        node -e "/* similar script, label as Full Compliance Check */"
        gh pr comment ${{ github.event.pull_request.number }} --body-file /tmp/compliance-comment.md
      env:
        GH_TOKEN: ${{ secrets.GITHUB_TOKEN }}
```

Add the nightly schedule to the workflow trigger:
```yaml
on:
  push:
  pull_request:
  schedule:
    - cron: '0 4 * * *'  # 4am UTC nightly
```

**Important**: CI jobs do NOT commit or check COMPLIANCE.md. Results are posted as PR comments only. No merge conflict risk.

If a suite exceeds timeout, save partial results: "Gen N: 25/50 scenarios, execution interrupted."

### 2.5: Compliance Subagent (Claude Code `/compliance` Command)

Add to `.claude/commands/compliance.md`:

```markdown
# /compliance

Run the cartridge compliance suite and report changes.

## Steps

1. Run `npm run compliance` from the repo root
2. Read `tools/oracle-validation/results/gen*-compliance.json` for all implemented gens
3. Compare current results against baseline (committed `results/` files on origin/main)
   - Regression: passed count decreased OR new failures → flag as CRITICAL
   - Improvement: passed count increased without new failures → note as IMPROVEMENT
   - New disagreement: moved from FAILED to KNOWN → flag as NEW DISAGREEMENT
   - Stale disagreement: our value now matches oracle → flag for cleanup
4. Report per gen:
   "Gen 1: COMPLIANT (130/130 damage, 225/225 types, 15/15 replays, 8/8 traces)"
   "Gen 7: 2 NEW FAILURES in gimmicks suite — Z-Move power table mismatch"
5. If any regressions, list specific failing test IDs and values
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

Run `npm run oracle:fast` for a quick check (data + stats + ground truth, ~2 min) or `npm run compliance` for the full suite (~15 min). Results are in `tools/oracle-validation/results/`.

**Source Authority Hierarchy:**
- Gen 1-2: pret disassemblies (pokered, pokecrystal) — cartridge definitive
- Gen 3: pret C decomps (pokeemerald, pokefirered) — cartridge definitive
- Gen 4: pret WIP decomps (pokeplatinum, pokeheartgold) + Showdown — high confidence
- Gen 5-9: Showdown source + Bulbapedia — medium confidence. Showdown intentionally deviates from cartridge in some areas; prefer Bulbapedia for documented cartridge behavior.

**Oracles are sanity checks, not authorities.** `@pkmn/data`, `@smogon/calc`, and `@pkmn/sim` catch regressions and flag discrepancies. When they disagree with us, consult the hierarchy above.

**Check ERRATA before implementing anything.** `specs/ERRATA.md` documents 30 categories of errors found during implementation across all generations. Run through the checklist before implementing any gen mechanic. Common traps: paralysis speed changed in Gen 7 not Gen 5; terrain boost 1.5× in Gen 7 not 1.3×; Fairy type introduced Gen 6 not Gen 5; Dynamax HP is 1.5×-2.0× not 1.10×-1.20×.

A generation is COMPLIANT when ALL applicable suites pass: data match, damage match, mechanics match, terrain match (Gen 6+), gimmick match (Gen 6+), replay validation, damage trace, smoke tests, and ground truth.
```

### 3.2: SPEC-STATUS.md Cross-Reference

Add at the top of `specs/SPEC-STATUS.md`:

```markdown
> **See also**: Run `npm run oracle:fast` for quick compliance check (data + stats, ~2 min). Run `npm run compliance` for full suite including replay and smoke tests (~15 min).
```

Update VERIFIED definition:
```markdown
| **VERIFIED** | Audited against primary source authority (pret for Gen 1-3, pret decomps where available for Gen 4, Showdown + Bulbapedia for Gen 5-9). Feeds the "Spec Verified" criterion in the compliance suite. |
```

---

## Part 4: ERRATA Cross-Reference

`specs/ERRATA.md` documents 30 categories of errors found during spec and implementation audits. Every category has at least one compliance suite that would catch a regression if that error were re-introduced.

| ERRATA # | Error Category | Compliance Suite | Specific Test |
|----------|---------------|-----------------|---------------|
| 1 | Wrong Stat Formulas | `stat-oracle` | Stat calculation at L1/50/100 |
| 2 | Fairy in Pre-Gen 6 | `type-chart-oracle` | Type count validation per gen |
| 3 | Damage Formula Errors (rounding, STAB order, sequential effectiveness) | `damage-oracle` Tier 2 Gen 1 edge cases | Gen 1 dual-type sequential floor test |
| 4 | Status Mechanic Errors (sleep duration, burn, freeze thaw, paralysis speed, confusion) | `mechanics-oracle` 1.7c | Per-status, per-gen controlled scenarios |
| 5 | Wrong Code Identifiers (enum vs string literal) | N/A — build-time TypeScript error | Caught by `npm run typecheck` |
| 6 | Features From Wrong Generation (abilities in Gen 1-2, Fairy pre-Gen 6) | `data-oracle` (ability field check) + `type-chart-oracle` | Type count + species ability fields |
| 7 | Priority Value Errors | `mechanics-oracle` 1.7a | Priority bracket battle scenarios per gen |
| 8 | Ability Move Lists (Iron Fist) | `mechanics-oracle` 1.7b | Iron Fist move list integration test Gen 4 |
| 9 | Protect/Detect Consecutive Rate | `mechanics-oracle` 1.7a | Multi-consecutive Protect scenarios (Gen 4 caps, Gen 5 doubles, Gen 6+ triples) |
| 10 | Multi-Hit Distribution Changes (Gen 5+) | `damage-oracle` Tier 2 Gen 3-5 edge cases | Multi-hit distribution with seeded PRNG |
| 11 | Fairy Type Chart Confusion (offense vs defense) | `type-chart-oracle` | Fairy offensive + defensive matchup verification |
| 12 | Parental Bond Second Hit (50% Gen 6, 25% Gen 7+) | `mechanics-oracle` 1.7b | Parental Bond damage calc Gen 6 vs Gen 7 |
| 13 | Gale Wings HP Requirement (Gen 7, not Gen 6) | `mechanics-oracle` 1.7b | Gale Wings priority with and without full HP per gen |
| 14 | Paralysis Speed Change (Gen 7, not Gen 5) | `mechanics-oracle` 1.7c | Speed stat with paralysis Gen 6 vs Gen 7 |
| 15 | Z-Move Power Table Truncation | `move-oracle` + `damage-oracle` Tier 2 Gen 7 | Close Combat → 190 Z-power (not 180) |
| 16 | Status Z-Move Fabrication | `damage-oracle` Tier 2 Gen 7 | Status Z-Move does NOT become damage move |
| 17 | Terrain Boost Misdating (1.5x Gen 7, 1.3x Gen 8+) | `terrain-oracle` 1.7j | Electric Terrain damage boost Gen 7 vs Gen 8 |
| 18 | Mega Evolution Persistence | `gimmicks-oracle` 1.7k | Mega persists after switch-out |
| 19 | Dynamax HP Formula (1.5×-2.0×, not 1.10×-1.20×) | `gimmicks-oracle` 1.7k | Dynamax HP calculation at level 0 and level 10 |
| 20 | Max Move Dual Power Table | `gimmicks-oracle` 1.7k | Flamethrower → 130, Close Combat → 95 |
| 21 | Fabricated G-Max Moves | `gimmicks-oracle` 1.7k | G-Max Wildfire = residual damage, not Sunny weather |
| 22 | Move Base Power Errors | `move-oracle` | Body Press = 80 BP, Behemoth Blade = 100 BP |
| 23 | Gen 8 vs Gen 9 Ability Nerfs (Protean/Libero) | `mechanics-oracle` 1.7b | Protean activates every move in Gen 8, once-per-switch in Gen 9 |
| 24 | Weather Duration Confusion (5 turns base, 8 with rock) | `mechanics-oracle` 1.7d | Weather duration without and with weather rock |
| 25 | Knock Off Boost Misdating (Gen 6, not Gen 5) | `mechanics-oracle` 1.7e | Knock Off damage Gen 5 vs Gen 6 |
| 26 | Adaptability Multiplier Error (2.0×/2.25×, not 3×/4×) | `damage-oracle` Tier 2 Gen 9 + `mechanics-oracle` 1.7f | Adaptability + Tera damage calc |
| 27 | Fabricated Terrain Effects | `terrain-oracle` 1.7j | Electric Terrain does NOT heal or halve speed |
| 28 | Protosynthesis/Quark Drive Speed Exception (50%, not 30%) | `mechanics-oracle` 1.7b | Speed stat with Protosynthesis active |
| 29 | Orichalcum Pulse / Hadron Engine Fabrication | `mechanics-oracle` 1.7b | Ability does NOT change move type |
| 30 | Tera STAB Scenario Errors | `damage-oracle` Tier 2 Gen 9 | Flying move on Fire Tera Charizard = 1.5× STAB |

---

## Part 5: Open Bug Integration

The following tracked open bugs should have dedicated compliance scenarios so that any regression or fix is detectable:

| Issue | Gen | Description | Compliance Action |
|-------|-----|-------------|------------------|
| #530 | 1 | Badge stat boosts — enhancement, not a bug | Add to 1.7g as optional mechanic; if unimplemented, document as `known-disagreements/gen1` with `resolution: "enhancement-deferred"` |
| #141 | 3 | Plus/Minus — doubles only | Out of scope (doubles deferred). Add note in gen3 known-disagreements file. |

Note: Issues #687 (Disguise non-lethal) and #725 (Focus Sash capLethalDamage) were closed as of 2026-03-22. Add them as Tier 2 edge cases in Gen 7/8 damage oracle to prevent regression:
- Disguise non-lethal: verify Disguise form absorbs hit without fainting, even from max-power OHKO move
- Focus Sash capLethalDamage: verify Pokemon at full HP survives lethal blow with 1 HP remaining via capLethalDamage

---

## Implementation Order

**PR 1: Oracle Harness Foundation**
1. Install pinned dev dependencies in `tools/oracle-validation/package.json`
2. Create package structure (package.json, tsconfig, vitest config, Zod schemas)
3. Implement gen discovery logic
4. Implement runner with `--gen`, `--suite`, and `--suite fast` flags
5. Implement data comparison suites (type chart with dual-type cross-check, species, moves with Z-Move/Max Move power table validation)
6. Implement stat calculation comparison
7. Create per-gen `known-disagreements/` files and `known-oracle-bugs.json` with any found during development
8. Create `ground-truth/gen1-ground-truth.json`, `gen2-ground-truth.json`, `gen3-ground-truth.json` with 30+ verified values
9. Write vitest test wrappers
10. Add npm scripts to root package.json
11. Create `ORACLE-VERSIONS.md`

Dependencies: None (standalone, new package)

**PR 2: Damage Oracle + Gen 1-4 Edge Cases**
1. Implement damage scenario generator (Tier 1: 100+ auto-generated per gen)
2. Create edge case scenarios for Gen 1-4 (20-25 hand-written per gen, per 1.5 above)
3. Create `ground-truth/gen4-ground-truth.json`

Dependencies: Requires PR 1 (uses runner framework, gen discovery, schemas)

**PR 3: Mechanics Oracle + Gen 5-9 Edge Cases**
1. Implement full mechanics oracle suite (sections 1.7a through 1.7l)
2. Implement terrain comparison module (`compare-terrain.ts`, `terrain-oracle.test.ts`)
3. Implement gimmick comparison module (`compare-gimmicks.ts`, `gimmicks-oracle.test.ts`)
4. Create edge case scenarios for Gen 5-9 (20-25 per gen)
5. Create `ground-truth/gen5-ground-truth.json` through `gen9-ground-truth.json` (convert existing gen8 from markdown)

Dependencies: Requires PR 2 (uses damage scenario framework for gimmick damage scenarios)

**PR 4: Replay + Trace Expansion**
1. Extend replay-parser to support Gen 2-9 formats
2. Download and commit replays for Gen 2-9 (15+ per gen)
3. Implement damage trace validation (`damage-trace.ts`, `damage-trace.test.ts`)
4. Extend battle runner in `tools/replay-parser/` to support Gen 3-9 (`generation: 1 | 2` → `generation: 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9`)
5. Implement the 2 stubbed invariants (status-type-immunity, effectiveness-correctness) now that richer event data exists

Dependencies: Requires PR 1 (uses results schema, gen discovery)

**PR 5: CI + Subagent + Docs**
1. Add CI workflow with fast/full path split as default architecture
2. Create `.claude/commands/compliance.md`
3. Update `CLAUDE.md` with cartridge compliance section
4. Update `SPEC-STATUS.md` with cross-reference
5. Activate staleness detection for per-gen known-disagreements files

Dependencies: Requires PR 3 (needs all suites to exist for meaningful CI) and PR 4 (full path needs replay suite)

PRs must merge sequentially: PR 1 → PR 2 → PR 3 → PR 4 → PR 5.

## Known Coverage Gaps (Remaining Out of Scope)

The following mechanics are NOT covered by the initial compliance system. They should be added incrementally:

- **Battle formats**: Doubles/Triples (targeting, spread moves, ally interactions). Initial system is singles-only.
- **Multi-turn moves**: Two-turn moves (invulnerability during Sky Attack, Fly, Dig, etc.); Counter/Mirror Coat exact mechanics; Baton Pass stat stage transfer (functional, but oracle comparison not written)
- **Edge cases**: Transform/Ditto form copy; simultaneous fainting rules; PP tracking/Struggle trigger; trapping mechanics (Mean Look, Arena Trap, Shadow Tag)
- **Gimmick edge cases**: Z-Move + Mega coexistence per gen; Dynamax + Gigantamax eligibility rules; Stellar Tera detailed mechanics

## Success Criteria

- `npm run oracle:fast` completes in under 2 minutes for all 9 gens (data + stats + ground truth)
- `npm run compliance` completes in under 15 minutes for all 9 gens (all suites)
- Oracle dependencies pinned to exact versions with documented upgrade procedure
- Every type chart cell matches `@pkmn/data` or is documented as known disagreement
- Every species' battle-relevant stats match (including Mega/form stat blocks for applicable gens)
- Every move's properties match including Z-Move and Max Move power table validation
- **98%+** of damage scenarios match `@smogon/calc` within ±2% tolerance
- Mechanics suite covers priority, abilities (Gen 3-9 including Gen 5+ additions), status (per-gen values), field effects, items, stat stages, Gen 1-2 unique mechanics, multi-turn state, switch-in mechanics, terrain (Gen 6+), gimmicks (Gen 6+), and rooms/gravity (Gen 4+)
- 15+ replays per gen pass structural validation (Gen 1 already meets this; Gen 2-9 added in PR 4)
- 5+ damage traces per gen validate turn-by-turn HP deltas
- 30+ ground truth values per gen from authoritative source
- All disagreements cite source authority with URL to exact file
- Stale disagreements detected and flagged per-gen
- CI fast path runs on every PR; full path runs on `packages/` changes and nightly
- `/compliance` command works for agents and detects regressions vs origin/main baseline
- All 30 ERRATA error categories have at least one test scenario in the edge case suite or mechanics oracle that would catch the documented error if it regressed
- Open bugs #530 and #141 documented in known-disagreements files; closed bugs #687 and #725 have regression test scenarios
