import type { ActivePokemon, DamageContext } from "@pokemon-lib-ts/battle";
import type { MoveData, MoveEffect, PokemonInstance, PokemonType } from "@pokemon-lib-ts/core";
import { DataManager } from "@pokemon-lib-ts/core";
import { describe, expect, it } from "vitest";
import { applyGen4Ability } from "../src/Gen4Abilities";
import { calculateGen4Damage } from "../src/Gen4DamageCalc";
import { Gen4Ruleset } from "../src/Gen4Ruleset";
import { GEN4_TYPE_CHART } from "../src/Gen4TypeChart";

/**
 * Gen 4 Stat-Modifying Abilities Tests
 *
 * Covers:
 *   - Solar Power: 1.5x SpAtk in sun (damage calc)
 *   - Flower Gift: 1.5x Atk in sun (attacker), 1.5x SpDef in sun (defender)
 *   - Scrappy: Normal/Fighting hit Ghost neutrally
 *   - Normalize: all moves become Normal type
 *   - Slow Start: halve Attack and Speed for 5 turns
 *   - Download: compare foe Def/SpDef, raise Atk or SpAtk
 *
 * Source: Showdown sim/battle-actions.ts — Gen 4 mod
 * Source: Bulbapedia — individual ability mechanics
 */

// ---------------------------------------------------------------------------
// Test helpers
// ---------------------------------------------------------------------------

function createMockRng(intReturnValue: number) {
  return {
    next: () => 0,
    int: (_min: number, _max: number) => intReturnValue,
    chance: () => false,
    pick: <T>(arr: readonly T[]) => arr[0] as T,
    shuffle: <T>(arr: readonly T[]) => [...arr],
    getState: () => 0,
    setState: () => {},
  };
}

function createActivePokemon(opts: {
  level?: number;
  attack?: number;
  defense?: number;
  spAttack?: number;
  spDefense?: number;
  hp?: number;
  currentHp?: number;
  types?: PokemonType[];
  ability?: string;
  heldItem?: string | null;
  status?: "burn" | "poison" | "paralysis" | "sleep" | "freeze" | null;
  gender?: "male" | "female" | "genderless";
  speciesId?: number;
  volatiles?: Map<string, { turnsLeft: number }>;
}): ActivePokemon {
  const level = opts.level ?? 50;
  const maxHp = opts.hp ?? 200;
  const stats = {
    hp: maxHp,
    attack: opts.attack ?? 100,
    defense: opts.defense ?? 100,
    spAttack: opts.spAttack ?? 100,
    spDefense: opts.spDefense ?? 100,
    speed: 100,
  };

  const pokemon = {
    uid: "test",
    speciesId: opts.speciesId ?? 1,
    nickname: null,
    level,
    experience: 0,
    nature: "hardy",
    ivs: { hp: 0, attack: 0, defense: 0, spAttack: 0, spDefense: 0, speed: 0 },
    evs: { hp: 0, attack: 0, defense: 0, spAttack: 0, spDefense: 0, speed: 0 },
    currentHp: opts.currentHp ?? maxHp,
    moves: [],
    ability: opts.ability ?? "",
    abilitySlot: "normal1" as const,
    heldItem: opts.heldItem ?? null,
    status: opts.status ?? null,
    friendship: 0,
    gender: opts.gender ?? ("male" as const),
    isShiny: false,
    metLocation: "",
    metLevel: 1,
    originalTrainer: "",
    originalTrainerId: 0,
    pokeball: "pokeball",
    calculatedStats: stats,
  } as PokemonInstance;

  return {
    pokemon,
    teamSlot: 0,
    statStages: {
      attack: 0,
      defense: 0,
      spAttack: 0,
      spDefense: 0,
      speed: 0,
      accuracy: 0,
      evasion: 0,
    },
    volatileStatuses: opts.volatiles ?? new Map(),
    types: opts.types ?? ["normal"],
    ability: opts.ability ?? "",
    lastMoveUsed: null,
    lastDamageTaken: 0,
    lastDamageType: null,
    turnsOnField: 0,
    movedThisTurn: false,
    consecutiveProtects: 0,
    substituteHp: 0,
    transformed: false,
    transformedSpecies: null,
    isMega: false,
    isDynamaxed: false,
    dynamaxTurnsLeft: 0,
    isTerastallized: false,
    teraType: null,
  } as ActivePokemon;
}

function createMove(opts: {
  type: PokemonType;
  power: number;
  category?: "physical" | "special" | "status";
  id?: string;
  effect?: MoveEffect | null;
}): MoveData {
  return {
    id: opts.id ?? "test-move",
    displayName: "Test Move",
    type: opts.type,
    category: opts.category ?? "physical",
    power: opts.power,
    accuracy: 100,
    pp: 35,
    priority: 0,
    target: "adjacent-foe",
    flags: {
      contact: false,
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
    },
    effect: opts.effect ?? null,
    description: "",
    generation: 4,
  } as MoveData;
}

function createMockState(weather?: { type: string; turnsLeft: number; source: string } | null) {
  return {
    weather: weather ?? null,
    gravity: { active: false, turnsLeft: 0 },
  } as DamageContext["state"];
}

// ===========================================================================
// Solar Power — 1.5x SpAtk in sun (damage calc)
// ===========================================================================

describe("Gen4 Solar Power — 1.5x SpAtk in Harsh Sunlight", () => {
  it("given Solar Power attacker using a special move in sun, when damage is calculated, then SpAtk is boosted by 1.5x", () => {
    // Source: Bulbapedia — Solar Power: "During harsh sunlight, the Pokemon's Special Attack
    //   stat is boosted by 50%."
    // Source: Showdown data/abilities.ts — Solar Power onModifySpAPriority
    const attacker = createActivePokemon({ ability: "solar-power", spAttack: 100 });
    const noAbilityAttacker = createActivePokemon({ ability: "", spAttack: 100 });
    const defender = createActivePokemon({ defense: 100, spDefense: 100 });
    const move = createMove({ type: "fire", power: 80, category: "special" });

    const rng = createMockRng(100); // max roll
    const state = createMockState({ type: "sun", turnsLeft: 5, source: "sunny-day" });

    const withSolarPower = calculateGen4Damage(
      { attacker, defender, move, isCrit: false, state, rng } as DamageContext,
      GEN4_TYPE_CHART,
    );

    const withoutSolarPower = calculateGen4Damage(
      { attacker: noAbilityAttacker, defender, move, isCrit: false, state, rng } as DamageContext,
      GEN4_TYPE_CHART,
    );

    // Solar Power should produce higher damage for special moves in sun
    expect(withSolarPower.damage).toBeGreaterThan(withoutSolarPower.damage);
  });

  it("given Solar Power attacker using a special move without sun, when damage is calculated, then no SpAtk boost is applied", () => {
    // Source: Bulbapedia — Solar Power: only activates in harsh sunlight
    const attacker = createActivePokemon({ ability: "solar-power", spAttack: 100 });
    const noAbilityAttacker = createActivePokemon({ ability: "", spAttack: 100 });
    const defender = createActivePokemon({ defense: 100, spDefense: 100 });
    const move = createMove({ type: "fire", power: 80, category: "special" });

    const rng = createMockRng(100);
    const state = createMockState(); // no weather

    const withSolarPower = calculateGen4Damage(
      { attacker, defender, move, isCrit: false, state, rng } as DamageContext,
      GEN4_TYPE_CHART,
    );

    const withoutSolarPower = calculateGen4Damage(
      { attacker: noAbilityAttacker, defender, move, isCrit: false, state, rng } as DamageContext,
      GEN4_TYPE_CHART,
    );

    expect(withSolarPower.damage).toBe(withoutSolarPower.damage);
  });

  it("given Solar Power attacker using a physical move in sun, when damage is calculated, then no boost is applied (SpAtk only)", () => {
    // Source: Bulbapedia — Solar Power: boosts Special Attack, not Attack
    const attacker = createActivePokemon({ ability: "solar-power", attack: 100 });
    const noAbilityAttacker = createActivePokemon({ ability: "", attack: 100 });
    const defender = createActivePokemon({ defense: 100 });
    const move = createMove({ type: "fire", power: 80, category: "physical" });

    const rng = createMockRng(100);
    const state = createMockState({ type: "sun", turnsLeft: 5, source: "sunny-day" });

    const withSolarPower = calculateGen4Damage(
      { attacker, defender, move, isCrit: false, state, rng } as DamageContext,
      GEN4_TYPE_CHART,
    );

    const withoutSolarPower = calculateGen4Damage(
      { attacker: noAbilityAttacker, defender, move, isCrit: false, state, rng } as DamageContext,
      GEN4_TYPE_CHART,
    );

    expect(withSolarPower.damage).toBe(withoutSolarPower.damage);
  });

  it("given Solar Power attacker in rain, when using a special move, then no SpAtk boost is applied", () => {
    // Source: Bulbapedia — Solar Power: only harsh sunlight, not other weather
    const attacker = createActivePokemon({ ability: "solar-power", spAttack: 100 });
    const noAbilityAttacker = createActivePokemon({ ability: "", spAttack: 100 });
    const defender = createActivePokemon({ spDefense: 100 });
    const move = createMove({ type: "water", power: 80, category: "special" });

    const rng = createMockRng(100);
    const state = createMockState({ type: "rain", turnsLeft: 5, source: "rain-dance" });

    const withSolarPower = calculateGen4Damage(
      { attacker, defender, move, isCrit: false, state, rng } as DamageContext,
      GEN4_TYPE_CHART,
    );

    const withoutSolarPower = calculateGen4Damage(
      { attacker: noAbilityAttacker, defender, move, isCrit: false, state, rng } as DamageContext,
      GEN4_TYPE_CHART,
    );

    expect(withSolarPower.damage).toBe(withoutSolarPower.damage);
  });
});

// ===========================================================================
// Flower Gift — 1.5x Atk (attacker) and 1.5x SpDef (defender) in sun
// ===========================================================================

describe("Gen4 Flower Gift — 1.5x Atk and 1.5x SpDef in Harsh Sunlight", () => {
  it("given Flower Gift attacker using a physical move in sun, when damage is calculated, then Attack is boosted by 1.5x", () => {
    // Source: Bulbapedia — Flower Gift: "During harsh sunlight, the Attack and Special Defense
    //   stats of the Pokemon with this Ability and its allies are boosted by 50%."
    // Source: Showdown data/abilities.ts — Flower Gift onAllyModifyAtkPriority
    const attacker = createActivePokemon({ ability: "flower-gift", attack: 100 });
    const noAbilityAttacker = createActivePokemon({ ability: "", attack: 100 });
    const defender = createActivePokemon({ defense: 100 });
    const move = createMove({ type: "normal", power: 80, category: "physical" });

    const rng = createMockRng(100);
    const state = createMockState({ type: "sun", turnsLeft: 5, source: "sunny-day" });

    const withFlowerGift = calculateGen4Damage(
      { attacker, defender, move, isCrit: false, state, rng } as DamageContext,
      GEN4_TYPE_CHART,
    );

    const withoutFlowerGift = calculateGen4Damage(
      { attacker: noAbilityAttacker, defender, move, isCrit: false, state, rng } as DamageContext,
      GEN4_TYPE_CHART,
    );

    expect(withFlowerGift.damage).toBeGreaterThan(withoutFlowerGift.damage);
  });

  it("given Flower Gift defender taking a special move in sun, when damage is calculated, then SpDef is boosted by 1.5x (less damage taken)", () => {
    // Source: Bulbapedia — Flower Gift: boosts SpDef of the holder by 50% in sun
    // Source: Showdown data/abilities.ts — Flower Gift onAllyModifySpDPriority
    const attacker = createActivePokemon({ spAttack: 100 });
    const flowerGiftDefender = createActivePokemon({
      ability: "flower-gift",
      spDefense: 100,
    });
    const normalDefender = createActivePokemon({ ability: "", spDefense: 100 });
    const move = createMove({ type: "water", power: 80, category: "special" });

    const rng = createMockRng(100);
    const state = createMockState({ type: "sun", turnsLeft: 5, source: "sunny-day" });

    const againstFlowerGift = calculateGen4Damage(
      {
        attacker,
        defender: flowerGiftDefender,
        move,
        isCrit: false,
        state,
        rng,
      } as DamageContext,
      GEN4_TYPE_CHART,
    );

    const againstNormal = calculateGen4Damage(
      { attacker, defender: normalDefender, move, isCrit: false, state, rng } as DamageContext,
      GEN4_TYPE_CHART,
    );

    // Flower Gift defender should take LESS damage due to SpDef boost
    expect(againstFlowerGift.damage).toBeLessThan(againstNormal.damage);
  });

  it("given Flower Gift attacker without sun, when using a physical move, then no Attack boost is applied", () => {
    // Source: Bulbapedia — Flower Gift: only activates in harsh sunlight
    const attacker = createActivePokemon({ ability: "flower-gift", attack: 100 });
    const noAbilityAttacker = createActivePokemon({ ability: "", attack: 100 });
    const defender = createActivePokemon({ defense: 100 });
    const move = createMove({ type: "normal", power: 80, category: "physical" });

    const rng = createMockRng(100);
    const state = createMockState(); // no weather

    const withFlowerGift = calculateGen4Damage(
      { attacker, defender, move, isCrit: false, state, rng } as DamageContext,
      GEN4_TYPE_CHART,
    );

    const withoutFlowerGift = calculateGen4Damage(
      { attacker: noAbilityAttacker, defender, move, isCrit: false, state, rng } as DamageContext,
      GEN4_TYPE_CHART,
    );

    expect(withFlowerGift.damage).toBe(withoutFlowerGift.damage);
  });

  it("given Flower Gift attacker using a special move in sun, when damage is calculated, then no SpAtk boost (Atk only)", () => {
    // Source: Bulbapedia — Flower Gift: boosts Attack, not Special Attack
    const attacker = createActivePokemon({ ability: "flower-gift", spAttack: 100 });
    const noAbilityAttacker = createActivePokemon({ ability: "", spAttack: 100 });
    const defender = createActivePokemon({ spDefense: 100 });
    const move = createMove({ type: "fire", power: 80, category: "special" });

    const rng = createMockRng(100);
    const state = createMockState({ type: "sun", turnsLeft: 5, source: "sunny-day" });

    const withFlowerGift = calculateGen4Damage(
      { attacker, defender, move, isCrit: false, state, rng } as DamageContext,
      GEN4_TYPE_CHART,
    );

    const withoutFlowerGift = calculateGen4Damage(
      { attacker: noAbilityAttacker, defender, move, isCrit: false, state, rng } as DamageContext,
      GEN4_TYPE_CHART,
    );

    expect(withFlowerGift.damage).toBe(withoutFlowerGift.damage);
  });
});

// ===========================================================================
// Scrappy — Normal/Fighting hit Ghost neutrally
// ===========================================================================

describe("Gen4 Scrappy — Normal/Fighting moves hit Ghost-types", () => {
  it("given Scrappy attacker using a Normal move against pure Ghost, when damage is calculated, then Ghost immunity is overridden and damage is dealt", () => {
    // Source: Bulbapedia — Scrappy: "Allows the Pokemon's Normal- and Fighting-type moves
    //   to hit Ghost-type Pokemon."
    // Source: Showdown data/abilities.ts — Scrappy onModifyMovePriority
    const attacker = createActivePokemon({ ability: "scrappy", attack: 100 });
    const ghostDefender = createActivePokemon({
      types: ["ghost"],
      defense: 100,
    });
    const move = createMove({ type: "normal", power: 80, category: "physical" });

    const rng = createMockRng(100);
    const state = createMockState();

    const result = calculateGen4Damage(
      { attacker, defender: ghostDefender, move, isCrit: false, state, rng } as DamageContext,
      GEN4_TYPE_CHART,
    );

    // Normal would normally be immune to Ghost, but Scrappy overrides this
    expect(result.damage).toBeGreaterThan(0);
    expect(result.effectiveness).toBe(1); // neutral, not immune
  });

  it("given Scrappy attacker using a Fighting move against Ghost/Dark, when damage is calculated, then Ghost immunity is overridden and Dark weakness applies", () => {
    // Source: Bulbapedia — Scrappy: removes Ghost immunity for Normal and Fighting
    // Source: Showdown Gen 4 — Scrappy allows Fighting to hit Ghost
    // Derivation: Fighting vs Ghost/Dark — Ghost immunity overridden, Fighting vs Dark = 2x
    const attacker = createActivePokemon({ ability: "scrappy", attack: 100 });
    const ghostDarkDefender = createActivePokemon({
      types: ["ghost", "dark"],
      defense: 100,
    });
    const move = createMove({ type: "fighting", power: 80, category: "physical" });

    const rng = createMockRng(100);
    const state = createMockState();

    const result = calculateGen4Damage(
      { attacker, defender: ghostDarkDefender, move, isCrit: false, state, rng } as DamageContext,
      GEN4_TYPE_CHART,
    );

    // Fighting vs Dark = 2x, Ghost immunity removed by Scrappy
    expect(result.damage).toBeGreaterThan(0);
    expect(result.effectiveness).toBe(2);
  });

  it("given a non-Scrappy attacker using a Normal move against Ghost, when damage is calculated, then Ghost immunity still applies", () => {
    // Source: Bulbapedia — without Scrappy, Normal is immune to Ghost
    const attacker = createActivePokemon({ ability: "", attack: 100 });
    const ghostDefender = createActivePokemon({
      types: ["ghost"],
      defense: 100,
    });
    const move = createMove({ type: "normal", power: 80, category: "physical" });

    const rng = createMockRng(100);
    const state = createMockState();

    const result = calculateGen4Damage(
      { attacker, defender: ghostDefender, move, isCrit: false, state, rng } as DamageContext,
      GEN4_TYPE_CHART,
    );

    expect(result.damage).toBe(0);
    expect(result.effectiveness).toBe(0);
  });

  it("given Scrappy attacker using a Fire move against Ghost, when damage is calculated, then Ghost type chart applies normally (Scrappy only affects Normal/Fighting)", () => {
    // Source: Bulbapedia — Scrappy: only Normal and Fighting type moves are affected
    const attacker = createActivePokemon({ ability: "scrappy", attack: 100 });
    const ghostDefender = createActivePokemon({
      types: ["ghost"],
      defense: 100,
    });
    const move = createMove({ type: "fire", power: 80, category: "physical" });

    const rng = createMockRng(100);
    const state = createMockState();

    const result = calculateGen4Damage(
      { attacker, defender: ghostDefender, move, isCrit: false, state, rng } as DamageContext,
      GEN4_TYPE_CHART,
    );

    // Fire vs Ghost = 1x (neutral), not immune. Scrappy not relevant here.
    expect(result.damage).toBeGreaterThan(0);
    expect(result.effectiveness).toBe(1);
  });
});

// ===========================================================================
// Normalize — all moves become Normal type
// ===========================================================================

describe("Gen4 Normalize — all moves become Normal type", () => {
  it("given Normalize attacker using a Fire move, when damage is calculated, then the move is treated as Normal type (no STAB for non-Normal types)", () => {
    // Source: Bulbapedia — Normalize: "All the Pokemon's moves become Normal-type."
    // Source: Showdown data/abilities.ts — Normalize onModifyMove
    // A Fire-type Pokemon with Normalize loses STAB on a Fire move (it's now Normal)
    const fireAttacker = createActivePokemon({
      ability: "normalize",
      attack: 100,
      types: ["fire"],
    });
    const fireAttackerNoAbility = createActivePokemon({
      ability: "",
      attack: 100,
      types: ["fire"],
    });
    const defender = createActivePokemon({ defense: 100, types: ["normal"] });
    const fireMove = createMove({ type: "fire", power: 80, category: "physical" });

    const rng = createMockRng(100);
    const state = createMockState();

    const withNormalize = calculateGen4Damage(
      {
        attacker: fireAttacker,
        defender,
        move: fireMove,
        isCrit: false,
        state,
        rng,
      } as DamageContext,
      GEN4_TYPE_CHART,
    );

    const withoutNormalize = calculateGen4Damage(
      {
        attacker: fireAttackerNoAbility,
        defender,
        move: fireMove,
        isCrit: false,
        state,
        rng,
      } as DamageContext,
      GEN4_TYPE_CHART,
    );

    // Without Normalize: Fire STAB applies (1.5x), move type is Fire
    // With Normalize: move becomes Normal, Fire Pokemon doesn't get Normal STAB
    expect(withNormalize.damage).toBeLessThan(withoutNormalize.damage);
  });

  it("given Normalize attacker that is Normal-type using any move, when damage is calculated, then STAB applies (move becomes Normal = matching type)", () => {
    // Source: Bulbapedia — Normalize: all moves become Normal; Normal-type Pokemon get STAB
    // Derivation: Normal-type attacker with Normalize → move becomes Normal → STAB applies
    const normalAttacker = createActivePokemon({
      ability: "normalize",
      attack: 100,
      types: ["normal"],
    });
    const normalAttackerNoAbility = createActivePokemon({
      ability: "",
      attack: 100,
      types: ["normal"],
    });
    const defender = createActivePokemon({ defense: 100, types: ["water"] });
    // Use a Fire move — without Normalize, no STAB (attacker is Normal, move is Fire)
    // With Normalize, the Fire move becomes Normal → Normal-type attacker gets STAB
    const fireMove = createMove({ type: "fire", power: 80, category: "physical" });

    const rng = createMockRng(100);
    const state = createMockState();

    const withNormalize = calculateGen4Damage(
      {
        attacker: normalAttacker,
        defender,
        move: fireMove,
        isCrit: false,
        state,
        rng,
      } as DamageContext,
      GEN4_TYPE_CHART,
    );

    const withoutNormalize = calculateGen4Damage(
      {
        attacker: normalAttackerNoAbility,
        defender,
        move: fireMove,
        isCrit: false,
        state,
        rng,
      } as DamageContext,
      GEN4_TYPE_CHART,
    );

    // With Normalize: Normal STAB (1.5x), type effectiveness Normal vs Water = 1x
    // Without Normalize: no STAB (Normal attacker, Fire move), Fire vs Water = 0.5x
    expect(withNormalize.damage).toBeGreaterThan(withoutNormalize.damage);
  });

  it("given Normalize attacker using a Fighting move against Ghost, when damage is calculated, then move becomes Normal (immune to Ghost)", () => {
    // Source: Bulbapedia — Normalize: moves become Normal type; Normal is immune to Ghost
    // This is a notable downside of Normalize — Fighting moves no longer hit Ghost
    const attacker = createActivePokemon({
      ability: "normalize",
      attack: 100,
      types: ["normal"],
    });
    const ghostDefender = createActivePokemon({ types: ["ghost"], defense: 100 });
    const fightingMove = createMove({
      type: "fighting",
      power: 80,
      category: "physical",
    });

    const rng = createMockRng(100);
    const state = createMockState();

    const result = calculateGen4Damage(
      {
        attacker,
        defender: ghostDefender,
        move: fightingMove,
        isCrit: false,
        state,
        rng,
      } as DamageContext,
      GEN4_TYPE_CHART,
    );

    // Fighting move becomes Normal via Normalize, and Normal is immune to Ghost
    expect(result.damage).toBe(0);
    expect(result.effectiveness).toBe(0);
  });

  it("given Normalize attacker using a Water move in rain, when damage is calculated, then no rain boost (move is Normal, not Water)", () => {
    // Source: Bulbapedia — Normalize changes the move's type to Normal
    // Rain boosts Water moves, but Normalize makes it Normal — no rain bonus
    const attacker = createActivePokemon({
      ability: "normalize",
      spAttack: 100,
      types: ["normal"],
    });
    const defender = createActivePokemon({ spDefense: 100, types: ["normal"] });
    const waterMove = createMove({ type: "water", power: 80, category: "special" });

    const rng = createMockRng(100);
    const rainState = createMockState({ type: "rain", turnsLeft: 5, source: "rain-dance" });

    const normalizeResult = calculateGen4Damage(
      {
        attacker,
        defender,
        move: waterMove,
        isCrit: false,
        state: rainState,
        rng,
      } as DamageContext,
      GEN4_TYPE_CHART,
    );

    // Compare with no-weather Normalize to confirm rain doesn't boost
    const noWeatherState = createMockState();
    const normalizeNoWeather = calculateGen4Damage(
      {
        attacker,
        defender,
        move: waterMove,
        isCrit: false,
        state: noWeatherState,
        rng,
      } as DamageContext,
      GEN4_TYPE_CHART,
    );

    // Both should be equal — rain doesn't boost Normal-type moves
    expect(normalizeResult.damage).toBe(normalizeNoWeather.damage);
  });
});

// ===========================================================================
// Slow Start — halve Attack and Speed for 5 turns
// ===========================================================================

describe("Gen4 Slow Start — halve Attack and Speed for 5 turns", () => {
  it("given Slow Start attacker with slow-start volatile active, when using a physical move, then Attack is halved", () => {
    // Source: Bulbapedia — Slow Start: "Halves Attack and Speed for 5 turns upon entering battle."
    // Source: Showdown data/abilities.ts — Slow Start onModifyAtkPriority
    const slowStartVolatiles = new Map([["slow-start", { turnsLeft: 5 }]]);
    const attacker = createActivePokemon({
      ability: "slow-start",
      attack: 100,
      volatiles: slowStartVolatiles,
    });
    const noAbilityAttacker = createActivePokemon({ ability: "", attack: 100 });
    const defender = createActivePokemon({ defense: 100 });
    const move = createMove({ type: "normal", power: 80, category: "physical" });

    const rng = createMockRng(100);
    const state = createMockState();

    const withSlowStart = calculateGen4Damage(
      { attacker, defender, move, isCrit: false, state, rng } as DamageContext,
      GEN4_TYPE_CHART,
    );

    const withoutSlowStart = calculateGen4Damage(
      { attacker: noAbilityAttacker, defender, move, isCrit: false, state, rng } as DamageContext,
      GEN4_TYPE_CHART,
    );

    // Slow Start halves Attack, so damage should be significantly lower
    expect(withSlowStart.damage).toBeLessThan(withoutSlowStart.damage);
  });

  it("given Slow Start attacker without slow-start volatile (expired), when using a physical move, then Attack is not halved", () => {
    // Source: Bulbapedia — Slow Start: after 5 turns, the halving stops
    // Source: Showdown Gen 4 — Slow Start checks for volatile, not just ability
    const attacker = createActivePokemon({
      ability: "slow-start",
      attack: 100,
      // No slow-start volatile = effect has expired
    });
    const noAbilityAttacker = createActivePokemon({ ability: "", attack: 100 });
    const defender = createActivePokemon({ defense: 100 });
    const move = createMove({ type: "normal", power: 80, category: "physical" });

    const rng = createMockRng(100);
    const state = createMockState();

    const withSlowStart = calculateGen4Damage(
      { attacker, defender, move, isCrit: false, state, rng } as DamageContext,
      GEN4_TYPE_CHART,
    );

    const withoutSlowStart = calculateGen4Damage(
      { attacker: noAbilityAttacker, defender, move, isCrit: false, state, rng } as DamageContext,
      GEN4_TYPE_CHART,
    );

    // No volatile → no halving → same damage
    expect(withSlowStart.damage).toBe(withoutSlowStart.damage);
  });

  it("given Slow Start attacker with slow-start volatile active, when using a special move, then no SpAtk penalty (only Attack is halved)", () => {
    // Source: Bulbapedia — Slow Start: halves Attack (not Special Attack)
    const slowStartVolatiles = new Map([["slow-start", { turnsLeft: 3 }]]);
    const attacker = createActivePokemon({
      ability: "slow-start",
      spAttack: 100,
      volatiles: slowStartVolatiles,
    });
    const noAbilityAttacker = createActivePokemon({ ability: "", spAttack: 100 });
    const defender = createActivePokemon({ spDefense: 100 });
    const move = createMove({ type: "fire", power: 80, category: "special" });

    const rng = createMockRng(100);
    const state = createMockState();

    const withSlowStart = calculateGen4Damage(
      { attacker, defender, move, isCrit: false, state, rng } as DamageContext,
      GEN4_TYPE_CHART,
    );

    const withoutSlowStart = calculateGen4Damage(
      { attacker: noAbilityAttacker, defender, move, isCrit: false, state, rng } as DamageContext,
      GEN4_TYPE_CHART,
    );

    // Special moves are not affected by Slow Start
    expect(withSlowStart.damage).toBe(withoutSlowStart.damage);
  });
});

// ===========================================================================
// Slow Start — Speed halving (via Gen4Ruleset)
// ===========================================================================

describe("Gen4 Slow Start — halve Speed for 5 turns (via getEffectiveSpeed)", () => {
  it("given Slow Start Pokemon with slow-start volatile, when calculating effective speed, then Speed is halved", () => {
    // Source: Bulbapedia — Slow Start: "Halves Attack and Speed for 5 turns upon entering battle."
    // Source: Showdown data/abilities.ts — Slow Start onModifySpe
    // We test this through resolveTurnOrder since getEffectiveSpeed is protected.
    const ruleset = new Gen4Ruleset(new DataManager());

    const slowStartVolatiles = new Map([["slow-start", { turnsLeft: 4 }]]);
    const slowPokemon = createActivePokemon({
      ability: "slow-start",
      volatiles: slowStartVolatiles,
    });
    // Override calculatedStats to have a known speed
    slowPokemon.pokemon.calculatedStats = {
      hp: 200,
      attack: 100,
      defense: 100,
      spAttack: 100,
      spDefense: 100,
      speed: 200,
    };

    const fastPokemon = createActivePokemon({ ability: "" });
    // This Pokemon has speed 101 — normally slower than 200, but with Slow Start
    // the 200 becomes 100 (halved), which is slower than 101
    fastPokemon.pokemon.calculatedStats = {
      hp: 200,
      attack: 100,
      defense: 100,
      spAttack: 100,
      spDefense: 100,
      speed: 101,
    };

    // We need to set up move data for resolveTurnOrder
    slowPokemon.pokemon.moves = [
      { moveId: "tackle", ppUsed: 0, ppUps: 0 },
    ] as PokemonInstance["moves"];
    fastPokemon.pokemon.moves = [
      { moveId: "tackle", ppUsed: 0, ppUps: 0 },
    ] as PokemonInstance["moves"];

    const state = {
      weather: null,
      terrain: null,
      trickRoom: { active: false, turnsLeft: 0 },
      gravity: { active: false, turnsLeft: 0 },
      sides: [
        {
          index: 0,
          active: [slowPokemon],
          tailwind: { active: false, turnsLeft: 0 },
          team: [],
          hazards: [],
          screens: [],
          luckyChant: { active: false, turnsLeft: 0 },
          wish: null,
          futureAttack: null,
          faintCount: 0,
          gimmickUsed: false,
        },
        {
          index: 1,
          active: [fastPokemon],
          tailwind: { active: false, turnsLeft: 0 },
          team: [],
          hazards: [],
          screens: [],
          luckyChant: { active: false, turnsLeft: 0 },
          wish: null,
          futureAttack: null,
          faintCount: 0,
          gimmickUsed: false,
        },
      ],
    };

    const actions = [
      { type: "move" as const, side: 0 as const, moveIndex: 0 },
      { type: "move" as const, side: 1 as const, moveIndex: 0 },
    ];

    const rng = createMockRng(100);

    const ordered = ruleset.resolveTurnOrder(actions, state as any, rng as any);

    // Fast Pokemon (speed 101) should go first because Slow Start halves
    // the slow Pokemon's speed (200 → 100, which is less than 101)
    expect(ordered[0].side).toBe(1);
    expect(ordered[1].side).toBe(0);
  });

  it("given Slow Start Pokemon without slow-start volatile (expired), when calculating turn order, then full Speed is used", () => {
    // Source: Bulbapedia — Slow Start: after 5 turns, halving stops
    const ruleset = new Gen4Ruleset(new DataManager());

    // No slow-start volatile = effect expired
    const fastPokemon = createActivePokemon({ ability: "slow-start" });
    fastPokemon.pokemon.calculatedStats = {
      hp: 200,
      attack: 100,
      defense: 100,
      spAttack: 100,
      spDefense: 100,
      speed: 200,
    };

    const slowerPokemon = createActivePokemon({ ability: "" });
    slowerPokemon.pokemon.calculatedStats = {
      hp: 200,
      attack: 100,
      defense: 100,
      spAttack: 100,
      spDefense: 100,
      speed: 101,
    };

    fastPokemon.pokemon.moves = [
      { moveId: "tackle", ppUsed: 0, ppUps: 0 },
    ] as PokemonInstance["moves"];
    slowerPokemon.pokemon.moves = [
      { moveId: "tackle", ppUsed: 0, ppUps: 0 },
    ] as PokemonInstance["moves"];

    const state = {
      weather: null,
      terrain: null,
      trickRoom: { active: false, turnsLeft: 0 },
      gravity: { active: false, turnsLeft: 0 },
      sides: [
        {
          index: 0,
          active: [fastPokemon],
          tailwind: { active: false, turnsLeft: 0 },
          team: [],
          hazards: [],
          screens: [],
          luckyChant: { active: false, turnsLeft: 0 },
          wish: null,
          futureAttack: null,
          faintCount: 0,
          gimmickUsed: false,
        },
        {
          index: 1,
          active: [slowerPokemon],
          tailwind: { active: false, turnsLeft: 0 },
          team: [],
          hazards: [],
          screens: [],
          luckyChant: { active: false, turnsLeft: 0 },
          wish: null,
          futureAttack: null,
          faintCount: 0,
          gimmickUsed: false,
        },
      ],
    };

    const actions = [
      { type: "move" as const, side: 0 as const, moveIndex: 0 },
      { type: "move" as const, side: 1 as const, moveIndex: 0 },
    ];

    const rng = createMockRng(100);

    const ordered = ruleset.resolveTurnOrder(actions, state as any, rng as any);

    // Without slow-start volatile, full speed 200 is used — side 0 goes first
    expect(ordered[0].side).toBe(0);
    expect(ordered[1].side).toBe(1);
  });
});

// ===========================================================================
// Download — compare foe Def/SpDef, raise Atk or SpAtk
// ===========================================================================

describe("Gen4 Download — compare foe Def/SpDef on switch-in", () => {
  // These tests are in abilities.test.ts already but we verify edge cases here.
  it("given Download and foe Def=80 < SpDef=120, when Pokemon switches in, then raises Attack by 1 stage", () => {
    // Source: Bulbapedia — Download: raises Attack if foe Def < SpDef
    // Source: Showdown Gen 4 mod — Download trigger
    // Derivation: 80 < 120 → +1 Atk
    const opponent = createActivePokemon({ defense: 80, spDefense: 120 });
    const pokemon = createActivePokemon({ ability: "download" });

    const ctx = {
      pokemon,
      opponent,
      state: createMockState() as any,
      trigger: "on-switch-in",
      rng: createMockRng(100) as any,
    };

    const result = applyGen4Ability("on-switch-in", ctx);

    expect(result.activated).toBe(true);
    expect(result.effects[0]).toMatchObject({
      effectType: "stat-change",
      target: "self",
      stat: "attack",
      stages: 1,
    });
  });

  it("given Download and foe Def=120 > SpDef=80, when Pokemon switches in, then raises SpAtk by 1 stage", () => {
    // Source: Bulbapedia — Download: raises SpAtk if foe Def >= SpDef (strict >)
    // Derivation: 120 > 80, so Def is NOT less than SpDef → +1 SpAtk
    const opponent = createActivePokemon({ defense: 120, spDefense: 80 });
    const pokemon = createActivePokemon({ ability: "download" });

    const ctx = {
      pokemon,
      opponent,
      state: createMockState() as any,
      trigger: "on-switch-in",
      rng: createMockRng(100) as any,
    };

    const result = applyGen4Ability("on-switch-in", ctx);

    expect(result.activated).toBe(true);
    expect(result.effects[0]).toMatchObject({
      effectType: "stat-change",
      target: "self",
      stat: "spAttack",
      stages: 1,
    });
  });

  it("given Download and foe Def=100 equals SpDef=100, when Pokemon switches in, then raises SpAtk (equal defaults to SpAtk)", () => {
    // Source: Showdown Gen 4 — when Def === SpDef, Download raises SpAtk
    // Source: Bulbapedia — Download: "If the foe's Defense is lower [...] otherwise SpAtk"
    // Derivation: 100 is not < 100, so condition is false → raises SpAtk
    const opponent = createActivePokemon({ defense: 100, spDefense: 100 });
    const pokemon = createActivePokemon({ ability: "download" });

    const ctx = {
      pokemon,
      opponent,
      state: createMockState() as any,
      trigger: "on-switch-in",
      rng: createMockRng(100) as any,
    };

    const result = applyGen4Ability("on-switch-in", ctx);

    expect(result.activated).toBe(true);
    expect(result.effects[0]).toMatchObject({
      effectType: "stat-change",
      target: "self",
      stat: "spAttack",
      stages: 1,
    });
  });

  it("given Download and no opponent, when Pokemon switches in, then does not activate", () => {
    // Source: Showdown Gen 4 — Download requires an opponent to compare stats
    const pokemon = createActivePokemon({ ability: "download" });

    const ctx = {
      pokemon,
      state: createMockState() as any,
      trigger: "on-switch-in",
      rng: createMockRng(100) as any,
    };

    const result = applyGen4Ability("on-switch-in", ctx);

    expect(result.activated).toBe(false);
  });
});
