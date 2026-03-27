import type {
  AbilityData,
  ItemData,
  MoveData,
  NatureData,
  PokemonSpeciesData,
  TypeChart,
} from "@pokemon-lib-ts/core";
import { ALL_NATURES, CORE_TYPE_IDS, DataManager } from "@pokemon-lib-ts/core";
import { createGen1DataManager, GEN1_MOVE_IDS, GEN1_SPECIES_IDS } from "@pokemon-lib-ts/gen1";
import { createGen2DataManager, GEN2_ITEM_IDS, GEN2_MOVE_IDS } from "@pokemon-lib-ts/gen2";
import { createGen4DataManager, GEN4_ABILITY_IDS, GEN4_MOVE_IDS } from "@pokemon-lib-ts/gen4";

const GEN1_DATA_MANAGER = createGen1DataManager();
const GEN2_DATA_MANAGER = createGen2DataManager();
const GEN4_DATA_MANAGER = createGen4DataManager();

const EXP_SHARE_ITEM: ItemData = {
  id: "exp-share",
  displayName: "Exp. Share",
  description: "A held item that shares EXP with an inactive party member.",
  category: "held-item",
  pocket: "items",
  price: 0,
  battleUsable: false,
  fieldUsable: false,
  generation: 2,
  spriteKey: "exp-share",
};

export const MOCK_SPECIES_IDS = {
  charizard: GEN1_SPECIES_IDS.charizard,
  blastoise: GEN1_SPECIES_IDS.blastoise,
  pikachu: GEN1_SPECIES_IDS.pikachu,
} as const;

export const MOCK_ITEM_IDS = {
  testHealItem: "test-heal-item",
} as const;

function createIdentityTypeChart(): TypeChart {
  const typeChart = {} as Record<string, Record<string, number>>;
  const allTypes = Object.values(CORE_TYPE_IDS);

  for (const attackType of allTypes) {
    const defendingTypes = {} as Record<string, number>;
    for (const defenseType of allTypes) {
      defendingTypes[defenseType] = 1;
    }
    typeChart[attackType] = defendingTypes;
  }

  return typeChart as TypeChart;
}

function getMockSpecies(): PokemonSpeciesData[] {
  return [
    {
      ...GEN1_DATA_MANAGER.getSpecies(MOCK_SPECIES_IDS.charizard),
      abilities: { ...GEN4_DATA_MANAGER.getSpecies(MOCK_SPECIES_IDS.charizard).abilities },
    },
    {
      ...GEN1_DATA_MANAGER.getSpecies(MOCK_SPECIES_IDS.blastoise),
      abilities: { ...GEN4_DATA_MANAGER.getSpecies(MOCK_SPECIES_IDS.blastoise).abilities },
    },
    {
      ...GEN1_DATA_MANAGER.getSpecies(MOCK_SPECIES_IDS.pikachu),
      abilities: { ...GEN4_DATA_MANAGER.getSpecies(MOCK_SPECIES_IDS.pikachu).abilities },
    },
  ];
}

function getMockMoves(): MoveData[] {
  return [
    GEN1_DATA_MANAGER.getMove(GEN1_MOVE_IDS.tackle),
    GEN1_DATA_MANAGER.getMove(GEN1_MOVE_IDS.growl),
    GEN1_DATA_MANAGER.getMove(GEN1_MOVE_IDS.thunderbolt),
    GEN1_DATA_MANAGER.getMove(GEN1_MOVE_IDS.scratch),
    GEN1_DATA_MANAGER.getMove(GEN1_MOVE_IDS.quickAttack),
    GEN1_DATA_MANAGER.getMove(GEN1_MOVE_IDS.fly),
    GEN1_DATA_MANAGER.getMove(GEN1_MOVE_IDS.swordsDance),
    GEN2_DATA_MANAGER.getMove(GEN2_MOVE_IDS.flameWheel),
    GEN2_DATA_MANAGER.getMove(GEN2_MOVE_IDS.futureSight),
    GEN4_DATA_MANAGER.getMove(GEN4_MOVE_IDS.stealthRock),
    GEN4_DATA_MANAGER.getMove(GEN4_MOVE_IDS.gravity),
  ];
}

function getMockItems(): ItemData[] {
  return [
    GEN2_DATA_MANAGER.getItem(GEN2_ITEM_IDS.pokeBall),
    GEN2_DATA_MANAGER.getItem(GEN2_ITEM_IDS.ultraBall),
    EXP_SHARE_ITEM,
  ];
}

function getMockAbilities(): AbilityData[] {
  return [GEN4_DATA_MANAGER.getAbility(GEN4_ABILITY_IDS.blaze)];
}

function getMockNatures(): NatureData[] {
  return [...ALL_NATURES];
}

/**
 * Creates a DataManager pre-loaded with a minimal canonical record set for battle tests.
 *
 * Species, moves, and items are sourced from the owning generation data managers so tests
 * do not duplicate canonical payloads. The only intentionally synthetic surface here is the
 * identity type chart used by generic engine tests that are not exercising generation type
 * effectiveness.
 */
export function createMockDataManager(): DataManager {
  const dataManager = new DataManager();

  dataManager.loadFromObjects({
    pokemon: getMockSpecies(),
    moves: getMockMoves(),
    abilities: getMockAbilities(),
    items: getMockItems(),
    natures: getMockNatures(),
    typeChart: createIdentityTypeChart(),
  });

  return dataManager;
}
