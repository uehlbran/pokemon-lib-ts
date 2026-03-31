# Gen2 Implementation Status

**Last updated:** 2026-03-31
**Generated completeness status:** `tools/oracle-validation/results/completeness-status.md`
**Architecture:** Implements `GenerationRuleset` directly (NOT BaseRuleset — too mechanically different from Gen 3+)

---

## DONE

### Type System
- 17 types (Dark, Steel added) — `packages/gen2/src/Gen2TypeChart.ts`
- Ghost → Psychic = 2x (Gen 1 bug fixed). Psychic → Dark = 0x. Poison → Steel = 0x.
- Exhaustive test coverage — `packages/gen2/tests/type-chart.test.ts` (570 lines)

### Stat Calculation — `packages/gen2/src/Gen2StatCalc.ts`
- DV (0-15) + Stat EXP (0-65535) formulas; HP and non-HP formulas correct
- **Special split**: separate spAttack and spDefense base stats
- No natures (intentional — Gen 2 has no nature system)
- SpDef uses unified Special DV (`ivs.spAttack`) — pokecrystal verified (#487 fixed by PR #511)
- Tested with 10+ known Pokemon at L50/L100 with property-based tests

### Physical/Special by Type
- `isGen2PhysicalType()` — Physical: Normal/Fighting/Poison/Ground/Flying/Bug/Rock/Ghost/Steel
- Tested in `damage-calc.test.ts`

### Damage Calculation — `packages/gen2/src/Gen2DamageCalc.ts`
- Base formula with correct modifier order (item → crit → clamp [1,997]+2 → weather → STAB → type → random)
- Critical hits: 2x multiplier (doubles level factor — pokecrystal verified, PR #511), ignores positive defender stat stages
- Weather damage modifiers: Rain (Water 1.5x, Fire 0.5x), Sun (Fire 1.5x, Water 0.5x)
- Item type-boost (1.1x): Charcoal, Mystic Water, etc.
- Burn halves physical Attack
- Explosion/Self-Destruct: defense halved in calc
- Reflect/Light Screen: halve non-critical physical/special damage; crits bypass
- Modifier order verified against pokecrystal decomp (decomp-regression.test.ts test 4A)
- Rollout/Fury Cutter dynamic power via `getRolloutPower`/`getFuryCutterPower` (PR #527)

### Critical Hit System — `packages/gen2/src/Gen2CritCalc.ts`
- Stage-based: [17/256, 32/256, 64/256, 85/256, 128/256]
- Focus Energy bug FIXED (correctly multiplies — no more Gen 1 divide bug)
- High-crit moves: +1 stage (PR #511 corrected from +2)
- Scope Lens: +1 stage
- Stick (Farfetch'd): +2 stages; Lucky Punch (Chansey): +2 stages
- Tested (all stages, stacking, statistical rate verification)

### Turn Order
- Priority brackets; switches before moves
- Quick Claw: 60/256 chance move-first
- Speed ties: deterministic tiebreak
- Paralysis: Speed × 0.25

### Accuracy
- 0-255 scale with accuracy/evasion stage lookup tables
- **No 1/256 miss bug** (fixed in Gen 2 — threshold is exactly `accuracy`)
- 255 accuracy never misses

### Status Conditions — `packages/gen2/src/Gen2Status.ts`
- Burn: 1/8 max HP per turn (increased from Gen 1)
- Freeze: 25/256 natural thaw per turn; just-frozen guard prevents same-turn thaw
- Paralysis: 25% full paralysis; Speed quartered
- Sleep: 2-7 turns (pokecrystal verified, decomp-regression test 4C); can act on wake turn
- Poison: 1/8 max HP per turn; Toxic: escalating N/16
- Toxic reverts to regular poison on switch-out (decomp-regression test 4E)
- Type immunities: Fire→burn, Ice→freeze, Poison/Steel→poison; Electric NOT immune to paralysis
- Safeguard: blocks all primary status conditions (PR #234)

### Held Items — `packages/gen2/src/Gen2Items.ts`
- Leftovers (1/16 HP per turn), Berry (10 HP ≤50%), Gold Berry (30 HP ≤50%), Berry Juice
- Status-cure berries: PRZCureBerry, IceBerry, MintBerry, BurntBerry, PsnCureBerry, BitterBerry, MiracleBerry
- Focus Band (30/256 survive KO), King's Rock (30/256 flinch), Quick Claw (60/256 move-first)
- Scope Lens (+1 crit stage), Stick/Lucky Punch (species-specific crit items)
- Type-boosting items (1.1x): Charcoal, Mystic Water, Miracle Seed, Magnet, etc.
- Thick Club (2x Atk for Cubone/Marowak), Light Ball (2x SpAtk for Pikachu)
- Metal Powder (2x Def for untransformed Ditto — transform detection implemented, PR #527 via #213)

### Weather — `packages/gen2/src/Gen2Weather.ts`
- Rain Dance (5 turns): Water 1.5x, Fire 0.5x, Thunder 100% acc
- Sunny Day (5 turns): Fire 1.5x, Water 0.5x, SolarBeam no charge
- Sandstorm (5 turns): 1/8 HP chip to non-Rock/Ground/Steel; no SpDef boost (Gen 4 addition)
- No Hail (Gen 3 addition)

### Entry Hazards
- Spikes: 1 layer, 1/8 HP damage, Flying + Levitate immune
- No Stealth Rock / Toxic Spikes (Gen 4 additions)

### Move Effects (standard)
- `status-chance`, `status-guaranteed`, `stat-change`, `recoil`, `drain`, `heal`, `volatile-status`, `weather`, `entry-hazard`, `switch-out`, `protect`, `remove-hazards`
- Confusion: 50% self-hit, 1-4 turns
- Protect: `floor(255 / 3^N)` formula — pokecrystal verified (PR #511 #318)

### Implemented Custom Move Handlers
- Belly Drum (+6 Atk, -50% HP), Rapid Spin (clear hazards + leech seed + bind)
- Mean Look / Spider Web (trapping volatile)
- Thief (steal item if user has none)
- Explosion / Self-Destruct (selfFaint + defense halving)
- Perish Song (3-turn faint countdown)
- Attract (infatuation volatile)
- Rest (full heal + status cure + toxic-counter clear + fixed 2-turn sleep)
- Baton Pass (sets switchOut + batonPass flags; preserves confusion/focus-energy/leech-seed volatiles — PR #241)
- Swagger (+Atk + confusion), Flatter (+SpAtk + confusion)
- Curse (non-Ghost: stat change; Ghost: 50% HP sacrifice + curse volatile on target)
- Nightmare (1/4 HP damage per turn to sleeping target)
- Counter (2x last physical damage), Mirror Coat (2x last special damage) — PR #244
- Hidden Power (DV-based type and power calculation) — PR #244
- Whirlwind / Roar (forced switch, -6 priority phazing) — PR #244
- Hyper Beam (recharge turn, skip on KO, skip on miss) — PR #244
- Encore (forces repeat of last move for 2-6 turns), Disable (prevents last move 1-7 turns) — PR #241
- Reflect / Light Screen (set 5-turn screens; integrated into damage calc) — PR #234
- Safeguard (sets 5-turn screen; blocks status infliction) — PR #234
- Return / Frustration (friendship-based base power) — PR #241
- Future Sight (delayed 2-turn Psychic attack) — PR #527
- Sleep Talk (calls random move while asleep), Snore (damage + flinch while asleep) — PR #527
- Present (random 40/80/120 damage or 1/4 HP heal) — PR #527
- Magnitude (random power levels magnitude 4-10, power 10-150) — PR #527
- Triple Kick (three hits at 10/20/30 with per-hit accuracy) — PR #527
- Rollout (power doubles each consecutive use up to 5 turns) — PR #527
- Fury Cutter (power doubles on consecutive use, caps at 160) — PR #527
- Beat Up (each eligible party member attacks with base Attack) — PR #527

### End-of-Turn (Two-Phase System)
- Phase 1: status-damage → leech-seed → nightmare → curse
- Phase 2: future-attack → weather-damage → weather-countdown → bind → perish-song → leftovers → mystery-berry → defrost → safeguard-countdown → screen-countdown → stat-boosting-items → healing-items → encore-countdown → disable-countdown
- Leech Seed drain: 1/8 max HP; Curse: 1/4 max HP; Nightmare: 1/4 max HP; Bind: 1/16 max HP
- Protect/Detect: divide-by-3 halving on consecutive use — pokecrystal verified (PR #511 #318)
- Struggle recoil: maxHp/4 — pokecrystal verified (PR #511 #317)

### Data & Validation
- 251 species, 251 correct IDs, items loaded, 17-type chart

---

## OPEN BUGS

Known open Gen 2 bugs remain in the tracker. Representative open issues as of 2026-03-31:

- #1837 — Heal Bell is data-only and never cures the party
- #1847 — Tri Attack secondary status effect missing
- #1849 — Destiny Bond has no handler
- #1851 — Endure silently no-ops
- #1859 — Transform silently no-ops

This page is a historical implementation summary, not a claim that Gen 2 correctness work is complete.

## Test Coverage

33 executed test files, 777 tests (as of 2026-03-31).

---

## CLOSED BUGS (engine-level — resolved)

| Issue | Severity | Fixed In | Summary |
|-------|----------|----------|---------|
| #524 | HIGH | PR #615 | Engine blocks Sleep Talk/Snore — sleep-bypass added to `canExecuteMove` |
| #525 | HIGH | PR #618 | Engine multi-hit loop reuses first hit damage — per-hit power via `perHitDamage` field |
| #526 | MEDIUM | PR #607 | `MoveEffectResult` missing `healDefender` — Present heal fixed alongside Wish |
| #542 | MEDIUM | PR #57x | Random factor used float intermediate instead of integer multiply-then-divide |
| #544 | MEDIUM | (merged) | STAB applied before weather modifier — order corrected per pokecrystal |
| #547 | HIGH | PR #511 | Critical hit used Gen1-style level doubling instead of Gen2-style 2x post-formula |
| #553 | MEDIUM | PR #511 | High-crit moves add +1 crit stage instead of +2 (pokecrystal CriticalHitMoves) |

---

## PR History

| PR | Branch | What was merged |
|----|--------|-----------------|
| (series) | feat/gen2 | Full Gen 2 implementation — type chart, stat calc, damage calc, status, weather, items, move effects |
| #132 | fix/gen2 | Two-phase EoT order + priority values per pokecrystal decomp |
| #234 | feat/gen2 | Screens in damage calc (Reflect/Light Screen), Safeguard, Gen2MoveEffects extraction |
| #241 | feat/gen2 | Encore/Disable, Baton Pass volatile preservation, Return/Frustration |
| #244 | feat/gen2 | Counter/Mirror Coat, Hidden Power, Whirlwind/Roar, Hyper Beam recharge |
| #247 | fix/gen2 | Safeguard/Mean Look/Spider Web correctness bugs |
| #456 | fix/gen2 | 16 audit bugs — formulas, catch, mechanics, weather |
| #459 | fix/gen2 | Catch formula edge cases — hpFactor clamp and roll equality |
| #460 | fix/gen1,gen2 | Integer stat stage arithmetic from pret disassemblies |
| #481 | test/gen2 | Add missing mechanic tests for Wave 1+2 testing gaps |
| #511 | fix/gen2 | 6 formula bugs: crit level doubling, Struggle recoil (maxHp/4), Protect formula (÷3^N), STAB order, SpDef DV, high-crit stage (+1 not +2) |
| #523 | fix/gen2 | Resolve #61 EoT docs, #121 Struggle calc location, #488 OHKO accuracy docs |
| #527 | feat/gen2 | 9 move handlers: Future Sight, Sleep Talk, Snore, Present, Magnitude, Triple Kick, Rollout, Fury Cutter, Beat Up |
| #1870 | fix/gen2-custom-move-wave-1 | Restore/custom-pin Gen 2 Rest, Perish Song, and Curse runtime handlers; add toxic-counter clear proof and engine-path dispatch coverage |
