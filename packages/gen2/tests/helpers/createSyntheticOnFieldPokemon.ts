import type { ActivePokemon } from "@pokemon-lib-ts/battle";
import { createDefaultStatStages } from "@pokemon-lib-ts/battle/utils";
import type { MoveSlot, PokemonType, PrimaryStatus, StatBlock } from "@pokemon-lib-ts/core";
import {
  CORE_ABILITY_IDS,
  CORE_ABILITY_SLOTS,
  CORE_GENDERS,
  CORE_ITEM_IDS,
  createDvs,
  createFriendship,
  createMoveSlot,
  createPokemonInstance,
  createStatExp,
  SeededRandom,
} from "@pokemon-lib-ts/core";
import { createGen2DataManager, GEN2_MOVE_IDS, GEN2_NATURE_IDS, GEN2_SPECIES_IDS } from "../../src";

const dataManager = createGen2DataManager();
const defaultSpecies = dataManager.getSpecies(GEN2_SPECIES_IDS.bulbasaur);
const defaultMove = dataManager.getMove(GEN2_MOVE_IDS.tackle);
const DEFAULT_LEVEL = 50;
const DEFAULT_CURRENT_HP = 200;
const DEFAULT_STATS: StatBlock = {
  hp: DEFAULT_CURRENT_HP,
  attack: 100,
  defense: 100,
  spAttack: 100,
  spDefense: 100,
  speed: 100,
};

export interface CreateSyntheticOnFieldPokemonOptions {
  readonly speciesId?: number;
  readonly level?: number;
  readonly currentHp?: number;
  readonly calculatedStats?: Partial<StatBlock>;
  readonly types?: readonly PokemonType[];
  readonly heldItem?: string | null;
  readonly status?: PrimaryStatus | null;
  readonly friendship?: number;
  readonly moveSlots?: MoveSlot[];
  readonly nickname?: string | null;
  readonly lastMoveUsed?: string | null;
  readonly turnsOnField?: number;
  readonly teamSlot?: number;
  readonly volatileStatuses?: Map<string, unknown>;
  readonly statStages?: Partial<ActivePokemon["statStages"]>;
  readonly randomSeed?: number;
}

export function createSyntheticOnFieldPokemon(
  options: CreateSyntheticOnFieldPokemonOptions = {},
): ActivePokemon {
  const species = dataManager.getSpecies(options.speciesId ?? defaultSpecies.id);
  const level = options.level ?? DEFAULT_LEVEL;
  const currentHp = options.currentHp ?? options.calculatedStats?.hp ?? DEFAULT_CURRENT_HP;
  const calculatedStats: StatBlock = {
    hp: options.calculatedStats?.hp ?? currentHp,
    attack: options.calculatedStats?.attack ?? DEFAULT_STATS.attack,
    defense: options.calculatedStats?.defense ?? DEFAULT_STATS.defense,
    spAttack: options.calculatedStats?.spAttack ?? DEFAULT_STATS.spAttack,
    spDefense: options.calculatedStats?.spDefense ?? DEFAULT_STATS.spDefense,
    speed: options.calculatedStats?.speed ?? DEFAULT_STATS.speed,
  };

  const pokemon = createPokemonInstance(species, level, new SeededRandom(options.randomSeed ?? 7), {
    nature: GEN2_NATURE_IDS.hardy,
    ivs: createDvs(),
    evs: createStatExp(),
    moves: [],
    heldItem: options.heldItem ?? null,
    friendship: createFriendship(options.friendship ?? species.baseFriendship),
    abilitySlot: CORE_ABILITY_SLOTS.normal1,
    gender: CORE_GENDERS.male,
    isShiny: false,
    metLocation: "test",
    originalTrainer: "Test",
    originalTrainerId: 12345,
    pokeball: CORE_ITEM_IDS.pokeBall,
  });

  pokemon.nickname = options.nickname ?? null;
  pokemon.moves = options.moveSlots ?? [createMoveSlot(defaultMove.id, defaultMove.pp)];
  pokemon.currentHp = currentHp;
  pokemon.calculatedStats = calculatedStats;
  pokemon.ability = CORE_ABILITY_IDS.none;
  pokemon.status = options.status ?? null;

  return {
    pokemon,
    teamSlot: options.teamSlot ?? 0,
    statStages: {
      ...createDefaultStatStages(),
      ...options.statStages,
    },
    volatileStatuses: (options.volatileStatuses ?? new Map()) as Map<never, never>,
    types: [...(options.types ?? species.types)] as PokemonType[],
    ability: CORE_ABILITY_IDS.none,
    lastMoveUsed: options.lastMoveUsed ?? null,
    lastDamageTaken: 0,
    lastDamageType: null,
    lastDamageCategory: null,
    turnsOnField: options.turnsOnField ?? 0,
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
