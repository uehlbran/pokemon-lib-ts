import type { Generation } from "./types";

export interface AbilityData {
  /** Lowercase identifier (e.g., "blaze") */
  readonly id: string;

  /** Display name (e.g., "Blaze") */
  readonly displayName: string;

  /** Description of the ability's effect */
  readonly description: string;

  /** When this ability activates — used by the battle engine to register handlers */
  readonly triggers: readonly AbilityTrigger[];

  /** Generation this ability was introduced */
  readonly generation: Generation;

  /** Whether this ability can be suppressed (Gastro Acid, Mold Breaker, etc.) */
  readonly suppressible: boolean;

  /** Whether this ability can be copied (Trace, Role Play) */
  readonly copyable: boolean;

  /** Whether this ability can be swapped (Skill Swap) */
  readonly swappable: boolean;
}

export type AbilityTrigger =
  | "on-switch-in" // Intimidate, Drizzle, Sand Stream
  | "on-switch-out" // Regenerator, Natural Cure
  | "on-before-move" // Protean, Libero
  | "on-after-move-hit" // Rough Skin, Iron Barbs, Flame Body
  | "on-after-move-used" // Moxie (after KO), Magician
  | "on-damage-taken" // Sturdy, Multiscale, Disguise
  | "on-damage-calc" // Huge Power, Hustle, Sand Force (modifies damage)
  | "on-stat-change" // Clear Body, Competitive, Defiant
  | "on-status-inflicted" // Immunity, Limber, Vital Spirit
  | "on-weather-change" // Sand Rush, Swift Swim, Chlorophyll
  | "on-terrain-change" // Surge abilities
  | "on-turn-end" // Speed Boost, Moody, Poison Heal
  | "on-hp-threshold" // Blaze, Torrent, Overgrow, Swarm
  | "on-faint" // Aftermath
  | "on-contact" // Static, Flame Body, Poison Point
  | "on-critical-hit" // Anger Point, Sniper
  | "on-accuracy-check" // Compound Eyes, Hustle (accuracy modification)
  | "on-priority-check" // Prankster, Gale Wings, Triage
  | "on-type-effectiveness" // Filter, Solid Rock, Prism Armor
  | "on-item-use" // Unnerve, Ripen
  | "passive-modifier" // Huge Power, Pure Power, Hustle
  | "passive-immunity" // Levitate, Flash Fire, Lightning Rod, Volt Absorb
  | "on-flinch"; // Steadfast — raises Speed when flinched
