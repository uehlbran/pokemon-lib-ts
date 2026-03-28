export const BATTLE_GIMMICK_IDS = {
  dynamax: "dynamax",
  mega: "mega",
  tera: "tera",
  ultraBurst: "ultraburst",
  zMove: "zmove",
} as const;

export const BATTLE_SOURCE_IDS = {
  ability: "ability",
  aquaRing: "aqua-ring",
  bind: "bind",
  confusion: "confusion",
  curse: "curse",
  entryHazard: "entry-hazard",
  grassyTerrain: "grassy-terrain",
  heldItem: "held-item",
  ingrain: "ingrain",
  leechSeed: "leech-seed",
  moveEffect: "move-effect",
  nightmare: "nightmare",
  recoil: "recoil",
  saltCure: "salt-cure",
  struggle: "struggle",
  struggleRecoil: "struggle-recoil",
  wish: "wish",
  weatherPrefix: "weather-",
} as const;
export type BattleSourceId = (typeof BATTLE_SOURCE_IDS)[keyof typeof BATTLE_SOURCE_IDS];
