import type { DataManager, PokemonInstance, SeededRandom } from "@pokemon-lib-ts/core";
import type { TeamGeneratorOptions } from "./types.js";

const DEFAULT_OPTIONS: TeamGeneratorOptions = {
  teamSize: 3,
  levelRange: [50, 100],
  movesPerPokemon: [1, 4],
  allowDuplicateSpecies: false,
};

const ALL_NATURES = [
  "hardy",
  "lonely",
  "brave",
  "adamant",
  "naughty",
  "bold",
  "docile",
  "relaxed",
  "impish",
  "lax",
  "timid",
  "hasty",
  "serious",
  "jolly",
  "naive",
  "modest",
  "mild",
  "quiet",
  "bashful",
  "rash",
  "calm",
  "gentle",
  "sassy",
  "careful",
  "quirky",
] as const;

let _uidCounter = 0;
function nextUid(): string {
  return `sim-${++_uidCounter}`;
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

    // Gen-aware IVs: Gen 1-2 use DVs (0-15), Gen 3+ use IVs (0-31)
    const ivMax = generation <= 2 ? 15 : 31;
    const ivs = {
      hp: rng.int(0, ivMax),
      attack: rng.int(0, ivMax),
      defense: rng.int(0, ivMax),
      spAttack: rng.int(0, ivMax),
      spDefense: rng.int(0, ivMax),
      speed: rng.int(0, ivMax),
    };

    const evs = { hp: 0, attack: 0, defense: 0, spAttack: 0, spDefense: 0, speed: 0 };

    // Gen 1 has no abilities, Gen 3+ has abilities
    const hasAbilities = generation >= 3;

    const abilitySlot =
      hasAbilities && species.abilities.normal.length > 1 && rng.chance(0.5)
        ? ("normal2" as const)
        : ("normal1" as const);

    const ability = hasAbilities
      ? abilitySlot === "normal2" && species.abilities.normal[1] != null
        ? species.abilities.normal[1]
        : (species.abilities.normal[0] ?? "")
      : "";

    // Determine gender
    let gender: "male" | "female" | "genderless";
    if (species.genderRatio === -1) {
      gender = "genderless";
    } else if (species.genderRatio === 0) {
      gender = "female";
    } else if (species.genderRatio === 100) {
      gender = "male";
    } else {
      gender = rng.int(1, 100) <= species.genderRatio ? "male" : "female";
    }

    const nature = rng.pick(ALL_NATURES);

    const pokemon: PokemonInstance = {
      uid: nextUid(),
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
      friendship: species.baseFriendship,
      gender,
      isShiny: false,
      metLocation: "simulation",
      metLevel: level,
      originalTrainer: "Simulation",
      originalTrainerId: 0,
      pokeball: "poke-ball",
    };

    team.push(pokemon);
    usedSpecies.add(species.id);
  }

  return team;
}
