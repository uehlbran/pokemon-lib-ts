import type {
  BattleStat,
  PokemonInstance,
  PokemonSpeciesData,
  PokemonType,
} from "@pokemon-lib/core";
import type { PokemonSnapshot } from "../events";
import type { ActivePokemon } from "../state";

/** Create a PokemonSnapshot from an ActivePokemon (public-facing info only) */
export function createPokemonSnapshot(active: ActivePokemon): PokemonSnapshot {
  return {
    speciesId: active.pokemon.speciesId,
    nickname: active.pokemon.nickname,
    level: active.pokemon.level,
    currentHp: active.pokemon.currentHp,
    maxHp: active.pokemon.calculatedStats?.hp ?? active.pokemon.currentHp,
    status: active.pokemon.status,
    gender: active.pokemon.gender,
    isShiny: active.pokemon.isShiny,
  };
}

/** Create default stat stages (all 0) */
export function createDefaultStatStages(): Record<BattleStat, number> {
  return {
    hp: 0,
    attack: 0,
    defense: 0,
    spAttack: 0,
    spDefense: 0,
    speed: 0,
    accuracy: 0,
    evasion: 0,
  };
}

/** Create an ActivePokemon wrapper from a PokemonInstance */
export function createActivePokemon(
  pokemon: PokemonInstance,
  teamSlot: number,
  types: PokemonType[],
): ActivePokemon {
  return {
    pokemon,
    teamSlot,
    statStages: createDefaultStatStages(),
    volatileStatuses: new Map(),
    types,
    ability: pokemon.ability,
    lastMoveUsed: null,
    turnsOnField: 0,
    movedThisTurn: false,
    consecutiveProtects: 0,
    substituteHp: 0,
    transformed: false,
    transformedSpecies: null,
    isMega: false,
    isDynamaxed: false,
    dynamaxTurnsLeft: 0,
    isTerastallized: false,
    teraType: null,
  };
}

/** Get the display name for a pokemon */
export function getPokemonName(active: ActivePokemon): string {
  return active.pokemon.nickname ?? `Pokemon #${active.pokemon.speciesId}`;
}

/**
 * Create a minimal test Pokemon with sane defaults.
 * Useful for tests — avoids needing a full DataManager.
 */
export function createTestPokemon(
  speciesId: number,
  level: number,
  overrides?: Partial<PokemonInstance>,
): PokemonInstance {
  return {
    uid: `test-${speciesId}-${level}`,
    speciesId,
    nickname: null,
    level,
    experience: 0,
    nature: "adamant",
    ivs: {
      hp: 31,
      attack: 31,
      defense: 31,
      spAttack: 31,
      spDefense: 31,
      speed: 31,
    },
    evs: {
      hp: 0,
      attack: 0,
      defense: 0,
      spAttack: 0,
      spDefense: 0,
      speed: 0,
    },
    currentHp: 200,
    moves: [{ moveId: "tackle", currentPP: 35, maxPP: 35, ppUps: 0 }],
    ability: "blaze",
    abilitySlot: "normal1",
    heldItem: null,
    status: null,
    friendship: 70,
    gender: "male",
    isShiny: false,
    metLocation: "test",
    metLevel: level,
    originalTrainer: "Test",
    originalTrainerId: 0,
    pokeball: "poke-ball",
    calculatedStats: {
      hp: 200,
      attack: 100,
      defense: 100,
      spAttack: 100,
      spDefense: 100,
      speed: 100,
    },
    ...overrides,
  };
}
