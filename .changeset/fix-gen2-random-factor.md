---
"@pokemon-lib-ts/gen2": patch
---

Fix Gen 2 damage calc: use integer-only random factor multiply (baseDamage * roll / 255) matching pokecrystal behavior, eliminates float precision divergence (closes #542)
