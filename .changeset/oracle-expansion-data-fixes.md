---
"@pokemon-lib-ts/core": patch
"@pokemon-lib-ts/gen1": patch
"@pokemon-lib-ts/gen2": patch
"@pokemon-lib-ts/gen3": patch
"@pokemon-lib-ts/gen4": patch
"@pokemon-lib-ts/gen5": patch
"@pokemon-lib-ts/gen6": patch
"@pokemon-lib-ts/gen7": patch
"@pokemon-lib-ts/gen8": patch
"@pokemon-lib-ts/gen9": patch
---

Fix stat-change effect targets, move metadata, and Max Move power tables

- Add `ally` target value to `CORE_MOVE_EFFECT_TARGETS` and `StatChangeEffect.target` union in core
- Fix 307 pure stat-change moves across Gen 2-9 that had `effect.target="self"` when they should be `"foe"` (growl, leer, tail-whip, screech, etc.)
- Fix 61 damaging moves with self-lowering secondary effects (close-combat, draco-meteor, leaf-storm, overheat, superpower, etc.) that were incorrectly changed to `"foe"` — reverted to `"self"`
- Fix Gen 1 move metadata: counter and bide category `status→physical`; counter, bide, guillotine, horn-drill contact `false→true`
- Fix Gen 8 Max Move power table thresholds per ERRATA #20: correct dual-table boundaries (Fighting/Poison `<45→70…≥150→100`; standard `<45→90…≥150→150`)
- Fix Gen 8-9 howl `effect.target` to `"self"` (Gen 8+ Howl targets allies, maps to self in single battles)
