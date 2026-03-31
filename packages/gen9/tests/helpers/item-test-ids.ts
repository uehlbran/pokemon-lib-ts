import {
  CORE_ABILITY_IDS,
  CORE_ABILITY_SLOTS,
  CORE_FIXED_POINT,
  CORE_GENDERS,
  CORE_ITEM_IDS,
  CORE_STATUS_IDS,
  CORE_TYPE_IDS,
  CORE_VOLATILE_IDS,
  CORE_WEATHER_IDS,
} from "@pokemon-lib-ts/core";
import { createGen9DataManager } from "../../src/data";

const dataManager = createGen9DataManager();
// Source: Showdown data/items.ts clearamulet.onTryBoost special-cases effect.id === "octolock".
// Octolock is not present in the shipped Gen 9 move bundle, so tests use the canonical move id directly.
const OCTOLOCK_MOVE_ID = "octolock";

function requireItemId(displayName: string): string {
  const item = dataManager.getAllItems().find((entry) => entry.displayName === displayName);
  if (!item) throw new Error(`Gen 9 item "${displayName}" not found in data bundle`);
  return item.id;
}

function requireMoveId(displayName: string): string {
  const move = dataManager.getAllMoves().find((entry) => entry.displayName === displayName);
  if (!move) throw new Error(`Gen 9 move "${displayName}" not found in data bundle`);
  return move.id;
}

function requireAbilityId(displayName: string): string {
  const ability = dataManager.getAllAbilities().find((entry) => entry.displayName === displayName);
  if (!ability) throw new Error(`Gen 9 ability "${displayName}" not found in data bundle`);
  return ability.id;
}

export const TEST_DEFAULTS = {
  ability: CORE_ABILITY_IDS.none,
  abilitySlot: CORE_ABILITY_SLOTS.normal1,
  battleType: "singles",
  defaultType: CORE_TYPE_IDS.normal,
  gender: CORE_GENDERS.male,
  nature: "hardy",
  pokeball: CORE_ITEM_IDS.pokeBall,
  uid: "test",
} as const;

export const TEST_FIXED_POINT = {
  neutral: CORE_FIXED_POINT.identity,
  typeBoost: CORE_FIXED_POINT.typeBoost,
  lifeOrb: CORE_FIXED_POINT.boost13,
  choice: CORE_FIXED_POINT.boost15,
  resistBerry: CORE_FIXED_POINT.resistHalf,
} as const;

export const TEST_ITEM_IDS = {
  absorbBulb: requireItemId("Absorb Bulb"),
  adrenalineOrb: requireItemId("Adrenaline Orb"),
  airBalloon: requireItemId("Air Balloon"),
  aspearBerry: requireItemId("Aspear Berry"),
  assaultVest: requireItemId("Assault Vest"),
  blackSludge: requireItemId("Black Sludge"),
  blunderPolicy: requireItemId("Blunder Policy"),
  boosterEnergy: requireItemId("Booster Energy"),
  cellBattery: requireItemId("Cell Battery"),
  charcoal: requireItemId("Charcoal"),
  cheriBerry: requireItemId("Cheri Berry"),
  chestoBerry: requireItemId("Chesto Berry"),
  chilanBerry: requireItemId("Chilan Berry"),
  choiceBand: requireItemId("Choice Band"),
  choiceScarf: requireItemId("Choice Scarf"),
  choiceSpecs: requireItemId("Choice Specs"),
  covertCloak: requireItemId("Covert Cloak"),
  clearAmulet: requireItemId("Clear Amulet"),
  custapBerry: requireItemId("Custap Berry"),
  dampRock: requireItemId("Damp Rock"),
  ejectButton: requireItemId("Eject Button"),
  ejectPack: requireItemId("Eject Pack"),
  fairyFeather: requireItemId("Fairy Feather"),
  flameOrb: requireItemId("Flame Orb"),
  focusBand: requireItemId("Focus Band"),
  focusSash: requireItemId("Focus Sash"),
  heatRock: requireItemId("Heat Rock"),
  icyRock: requireItemId("Icy Rock"),
  ironBall: requireItemId("Iron Ball"),
  keeBerry: requireItemId("Kee Berry"),
  kingsRock: requireItemId("King's Rock"),
  leftovers: requireItemId("Leftovers"),
  liechiBerry: requireItemId("Liechi Berry"),
  lifeOrb: requireItemId("Life Orb"),
  lumBerry: requireItemId("Lum Berry"),
  marangaBerry: requireItemId("Maranga Berry"),
  mentalHerb: requireItemId("Mental Herb"),
  mirrorHerb: requireItemId("Mirror Herb"),
  mysticWater: requireItemId("Mystic Water"),
  occaBerry: requireItemId("Occa Berry"),
  oranBerry: requireItemId("Oran Berry"),
  pechaBerry: requireItemId("Pecha Berry"),
  petayaBerry: requireItemId("Petaya Berry"),
  quickClaw: requireItemId("Quick Claw"),
  rawstBerry: requireItemId("Rawst Berry"),
  redCard: requireItemId("Red Card"),
  rockHelmet: requireItemId("Rocky Helmet"),
  roomService: requireItemId("Room Service"),
  roseliBerry: requireItemId("Roseli Berry"),
  safetyGoggles: requireItemId("Safety Goggles"),
  salacBerry: requireItemId("Salac Berry"),
  shellBell: requireItemId("Shell Bell"),
  sitrusBerry: requireItemId("Sitrus Berry"),
  smoothRock: requireItemId("Smooth Rock"),
  snowball: requireItemId("Snowball"),
  stickyBarb: requireItemId("Sticky Barb"),
  terrainExtender: requireItemId("Terrain Extender"),
  throatSpray: requireItemId("Throat Spray"),
  toxicOrb: requireItemId("Toxic Orb"),
  utilityUmbrella: requireItemId("Utility Umbrella"),
  weaknessPolicy: requireItemId("Weakness Policy"),
} as const;

export const TEST_MOVE_IDS = {
  crunch: requireMoveId("Crunch"),
  earthquake: requireMoveId("Earthquake"),
  flamethrower: requireMoveId("Flamethrower"),
  hyperVoice: requireMoveId("Hyper Voice"),
  iceBeam: requireMoveId("Ice Beam"),
  octolock: OCTOLOCK_MOVE_ID,
  surf: requireMoveId("Surf"),
  tackle: requireMoveId("Tackle"),
  thunderbolt: requireMoveId("Thunderbolt"),
} as const;

export const TEST_MOVE_CATEGORIES = {
  physical: "physical",
  special: "special",
  status: "status",
} as const;

export const TEST_TYPE_IDS = {
  electric: CORE_TYPE_IDS.electric,
  fairy: "fairy",
  fire: CORE_TYPE_IDS.fire,
  grass: CORE_TYPE_IDS.grass,
  ground: CORE_TYPE_IDS.ground,
  ice: CORE_TYPE_IDS.ice,
  normal: CORE_TYPE_IDS.normal,
  poison: CORE_TYPE_IDS.poison,
  water: CORE_TYPE_IDS.water,
} as const;

export const TEST_ABILITY_IDS = {
  gluttony: requireAbilityId("Gluttony"),
  klutz: requireAbilityId("Klutz"),
  none: TEST_DEFAULTS.ability,
  sheerForce: requireAbilityId("Sheer Force"),
  unburden: requireAbilityId("Unburden"),
} as const;

export const TEST_STATUS_IDS = {
  badlyPoisoned: CORE_STATUS_IDS.badlyPoisoned,
  burn: CORE_STATUS_IDS.burn,
  freeze: CORE_STATUS_IDS.freeze,
  paralysis: CORE_STATUS_IDS.paralysis,
  poison: CORE_STATUS_IDS.poison,
  sleep: CORE_STATUS_IDS.sleep,
} as const;

export const TEST_STAT_IDS = {
  attack: "attack",
  defense: "defense",
  none: "none",
  spAttack: "spAttack",
  spDefense: "spDefense",
  speed: "speed",
} as const;

export const TEST_TRIGGER_IDS = {
  beforeTurnOrder: "before-turn-order",
  endOfTurn: "end-of-turn",
  onContact: "on-contact",
  onDamageTaken: "on-damage-taken",
  onFoeStatChange: "on-foe-stat-change",
  onHit: "on-hit",
  onStatChange: "on-stat-change",
  unknown: "unknown-trigger",
} as const;

export const TEST_VOLATILE_IDS = {
  confusion: CORE_VOLATILE_IDS.confusion,
  embargo: CORE_VOLATILE_IDS.embargo,
  taunt: CORE_VOLATILE_IDS.taunt,
  unburden: CORE_VOLATILE_IDS.unburden,
} as const;

export const TEST_WEATHER_IDS = {
  rain: CORE_WEATHER_IDS.rain,
  sandstorm: CORE_WEATHER_IDS.sand,
  snow: CORE_WEATHER_IDS.snow,
  sun: CORE_WEATHER_IDS.sun,
} as const;

export const TEST_TARGET_IDS = {
  opponent: "opponent",
  self: "self",
} as const;

export const TEST_EFFECT_IDS = {
  chipDamage: "chip-damage",
  consume: "consume",
  flinch: "flinch",
  forceSwitch: "force-switch",
  heal: "heal",
  inflictStatus: "inflict-status",
  none: "none",
  statBoost: "stat-boost",
  statusCure: "status-cure",
  survive: "survive",
  volatileCure: "volatile-cure",
} as const;

export function consumeSelf(item: string) {
  return { type: TEST_EFFECT_IDS.consume, target: TEST_TARGET_IDS.self, value: item } as const;
}

export function healSelf(value: number) {
  return { type: TEST_EFFECT_IDS.heal, target: TEST_TARGET_IDS.self, value } as const;
}

export function chipDamageSelf(value: number) {
  return { type: TEST_EFFECT_IDS.chipDamage, target: TEST_TARGET_IDS.self, value } as const;
}

export function chipDamageOpponent(value: number) {
  return { type: TEST_EFFECT_IDS.chipDamage, target: TEST_TARGET_IDS.opponent, value } as const;
}

export function surviveSelf(value = 1) {
  return { type: TEST_EFFECT_IDS.survive, target: TEST_TARGET_IDS.self, value } as const;
}

export function statusCureSelf() {
  return { type: TEST_EFFECT_IDS.statusCure, target: TEST_TARGET_IDS.self } as const;
}

export function volatileCureSelf(value: string) {
  return { type: TEST_EFFECT_IDS.volatileCure, target: TEST_TARGET_IDS.self, value } as const;
}

export function statBoostSelf(value: string, stages?: number) {
  return stages === undefined
    ? ({ type: TEST_EFFECT_IDS.statBoost, target: TEST_TARGET_IDS.self, value } as const)
    : ({ type: TEST_EFFECT_IDS.statBoost, target: TEST_TARGET_IDS.self, value, stages } as const);
}

export function inflictStatusSelf(status: string) {
  return { type: TEST_EFFECT_IDS.inflictStatus, target: TEST_TARGET_IDS.self, status } as const;
}

export function flinchOpponent() {
  return { type: TEST_EFFECT_IDS.flinch, target: TEST_TARGET_IDS.opponent } as const;
}

export function forceSwitchSelf() {
  return {
    type: TEST_EFFECT_IDS.none,
    target: TEST_TARGET_IDS.self,
    value: TEST_EFFECT_IDS.forceSwitch,
  } as const;
}

export function forceSwitchOpponent() {
  return {
    type: TEST_EFFECT_IDS.none,
    target: TEST_TARGET_IDS.opponent,
    value: TEST_EFFECT_IDS.forceSwitch,
  } as const;
}
