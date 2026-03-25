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
  defeatist: "defeatist",
  flashFire: "flash-fire",
  klutz: "klutz",
  levitate: "levitate",
  marvelScale: "marvel-scale",
  moldBreaker: "mold-breaker",
  none: "none",
  scrappy: "scrappy",
  simple: "simple",
  skillLink: "skill-link",
  slowStart: "slow-start",
  solarPower: "solar-power",
  sturdy: "sturdy",
  unburden: "unburden",
  wonderGuard: "wonder-guard",
} as const;

export const CORE_ITEM_IDS = {
  adamantOrb: "adamant-orb",
  airBalloon: "air-balloon",
  blackSludge: "black-sludge",
  chilanBerry: "chilan-berry",
  choiceBand: "choice-band",
  deepSeaScale: "deep-sea-scale",
  deepSeaTooth: "deep-sea-tooth",
  griseousOrb: "griseous-orb",
  ironBall: "iron-ball",
  leftovers: "leftovers",
  lightBall: "light-ball",
  lustrousOrb: "lustrous-orb",
  normalGem: "normal-gem",
  occaBerry: "occa-berry",
  soulDew: "soul-dew",
  thickClub: "thick-club",
  yacheBerry: "yache-berry",
} as const;

export const CORE_MOVE_IDS = {
  aerialAce: "aerial-ace",
  acrobatics: "acrobatics",
  bind: "bind",
  bounce: "bounce",
  confusion: "confusion",
  doubleEdge: "double-edge",
  energyBall: "energy-ball",
  firePledge: "fire-pledge",
  flameCharge: "flame-charge",
  flamethrower: "flamethrower",
  focusBlast: "focus-blast",
  fly: "fly",
  grassPledge: "grass-pledge",
  headbutt: "headbutt",
  hex: "hex",
  leechSeed: "leech-seed",
  machPunch: "mach-punch",
  perishSong: "perish-song",
  quickAttack: "quick-attack",
  round: "round",
  skyDrop: "sky-drop",
  solarBeam: "solar-beam",
  struggle: "struggle",
  surf: "surf",
  swift: "swift",
  tackle: "tackle",
  triAttack: "tri-attack",
  wish: "wish",
  waterPledge: "water-pledge",
} as const;

export const CORE_HAZARD_IDS = {
  spikes: "spikes",
  stealthRock: "stealth-rock",
  stickyWeb: "sticky-web",
  toxicSpikes: "toxic-spikes",
} as const;

export const CORE_GIMMICK_IDS = {
  mega: "mega",
} as const;

export const CORE_TERRAIN_IDS = {
  electric: "electric",
  testSource: "test",
} as const;

export const CORE_TYPE_IDS = {
  bug: "bug",
  dark: "dark",
  dragon: "dragon",
  electric: "electric",
  fairy: "fairy",
  fighting: "fighting",
  fire: "fire",
  flying: "flying",
  ghost: "ghost",
  grass: "grass",
  ground: "ground",
  ice: "ice",
  normal: "normal",
  poison: "poison",
  psychic: "psychic",
  rock: "rock",
  steel: "steel",
  water: "water",
} as const;

export const CORE_SCREEN_IDS = {
  lightScreen: "light-screen",
  reflect: "reflect",
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
  bound: "bound",
  confusion: "confusion",
  curse: "curse",
  embargo: "embargo",
  ingrain: "ingrain",
  leechSeed: "leech-seed",
  magnetRise: "magnet-rise",
  nightmare: "nightmare",
  smackDown: "smackdown",
  substitute: "substitute",
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
