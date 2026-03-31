---
"@pokemon-lib-ts/core": patch
"@pokemon-lib-ts/battle": patch
"@pokemon-lib-ts/gen7": patch
"@pokemon-lib-ts/gen8": patch
"@pokemon-lib-ts/gen9": patch
"@pokemon-lib-ts/gen4": patch
"@pokemon-lib-ts/gen5": patch
---

Fix held-item stat-change trigger routing so pre-apply vetoes and post-apply reactions reach the runtime engine instead of remaining helper-only or data-only.

**core (patch)**: Add held-item trigger ids for `on-stat-change` and `on-foe-stat-change`.

**battle (patch)**: Extend item trigger context/result contracts for stat-change metadata and blocked-stage reporting; batch stat changes through the engine so held items can veto before application, react after application, and defer post-boost item results safely.

**gen7 (patch)**: Route held-item `on-stat-change` triggers and implement `Adrenaline Orb` activation on opponent Intimidate attack drops.

**gen8 (patch)**: Route held-item `on-stat-change` triggers for `Adrenaline Orb` and `Eject Pack`; keep stat-change item reference data aligned with the engine trigger surface.

**gen9 (patch)**: Route held-item stat-change triggers for `Clear Amulet`, `Eject Pack`, `Adrenaline Orb`, and foe-side `Mirror Herb` reactions.

**gen4 / gen5 (patch)**: Clean up lint-only unused parameters/imports in Facade and move-effect test/support files so the repo verification gate stays green.
