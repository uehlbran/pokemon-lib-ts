---
"@pokemon-lib-ts/gen9": patch
---

Rename inconsistently-named Gen9 ability functions to use consistent naming pattern:
- `handleGen9IntrepidSword` -> `applyIntrepidSwordGen9`
- `handleGen9DauntlessShield` -> `applyDauntlessShieldGen9`
- `handleGen9ProteanTypeChange` -> `applyProteanTypeChangeGen9`

The `apply*` prefix distinguishes direct-mutation utilities (in Gen9AbilitiesDamage.ts) from
`handle*` AbilityResult-returning trigger handlers (in Gen9AbilitiesNew.ts). All functions
now use a consistent `*Gen9` suffix.
