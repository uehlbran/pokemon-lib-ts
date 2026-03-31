import {
  CORE_ABILITY_IDS,
  CORE_ABILITY_SLOTS,
  CORE_FIXED_POINT,
  CORE_GENDERS,
  CORE_ITEM_IDS,
  CORE_MOVE_CATEGORIES,
  CORE_NATURE_IDS,
  CORE_TYPE_IDS,
  CORE_VOLATILE_IDS,
} from "@pokemon-lib-ts/core";
import { createGen8DataManager } from "../../src/data";

const dataManager = createGen8DataManager();

function requireItemId(displayName: string): string {
  const item = dataManager.getAllItems().find((entry) => entry.displayName === displayName);
  if (!item) throw new Error(`Gen 8 item "${displayName}" not found in data bundle`);
  return item.id;
}

function requireMoveId(displayName: string): string {
  const move = dataManager.getAllMoves().find((entry) => entry.displayName === displayName);
  if (!move) throw new Error(`Gen 8 move "${displayName}" not found in data bundle`);
  return move.id;
}

function requireAbilityId(displayName: string): string {
  const ability = dataManager.getAllAbilities().find((entry) => entry.displayName === displayName);
  if (!ability) throw new Error(`Gen 8 ability "${displayName}" not found in data bundle`);
  return ability.id;
}

export const GEN8_TEST_VALUES = {
  battle: {
    singles: "singles",
  },
  pokemon: {
    uid: "test",
    nature: CORE_NATURE_IDS.hardy,
    ability: CORE_ABILITY_IDS.none,
    abilitySlot: CORE_ABILITY_SLOTS.normal1,
    gender: CORE_GENDERS.male,
    pokeball: CORE_ITEM_IDS.pokeBall,
    defaultType: CORE_TYPE_IDS.normal,
  },
  abilityIds: {
    klutz: requireAbilityId("Klutz"),
  },
  volatiles: {
    embargo: CORE_VOLATILE_IDS.embargo,
  },
  fixedPoint: {
    neutral: CORE_FIXED_POINT.identity,
    boost12: CORE_FIXED_POINT.boost12,
    boost13: CORE_FIXED_POINT.boost13,
    boost15: CORE_FIXED_POINT.boost15,
    resistHalf: CORE_FIXED_POINT.resistHalf,
  },
  expectedAmounts: {
    minimum: 1,
    lifeOrbRecoil200: 20,
    lifeOrbRecoil160: 16,
    lifeOrbRecoil300: 30,
    leftoversHeal320: 20,
    leftoversHeal160: 10,
    leftoversHeal200: 12,
    blackSludgeHeal320: 20,
    blackSludgeHeal200: 12,
    blackSludgeDamage320: 40,
    blackSludgeDamage200: 25,
    rockyHelmetDamage300: 50,
    rockyHelmetDamage200: 33,
    evioliteBoost: 6144,
  },
  hp: {
    min: 1,
    leftOversRecoil: 160,
    lifeOrbRecoil: 200,
    rockyHelmetDamage: 300,
    blackSludgeHeal: 320,
    airBalloonPop: 400,
  },
  types: {
    normal: CORE_TYPE_IDS.normal,
    fire: CORE_TYPE_IDS.fire,
    water: CORE_TYPE_IDS.water,
    ice: CORE_TYPE_IDS.ice,
    poison: CORE_TYPE_IDS.poison,
    dark: CORE_TYPE_IDS.dark,
  },
  categories: {
    physical: CORE_MOVE_CATEGORIES.physical,
    special: CORE_MOVE_CATEGORIES.special,
    status: CORE_MOVE_CATEGORIES.status,
  },
  items: {
    adrenalineOrb: requireItemId("Adrenaline Orb"),
    assaultVest: requireItemId("Assault Vest"),
    airBalloon: requireItemId("Air Balloon"),
    blackSludge: requireItemId("Black Sludge"),
    blunderPolicy: requireItemId("Blunder Policy"),
    charcoal: requireItemId("Charcoal"),
    chilanBerry: requireItemId("Chilan Berry"),
    choiceBand: requireItemId("Choice Band"),
    choiceScarf: requireItemId("Choice Scarf"),
    choiceSpecs: requireItemId("Choice Specs"),
    ejectPack: requireItemId("Eject Pack"),
    eviolite: requireItemId("Eviolite"),
    focusSash: requireItemId("Focus Sash"),
    heavyDutyBoots: requireItemId("Heavy-Duty Boots"),
    ironBall: requireItemId("Iron Ball"),
    leftovers: requireItemId("Leftovers"),
    lifeOrb: requireItemId("Life Orb"),
    mysticWater: requireItemId("Mystic Water"),
    occaBerry: requireItemId("Occa Berry"),
    rockyHelmet: requireItemId("Rocky Helmet"),
    roomService: requireItemId("Room Service"),
    silkScarf: requireItemId("Silk Scarf"),
    throatSpray: requireItemId("Throat Spray"),
    utilityUmbrella: requireItemId("Utility Umbrella"),
    yacheBerry: requireItemId("Yache Berry"),
  },
  moves: {
    tackle: requireMoveId("Tackle"),
    surf: requireMoveId("Surf"),
    flamethrower: requireMoveId("Flamethrower"),
    hyperVoice: requireMoveId("Hyper Voice"),
  },
} as const;
