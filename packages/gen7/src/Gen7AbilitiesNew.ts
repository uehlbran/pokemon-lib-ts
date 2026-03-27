import {
  type AbilityContext,
  type AbilityResult,
  BATTLE_ABILITY_EFFECT_TYPES,
  BATTLE_EFFECT_TARGETS,
} from "@pokemon-lib-ts/battle";
import { CORE_VOLATILE_IDS, type PokemonType } from "@pokemon-lib-ts/core";

/**
 * Gen 7 new signature abilities.
 *
 * Covers abilities introduced or significantly changed in Gen 7:
 *   - Disguise (Mimikyu): blocks first hit, no HP cost in Gen 7
 *   - Schooling (Wishiwashi): transforms at >= 25% HP
 *   - Battle Bond (Ash-Greninja): transforms on KO
 *   - Shields Down (Minior): form change at 50% HP, blocks status in Meteor Form
 *   - Power Construct (Zygarde): transforms to Complete at < 50% HP
 *   - RKS System (Silvally): type matches held Memory item
 *   - Comatose (Komala): always acts as asleep, immune to other statuses
 *
 * Source: Showdown data/abilities.ts
 * Source: Bulbapedia -- individual ability articles
 */

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function getName(ctx: AbilityContext): string {
  return ctx.pokemon.pokemon.nickname ?? String(ctx.pokemon.pokemon.speciesId);
}

// ---------------------------------------------------------------------------
// Inactive sentinel
// ---------------------------------------------------------------------------

const NO_EFFECT: AbilityResult = { activated: false, effects: [], messages: [] };

// ---------------------------------------------------------------------------
// Memory item -> type mapping for RKS System
// ---------------------------------------------------------------------------

/**
 * Maps held Memory items to Pokemon types for Silvally's RKS System.
 *
 * Source: Showdown data/items.ts -- all Memory items
 * Source: Bulbapedia "RKS System" -- type determined by held Memory
 */
export const MEMORY_TYPE_MAP: Readonly<Record<string, PokemonType>> = {
  "bug-memory": "bug",
  "dark-memory": "dark",
  "dragon-memory": "dragon",
  "electric-memory": "electric",
  "fairy-memory": "fairy",
  "fighting-memory": "fighting",
  "fire-memory": "fire",
  "flying-memory": "flying",
  "ghost-memory": "ghost",
  "grass-memory": "grass",
  "ground-memory": "ground",
  "ice-memory": "ice",
  "poison-memory": "poison",
  "psychic-memory": "psychic",
  "rock-memory": "rock",
  "steel-memory": "steel",
  "water-memory": "water",
};

// ---------------------------------------------------------------------------
// Schooling HP thresholds
// ---------------------------------------------------------------------------

/**
 * Wishiwashi transforms to School Form when HP >= 25% of max HP AND level >= 20.
 * Below 25%, it reverts to Solo Form.
 *
 * Source: Showdown data/abilities.ts -- schooling: onStart/onResidual
 * Source: Bulbapedia "Schooling" -- "If Wishiwashi is Level 20 or above and has more than
 *   25% of its max HP at the start of a turn, it will change to its School Form."
 */
export const SCHOOLING_HP_THRESHOLD = 0.25;
export const SCHOOLING_MIN_LEVEL = 20;

// ---------------------------------------------------------------------------
// Main dispatch for new Gen 7 abilities
// ---------------------------------------------------------------------------

/**
 * Handle Gen 7 new abilities for all trigger types.
 *
 * Routes by ability ID, then by trigger type.
 */
export function handleGen7NewAbility(ctx: AbilityContext): AbilityResult {
  const abilityId = ctx.pokemon.ability;

  switch (abilityId) {
    case "disguise":
      return handleDisguise(ctx);
    case "schooling":
      return handleSchooling(ctx);
    case "battle-bond":
      return handleBattleBond(ctx);
    case "shields-down":
      return handleShieldsDown(ctx);
    case "power-construct":
      return handlePowerConstruct(ctx);
    case "rks-system":
      return handleRKSSystem(ctx);
    case "comatose":
      return handleComatose(ctx);
    case "receiver":
    case "power-of-alchemy":
      // Doubles-only: copies a fallen ally's ability. Never triggers in singles.
      // Source: Showdown data/abilities.ts -- receiver/powerofalchemy: onAllyFaint
      return NO_EFFECT;
    default:
      return NO_EFFECT;
  }
}

// ---------------------------------------------------------------------------
// Disguise (Mimikyu)
// ---------------------------------------------------------------------------

/**
 * Disguise: absorbs the first damaging hit taken. In Gen 7, there is NO HP cost
 * to the Disguise holder when it breaks (this was added in Gen 8 as 1/8 max HP).
 *
 * - on-damage-taken: if Disguise is NOT broken, block the damage, set disguise-broken volatile
 * - passive-immunity: not used
 *
 * Source: Showdown data/abilities.ts -- disguise: onDamagePriority 1, onDamage
 *   In Gen 7: "if (this.gen >= 8) { ... damage = pokemon.maxhp / 8 }"
 *   meaning Gen 7 does NOT deal chip damage on Disguise break.
 * Source: Bulbapedia "Disguise" -- "The dummy takes the hit for the Pokemon,
 *   and the disguise is busted."
 * Source: Bulbapedia "Disguise" Gen 7 vs Gen 8 -- "In Generation VIII, the
 *   Pokemon now takes 1/8 max HP damage when its Disguise breaks."
 *   (implying Gen 7 had no such chip damage)
 */
function handleDisguise(ctx: AbilityContext): AbilityResult {
  const name = getName(ctx);

  switch (ctx.trigger) {
    case "on-damage-taken": {
      // If Disguise is already broken, no activation
      if (ctx.pokemon.volatileStatuses.has(CORE_VOLATILE_IDS.disguiseBroken)) return NO_EFFECT;

      // Only blocks damaging moves (not status)
      if (!ctx.move) return NO_EFFECT;
      if (ctx.move.category === "status") return NO_EFFECT;

      // Block the damage and break the Disguise
      // Gen 7: NO chip damage to Mimikyu on Disguise break
      return {
        activated: true,
        effects: [
          {
            effectType: BATTLE_ABILITY_EFFECT_TYPES.volatileInflict,
            target: BATTLE_EFFECT_TARGETS.self,
            volatile: CORE_VOLATILE_IDS.disguiseBroken,
          },
          {
            effectType: BATTLE_ABILITY_EFFECT_TYPES.damageReduction,
            target: BATTLE_EFFECT_TARGETS.self,
          },
        ],
        messages: [`${name}'s Disguise was busted!`],
        movePrevented: false,
      };
    }

    case "on-switch-in": {
      // On switch-in, if Disguise hasn't been broken this battle, ensure it's active
      // (Disguise doesn't reset on switch-out; once broken, it stays broken)
      // The volatile "disguise-broken" persists across switches if already set
      return NO_EFFECT;
    }

    default:
      return NO_EFFECT;
  }
}

/**
 * Check if Disguise should block incoming damage.
 * Returns true if the holder has Disguise and it has NOT been broken.
 *
 * Source: Showdown data/abilities.ts -- disguise onDamage priority check
 */
export function isDisguiseActive(abilityId: string, hasDisguiseBrokenVolatile: boolean): boolean {
  if (abilityId !== "disguise") return false;
  return !hasDisguiseBrokenVolatile;
}

/**
 * Get the chip damage dealt to the Disguise holder when Disguise breaks.
 * Gen 7: 0 damage (free hit absorption).
 * Gen 8+: 1/8 max HP.
 *
 * Source: Showdown data/abilities.ts -- disguise Gen 8: pokemon.maxhp / 8
 * Source: Bulbapedia "Disguise" -- Gen 7 no chip, Gen 8+ 1/8 chip
 */
export function getDisguiseBreakDamage(_maxHp: number): number {
  // Gen 7: Disguise breaking deals 0 damage to the holder
  return 0;
}

// ---------------------------------------------------------------------------
// Schooling (Wishiwashi)
// ---------------------------------------------------------------------------

/**
 * Schooling: Wishiwashi transforms between Solo and School Form.
 * School Form: HP >= 25% AND level >= 20.
 * Solo Form: HP < 25% OR level < 20.
 *
 * Triggers on switch-in and at the end of each turn.
 *
 * Source: Showdown data/abilities.ts -- schooling: onStart, onResidual
 * Source: Bulbapedia "Schooling" -- form change rules
 */
function handleSchooling(ctx: AbilityContext): AbilityResult {
  const name = getName(ctx);

  switch (ctx.trigger) {
    case "on-switch-in":
    case "on-turn-end": {
      const maxHp = ctx.pokemon.pokemon.calculatedStats?.hp ?? ctx.pokemon.pokemon.currentHp;
      const currentHp = ctx.pokemon.pokemon.currentHp;
      const level = ctx.pokemon.pokemon.level;

      const isSchoolForm =
        currentHp >= Math.ceil(maxHp * SCHOOLING_HP_THRESHOLD) && level >= SCHOOLING_MIN_LEVEL;

      // Return the form state for the engine to apply stat recalculation
      return {
        activated: true,
        effects: [
          { effectType: BATTLE_ABILITY_EFFECT_TYPES.none, target: BATTLE_EFFECT_TARGETS.self },
        ],
        messages: isSchoolForm ? [`${name} formed a school!`] : [`${name} stopped schooling!`],
      };
    }

    default:
      return NO_EFFECT;
  }
}

/**
 * Check if Wishiwashi should be in School Form.
 *
 * Source: Showdown data/abilities.ts -- schooling: checkSchooling
 */
export function isSchoolForm(
  abilityId: string,
  currentHp: number,
  maxHp: number,
  level: number,
): boolean {
  if (abilityId !== "schooling") return false;
  if (level < SCHOOLING_MIN_LEVEL) return false;
  return currentHp >= Math.ceil(maxHp * SCHOOLING_HP_THRESHOLD);
}

// ---------------------------------------------------------------------------
// Battle Bond (Ash-Greninja)
// ---------------------------------------------------------------------------

/**
 * Battle Bond: after causing a faint, Greninja transforms to Ash-Greninja.
 * The transformation raises Water Shuriken to 20 base power and makes it
 * always hit 3 times. Other stats boosted through form change.
 *
 * Source: Showdown data/abilities.ts -- battlebond: onSourceAfterFaint
 * Source: Bulbapedia "Battle Bond" -- "When this Pokemon causes a foe to faint,
 *   it transforms into Ash-Greninja."
 */
function handleBattleBond(ctx: AbilityContext): AbilityResult {
  const name = getName(ctx);

  switch (ctx.trigger) {
    case "on-after-move-used": {
      // Check if a KO was scored
      if (!ctx.opponent) return NO_EFFECT;
      if (ctx.opponent.pokemon.currentHp > 0) return NO_EFFECT;

      // Already transformed
      if (ctx.pokemon.volatileStatuses.has(CORE_VOLATILE_IDS.battleBondTransformed)) {
        return NO_EFFECT;
      }

      return {
        activated: true,
        effects: [
          {
            effectType: BATTLE_ABILITY_EFFECT_TYPES.volatileInflict,
            target: BATTLE_EFFECT_TARGETS.self,
            volatile: CORE_VOLATILE_IDS.battleBondTransformed,
          },
        ],
        messages: [`${name} became Ash-Greninja!`],
      };
    }

    default:
      return NO_EFFECT;
  }
}

/**
 * Check if Battle Bond should transform Greninja.
 *
 * Source: Showdown data/abilities.ts -- battlebond
 */
export function shouldBattleBondTransform(
  abilityId: string,
  opponentFainted: boolean,
  alreadyTransformed: boolean,
): boolean {
  if (abilityId !== "battle-bond") return false;
  if (!opponentFainted) return false;
  return !alreadyTransformed;
}

// ---------------------------------------------------------------------------
// Shields Down (Minior)
// ---------------------------------------------------------------------------

/**
 * Shields Down: Minior is in Meteor Form (high defenses) above 50% HP.
 * Below 50%, changes to Core Form (lower defenses, higher offenses).
 * Cannot be statused in Meteor Form.
 *
 * Source: Showdown data/abilities.ts -- shieldsdown: onStart, onResidual, onSetStatus
 * Source: Bulbapedia "Shields Down" -- form change at 50% HP
 */
function handleShieldsDown(ctx: AbilityContext): AbilityResult {
  const name = getName(ctx);

  switch (ctx.trigger) {
    case "on-switch-in":
    case "on-turn-end": {
      const maxHp = ctx.pokemon.pokemon.calculatedStats?.hp ?? ctx.pokemon.pokemon.currentHp;
      const currentHp = ctx.pokemon.pokemon.currentHp;
      const isMeteorForm = currentHp > Math.floor(maxHp / 2);

      return {
        activated: true,
        effects: [
          { effectType: BATTLE_ABILITY_EFFECT_TYPES.none, target: BATTLE_EFFECT_TARGETS.self },
        ],
        messages: isMeteorForm
          ? [] // Meteor Form is the default, no message
          : [`${name}'s shields went down!`],
      };
    }

    case "on-status-inflicted": {
      // In Meteor Form (> 50% HP), status conditions are blocked
      const maxHp = ctx.pokemon.pokemon.calculatedStats?.hp ?? ctx.pokemon.pokemon.currentHp;
      const currentHp = ctx.pokemon.pokemon.currentHp;
      if (currentHp > Math.floor(maxHp / 2)) {
        return {
          activated: true,
          effects: [],
          messages: [`${name}'s Shields Down prevents status conditions!`],
          movePrevented: true,
        };
      }
      return NO_EFFECT;
    }

    default:
      return NO_EFFECT;
  }
}

/**
 * Check if Minior is in Meteor Form (> 50% HP, status-immune).
 *
 * Source: Showdown data/abilities.ts -- shieldsdown
 */
export function isShieldsDownMeteorForm(
  abilityId: string,
  currentHp: number,
  maxHp: number,
): boolean {
  if (abilityId !== "shields-down") return false;
  return currentHp > Math.floor(maxHp / 2);
}

// ---------------------------------------------------------------------------
// Power Construct (Zygarde)
// ---------------------------------------------------------------------------

/**
 * Power Construct: when Zygarde (10% or 50% form) drops below 50% HP,
 * it transforms to Complete Form. Triggers once per battle.
 *
 * Source: Showdown data/abilities.ts -- powerconstruct: onResidual
 * Source: Bulbapedia "Power Construct" -- "When Zygarde's HP falls below half,
 *   it changes to Complete Forme."
 */
function handlePowerConstruct(ctx: AbilityContext): AbilityResult {
  const name = getName(ctx);

  switch (ctx.trigger) {
    case "on-damage-taken":
    case "on-turn-end": {
      // Already transformed this battle
      if (ctx.pokemon.volatileStatuses.has(CORE_VOLATILE_IDS.powerConstructTransformed)) {
        return NO_EFFECT;
      }

      const maxHp = ctx.pokemon.pokemon.calculatedStats?.hp ?? ctx.pokemon.pokemon.currentHp;
      const currentHp = ctx.pokemon.pokemon.currentHp;

      // Transform at < 50% HP
      if (currentHp >= Math.ceil(maxHp / 2)) return NO_EFFECT;

      return {
        activated: true,
        effects: [
          {
            effectType: BATTLE_ABILITY_EFFECT_TYPES.volatileInflict,
            target: BATTLE_EFFECT_TARGETS.self,
            volatile: CORE_VOLATILE_IDS.powerConstructTransformed,
          },
        ],
        messages: [`${name} transformed into its Complete Forme!`],
      };
    }

    default:
      return NO_EFFECT;
  }
}

/**
 * Check if Power Construct should transform Zygarde.
 *
 * Source: Showdown data/abilities.ts -- powerconstruct
 */
export function shouldPowerConstructTransform(
  abilityId: string,
  currentHp: number,
  maxHp: number,
  alreadyTransformed: boolean,
): boolean {
  if (abilityId !== "power-construct") return false;
  if (alreadyTransformed) return false;
  return currentHp < Math.ceil(maxHp / 2);
}

// ---------------------------------------------------------------------------
// RKS System (Silvally)
// ---------------------------------------------------------------------------

/**
 * RKS System: Silvally's type matches its held Memory item.
 * If no Memory is held, Silvally is Normal type.
 *
 * Source: Showdown data/abilities.ts -- rkssystem: onStart
 * Source: Bulbapedia "RKS System" -- type determined by Memory item
 */
function handleRKSSystem(ctx: AbilityContext): AbilityResult {
  switch (ctx.trigger) {
    case "on-switch-in": {
      const heldItem = ctx.pokemon.pokemon.heldItem;
      const type = getRKSType(heldItem);
      if (!type) return NO_EFFECT;

      const name = getName(ctx);
      return {
        activated: true,
        effects: [
          {
            effectType: BATTLE_ABILITY_EFFECT_TYPES.typeChange,
            target: BATTLE_EFFECT_TARGETS.self,
            types: [type],
          },
        ],
        messages: [`${name}'s RKS System changed its type to ${type}!`],
      };
    }

    default:
      return NO_EFFECT;
  }
}

/**
 * Get the type Silvally should be based on its held Memory item.
 * Returns null if no Memory is held (defaults to Normal type).
 *
 * Source: Showdown data/items.ts -- Memory items
 */
export function getRKSType(heldItem: string | null): PokemonType | null {
  if (!heldItem) return null;
  return MEMORY_TYPE_MAP[heldItem] ?? null;
}

// ---------------------------------------------------------------------------
// Comatose (Komala)
// ---------------------------------------------------------------------------

/**
 * Comatose: Komala always acts as if asleep but cannot be inflicted with
 * any other status condition. Sleep Talk and Snore can always be used.
 *
 * Source: Showdown data/abilities.ts -- comatose: onStart, onSetStatus
 * Source: Bulbapedia "Comatose" -- "The Pokemon is always drowsing and
 *   cannot be afflicted by a status condition."
 */
function handleComatose(ctx: AbilityContext): AbilityResult {
  const name = getName(ctx);

  switch (ctx.trigger) {
    case "on-switch-in": {
      return {
        activated: true,
        effects: [
          { effectType: BATTLE_ABILITY_EFFECT_TYPES.none, target: BATTLE_EFFECT_TARGETS.self },
        ],
        messages: [`${name} is drowsing!`],
      };
    }

    case "on-status-inflicted": {
      // Blocks ALL status conditions
      return {
        activated: true,
        effects: [],
        messages: [`${name}'s Comatose prevents status conditions!`],
        movePrevented: true,
      };
    }

    default:
      return NO_EFFECT;
  }
}

/**
 * Check if Comatose blocks a status condition.
 *
 * Source: Showdown data/abilities.ts -- comatose: onSetStatus returns false
 */
export function isComatoseStatusImmune(abilityId: string): boolean {
  return abilityId === "comatose";
}

/**
 * Check if a Pokemon with Comatose counts as "asleep" for move purposes
 * (Sleep Talk, Snore).
 *
 * Source: Showdown data/abilities.ts -- comatose: Pokemon is treated as asleep
 */
export function isComatoseAsleep(abilityId: string): boolean {
  return abilityId === "comatose";
}
