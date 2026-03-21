---
"@pokemon-lib-ts/gen4": patch
"@pokemon-lib-ts/battle": patch
---

Fix 32 Gen 4 audit bugs: sleep wake-turn blocking, rollSleepTurns range (1-4), Magic Guard full paralysis, entry hazard grounding (Gravity/Iron Ball), Simple/Unaware order, Lucky Chant crits, Tangled Feet accuracy; weather/+2 modifier order, Flash Fire placement, Thick Fat/Heatproof base power, Life Orb/Metronome Phase 2, Muscle Band/Wise Glasses as base power, Expert Belt 4915/4096, Reflect/Light Screen halving; Storm Drain (no Gen 4 immunity), Stench (no Gen 4 flinch), Effect Spore PRNG, Normalize/Struggle, Metronome item step, Light Ball base power, Griseous Orb, King's Rock whitelist, Jaboca/Rowap attacker HP, Custap Berry Gluttony/consumption, Petaya Natural Gift type; Whirlwind/Roar forcedSwitch+Ingrain check, binding duration 3-6, Rest fixed 2-turn sleep, Disable random 4-7 turns; plus applyEntryHazards interface extension for Gravity/Iron Ball grounding.
