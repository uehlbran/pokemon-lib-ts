---
"@pokemon-lib-ts/core": minor
"@pokemon-lib-ts/gen2": patch
"@pokemon-lib-ts/gen3": patch
"@pokemon-lib-ts/gen4": patch
"@pokemon-lib-ts/gen8": patch
---

fix(data): Correct Curse type to unknown (TYPE_MYSTERY) in Gen 2-4

Curse uses a distinct TYPE_MYSTERY/CURSE_TYPE in Gen 2-4 ROM data, not Ghost type.
- Gen 2 (pokecrystal): CURSE_TYPE = 19 (constants/type_constants.asm)
- Gen 3 (pokeemerald): TYPE_MYSTERY = 9 (include/constants/pokemon.h)
- Gen 4 (pokeplatinum): TYPE_MYSTERY = 9 (include/constants/pokemon.h)

Adds "unknown" to PokemonType union and CORE_TYPE_IDS. TypeChart is now a sparse
Partial<Record<...>> so gen-specific charts do not need to carry "unknown" rows/columns.
Gen8MaxMoves MAX_MOVE_NAMES updated to use Partial type accordingly.

Source: pret/pokecrystal constants/type_constants.asm, pret/pokeemerald include/constants/pokemon.h
