# Gen 6 Implementation Status

**Started:** 2026-03-21
**Last updated:** 2026-03-22 (all waves merged — Gen 6 100% complete)
**Target:** Full Gen 6 (X/Y/ORAS) battle mechanics implementation
**Package:** `@pokemon-lib-ts/gen6`
**Overall estimate:** ~100% complete (Wave 10 PR #638 merged 2026-03-22)

## Wave Status

| Wave | Name | Status | Branch | PR | SHA |
|------|------|--------|--------|----|-----|
| 0 | Package Scaffold + Data | ✅ Merged | feat/gen6-wave0-scaffold | #581 | 1d118e15 |
| 1 | Engine Infrastructure (battle pkg) | ✅ Merged | feat/gen6-wave1-engine-infra | #582 | cc8a74e8 |
| 2 | Ruleset Core + Status + Speed | ✅ Merged | feat/gen6-wave2-ruleset-core | #599 | 0f5426d |
| 3 | Damage Calculation | ✅ Merged | feat/gen6-wave3-damage-calc | #608 | 4fdea3d |
| 4 | Weather System | ✅ Merged | feat/gen6-wave4-weather | #603 | 1fd4744 |
| 4B | Entry Hazards + Sticky Web | ✅ Merged | feat/gen6-wave4b-entry-hazards | #605 | bffd40c |
| 5A | Abilities: Damage + Stat | ✅ Merged | feat/gen6-wave5a-abilities-damage-stat | #613 | 47a024f |
| 5B | Abilities: Switch + Remaining | ✅ Merged | feat/gen6-wave5b-abilities-switch-remaining | #629 | 65f0638 |
| 6 | Items | ✅ Merged | feat/gen6-wave6-items | #616 | 8240a4b |
| 7 | Terrain System | ✅ Merged | feat/gen6-wave7-terrain | #612 | - |
| 8A+8B | Move Effects (protect variants, powder, drain) | ✅ Merged | feat/gen6-wave8b-powder-terrain | #637 | 88c1342 |
| 9 | Mega Evolution | ✅ Merged | feat/gen6-wave9-mega-evolution | #633 | 469cc31 |
| 10 | Integration + Polish | ✅ Merged | feat/gen6-wave10-integration | #638 | - |

## Key Gen 6 Features Checklist
- [x] Fairy type (18th) — Wave 0 (type chart in data)
- [x] Steel loses Dark/Ghost resistances — Wave 0 (type chart data)
- [x] Gen6Ruleset core overrides — Wave 2 (burn 1/8, paralysis 0.25x, Sturdy, hasTerrain, EoT)
- [x] Damage calc (crit 1.5x, gem 1.3x, Knock Off 1.5x, Fairy effectiveness) — Wave 3
- [x] Weather 5/8-turn duration — Wave 4
- [x] Sticky Web entry hazard — Wave 4B
- [x] Abilities: Tough Claws, Strong Jaw, Parental Bond, -ate, Gale Wings, Protean — Wave 5A
- [x] Abilities: Switch + Remaining (Bulletproof, Stance Change, weather 5-turn) — Wave 5B
- [x] Items: Assault Vest, Safety Goggles, Weakness Policy, Mega Stones — Wave 6
- [x] Electric/Grassy/Misty Terrain — Wave 7
- [x] King's Shield, Spiky Shield, Mat Block, Crafty Shield — Wave 8A
- [x] Phantom Force (breaksProtect, shadow-force-charging volatile) — Wave 8A
- [x] Powder immunity for Grass types (flags.powder check) — Wave 8B
- [x] Oblivion Wing 75% drain — Wave 8B
- [x] Mega Evolution (BattleGimmick) — Wave 9
- [x] Integration tests + 82.6% branch coverage — Wave 10 (PR #638)

## Test count
- 793 → 1069 tests (276 added in Wave 10)
- Branch coverage: 68.24% → 82.61%

## Bug Fixes (merged alongside waves)
- PR #610/#611: Eviolite removability by Knock Off, type-boost item fix
- PR #617: Toxic Spikes Misty Terrain suppression
- PR #619: Gen6 damage calc ability fixes (Tough Claws contact fix)
- PR #623/#625: Assault Vest status block + Prankster/Gale Wings priority
- PR #628/#620: Pulse flag data fix + lazy per-hit damage in Gen2
- PR #631: Assault Vest + Prankster/Gale Wings turn order
- PR #632: Type resist berries moved to damage calc + Magic Room suppression
- PR #634: Hazard maxLayers delegation to GenerationRuleset
- PR #635: Traded Pokemon EXP bonus (1.5x same-language, 1.7x international)
- PR #636: Type param to getBattleGimmick() for Gen 7 disambiguation
- PR #752: Deep bughunt — EoT order adds `magic-room-countdown`, `wonder-room-countdown`, `gravity-countdown`, `slow-start-countdown`; Sheer Force whitelist adds `secret-power`, `relic-song` (closes #733 #734 #740)
- #785: Bughunt wave 2 — pokeRound fixes, Flash Fire/pinch stat modifiers, Flower Gift Atk, Reckless hasCrashDamage, Stance Change, Harvest harsh-sun, UNSUPPRESSABLE trim, Bulletproof flag, Sweet Veil effect, semi-invulnerable grounded, activated:false guards (closes #663 #662 #660 #659 #654 #652 #648 #675 #673 #672 #670 #668 #667 #665 #664 #658 #656 #651)
- PR #786: Unaware/Simple priority + Mold Breaker bypass directionality in getEffectiveStatStage (closes #757)

## OPEN BUGS

None. All tracked bugs closed.

## CLOSED BUGS

| Issue | Fixed In | Summary |
|-------|----------|---------|
| #663 | #785 | Iron Fist/Technician use Math.floor instead of pokeRound |
| #662 | #785 | Dry Skin fire multiplier uses Math.floor instead of pokeRound |
| #660 | #785 | Flash Fire applied as base-power modifier instead of stat modifier |
| #659 | #785 | Pinch abilities (Hustle, Rivalry) applied as base-power instead of stat modifier |
| #654 | #785 | Reckless uses Math.floor instead of pokeRound |
| #652 | #785 | Flower Gift Atk boost not applied in sun/harsh-sun |
| #648 | #785 | Reckless does not apply to moves with crash damage (hasCrashDamage) |
| #675 | #785 | Stance Change not implemented (Shield→Blade on attack, Blade→Shield on King's Shield) |
| #673 | #785 | Harvest only checks weather === "sun", not "harsh-sun" |
| #672 | #785 | UNSUPPRESSABLE_ABILITIES includes abilities that are suppressable in Gen 6 |
| #670 | #785 | Bulletproof uses hardcoded move list instead of move.flags.bullet |
| #668 | #785 | Sweet Veil blocks sleep using hardcoded move list instead of effect-based check |
| #667 | #785 | Pokemon using Fly are treated as grounded (should be non-grounded/semi-invulnerable) |
| #665 | #785 | Pokemon using Bounce are treated as grounded |
| #664 | #785 | Pokemon using Shadow Force/Phantom Force are treated as grounded |
| #658 | #785 | Solid Rock/Filter return activated:true even when move is not super effective |
| #656 | #785 | Tinted Lens returns activated:true even when move is not "not very effective" |
| #651 | #785 | Sniper returns activated:true even when move is not a critical hit |
| #757 | #786 | Unaware/Simple priority + Mold Breaker bypass directionality in getEffectiveStatStage |

## Deferred (engine-level, same as Gen 5)
- Sky Drop: needs engine-level two-turn volatile target tracking
- Pledge moves (doubles combos): needs engine-level multi-target combining
