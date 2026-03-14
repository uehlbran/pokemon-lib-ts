import { DataManager } from "@pokemon-lib/core";
import type { MoveData, PokemonSpeciesData } from "@pokemon-lib/core";

/**
 * Creates a DataManager pre-loaded with minimal test data.
 */
export function createMockDataManager(): DataManager {
  const dm = new DataManager();

  const tackleMoveData: MoveData = {
    id: "tackle",
    displayName: "Tackle",
    type: "normal",
    category: "physical",
    power: 40,
    accuracy: 100,
    pp: 35,
    priority: 0,
    target: "adjacent-foe",
    flags: {
      contact: true,
      sound: false,
      bullet: false,
      pulse: false,
      punch: false,
      bite: false,
      wind: false,
      slicing: false,
      powder: false,
      protect: true,
      mirror: true,
      snatch: false,
      gravity: false,
      defrost: false,
      recharge: false,
      charge: false,
      bypassSubstitute: false,
    },
    effect: null,
    description: "A physical attack in which the user charges and slams into the target.",
    generation: 1,
  };

  const thunderboltMoveData: MoveData = {
    id: "thunderbolt",
    displayName: "Thunderbolt",
    type: "electric",
    category: "special",
    power: 90,
    accuracy: 100,
    pp: 15,
    priority: 0,
    target: "adjacent-foe",
    flags: {
      contact: false,
      sound: false,
      bullet: false,
      pulse: false,
      punch: false,
      bite: false,
      wind: false,
      slicing: false,
      powder: false,
      protect: true,
      mirror: true,
      snatch: false,
      gravity: false,
      defrost: false,
      recharge: false,
      charge: false,
      bypassSubstitute: false,
    },
    effect: { type: "status-chance", status: "paralysis", chance: 10 },
    description: "A strong electric blast.",
    generation: 1,
  };

  const scratchMoveData: MoveData = {
    id: "scratch",
    displayName: "Scratch",
    type: "normal",
    category: "physical",
    power: 40,
    accuracy: 100,
    pp: 35,
    priority: 0,
    target: "adjacent-foe",
    flags: {
      contact: true,
      sound: false,
      bullet: false,
      pulse: false,
      punch: false,
      bite: false,
      wind: false,
      slicing: false,
      powder: false,
      protect: true,
      mirror: true,
      snatch: false,
      gravity: false,
      defrost: false,
      recharge: false,
      charge: false,
      bypassSubstitute: false,
    },
    effect: null,
    description: "Hard, pointed, sharp claws rake the target.",
    generation: 1,
  };

  const quickAttackMoveData: MoveData = {
    id: "quick-attack",
    displayName: "Quick Attack",
    type: "normal",
    category: "physical",
    power: 40,
    accuracy: 100,
    pp: 30,
    priority: 1,
    target: "adjacent-foe",
    flags: {
      contact: true,
      sound: false,
      bullet: false,
      pulse: false,
      punch: false,
      bite: false,
      wind: false,
      slicing: false,
      powder: false,
      protect: true,
      mirror: true,
      snatch: false,
      gravity: false,
      defrost: false,
      recharge: false,
      charge: false,
      bypassSubstitute: false,
    },
    effect: null,
    description: "The user lunges at the target at a speed that makes it almost invisible.",
    generation: 1,
  };

  // Minimal species data for Charizard (6) and Blastoise (9)
  const charizardSpecies: PokemonSpeciesData = {
    id: 6,
    name: "charizard",
    displayName: "Charizard",
    types: ["fire", "flying"],
    baseStats: {
      hp: 78,
      attack: 84,
      defense: 78,
      spAttack: 109,
      spDefense: 85,
      speed: 100,
    },
    abilities: { normal: ["blaze"], hidden: "solar-power" },
    genderRatio: 87.5,
    catchRate: 45,
    baseExp: 240,
    expGroup: "medium-slow",
    evYield: { spAttack: 3 },
    eggGroups: ["monster", "dragon"],
    learnset: {
      levelUp: [
        { level: 1, move: "scratch" },
        { level: 1, move: "tackle" },
      ],
      tm: [],
      egg: [],
      tutor: [],
    },
    evolution: null,
    dimensions: { height: 1.7, weight: 90.5 },
    spriteKey: "charizard",
    baseFriendship: 70,
    generation: 1,
    isLegendary: false,
    isMythical: false,
  };

  const blastoiseSpecies: PokemonSpeciesData = {
    id: 9,
    name: "blastoise",
    displayName: "Blastoise",
    types: ["water"],
    baseStats: {
      hp: 79,
      attack: 83,
      defense: 100,
      spAttack: 85,
      spDefense: 105,
      speed: 78,
    },
    abilities: { normal: ["torrent"], hidden: "rain-dish" },
    genderRatio: 87.5,
    catchRate: 45,
    baseExp: 239,
    expGroup: "medium-slow",
    evYield: { spDefense: 3 },
    eggGroups: ["monster", "water1"],
    learnset: {
      levelUp: [{ level: 1, move: "tackle" }],
      tm: [],
      egg: [],
      tutor: [],
    },
    evolution: null,
    dimensions: { height: 1.6, weight: 85.5 },
    spriteKey: "blastoise",
    baseFriendship: 70,
    generation: 1,
    isLegendary: false,
    isMythical: false,
  };

  const pikachuSpecies: PokemonSpeciesData = {
    id: 25,
    name: "pikachu",
    displayName: "Pikachu",
    types: ["electric"],
    baseStats: {
      hp: 35,
      attack: 55,
      defense: 40,
      spAttack: 50,
      spDefense: 50,
      speed: 90,
    },
    abilities: { normal: ["static"], hidden: "lightning-rod" },
    genderRatio: 50,
    catchRate: 190,
    baseExp: 112,
    expGroup: "medium-fast",
    evYield: { speed: 2 },
    eggGroups: ["field", "fairy"],
    learnset: {
      levelUp: [
        { level: 1, move: "thunder-shock" },
        { level: 1, move: "quick-attack" },
      ],
      tm: ["thunderbolt"],
      egg: [],
      tutor: [],
    },
    evolution: null,
    dimensions: { height: 0.4, weight: 6.0 },
    spriteKey: "pikachu",
    baseFriendship: 70,
    generation: 1,
    isLegendary: false,
    isMythical: false,
  };

  const typeChart: Record<string, Record<string, number>> = {};
  const allTypes = [
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
    "dark",
    "steel",
    "fairy",
  ];
  for (const atk of allTypes) {
    typeChart[atk] = {};
    for (const def of allTypes) {
      typeChart[atk]![def] = 1;
    }
  }

  dm.loadFromObjects({
    pokemon: [charizardSpecies, blastoiseSpecies, pikachuSpecies],
    moves: [tackleMoveData, thunderboltMoveData, scratchMoveData, quickAttackMoveData],
    typeChart: typeChart as any,
  });

  return dm;
}
