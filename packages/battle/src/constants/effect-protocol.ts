/**
 * Shared battle protocol constants for effect payload discriminants and targets.
 *
 * These values are part of the battle-layer contract rather than canonical game data,
 * but they are repeated widely enough across production code that they should still
 * have an owned import surface instead of being handwritten in every effect payload.
 */

export const BATTLE_EFFECT_TARGETS = {
  self: "self",
  opponent: "opponent",
  field: "field",
  ally: "ally",
  attacker: "attacker",
  defender: "defender",
  both: "both",
} as const;

export const BATTLE_ABILITY_EFFECT_TYPES = {
  statChange: "stat-change",
  statusCure: "status-cure",
  statusInflict: "status-inflict",
  damageReduction: "damage-reduction",
  typeChange: "type-change",
  weatherSet: "weather-set",
  abilityChange: "ability-change",
  heal: "heal",
  chipDamage: "chip-damage",
  volatileInflict: "volatile-inflict",
  volatileRemove: "volatile-remove",
  itemRestore: "item-restore",
  none: "none",
} as const;

export const BATTLE_ITEM_EFFECT_TYPES = {
  statBoost: "stat-boost",
  heal: "heal",
  speedBoost: "speed-boost",
  statusCure: "status-cure",
  consume: "consume",
  survive: "survive",
  flinch: "flinch",
  volatileCure: "volatile-cure",
  statusInflict: "status-inflict",
  selfDamage: "self-damage",
  chipDamage: "chip-damage",
  inflictStatus: "inflict-status",
  none: "none",
} as const;

export const BATTLE_ITEM_EFFECT_VALUES = {
  forceSwitch: "force-switch",
} as const;
