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

Also fixes the Gen 1 Focus Energy bug: the pokered disassembly shows a `>>2` shift (divide
by 4) not `>>1`, so the crit threshold is divided by 4 rather than 2. Gen 1 CLAUDE.md
confirmed: "Divides crit rate by 4 instead of multiplying (does the opposite of what it
should)".

Fixes: #291
