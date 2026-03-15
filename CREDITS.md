# Credits & Acknowledgments

This project would not exist without the following communities, tools, and resources.

## Data Sources

### Pokemon Showdown — [github.com/smogon/pokemon-showdown](https://github.com/smogon/pokemon-showdown)
Our primary data source. Showdown's battle-tested, generation-split data files provide the foundation for every `pokemon.json`, `moves.json`, `type-chart.json`, `abilities.json`, and `items.json` we ship. Its battle simulator is also the authoritative reference for how mechanics actually work — when our implementation disagrees with Showdown, ours is wrong.

Maintained by [Smogon](https://www.smogon.com/) and the competitive Pokemon community.

### PokeAPI — [pokeapi.co](https://pokeapi.co/)
Our secondary data source. PokeAPI fills in the species metadata that Showdown doesn't track: Pokedex entries, catch rates, egg groups, growth rates, and evolution chains. We pull from the [api-data](https://github.com/PokeAPI/api-data) repo (pre-joined JSON).

### Bulbapedia — [bulbapedia.bulbagarden.net](https://bulbapedia.bulbagarden.net/)
The authoritative wiki for Pokemon mechanics. Every stat formula, damage calculation, type chart, and generation quirk in this project was validated against Bulbapedia's documentation. Our testing philosophy starts here: if we can't match Bulbapedia's known values, we have a bug.

Key pages we reference constantly:
- [Damage](https://bulbapedia.bulbagarden.net/wiki/Damage) — damage formula per generation
- [Stat](https://bulbapedia.bulbagarden.net/wiki/Stat) — stat calculation formulas
- [Type/Chart](https://bulbapedia.bulbagarden.net/wiki/Type/Chart) — type effectiveness matrices
- [Critical hit](https://bulbapedia.bulbagarden.net/wiki/Critical_hit) — crit mechanics per gen
- [Experience](https://bulbapedia.bulbagarden.net/wiki/Experience) — EXP curves and formulas

## Reference Implementations

### Showdown Damage Calculator — [calc.pokemonshowdown.com](https://calc.pokemonshowdown.com/)
Used to verify our damage calculation implementation against known-good results. When writing tests, we plug values into this calculator and use the output as expected test values.

### Pokemon Essentials — [github.com/Maruno17/pokemon-essentials](https://github.com/Maruno17/pokemon-essentials)
The fan game standard for 10+ years. Its Ruby-based battle system is a valuable cross-reference for edge cases and quirky mechanics that are well-documented in its code.

## Community Resources

### Smogon — [smogon.com](https://www.smogon.com/)
The competitive Pokemon community behind Showdown. Their rigorous approach to documenting and implementing battle mechanics — across every generation — set the standard we build against.

### Veekun — [veekun.com](https://veekun.com/)
Open-source Pokemon database with downloadable data. A useful general-purpose reference for Pokemon data and mechanics.

### Serebii — [serebii.net](https://www.serebii.net/)
Comprehensive Pokemon reference site. Useful for cross-checking mechanics details and finding information that other sources don't cover.

### PokemonDB — [pokemondb.net](https://pokemondb.net/)
Clean, well-organized Pokemon database. Referenced for ability documentation and generation-specific data lookups.

---

Pokemon is a trademark of Nintendo, Game Freak, and Creatures Inc. This is a fan project for educational and non-commercial purposes.
