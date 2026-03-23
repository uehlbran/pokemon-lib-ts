/**
 * Tests for #757: Simple/Unaware priority order in getEffectiveStatStage.
 *
 * The correct priority order is:
 *   1. Unaware ignores opponent's stat stages (overrides Simple)
 *   2. Simple doubles stat stages (when no Unaware on opponent)
 *   3. Mold Breaker / Turboblaze / Teravolt bypass opponent's abilities
 *
 * Source: Showdown sim/battle.ts -- Unaware's onAnyModifyBoost runs before Simple's doubling
 * Source: Showdown data/abilities.ts -- moldbreaker/turboblaze/teravolt bypass Unaware/Simple
 */

import type { ActivePokemon, BattleState, DamageContext } from "@pokemon-lib-ts/battle";
import { getEffectiveStatStage } from "@pokemon-lib-ts/battle";
import type { MoveData, PokemonType } from "@pokemon-lib-ts/core";
import { SeededRandom } from "@pokemon-lib-ts/core";
import { describe, expect, it } from "vitest";
import { calculateGen5Damage } from "../src/Gen5DamageCalc";
import { GEN5_TYPE_CHART } from "../src/Gen5TypeChart";

// ---------------------------------------------------------------------------
// Helper factories (same pattern as damage-calc.test.ts)
// ---------------------------------------------------------------------------

function makeActive(overrides: {
  level?: number;
  attack?: number;
  defense?: number;
  spAttack?: number;
  spDefense?: number;
  speed?: number;
  hp?: number;
  currentHp?: number;
  types?: PokemonType[];
  ability?: string;
  heldItem?: string | null;
  status?: string | null;
  speciesId?: number;
  gender?: "male" | "female" | "genderless";
  volatiles?: Map<string, { turnsLeft: number; data?: Record<string, unknown> }>;
  statStages?: Partial<Record<string, number>>;
}): ActivePokemon {
  const hp = overrides.hp ?? 200;
  const attack = overrides.attack ?? 100;
  const defense = overrides.defense ?? 100;
  const spAttack = overrides.spAttack ?? 100;
  const spDefense = overrides.spDefense ?? 100;
  const speed = overrides.speed ?? 100;
  return {
    pokemon: {
      uid: "test",
      speciesId: overrides.speciesId ?? 1,
      nickname: null,
      level: overrides.level ?? 50,
      experience: 0,
      nature: "hardy",
      ivs: { hp: 31, attack: 31, defense: 31, spAttack: 31, spDefense: 31, speed: 31 },
      evs: { hp: 0, attack: 0, defense: 0, spAttack: 0, spDefense: 0, speed: 0 },
      currentHp: overrides.currentHp ?? hp,
      moves: [],
      ability: overrides.ability ?? "none",
      abilitySlot: "normal1" as const,
      heldItem: overrides.heldItem ?? null,
      status: (overrides.status ?? null) as any,
      friendship: 0,
      gender: (overrides.gender ?? "male") as any,
      isShiny: false,
      metLocation: "",
      metLevel: 1,
      originalTrainer: "",
      originalTrainerId: 0,
      pokeball: "pokeball",
      calculatedStats: { hp, attack, defense, spAttack, spDefense, speed },
    },
    teamSlot: 0,
    statStages: {
      attack: overrides.statStages?.attack ?? 0,
      defense: overrides.statStages?.defense ?? 0,
      spAttack: overrides.statStages?.spAttack ?? 0,
      spDefense: overrides.statStages?.spDefense ?? 0,
      speed: overrides.statStages?.speed ?? 0,
      accuracy: 0,
      evasion: 0,
    },
    volatileStatuses: overrides.volatiles ?? new Map(),
    types: overrides.types ?? ["normal"],
    ability: overrides.ability ?? "none",
    lastMoveUsed: null,
    lastDamageTaken: 0,
    lastDamageType: null,
    lastDamageCategory: null,
    turnsOnField: 0,
    movedThisTurn: false,
    consecutiveProtects: 0,
    substituteHp: 0,
    itemKnockedOff: false,
    transformed: false,
    transformedSpecies: null,
    isMega: false,
    isDynamaxed: false,
    dynamaxTurnsLeft: 0,
    isTerastallized: false,
    teraType: null,
    stellarBoostedTypes: [],
    suppressedAbility: null,
    forcedMove: null,
  } as ActivePokemon;
}

function makeMove(overrides: {
  id?: string;
  type?: PokemonType;
  category?: "physical" | "special" | "status";
  power?: number | null;
  flags?: Partial<MoveData["flags"]>;
  critRatio?: number;
}): MoveData {
  return {
    id: overrides.id ?? "tackle",
    displayName: overrides.id ?? "Tackle",
    type: overrides.type ?? "normal",
    category: overrides.category ?? "physical",
    power: overrides.power ?? 50,
    accuracy: 100,
    pp: 35,
    priority: 0,
    target: "adjacent-foe",
    flags: {
      contact: true,
      sound: false,
      bullet: false,
      pulse: false,
      punch: false,
      bite: false,
      wind: false,
      slicing: false,
      powder: false,
      protect: true,
      mirror: true,
      snatch: false,
      gravity: false,
      defrost: false,
      recharge: false,
      charge: false,
      bypassSubstitute: false,
      ...overrides.flags,
    },
    effect: null,
    description: "",
    generation: 5,
    critRatio: overrides.critRatio ?? 0,
  } as MoveData;
}

function makeState(): BattleState {
  return {
    weather: null,
    terrain: null,
    trickRoom: { active: false, turnsLeft: 0 },
    magicRoom: { active: false, turnsLeft: 0 },
    wonderRoom: { active: false, turnsLeft: 0 },
    gravity: { active: false, turnsLeft: 0 },
    format: "singles",
    generation: 5,
    turnNumber: 1,
    sides: [{}, {}],
  } as unknown as BattleState;
}

function makeDamageContext(overrides: {
  attacker?: ActivePokemon;
  defender?: ActivePokemon;
  move?: MoveData;
  state?: BattleState;
  isCrit?: boolean;
  seed?: number;
}): DamageContext {
  return {
    attacker: overrides.attacker ?? makeActive({}),
    defender: overrides.defender ?? makeActive({}),
    move: overrides.move ?? makeMove({}),
    state: overrides.state ?? makeState(),
    rng: new SeededRandom(overrides.seed ?? 42),
    isCrit: overrides.isCrit ?? false,
  };
}

const typeChart = GEN5_TYPE_CHART as Record<string, Record<string, number>>;

// ---------------------------------------------------------------------------
// #757: Simple/Unaware priority order
// ---------------------------------------------------------------------------

describe("#757 — Simple/Unaware priority order in getEffectiveStatStage", () => {
  it("given attacker has Simple with +2 atk stages and defender has Unaware, when calculating damage, then Unaware ignores stages (Unaware beats Simple)", () => {
    // Source: Showdown data/abilities.ts -- Unaware onAnyModifyBoost; Simple
    // Unaware ignores opponent's stat changes, so +2 (or +4 from Simple) should be treated as 0.
    // Compare: with Unaware defender, the attack stage multiplier is 1.0x (stage 0).
    // Without Unaware, Simple would double +2 to +4, giving a 3.0x multiplier.
    //
    // We verify by comparing damage with Unaware defender vs. a no-ability defender.
    // With Unaware: damage should equal baseline (no stat stages).
    const attacker = makeActive({
      ability: "simple",
      attack: 100,
      types: ["normal"],
      statStages: { attack: 2 },
    });
    const defenderUnaware = makeActive({
      ability: "unaware",
      defense: 100,
      types: ["normal"],
    });
    const move = makeMove({ type: "normal", power: 50, category: "physical" });

    const resultUnaware = calculateGen5Damage(
      makeDamageContext({ attacker, defender: defenderUnaware, move, seed: 99999 }),
      typeChart,
    );

    // Baseline: same attacker but with 0 stat stages and no-ability defender
    const attackerBaseline = makeActive({
      ability: "none",
      attack: 100,
      types: ["normal"],
      statStages: { attack: 0 },
    });
    const defenderBaseline = makeActive({
      ability: "none",
      defense: 100,
      types: ["normal"],
    });

    const resultBaseline = calculateGen5Damage(
      makeDamageContext({
        attacker: attackerBaseline,
        defender: defenderBaseline,
        move,
        seed: 99999,
      }),
      typeChart,
    );

    // With Unaware, the attacker's +2 Simple stages are ignored entirely.
    // The damage should be identical to a 0-stage attacker with no abilities.
    expect(resultUnaware.damage).toBe(resultBaseline.damage);
  });

  it("given attacker has Simple with +2 atk stages and defender has no Unaware, when calculating damage, then Simple doubles stages to +4 (3.0x multiplier)", () => {
    // Source: Showdown data/abilities.ts -- Simple: boosts are doubled
    // Simple doubles +2 to +4. Stage +4 multiplier = 6/2 = 3.0x.
    // Without Simple, +2 gives 4/2 = 2.0x multiplier.
    // So Simple attacker damage should be higher than non-Simple attacker with same stages.
    const attackerSimple = makeActive({
      ability: "simple",
      attack: 100,
      types: ["normal"],
      statStages: { attack: 2 },
    });
    const attackerNormal = makeActive({
      ability: "none",
      attack: 100,
      types: ["normal"],
      statStages: { attack: 2 },
    });
    const defender = makeActive({
      ability: "none",
      defense: 100,
      types: ["normal"],
    });
    const move = makeMove({ type: "normal", power: 50, category: "physical" });

    const resultSimple = calculateGen5Damage(
      makeDamageContext({ attacker: attackerSimple, defender, move, seed: 99999 }),
      typeChart,
    );
    const resultNormal = calculateGen5Damage(
      makeDamageContext({ attacker: attackerNormal, defender, move, seed: 99999 }),
      typeChart,
    );

    // Simple at +2 (effective +4, 3.0x) should deal more than non-Simple at +2 (2.0x).
    // With 100 attack, 100 defense, power 50, level 50:
    // Base damage ≈ floor(floor(floor(2*50/5+2) * 50 * atk/def) / 50 + 2)
    //            ≈ floor(floor(22 * 50 * 1) / 50 + 2) = floor(22 + 2) = 24 (before roll)
    // With 3.0x multiplier (Simple +4): floor(100 * 3.0) = 300 effective attack
    // With 2.0x multiplier (Normal +2): floor(100 * 2.0) = 200 effective attack
    expect(resultSimple.damage).toBeGreaterThan(resultNormal.damage);
  });

  it("given attacker has Mold Breaker with +2 atk stages and defender has Unaware, when calculating damage, then Mold Breaker bypasses Unaware (stages apply)", () => {
    // Source: Showdown data/abilities.ts -- moldbreaker bypasses Unaware
    // Mold Breaker on the attacker bypasses the defender's Unaware, so +2 stages should apply.
    const attackerMoldBreaker = makeActive({
      ability: "mold-breaker",
      attack: 100,
      types: ["normal"],
      statStages: { attack: 2 },
    });
    const defenderUnaware = makeActive({
      ability: "unaware",
      defense: 100,
      types: ["normal"],
    });
    const move = makeMove({ type: "normal", power: 50, category: "physical" });

    const resultMoldBreaker = calculateGen5Damage(
      makeDamageContext({
        attacker: attackerMoldBreaker,
        defender: defenderUnaware,
        move,
        seed: 99999,
      }),
      typeChart,
    );

    // Compare with a non-Mold Breaker attacker at +2 stages and no Unaware
    const attackerNormal = makeActive({
      ability: "none",
      attack: 100,
      types: ["normal"],
      statStages: { attack: 2 },
    });
    const defenderNone = makeActive({
      ability: "none",
      defense: 100,
      types: ["normal"],
    });

    const resultNormal = calculateGen5Damage(
      makeDamageContext({ attacker: attackerNormal, defender: defenderNone, move, seed: 99999 }),
      typeChart,
    );

    // Mold Breaker bypasses Unaware, so +2 stages should apply normally.
    // The damage should equal +2 stages without Unaware.
    expect(resultMoldBreaker.damage).toBe(resultNormal.damage);
  });

  it("given attacker has Turboblaze with +3 atk stages and defender has Unaware, when calculating damage, then Turboblaze bypasses Unaware (stages apply)", () => {
    // Source: Showdown data/abilities.ts -- turboblaze has the same effect as moldbreaker
    // Turboblaze was introduced in Gen 5 (Reshiram). It should bypass Unaware.
    const attackerTurboblaze = makeActive({
      ability: "turboblaze",
      attack: 100,
      types: ["normal"],
      statStages: { attack: 3 },
    });
    const defenderUnaware = makeActive({
      ability: "unaware",
      defense: 100,
      types: ["normal"],
    });
    const move = makeMove({ type: "normal", power: 50, category: "physical" });

    const resultTurboblaze = calculateGen5Damage(
      makeDamageContext({
        attacker: attackerTurboblaze,
        defender: defenderUnaware,
        move,
        seed: 99999,
      }),
      typeChart,
    );

    // Compare with a baseline at +3 stages with no Unaware
    const attackerBaseline = makeActive({
      ability: "none",
      attack: 100,
      types: ["normal"],
      statStages: { attack: 3 },
    });
    const defenderNone = makeActive({
      ability: "none",
      defense: 100,
      types: ["normal"],
    });

    const resultBaseline = calculateGen5Damage(
      makeDamageContext({ attacker: attackerBaseline, defender: defenderNone, move, seed: 99999 }),
      typeChart,
    );

    // Turboblaze bypasses Unaware, so +3 stages apply.
    expect(resultTurboblaze.damage).toBe(resultBaseline.damage);
  });

  it("given defender has Simple with +2 def stages and attacker has Mold Breaker, when calculating damage, then Mold Breaker bypasses defender's Simple (defense stages not doubled)", () => {
    // Source: Showdown data/abilities.ts -- moldbreaker bypasses Simple on the opponent
    // When Mold Breaker is on the attacker, the defender's Simple should be bypassed.
    // So defender's +2 def stages stay at +2 (not doubled to +4).
    const attackerMoldBreaker = makeActive({
      ability: "mold-breaker",
      attack: 100,
      types: ["normal"],
    });
    const defenderSimple = makeActive({
      ability: "simple",
      defense: 100,
      types: ["normal"],
      statStages: { defense: 2 },
    });
    const move = makeMove({ type: "normal", power: 50, category: "physical" });

    const resultMoldBreaker = calculateGen5Damage(
      makeDamageContext({
        attacker: attackerMoldBreaker,
        defender: defenderSimple,
        move,
        seed: 99999,
      }),
      typeChart,
    );

    // Compare with attacker who doesn't have Mold Breaker -- defender's Simple doubles to +4
    const attackerNone = makeActive({
      ability: "none",
      attack: 100,
      types: ["normal"],
    });

    const resultNoBreaker = calculateGen5Damage(
      makeDamageContext({ attacker: attackerNone, defender: defenderSimple, move, seed: 99999 }),
      typeChart,
    );

    // With Mold Breaker: defender has +2 def (2.0x), lower defense = MORE damage
    // Without Mold Breaker: defender has +4 def (3.0x from Simple), higher defense = LESS damage
    // So Mold Breaker should produce MORE damage than without it.
    expect(resultMoldBreaker.damage).toBeGreaterThan(resultNoBreaker.damage);
  });

  it("given attacker has Unaware and defender has Mold Breaker with +2 def stages, when calculating defense stat stage, then Unaware zeros defender's stages (defender MB cannot bypass attacker's Unaware)", () => {
    // Source: Showdown data/abilities.ts -- moldbreaker isBreaking only suppresses target's abilities
    // when attacking. Mold Breaker on the DEFENDER cannot prevent the ATTACKER's Unaware from
    // zeroing the defender's own defense stages. Only the attacker's ability side matters here.
    const attacker = makeActive({
      ability: "unaware",
    });
    const defender = makeActive({
      ability: "mold-breaker",
      statStages: { defense: 2 },
    });

    // getEffectiveStatStage(pokemon, stat, opponent, role) — defender is "pokemon", attacker is "opponent" in defense context
    const stage = getEffectiveStatStage(defender, "defense", attacker, "defense");

    // Unaware on the attacker ignores the defender's +2 defense stages regardless of defender's Mold Breaker.
    expect(stage).toBe(0);
  });
});
