import type { ActivePokemon } from "@pokemon-lib-ts/battle";
import { createDefaultStatStages } from "@pokemon-lib-ts/battle/utils";
import type { PokemonType, StatBlock } from "@pokemon-lib-ts/core";
import { CORE_ABILITY_IDS } from "@pokemon-lib-ts/core";
import { createGen4DataManager, GEN4_SPECIES_IDS } from "../../src";
import { type CreateGen4TestPokemonOptions, createGen4TestPokemon } from "./createGen4TestPokemon";

const dataManager = createGen4DataManager();
const defaultSpecies = dataManager.getSpecies(GEN4_SPECIES_IDS.bulbasaur);

export interface CreateSyntheticOnFieldPokemonOptions extends CreateGen4TestPokemonOptions {
  readonly types?: readonly PokemonType[];
  readonly teamSlot?: number;
  readonly turnsOnField?: number;
  readonly movedThisTurn?: boolean;
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
  const pokemon = createGen4TestPokemon(options);

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
    turnsOnField: options.turnsOnField ?? 0,
    movedThisTurn: options.movedThisTurn ?? false,
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
