---
"@pokemon-lib-ts/gen3": patch
---

Fix Gen 3 integration test assertions: correct side-assignment for damage events (Blaziken=side0, Swampert=side1) and fix rain OHKO assertion to check currentHp=0 and amount>=maxHp instead of amount===maxHp (raw damage can exceed HP on OHKO).
