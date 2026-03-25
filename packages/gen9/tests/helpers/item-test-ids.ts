export const TEST_DEFAULTS = {
  ability: "none",
  abilitySlot: "normal1" as const,
  battleType: "singles",
  defaultType: "normal",
  gender: "male",
  nature: "hardy",
  pokeball: "pokeball",
  uid: "test",
} as const;

export const TEST_FIXED_POINT = {
  neutral: 4096,
  typeBoost: 4915,
  lifeOrb: 5325,
  choice: 6144,
  resistBerry: 2048,
} as const;

export const TEST_ITEM_IDS = {
  absorbBulb: "absorb-bulb",
  airBalloon: "air-balloon",
  aspearBerry: "aspear-berry",
  assaultVest: "assault-vest",
  blackSludge: "black-sludge",
  blunderPolicy: "blunder-policy",
  boosterEnergy: "booster-energy",
  cellBattery: "cell-battery",
  charcoal: "charcoal",
  cheriBerry: "cheri-berry",
  chestoBerry: "chesto-berry",
  chilanBerry: "chilan-berry",
  choiceBand: "choice-band",
  choiceScarf: "choice-scarf",
  choiceSpecs: "choice-specs",
  covertCloak: "covert-cloak",
  custapBerry: "custap-berry",
  dampRock: "damp-rock",
  ejectButton: "eject-button",
  ejectPack: "eject-pack",
  fairyFeather: "fairy-feather",
  flameOrb: "flame-orb",
  flamePlate: "flame-plate",
  focusBand: "focus-band",
  focusSash: "focus-sash",
  heatRock: "heat-rock",
  icyRock: "icy-rock",
  ironBall: "iron-ball",
  keeBerry: "kee-berry",
  kingsRock: "kings-rock",
  leftovers: "leftovers",
  liechiBerry: "liechi-berry",
  lifeOrb: "life-orb",
  lumBerry: "lum-berry",
  marangaBerry: "maranga-berry",
  mentalHerb: "mental-herb",
  mysticWater: "mystic-water",
  occaBerry: "occa-berry",
  oranBerry: "oran-berry",
  pechaBerry: "pecha-berry",
  petayaBerry: "petaya-berry",
  quickClaw: "quick-claw",
  rawstBerry: "rawst-berry",
  redCard: "red-card",
  rockHelmet: "rocky-helmet",
  roomService: "room-service",
  roseliBerry: "roseli-berry",
  safetyGoggles: "safety-goggles",
  salacBerry: "salac-berry",
  seaIncense: "sea-incense",
  shellBell: "shell-bell",
  sitrusBerry: "sitrus-berry",
  smoothRock: "smooth-rock",
  snowball: "snowball",
  stickyBarb: "sticky-barb",
  terrainExtender: "terrain-extender",
  throatSpray: "throat-spray",
  toxicOrb: "toxic-orb",
  utilityUmbrella: "utility-umbrella",
  weaknessPolicy: "weakness-policy",
} as const;

export const TEST_MOVE_IDS = {
  earthquake: "earthquake",
  flamethrower: "flamethrower",
  hyperVoice: "hyper-voice",
  iceBeam: "ice-beam",
  surf: "surf",
  tackle: "tackle",
  thunderbolt: "thunderbolt",
} as const;

export const TEST_MOVE_CATEGORIES = {
  physical: "physical",
  special: "special",
  status: "status",
} as const;

export const TEST_TYPE_IDS = {
  electric: "electric",
  fairy: "fairy",
  fire: "fire",
  grass: "grass",
  ground: "ground",
  ice: "ice",
  normal: "normal",
  poison: "poison",
  water: "water",
} as const;

export const TEST_ABILITY_IDS = {
  gluttony: "gluttony",
  klutz: "klutz",
  none: TEST_DEFAULTS.ability,
  sheerForce: "sheer-force",
  unburden: "unburden",
} as const;

export const TEST_STATUS_IDS = {
  badlyPoisoned: "badly-poisoned",
  burn: "burn",
  freeze: "freeze",
  paralysis: "paralysis",
  poison: "poison",
  sleep: "sleep",
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
  onHit: "on-hit",
  unknown: "unknown-trigger",
} as const;

export const TEST_VOLATILE_IDS = {
  confusion: "confusion",
  embargo: "embargo",
  taunt: "taunt",
  unburden: "unburden",
} as const;

export const TEST_WEATHER_IDS = {
  rain: "rain",
  sandstorm: "sandstorm",
  snow: "snow",
  sun: "sun",
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
