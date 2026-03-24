/**
 * Gen 9 damage-modifying ability handlers.
 *
 * Carries forward all damage-modifying abilities from Gen 7-8 and adds Gen 9-specific changes:
 *
 *   - Supreme Overlord (new): power boost based on fainted allies (4096-based table, capped at 5)
 *   - Orichalcum Pulse (new): 5461/4096 Attack in Sun/Desolate Land (stat modifier)
 *   - Hadron Engine (new): 5461/4096 SpA on Electric Terrain (stat modifier)
 *   - Protean / Libero (nerfed): once per switchin (was every move in Gen 8)
 *   - Intrepid Sword / Dauntless Shield (nerfed): once per battle (was every switchin in Gen 8)
 *
 * This file also exports utility functions used directly by the damage calc for
 * numerical modifiers. The `handleGen9DamageCalcAbility()` handler returns activation
 * signals so the engine can emit appropriate messages.
 *
 * Source: Showdown data/abilities.ts -- Gen 9 ability handlers
 * Source: Bulbapedia -- individual ability articles
 */

import type { AbilityContext, AbilityResult, ActivePokemon } from "@pokemon-lib-ts/battle";
import type { MoveEffect, PokemonType, VolatileStatus } from "@pokemon-lib-ts/core";

// ---------------------------------------------------------------------------
// Supreme Overlord power table
// ---------------------------------------------------------------------------

/**
 * Supreme Overlord power multiplier table (4096-based).
 * Index = number of fainted allies (capped at 5).
 * Each fainted ally adds ~10% boost, up to 50% at 5 fainted.
 *
 * Source: Showdown data/abilities.ts:4634-4658 -- supremeoverlord ability
 *   const powMod = [4096, 4506, 4915, 5325, 5734, 6144];
 */
export const SUPREME_OVERLORD_TABLE: readonly number[] = [
  4096, // 0 fainted: no boost (1.0x)
  4506, // 1 fainted: ~10% boost
  4915, // 2 fainted: ~20% boost
  5325, // 3 fainted: ~30% boost
  5734, // 4 fainted: ~40% boost
  6144, // 5 fainted: 50% boost (cap)
];

/**
 * Get Supreme Overlord 4096-based power modifier based on fainted ally count.
 * Returns 4096 (1.0x) if ability is not supreme-overlord or no allies fainted.
 * Fainted count is capped at 5 per Showdown source.
 *
 * Source: Showdown data/abilities.ts:4634-4658 -- supremeoverlord onBasePower
 */
export function getSupremeOverlordModifier(abilityId: string, faintedCount: number): number {
  if (abilityId !== "supreme-overlord") return 4096;
  const capped = Math.min(Math.max(faintedCount, 0), 5);
  return SUPREME_OVERLORD_TABLE[capped] ?? 4096;
}

// ---------------------------------------------------------------------------
// Orichalcum Pulse / Hadron Engine stat modifiers
// ---------------------------------------------------------------------------

/**
 * Orichalcum Pulse: 5461/4096 (~1.333x) Attack in Sun or Desolate Land.
 * Applied as a stat modifier to the Attack stat before the damage formula.
 *
 * Source: Showdown data/abilities.ts:3016-3035 -- orichalcumpulse onModifyAtk
 *   if (['sunnyday', 'desolateland'].includes(pokemon.effectiveWeather()))
 *     return this.chainModify([5461, 4096]);
 */
export function getOrichalcumPulseAtkModifier(
  abilityId: string,
  weatherType: string | null,
): number {
  if (abilityId !== "orichalcum-pulse") return 4096;
  // "harsh-sun" is our WeatherType for Desolate Land (Showdown calls it "desolateland")
  if (weatherType !== "sun" && weatherType !== "harsh-sun") {
    return 4096;
  }
  return 5461;
}

/**
 * Hadron Engine: 5461/4096 (~1.333x) SpA on Electric Terrain.
 * Applied as a stat modifier to the SpA stat before the damage formula.
 *
 * Source: Showdown data/abilities.ts:1725-1742 -- hadronengine onModifySpA
 *   if (this.field.isTerrain('electricterrain'))
 *     return this.chainModify([5461, 4096]);
 */
export function getHadronEngineSpAModifier(abilityId: string, terrainType: string | null): number {
  if (abilityId !== "hadron-engine") return 4096;
  if (terrainType !== "electric") return 4096;
  return 5461;
}

// ---------------------------------------------------------------------------
// Fluffy (Gen 7+, carried to Gen 9)
// ---------------------------------------------------------------------------

/**
 * Fluffy: halves contact damage, doubles Fire damage. Both can stack:
 *   - Fire contact move: 0.5 * 2 = 1.0x (they cancel out)
 *   - Fire non-contact: 2.0x
 *   - Non-fire contact: 0.5x
 *   - Non-fire non-contact: 1.0x
 *
 * Returns the 4096-based modifier.
 *
 * Source: Showdown data/abilities.ts -- fluffy: onSourceModifyDamage
 *   let mod = 1;
 *   if (move.type === 'Fire') mod *= 2;
 *   if (move.flags['contact']) mod /= 2;
 *   return this.chainModify(mod);
 */
export function getFluffyModifier(
  defenderAbility: string,
  moveType: PokemonType,
  isContact: boolean,
): number {
  if (defenderAbility !== "fluffy") return 4096;
  let mod = 1;
  if (moveType === "fire") mod *= 2;
  if (isContact) mod /= 2;
  // Convert to 4096-based: 0.5 = 2048, 1.0 = 4096, 2.0 = 8192
  return Math.round(mod * 4096);
}

// ---------------------------------------------------------------------------
// Ice Scales (Gen 8+, carried to Gen 9)
// ---------------------------------------------------------------------------

/**
 * Ice Scales: halves special damage taken.
 *
 * Source: Showdown data/abilities.ts -- icescales: onSourceModifyDamage
 *   if (move.category === 'Special') return this.chainModify(0.5);
 */
export function getIceScalesModifier(
  defenderAbility: string,
  moveCategory: "physical" | "special" | "status",
): number {
  if (defenderAbility !== "ice-scales") return 4096;
  if (moveCategory !== "special") return 4096;
  return 2048; // 0.5x
}

// ---------------------------------------------------------------------------
// Recoil detection helper (for Reckless) -- carried from Gen 5/6/7
// ---------------------------------------------------------------------------

/**
 * Check if a move has recoil (for Reckless boost).
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

// ---------------------------------------------------------------------------
// Sheer Force secondary effect detection -- carried from Gen 5/6/7
// ---------------------------------------------------------------------------

/**
 * Moves whose Sheer Force-eligible secondaries cannot be represented in our
 * MoveEffect union because Showdown stores them as custom `onHit` functions.
 *
 * Source: Showdown data/moves.ts -- triattack: secondary.onHit randomly picks
 *   from burn/paralysis/freeze with 20% chance
 */
const SHEER_FORCE_MOVE_WHITELIST: ReadonlySet<string> = new Set([
  "tri-attack",
  "secret-power",
  "relic-song",
]);

/**
 * Check if a move has secondary effects that Sheer Force would suppress.
 *
 * Source: Showdown data/abilities.ts -- sheerforce
 */
export function hasSheerForceEligibleEffect(effect: MoveEffect | null): boolean {
  if (!effect) return false;

  switch (effect.type) {
    case "status-chance":
      return true;
    case "stat-change":
      if (effect.target === "foe" && effect.chance > 0) return true;
      if (effect.target === "self" && effect.fromSecondary === true) return true;
      return false;
    case "volatile-status":
      return effect.chance > 0;
    case "multi":
      return effect.effects.some((e) => hasSheerForceEligibleEffect(e));
    default:
      return false;
  }
}

/**
 * Combined check: is a move eligible for Sheer Force?
 *
 * Source: Showdown data/abilities.ts -- sheerforce
 */
export function isSheerForceEligibleMove(effect: MoveEffect | null, moveId: string): boolean {
  return hasSheerForceEligibleEffect(effect) || SHEER_FORCE_MOVE_WHITELIST.has(moveId);
}

// ---------------------------------------------------------------------------
// Pinch ability type mapping -- carried from Gen 5/6/7
// ---------------------------------------------------------------------------

/**
 * Pinch abilities: 1.5x attack stat when HP <= floor(maxHP/3) and move type matches.
 *
 * Source: Showdown data/abilities.ts -- Blaze/Overgrow/Torrent/Swarm
 */
const PINCH_ABILITY_TYPES: Readonly<Record<string, PokemonType>> = {
  blaze: "fire",
  overgrow: "grass",
  torrent: "water",
  swarm: "bug",
};

// ---------------------------------------------------------------------------
// Shared sentinel
// ---------------------------------------------------------------------------

const NO_ACTIVATION: AbilityResult = {
  activated: false,
  effects: [],
  messages: [],
};

// ---------------------------------------------------------------------------
// -ate abilities (Gen 7+ 1.2x, carried to Gen 9)
// ---------------------------------------------------------------------------

/**
 * Get the -ate ability type override and power multiplier for Gen 9.
 * Pixilate/Aerilate/Refrigerate/Galvanize: change Normal -> X type with 1.2x boost.
 * Normalize: change all moves to Normal type with 1.2x boost (Gen 7+).
 * Liquid Voice: change sound-based moves to Water type (no power boost).
 *
 * Gen 9: 1.2x (4915/4096), same as Gen 7-8 (was 1.3x in Gen 6).
 *
 * Source: Showdown data/abilities.ts -- Gen 7+: chainModify([4915, 4096])
 * Source: Bulbapedia -- "-ate abilities 1.2x in Gen 7+"
 *
 * @returns { type, multiplier } if the ability activates, or null otherwise
 */
export function getAteAbilityOverride(
  abilityId: string,
  moveType: PokemonType,
  isSoundMove?: boolean,
): { type: PokemonType; multiplier: number } | null {
  // -ate abilities: only convert Normal-type moves
  if (moveType === "normal") {
    switch (abilityId) {
      case "pixilate":
        return { type: "fairy", multiplier: 4915 / 4096 };
      case "aerilate":
        return { type: "flying", multiplier: 4915 / 4096 };
      case "refrigerate":
        return { type: "ice", multiplier: 4915 / 4096 };
      case "galvanize":
        return { type: "electric", multiplier: 4915 / 4096 };
    }
  }

  // Normalize: all moves become Normal type + 1.2x boost (Gen 7+)
  // Source: Showdown data/abilities.ts -- Normalize Gen 7+
  if (abilityId === "normalize" && moveType !== "normal") {
    return { type: "normal", multiplier: 4915 / 4096 };
  }

  // Liquid Voice: sound-based moves become Water type (no power boost)
  // Source: Showdown data/abilities.ts -- liquidvoice: onModifyType
  if (abilityId === "liquid-voice" && isSoundMove && moveType !== "water") {
    return { type: "water", multiplier: 1 };
  }

  return null;
}

// ---------------------------------------------------------------------------
// Protean / Libero -- once per switchin (Gen 9 nerf)
// ---------------------------------------------------------------------------

/**
 * Handle Gen 9 Protean/Libero type change.
 *
 * Gen 9 nerf: Protean/Libero only changes the user's type ONCE per switchin.
 * In Gen 6-8, it changed type before every attacking move.
 * In Gen 9, once used, it sets a "protean-used" volatile that persists until
 * the Pokemon switches out.
 *
 * Source: Showdown data/abilities.ts -- protean/libero:
 *   onPrepareHit: if (this.effectState.protean) return;
 *   this.effectState.protean = true;
 */
export function applyGen9ProteanTypeChange(
  pokemon: ActivePokemon,
  moveType: PokemonType,
  sideIndex: 0 | 1,
): Array<{ type: string; side: number; pokemon: number; types: PokemonType[] }> {
  const ability = pokemon.ability;
  if (ability !== "protean" && ability !== "libero") return [];

  // Once per switchin gate
  if (pokemon.volatileStatuses.has("protean-used" as VolatileStatus)) return [];

  // Already the same type -- no change needed (matches Showdown check)
  if (pokemon.types.length === 1 && pokemon.types[0] === moveType) return [];

  // Mark as used for this switchin
  pokemon.volatileStatuses.set("protean-used" as VolatileStatus, { turnsLeft: -1 });

  // Change type to move type
  pokemon.types = [moveType];

  // Return type-change event
  return [
    {
      type: "type-change",
      side: sideIndex,
      pokemon: pokemon.teamSlot,
      types: [moveType],
    },
  ];
}

/**
 * @deprecated Use applyGen9ProteanTypeChange for the explicit low-level mutation helper.
 */
export const handleGen9ProteanTypeChange = applyGen9ProteanTypeChange;

// ---------------------------------------------------------------------------
// Intrepid Sword / Dauntless Shield -- once per battle (Gen 9 nerf)
// ---------------------------------------------------------------------------

/**
 * Handle Gen 9 Intrepid Sword on switch-in.
 *
 * Gen 9 nerf: only activates on the FIRST switchin of the entire battle.
 * In Gen 8, it activated on every switchin.
 * Showdown tracks this with `pokemon.swordBoost` (a persistent flag).
 *
 * Source: Showdown data/abilities.ts -- intrepidsword:
 *   onStart(pokemon) { if (pokemon.swordBoost) return; pokemon.swordBoost = true; }
 *
 * @returns true if the ability activated (Atk should be boosted by +1)
 */
export function applyGen9IntrepidSwordBoost(pokemon: ActivePokemon): boolean {
  if (pokemon.ability !== "intrepid-sword") return false;

  // Check if already used this battle — persisted on PokemonInstance so it survives switches.
  // Mirrors Showdown: if (pokemon.swordBoost) return; pokemon.swordBoost = true;
  // Source: Showdown data/abilities.ts -- intrepidsword: onStart
  if (pokemon.pokemon.swordBoost) return false;

  pokemon.pokemon.swordBoost = true;

  return true;
}

/**
 * @deprecated Use applyGen9IntrepidSwordBoost for the explicit low-level mutation helper.
 */
export const handleGen9IntrepidSword = applyGen9IntrepidSwordBoost;

/**
 * Handle Gen 9 Dauntless Shield on switch-in.
 *
 * Gen 9 nerf: only activates on the FIRST switchin of the entire battle.
 * In Gen 8, it activated on every switchin.
 * Showdown tracks this with `pokemon.shieldBoost` (a persistent flag).
 *
 * Source: Showdown data/abilities.ts -- dauntlessshield:
 *   onStart(pokemon) { if (pokemon.shieldBoost) return; pokemon.shieldBoost = true; }
 *
 * @returns true if the ability activated (Def should be boosted by +1)
 */
export function applyGen9DauntlessShieldBoost(pokemon: ActivePokemon): boolean {
  if (pokemon.ability !== "dauntless-shield") return false;

  // Check if already used this battle — persisted on PokemonInstance so it survives switches.
  // Mirrors Showdown: if (pokemon.shieldBoost) return; pokemon.shieldBoost = true;
  // Source: Showdown data/abilities.ts -- dauntlessshield: onStart
  if (pokemon.pokemon.shieldBoost) return false;

  pokemon.pokemon.shieldBoost = true;

  return true;
}

/**
 * @deprecated Use applyGen9DauntlessShieldBoost for the explicit low-level mutation helper.
 */
export const handleGen9DauntlessShield = applyGen9DauntlessShieldBoost;

// ---------------------------------------------------------------------------
// Public API: damage-calc abilities handler
// ---------------------------------------------------------------------------

/**
 * Handle damage-calc ability modifiers for Gen 9.
 *
 * Covers all inherited damage-calc abilities plus Gen 9 additions:
 *   - Supreme Overlord (new): power boost based on fainted allies
 *   - Orichalcum Pulse/Hadron Engine: stat modifiers (applied in getAttackStat)
 *   - Protean/Libero: nerfed to once per switchin
 *   - Intrepid Sword/Dauntless Shield: nerfed to once per battle
 *   - Ice Scales (Gen 8): halves special damage
 *   - Fluffy (Gen 7): halves contact, doubles fire
 *
 * Abilities whose numerical modifiers are applied directly in calculateGen9Damage:
 *   - Huge Power, Pure Power, Thick Fat, Hustle, Guts, Technician, Iron Fist,
 *     Tough Claws, Strong Jaw, Mega Launcher, Reckless, Sheer Force, Sniper,
 *     Tinted Lens, Filter, Solid Rock, Prism Armor, Wonder Guard,
 *     -ate abilities, pinch abilities, Flash Fire, Adaptability
 *
 * This handler returns activation signals for the engine to emit messages.
 *
 * Source: Showdown data/abilities.ts
 */
export function handleGen9DamageCalcAbility(ctx: AbilityContext): AbilityResult {
  const abilityId = ctx.pokemon.ability;
  const name = ctx.pokemon.pokemon.nickname ?? String(ctx.pokemon.pokemon.speciesId);

  switch (abilityId) {
    // ---- Attacker-side abilities ----

    case "sheer-force": {
      if (!ctx.move) return NO_ACTIVATION;
      if (!isSheerForceEligibleMove(ctx.move.effect, ctx.move.id)) return NO_ACTIVATION;
      return {
        activated: true,
        effects: [{ effectType: "none", target: "self" }],
        messages: [],
      };
    }

    case "analytic": {
      if (!ctx.opponent) return NO_ACTIVATION;
      if (!ctx.opponent.movedThisTurn) return NO_ACTIVATION;
      return {
        activated: true,
        effects: [{ effectType: "none", target: "self" }],
        messages: [],
      };
    }

    case "sand-force": {
      if (!ctx.move) return NO_ACTIVATION;
      const weather = ctx.state.weather?.type ?? null;
      if (weather !== "sand") return NO_ACTIVATION;
      const sandForceTypes: PokemonType[] = ["rock", "ground", "steel"];
      if (!sandForceTypes.includes(ctx.move.type)) return NO_ACTIVATION;
      return {
        activated: true,
        effects: [{ effectType: "none", target: "self" }],
        messages: [],
      };
    }

    case "technician": {
      if (!ctx.move) return NO_ACTIVATION;
      if (ctx.move.power === null || ctx.move.power > 60) return NO_ACTIVATION;
      return {
        activated: true,
        effects: [{ effectType: "none", target: "self" }],
        messages: [],
      };
    }

    case "iron-fist": {
      if (!ctx.move) return NO_ACTIVATION;
      if (!ctx.move.flags.punch) return NO_ACTIVATION;
      return {
        activated: true,
        effects: [{ effectType: "none", target: "self" }],
        messages: [],
      };
    }

    case "reckless": {
      if (!ctx.move) return NO_ACTIVATION;
      if (!hasRecoilEffect(ctx.move.effect) && !ctx.move.hasCrashDamage) return NO_ACTIVATION;
      return {
        activated: true,
        effects: [{ effectType: "none", target: "self" }],
        messages: [],
      };
    }

    case "adaptability": {
      if (!ctx.move) return NO_ACTIVATION;
      if (!ctx.pokemon.types.includes(ctx.move.type)) return NO_ACTIVATION;
      return {
        activated: true,
        effects: [{ effectType: "none", target: "self" }],
        messages: [],
      };
    }

    case "hustle": {
      if (!ctx.move) return NO_ACTIVATION;
      if (ctx.move.category !== "physical") return NO_ACTIVATION;
      return {
        activated: true,
        effects: [{ effectType: "none", target: "self" }],
        messages: [],
      };
    }

    case "huge-power":
    case "pure-power": {
      if (!ctx.move) return NO_ACTIVATION;
      if (ctx.move.category !== "physical") return NO_ACTIVATION;
      return {
        activated: true,
        effects: [{ effectType: "none", target: "self" }],
        messages: [],
      };
    }

    case "guts": {
      if (!ctx.move) return NO_ACTIVATION;
      if (ctx.move.category !== "physical") return NO_ACTIVATION;
      if (ctx.pokemon.pokemon.status === null) return NO_ACTIVATION;
      return {
        activated: true,
        effects: [{ effectType: "none", target: "self" }],
        messages: [],
      };
    }

    case "blaze":
    case "overgrow":
    case "torrent":
    case "swarm": {
      if (!ctx.move) return NO_ACTIVATION;
      const pinchType = PINCH_ABILITY_TYPES[abilityId];
      if (!pinchType || ctx.move.type !== pinchType) return NO_ACTIVATION;
      const maxHp = ctx.pokemon.pokemon.calculatedStats?.hp ?? ctx.pokemon.pokemon.currentHp;
      const threshold = Math.floor(maxHp / 3);
      if (ctx.pokemon.pokemon.currentHp > threshold) return NO_ACTIVATION;
      return {
        activated: true,
        effects: [{ effectType: "none", target: "self" }],
        messages: [],
      };
    }

    case "sniper": {
      return {
        activated: true,
        effects: [{ effectType: "none", target: "self" }],
        messages: [],
      };
    }

    case "tinted-lens": {
      return {
        activated: true,
        effects: [{ effectType: "none", target: "self" }],
        messages: [],
      };
    }

    case "supreme-overlord": {
      // Supreme Overlord: power boost based on fainted allies.
      // The actual numerical modifier is applied via getSupremeOverlordModifier()
      // in the damage calc. This handler just signals activation.
      // Do not activate when no allies have fainted (0 fainted = 4096 = 1.0x, no boost).
      // Source: Showdown data/abilities.ts:4634-4658
      const attackerSide = ctx.state.sides.find((s) =>
        s.active?.some((a) => a?.pokemon.uid === ctx.pokemon.pokemon.uid),
      );
      const faintedCount = attackerSide?.faintCount ?? 0;
      if (faintedCount === 0) return NO_ACTIVATION;
      return {
        activated: true,
        effects: [{ effectType: "none", target: "self" }],
        messages: [`${name}'s Supreme Overlord boosted the attack!`],
      };
    }

    case "orichalcum-pulse": {
      // Stat modifier: applied in getAttackStat via getOrichalcumPulseAtkModifier().
      // Source: Showdown data/abilities.ts:3016-3035
      const weather = ctx.state.weather?.type ?? null;
      if (weather !== "sun" && weather !== "harsh-sun") {
        return NO_ACTIVATION;
      }
      return {
        activated: true,
        effects: [{ effectType: "none", target: "self" }],
        messages: [`${name}'s Orichalcum Pulse boosted its Attack!`],
      };
    }

    case "hadron-engine": {
      // Stat modifier: applied in getAttackStat via getHadronEngineSpAModifier().
      // Source: Showdown data/abilities.ts:1725-1742
      const terrainType = ctx.state.terrain?.type ?? null;
      if (terrainType !== "electric") return NO_ACTIVATION;
      return {
        activated: true,
        effects: [{ effectType: "none", target: "self" }],
        messages: [`${name}'s Hadron Engine boosted its Sp. Atk!`],
      };
    }

    // ---- Gen 6 carry-forward: Attacker-side ----

    case "tough-claws": {
      if (!ctx.move) return NO_ACTIVATION;
      if (!ctx.move.flags.contact) return NO_ACTIVATION;
      return {
        activated: true,
        effects: [{ effectType: "none", target: "self" }],
        messages: [`${name}'s Tough Claws boosted the attack!`],
      };
    }

    case "strong-jaw": {
      if (!ctx.move) return NO_ACTIVATION;
      if (!ctx.move.flags.bite) return NO_ACTIVATION;
      return {
        activated: true,
        effects: [{ effectType: "none", target: "self" }],
        messages: [`${name}'s Strong Jaw boosted the attack!`],
      };
    }

    case "mega-launcher": {
      if (!ctx.move) return NO_ACTIVATION;
      if (!ctx.move.flags.pulse) return NO_ACTIVATION;
      return {
        activated: true,
        effects: [{ effectType: "none", target: "self" }],
        messages: [`${name}'s Mega Launcher boosted the attack!`],
      };
    }

    // ---- -ate abilities (Gen 7+: 1.2x, carried to Gen 9) ----

    case "pixilate": {
      if (!ctx.move) return NO_ACTIVATION;
      if (ctx.move.type !== "normal") return NO_ACTIVATION;
      return {
        activated: true,
        effects: [{ effectType: "type-change", target: "self", types: ["fairy"] }],
        messages: [`${name}'s Pixilate transformed the move into Fairy type!`],
      };
    }

    case "aerilate": {
      if (!ctx.move) return NO_ACTIVATION;
      if (ctx.move.type !== "normal") return NO_ACTIVATION;
      return {
        activated: true,
        effects: [{ effectType: "type-change", target: "self", types: ["flying"] }],
        messages: [`${name}'s Aerilate transformed the move into Flying type!`],
      };
    }

    case "refrigerate": {
      if (!ctx.move) return NO_ACTIVATION;
      if (ctx.move.type !== "normal") return NO_ACTIVATION;
      return {
        activated: true,
        effects: [{ effectType: "type-change", target: "self", types: ["ice"] }],
        messages: [`${name}'s Refrigerate transformed the move into Ice type!`],
      };
    }

    case "galvanize": {
      if (!ctx.move) return NO_ACTIVATION;
      if (ctx.move.type !== "normal") return NO_ACTIVATION;
      return {
        activated: true,
        effects: [{ effectType: "type-change", target: "self", types: ["electric"] }],
        messages: [`${name}'s Galvanize transformed the move into Electric type!`],
      };
    }

    case "parental-bond": {
      if (!ctx.move) return NO_ACTIVATION;
      if (ctx.move.effect?.type === "multi-hit") return NO_ACTIVATION;
      if (!ctx.move.power || ctx.move.power <= 0) return NO_ACTIVATION;
      return {
        activated: true,
        effects: [{ effectType: "none", target: "self" }],
        messages: [`${name}'s Parental Bond lets it attack twice!`],
      };
    }

    // ---- Defender-side abilities ----

    case "multiscale":
    case "shadow-shield": {
      const maxHp = ctx.pokemon.pokemon.calculatedStats?.hp ?? ctx.pokemon.pokemon.currentHp;
      if (ctx.pokemon.pokemon.currentHp < maxHp) return NO_ACTIVATION;
      const abilityName = abilityId === "multiscale" ? "Multiscale" : "Shadow Shield";
      return {
        activated: true,
        effects: [{ effectType: "damage-reduction", target: "self" }],
        messages: [`${name}'s ${abilityName} weakened the attack!`],
      };
    }

    case "solid-rock":
    case "filter": {
      return {
        activated: true,
        effects: [{ effectType: "damage-reduction", target: "self" }],
        messages: [],
      };
    }

    case "prism-armor": {
      return {
        activated: true,
        effects: [{ effectType: "damage-reduction", target: "self" }],
        messages: [`${name}'s Prism Armor weakened the attack!`],
      };
    }

    case "thick-fat": {
      if (!ctx.move) return NO_ACTIVATION;
      if (ctx.move.type !== "fire" && ctx.move.type !== "ice") return NO_ACTIVATION;
      return {
        activated: true,
        effects: [{ effectType: "damage-reduction", target: "self" }],
        messages: [],
      };
    }

    case "marvel-scale": {
      if (ctx.pokemon.pokemon.status === null) return NO_ACTIVATION;
      return {
        activated: true,
        effects: [{ effectType: "damage-reduction", target: "self" }],
        messages: [],
      };
    }

    case "fur-coat": {
      if (!ctx.move) return NO_ACTIVATION;
      if (ctx.move.category !== "physical") return NO_ACTIVATION;
      return {
        activated: true,
        effects: [{ effectType: "damage-reduction", target: "self" }],
        messages: [`${name}'s Fur Coat halved the damage!`],
      };
    }

    case "fluffy": {
      // Fluffy: halves contact damage, doubles fire damage.
      // Source: Showdown data/abilities.ts -- fluffy: onSourceModifyDamage
      if (!ctx.move) return NO_ACTIVATION;
      const isFire = ctx.move.type === "fire";
      const isContact = !!ctx.move.flags.contact;
      if (!isFire && !isContact) return NO_ACTIVATION;
      return {
        activated: true,
        effects: [{ effectType: "damage-reduction", target: "self" }],
        messages: [],
      };
    }

    case "ice-scales": {
      // Ice Scales: halves special damage taken.
      // Source: Showdown data/abilities.ts -- icescales: onSourceModifyDamage
      if (!ctx.move) return NO_ACTIVATION;
      if (ctx.move.category !== "special") return NO_ACTIVATION;
      return {
        activated: true,
        effects: [{ effectType: "damage-reduction", target: "self" }],
        messages: [],
      };
    }

    default:
      return NO_ACTIVATION;
  }
}

/**
 * Handle damage-immunity and damage-capping ability checks for Gen 9.
 *
 * Sturdy: blocks OHKO moves AND survives any hit from full HP at 1 HP.
 *
 * Source: Showdown data/abilities.ts -- sturdy
 */
export function handleGen9DamageImmunityAbility(ctx: AbilityContext): AbilityResult {
  const abilityId = ctx.pokemon.ability;
  const name = ctx.pokemon.pokemon.nickname ?? String(ctx.pokemon.pokemon.speciesId);

  switch (abilityId) {
    case "sturdy": {
      if (ctx.move?.effect?.type === "ohko") {
        return {
          activated: true,
          effects: [{ effectType: "damage-reduction", target: "self" }],
          messages: [`${name} held on thanks to Sturdy!`],
          movePrevented: true,
        };
      }
      return NO_ACTIVATION;
    }

    default:
      return NO_ACTIVATION;
  }
}

// ---------------------------------------------------------------------------
// Pure utility functions for direct use by the damage calc
// ---------------------------------------------------------------------------

/**
 * Calculate the Sheer Force damage multiplier for a move.
 * Returns 5325/4096 (~1.3x) if Sheer Force is active AND the move has secondary effects.
 *
 * Source: Showdown data/abilities.ts -- sheerforce onBasePower: chainModify([5325, 4096])
 */
export function getSheerForceMultiplier(
  abilityId: string,
  effect: MoveEffect | null,
  moveId?: string,
): number {
  if (abilityId !== "sheer-force") return 1;
  if (!isSheerForceEligibleMove(effect, moveId ?? "")) return 1;
  return 5325 / 4096;
}

/**
 * Check whether Sheer Force suppresses Life Orb recoil for this move.
 *
 * Source: Showdown scripts.ts -- if move.hasSheerForce, skip Life Orb recoil
 */
export function sheerForceSuppressesLifeOrb(
  abilityId: string,
  effect: MoveEffect | null,
  moveId?: string,
): boolean {
  if (abilityId !== "sheer-force") return false;
  return isSheerForceEligibleMove(effect, moveId ?? "");
}

/**
 * Calculate the Multiscale / Shadow Shield damage multiplier.
 * Returns 0.5 if the defender has Multiscale or Shadow Shield and is at full HP.
 *
 * Source: Showdown data/abilities.ts -- multiscale/shadowshield onSourceModifyDamage
 */
export function getMultiscaleMultiplier(
  abilityId: string,
  currentHp: number,
  maxHp: number,
): number {
  if (abilityId !== "multiscale" && abilityId !== "shadow-shield") return 1;
  if (currentHp < maxHp) return 1;
  return 0.5;
}

/**
 * Calculate the Sturdy damage cap.
 * If Sturdy holder is at full HP and damage would KO, returns maxHp - 1.
 *
 * Source: Showdown data/abilities.ts -- sturdy onDamage (priority -30)
 */
export function getSturdyDamageCap(
  abilityId: string,
  damage: number,
  currentHp: number,
  maxHp: number,
): number {
  if (abilityId !== "sturdy") return damage;
  if (currentHp !== maxHp) return damage;
  if (damage < currentHp) return damage;
  return maxHp - 1;
}

/**
 * Check if Sturdy blocks an OHKO move entirely.
 *
 * Source: Showdown data/abilities.ts -- sturdy onTryHit
 */
export function sturdyBlocksOHKO(abilityId: string, effect: MoveEffect | null): boolean {
  if (abilityId !== "sturdy") return false;
  if (!effect) return false;
  return effect.type === "ohko";
}

/**
 * Get the Tough Claws multiplier.
 * Returns 5325/4096 (~1.3x) for contact moves.
 *
 * Source: Showdown data/abilities.ts -- toughclaws: chainModify([5325, 4096])
 */
export function getToughClawsMultiplier(abilityId: string, isContact: boolean): number {
  if (abilityId !== "tough-claws") return 1;
  if (!isContact) return 1;
  return 5325 / 4096;
}

/**
 * Get the Strong Jaw multiplier.
 * Returns 1.5x for bite moves.
 *
 * Source: Showdown data/abilities.ts -- strongjaw: chainModify(1.5)
 */
export function getStrongJawMultiplier(abilityId: string, isBite: boolean): number {
  if (abilityId !== "strong-jaw") return 1;
  if (!isBite) return 1;
  return 1.5;
}

/**
 * Get the Mega Launcher multiplier.
 * Returns 1.5x for pulse/aura moves.
 *
 * Source: Showdown data/abilities.ts -- megalauncher: chainModify(1.5)
 */
export function getMegaLauncherMultiplier(abilityId: string, isPulse: boolean): number {
  if (abilityId !== "mega-launcher") return 1;
  if (!isPulse) return 1;
  return 1.5;
}

/**
 * Check if Parental Bond activates for a move.
 *
 * Source: Showdown data/abilities.ts -- parentalbond onModifyMove
 */
export function isParentalBondEligible(
  abilityId: string,
  movePower: number | null,
  moveEffectType: string | null,
): boolean {
  if (abilityId !== "parental-bond") return false;
  if (!movePower || movePower <= 0) return false;
  if (moveEffectType === "multi-hit") return false;
  return true;
}

/**
 * Gen 7+ Parental Bond second-hit multiplier: 0.25 (25% of first hit).
 * Same in Gen 9 as Gen 7-8.
 *
 * Source: Showdown data/abilities.ts -- Gen 7+: parentalbond secondHit 0.25
 */
export const PARENTAL_BOND_SECOND_HIT_MULTIPLIER = 0.25;

/**
 * Get the Fur Coat defense multiplier.
 * Returns 2.0 against physical moves.
 *
 * Source: Showdown data/abilities.ts -- furcoat: onModifyDef, chainModify(2)
 */
export function getFurCoatMultiplier(abilityId: string, isPhysical: boolean): number {
  if (abilityId !== "fur-coat") return 1;
  if (!isPhysical) return 1;
  return 2;
}
