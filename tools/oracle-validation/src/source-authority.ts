export interface SourceAuthority {
  readonly primary: readonly string[];
  readonly fallback: readonly string[];
  readonly references: readonly string[];
}

const SOURCE_AUTHORITIES: Record<number, SourceAuthority> = {
  1: {
    primary: ["pret/pokered"],
    fallback: ["Bulbapedia", "Pokemon Showdown"],
    references: ["references/pokered-master/", "specs/reference/gen1-ground-truth.md"],
  },
  2: {
    primary: ["pret/pokecrystal"],
    fallback: ["Bulbapedia", "Pokemon Showdown"],
    references: ["references/pokecrystal-master/", "specs/reference/gen2-ground-truth.md"],
  },
  3: {
    primary: ["pret/pokeemerald"],
    fallback: ["Pokemon Showdown", "Bulbapedia"],
    references: [
      "references/pokeemerald-master/",
      "references/pokefirered-master/",
      "specs/reference/gen3-status.md",
    ],
  },
  4: {
    primary: ["pret/pokeplatinum", "pret/pokeheartgold", "Pokemon Showdown"],
    fallback: ["Bulbapedia", "Smogon"],
    references: [
      "references/pokeplatinum-main/",
      "references/pokeheartgold-master/",
      "references/pokemon-showdown/",
      "specs/reference/gen4-status.md",
    ],
  },
  5: {
    primary: ["Pokemon Showdown"],
    fallback: ["Bulbapedia", "Smogon"],
    references: ["references/pokemon-showdown/"],
  },
  6: {
    primary: ["Pokemon Showdown"],
    fallback: ["Bulbapedia", "Smogon"],
    references: ["references/pokemon-showdown/"],
  },
  7: {
    primary: ["Pokemon Showdown"],
    fallback: ["Bulbapedia", "Smogon"],
    references: ["references/pokemon-showdown/"],
  },
  8: {
    primary: ["Pokemon Showdown"],
    fallback: ["Bulbapedia", "Smogon"],
    references: ["references/pokemon-showdown/", "specs/reference/gen8-ground-truth.md"],
  },
  9: {
    primary: ["Pokemon Showdown"],
    fallback: ["Bulbapedia", "Smogon"],
    references: ["references/pokemon-showdown/", "specs/reference/gen9-ground-truth.md"],
  },
};

export function getSourceAuthority(gen: number): SourceAuthority {
  const authority = SOURCE_AUTHORITIES[gen];
  if (!authority) {
    throw new Error(`No source authority registered for generation ${gen}`);
  }
  return authority;
}
