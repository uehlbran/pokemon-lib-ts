/**
 * A Pokémon's gender. Introduced in Gen 2 (Pokémon Gold/Silver).
 *
 * Valid values:
 * - `"male"` — the Pokémon is male
 * - `"female"` — the Pokémon is female
 * - `"genderless"` — the Pokémon has no gender (e.g., Magnemite, Staryu, most legendaries)
 *
 * In Gen 1, there is no gender mechanic — all Pokémon are effectively genderless
 * for battle purposes, but gender is still stored for display consistency.
 * Some moves and abilities (Attract, Rivalry, Cute Charm) interact with gender from Gen 2+.
 */
export type Gender = "male" | "female" | "genderless";
