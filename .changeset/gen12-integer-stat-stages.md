---
"@pokemon-lib-ts/gen1": patch
"@pokemon-lib-ts/gen2": patch
---

fix(gen1,gen2): use integer stat stage arithmetic from pret disassemblies

Gen 1-2 hardware applies stat stages as integer multiplication (`stat * num / den`) using
the lookup table from `pokered data/battle/stat_modifiers.asm` and `pokecrystal
data/battle/stat_multipliers.asm`. Using float approximations (`getStatStageMultiplier`)
produces off-by-one results at certain stat values (e.g. base Attack 150 at stage -1:
integer=99, float=100).

Also fixes the Gen 1 Focus Energy bug: the pokered disassembly shows a `srl b` instruction
(`>>1`, divide by 2) instead of the intended `sla b` (`<<1`, multiply by 2). The net effect
is 1/4 of the normal crit rate (dividing by 2 instead of multiplying by 2). Gen 1 CLAUDE.md
confirmed: "Divides crit rate by 4 instead of multiplying (does the opposite of what it
should)".

Closes #287
Closes #314
