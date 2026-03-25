import { CORE_ABILITY_SLOTS, CORE_GENDERS, CORE_ITEM_IDS } from "../constants";
import type { Gender } from "../entities/gender";
import type { MoveSlot } from "../entities/move";
import type { NatureId } from "../entities/nature";
import type { AbilitySlot, PokemonCreationOptions, PokemonInstance } from "../entities/pokemon";
import type { Learnset, PokemonSpeciesData } from "../entities/species";
import type { MutableStatBlock, StatBlock } from "../entities/stats";
import type { SeededRandom } from "../prng/seeded-random";
import { createFriendship } from "./friendship-inputs";

/** All 25 nature IDs */
const ALL_NATURES: readonly NatureId[] = [
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

/**
 * Generate a unique ID from the PRNG.
 */
function generateUid(rng: SeededRandom): string {
  const a = rng.int(0, 0xffffffff) >>> 0;
  const b = rng.int(0, 0xffffffff) >>> 0;
  return a.toString(16).padStart(8, "0") + b.toString(16).padStart(8, "0");
}

/**
 * Get the ability ID for a given ability slot.
 */
function getAbilityForSlot(
  species: PokemonSpeciesData,
  slot: AbilitySlot,
): string {
  if (slot === CORE_ABILITY_SLOTS.hidden && species.abilities.hidden) {
    return species.abilities.hidden;
  }
  if (slot === CORE_ABILITY_SLOTS.normal2 && species.abilities.normal.length > 1) {
    return species.abilities.normal[1] as string;
  }
  return species.abilities.normal[0] as string;
}

/**
 * Determine gender based on species gender ratio.
 * @param genderRatio - % male. -1 = genderless.
 */
export function determineGender(genderRatio: number, rng: SeededRandom): Gender {
  if (genderRatio === -1) return CORE_GENDERS.genderless;
  if (genderRatio === 0) return CORE_GENDERS.female;
  if (genderRatio === 100) return CORE_GENDERS.male;
  return rng.int(1, 100) <= genderRatio ? CORE_GENDERS.male : CORE_GENDERS.female;
}

/**
 * Get the default moveset for a Pokemon at a given level.
 * Takes the latest 4 level-up moves at or below the level.
 */
export function getDefaultMoves(learnset: Learnset, level: number): MoveSlot[] {
  const eligible = learnset.levelUp
    .filter((m) => m.level <= level)
    .reverse()
    .slice(0, 4);

  return eligible.map((m) => createMoveSlot(m.move));
}

/**
 * Create a MoveSlot with full PP.
 */
export function createMoveSlot(moveId: string, pp?: number, ppUps = 0): MoveSlot {
  const maxPP = pp ? Math.floor(pp * (1 + 0.2 * ppUps)) : 0;
  return {
    moveId,
    currentPP: maxPP,
    maxPP,
    ppUps,
  };
}

/**
 * Create a new PokemonInstance from a species and level.
 *
 * If options aren't provided, generates random values:
 * - IVs: Random 0-31 per stat
 * - Nature: Random
 * - Gender: Based on species gender ratio
 * - Ability: Random from normal abilities
 * - Shiny: 1/4096 chance (Gen 6+ rate)
 * - Moves: Latest 4 level-up moves at or below the level
 *
 * @param species - Species data
 * @param level - Level (1-100)
 * @param rng - Seeded random for deterministic generation
 * @param options - Override any default values
 */
export function createPokemonInstance(
  species: PokemonSpeciesData,
  level: number,
  rng: SeededRandom,
  options?: Partial<PokemonCreationOptions>,
): PokemonInstance {
  // Generate IVs
  const ivs: StatBlock = options?.ivs ?? {
    hp: rng.int(0, 31),
    attack: rng.int(0, 31),
    defense: rng.int(0, 31),
    spAttack: rng.int(0, 31),
    spDefense: rng.int(0, 31),
    speed: rng.int(0, 31),
  };

  // Pick nature
  const nature = options?.nature ?? rng.pick(ALL_NATURES);

  // Determine gender
  const gender = options?.gender ?? determineGender(species.genderRatio, rng);

  // Pick ability
  const abilitySlot =
    options?.abilitySlot ??
    (species.abilities.normal.length > 1
      ? (rng.chance(0.5) ? CORE_ABILITY_SLOTS.normal1 : CORE_ABILITY_SLOTS.normal2)
      : CORE_ABILITY_SLOTS.normal1);
  const ability = getAbilityForSlot(species, abilitySlot);

  // Determine shininess
  const isShiny = options?.isShiny ?? rng.chance(1 / 4096);

  // Select moves -- latest 4 level-up moves at or below this level
  const moves = options?.moves
    ? options.moves.map((moveId) => createMoveSlot(moveId))
    : getDefaultMoves(species.learnset, level);

  // EVs default to 0
  const evs: MutableStatBlock = options?.evs
    ? { ...options.evs }
    : { hp: 0, attack: 0, defense: 0, spAttack: 0, spDefense: 0, speed: 0 };

  const uid = generateUid(rng);

  const instance: PokemonInstance = {
    uid,
    speciesId: species.id,
    nickname: options?.nickname ?? null,
    level,
    experience: 0,
    nature,
    ivs,
    evs,
    currentHp: 0,
    moves,
    ability,
    abilitySlot,
    heldItem: options?.heldItem ?? null,
    status: null,
    friendship: createFriendship(options?.friendship ?? species.baseFriendship),
    gender,
    isShiny,
    metLocation: options?.metLocation ?? "unknown",
    metLevel: level,
    originalTrainer: options?.originalTrainer ?? "Player",
    originalTrainerId: options?.originalTrainerId ?? 0,
    pokeball: options?.pokeball ?? CORE_ITEM_IDS.pokeBall,
    teraType: options?.teraType ?? species.types[0],
    dynamaxLevel: options?.dynamaxLevel ?? 0,
  };

  return instance;
}
