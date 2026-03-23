---
"@pokemon-lib-ts/gen6": patch
---

Fix Gen6 AIRBORNE_SEMI_INVULNERABLE volatile id mismatch (#794)

**gen6 (patch)**: Update `AIRBORNE_SEMI_INVULNERABLE` in `Gen6EntryHazards.ts` to use the actual engine volatile ids (`"flying"` and `"shadow-force-charging"`) instead of wrong ids (`"fly"`, `"bounce"`, `"shadow-force"`, `"phantom-force"`). Pokemon using Phantom Force/Shadow Force were incorrectly treated as grounded during the charge turn because the engine applies `"shadow-force-charging"` as the volatile, not `"shadow-force"`. Similarly, Fly/Bounce use `"flying"`, not `"fly"`/`"bounce"`.

Closes #794
