# Gen 1 Deep-Dive Correctness Audit Results

## Summary

A full-spectrum correctness audit of the Gen 1 implementation was performed across three phases: spec review and repair, code bug identification and fixes, and validation test coverage. All 28 spec issues were corrected in `specs/battle/02-gen1.md`, 2 code bugs were fixed in the implementation, and 52 new validation tests were added (51 in a dedicated deep-dive suite, 1 in the existing mechanics suite). The implementation now correctly handles Gen 1-specific quirks including the DV/StatExp stat formula, Self-Destruct halving defense, the Ghost-Psychic immunity, and Counter's type restriction.

### Quick Reference

| Category | Count |
|---|---|
| Spec issues fixed | 28 |
| Code bugs fixed | 2 |
| New tests added | 52 |
| Known remaining gaps (deferred) | 5 |
| Tests passing (gen1 + battle) | 509+ |
| TypeScript errors | 0 |
| Biome lint warnings | 0 |

---

## Spec Corrections (`specs/battle/02-gen1.md`)

All 28 issues are grouped by the original severity classification.

### CRITICAL (8 issues)

| # | Location | Before | After |
|---|---|---|---|
| 1 | Stat formula | Referenced modern EV/IV formula | Corrected to DV (0–15) + StatExp (0–65535), `floor(floor(2*(Base+DV) + floor(ceil(sqrt(StatExp))/4)) * Level/100) + 5` |
| 2 | HP formula constant | `+5` constant | Corrected to `+10` constant for HP |
| 3 | Poison damage | Did not specify fraction | Corrected to 1/16 max HP per turn |
| 4 | Burn damage | Did not specify fraction | Corrected to 1/16 max HP per turn |
| 5 | Ghost vs Psychic | Ghost deals 1x damage vs Psychic | Corrected to 0x (immune) — Gen 1 programming bug preserved |
| 6 | STAB in damage formula | STAB not present in formula steps | Added STAB ×1.5 as an explicit step in the damage calculation sequence |
| 7 | Type effectiveness application | Described as combined multiplier | Corrected to sequential application (each type multiplied one at a time) |
| 8 | Steel type in chart | Steel type referenced | Removed — Steel does not exist in Gen 1 |

### MAJOR (13 issues)

| # | Location | Before | After |
|---|---|---|---|
| 9 | Random factor | Described as 85–100% | Corrected to integer range 217–255 (divide by 255 to get multiplier) |
| 10 | Sleep and wake | Sleep wakes then acts on same turn | Corrected: Pokémon wakes but cannot act on the wake turn |
| 11 | Haze freeze thaw | Not documented | Added: Haze thaws frozen Pokémon as a side effect |
| 12 | Toxic counter sharing | Toxic counter was isolated | Corrected: the escalating counter is shared with Burn and Leech Seed in Gen 1 (damage escalates across status transitions) |
| 13 | High-crit moves | Not documented distinctly | Added: Slash, Razor Leaf, Crabhammer, Karate Chop have 8× the base crit rate |
| 14 | Counter type restriction | Counter could reflect any damage | Corrected: Counter only reflects Normal and Fighting type moves |
| 15 | Hyper Beam recharge | Always recharges | Corrected: recharge is skipped if the move KOs the target, breaks a Substitute, or misses |
| 16 | Self-Destruct / Explosion defense | Target defense used as-is | Corrected: target's Defense is halved before damage calculation |
| 17 | Struggle recoil | Described as HP fraction | Corrected to 50% of damage dealt (not 50% of max HP) |
| 18 | Reflect / Light Screen duration | Described as 5-turn limit | Corrected: permanent for the battle (no turn limit in Gen 1) |
| 19 | Stat overflow | Not documented | Added: if either Attack or Defense ≥ 256 after modification, both are divided by 4 and taken mod 256 |
| 20 | Dragon type category | Not categorized | Documented as Special type in Gen 1 |
| 21 | Poison type category | Not categorized | Documented as Physical type in Gen 1 |

### MINOR (7 issues)

| # | Location | Before | After |
|---|---|---|---|
| 22 | Non-Gen-1 references | Dragon Dance, Espeon, Steel type, abilities, weather mentioned | Removed all post-Gen-1 references |
| 23 | Crit rate example | "Speed 100 ≈ ~100% crit rate" | Corrected to Speed 100 = 19.5% (base rate ÷ 512, Speed used directly) |
| 24 | Evasion formula | Numerator/denominator not specified | Documented as fraction system with numerator and denominator tracking |
| 25 | DV terminology | Mixed IV/DV language | Standardized to DV (0–15) throughout |
| 26 | HP DV derivation | HP DV not documented | Added documentation that HP DV is derived from the parity of each other DV |
| 27 | Confusion self-hit and Substitute | Interaction not documented | Added: confusion self-hit can strike a Substitute (unlike normal moves) |
| 28 | Damage cap | No cap documented | Added: damage is capped at 997 in Gen 1 |

---

## Code Fixes

### Bug 1 — Self-Destruct handler name mismatch (HIGH)

| Field | Detail |
|---|---|
| File | `packages/gen1/src/Gen1Ruleset.ts` line 488 |
| Change | `"selfdestruct"` → `"self-destruct"` (hyphen added) |
| Root cause | Move ID in `moves.json` uses `"self-destruct"` with a hyphen; the handler lookup used `"selfdestruct"` without one, so the switch case never matched |
| Impact | Self-Destruct user never fainted after using the move. With the fix, the user correctly faints after execution. |
| Test | `packages/gen1/tests/gen1-mechanics.test.ts` — "Self-Destruct causes user to faint" |

### Bug 2 — Counter type filtering missing (MEDIUM)

| Field | Detail |
|---|---|
| Files | `packages/battle/src/state/BattleSide.ts`, `packages/battle/src/utils/BattleHelpers.ts`, `packages/battle/src/engine/BattleEngine.ts`, `packages/gen1/src/Gen1Ruleset.ts` |
| Change | Added `lastDamageType: PokemonType | null` field to `ActivePokemon` interface; wired up tracking in the engine; Counter handler checks `lastDamageType === "normal" || lastDamageType === "fighting"` before reflecting |
| Root cause | Counter had no access to the type of the last move that dealt damage, so it reflected all damage types instead of only Normal and Fighting |
| Impact | Counter incorrectly doubled back damage from Psychic, Fire, Water, etc. Now only reflects the correct types. |
| Test | `packages/gen1/tests/gen1-mechanics.test.ts` — Counter type filtering tests |

---

## Known Remaining Gaps

These 5 items were identified during the audit but deferred. Each has an `it.todo()` stub where appropriate.

| # | Gap | Why Deferred |
|---|---|---|
| 1 | Hyper Beam recharge skipped on Substitute break / miss | Engine-level concern — requires the engine to pass the move outcome (KO, sub break, miss) back to the recharge-check logic. Not limited to Gen 1; needs a shared engine contract. |
| 2 | Toxic counter shared with burn / Leech Seed (damage escalation glitch) | Complex Gen 1 engine-level bug. The escalating counter must persist through status transitions and interact with Leech Seed drain — requires invasive engine state changes and cross-status coordination. |
| 3 | Freeze thaw from fire-type moves | Requires the BattleEngine to check the attacking move's type at the point of damage application on a frozen target and trigger thaw. Needs a cross-cutting engine hook, not just ruleset logic. |
| 4 | HP DV derivation from parity of other DVs | Data creation concern. Affects only how DVs are generated or validated, not battle resolution. No incorrect behavior in fights; deferred to the data pipeline. |
| 5 | Confusion self-hit hits Substitute | Minor interaction. Requires engine-level tracking of which "self-targeting" events bypass Substitute. Low gameplay impact; spec is now documented correctly. |

---

## Test Coverage

New tests live in two files:

- `packages/gen1/tests/deep-dive-validation.test.ts` — 51 tests across 5 sections
- `packages/gen1/tests/gen1-mechanics.test.ts` — 1 additional test for the Self-Destruct fix

### Section 3A — Stat Calculation (14 tests)

Validates the DV/StatExp formula (`floor(floor(2*(Base+DV) + floor(ceil(sqrt(StatExp))/4)) * Level/100) + 5`) against known Bulbapedia values at L100 with max StatExp (65535) and max DVs (15). Pokémon covered: Mewtwo, Chansey, Snorlax, Alakazam, Tauros, Dragonite, Gengar, Starmie. Also includes a Pikachu L50 case and a property test asserting all computed stats are positive integers.

Key expected values:

| Pokémon | Stat | Expected |
|---|---|---|
| Mewtwo | HP | 416 |
| Mewtwo | Sp.Atk | 358 |
| Chansey | HP | 704 |
| Snorlax | HP | 524 |
| Alakazam | Speed | 298 |

### Section 3B — Type Chart (14 tests)

Validates the 15-type Gen 1 type chart. Key assertions: Ghost → Psychic = 0 (immune, the Gen 1 bug), Poison → Bug = 2× (inverted from later gens), Bug → Poison = 2×, Ice → Fire = 1×, Electric → Ground = 0, Ground → Flying = 0. Confirms absence of Steel, Dark, and Fairy. Verifies the chart contains exactly 15 types.

### Section 3C — Damage Formula (5 tests)

Validates end-to-end damage calculation including STAB, type effectiveness, stat overflow, and the sequential type multiplier application. Key scenarios: Mewtwo using Psychic (STAB), Thunderbolt against a Water/Flying target (4× effective), Snorlax using Body Slam (STAB), crit ratio approximately 1.91× non-crit (min/max damage bands), and stat overflow triggering the div-4-mod-256 path when Attack or Defense hits 256+.

### Section 3D — Critical Hit Rates (8 tests)

Validates Gen 1 base crit rates (derived from base Speed ÷ 512) and high-crit move rates (Speed ÷ 64). Key expected values:

| Pokémon | Base Speed | Normal Crit | High-Crit Move |
|---|---|---|---|
| Mewtwo | 130 | 65/256 | — |
| Pikachu | 90 | 45/256 | — |
| Chansey | 50 | 25/256 | — |
| Snorlax | 30 | 15/256 | — |

Also verifies Slash, Razor Leaf, Karate Chop, and Crabhammer each produce the 8× elevated rate, and that crit rates are monotonically ordered by base Speed.

### Section 3E — Status Damage (10 tests)

Validates per-turn end-of-turn damage for Burn, Poison, and Toxic (escalating). Key expected values:

| Pokémon | Status | HP | Damage/Turn |
|---|---|---|---|
| Mewtwo (HP 416) | Burn | 416 | 26 (1/16) |
| Chansey (HP 704) | Poison | 704 | 44 (1/16) |
| Snorlax (HP 524) | Toxic turn 1 | 524 | 32 (1/16) |
| Snorlax (HP 524) | Toxic turn 2 | 524 | 65 (2/16) |
| Snorlax (HP 524) | Toxic turn 3 | 524 | 98 (3/16) |

Also confirms Paralysis, Sleep, and Freeze deal zero end-of-turn damage.

---

## Risk Areas

- **Engine-level Gen 1 quirks are fragile.** The remaining 5 gaps all require changes spanning `BattleEngine` and the ruleset interface. Any future work touching turn resolution, damage application, or status handling in the engine must be reviewed for Gen 1 interactions — particularly the Toxic escalation counter sharing and the Hyper Beam recharge skip.

- **Move ID normalization is a silent failure mode.** The Self-Destruct hyphen bug demonstrates that mismatches between move IDs in `moves.json` and string literals in handler switches fail silently (no error, move just has no effect). All move-specific handlers in `Gen1Ruleset.ts` should be audited against actual move IDs in the data files. A unit test asserting handler keys exist in `moves.json` would prevent regressions.

- **Ghost-Psychic immunity is intentionally wrong and easy to accidentally fix.** The 0× effectiveness of Ghost against Psychic is a Gen 1 programming bug that must be preserved for correctness. It is encoded in the type chart data. Any chart regeneration or normalization pass risks inadvertently restoring the "correct" 2× value. The spec now documents this clearly, but data pipeline changes need extra scrutiny here.

- **Stat overflow edge cases are untested under battle conditions.** Section 3C tests the overflow arithmetic in isolation. The actual battle path (Swords Dance stacking, Barrier stacking, Agility to extreme Speed) that triggers the overflow in a real fight is not covered. Extreme stat-boosting scenarios should be integration-tested to confirm the engine applies the div-4-mod-256 correction at the right point in the damage formula rather than at stat storage time.
