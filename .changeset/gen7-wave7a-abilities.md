---
"@pokemon-lib-ts/gen7": minor
---

Add Gen 7 damage-modifying and stat/priority ability handlers (Wave 7A)

New modules:
- Gen7AbilitiesDamage: Tough Claws, Strong Jaw, Mega Launcher, Fur Coat, Sheer Force, Technician, Iron Fist, Reckless, Analytic, Sniper, Multiscale/Shadow Shield, Solid Rock/Filter/Prism Armor, Tinted Lens, -ate abilities (Gen 7 1.2x nerf), Parental Bond (Gen 7 0.25x nerf), Galvanize (new), Sturdy
- Gen7AbilitiesStat: Prankster (Dark-type immunity nerf), Gale Wings (full-HP nerf), Triage (+3 priority, new), Beast Boost (new), Stamina (new), Moxie, Defiant, Competitive, Weak Armor (+2 Speed in Gen 7), Justified, Rattled, Speed Boost, Moody, Steadfast, Protean, Contrary, Simple, Unnerve
- Gen7Ruleset.applyAbility() now dispatches to both modules based on trigger type
- Gen7Ruleset.resolveTurnOrder() uses ability-aware priority bonuses (+1 for Prankster/Gale Wings, +3 for Triage)
