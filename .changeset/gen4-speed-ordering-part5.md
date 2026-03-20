---
"@pokemon-lib-ts/gen4": minor
---

feat(gen4): Tailwind speed doubling and Trick Room turn ordering

Override resolveTurnOrder in Gen4Ruleset to handle Tailwind (doubles effective speed) and Trick Room (reverses speed comparison). Added getEndOfTurnOrder with Gen 4-specific EoT ordering. Comprehensive test coverage for speed ordering, Wish, Roost non-Flying branch, Focus Band, and held-item default branches.
