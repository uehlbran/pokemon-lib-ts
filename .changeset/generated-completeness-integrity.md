---
"@pokemon-lib-ts/core": minor
"@pokemon-lib-ts/battle": minor
"@pokemon-lib-ts/gen1": patch
"@pokemon-lib-ts/gen2": patch
"@pokemon-lib-ts/gen3": patch
"@pokemon-lib-ts/gen4": patch
"@pokemon-lib-ts/gen5": patch
"@pokemon-lib-ts/gen6": patch
"@pokemon-lib-ts/gen7": patch
"@pokemon-lib-ts/gen8": patch
"@pokemon-lib-ts/gen9": patch
---

Strengthen verification honesty and completeness tracking across the monorepo.

- make declared test tiers, contract tests, and smoke checks part of honest local/CI verification
- add runtime dispatch coverage for later-gen stateful mechanics including Stockpile, Spit Up, Swallow, Power Trick, Recycle, Belch, Telekinesis, Core Enforcer, and Psychic Noise
- preserve imported metadata needed for crit ratios, status stat-change targets, fling metadata, and special ability slots across committed gen data
- generate machine-readable completeness status and inventory artifacts, then block hand-written completion claims outside those generated results
