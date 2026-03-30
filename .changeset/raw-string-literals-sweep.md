---
"@pokemon-lib-ts/core": patch
"@pokemon-lib-ts/battle": patch
"@pokemon-lib-ts/gen1": patch
"@pokemon-lib-ts/gen4": patch
"@pokemon-lib-ts/gen5": patch
"@pokemon-lib-ts/gen6": patch
"@pokemon-lib-ts/gen7": patch
"@pokemon-lib-ts/gen8": patch
"@pokemon-lib-ts/gen9": patch
---

refactor: replace raw string literals with domain constants (BATTLE_PHASE_IDS, CORE_VOLATILE_IDS)

Replace raw phase strings with BATTLE_PHASE_IDS in BattleEngine (transitionTo calls, phase comparisons, STABLE_CHECKPOINT_PHASES set). Replace raw volatile status strings with CORE_VOLATILE_IDS throughout gen1-gen9 src (slowStart, flashFire, confusion, bound, toxicCounter, rage, rageMissLock, trapped, focusEnergy, iceFaceBroken, disguiseBroken, quickGuard, wideGuard). Add quickGuard, wideGuard, rageMissLock constants to CORE_VOLATILE_IDS.
