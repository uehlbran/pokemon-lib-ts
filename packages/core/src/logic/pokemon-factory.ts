import { ALL_NATURES, CORE_ABILITY_SLOTS, CORE_GENDERS, CORE_POKEMON_DEFAULTS } from "../constants";
import { CORE_ABILITY_IDS } from "../constants/reference-ids";
import type { Gender } from "../entities/gender";
import type { MoveSlot } from "../entities/move";
import type { NatureId } from "../entities/nature";
import type { AbilitySlot, PokemonCreationOptions, PokemonInstance } from "../entities/pokemon";
import type { Learnset, PokemonSpeciesData } from "../entities/species";
import type { MutableStatBlock, StatBlock } from "../entities/stats";
import type { SeededRandom } from "../prng/seeded-random";
import { createFriendship } from "./friendship-inputs";
import { createEvs, createIvs, MAX_IV, MIN_IV } from "./stat-inputs";

const NATURE_IDS: readonly NatureId[] = ALL_NATURES.map((nature) => nature.id);
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

function createRandomIvs(rng: SeededRandom): StatBlock {
  return createIvs({
    hp: rng.int(MIN_IV, MAX_IV),
    attack: rng.int(MIN_IV, MAX_IV),
    defense: rng.int(MIN_IV, MAX_IV),
    spAttack: rng.int(MIN_IV, MAX_IV),
    spDefense: rng.int(MIN_IV, MAX_IV),
    speed: rng.int(MIN_IV, MAX_IV),
  });
}

function normalizeIvs(rng: SeededRandom, ivs?: PokemonCreationOptions["ivs"]): StatBlock {
  return ivs ? createIvs(ivs) : createRandomIvs(rng);
}

function normalizeEvs(evs?: PokemonCreationOptions["evs"]): MutableStatBlock {
  return cloneMutableStatBlock(evs ? createEvs(evs) : createEvs());
}

/**
 * Generate a unique ID from the PRNG.
 */
function generateUid(rng: SeededRandom): string {
  const a = rng.int(0, 0xffffffff) >>> 0;
  const b = rng.int(0, 0xffffffff) >>> 0;
  return a.toString(16).padStart(8, "0") + b.toString(16).padStart(8, "0");
}

/**
 * Resolve the actual ability and slot for a given requested ability slot.
 */
function resolveAbilityForSlot(
  species: PokemonSpeciesData,
  slot: AbilitySlot,
): { ability: string; abilitySlot: AbilitySlot } {
  if (slot === CORE_ABILITY_SLOTS.hidden && species.abilities.hidden) {
    return { ability: species.abilities.hidden, abilitySlot: CORE_ABILITY_SLOTS.hidden };
  }
  if (slot === CORE_ABILITY_SLOTS.normal2 && species.abilities.normal.length > 1) {
    return {
      ability: species.abilities.normal[1] as string,
      abilitySlot: CORE_ABILITY_SLOTS.normal2,
    };
  }
  const primaryAbility = species.abilities.normal[0];
  if (primaryAbility) {
    return { ability: primaryAbility, abilitySlot: CORE_ABILITY_SLOTS.normal1 };
  }
  if (species.abilities.hidden) {
    return { ability: species.abilities.hidden, abilitySlot: CORE_ABILITY_SLOTS.hidden };
  }
  return { ability: CORE_ABILITY_IDS.none, abilitySlot: CORE_ABILITY_SLOTS.normal1 };
}

/**
 * Determine gender based on species gender ratio.
 * @param genderRatio - % male. -1 = genderless.
 */
export function determineGender(genderRatio: number, rng: SeededRandom): Gender {
  if (genderRatio === -1) return CORE_GENDERS.genderless;
  if (genderRatio === 0) return CORE_GENDERS.female;
  if (genderRatio === 100) return CORE_GENDERS.male;

  // Source: species gender ratios are encoded in 12.5% steps on cartridge-facing data surfaces.
  // Bulbapedia documents the discrete ratio buckets as 100% / 87.5% / 75% / 50% / 25% / 12.5% / 0%.
  // The species schema in this repo stores those as percent-male values, so we project back onto 8
  // cartridge buckets to preserve exact 12.5% and 87.5% behavior instead of rounding to whole percents.
  const maleThreshold = Math.round((genderRatio / 100) * 8);
  return rng.int(1, 8) <= maleThreshold ? CORE_GENDERS.male : CORE_GENDERS.female;
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
  const ivs = normalizeIvs(rng, options?.ivs);
  const nature = options?.nature ?? rng.pick(NATURE_IDS);

  // Determine gender
  const gender = options?.gender ?? determineGender(species.genderRatio, rng);

  // Pick ability
  const abilitySlot =
    options?.abilitySlot ??
    (species.abilities.normal.length > 1
      ? rng.chance(0.5)
        ? CORE_POKEMON_DEFAULTS.abilitySlot
        : CORE_ABILITY_SLOTS.normal2
      : CORE_POKEMON_DEFAULTS.abilitySlot);
  const resolvedAbility = resolveAbilityForSlot(species, abilitySlot);

  // Determine shininess
  const isShiny = options?.isShiny ?? rng.chance(CORE_POKEMON_DEFAULTS.shinyChance);

  // Select moves -- latest 4 level-up moves at or below this level
  const moves =
    options?.moves && options.moves.length > 0
      ? options.moves.map((moveId) => createMoveSlot(moveId))
      : getDefaultMoves(species.learnset, level);
  const evs = normalizeEvs(options?.evs);

  const uid = generateUid(rng);

  const instance: PokemonInstance = {
    uid,
    speciesId: species.id,
    nickname: options?.nickname ?? null,
    level,
    experience: CORE_POKEMON_DEFAULTS.experience,
    nature,
    ivs,
    evs,
    currentHp: CORE_POKEMON_DEFAULTS.currentHp,
    moves,
    ability: resolvedAbility.ability,
    abilitySlot: resolvedAbility.abilitySlot,
    heldItem: options?.heldItem ?? null,
    status: null,
    friendship: createFriendship(options?.friendship ?? species.baseFriendship),
    gender,
    isShiny,
    metLocation: options?.metLocation ?? CORE_POKEMON_DEFAULTS.metLocation,
    metLevel: level,
    originalTrainer: options?.originalTrainer ?? CORE_POKEMON_DEFAULTS.originalTrainer,
    originalTrainerId: options?.originalTrainerId ?? CORE_POKEMON_DEFAULTS.originalTrainerId,
    pokeball: options?.pokeball ?? CORE_POKEMON_DEFAULTS.pokeball,
    teraType: options?.teraType ?? species.types[0],
    dynamaxLevel: options?.dynamaxLevel ?? CORE_POKEMON_DEFAULTS.dynamaxLevel,
  };

  return instance;
}
