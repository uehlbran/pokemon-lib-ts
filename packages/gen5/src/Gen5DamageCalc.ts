import type {
  ActivePokemon,
  DamageBreakdown,
  DamageContext,
  DamageResult,
} from "@pokemon-lib-ts/battle";
import type { MoveEffect, PokemonType, TypeChart } from "@pokemon-lib-ts/core";
import {
  getStabModifier,
  getStatStageMultiplier,
  getTypeEffectiveness,
} from "@pokemon-lib-ts/core";
import { isSheerForceEligibleMove } from "./Gen5AbilitiesDamage";

// ---- pokeRound: the 4096-based rounding function ----

/**
 * Apply a 4096-based modifier to a value, using Showdown's rounding convention.
 *
 * This is the core new mechanic in Gen 5+. All modifiers use 4096-based rounding
 * instead of the integer multiply/divide from earlier gens.
 *
 * Equivalent to Showdown's `modify(value, modifier/4096)`:
 *   `tr((tr(value * modifier) + 2048 - 1) / 4096)`
 *
 * Showdown's tr() is `num >>> 0` (unsigned 32-bit truncation), which for
 * positive integers is equivalent to Math.floor. For positive damage values,
 * `tr(v*m) + 2048 - 1` simplifies to `v*m + 2047`, giving:
 *   `floor((value * modifier + 2047) / 4096)`
 *
 * Source: references/pokemon-showdown/sim/battle.ts modify() method (line 2334-2344)
 * Source: references/pokemon-showdown/sim/dex.ts trunc() — num >>> 0
 *
 * @param value - The damage/stat value to modify
 * @param modifier - The 4096-based modifier (4096 = 1.0x, 6144 = 1.5x, etc.)
 * @returns The modified value after rounding
 */
export function pokeRound(value: number, modifier: number): number {
  // Source: references/pokemon-showdown/sim/battle.ts line 2344
  // return tr((tr(value * modifier) + 2048 - 1) / 4096)
  // For positive integers, equivalent to: floor((value * modifier + 2047) / 4096)
  // Fix: +2047 not +2048 -- see GitHub #536
  return Math.floor((value * modifier + 2047) / 4096);
}

// ---- Type-Boosting Items ----

/**
 * Type-boosting held items: ~1.2x (4915/4096) base power increase for moves
 * of the matching type. Applied via onBasePower in Showdown.
 *
 * Source: Showdown data/items.ts -- Charcoal, Mystic Water, etc. use
 *   onBasePower with chainModify([4915, 4096])
 */
const TYPE_BOOST_ITEMS: Readonly<Record<string, string>> = {
  charcoal: "fire",
  "mystic-water": "water",
  "miracle-seed": "grass",
  magnet: "electric",
  "twisted-spoon": "psychic",
  "spell-tag": "ghost",
  "never-melt-ice": "ice",
  "black-belt": "fighting",
  "poison-barb": "poison",
  "soft-sand": "ground",
  "sharp-beak": "flying",
  "hard-stone": "rock",
  "silver-powder": "bug",
  "dragon-fang": "dragon",
  "black-glasses": "dark",
  "metal-coat": "steel",
  "silk-scarf": "normal",
};

/**
 * Plate items: ~1.2x (4915/4096) base power increase for moves
 * of the matching type. Same multiplier as type-boost items.
 *
 * Source: Showdown data/items.ts -- Flame Plate etc. use onBasePower with
 *   chainModify([4915, 4096])
 */
const PLATE_ITEMS: Readonly<Record<string, string>> = {
  "flame-plate": "fire",
  "splash-plate": "water",
  "meadow-plate": "grass",
  "zap-plate": "electric",
  "mind-plate": "psychic",
  "spooky-plate": "ghost",
  "icicle-plate": "ice",
  "fist-plate": "fighting",
  "toxic-plate": "poison",
  "earth-plate": "ground",
  "sky-plate": "flying",
  "stone-plate": "rock",
  "insect-plate": "bug",
  "draco-plate": "dragon",
  "dread-plate": "dark",
  "iron-plate": "steel",
  // Pixie Plate (fairy) is NOT included -- Fairy type was introduced in Gen 6
};

// ---- Gem Items (Gen 5) ----

/**
 * Type Gem items: consume on use to boost base power of matching type moves.
 * In Gen 5, the boost is 1.5x. In Gen 6+, it was reduced to 1.3x.
 *
 * Source: references/pokemon-showdown/data/mods/gen5/conditions.ts gem condition
 *   -- chainModify(1.5) in Gen 5
 */
const GEM_ITEMS: Readonly<Record<string, string>> = {
  "normal-gem": "normal",
  "fire-gem": "fire",
  "water-gem": "water",
  "electric-gem": "electric",
  "grass-gem": "grass",
  "ice-gem": "ice",
  "fighting-gem": "fighting",
  "poison-gem": "poison",
  "ground-gem": "ground",
  "flying-gem": "flying",
  "psychic-gem": "psychic",
  "bug-gem": "bug",
  "rock-gem": "rock",
  "ghost-gem": "ghost",
  "dragon-gem": "dragon",
  "dark-gem": "dark",
  "steel-gem": "steel",
};

// ---- Pinch Ability Types ----

/**
 * Pinch abilities: boost move power by 1.5x when the user's HP is at or
 * below floor(maxHP/3) and the move type matches the ability's type.
 *
 * Source: Showdown sim/battle.ts -- pinch ability check
 * Source: Bulbapedia -- Overgrow / Blaze / Torrent / Swarm
 */
const PINCH_ABILITY_TYPES: Readonly<Record<string, string>> = {
  overgrow: "grass",
  blaze: "fire",
  torrent: "water",
  swarm: "bug",
};

// ---- Ability Immunity Map ----

/**
 * Defender abilities that grant full type immunity to incoming moves.
 * Checked before the damage formula runs; returns 0 damage with effectiveness 0.
 *
 * Gen 5 additions vs Gen 4: Sap Sipper (grass), Lightning Rod (electric, changed behavior).
 *
 * Source: Showdown sim/battle.ts -- immunity abilities
 * Source: Bulbapedia -- Motor Drive, Dry Skin, etc.
 */
const ABILITY_TYPE_IMMUNITIES: Readonly<Record<string, string>> = {
  levitate: "ground",
  "volt-absorb": "electric",
  "water-absorb": "water",
  "flash-fire": "fire",
  "motor-drive": "electric",
  "dry-skin": "water",
  "storm-drain": "water",
  "lightning-rod": "electric",
  "sap-sipper": "grass",
};

// ---- Recoil Detection Helper ----

/**
 * Check if a move effect includes recoil (for Reckless boost).
 *
 * Source: Showdown data/abilities.ts -- Reckless checks for recoil flag
 */
function hasRecoilEffect(effect: MoveEffect | null): boolean {
  if (!effect) return false;
  if (effect.type === "recoil") return true;
  if (effect.type === "multi") {
    return effect.effects.some((e) => e.type === "recoil");
  }
  return false;
}

// ---- Stat Stage Helpers ----

/**
 * Get effective stat stage accounting for Simple and Unaware abilities.
 *
 * Source: Showdown sim/battle.ts -- Simple doubles stat stages; Unaware ignores them
 */
function getEffectiveStatStage(
  pokemon: ActivePokemon,
  stat: string,
  opponent?: ActivePokemon,
): number {
  const raw = (pokemon.statStages as Record<string, number>)[stat] ?? 0;
  if (pokemon.ability === "simple") return Math.max(-6, Math.min(6, raw * 2));
  if (opponent?.ability === "unaware") return 0;
  return raw;
}

// ---- Attack Stat Calculation ----

/**
 * Get the effective attack stat for a move in Gen 5.
 *
 * Same physical/special split as Gen 4 (per-move, not per-type).
 *
 * Source: references/pokemon-showdown/sim/battle-actions.ts -- Gen 5 attack stat
 */
function getAttackStat(
  attacker: ActivePokemon,
  _moveType: PokemonType,
  isPhysical: boolean,
  isCrit: boolean,
  defender?: ActivePokemon,
): number {
  const statKey = isPhysical ? "attack" : "spAttack";
  const stats = attacker.pokemon.calculatedStats;
  let rawStat = stats ? stats[statKey] : 100;

  const ability = attacker.ability;
  const attackerItem = attacker.pokemon.heldItem;
  const attackerSpecies = attacker.pokemon.speciesId;
  const attackerHasKlutz = ability === "klutz";

  // Huge Power / Pure Power: doubles physical attack
  // Source: Showdown -- Huge Power / Pure Power
  if (isPhysical && (ability === "huge-power" || ability === "pure-power")) {
    rawStat = rawStat * 2;
  }

  // Choice Band (physical) / Choice Specs (special): 1.5x raw stat
  // Source: Showdown data/items.ts -- Choice Band / Choice Specs
  if (!attackerHasKlutz && isPhysical && attackerItem === "choice-band") {
    rawStat = Math.floor((150 * rawStat) / 100);
  }
  if (!attackerHasKlutz && !isPhysical && attackerItem === "choice-specs") {
    rawStat = Math.floor((150 * rawStat) / 100);
  }

  // Soul Dew: 1.5x SpAtk for Latias (380) / Latios (381)
  // Source: Showdown sim/items.ts -- Soul Dew Gen 3-6 behavior
  if (
    !attackerHasKlutz &&
    !isPhysical &&
    attackerItem === "soul-dew" &&
    (attackerSpecies === 380 || attackerSpecies === 381)
  ) {
    rawStat = Math.floor((rawStat * 150) / 100);
  }

  // Deep Sea Tooth: 2x SpAtk for Clamperl (366)
  // Source: Showdown sim/items.ts -- Deep Sea Tooth
  if (
    !attackerHasKlutz &&
    !isPhysical &&
    attackerItem === "deep-sea-tooth" &&
    attackerSpecies === 366
  ) {
    rawStat = rawStat * 2;
  }

  // Light Ball: 2x Atk AND SpAtk for Pikachu (25)
  // Source: Showdown sim/items.ts -- Light Ball Gen 4+ behavior
  if (!attackerHasKlutz && attackerItem === "light-ball" && attackerSpecies === 25) {
    rawStat = rawStat * 2;
  }

  // Thick Club: 2x Attack for Cubone (104) / Marowak (105)
  // Source: Showdown sim/items.ts -- Thick Club
  if (
    !attackerHasKlutz &&
    isPhysical &&
    attackerItem === "thick-club" &&
    (attackerSpecies === 104 || attackerSpecies === 105)
  ) {
    rawStat = rawStat * 2;
  }

  // Hustle: 1.5x physical attack
  // Source: Showdown -- Hustle
  if (isPhysical && ability === "hustle") {
    rawStat = Math.floor((150 * rawStat) / 100);
  }

  // Guts: 1.5x physical attack when statused
  // Source: Showdown -- Guts
  if (isPhysical && ability === "guts" && attacker.pokemon.status !== null) {
    rawStat = Math.floor((150 * rawStat) / 100);
  }

  // Solar Power: 1.5x SpAtk in Harsh Sunlight
  // Source: Showdown data/abilities.ts -- Solar Power
  // Note: weather is not passed to this function; handled in main calc if needed.

  // Flower Gift: 1.5x Attack in Harsh Sunlight
  // Source: Showdown data/abilities.ts -- Flower Gift

  // Slow Start: halve Attack for the first 5 turns
  // Source: Showdown data/abilities.ts -- Slow Start
  if (isPhysical && ability === "slow-start" && attacker.volatileStatuses.has("slow-start")) {
    rawStat = Math.floor(rawStat / 2);
  }

  // Defeatist (NEW in Gen 5): halve Attack and SpAttack when HP <= 50%
  // Source: Bulbapedia -- Defeatist: "Halves the Pokemon's Attack and Sp. Atk stats
  //   when its HP drops to half or below."
  // Source: Showdown data/abilities.ts -- Defeatist
  if (ability === "defeatist") {
    const maxHp = attacker.pokemon.calculatedStats?.hp ?? attacker.pokemon.currentHp;
    if (attacker.pokemon.currentHp <= Math.floor(maxHp / 2)) {
      rawStat = Math.floor(rawStat / 2);
    }
  }

  // Apply stat stages (with Simple/Unaware adjustments)
  const statKey2 = isPhysical ? "attack" : "spAttack";
  const stage = getEffectiveStatStage(attacker, statKey2, defender);

  // On crit: ignore negative attack stages (use 0 instead), keep positive
  // Source: Showdown -- crit ignores negative attack stages
  const effectiveStage = isCrit && stage < 0 ? 0 : stage;

  const effective = Math.floor(rawStat * getStatStageMultiplier(effectiveStage));

  return Math.max(1, effective);
}

// ---- Defense Stat Calculation ----

/**
 * Get the effective defense stat for a move in Gen 5.
 *
 * Source: references/pokemon-showdown/sim/battle-actions.ts -- Gen 5 defense stat
 */
function getDefenseStat(
  defender: ActivePokemon,
  isPhysical: boolean,
  isCrit: boolean,
  weather: string | null,
  attacker?: ActivePokemon,
  ignoreDefenseStages?: boolean,
): number {
  const statKey = isPhysical ? "defense" : "spDefense";
  const stats = defender.pokemon.calculatedStats;
  let baseStat = stats ? stats[statKey] : 100;

  const defenderItem = defender.pokemon.heldItem;
  const defenderSpecies = defender.pokemon.speciesId;
  const defenderHasKlutz = defender.ability === "klutz";

  // Soul Dew: 1.5x SpDef for Latias (380) / Latios (381)
  // Source: Showdown sim/items.ts -- Soul Dew Gen 3-6 behavior
  if (
    !defenderHasKlutz &&
    !isPhysical &&
    defenderItem === "soul-dew" &&
    (defenderSpecies === 380 || defenderSpecies === 381)
  ) {
    baseStat = Math.floor((baseStat * 150) / 100);
  }

  // Deep Sea Scale: 2x SpDef for Clamperl (366)
  // Source: Showdown sim/items.ts -- Deep Sea Scale
  if (
    !defenderHasKlutz &&
    !isPhysical &&
    defenderItem === "deep-sea-scale" &&
    defenderSpecies === 366
  ) {
    baseStat = baseStat * 2;
  }

  // Eviolite (NEW in Gen 5): 1.5x Def and SpDef for not-fully-evolved Pokemon
  // This requires species data we don't have in the damage calc context,
  // so we check for an "eviolite-eligible" flag. For now, we implement the
  // simpler version: if holder has Eviolite, boost both defenses.
  // The engine is responsible for only attaching Eviolite to NFE Pokemon.
  // Source: Bulbapedia -- Eviolite: "Raises Defense and Sp. Def by 50% when held
  //   by a Pokemon that is not fully evolved."
  // Source: Showdown data/items.ts -- Eviolite onModifyDef / onModifySpD
  if (!defenderHasKlutz && defenderItem === "eviolite") {
    baseStat = Math.floor((baseStat * 150) / 100);
  }

  // Assault Vest: NO -- Assault Vest was introduced in Gen 6

  // Marvel Scale: 1.5x physical Defense when statused
  // Source: Showdown data/abilities.ts -- Marvel Scale
  const moldBreaker =
    attacker?.ability === "mold-breaker" ||
    attacker?.ability === "teravolt" ||
    attacker?.ability === "turboblaze";
  if (
    isPhysical &&
    !moldBreaker &&
    defender.ability === "marvel-scale" &&
    defender.pokemon.status !== null
  ) {
    baseStat = Math.floor(baseStat * 1.5);
  }

  // Sandstorm Rock SpDef boost: 1.5x SpDef for Rock-types in sandstorm
  // Source: Bulbapedia -- Sandstorm: "Rock-type Pokemon have their Special Defense
  //   raised by 50% during a sandstorm. (Generation IV+)"
  if (!isPhysical && weather === "sand" && defender.types.includes("rock")) {
    baseStat = Math.floor((baseStat * 150) / 100);
  }

  // Flower Gift: 1.5x SpDef in Harsh Sunlight
  // Source: Showdown data/abilities.ts -- Flower Gift
  if (!isPhysical && !moldBreaker && weather === "sun" && defender.ability === "flower-gift") {
    baseStat = Math.floor((baseStat * 150) / 100);
  }

  // Fur Coat (NEW in Gen 6 -- NOT Gen 5)

  // Stat stages
  const defStatKey = isPhysical ? "defense" : "spDefense";
  const stage = getEffectiveStatStage(defender, defStatKey, attacker);

  // Chip Away / Sacred Sword: ignore all defense stat stages
  // Source: Showdown data/moves.ts -- chipaway: { ignoreDefensive: true }
  // Source: Showdown data/moves.ts -- sacredsword: { ignoreDefensive: true, ignoreEvasion: true }
  // Source: Bulbapedia -- "Chip Away ignores the target's Defense and Special Defense
  //   stat stage changes."
  // On crit: ignore positive defense stages (use 0 instead), keep negative
  // Source: Showdown -- crit ignores positive def stages
  let effectiveStage: number;
  if (ignoreDefenseStages) {
    effectiveStage = 0;
  } else if (isCrit && stage > 0) {
    effectiveStage = 0;
  } else {
    effectiveStage = stage;
  }

  const effective = Math.floor(baseStat * getStatStageMultiplier(effectiveStage));

  return Math.max(1, effective);
}

// ---- Main Damage Formula ----

/**
 * Calculate damage for a move in Gen 5.
 *
 * Gen 5 (Black/White/Black2/White2) introduced the 4096-based modifier system
 * (pokeRound) for all damage modifiers. This replaces the integer multiply/divide
 * approach from earlier gens.
 *
 * Formula order follows Showdown's modifyDamage() (battle-actions.ts lines 1724-1838):
 *   1. Base formula: floor(floor((2*L/5+2) * Power * Atk / Def) / 50) + 2
 *   2. Spread modifier (doubles only): pokeRound(baseDamage, 3072) = 0.75x
 *   3. Weather modifier: pokeRound(baseDamage, 6144 or 2048) = 1.5x or 0.5x
 *   4. Critical hit: baseDamage * 2 (integer multiply, NOT pokeRound)
 *   5. Random factor: floor(baseDamage * (100 - random(0,15)) / 100) (integer math)
 *   6. STAB: pokeRound(baseDamage, 6144) = 1.5x, or 8192 for Adaptability = 2.0x
 *   7. Type effectiveness: integer multiply/divide
 *   8. Burn: pokeRound(baseDamage, 2048) = 0.5x (physical only, Gen 5 does NOT bypass for Facade)
 *   9. Gen 5 damage floor: if baseDamage === 0 after burn, set to 1
 *  10. Final modifier (Life Orb etc.): pokeRound(baseDamage, modifier)
 *  11. Minimum 1 damage (unless type immune)
 *
 * Source: references/pokemon-showdown/sim/battle-actions.ts lines 1718-1838
 * Source: references/pokemon-showdown/sim/battle.ts modify() method
 */
export function calculateGen5Damage(
  context: DamageContext,
  typeChart: Record<string, Record<string, number>>,
): DamageResult {
  const { attacker, defender, move, rng, isCrit } = context;

  // 1. Status moves / power=0 -> no damage
  // Source: Showdown sim/battle-actions.ts -- status moves skip damage calc
  if (move.category === "status" || move.power === null || move.power === 0) {
    return {
      damage: 0,
      effectiveness: 1,
      isCrit: false,
      randomFactor: 1,
    };
  }

  const level = attacker.pokemon.level;
  let power = move.power;
  const defenderAbility = defender.ability;
  const attackerAbility = attacker.ability;
  const weather = context.state.weather?.type ?? null;

  // Normalize: all moves become Normal type
  // Source: Showdown data/abilities.ts -- Normalize
  const effectiveMoveType: PokemonType = attackerAbility === "normalize" ? "normal" : move.type;

  // Klutz check
  const attackerHasKlutz = attackerAbility === "klutz";
  const attackerItem = attacker.pokemon.heldItem;

  // ---- Pre-damage base power modifications ----

  // SolarBeam half power in rain/sand/hail (NOT sun)
  // Source: Showdown -- SolarBeam power halved in non-sun weather
  if (
    move.id === "solar-beam" &&
    weather !== null &&
    weather !== "sun" &&
    weather !== "harsh-sun"
  ) {
    power = Math.floor(power / 2);
  }

  // Gem boost: 1.5x base power in Gen 5 (consumed before damage)
  // Source: references/pokemon-showdown/data/mods/gen5/conditions.ts gem condition -- chainModify(1.5)
  // Embargo suppresses all held item effects including gems
  // Source: Showdown data/moves.ts -- embargo: suppresses item use
  const attackerHasEmbargo = attacker.volatileStatuses.has("embargo");
  let gemConsumed = false;
  if (!attackerHasKlutz && !attackerHasEmbargo && attackerItem) {
    const gemType = GEM_ITEMS[attackerItem];
    if (gemType && gemType === effectiveMoveType) {
      power = Math.floor(power * 1.5);
      gemConsumed = true;
    }
  }

  // Type-boost items (Charcoal, etc.) and Plates: 4915/4096 base power
  // Source: Showdown data/items.ts -- onBasePower with chainModify([4915, 4096])
  if (!attackerHasKlutz && !gemConsumed && attackerItem) {
    const typeBoostItemType = TYPE_BOOST_ITEMS[attackerItem];
    const plateItemType = PLATE_ITEMS[attackerItem];
    if (typeBoostItemType === effectiveMoveType) {
      power = Math.floor((power * 4915) / 4096);
    }
    if (plateItemType === effectiveMoveType) {
      power = Math.floor((power * 4915) / 4096);
    }
  }

  // Pinch abilities: 1.5x power when HP <= floor(maxHP/3)
  // Source: Showdown -- pinch ability check
  const pinchType = PINCH_ABILITY_TYPES[attackerAbility];
  if (pinchType && effectiveMoveType === pinchType) {
    const maxHp = attacker.pokemon.calculatedStats?.hp ?? attacker.pokemon.currentHp;
    const threshold = Math.floor(maxHp / 3);
    if (attacker.pokemon.currentHp <= threshold) {
      power = Math.floor(power * 1.5);
    }
  }

  // Flash Fire volatile: 1.5x power for Fire moves
  // Source: Showdown data/abilities.ts -- Flash Fire
  if (effectiveMoveType === "fire" && attacker.volatileStatuses.has("flash-fire")) {
    power = Math.floor(power * 1.5);
  }

  // Dry Skin fire weakness: 1.25x base power for Fire moves against Dry Skin
  // Source: Showdown data/abilities.ts -- Dry Skin (priority 17)
  const moldBreaker =
    attackerAbility === "mold-breaker" ||
    attackerAbility === "teravolt" ||
    attackerAbility === "turboblaze";
  if (!moldBreaker && defenderAbility === "dry-skin" && effectiveMoveType === "fire") {
    power = Math.floor(power * 1.25);
  }

  // Technician: 1.5x power for moves with base power <= 60
  // Source: Showdown data/abilities.ts -- Technician (priority 30)
  if (attackerAbility === "technician" && power <= 60) {
    power = Math.floor(power * 1.5);
  }

  // Iron Fist: 1.2x power for punching moves
  // Source: Showdown data/abilities.ts -- Iron Fist
  if (attackerAbility === "iron-fist" && move.flags.punch) {
    power = Math.floor(power * 1.2);
  }

  // Reckless: 1.2x power for moves with recoil
  // Source: Showdown data/abilities.ts -- Reckless
  if (attackerAbility === "reckless" && hasRecoilEffect(move.effect)) {
    power = Math.floor(power * 1.2);
  }

  // Sheer Force (NEW in Gen 5): 1.3x (5325/4096) power for moves with secondary effects.
  // Secondary effects are suppressed by the ability handler; only the power boost is applied here.
  // Source: Showdown data/abilities.ts -- sheerforce: onBasePower chainModify([5325, 4096])
  // Source: Bulbapedia -- "Sheer Force raises the base power of moves... by 30%"
  if (attackerAbility === "sheer-force" && isSheerForceEligibleMove(move.effect, move.id)) {
    power = pokeRound(power, 5325);
  }

  // Venoshock (NEW in Gen 5): doubles power when target is poisoned or badly poisoned
  // Source: Showdown data/moves.ts -- venoshock:
  //   onBasePower(basePower, pokemon, target) {
  //     if (target.status === 'psn' || target.status === 'tox') return this.chainModify(2);
  //   }
  // Source: Bulbapedia -- "If the target is poisoned or badly poisoned, Venoshock's
  //   base power is doubled to 130."
  if (
    move.id === "venoshock" &&
    (defender.pokemon.status === "poison" || defender.pokemon.status === "badly-poisoned")
  ) {
    power = power * 2;
  }

  // Hex (NEW in Gen 5): doubles power when target has any primary status condition
  // Source: Showdown data/moves.ts -- hex:
  //   onBasePower(basePower, pokemon, target) {
  //     if (target.status || target.volatiles['comatose']) return this.chainModify(2);
  //   }
  // Source: Bulbapedia -- "If the target has a major status condition, Hex's base power
  //   doubles to 130." (Gen 5 base power is 50, so doubles to 100)
  if (move.id === "hex" && defender.pokemon.status !== null) {
    power = power * 2;
  }

  // Acrobatics (NEW in Gen 5): doubles power when holder has no item
  // Source: Showdown data/moves.ts -- Acrobatics basePowerCallback
  if (move.id === "acrobatics" && !attackerItem) {
    power = power * 2;
  }

  // Round (NEW in Gen 5): doubles power when an ally used Round earlier this turn
  // Source: Showdown data/moves.ts -- round.basePowerCallback:
  //   if (move.sourceEffect === 'round') return move.basePower * 2
  // In our architecture, we check the ally's lastMoveUsed + movedThisTurn flags.
  if (move.id === "round") {
    const attackerSideIndex = context.state.sides.findIndex((s) =>
      s.active.some((a) => a === attacker),
    );
    if (attackerSideIndex !== -1) {
      const side = context.state.sides[attackerSideIndex];
      if (side) {
        for (const active of side.active) {
          if (
            active &&
            active !== attacker &&
            active.lastMoveUsed === "round" &&
            active.movedThisTurn
          ) {
            power = power * 2;
            break;
          }
        }
      }
    }
  }

  // Rivalry: gender-dependent power modifier
  // Source: Showdown data/abilities.ts -- Rivalry
  if (attackerAbility === "rivalry") {
    const attackerGender = attacker.pokemon.gender;
    const defenderGender = defender.pokemon.gender;
    if (
      attackerGender &&
      defenderGender &&
      attackerGender !== "genderless" &&
      defenderGender !== "genderless"
    ) {
      if (attackerGender === defenderGender) {
        power = Math.floor(power * 1.25);
      } else {
        power = Math.floor(power * 0.75);
      }
    }
  }

  // Adamant Orb / Lustrous Orb / Griseous Orb (Gen 5 includes all three)
  // Source: Showdown data/items.ts
  if (!attackerHasKlutz && attackerItem) {
    if (
      attackerItem === "adamant-orb" &&
      attacker.pokemon.speciesId === 483 &&
      (effectiveMoveType === "dragon" || effectiveMoveType === "steel")
    ) {
      power = Math.floor((power * 4915) / 4096);
    }
    if (
      attackerItem === "lustrous-orb" &&
      attacker.pokemon.speciesId === 484 &&
      (effectiveMoveType === "water" || effectiveMoveType === "dragon")
    ) {
      power = Math.floor((power * 4915) / 4096);
    }
    if (
      attackerItem === "griseous-orb" &&
      attacker.pokemon.speciesId === 487 &&
      (effectiveMoveType === "ghost" || effectiveMoveType === "dragon")
    ) {
      power = Math.floor((power * 4915) / 4096);
    }
  }

  // ---- Ability type immunities ----

  const gravityActive = context.state.gravity?.active ?? false;
  const ironBallGrounded =
    defender.pokemon.heldItem === "iron-ball" && effectiveMoveType === "ground";

  if (!moldBreaker) {
    const immuneType = ABILITY_TYPE_IMMUNITIES[defenderAbility];
    if (immuneType && effectiveMoveType === immuneType) {
      const isLevitateGrounded =
        defenderAbility === "levitate" &&
        effectiveMoveType === "ground" &&
        (gravityActive || ironBallGrounded);
      if (!isLevitateGrounded) {
        return { damage: 0, effectiveness: 0, isCrit, randomFactor: 1 };
      }
    }
  }

  // Magnet Rise: Ground immunity (not ability-based, Mold Breaker does NOT bypass)
  // Source: Showdown -- Magnet Rise
  if (
    effectiveMoveType === "ground" &&
    defender.volatileStatuses.has("magnet-rise") &&
    !gravityActive &&
    !ironBallGrounded
  ) {
    return { damage: 0, effectiveness: 0, isCrit, randomFactor: 1 };
  }

  // ---- Physical/Special determination ----

  const isPhysical = move.category === "physical";

  // Get effective stats
  let attack = getAttackStat(attacker, effectiveMoveType, isPhysical, isCrit, defender);
  // Chip Away / Sacred Sword: ignore target's defense stat stages
  // Source: Showdown data/moves.ts -- chipaway/sacredsword: { ignoreDefensive: true }
  const IGNORE_DEFENSE_STAGE_MOVES: ReadonlySet<string> = new Set(["chip-away", "sacred-sword"]);
  const ignoreDefStages = IGNORE_DEFENSE_STAGE_MOVES.has(move.id);
  const defense = getDefenseStat(defender, isPhysical, isCrit, weather, attacker, ignoreDefStages);

  let abilityMultiplier = 1;

  // Thick Fat: halves the attacker's effective stat for fire/ice moves
  // Source: Showdown -- Thick Fat
  if (
    !moldBreaker &&
    defenderAbility === "thick-fat" &&
    (effectiveMoveType === "fire" || effectiveMoveType === "ice")
  ) {
    attack = Math.floor(attack / 2);
    abilityMultiplier = 0.5;
  }

  // Heatproof: halves fire damage
  // Source: Showdown data/abilities.ts -- Heatproof
  if (!moldBreaker && defenderAbility === "heatproof" && effectiveMoveType === "fire") {
    power = Math.floor(power / 2);
    abilityMultiplier *= 0.5;
  }

  // Explosion / Self-Destruct: halve defense (Gen 1-4 only; removed in Gen 5)
  // Source: Showdown -- Gen 5+ no longer halves defense for Explosion
  // NOT applied in Gen 5!

  // ---- Base formula ----

  // Source: references/pokemon-showdown/sim/battle-actions.ts line 1718
  // baseDamage = tr(tr(tr(tr(2 * level / 5 + 2) * basePower * attack) / defense) / 50)
  const levelFactor = Math.floor((2 * level) / 5) + 2;
  let baseDamage = Math.floor(Math.floor((levelFactor * power * attack) / defense) / 50);

  // +2 is added in modifyDamage, before spread/weather/crit
  // Source: references/pokemon-showdown/sim/battle-actions.ts line 1731
  baseDamage += 2;

  // ---- Modifier chain (modifyDamage order) ----

  // 2. Spread modifier (doubles only): pokeRound(baseDamage, 3072) = 0.75x
  // Source: references/pokemon-showdown/sim/battle-actions.ts line 1733-1737
  const isSpread =
    context.state.format !== "singles" &&
    (move.target === "all-adjacent-foes" ||
      move.target === "all-adjacent" ||
      move.target === "all-foes");
  if (isSpread) {
    baseDamage = pokeRound(baseDamage, 3072);
  }

  // 3. Weather modifier
  // Source: references/pokemon-showdown/sim/battle-actions.ts line 1746
  let weatherMod = 1;
  if (weather === "rain" || weather === "heavy-rain") {
    if (effectiveMoveType === "water") {
      baseDamage = pokeRound(baseDamage, 6144); // 1.5x
      weatherMod = 1.5;
    } else if (effectiveMoveType === "fire") {
      if (weather === "heavy-rain") {
        return { damage: 0, effectiveness: 0, isCrit, randomFactor: 1 };
      }
      baseDamage = pokeRound(baseDamage, 2048); // 0.5x
      weatherMod = 0.5;
    }
  } else if (weather === "sun" || weather === "harsh-sun") {
    if (effectiveMoveType === "fire") {
      baseDamage = pokeRound(baseDamage, 6144); // 1.5x
      weatherMod = 1.5;
    } else if (effectiveMoveType === "water") {
      if (weather === "harsh-sun") {
        return { damage: 0, effectiveness: 0, isCrit, randomFactor: 1 };
      }
      baseDamage = pokeRound(baseDamage, 2048); // 0.5x
      weatherMod = 0.5;
    }
  }

  const rawBaseDamage = baseDamage;

  // 4. Critical hit: baseDamage * 2 (integer multiply, NOT pokeRound)
  // Source: references/pokemon-showdown/sim/battle-actions.ts line 1751
  // Gen < 6 uses 2x: baseDamage * (move.critModifier || 2)
  let critMultiplier = 1;
  if (isCrit) {
    // Sniper: 3x crit multiplier instead of 2x
    // Source: Showdown data/abilities.ts -- Sniper
    critMultiplier = attackerAbility === "sniper" ? 3 : 2;
    baseDamage = baseDamage * critMultiplier;
  }

  // 5. Random factor: floor(baseDamage * (100 - random(0,15)) / 100)
  // Source: references/pokemon-showdown/sim/battle.ts randomizer()
  // random(16) gives 0-15, so range is 85-100
  const randomRoll = rng.int(85, 100);
  const randomFactor = randomRoll / 100;
  baseDamage = Math.floor((baseDamage * randomRoll) / 100);

  // 6. STAB via pokeRound
  // Source: references/pokemon-showdown/sim/battle-actions.ts line 1757-1793
  const stabMod = getStabModifier(
    effectiveMoveType,
    attacker.types,
    attackerAbility === "adaptability",
  );
  if (stabMod > 1) {
    // 1.5x STAB = 6144/4096; 2.0x Adaptability = 8192/4096
    const stabModifier4096 = Math.round(stabMod * 4096);
    baseDamage = pokeRound(baseDamage, stabModifier4096);
  }

  // 7. Type effectiveness
  // Source: references/pokemon-showdown/sim/battle-actions.ts lines 1795-1812
  // Gravity / Iron Ball: Ground moves ignore Flying-type immunity
  let effectiveDefenderTypes: readonly PokemonType[] = defender.types;
  if (
    (gravityActive || ironBallGrounded) &&
    effectiveMoveType === "ground" &&
    defender.types.includes("flying")
  ) {
    const nonFlyingTypes = defender.types.filter((t) => t !== "flying");
    effectiveDefenderTypes = nonFlyingTypes.length > 0 ? nonFlyingTypes : ["normal"];
  }
  let effectiveness = getTypeEffectiveness(
    effectiveMoveType,
    effectiveDefenderTypes,
    typeChart as TypeChart,
  );

  // Scrappy: Normal and Fighting hit Ghost
  // Source: Showdown data/abilities.ts -- Scrappy
  if (
    attackerAbility === "scrappy" &&
    effectiveness === 0 &&
    (effectiveMoveType === "normal" || effectiveMoveType === "fighting") &&
    defender.types.includes("ghost")
  ) {
    const nonGhostTypes = effectiveDefenderTypes.filter((t) => t !== "ghost");
    effectiveness =
      nonGhostTypes.length > 0
        ? getTypeEffectiveness(effectiveMoveType, nonGhostTypes, typeChart as TypeChart)
        : 1;
  }

  // If effectiveness === 0: type immunity -- return 0 damage
  if (effectiveness === 0) {
    return {
      damage: 0,
      effectiveness: 0,
      isCrit,
      randomFactor,
      breakdown: {
        baseDamage: rawBaseDamage,
        weatherMultiplier: weatherMod,
        critMultiplier: isCrit ? critMultiplier : 1,
        randomMultiplier: randomFactor,
        stabMultiplier: stabMod,
        typeMultiplier: 0,
        burnMultiplier: 1,
        abilityMultiplier,
        itemMultiplier: 1,
        otherMultiplier: 1,
        finalDamage: 0,
      },
    };
  }

  // Wonder Guard: only super-effective moves hit
  // Source: Showdown data/abilities.ts -- Wonder Guard
  if (!moldBreaker && defenderAbility === "wonder-guard" && effectiveness < 2) {
    return {
      damage: 0,
      effectiveness,
      isCrit,
      randomFactor,
      breakdown: {
        baseDamage: rawBaseDamage,
        weatherMultiplier: weatherMod,
        critMultiplier: isCrit ? critMultiplier : 1,
        randomMultiplier: randomFactor,
        stabMultiplier: stabMod,
        typeMultiplier: effectiveness,
        burnMultiplier: 1,
        abilityMultiplier: 0,
        itemMultiplier: 1,
        otherMultiplier: 1,
        finalDamage: 0,
      },
    };
  }

  // Apply type effectiveness as integer multiplication
  // Source: references/pokemon-showdown/sim/battle-actions.ts lines 1799-1811
  // Super effective: multiply by 2 for each factor
  // Not very effective: divide by 2 (floored) for each factor
  if (effectiveness > 1) {
    let typeMod = effectiveness;
    while (typeMod >= 2) {
      baseDamage = baseDamage * 2;
      typeMod /= 2;
    }
  } else if (effectiveness < 1 && effectiveness > 0) {
    let typeMod = effectiveness;
    while (typeMod <= 0.5) {
      baseDamage = Math.floor(baseDamage / 2);
      typeMod *= 2;
    }
  }

  // 8. Burn: pokeRound(baseDamage, 2048) = 0.5x for physical moves
  // Source: references/pokemon-showdown/sim/battle-actions.ts lines 1816-1820
  // Gen 5: burn penalty always applies for physical, even for Facade
  // (Facade bypass was added in Gen 6: `this.battle.gen < 6 || move.id !== 'facade'`)
  const hasBurn = isPhysical && attacker.pokemon.status === "burn";
  const gutsActive = attackerAbility === "guts" && attacker.pokemon.status !== null;
  const burnApplied = hasBurn && !gutsActive;
  const burnMultiplier = burnApplied ? 0.5 : 1;
  if (burnApplied) {
    baseDamage = pokeRound(baseDamage, 2048);
  }

  // Tinted Lens: double damage if not very effective
  // Source: Showdown data/abilities.ts -- Tinted Lens
  if (attackerAbility === "tinted-lens" && effectiveness < 1) {
    baseDamage = baseDamage * 2;
    abilityMultiplier *= 2;
  }

  // Filter / Solid Rock: 0.75x damage if super effective
  // Source: Showdown data/abilities.ts -- Filter / Solid Rock
  if (
    !moldBreaker &&
    (defenderAbility === "filter" || defenderAbility === "solid-rock") &&
    effectiveness > 1
  ) {
    baseDamage = pokeRound(baseDamage, 3072); // 0.75x
    abilityMultiplier *= 0.75;
  }

  // 9. Gen 5 damage floor: if baseDamage === 0, set to 1
  // Source: references/pokemon-showdown/sim/battle-actions.ts line 1823
  // if (this.battle.gen === 5 && !baseDamage) baseDamage = 1;
  if (!baseDamage) baseDamage = 1;

  // 10. Final modifier (Life Orb, Expert Belt, etc.)
  // Source: references/pokemon-showdown/sim/battle-actions.ts line 1826
  let itemMultiplier = 1;

  // Life Orb: pokeRound(baseDamage, 5324) ~= 1.3x
  // Source: Showdown data/items.ts -- Life Orb onModifyDamage
  if (!attackerHasKlutz && attackerItem === "life-orb") {
    baseDamage = pokeRound(baseDamage, 5324);
    itemMultiplier = 5324 / 4096;
  }

  // Expert Belt: 1.2x for super-effective moves
  // Source: Showdown data/items.ts -- Expert Belt
  if (!attackerHasKlutz && attackerItem === "expert-belt" && effectiveness > 1) {
    baseDamage = pokeRound(baseDamage, 4915); // ~1.2x
    itemMultiplier = 4915 / 4096;
  }

  // Muscle Band: 1.1x for physical moves
  // Source: Showdown data/items.ts -- Muscle Band
  if (!attackerHasKlutz && attackerItem === "muscle-band" && isPhysical) {
    baseDamage = pokeRound(baseDamage, 4505); // ~1.1x
    itemMultiplier = 4505 / 4096;
  }

  // Wise Glasses: 1.1x for special moves
  // Source: Showdown data/items.ts -- Wise Glasses
  if (!attackerHasKlutz && attackerItem === "wise-glasses" && !isPhysical) {
    baseDamage = pokeRound(baseDamage, 4505); // ~1.1x
    itemMultiplier = 4505 / 4096;
  }

  // Metronome item: consecutive use boost
  // Source: Showdown data/items.ts -- Metronome onModifyDamage
  if (!attackerHasKlutz && attackerItem === "metronome") {
    const metronomeState = attacker.volatileStatuses.get("metronome-count");
    if (metronomeState?.data?.count) {
      const boostSteps = Math.min((metronomeState.data.count as number) - 1, 5);
      if (boostSteps > 0) {
        const multiplier4096 = Math.round((1 + boostSteps * 0.2) * 4096);
        baseDamage = pokeRound(baseDamage, multiplier4096);
        itemMultiplier = 1 + boostSteps * 0.2;
      }
    }
  }

  // Type-resist berries: halve SE damage
  // Source: Showdown data/items.ts -- type-resist berries
  // (Will be fully implemented in items wave)

  // 11. Minimum 1 damage (unless type immune, which returns 0 above)
  // Source: Showdown sim/battle-actions.ts -- minimum 1 damage
  const finalDamage = Math.max(1, baseDamage);

  // Consume gem if activated; trigger Unburden if attacker has the ability
  // Source: Showdown data/abilities.ts -- Unburden: onAfterUseItem speed doubling
  if (gemConsumed) {
    attacker.pokemon.heldItem = null;
    if (attacker.ability === "unburden" && !attacker.volatileStatuses.has("unburden")) {
      attacker.volatileStatuses.set("unburden", { turnsLeft: -1 });
    }
    // Mark gem-used so onAfterHit item-theft checks (Thief/Covet) know the attacker
    // held an item that was consumed this move. Showdown uses source.volatiles['gem']
    // for exactly this guard. turnsLeft: 1 ensures the engine clears it at end-of-turn.
    // Source: Showdown data/moves.ts -- thief/covet: if (source.item || source.volatiles['gem']) return;
    attacker.volatileStatuses.set("gem-used" as import("@pokemon-lib-ts/core").VolatileStatus, {
      turnsLeft: 1,
    });
  }

  const breakdown: DamageBreakdown = {
    baseDamage: rawBaseDamage,
    weatherMultiplier: weatherMod,
    critMultiplier: isCrit ? critMultiplier : 1,
    randomMultiplier: randomFactor,
    stabMultiplier: stabMod,
    typeMultiplier: effectiveness,
    burnMultiplier,
    abilityMultiplier,
    itemMultiplier,
    otherMultiplier: 1,
    finalDamage,
  };

  return {
    damage: finalDamage,
    effectiveness,
    isCrit,
    randomFactor,
    breakdown,
  };
}
