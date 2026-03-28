---
"@pokemon-lib-ts/battle": patch
"@pokemon-lib-ts/core": patch
---

fix(battle,core): address missed `#1081` review findings

- reject unsupported battle formats before deeper config validation
- reject singles configs that do not provide exactly two sides
- preserve ruleset-only nature validation failures during battle preflight
- normalize experience growth groups before the level-1 fast path so unsupported identifiers still throw
