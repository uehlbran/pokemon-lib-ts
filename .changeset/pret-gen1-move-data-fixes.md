---
"@pokemon-lib-ts/gen1": patch
---

Fix Gen 1 move data to match pret/pokered cartridge values.

Six corrections per pret/pokered data/moves/moves.asm:
- Gust type: flying → normal (pokered line 29)
- Sand Attack type: ground → normal (pokered line 41)
- Absorb PP: 25 → 20 (pokered line 84)
- Mega Drain PP: 15 → 10 (pokered line 85)
- Razor Wind accuracy: 100 → 75 (pokered line 26)
- Whirlwind accuracy: 100 → 85 (pokered line 31)
