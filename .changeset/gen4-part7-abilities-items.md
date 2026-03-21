---
"@pokemon-lib-ts/gen4": minor
---

feat(gen4): Steadfast, Trace, Flash Fire volatile, Choice Band/Specs/Scarf, Flash Fire damage boost

- Steadfast ability handler (on-flinch: +1 Speed stage)
- Trace ability handler (on-switch-in: copies opponent's ability, with uncopyable list)
- Flash Fire passive-immunity upgrade to set flash-fire volatile status
- Flash Fire volatile damage boost (1.5x Fire move base power)
- Choice Scarf speed modifier (1.5x Speed in getEffectiveSpeed)
- Tests for all new mechanics in abilities-part7.test.ts and choice-items.test.ts
