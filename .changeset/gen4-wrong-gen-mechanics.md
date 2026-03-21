---
"@pokemon-lib-ts/gen4": patch
---

fix(gen4): replace Gen 5+ mechanics with correct Gen 4 behavior

Multiple Gen 4 methods were implementing Gen 5+ behavior instead of Gen 4:

- **Sleep**: Pokemon can now act on the turn they wake up (Gen 3-4 behavior); returning `false`
  on wake was Gen 1-2 behavior. Source: pret/pokeplatinum + Showdown Gen 4.
- **Stench**: Removed 10% flinch effect. Stench has no battle effect in Gen 4 (Bulbapedia:
  "Has no effect in battle" prior to Gen 5).
- **Storm Drain**: Removed Water immunity and SpAtk boost (Gen 5+ behavior). Gen 4 Storm Drain
  only redirects Water moves in doubles — no effect in singles.
- **Thick Fat**: Now halves base power of Fire/Ice moves (Gen 4 `onModifyBasePower`), not the
  attacker's offensive stat (which is Gen 5+ `onSourceModifyAtk`).
- **Heatproof**: Now applies 0.5× final damage modifier on Fire moves (Gen 4
  `onSourceModifyDamage`), not a base power reduction.
- **Metronome item**: Changed step from 0.2× to 0.1× and cap from 2.0× to 1.5×. Gen 4 uses
  10% increments capped at +50%. The 20%/200% values are Gen 5+.
- **Teravolt/Turboblaze**: Removed references to these Gen 5 abilities from Gen 4 damage calc.

Sources: Showdown Gen 4 mod, pret/pokeplatinum where available.

Fixes: #350, #351, #353, #354, #355, #356, #358, #377, #384
