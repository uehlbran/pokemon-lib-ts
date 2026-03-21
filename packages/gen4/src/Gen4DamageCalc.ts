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
  getWeatherDamageModifier,
} from "@pokemon-lib-ts/core";

// ─── Type-Boosting Items ────────────────────────────────────────────────────

/**
 * Type-boosting held items: ~1.2x (4915/4096) base power increase for moves
 * of the matching type. Applied via onBasePower in Showdown.
 *
 * Note: In Gen 3 (pret/pokeemerald), these were 110/100 applied to the attack stat.
 * In Gen 4+ (Showdown), they use chainModify([4915, 4096]) on base power instead.
 *
 * Source: Showdown data/items.ts — Charcoal, Mystic Water, etc. use
 *   onBasePower with chainModify([4915, 4096])
 * Source: Bulbapedia — Type-enhancing item (Generation IV)
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
 * Plate items introduced in Gen 4: ~1.2x (4915/4096) base power increase for moves
 * of the matching type. Same multiplier as type-boost items in Showdown.
 *
 * Source: Showdown data/items.ts — Flame Plate, etc. use onBasePower with
 *   chainModify([4915, 4096])
 * Source: Bulbapedia — Plate (item): "Boosts the power of the holder's
 *   [type]-type moves by 20%."
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
  // Pixie Plate (fairy) is NOT included — Fairy type was introduced in Gen 6
};

// ─── Pinch Ability Types ────────────────────────────────────────────────────

/**
 * Pinch abilities: boost move power by 1.5x when the user's HP is at or
 * below floor(maxHP/3) and the move type matches the ability's type.
 *
 * Source: Showdown sim/battle.ts — Gen 4 damage calc pinch ability check
 * Source: Bulbapedia — Overgrow / Blaze / Torrent / Swarm
 */
const PINCH_ABILITY_TYPES: Readonly<Record<string, string>> = {
  overgrow: "grass",
  blaze: "fire",
  torrent: "water",
  swarm: "bug",
};

// ─── Type-Resist Berries ─────────────────────────────────────────────────────

/**
 * Type-resist berries: halve super-effective damage of the matching type, then consumed.
 * All 16 type-resist berries were introduced in Gen 4.
 *
 * Source: Bulbapedia — type-resist berries (Occa, Passho, etc.)
 * Source: Showdown sim/items.ts — type-resist berries onSourceModifyDamage
 */
export const TYPE_RESIST_BERRIES: Readonly<Record<string, string>> = {
  "occa-berry": "fire",
  "passho-berry": "water",
  "wacan-berry": "electric",
  "rindo-berry": "grass",
  "yache-berry": "ice",
  "chople-berry": "fighting",
  "kebia-berry": "poison",
  "shuca-berry": "ground",
  "coba-berry": "flying",
  "payapa-berry": "psychic",
  "tanga-berry": "bug",
  "charti-berry": "rock",
  "kasib-berry": "ghost",
  "haban-berry": "dragon",
  "colbur-berry": "dark",
  "babiri-berry": "steel",
};

// ─── Ability Immunity Map ───────────────────────────────────────────────────

/**
 * Defender abilities that grant full type immunity to incoming moves.
 * Checked before the damage formula runs; returns 0 damage with effectiveness 0.
 *
 * Gen 4 additions vs Gen 3: Motor Drive (electric), Dry Skin (water).
 *
 * Source: Showdown sim/battle.ts — Gen 4 immunity abilities
 * Source: Bulbapedia — Motor Drive, Dry Skin
 */
// Note: Storm Drain is intentionally absent — in Gen 4 it only redirects Water moves
// in doubles, it does NOT grant water immunity or SpAtk boost. That was added in Gen 5.
// Source: Showdown Gen 4 mod references/pokemon-showdown/data/mods/gen4/abilities.ts —
//   stormDrain.onTryHit is empty (no immunity)
const ABILITY_TYPE_IMMUNITIES: Readonly<Record<string, string>> = {
  levitate: "ground",
  "volt-absorb": "electric",
  "water-absorb": "water",
  "flash-fire": "fire",
  "motor-drive": "electric",
  "dry-skin": "water",
};

// ─── Simple / Unaware Stat Stage Helper ───────────────────────────────────

/**
 * Get the effective stat stage for a Pokemon, accounting for Simple and Unaware.
 *
 * - Simple: doubles the effective stat stage (clamped to [-6, +6])
 * - Unaware (on opponent): ignores the Pokemon's stat stages (returns 0)
 *
 * Source: Showdown sim/battle.ts — Simple doubles stat stages in Gen 4
 * Source: Bulbapedia — Simple: "Doubles the effects of stat stage changes"
 * Source: Bulbapedia — Unaware: "Ignores stat stage changes of the opposing Pokemon
 *   when calculating damage"
 *
 * @param pokemon - The Pokemon whose stat stage is being read
 * @param stat - The stat key to read (attack, defense, spAttack, spDefense, speed, etc.)
 * @param opponent - The opposing Pokemon (for Unaware check)
 * @returns The effective stat stage after Simple/Unaware adjustments
 */
function getEffectiveStatStage(
  pokemon: ActivePokemon,
  stat: string,
  opponent?: ActivePokemon,
): number {
  // Unaware: opponent ignores this Pokemon's stat stages entirely.
  // Unaware takes priority over Simple — if the opponent has Unaware,
  // it sees 0 stages regardless of Simple doubling.
  // Source: Showdown Gen 4 — Unaware's onAnyModifyBoost sets boosts to 0,
  //   which runs independently of and overrides Simple's doubling
  if (opponent?.ability === "unaware") return 0;

  const raw = (pokemon.statStages as Record<string, number>)[stat] ?? 0;
  // Simple: double the stage, clamped to [-6, +6]
  // Source: Showdown Gen 4 — Simple doubles stat stage
  if (pokemon.ability === "simple") return Math.max(-6, Math.min(6, raw * 2));
  return raw;
}

// ─── Recoil Detection Helper ──────────────────────────────────────────────

/**
 * Check if a move effect includes recoil (for Reckless boost).
 * A move has recoil if its top-level effect is `type: "recoil"`, or if it's a
 * multi-effect with a recoil sub-effect.
 * Struggle has `effect: null` and is NOT boosted by Reckless.
 *
 * Source: Showdown data/abilities.ts — Reckless checks for recoil flag
 * Source: Bulbapedia — Reckless does not boost Struggle
 */
function hasRecoilEffect(effect: MoveEffect | null): boolean {
  if (!effect) return false;
  if (effect.type === "recoil") return true;
  if (effect.type === "multi") {
    return effect.effects.some((e) => e.type === "recoil");
  }
  return false;
}

// ─── Attack Stat Calculation ────────────────────────────────────────────────

/**
 * Get the effective attack stat for a move in Gen 4.
 *
 * Gen 4 is the first generation where the physical/special split is per-move,
 * not per-type. Physical moves use Attack; special moves use SpAttack.
 *
 * Modifier application order on the raw stat (before stat stages):
 *   1. Huge Power / Pure Power: Atk x2 (physical only)
 *   2-3. (Type-boost items and Plates moved to base power step in calculateGen4Damage)
 *   4. Choice Band (physical) / Choice Specs (special, NEW): 1.5x raw stat
 *   5. Species-specific items (Soul Dew, Deep Sea Tooth, Light Ball, Thick Club)
 *   6. Hustle: 1.5x physical attack
 *   7. Guts: 1.5x physical attack when statused
 *   8. Stat stages applied (crit: ignore negative attack stages)
 *
 * Source: Showdown sim/battle.ts — Gen 4 damage calc attack stat
 * Source: pret/pokeplatinum — damage formula attack stat calculation
 */
function getAttackStat(
  attacker: ActivePokemon,
  moveType: PokemonType,
  isPhysical: boolean,
  isCrit: boolean,
  defender?: ActivePokemon,
  weather?: string | null,
): number {
  const statKey = isPhysical ? "attack" : "spAttack";
  const stats = attacker.pokemon.calculatedStats;
  let rawStat = stats ? stats[statKey] : 100;

  const ability = attacker.ability;
  const attackerItem = attacker.pokemon.heldItem;
  const attackerSpecies = attacker.pokemon.speciesId;

  // Klutz: holder cannot use its held item — all item-based stat modifiers are suppressed
  // Source: Bulbapedia — Klutz: "The Pokemon can't use any held items"
  // Source: Showdown data/abilities.ts — Klutz gates item modifiers
  const attackerHasKlutz = ability === "klutz";

  // 1. Huge Power / Pure Power: doubles physical attack
  // Source: Showdown sim/battle.ts — Huge Power / Pure Power in Gen 4
  // Source: pret/pokeplatinum — same as Gen 3
  if (isPhysical && (ability === "huge-power" || ability === "pure-power")) {
    rawStat = rawStat * 2;
  }

  // 2–3. Type-boosting items and Plates: MOVED to base power step in calculateGen4Damage().
  // Source: Showdown data/items.ts — Charcoal, Silk Scarf, etc. use onBasePower with
  //   chainModify([4915, 4096]). Plates also use the same 4915/4096 modifier on onBasePower.
  // Previously these were here at (attack * 110/100) and (attack * 120/100) respectively,
  // which was both the wrong multiplier and the wrong application point.

  // 4. Choice Band: 1.5x physical attack (applied to raw stat)
  // Source: Showdown sim/battle.ts — Choice Band Gen 4
  // Source: pret/pokeplatinum — (150 * attack) / 100
  if (!attackerHasKlutz && isPhysical && attackerItem === "choice-band") {
    rawStat = Math.floor((150 * rawStat) / 100);
  }

  // 4a. Choice Specs (NEW in Gen 4): 1.5x special attack (applied to raw stat)
  // Source: Showdown sim/items.ts — Choice Specs
  // Source: Bulbapedia — Choice Specs: "Boosts Sp. Atk by 50%, but locks into one move."
  if (!attackerHasKlutz && !isPhysical && attackerItem === "choice-specs") {
    rawStat = Math.floor((150 * rawStat) / 100);
  }

  // 5. Species-specific held item boosts
  // Source: Showdown sim/battle.ts — Gen 4 species items

  // Soul Dew: 1.5x SpAtk for Latias (380) / Latios (381)
  // Source: Bulbapedia — Soul Dew: "Raises Latias's and Latios's Sp. Atk and Sp. Def by 50%."
  // Source: Showdown sim/items.ts — Soul Dew Gen 3-6 behavior
  if (
    !attackerHasKlutz &&
    !isPhysical &&
    attackerItem === "soul-dew" &&
    (attackerSpecies === 380 || attackerSpecies === 381)
  ) {
    rawStat = Math.floor((rawStat * 150) / 100);
  }

  // Deep Sea Tooth: 2x SpAtk for Clamperl (366)
  // Source: Bulbapedia — Deep Sea Tooth: "When held by Clamperl, doubles its Special Attack."
  // Source: Showdown sim/items.ts — Deep Sea Tooth
  if (
    !attackerHasKlutz &&
    !isPhysical &&
    attackerItem === "deep-sea-tooth" &&
    attackerSpecies === 366
  ) {
    rawStat = rawStat * 2;
  }

  // Light Ball: In Gen 4, Light Ball doubles BASE POWER (not attack stat) for Pikachu.
  // Showdown Gen 4 mod explicitly removes onModifyAtk/onModifySpA and replaces with onBasePower.
  // The base power doubling is applied in the base power section below, not here.
  // Source: Showdown Gen 4 mod references/pokemon-showdown/data/mods/gen4/items.ts —
  //   lightball: onModifyAtk() {}, onModifySpA() {},
  //   onBasePower(basePower, pokemon) { if Pikachu => chainModify(2) }

  // Thick Club: 2x Attack for Cubone (104) / Marowak (105)
  // Source: Bulbapedia — Thick Club: "When held by Cubone or Marowak, doubles Attack."
  // Source: Showdown sim/items.ts — Thick Club
  if (
    !attackerHasKlutz &&
    isPhysical &&
    attackerItem === "thick-club" &&
    (attackerSpecies === 104 || attackerSpecies === 105)
  ) {
    rawStat = rawStat * 2;
  }

  // 6. Hustle: 1.5x physical attack (accuracy penalty handled by doesMoveHit)
  // Source: Showdown sim/battle.ts — Hustle in Gen 4
  // Source: pret/pokeplatinum — (150 * attack) / 100
  if (isPhysical && ability === "hustle") {
    rawStat = Math.floor((150 * rawStat) / 100);
  }

  // 7. Guts: 1.5x physical attack when statused
  // Guts negates burn's damage penalty separately (see main formula)
  // Source: Showdown sim/battle.ts — Guts in Gen 4
  // Source: pret/pokeplatinum — (150 * attack) / 100
  if (isPhysical && ability === "guts" && attacker.pokemon.status !== null) {
    rawStat = Math.floor((150 * rawStat) / 100);
  }

  // 7a. Solar Power: 1.5x SpAtk in Harsh Sunlight
  // Source: Bulbapedia — Solar Power: "During harsh sunlight, the Pokemon's Special Attack
  //   stat is boosted by 50%."
  // Source: Showdown data/abilities.ts — Solar Power onModifySpAPriority
  if (!isPhysical && ability === "solar-power" && weather === "sun") {
    rawStat = Math.floor((rawStat * 150) / 100);
  }

  // 7b. Flower Gift: 1.5x Attack in Harsh Sunlight (for the user with the ability)
  // In singles, only the Pokemon with Flower Gift gets the boost.
  // Source: Bulbapedia — Flower Gift: "During harsh sunlight, the Attack and Special Defense
  //   stats of the Pokemon with this Ability and its allies are boosted by 50%."
  // Source: Showdown data/abilities.ts — Flower Gift onAllyModifyAtkPriority
  if (isPhysical && ability === "flower-gift" && weather === "sun") {
    rawStat = Math.floor((rawStat * 150) / 100);
  }

  // 7c. Slow Start: halve Attack for the first 5 turns after entering battle
  // Source: Bulbapedia — Slow Start: "Halves Attack and Speed for 5 turns upon entering battle."
  // Source: Showdown data/abilities.ts — Slow Start onModifyAtkPriority
  if (isPhysical && ability === "slow-start" && attacker.volatileStatuses.has("slow-start")) {
    rawStat = Math.floor(rawStat / 2);
  }

  // 8. Apply stat stages (with Simple/Unaware adjustments)
  // Source: Showdown sim/battle.ts — stat stage application
  // Source: pret/pokeplatinum — same APPLY_STAT_MOD as pokeemerald
  const statKey2 = isPhysical ? "attack" : "spAttack";
  const stage = getEffectiveStatStage(attacker, statKey2, defender);

  // On crit: ignore negative attack stages (use 0 instead), keep positive
  // Source: Showdown sim/battle.ts — crit ignores negative attack stages
  // Source: pret/pokeplatinum — same as pokeemerald
  const effectiveStage = isCrit && stage < 0 ? 0 : stage;

  const effective = Math.floor(rawStat * getStatStageMultiplier(effectiveStage));

  return Math.max(1, effective);
}

// ─── Defense Stat Calculation ───────────────────────────────────────────────

/**
 * Get the effective defense stat for a move in Gen 4.
 * Physical moves target Defense; special moves target SpDefense.
 *
 * On a critical hit:
 *   - Ignore POSITIVE defender defense stages (treat as stage 0)
 *   - Keep NEGATIVE defender defense stages
 *
 * New in Gen 4: Rock-type Pokemon receive a 1.5x SpDef boost during sandstorm.
 *
 * Source: Showdown sim/battle.ts — Gen 4 defense stat calculation
 * Source: pret/pokeplatinum — damage formula defense stat
 * Source: Bulbapedia — Sandstorm: "Rock-type Pokemon have their Special Defense
 *   raised by 50% during a sandstorm. (Generation IV+)"
 */
function getDefenseStat(
  defender: ActivePokemon,
  isPhysical: boolean,
  isCrit: boolean,
  weather: string | null,
  attacker?: ActivePokemon,
): number {
  const statKey = isPhysical ? "defense" : "spDefense";
  const stats = defender.pokemon.calculatedStats;
  let baseStat = stats ? stats[statKey] : 100;

  // Species-specific held item boosts on defense side
  const defenderItem = defender.pokemon.heldItem;
  const defenderSpecies = defender.pokemon.speciesId;

  // Klutz: holder cannot use its held item — all item-based stat modifiers are suppressed
  // Source: Bulbapedia — Klutz: "The Pokemon can't use any held items"
  // Source: Showdown data/abilities.ts — Klutz gates item modifiers
  const defenderHasKlutz = defender.ability === "klutz";

  // Soul Dew: 1.5x SpDef for Latias (380) / Latios (381)
  // Source: Bulbapedia — Soul Dew: "Raises Latias's and Latios's Sp. Atk and Sp. Def by 50%."
  // Source: Showdown sim/items.ts — Soul Dew Gen 3-6 behavior
  if (
    !defenderHasKlutz &&
    !isPhysical &&
    defenderItem === "soul-dew" &&
    (defenderSpecies === 380 || defenderSpecies === 381)
  ) {
    baseStat = Math.floor((baseStat * 150) / 100);
  }

  // Deep Sea Scale: 2x SpDef for Clamperl (366)
  // Source: Bulbapedia — Deep Sea Scale: "When held by Clamperl, doubles its Special Defense."
  // Source: Showdown sim/items.ts — Deep Sea Scale
  if (
    !defenderHasKlutz &&
    !isPhysical &&
    defenderItem === "deep-sea-scale" &&
    defenderSpecies === 366
  ) {
    baseStat = baseStat * 2;
  }

  // Marvel Scale: 1.5x physical Defense when defender has a non-volatile status condition
  // Note: Mold Breaker bypass is handled in the main damage calc function, not here,
  // because getDefenseStat doesn't have moldBreaker context. However, since the attacker
  // parameter is available, we check it directly.
  // Source: Bulbapedia — Marvel Scale: "If the Pokemon has a status condition, its Defense
  //   stat is 1.5x."
  // Source: Showdown sim/abilities.ts — Marvel Scale
  const marvelScaleMoldBreaker = attacker?.ability === "mold-breaker";
  if (
    isPhysical &&
    !marvelScaleMoldBreaker &&
    defender.ability === "marvel-scale" &&
    defender.pokemon.status !== null
  ) {
    baseStat = Math.floor(baseStat * 1.5);
  }

  // Sandstorm Rock SpDef boost (NEW in Gen 4): 1.5x SpDef for Rock-types in sandstorm
  // Source: Bulbapedia — Sandstorm: "Rock-type Pokemon have their Special Defense
  //   raised by 50% during a sandstorm."
  // Source: Showdown sim/battle.ts — Gen 4 sandstorm SpDef boost for Rock types
  if (!isPhysical && weather === "sand" && defender.types.includes("rock")) {
    baseStat = Math.floor((baseStat * 150) / 100);
  }

  // Flower Gift: 1.5x SpDef in Harsh Sunlight (for the defender with the ability)
  // In singles, only the Pokemon with Flower Gift gets the boost.
  // Mold Breaker (and Teravolt/Turboblaze) ignore the defender's ability, so no boost applies.
  // Source: Bulbapedia — Flower Gift: "During harsh sunlight, the Attack and Special Defense
  //   stats of the Pokemon with this Ability and its allies are boosted by 50%."
  // Source: Bulbapedia — Mold Breaker: ignores ability effects on the opposing Pokemon
  // Source: Showdown data/abilities.ts — Flower Gift onAllyModifySpDPriority
  // Only Mold Breaker exists in Gen 4; Teravolt/Turboblaze are Gen 5+ (Zekrom/Reshiram).
  // Source: Bulbapedia — Teravolt (Gen V, Zekrom), Turboblaze (Gen V, Reshiram)
  const flowerGiftMoldBreaker = attacker?.ability === "mold-breaker";
  if (
    !isPhysical &&
    !flowerGiftMoldBreaker &&
    weather === "sun" &&
    defender.ability === "flower-gift"
  ) {
    baseStat = Math.floor((baseStat * 150) / 100);
  }

  // Get the appropriate stat stage (with Simple/Unaware adjustments)
  const defStatKey = isPhysical ? "defense" : "spDefense";
  const stage = getEffectiveStatStage(defender, defStatKey, attacker);

  // On crit: ignore positive defense stages (use 0 instead), keep negative
  // Source: Showdown sim/battle.ts — crit ignores positive def stages
  // Source: pret/pokeplatinum — same behavior as pokeemerald
  const effectiveStage = isCrit && stage > 0 ? 0 : stage;

  const effective = Math.floor(baseStat * getStatStageMultiplier(effectiveStage));

  return Math.max(1, effective);
}

// ─── Main Damage Formula ────────────────────────────────────────────────────

/**
 * Calculate damage for a move in Gen 4.
 *
 * Gen 4 (Diamond/Pearl/Platinum/HeartGold/SoulSilver) introduced the physical/special
 * split, where each move has its own category instead of being determined by type.
 *
 * Formula order (Showdown Gen 4 damage calc):
 *   1. Status moves / power=0: return 0
 *   1b. Type-boost items + Plates: 4915/4096 base power (onBasePower, priority 15)
 *   2. Pinch abilities (overgrow/blaze/torrent/swarm): 1.5x power (priority 2)
 *   3. Dry Skin fire weakness: 1.25x base power for Fire moves (onSourceBasePower, priority 17)
 *   4. Technician: 1.5x power for moves with base power <= 60 (onBasePower, priority 30)
 *   5. Defender ability immunities (levitate, volt-absorb, etc.)
 *   5. Physical/Special determination (per-move, NOT per-type)
 *   6. Thick Fat: halve attack stat for fire/ice moves
 *   7. Explosion/Self-Destruct: halve defense
 *   8. Base formula: floor(floor((2*L/5+2) * Power * Atk / Def) / 50)
 *   9. Burn: floor(baseDamage / 2) if physical + burned + NOT Guts
 *  10. Weather modifier
 *  11. baseDamage += 2
 *  12. Crit: baseDamage * critMultiplier (2.0, or 3.0 with Sniper)
 *  13. Random: floor(baseDamage * rng(85,100) / 100)
 *  14. STAB (with Adaptability support)
 *  15. Type effectiveness
 *  16. Wonder Guard check
 *  17. Apply effectiveness
 *  18. Tinted Lens: double damage if not very effective
 *  19. Filter/Solid Rock: 0.75x if super effective
 *  20. Item damage modifiers (Life Orb, Expert Belt, Muscle Band, Wise Glasses)
 *  21. Minimum 1 damage
 *
 * Source: Showdown sim/battle.ts — Gen 4 damage calc
 * Source: pret/pokeplatinum — damage formula (where decompiled)
 */
export function calculateGen4Damage(context: DamageContext, typeChart: TypeChart): DamageResult {
  const { attacker, defender, move, rng, isCrit } = context;

  // 1. Status moves / power=0 → no damage
  // Source: Showdown sim/battle.ts — status moves skip damage calc
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

  // SolarBeam half power in rain/sand/hail (NOT sun or harsh-sun)
  // In sun/harsh-sun, SolarBeam skips the charge turn and fires at full 120 base power.
  // In rain, sand, or hail, SolarBeam's base power is halved (120 -> 60).
  // Source: Showdown sim/battle-actions.ts — SolarBeam power halved in non-sun weather
  // Source: Bulbapedia — Solar Beam: "Has its base power halved in all weather
  //   conditions aside from harsh sunlight."
  if (
    move.id === "solar-beam" &&
    weather !== null &&
    weather !== "sun" &&
    weather !== "harsh-sun"
  ) {
    power = Math.floor(power / 2);
  }

  // Normalize: all moves used by the Pokemon become Normal type, EXCEPT Struggle.
  // Struggle is typeless ("???") in Gen 4 and Normalize must not affect it.
  // Source: Showdown Gen 4 mod references/pokemon-showdown/data/mods/gen4/abilities.ts —
  //   normalize.onModifyMove: if (move.id !== 'struggle') move.type = 'Normal'
  // Source: Bulbapedia — Normalize: "All the Pokemon's moves become Normal-type."
  const effectiveMoveType: PokemonType =
    attackerAbility === "normalize" && move.id !== "struggle" ? "normal" : move.type;

  // Klutz: holder cannot use its held item — suppresses all held-item modifiers
  // Source: Bulbapedia — Klutz: "The Pokemon can't use any held items"
  const attackerHasKlutz = attackerAbility === "klutz";

  // Type-boost items (Charcoal, Mystic Water, etc.) and Plates (Flame Plate, etc.):
  // Both apply ~1.2x to BASE POWER (not attack stat).
  // Both use the same multiplier: 4915/4096 (~1.1999...).
  // Source: Showdown data/items.ts — Charcoal, Silk Scarf, etc. use onBasePower with
  //   chainModify([4915, 4096]). Plates also use chainModify([4915, 4096]).
  // Source: Showdown data/items.ts — onBasePowerPriority: 15 (runs before Technician at 30)
  const typeBoostItemType = TYPE_BOOST_ITEMS[attacker.pokemon.heldItem ?? ""];
  const plateItemType = PLATE_ITEMS[attacker.pokemon.heldItem ?? ""];
  if (!attackerHasKlutz && typeBoostItemType === effectiveMoveType) {
    power = Math.floor((power * 4915) / 4096);
  }
  if (!attackerHasKlutz && plateItemType === effectiveMoveType) {
    power = Math.floor((power * 4915) / 4096);
  }

  // 1c. Muscle Band (physical) / Wise Glasses (special): ~1.1x base power.
  // Applied to base power via onBasePower (priority 16), same as type-boost items.
  // Exact multiplier: 4505/4096 (~1.0998x), NOT 1.1x.
  // Source: Showdown data/items.ts lines 4240-4244 — Muscle Band onBasePower chainModify([4505, 4096])
  // Source: Showdown data/items.ts lines 7755-7759 — Wise Glasses onBasePower chainModify([4505, 4096])
  if (
    !attackerHasKlutz &&
    attacker.pokemon.heldItem === "muscle-band" &&
    move.category === "physical"
  ) {
    power = Math.floor((power * 4505) / 4096);
  }
  if (
    !attackerHasKlutz &&
    attacker.pokemon.heldItem === "wise-glasses" &&
    move.category === "special"
  ) {
    power = Math.floor((power * 4505) / 4096);
  }

  // Mold Breaker: attacker's ability bypasses defender's defensive abilities
  // Source: Showdown Gen 4 — Mold Breaker negates defender abilities in damage calc
  // Source: Bulbapedia — Mold Breaker: "Moves used by the Pokemon with this Ability
  //   are unaffected by the target's Ability."
  const moldBreaker = attackerAbility === "mold-breaker";

  // 2. Pinch abilities: 1.5x power when HP <= floor(maxHP/3) and type matches
  // Source: Showdown sim/battle.ts — Gen 4 pinch ability check
  // Source: Bulbapedia — Overgrow / Blaze / Torrent / Swarm
  const pinchType = PINCH_ABILITY_TYPES[attackerAbility];
  if (pinchType && effectiveMoveType === pinchType) {
    const maxHp = attacker.pokemon.calculatedStats?.hp ?? attacker.pokemon.currentHp;
    const threshold = Math.floor(maxHp / 3);
    if (attacker.pokemon.currentHp <= threshold) {
      power = Math.floor(power * 1.5);
    }
  }

  // 2a. Flash Fire volatile: 1.5x damage modifier for Fire moves when flash-fire volatile is active.
  // In Gen 4, Flash Fire is applied via onModifyDamagePhase1 (a post-formula modifier),
  // NOT to base power. Handled below in the ModifyDamagePhase1 section (after burn).
  // Source: Showdown data/mods/gen4/abilities.ts line 135 — Flash Fire onModifyDamagePhase1
  const flashFireActive =
    effectiveMoveType === "fire" && attacker.volatileStatuses.has("flash-fire");

  // 3. Dry Skin fire weakness: 1.25x base power for Fire moves against Dry Skin defenders.
  // Showdown processes onSourceBasePower callbacks by priority (ascending = runs first).
  // Dry Skin has priority 17; Technician has priority 30 — so Dry Skin runs first.
  // This matters for fire moves with base power 49-60: Dry Skin can push them above 60
  // before Technician checks, preventing Technician from activating.
  // Dry Skin's water immunity is handled in step 5 (early return of 0 damage).
  // Source: Showdown data/abilities.ts — Dry Skin onSourceBasePower (priority 17)
  // Source: Bulbapedia — Dry Skin: "Fire-type moves deal 1.25× damage to the user."
  if (!moldBreaker && defenderAbility === "dry-skin" && effectiveMoveType === "fire") {
    power = Math.floor(power * 1.25);
  }

  // 4. Technician (NEW in Gen 4): 1.5x power for moves with base power <= 60.
  // Technician checks power AFTER Dry Skin's fire modifier (priority 30 > 17),
  // so a 60-power fire move vs Dry Skin becomes 75 base power → Technician inactive.
  // Source: Bulbapedia — Technician: "Moves with a base power of 60 or less are
  //   boosted in power by 50%."
  // Source: Showdown data/abilities.ts — Technician onBasePower (priority 30)
  if (attackerAbility === "technician" && power <= 60) {
    power = Math.floor(power * 1.5);
  }

  // 4b. Iron Fist (NEW in Gen 4): 1.2x power for punching moves (flags.punch).
  // Source: Bulbapedia — Iron Fist: "Boosts the power of punching moves by 20%."
  // Source: Showdown data/abilities.ts — Iron Fist onBasePower
  if (attackerAbility === "iron-fist" && move.flags.punch) {
    power = Math.floor(power * 1.2);
  }

  // 4c. Reckless (NEW in Gen 4): 1.2x power for moves with recoil.
  // Does NOT boost Struggle (Struggle has effect: null).
  // Source: Bulbapedia — Reckless: "Boosts the base power of moves which have recoil damage."
  // Source: Showdown data/abilities.ts — Reckless onBasePower
  if (attackerAbility === "reckless" && hasRecoilEffect(move.effect)) {
    power = Math.floor(power * 1.2);
  }

  // 4d. Rivalry (NEW in Gen 4): gender-dependent power modifier.
  // Same gender as target: 1.25x power; opposite gender: 0.75x; either genderless: no change.
  // Source: Bulbapedia — Rivalry: "Raises the base power of moves by 25% if the
  //   target is the same gender, lowers by 25% if the target is the opposite gender."
  // Source: Showdown data/abilities.ts — Rivalry onBasePower
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

  // 4e. Adamant Orb: 1.2x base power for Dialga's Dragon/Steel moves (NEW in Gen 4)
  // Lustrous Orb: 1.2x base power for Palkia's Water/Dragon moves (NEW in Gen 4)
  // Klutz suppresses held item effects
  // Source: Showdown data/items.ts — Adamant Orb / Lustrous Orb onBasePower: basePower * 0x1333 / 0x1000
  // Source: Bulbapedia — Adamant Orb boosts Dialga's Dragon/Steel moves by 20%
  // Source: Bulbapedia — Lustrous Orb boosts Palkia's Water/Dragon moves by 20%
  const attackerHasKlutzPower = attackerAbility === "klutz";
  const attackerItemPower = attacker.pokemon.heldItem;
  const attackerSpeciesIdPower = attacker.pokemon.speciesId;
  if (
    !attackerHasKlutzPower &&
    attackerItemPower === "adamant-orb" &&
    attackerSpeciesIdPower === 483 && // Dialga
    (effectiveMoveType === "dragon" || effectiveMoveType === "steel")
  ) {
    power = Math.floor((power * 4915) / 4096);
  }
  if (
    !attackerHasKlutzPower &&
    attackerItemPower === "lustrous-orb" &&
    attackerSpeciesIdPower === 484 && // Palkia
    (effectiveMoveType === "water" || effectiveMoveType === "dragon")
  ) {
    power = Math.floor((power * 4915) / 4096);
  }
  // Griseous Orb: 1.2x base power for Giratina (487) on Ghost/Dragon moves
  // Source: Showdown Gen 4 mod references/pokemon-showdown/data/mods/gen4/items.ts —
  //   griseousorb.onBasePower: user.species.num === 487 && (Ghost || Dragon) => chainModify(1.2)
  // Source: Bulbapedia — Griseous Orb: boosts Giratina's Ghost/Dragon moves by 20%
  if (
    !attackerHasKlutzPower &&
    attackerItemPower === "griseous-orb" &&
    attackerSpeciesIdPower === 487 && // Giratina
    (effectiveMoveType === "ghost" || effectiveMoveType === "dragon")
  ) {
    power = Math.floor((power * 4915) / 4096);
  }
  // Light Ball: 2x base power for Pikachu (speciesId 25) on ALL moves
  // In Gen 4, Light Ball doubles base power (onBasePower), not the attack stat.
  // Source: Showdown Gen 4 mod references/pokemon-showdown/data/mods/gen4/items.ts —
  //   lightball: onBasePower(basePower, pokemon) { if Pikachu => chainModify(2) }
  if (
    !attackerHasKlutzPower &&
    attackerItemPower === "light-ball" &&
    attackerSpeciesIdPower === 25 // Pikachu
  ) {
    power = power * 2;
  }

  // 4. Defender ability type immunities
  // Mold Breaker bypasses all defender ability-based immunities
  // Source: Showdown sim/battle.ts — Gen 4 ability immunities
  // Source: Showdown Gen 4 — Mold Breaker negates Levitate, Volt Absorb, Water Absorb, etc.
  const gravityActive = context.state.gravity?.active ?? false;
  // Iron Ball grounds the holder — removes Ground immunity from Flying type and Levitate
  // Source: Showdown data/items.ts — Iron Ball onImmunity removes Ground immunity
  // Source: Bulbapedia — Iron Ball: "makes the holder grounded"
  const ironBallGrounded =
    defender.pokemon.heldItem === "iron-ball" && effectiveMoveType === "ground";
  if (!moldBreaker) {
    const immuneType = ABILITY_TYPE_IMMUNITIES[defenderAbility];
    if (immuneType && effectiveMoveType === immuneType) {
      // Gravity or Iron Ball grounds all Pokemon — Levitate no longer grants Ground immunity
      // Source: Showdown Gen 4 mod — Gravity suppresses Levitate
      // Source: Bulbapedia — Gravity: "Levitate will not give immunity to Ground-type moves."
      const isLevitateGrounded =
        defenderAbility === "levitate" &&
        effectiveMoveType === "ground" &&
        (gravityActive || ironBallGrounded);
      if (!isLevitateGrounded) {
        return { damage: 0, effectiveness: 0, isCrit, randomFactor: 1 };
      }
    }
  }

  // 4b. Magnet Rise: grants Ground immunity to the holder for 5 turns.
  // NOT an ability — Mold Breaker does NOT bypass Magnet Rise.
  // Gravity suppresses Magnet Rise (grounded Pokemon lose the levitation).
  // Iron Ball also grounds the holder, suppressing Magnet Rise.
  // Source: Showdown Gen 4 mod — Magnet Rise grants Ground immunity (not ability-based)
  // Source: Bulbapedia — Magnet Rise: "The user levitates using electrically generated
  //   magnetism for five turns."
  if (
    effectiveMoveType === "ground" &&
    defender.volatileStatuses.has("magnet-rise") &&
    !gravityActive &&
    !ironBallGrounded
  ) {
    return { damage: 0, effectiveness: 0, isCrit, randomFactor: 1 };
  }

  // 5. Physical/Special determination — THE key Gen 4 change
  // In Gen 4, category is per-move, NOT per-type (unlike Gen 1-3).
  // Source: Bulbapedia — Physical/special split: "Starting in Generation IV,
  //   each individual move has its own damage category."
  const isPhysical = move.category === "physical";

  const attackerItem = attacker.pokemon.heldItem;

  // Get effective stats (pass opponent for Simple/Unaware stat stage adjustments)
  let attack = getAttackStat(attacker, effectiveMoveType, isPhysical, isCrit, defender, weather);
  let defense = getDefenseStat(defender, isPhysical, isCrit, weather, attacker);

  // Track multipliers for breakdown
  let abilityMultiplier = 1;

  // 6. Thick Fat: halves base power for fire/ice moves (Gen 4 uses onSourceBasePower)
  // Mold Breaker bypasses Thick Fat
  // Source: Showdown data/mods/gen4/abilities.ts lines 502-512 — Thick Fat onSourceBasePower
  //   chainModify(0.5) on base power for Ice/Fire moves
  // Source: Bulbapedia — Thick Fat: "Fire-type and Ice-type moves deal half damage."
  if (
    !moldBreaker &&
    defenderAbility === "thick-fat" &&
    (effectiveMoveType === "fire" || effectiveMoveType === "ice")
  ) {
    power = Math.floor(power / 2);
    abilityMultiplier = 0.5;
  }

  // 6a. Heatproof: halves the attacker's effective Atk/SpAtk for fire moves
  // Mold Breaker bypasses Heatproof
  // Source: Showdown data/abilities.ts lines 1776-1790 — Heatproof onSourceModifyAtk/onSourceModifySpA
  //   chainModify(0.5) on attacker's offensive stat for Fire moves
  // Source: Bulbapedia — Heatproof: "Halves the damage from Fire-type moves."
  if (!moldBreaker && defenderAbility === "heatproof" && effectiveMoveType === "fire") {
    attack = Math.floor(attack / 2);
    abilityMultiplier *= 0.5;
  }

  // 7. Explosion / Self-Destruct: halve defense
  // Source: Showdown sim/battle.ts — Gen 4 Explosion/Self-Destruct halve defense
  // Source: Bulbapedia — Explosion: "Halves the target's Defense stat during damage
  //   calculation. (Generations I-IV)"
  if (move.id === "explosion" || move.id === "self-destruct") {
    defense = Math.max(1, Math.floor(defense / 2));
  }

  // 8. Base formula: floor(floor((2*L/5+2) * Power * Atk / Def) / 50)
  // Source: Showdown sim/battle.ts — Gen 4 base damage formula
  // Source: pret/pokeplatinum — same base formula as Gen 3
  const levelFactor = Math.floor((2 * level) / 5) + 2;
  let baseDamage = Math.floor(Math.floor((levelFactor * power * attack) / defense) / 50);

  // 9. Burn halving: applied after the base formula, before +2
  // Physical moves deal half damage when the attacker is burned, UNLESS the
  // attacker has Guts (which negates the burn penalty).
  // Source: Showdown sim/battle.ts — Gen 4 burn halving
  // Source: pret/pokeplatinum — same as pokeemerald: damage /= 2
  const hasBurn = isPhysical && attacker.pokemon.status === "burn";
  const gutsActive = attackerAbility === "guts" && attacker.pokemon.status !== null;
  const burnApplied = hasBurn && !gutsActive;
  if (burnApplied) {
    baseDamage = Math.floor(baseDamage / 2);
  }

  // --- ModifyDamagePhase1: Flash Fire, Reflect/Light Screen ---
  // These modifiers run after burn but before weather/+2/crit.
  // Source: Showdown data/mods/gen4/scripts.ts — ModifyDamagePhase1 slot

  // Flash Fire: 1.5x damage modifier for Fire moves (ModifyDamagePhase1)
  // Source: Showdown data/mods/gen4/abilities.ts line 135 — Flash Fire onModifyDamagePhase1
  if (flashFireActive) {
    baseDamage = Math.floor(baseDamage * 1.5);
    abilityMultiplier *= 1.5;
  }

  // Reflect / Light Screen: halve damage in singles (ModifyDamagePhase1)
  // Conditions: screen must be active on defender's side, not a crit, not Brick Break.
  // Source: pret/pokeplatinum battle_lib.c lines 6982-6991 (Reflect) and 7023-7032 (Light Screen)
  // Source: Showdown data/mods/gen4/scripts.ts — Reflect/LightScreen in ModifyDamagePhase1
  const sides = context.state.sides;
  if (sides && !isCrit && move.id !== "brick-break") {
    const defenderSideIndex = sides[0]?.active?.includes(defender) ? 0 : 1;
    const defenderSide = sides[defenderSideIndex];
    if (defenderSide?.screens) {
      const hasReflect =
        isPhysical && defenderSide.screens.some((s: { type: string }) => s.type === "reflect");
      const hasLightScreen =
        !isPhysical &&
        defenderSide.screens.some((s: { type: string }) => s.type === "light-screen");
      if (hasReflect || hasLightScreen) {
        baseDamage = Math.floor(baseDamage / 2);
      }
    }
  }

  // 10. Weather modifier (applied BEFORE +2)
  // Source: Showdown data/mods/gen4/scripts.ts lines 56-58 — weather runs before +2
  // Source: pret/pokeplatinum battle_lib.c — weather modifier in damage calc
  // Rain: Water 1.5x, Fire 0.5x; Sun: Fire 1.5x, Water 0.5x
  const weatherMod = getWeatherDamageModifier(effectiveMoveType, weather);
  if (weatherMod !== 1) {
    baseDamage = Math.floor(baseDamage * weatherMod);
  }

  // 11. Add 2 (AFTER weather — matches Showdown Gen 4 order)
  // Source: Showdown data/mods/gen4/scripts.ts lines 56-58 — baseDamage += 2 after weather
  baseDamage += 2;

  // Record the base damage before post-formula modifiers for breakdown
  const rawBaseDamage = baseDamage;

  // --- Post-formula modifiers ---

  // Track item multiplier for breakdown (used across Phase 2 and final modifier sections)
  let itemMultiplier = 1;

  // 12. Critical hit multiplier
  // Gen 4: 2.0x normally, 3.0x with Sniper (NEW ability in Gen 4)
  // Source: Bulbapedia — Sniper: "Powers up moves if they become critical hits.
  //   Critical hits do 3x damage instead of 2x."
  // Source: Showdown sim/abilities.ts — Sniper
  let critMultiplier = 1;
  if (isCrit) {
    critMultiplier = attackerAbility === "sniper" ? 3 : 2;
    baseDamage = baseDamage * critMultiplier;
  }

  // 12a. Life Orb: 1.3x damage (Phase 2 — after crit, before random/STAB/types)
  // Recoil is handled separately by the engine.
  // Source: Showdown data/mods/gen4/items.ts lines 228-240 — Life Orb onModifyDamagePhase2
  //   (onModifyDamage is nulled out; only onModifyDamagePhase2 fires in Gen 4)
  // Source: Bulbapedia — Life Orb: "Boosts the power of moves by 30%."
  if (!attackerHasKlutz && attackerItem === "life-orb") {
    baseDamage = Math.floor(baseDamage * 1.3);
    itemMultiplier = 1.3;
  }

  // 12b. Metronome item: consecutive use of the same move boosts damage (Phase 2).
  // Each consecutive use adds 0.2x: 1.0x (first use), 1.2x, 1.4x, 1.6x, 1.8x, 2.0x (caps at 2.0x)
  // The consecutive count is tracked via the "metronome-count" volatile's data.count field.
  // Source: Showdown data/mods/gen4/items.ts line 326 — Metronome onModifyDamagePhase2
  // Source: Bulbapedia — Metronome (item): "Boosts the power of moves used
  //   consecutively. +20% per consecutive use, up to 100% (2.0x)."
  if (!attackerHasKlutz && attackerItem === "metronome") {
    const metronomeState = attacker.volatileStatuses.get("metronome-count");
    if (metronomeState?.data?.count) {
      const boostSteps = Math.min((metronomeState.data.count as number) - 1, 5);
      if (boostSteps > 0) {
        const multiplier = 1 + boostSteps * 0.2;
        baseDamage = Math.floor(baseDamage * multiplier);
        itemMultiplier = multiplier;
      }
    }
  }

  // 13. Random factor: integer from 85 to 100 inclusive, divided by 100
  // Source: Showdown sim/battle.ts — Gen 4 random damage roll
  // Source: pret/pokeplatinum — RandomPercentage range 85-100
  const randomRoll = rng.int(85, 100);
  const randomFactor = randomRoll / 100;
  baseDamage = Math.floor(baseDamage * randomFactor);

  // 14. STAB (Same Type Attack Bonus)
  // Gen 4 introduced Adaptability: STAB is 2.0x instead of 1.5x.
  // Source: Bulbapedia — Adaptability: "Increases the same-type attack bonus from
  //   1.5x to 2x."
  // Source: Showdown sim/abilities.ts — Adaptability
  const stabMod = getStabModifier(
    effectiveMoveType,
    attacker.types,
    attackerAbility === "adaptability",
  );
  if (stabMod > 1) {
    baseDamage = Math.floor(baseDamage * stabMod);
  }

  // 15. Type effectiveness
  // Source: Showdown sim/battle.ts — Gen 4 type effectiveness
  // Gravity / Iron Ball: Ground moves ignore Flying-type immunity
  // Source: Showdown Gen 4 mod — Gravity makes Ground moves hit Flying-types
  // Source: Bulbapedia — Gravity: "All Pokémon on the ground are no longer immune to
  //   Ground-type moves because of their Flying type."
  // Source: Bulbapedia — Iron Ball: "makes the holder grounded"
  let effectiveDefenderTypes: readonly PokemonType[] = defender.types;
  if (
    (gravityActive || ironBallGrounded) &&
    effectiveMoveType === "ground" &&
    defender.types.includes("flying")
  ) {
    // Remove Flying from the defender's types for effectiveness calculation
    // so Ground moves can hit. If the defender is pure Flying, treat as Normal.
    const nonFlyingTypes = defender.types.filter((t) => t !== "flying");
    effectiveDefenderTypes = nonFlyingTypes.length > 0 ? nonFlyingTypes : ["normal"];
  }
  let effectiveness = getTypeEffectiveness(effectiveMoveType, effectiveDefenderTypes, typeChart);

  // Scrappy: Normal-type and Fighting-type moves used by a Pokemon with Scrappy
  // hit Ghost-type Pokemon for neutral damage (instead of being immune).
  // Source: Bulbapedia — Scrappy: "Allows the Pokemon's Normal- and Fighting-type moves
  //   to hit Ghost-type Pokemon."
  // Source: Showdown data/abilities.ts — Scrappy onModifyMovePriority
  if (
    attackerAbility === "scrappy" &&
    effectiveness === 0 &&
    (effectiveMoveType === "normal" || effectiveMoveType === "fighting") &&
    defender.types.includes("ghost")
  ) {
    // Recalculate effectiveness treating Ghost as neutral to Normal/Fighting.
    // Remove Ghost from defender types for this recalculation.
    const nonGhostTypes = effectiveDefenderTypes.filter((t) => t !== "ghost");
    effectiveness =
      nonGhostTypes.length > 0
        ? getTypeEffectiveness(effectiveMoveType, nonGhostTypes, typeChart)
        : 1;
  }

  const burnMultiplier = burnApplied ? 0.5 : 1;

  // 16. If effectiveness === 0: type immunity — return 0 damage
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
        burnMultiplier,
        abilityMultiplier,
        itemMultiplier: 1,
        otherMultiplier: 1,
        finalDamage: 0,
      },
    };
  }

  // Wonder Guard: only super-effective moves hit
  // Mold Breaker bypasses Wonder Guard
  // Fire Fang bypasses Wonder Guard in Gen 4 (cartridge bug replicated by Showdown)
  // Source: Showdown data/mods/gen4/abilities.ts — wonderguard: move.id === 'firefang' returns
  // Source: Bulbapedia — Wonder Guard: "Only super effective moves will hit."
  if (
    !moldBreaker &&
    defenderAbility === "wonder-guard" &&
    effectiveness < 2 &&
    move.id !== "fire-fang"
  ) {
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
        burnMultiplier,
        abilityMultiplier: 0,
        itemMultiplier: 1,
        otherMultiplier: 1,
        finalDamage: 0,
      },
    };
  }

  // 17. Apply type effectiveness as a multiplier
  // Source: Showdown sim/battle.ts — type effectiveness application
  baseDamage = Math.floor(baseDamage * effectiveness);

  // 18. Tinted Lens (NEW in Gen 4): double damage if not very effective
  // Source: Bulbapedia — Tinted Lens: "The power of not very effective moves is doubled."
  // Source: Showdown sim/abilities.ts — Tinted Lens
  if (attackerAbility === "tinted-lens" && effectiveness < 1) {
    baseDamage = baseDamage * 2;
    abilityMultiplier *= 2;
  }

  // 19. Filter / Solid Rock (NEW in Gen 4): 0.75x damage if super effective
  // Mold Breaker bypasses Filter / Solid Rock
  // Source: Bulbapedia — Filter / Solid Rock: "Reduces the power of super-effective
  //   attacks taken by 25%."
  // Source: Showdown sim/abilities.ts — Filter / Solid Rock
  if (
    !moldBreaker &&
    (defenderAbility === "filter" || defenderAbility === "solid-rock") &&
    effectiveness > 1
  ) {
    baseDamage = Math.floor(baseDamage * 0.75);
    abilityMultiplier *= 0.75;
  }

  // 19b. Type-resist berries: halve SE damage of the matching type (consumed).
  // Klutz or Embargo suppresses the berry.
  // Source: Bulbapedia — type-resist berries (Occa, Passho, etc.):
  //   "Weakens a supereffective [type]-type attack against the holder."
  // Source: Showdown sim/items.ts — type-resist berries onSourceModifyDamage
  let typeResistBerryConsumed: string | null = null;
  const defenderItem = defender.pokemon.heldItem;
  const defenderHasKlutz = defenderAbility === "klutz";
  const defenderHasEmbargo = defender.volatileStatuses.has("embargo");
  if (defenderItem && !defenderHasKlutz && !defenderHasEmbargo && effectiveness > 1) {
    const resistType = TYPE_RESIST_BERRIES[defenderItem];
    if (resistType && resistType === effectiveMoveType) {
      baseDamage = Math.floor(baseDamage * 0.5);
      typeResistBerryConsumed = defenderItem;
    }
  }

  // 20. Item damage modifiers (Final modifier phase)
  // Life Orb and Metronome moved to Phase 2 above. Expert Belt remains here.
  // Muscle Band and Wise Glasses moved to base power above.
  // Source: Showdown sim/items.ts — Expert Belt, type-resist berries

  // Life Orb: moved to Phase 2 (after crit, before random/STAB/types).
  // See step 12a above.

  // Expert Belt: 1.2x damage for super-effective moves
  // Source: Bulbapedia — Expert Belt: "Boosts the power of super effective moves by 20%."
  // Source: Showdown sim/items.ts — Expert Belt
  if (!attackerHasKlutz && attackerItem === "expert-belt" && effectiveness > 1) {
    baseDamage = Math.floor((baseDamage * 4915) / 4096);
    itemMultiplier = 4915 / 4096;
  }

  // Muscle Band and Wise Glasses: now applied to base power (moved to early base power section).
  // See step 1c in the base power modifiers above.

  // Metronome item: moved to Phase 2 (after crit, before random/STAB/types).
  // See step 12b above.

  // Type-boost items and Plates now modify base power (not attack stat),
  // so they're already baked into baseDamage. No separate itemMultiplier needed for them.

  // 21. Minimum 1 damage (unless type immune, which returns 0 above)
  // Source: Showdown sim/battle.ts — minimum 1 damage
  const finalDamage = Math.max(1, baseDamage);

  // Consume the type-resist berry if it activated.
  // Direct mutation is consistent with other item consumption patterns in this codebase
  // (e.g., Knock Off removes items via direct mutation in Gen4MoveEffects.ts).
  // Unburden: if defender has Unburden ability and loses its item, activate the volatile.
  if (typeResistBerryConsumed) {
    defender.pokemon.heldItem = null;
    if (defender.ability === "unburden" && !defender.volatileStatuses.has("unburden")) {
      defender.volatileStatuses.set("unburden", { turnsLeft: -1 });
    }
  }

  // Track type-resist berry in itemMultiplier for breakdown
  if (typeResistBerryConsumed) {
    itemMultiplier = itemMultiplier === 1 ? 0.5 : itemMultiplier * 0.5;
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
