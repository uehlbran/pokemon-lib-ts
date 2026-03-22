---
"@pokemon-lib-ts/core": patch
"@pokemon-lib-ts/battle": minor
"@pokemon-lib-ts/gen1": patch
"@pokemon-lib-ts/gen2": patch
"@pokemon-lib-ts/gen3": patch
"@pokemon-lib-ts/gen5": patch
"@pokemon-lib-ts/gen6": patch
"@pokemon-lib-ts/gen7": patch
"@pokemon-lib-ts/gen8": patch
---

Deep bughunt Gen 5-8: applyAbility routing, EoT order, Sturdy/Disguise, Dynamax revert, Z-Move/Max Move Protect bypass, Sheer Force whitelist, canBypassProtect delegation

**core (patch)**: Added `"max-guard"` to `ProtectEffect.variant` union and `VolatileStatus` union to support the distinct Max Guard volatile status.

**battle (minor)**: `canBypassProtect()` is now a required method on `DamageSystem` (was optional); engine checks `"max-guard"` volatile first as always-block before the regular Protect+bypass check; `preDynamaxMaxHp` moved from core `PokemonInstance` to `ActivePokemon` in `BattleSide`; engine now delegates Protect bypass to ruleset instead of reading `zMovePower`/`isDynamaxed` directly (Cardinal Rule compliance).

**gen5 (patch)**: Fix Protect success formula — denominator ≥ 256 uses `rng.chance(1/2**32)` matching Showdown's `randomChance(1, 2**32)`.

**gen6 (patch)**: EoT order — add missing `magic-room-countdown`, `wonder-room-countdown`, `gravity-countdown`, `slow-start-countdown` (Magic Room/Wonder Room/Gravity/Slow Start were never expiring); Sheer Force whitelist expanded with `secret-power` and `relic-song`.

**gen7 (patch)**: EoT order — same 4 missing countdowns fixed; Z-Move through Protect now deals 0.25x via `hitThroughProtect` flag in `DamageContext`; `canBypassProtect()` override routes Z-Moves; Disguise `capLethalDamage` now marks `disguise-broken` volatile so Disguise cannot re-activate after breaking.

**gen1 (patch)**: Added `canBypassProtect()` implementation (returns false — no moves bypass Protect in Gen 1).

**gen2 (patch)**: Added `canBypassProtect()` implementation (returns false — no moves bypass Protect in Gen 2).

**gen3 (patch)**: `Gen3MoveEffects` protect case now sets `"max-guard"` volatile for Max Guard variant (vs `"protect"` for all other protect variants).

**gen8 (patch)**: `applyAbility()` — add missing trigger routes `passive-immunity`, `on-damage-taken`, `on-flinch`, `on-stat-change` (Volt Absorb, Justified, Steadfast, Defiant, etc.); `getEndOfTurnOrder()` override with 37 effects matching Gen 7 (Speed Boost, Toxic Orb, Moody, etc. now fire); `capLethalDamage()` — Disguise (1/8 chip damage, Gen 8 change from 0) + Sturdy; `canBypassProtect()` override — Max Moves bypass regular Protect at 0.25x but NOT Max Guard (distinct volatile, always-block); `Gen8Dynamax.revert()` — validates side index BEFORE state mutation (sentinel fix), stores `preDynamaxMaxHp` on `ActivePokemon` (fixes off-by-1 HP); Max Guard uses `"max-guard"` variant so it sets a distinct volatile that no move can bypass.

Closes #732, #733, #734, #735, #736, #739, #740, #741, #742, #746, #747
