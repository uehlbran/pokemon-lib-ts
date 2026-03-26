export const GEN1_BOUNDS = {
  SPECIES_COUNT: 151,
  MOVE_COUNT: 165,
  TYPE_COUNT: 15,
  ITEM_COUNT: 0,
  NATURE_COUNT: 0,
  FIRST_SPECIES_ID: 1,
  LAST_SPECIES_ID: 151,
} as const;

export const GEN1_TYPE_NAMES = [
  "normal",
  "fire",
  "water",
  "electric",
  "grass",
  "ice",
  "fighting",
  "poison",
  "ground",
  "flying",
  "psychic",
  "bug",
  "rock",
  "ghost",
  "dragon",
] as const;

export const GEN1_SPECIES = {
  BULBASAUR: {
    id: 1,
    name: "bulbasaur",
    displayName: "Bulbasaur",
    types: ["grass", "poison"] as const,
    baseStats: {
      hp: 45,
      attack: 49,
      defense: 49,
      spAttack: 65,
      spDefense: 65,
      speed: 45,
    },
    evolvesTo: { speciesId: 2, level: 16, method: "level-up" as const },
  },
  IVYSAUR: {
    id: 2,
    evolvesFrom: { speciesId: 1 },
    evolvesTo: { speciesId: 3, level: 32 },
  },
  CHARIZARD: {
    id: 6,
    name: "charizard",
    displayName: "Charizard",
    types: ["fire", "flying"] as const,
    baseStats: {
      hp: 78,
      attack: 84,
      defense: 78,
      spAttack: 109,
      spDefense: 109,
      speed: 100,
    },
  },
  PIKACHU: {
    id: 25,
    name: "pikachu",
    displayName: "Pikachu",
    types: ["electric"] as const,
    baseStats: {
      hp: 35,
      attack: 55,
      defense: 30,
      spAttack: 50,
      spDefense: 50,
      speed: 90,
    },
  },
  GENGAR: {
    id: 94,
    displayName: "Gengar",
    types: ["ghost", "poison"] as const,
  },
  EEVEE: {
    id: 133,
    evolutionTargets: [134, 135, 136] as const,
  },
  SNORLAX: {
    id: 143,
    displayName: "Snorlax",
    baseStats: {
      hp: 160,
      attack: 110,
      defense: 65,
      speed: 30,
    },
  },
  MEWTWO: {
    id: 150,
    displayName: "Mewtwo",
    types: ["psychic"] as const,
    baseStats: {
      hp: 106,
      attack: 110,
      defense: 90,
      spAttack: 154,
      spDefense: 154,
      speed: 130,
    },
  },
  MEW: {
    id: 151,
    name: "mew",
    displayName: "Mew",
    types: ["psychic"] as const,
    baseStats: {
      hp: 100,
      attack: 100,
      defense: 100,
      spAttack: 100,
      spDefense: 100,
      speed: 100,
    },
  },
} as const;

export const GEN1_MOVES = {
  FLAMETHROWER: {
    id: "flamethrower",
    displayName: "Flamethrower",
    type: "fire",
    category: "special",
    power: 95,
    accuracy: 100,
    pp: 15,
  },
  TACKLE: {
    id: "tackle",
    type: "normal",
    category: "physical",
    power: 35,
  },
  EARTHQUAKE: {
    id: "earthquake",
    type: "ground",
    category: "physical",
    power: 100,
    accuracy: 100,
  },
  THUNDERBOLT: {
    id: "thunderbolt",
    type: "electric",
    category: "special",
    power: 95,
  },
  PSYCHIC: {
    id: "psychic",
    displayName: "Psychic",
    type: "psychic",
    category: "special",
    power: 90,
  },
  SWIFT: {
    id: "swift",
    accuracy: null,
  },
  QUICK_ATTACK: {
    id: "quick-attack",
    type: "normal",
    category: "physical",
    power: 40,
    priority: 1,
  },
  COUNTER: {
    id: "counter",
  },
  HYPER_BEAM: {
    id: "hyper-beam",
    displayName: "Hyper Beam",
    type: "normal",
    power: 150,
  },
  ICE_BEAM: {
    id: "ice-beam",
    category: "special",
  },
  SURF: {
    id: "surf",
    category: "special",
  },
  INVALID: "fake-move-that-doesnt-exist",
  INVALID_ALT: "totally-fake-move",
} as const;

export const GEN1_INVALID_SPECIES_IDS = {
  LOW: 0,
  HIGH: 152,
  MISSING: 999,
} as const;
