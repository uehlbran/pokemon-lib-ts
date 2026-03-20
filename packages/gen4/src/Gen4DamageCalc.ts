import type {
  ActivePokemon,
  DamageBreakdown,
  DamageContext,
  DamageResult,
} from "@pokemon-lib-ts/battle";
import type { PokemonType, TypeChart } from "@pokemon-lib-ts/core";
import {
  getStabModifier,
  getStatStageMultiplier,
  getTypeEffectiveness,
  getWeatherDamageModifier,
} from "@pokemon-lib-ts/core";

// ─── Type-Boosting Items ────────────────────────────────────────────────────

/**
 * Gen 3-era type-boosting held items: 1.1x (10%) damage increase for moves
 * of the matching type. All of these existed in Gen 3 and carry over to Gen 4
 * with the same boost factor.
 *
 * Source: pret/pokeemerald src/data/items.h — HoldEffect HOLD_EFFECT_*_POWER
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
 * Plate items introduced in Gen 4: 1.2x (20%) damage increase for moves
 * of the matching type. These are stronger than the Gen 3 type-boost items.
 *
 * Source: Bulbapedia — Plate (item): "Boosts the power of the holder's
 *   [type]-type moves by 20%."
 * Source: Showdown sim/items.ts — Plate items onBasePowerPriority
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
  "pixie-plate": "fairy",
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
const ABILITY_TYPE_IMMUNITIES: Readonly<Record<string, string>> = {
  levitate: "ground",
  "volt-absorb": "electric",
  "water-absorb": "water",
  "flash-fire": "fire",
  "motor-drive": "electric",
  "dry-skin": "water",
};

// ─── Attack Stat Calculation ────────────────────────────────────────────────

/**
 * Get the effective attack stat for a move in Gen 4.
 *
 * Gen 4 is the first generation where the physical/special split is per-move,
 * not per-type. Physical moves use Attack; special moves use SpAttack.
 *
 * Modifier application order on the raw stat (before stat stages):
 *   1. Huge Power / Pure Power: Atk x2 (physical only)
 *   2. Type-boosting items (1.1x): applied to raw stat
 *   3. Plates (1.2x, NEW): applied to raw stat
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
  typeBoostItemType: string | null,
  plateItemType: string | null,
): number {
  const statKey = isPhysical ? "attack" : "spAttack";
  const stats = attacker.pokemon.calculatedStats;
  let rawStat = stats ? stats[statKey] : 100;

  const ability = attacker.ability;
  const attackerItem = attacker.pokemon.heldItem;
  const attackerSpecies = attacker.pokemon.speciesId;

  // 1. Huge Power / Pure Power: doubles physical attack
  // Source: Showdown sim/battle.ts — Huge Power / Pure Power in Gen 4
  // Source: pret/pokeplatinum — same as Gen 3
  if (isPhysical && (ability === "huge-power" || ability === "pure-power")) {
    rawStat = rawStat * 2;
  }

  // 2. Type-boosting held items (1.1x): applied to raw attack/spAttack stat
  // Source: Showdown sim/battle.ts — type boost items
  // Source: pret/pokeplatinum — same as pokeemerald: (attack * 110) / 100
  if (typeBoostItemType === moveType) {
    rawStat = Math.floor((rawStat * 110) / 100);
  }

  // 3. Plates (1.2x, NEW in Gen 4): applied to raw stat
  // Source: Bulbapedia — Plate items boost matching type moves by 20%
  // Source: Showdown sim/items.ts — Plate onBasePowerPriority
  if (plateItemType === moveType) {
    rawStat = Math.floor((rawStat * 120) / 100);
  }

  // 4. Choice Band: 1.5x physical attack (applied to raw stat)
  // Source: Showdown sim/battle.ts — Choice Band Gen 4
  // Source: pret/pokeplatinum — (150 * attack) / 100
  if (isPhysical && attackerItem === "choice-band") {
    rawStat = Math.floor((150 * rawStat) / 100);
  }

  // 4a. Choice Specs (NEW in Gen 4): 1.5x special attack (applied to raw stat)
  // Source: Showdown sim/items.ts — Choice Specs
  // Source: Bulbapedia — Choice Specs: "Boosts Sp. Atk by 50%, but locks into one move."
  if (!isPhysical && attackerItem === "choice-specs") {
    rawStat = Math.floor((150 * rawStat) / 100);
  }

  // 5. Species-specific held item boosts
  // Source: Showdown sim/battle.ts — Gen 4 species items

  // Soul Dew: 1.5x SpAtk for Latias (380) / Latios (381)
  // Source: Bulbapedia — Soul Dew: "Raises Latias's and Latios's Sp. Atk and Sp. Def by 50%."
  // Source: Showdown sim/items.ts — Soul Dew Gen 3-6 behavior
  if (
    !isPhysical &&
    attackerItem === "soul-dew" &&
    (attackerSpecies === 380 || attackerSpecies === 381)
  ) {
    rawStat = Math.floor((rawStat * 150) / 100);
  }

  // Deep Sea Tooth: 2x SpAtk for Clamperl (366)
  // Source: Bulbapedia — Deep Sea Tooth: "When held by Clamperl, doubles its Special Attack."
  // Source: Showdown sim/items.ts — Deep Sea Tooth
  if (!isPhysical && attackerItem === "deep-sea-tooth" && attackerSpecies === 366) {
    rawStat = rawStat * 2;
  }

  // Light Ball: 2x Atk AND SpAtk for Pikachu (25)
  // CHANGED from Gen 3: Gen 3 was SpAtk only; Gen 4+ boosts BOTH Attack and SpAttack.
  // Source: Bulbapedia — Light Ball: "When held by a Pikachu, doubles its Attack and
  //   Special Attack. (Generation IV+)"
  // Source: Showdown sim/items.ts — Light Ball Gen 4+ behavior
  if (attackerItem === "light-ball" && attackerSpecies === 25) {
    rawStat = rawStat * 2;
  }

  // Thick Club: 2x Attack for Cubone (104) / Marowak (105)
  // Source: Bulbapedia — Thick Club: "When held by Cubone or Marowak, doubles Attack."
  // Source: Showdown sim/items.ts — Thick Club
  if (
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

  // 8. Apply stat stages
  // Source: Showdown sim/battle.ts — stat stage application
  // Source: pret/pokeplatinum — same APPLY_STAT_MOD as pokeemerald
  const stage = isPhysical ? attacker.statStages.attack : attacker.statStages.spAttack;

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
): number {
  const statKey = isPhysical ? "defense" : "spDefense";
  const stats = defender.pokemon.calculatedStats;
  let baseStat = stats ? stats[statKey] : 100;

  // Species-specific held item boosts on defense side
  const defenderItem = defender.pokemon.heldItem;
  const defenderSpecies = defender.pokemon.speciesId;

  // Soul Dew: 1.5x SpDef for Latias (380) / Latios (381)
  // Source: Bulbapedia — Soul Dew: "Raises Latias's and Latios's Sp. Atk and Sp. Def by 50%."
  // Source: Showdown sim/items.ts — Soul Dew Gen 3-6 behavior
  if (
    !isPhysical &&
    defenderItem === "soul-dew" &&
    (defenderSpecies === 380 || defenderSpecies === 381)
  ) {
    baseStat = Math.floor((baseStat * 150) / 100);
  }

  // Deep Sea Scale: 2x SpDef for Clamperl (366)
  // Source: Bulbapedia — Deep Sea Scale: "When held by Clamperl, doubles its Special Defense."
  // Source: Showdown sim/items.ts — Deep Sea Scale
  if (!isPhysical && defenderItem === "deep-sea-scale" && defenderSpecies === 366) {
    baseStat = baseStat * 2;
  }

  // Marvel Scale: 1.5x physical Defense when defender has a non-volatile status condition
  // Source: Bulbapedia — Marvel Scale: "If the Pokemon has a status condition, its Defense
  //   stat is 1.5x."
  // Source: Showdown sim/abilities.ts — Marvel Scale
  if (isPhysical && defender.ability === "marvel-scale" && defender.pokemon.status !== null) {
    baseStat = Math.floor(baseStat * 1.5);
  }

  // Sandstorm Rock SpDef boost (NEW in Gen 4): 1.5x SpDef for Rock-types in sandstorm
  // Source: Bulbapedia — Sandstorm: "Rock-type Pokemon have their Special Defense
  //   raised by 50% during a sandstorm."
  // Source: Showdown sim/battle.ts — Gen 4 sandstorm SpDef boost for Rock types
  if (!isPhysical && weather === "sand" && defender.types.includes("rock")) {
    baseStat = Math.floor((baseStat * 150) / 100);
  }

  // Get the appropriate stat stage
  const stage = isPhysical ? defender.statStages.defense : defender.statStages.spDefense;

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
 *   2. Pinch abilities (overgrow/blaze/torrent/swarm): 1.5x power
 *   3. Technician: 1.5x power for moves with base power <= 60
 *   4. Defender ability immunities (levitate, volt-absorb, etc.)
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

  // 2. Pinch abilities: 1.5x power when HP <= floor(maxHP/3) and type matches
  // Source: Showdown sim/battle.ts — Gen 4 pinch ability check
  // Source: Bulbapedia — Overgrow / Blaze / Torrent / Swarm
  const pinchType = PINCH_ABILITY_TYPES[attackerAbility];
  if (pinchType && move.type === pinchType) {
    const maxHp = attacker.pokemon.calculatedStats?.hp ?? attacker.pokemon.currentHp;
    const threshold = Math.floor(maxHp / 3);
    if (attacker.pokemon.currentHp <= threshold) {
      power = Math.floor(power * 1.5);
    }
  }

  // 3. Technician (NEW in Gen 4): 1.5x power for moves with base power <= 60
  // Source: Bulbapedia — Technician: "Moves with a base power of 60 or less are
  //   boosted in power by 50%."
  // Source: Showdown sim/abilities.ts — Technician
  if (attackerAbility === "technician" && power <= 60) {
    power = Math.floor(power * 1.5);
  }

  // 4. Defender ability type immunities
  // Source: Showdown sim/battle.ts — Gen 4 ability immunities
  const immuneType = ABILITY_TYPE_IMMUNITIES[defenderAbility];
  if (immuneType && move.type === immuneType) {
    return { damage: 0, effectiveness: 0, isCrit, randomFactor: 1 };
  }

  // 5. Physical/Special determination — THE key Gen 4 change
  // In Gen 4, category is per-move, NOT per-type (unlike Gen 1-3).
  // Source: Bulbapedia — Physical/special split: "Starting in Generation IV,
  //   each individual move has its own damage category."
  const isPhysical = move.category === "physical";

  // Determine type-boost item and plate matches (used in getAttackStat)
  const attackerItem = attacker.pokemon.heldItem;
  const typeBoostItemType = attackerItem ? (TYPE_BOOST_ITEMS[attackerItem] ?? null) : null;
  const plateItemType = attackerItem ? (PLATE_ITEMS[attackerItem] ?? null) : null;

  // Get weather for defense stat and weather modifier
  const weather = context.state.weather?.type ?? null;

  // Get effective stats
  let attack = getAttackStat(
    attacker,
    move.type,
    isPhysical,
    isCrit,
    typeBoostItemType,
    plateItemType,
  );
  let defense = getDefenseStat(defender, isPhysical, isCrit, weather);

  // Track multipliers for breakdown
  let abilityMultiplier = 1;

  // 6. Thick Fat: halves the attacker's effective stat for fire/ice moves
  // Source: Bulbapedia — Thick Fat: "Fire-type and Ice-type moves deal half damage."
  // Source: Showdown sim/abilities.ts — Thick Fat
  if (defenderAbility === "thick-fat" && (move.type === "fire" || move.type === "ice")) {
    attack = Math.floor(attack / 2);
    abilityMultiplier = 0.5;
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

  // 10. Weather modifier
  // Source: Showdown sim/battle.ts — Gen 4 weather damage modifier
  // Rain: Water 1.5x, Fire 0.5x; Sun: Fire 1.5x, Water 0.5x
  const weatherMod = getWeatherDamageModifier(move.type, weather);
  if (weatherMod !== 1) {
    baseDamage = Math.floor(baseDamage * weatherMod);
  }

  // 11. Add 2 (the constant at the end of the base damage formula)
  // Source: Showdown sim/battle.ts — Gen 4 base damage + 2
  // Source: pret/pokeplatinum — "return damage + 2"
  baseDamage += 2;

  // Record the base damage before post-formula modifiers for breakdown
  const rawBaseDamage = baseDamage;

  // --- Post-formula modifiers ---

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
  const stabMod = getStabModifier(move.type, attacker.types, attackerAbility === "adaptability");
  if (stabMod > 1) {
    baseDamage = Math.floor(baseDamage * stabMod);
  }

  // 15. Type effectiveness
  // Source: Showdown sim/battle.ts — Gen 4 type effectiveness
  const effectiveness = getTypeEffectiveness(move.type, defender.types, typeChart);

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
  // Source: Bulbapedia — Wonder Guard: "Only super effective moves will hit."
  // Source: Showdown sim/abilities.ts — Wonder Guard
  if (defenderAbility === "wonder-guard" && effectiveness < 2) {
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
  // Source: Bulbapedia — Filter / Solid Rock: "Reduces the power of super-effective
  //   attacks taken by 25%."
  // Source: Showdown sim/abilities.ts — Filter / Solid Rock
  if ((defenderAbility === "filter" || defenderAbility === "solid-rock") && effectiveness > 1) {
    baseDamage = Math.floor(baseDamage * 0.75);
    abilityMultiplier *= 0.75;
  }

  // 20. Item damage modifiers (NEW in Gen 4)
  // Source: Showdown sim/items.ts — Life Orb, Expert Belt, Muscle Band, Wise Glasses
  let itemMultiplier = 1;

  // Life Orb: 1.3x damage (recoil is handled separately by the engine)
  // Source: Bulbapedia — Life Orb: "Boosts the power of moves by 30%."
  // Source: Showdown sim/items.ts — Life Orb onModifyDamage
  if (attackerItem === "life-orb") {
    baseDamage = Math.floor(baseDamage * 1.3);
    itemMultiplier = 1.3;
  }

  // Expert Belt: 1.2x damage for super-effective moves
  // Source: Bulbapedia — Expert Belt: "Boosts the power of super effective moves by 20%."
  // Source: Showdown sim/items.ts — Expert Belt
  if (attackerItem === "expert-belt" && effectiveness > 1) {
    baseDamage = Math.floor(baseDamage * 1.2);
    itemMultiplier = 1.2;
  }

  // Muscle Band: 1.1x damage for physical moves
  // Source: Bulbapedia — Muscle Band: "Boosts the power of physical moves by 10%."
  // Source: Showdown sim/items.ts — Muscle Band
  if (attackerItem === "muscle-band" && isPhysical) {
    baseDamage = Math.floor(baseDamage * 1.1);
    itemMultiplier = 1.1;
  }

  // Wise Glasses: 1.1x damage for special moves
  // Source: Bulbapedia — Wise Glasses: "Boosts the power of special moves by 10%."
  // Source: Showdown sim/items.ts — Wise Glasses
  if (attackerItem === "wise-glasses" && !isPhysical) {
    baseDamage = Math.floor(baseDamage * 1.1);
    itemMultiplier = 1.1;
  }

  // Account for type-boost items and plates in itemMultiplier for breakdown
  if (typeBoostItemType === move.type) {
    itemMultiplier = itemMultiplier === 1 ? 1.1 : itemMultiplier;
  }
  if (plateItemType === move.type) {
    itemMultiplier = itemMultiplier === 1 ? 1.2 : itemMultiplier;
  }

  // 21. Minimum 1 damage (unless type immune, which returns 0 above)
  // Source: Showdown sim/battle.ts — minimum 1 damage
  const finalDamage = Math.max(1, baseDamage);

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
