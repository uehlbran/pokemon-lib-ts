import type {
  DataManager,
  MutableStatBlock,
  PokemonInstance,
  PokemonSpeciesData,
  SeededRandom,
  StatBlock,
} from "@pokemon-lib-ts/core";
import {
  ALL_NATURES,
  CORE_ABILITY_SLOTS,
  CORE_GENDERS,
  CORE_ITEM_IDS,
  createDvs,
  createEvs,
  createFriendship,
  createIvs,
  createStatExp,
  MAX_DV,
  MAX_IV,
  MIN_DV,
  MIN_IV,
  NEUTRAL_NATURES,
} from "@pokemon-lib-ts/core";
import type { TeamGeneratorOptions } from "./types.js";

const DEFAULT_OPTIONS: TeamGeneratorOptions = {
  teamSize: 3,
  levelRange: [50, 100],
  movesPerPokemon: [1, 4],
  allowDuplicateSpecies: false,
  uidPrefix: "sim",
};

const ALL_NATURE_IDS = ALL_NATURES.map((nature) => nature.id);
const SIMULATION_MET_LOCATION = "simulation";
const SIMULATION_ORIGINAL_TRAINER = "Simulation";

function cloneMutableStatBlock(block: StatBlock): MutableStatBlock {
  return {
    hp: block.hp,
    attack: block.attack,
    defense: block.defense,
    spAttack: block.spAttack,
    spDefense: block.spDefense,
    speed: block.speed,
  };
}

function createGenerationStatInputs(
  generation: number,
  rng: SeededRandom,
): Pick<PokemonInstance, "ivs" | "evs"> {
  if (generation <= 2) {
    const specialDv = rng.int(MIN_DV, MAX_DV);
    return {
      ivs: createDvs({
        attack: rng.int(MIN_DV, MAX_DV),
        defense: rng.int(MIN_DV, MAX_DV),
        speed: rng.int(MIN_DV, MAX_DV),
        spAttack: specialDv,
        spDefense: specialDv,
      }),
      evs: cloneMutableStatBlock(createStatExp()),
    };
  }

  return {
    ivs: createIvs({
      hp: rng.int(MIN_IV, MAX_IV),
      attack: rng.int(MIN_IV, MAX_IV),
      defense: rng.int(MIN_IV, MAX_IV),
      spAttack: rng.int(MIN_IV, MAX_IV),
      spDefense: rng.int(MIN_IV, MAX_IV),
      speed: rng.int(MIN_IV, MAX_IV),
    }),
    evs: cloneMutableStatBlock(createEvs()),
  };
}

function determineAbilitySlot(
  generation: number,
  species: PokemonSpeciesData,
  rng: SeededRandom,
): PokemonInstance["abilitySlot"] {
  if (generation < 3) {
    return CORE_ABILITY_SLOTS.normal1;
  }

  return species.abilities.normal.length > 1 && rng.chance(0.5)
    ? CORE_ABILITY_SLOTS.normal2
    : CORE_ABILITY_SLOTS.normal1;
}

function determineGender(
  species: PokemonSpeciesData,
  rng: SeededRandom,
): PokemonInstance["gender"] {
  if (species.genderRatio === -1) {
    return CORE_GENDERS.genderless;
  }
  if (species.genderRatio === 0) {
    return CORE_GENDERS.female;
  }
  if (species.genderRatio === 100) {
    return CORE_GENDERS.male;
  }
  return rng.int(1, 100) <= species.genderRatio ? CORE_GENDERS.male : CORE_GENDERS.female;
}

export function generateRandomTeam(
  generation: number,
  dataManager: DataManager,
  rng: SeededRandom,
  options?: Partial<TeamGeneratorOptions>,
): PokemonInstance[] {
  const opts = { ...DEFAULT_OPTIONS, ...options };
  const allSpecies = dataManager.getAllSpecies();
  const shuffled = rng.shuffle(allSpecies);

  const team: PokemonInstance[] = [];
  const usedSpecies = new Set<number>();
  let nextUidIndex = 0;

  for (const species of shuffled) {
    if (team.length >= opts.teamSize) break;
    if (!opts.allowDuplicateSpecies && usedSpecies.has(species.id)) continue;

    const level = rng.int(opts.levelRange[0], opts.levelRange[1]);

    // Collect all learnable moves from learnset
    const learnableByLevel = species.learnset.levelUp
      .filter((m) => m.level <= level)
      .map((m) => m.move);
    const tmMoves = [...species.learnset.tm];
    const allMoves = [...learnableByLevel, ...tmMoves];

    // Deduplicate
    const uniqueMoves = [...new Set(allMoves)];

    // Need at least 1 move
    if (uniqueMoves.length === 0) continue;

    // Pick random number of moves, capped by available moves
    const moveCount = Math.min(
      rng.int(opts.movesPerPokemon[0], opts.movesPerPokemon[1]),
      uniqueMoves.length,
    );
    const shuffledMoves = rng.shuffle(uniqueMoves);
    const selectedMoveIds = shuffledMoves.slice(0, moveCount);

    // Build move slots — skip any moves not found in the data manager
    const moves = selectedMoveIds.flatMap((id) => {
      try {
        const moveData = dataManager.getMove(id);
        return [{ moveId: id, currentPP: moveData.pp, maxPP: moveData.pp, ppUps: 0 }];
      } catch {
        return [];
      }
    });

    // After filtering, we need at least 1 valid move slot
    if (moves.length === 0) continue;

    const { ivs, evs } = createGenerationStatInputs(generation, rng);
    const abilitySlot = determineAbilitySlot(generation, species, rng);
    const ability =
      generation >= 3
        ? abilitySlot === CORE_ABILITY_SLOTS.normal2 && species.abilities.normal[1] != null
          ? species.abilities.normal[1]
          : (species.abilities.normal[0] ?? "")
        : "";
    const gender = determineGender(species, rng);
    const nature = generation <= 2 ? rng.pick(NEUTRAL_NATURES) : rng.pick(ALL_NATURE_IDS);

    const pokemon: PokemonInstance = {
      uid: `${opts.uidPrefix}-${++nextUidIndex}`,
      speciesId: species.id,
      nickname: null,
      level,
      experience: 0,
      nature,
      ivs,
      evs,
      currentHp: 1, // engine will recalculate on start()
      moves,
      ability,
      abilitySlot,
      heldItem: null, // no item assignment yet — safe default
      status: null,
      friendship: createFriendship(species.baseFriendship),
      gender,
      isShiny: false,
      metLocation: SIMULATION_MET_LOCATION,
      metLevel: level,
      originalTrainer: SIMULATION_ORIGINAL_TRAINER,
      originalTrainerId: 0,
      pokeball: CORE_ITEM_IDS.pokeBall,
    };

    team.push(pokemon);
    usedSpecies.add(species.id);
  }

  return team;
}
