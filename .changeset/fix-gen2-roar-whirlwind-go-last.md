---
"@pokemon-lib-ts/gen2": patch
---

fix(gen2): add go-last guard to Roar/Whirlwind — fail when user moves first

Source: pret/pokecrystal engine/battle/effect_commands.asm BattleCommand_ForceSwitch
lines 5008-5010 — wEnemyGoesFirst check fails the move when user moved first.
