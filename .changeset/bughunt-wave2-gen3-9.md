---
"@pokemon-lib-ts/battle": minor
"@pokemon-lib-ts/core": patch
"@pokemon-lib-ts/gen3": patch
"@pokemon-lib-ts/gen4": patch
"@pokemon-lib-ts/gen5": patch
"@pokemon-lib-ts/gen6": patch
"@pokemon-lib-ts/gen7": patch
"@pokemon-lib-ts/gen8": patch
"@pokemon-lib-ts/gen9": patch
---

Bughunt wave 2: engine root causes + gen3-9 bug fixes (47 confirmed bugs closed)

**battle (minor)**: New optional `GenerationRuleset` methods: `shouldBlockVolatile` (gates confusion/volatiles during Misty Terrain), `shouldBlockPriorityMove` (gates priority moves during Psychic Terrain); `capLethalDamage` now fires for ALL damage (guard removed — implementations decide whether to act); new `on-after-move-used` ability trigger dispatch after defender faints; `attackerItemConsumed: boolean` field on `MoveEffectResult` (engine handles item removal + event emit); `checkPerHitAccuracy` field on `MoveEffectResult` (multi-hit loop re-rolls accuracy per hit for Population Bomb etc.); `BattleHelpers.createActivePokemon` resets `timesAttacked` to 0.

**core (patch)**: Added `"hazard-status-source"` to `VolatileStatus` union (one-turn marker set by Toxic Spikes switch-in; Synchronize skips reflection when this volatile is set).

**gen3 (patch)**: Charge move handler (doubles next Electric move power via `charged` volatile); Mud Sport and Water Sport move handlers (halve Electric/Fire power respectively via field volatiles) (#706, #705).

**gen4 (patch)**: Mold Breaker stat bypass — `getEffectiveStatStage` checks attacker's Mold Breaker/Teravolt/Turboblaze ability and ignores defender's Simple/Unaware when active (#704).

**gen5 (patch)**: `pokeRound` fixes for type-boost items, Plates, Iron Fist, Dry Skin, Rivalry, Reckless; Reckless now boosts crash-damage moves (`hasCrashDamage`); Solar Power and Flower Gift reclassified as stat modifiers (not base-power); Magic Guard path in entry hazards now also absorbs Toxic Spikes for grounded Poison-types; UNSUPPRESSABLE_ABILITIES trimmed to `multitype`/`zen-mode` only; Effect Spore sleep threshold fixed to 11%; Synchronize skips reflection when `hazard-status-source` volatile is set; Sniper/Tinted Lens/Solid Rock/Filter return `activated: false` when condition not met; Focus Sash dead code removed from `handleOnDamageTaken`; berry HP double-subtract fixed (#643, #653, #641, #640, #650, #649, #657, #661, #646, #651, #656, #658, #655, #647, #743).

**gen6 (patch)**: `pokeRound` fixes for Iron Fist, Technician, Dry Skin fire boost, Reckless; Reckless crash-damage fix; Flash Fire and pinch abilities reclassified as stat modifiers; Flower Gift Atk boost in sun; Stance Change handler (Shield→Blade on attacking move, Blade→Shield on King's Shield); Harvest triggers in harsh-sun (`harsh-sun` weather check added); UNSUPPRESSABLE_ABILITIES trimmed to Gen 6-valid entries (`multitype`, `stance-change`, `zen-mode`); Bulletproof uses `move.flags.bullet` instead of hardcoded list; Sweet Veil effect-based sleep check; semi-invulnerable state check in `isGen6Grounded`; `shouldBlockVolatile` — Misty Terrain confusion immunity for grounded targets (#663, #662, #660, #659, #654, #652, #648, #675, #673, #672, #670, #668, #667, #665, #664, #724).

**gen7 (patch)**: Rayquaza mega evolution allowed if it knows Dragon Ascent (no Mega Stone required); pinch stat berries trigger at end-of-turn via `getEndOfTurnOrder` residual; Beast Boost, Moxie, Battle Bond wired to `on-after-move-used` trigger; `shouldBlockVolatile` and `shouldBlockPriorityMove` — Misty Terrain confusion immunity and Psychic Terrain priority block for grounded targets (#701, #683, #688, #724, #723).

**gen8 (patch)**: Disguise `capLethalDamage` reworked — blocks ALL damage (lethal and non-lethal) when disguise intact, applies 1/8 maxHP chip damage (Gen 8 behavior); Choice lock volatile suppressed during Dynamax; `shouldBlockVolatile` and `shouldBlockPriorityMove` (Misty/Psychic Terrain); `package.json` exports fixed to expose data files correctly (#738, #713, #694, #724, #723).

**gen9 (patch)**: `timesAttacked` reset on switch-in (fixes population-bomb accuracy counter bleed); Shed Tail switch-in handler transfers Substitute HP to incoming Pokemon; Population Bomb `checkPerHitAccuracy` flag added (re-rolls accuracy per hit); Sturdy and Focus Sash wired into `capLethalDamage`; Lansat Berry crit-stage boost fix; Misty Terrain confusion immunity and Psychic Terrain priority block (#751, #750, #749, #731, #725, #726, #724, #723).

Closes #643
Closes #653
Closes #641
Closes #640
Closes #650
Closes #649
Closes #657
Closes #661
Closes #646
Closes #651
Closes #656
Closes #658
Closes #655
Closes #647
Closes #743
Closes #663
Closes #662
Closes #660
Closes #659
Closes #654
Closes #652
Closes #648
Closes #675
Closes #673
Closes #672
Closes #670
Closes #668
Closes #667
Closes #665
Closes #664
Closes #701
Closes #683
Closes #688
Closes #738
Closes #713
Closes #694
Closes #751
Closes #750
Closes #749
Closes #731
Closes #725
Closes #726
Closes #724
Closes #723
Closes #706
Closes #705
Closes #704
