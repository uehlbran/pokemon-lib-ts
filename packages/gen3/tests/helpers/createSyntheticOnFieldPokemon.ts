import type { ActivePokemon } from "@pokemon-lib-ts/battle";
import { createDefaultStatStages } from "@pokemon-lib-ts/battle/utils";
import type { PokemonType, StatBlock } from "@pokemon-lib-ts/core";
import { CORE_ABILITY_IDS } from "@pokemon-lib-ts/core";
import { createGen3DataManager, GEN3_SPECIES_IDS } from "../../src";
import { type CreateGen3TestPokemonOptions, createGen3TestPokemon } from "./createGen3TestPokemon";

const dataManager = createGen3DataManager();
const defaultSpecies = dataManager.getSpecies(GEN3_SPECIES_IDS.bulbasaur);

export interface CreateSyntheticOnFieldPokemonOptions extends CreateGen3TestPokemonOptions {
  readonly types?: readonly PokemonType[];
  readonly teamSlot?: number;
  readonly turnsOnField?: number;
  readonly lastMoveUsed?: string | null;
  readonly lastDamageTaken?: number;
  readonly lastDamageType?: PokemonType | null;
  readonly lastDamageCategory?: ActivePokemon["lastDamageCategory"];
  readonly volatileStatuses?: Map<string, unknown>;
  readonly statStages?: Partial<ActivePokemon["statStages"]>;
}

export function createSyntheticOnFieldPokemon(
  options: CreateSyntheticOnFieldPokemonOptions = {},
): ActivePokemon {
  const species = dataManager.getSpecies(options.speciesId ?? defaultSpecies.id);
  const pokemon = createGen3TestPokemon(options);

  if (options.calculatedStats && !pokemon.calculatedStats) {
    pokemon.calculatedStats = options.calculatedStats as StatBlock;
  }

  return {
    pokemon,
    teamSlot: options.teamSlot ?? 0,
    statStages: {
      ...createDefaultStatStages(),
      ...options.statStages,
    },
    volatileStatuses: (options.volatileStatuses ?? new Map()) as Map<never, never>,
    types: [...(options.types ?? species.types)] as PokemonType[],
    ability: options.ability ?? pokemon.ability ?? CORE_ABILITY_IDS.none,
    lastMoveUsed: options.lastMoveUsed ?? null,
    lastDamageTaken: options.lastDamageTaken ?? 0,
    lastDamageType: options.lastDamageType ?? null,
    lastDamageCategory: options.lastDamageCategory ?? null,
    turnsOnField: options.turnsOnField ?? 1,
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
    stellarBoostedTypes: [],
  } as ActivePokemon;
}
