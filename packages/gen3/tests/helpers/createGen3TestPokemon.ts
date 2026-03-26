import type { MoveSlot, NatureId, PokemonInstance, StatBlock } from "@pokemon-lib-ts/core";
import {
  CORE_ABILITY_IDS,
  CORE_ABILITY_SLOTS,
  CORE_GENDERS,
  CORE_ITEM_IDS,
  createEvs,
  createIvs,
  createMoveSlot,
  createPokemonInstance,
  SeededRandom,
} from "@pokemon-lib-ts/core";
import { createGen3DataManager, GEN3_MOVE_IDS, GEN3_NATURE_IDS, GEN3_SPECIES_IDS } from "../../src";

const dataManager = createGen3DataManager();
const defaultSpecies = dataManager.getSpecies(GEN3_SPECIES_IDS.bulbasaur);
const defaultMove = dataManager.getMove(GEN3_MOVE_IDS.tackle);

export interface CreateGen3TestPokemonOptions {
  readonly speciesId?: number;
  readonly level?: number;
  readonly nature?: NatureId;
  readonly ivs?: StatBlock;
  readonly evs?: StatBlock;
  readonly moveIds?: string[];
  readonly moveSlots?: MoveSlot[];
  readonly nickname?: string | null;
  readonly heldItem?: string | null;
  readonly ability?: string;
  readonly currentHp?: number;
  readonly friendship?: number;
  readonly status?: PokemonInstance["status"];
  readonly gender?: PokemonInstance["gender"];
  readonly abilitySlot?: PokemonInstance["abilitySlot"];
  readonly isShiny?: boolean;
  readonly metLocation?: string;
  readonly originalTrainer?: string;
  readonly originalTrainerId?: number;
  readonly pokeball?: string;
  readonly calculatedStats?: StatBlock;
  readonly randomSeed?: number;
}

export function createGen3TestPokemon(options: CreateGen3TestPokemonOptions = {}): PokemonInstance {
  const species = dataManager.getSpecies(options.speciesId ?? defaultSpecies.id);
  const level = options.level ?? 50;
  const pokemon = createPokemonInstance(
    species,
    level,
    new SeededRandom(options.randomSeed ?? species.id + level),
    {
      nature: options.nature ?? GEN3_NATURE_IDS.hardy,
      ivs: options.ivs ?? createIvs(),
      evs: options.evs ?? createEvs(),
      moves: [],
      heldItem: options.heldItem ?? null,
      friendship: options.friendship ?? species.baseFriendship,
      abilitySlot: options.abilitySlot ?? CORE_ABILITY_SLOTS.normal1,
      gender: options.gender ?? CORE_GENDERS.male,
      isShiny: options.isShiny ?? false,
      metLocation: options.metLocation ?? "test",
      originalTrainer: options.originalTrainer ?? "Test",
      originalTrainerId: options.originalTrainerId ?? 0,
      pokeball: options.pokeball ?? CORE_ITEM_IDS.pokeBall,
    },
  );

  pokemon.nickname = options.nickname ?? null;
  pokemon.moves =
    options.moveSlots ??
    (options.moveIds ?? [defaultMove.id]).map((moveId) => {
      const moveData = dataManager.getMove(moveId);
      return createMoveSlot(moveId, moveData.pp);
    });
  pokemon.ability = options.ability ?? species.abilities.normal[0] ?? CORE_ABILITY_IDS.none;
  pokemon.currentHp = options.currentHp ?? options.calculatedStats?.hp ?? 200;
  pokemon.status = options.status ?? null;
  if (options.calculatedStats) {
    pokemon.calculatedStats = options.calculatedStats;
  }

  return pokemon;
}
