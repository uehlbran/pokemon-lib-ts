/**
 * Shared reference identifiers used across packages and tests.
 *
 * These remain lowercase string literals to match the repo's canonical entity ids.
 * The goal is to expose a single import surface for common domain ids/constants so
 * tests do not need to re-declare brittle file-local string bags.
 */

export const CORE_FIXED_POINT = {
  boost12: 4915,
  boost13: 5325,
  boost15: 6144,
  half: 2048,
  identity: 4096,
  gemBoost: 5325,
  resistHalf: 2048,
  spreadModifier: 3072,
  typeBoost: 4915,
} as const;

export const CORE_ABILITY_IDS = {
  blaze: "blaze",
  flashFire: "flash-fire",
  levitate: "levitate",
  moldBreaker: "mold-breaker",
  none: "none",
  scrappy: "scrappy",
  sturdy: "sturdy",
  wonderGuard: "wonder-guard",
} as const;

export const CORE_ITEM_IDS = {
  airBalloon: "air-balloon",
  chilanBerry: "chilan-berry",
  ironBall: "iron-ball",
  normalGem: "normal-gem",
  occaBerry: "occa-berry",
  yacheBerry: "yache-berry",
} as const;

export const CORE_MOVE_IDS = {
  aerialAce: "aerial-ace",
  bounce: "bounce",
  energyBall: "energy-ball",
  firePledge: "fire-pledge",
  flamethrower: "flamethrower",
  fly: "fly",
  grassPledge: "grass-pledge",
  skyDrop: "sky-drop",
  surf: "surf",
  tackle: "tackle",
  waterPledge: "water-pledge",
} as const;

export const CORE_TERRAIN_IDS = {
  electric: "electric",
  testSource: "test",
} as const;

export const CORE_TYPE_IDS = {
  dark: "dark",
  electric: "electric",
  fire: "fire",
  flying: "flying",
  ice: "ice",
  ghost: "ghost",
  grass: "grass",
  ground: "ground",
  normal: "normal",
  poison: "poison",
  steel: "steel",
  water: "water",
} as const;

export const CORE_STATUS_IDS = {
  badlyPoisoned: "badly-poisoned",
  burn: "burn",
  freeze: "freeze",
  paralysis: "paralysis",
  poison: "poison",
  sleep: "sleep",
} as const;

export const CORE_VOLATILE_IDS = {
  confusion: "confusion",
  embargo: "embargo",
  ingrain: "ingrain",
  smackDown: "smackdown",
  taunt: "taunt",
  unburden: "unburden",
} as const;

export const CORE_WEATHER_IDS = {
  harshSun: "harsh-sun",
  hail: "hail",
  rain: "rain",
  sand: "sandstorm",
  snow: "snow",
  sun: "sun",
} as const;
