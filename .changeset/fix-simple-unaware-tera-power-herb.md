---
"@pokemon-lib-ts/battle": patch
"@pokemon-lib-ts/gen5": patch
"@pokemon-lib-ts/gen6": patch
"@pokemon-lib-ts/gen7": patch
"@pokemon-lib-ts/gen8": patch
"@pokemon-lib-ts/gen9": patch
---

Fix Simple/Unaware order (gen5-9), Gen9 Terastallization STAB, Gen6 Power Herb

**battle (patch)**: `createActivePokemon` in BattleHelpers — restore defensive types correctly on switch-in for terastallized Pokemon: non-Stellar uses `[teraType]`, Stellar restores from `teraTypes` (original types).

**gen5-9 (patch)**: `getEffectiveStatStage` — Unaware check now runs BEFORE Simple (was reversed). Added Mold Breaker / Turboblaze / Teravolt bypass for both Unaware and Simple, matching Gen 4's correct implementation. When the attacking Pokemon has Simple (+2 stages) and the defender has Unaware, result is now 0 (correct) instead of 4 (wrong) (#757).

**gen6 (patch)**: `handlePhantomForce` in Gen6MoveEffects — add Power Herb check with Klutz/Embargo suppression before first-turn charge logic. Returns `attackerItemConsumed: true` so the engine clears the held item. Prevents indefinite Power Herb charge-skip on Phantom Force/Shadow Force (#684).

**gen9 (patch)**: `Gen9Terastallization.activate()` — capture `originalTypes` before changing `pokemon.types` to `[teraType]`. `pokemon.pokemon.teraTypes` now correctly stores pre-Tera types so `getOriginalTypes()` returns the right types for cross-type STAB calculation (#756).

Closes #757
Closes #756
Closes #684
