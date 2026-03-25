import type { ActivePokemon, DamageContext } from "@pokemon-lib-ts/battle";
import type { MoveData, MoveEffect, PokemonInstance, PokemonType } from "@pokemon-lib-ts/core";
import {
  CORE_ABILITY_IDS,
  CORE_MOVE_IDS,
  CORE_STATUS_IDS,
  CORE_TYPE_IDS,
  CORE_VOLATILE_IDS,
  CORE_WEATHER_IDS,
  DataManager,
} from "@pokemon-lib-ts/core";
import { describe, expect, it } from "vitest";
import {
  createGen4DataManager,
  GEN4_ABILITY_IDS,
  GEN4_ITEM_IDS,
  GEN4_MOVE_IDS,
  GEN4_NATURE_IDS,
  GEN4_SPECIES_IDS,
} from "../src";
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

const GEN4_DATA = createGen4DataManager()
const ABILITIES = { ...CORE_ABILITY_IDS, ...GEN4_ABILITY_IDS }
const ITEMS = GEN4_ITEM_IDS
const MOVES = { ...CORE_MOVE_IDS, ...GEN4_MOVE_IDS }
const NATURES = GEN4_NATURE_IDS
const SPECIES = GEN4_SPECIES_IDS
const STATUSES = CORE_STATUS_IDS
const TYPES = CORE_TYPE_IDS
const VOLATILES = CORE_VOLATILE_IDS
const WEATHER = CORE_WEATHER_IDS

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
  status?: PokemonInstance["status"];
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
    speciesId: opts.speciesId ?? SPECIES.bulbasaur,
    nickname: null,
    level,
    experience: 0,
    nature: NATURES.hardy,
    ivs: { hp: 0, attack: 0, defense: 0, spAttack: 0, spDefense: 0, speed: 0 },
    evs: { hp: 0, attack: 0, defense: 0, spAttack: 0, spDefense: 0, speed: 0 },
    currentHp: opts.currentHp ?? maxHp,
    moves: [],
    ability: opts.ability ?? ABILITIES.none,
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
    pokeball: ITEMS.pokeBall,
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
    types: opts.types ?? [TYPES.normal],
    ability: opts.ability ?? ABILITIES.none,
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
    stellarBoostedTypes: [],
  } as ActivePokemon;
}

function createMove(opts: {
  type: PokemonType;
  power: number;
  category?: "physical" | "special" | "status";
  id?: string;
  effect?: MoveEffect | null;
}): MoveData {
  const baseMove = GEN4_DATA.getMove(opts.id ?? MOVES.tackle);
  return {
    ...baseMove,
    id: opts.id ?? baseMove.id,
    displayName: baseMove.displayName,
    type: opts.type,
    category: opts.category ?? "physical",
    power: opts.power,
    accuracy: baseMove.accuracy,
    pp: baseMove.pp,
    priority: baseMove.priority,
    target: baseMove.target,
    flags: {
      ...baseMove.flags,
    },
    effect: opts.effect ?? null,
    description: baseMove.description,
    generation: 4,
  } as MoveData;
}

function createMockState(
  weather?: { type: string; turnsLeft: number; source: string } | null,
) {
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
    const attacker = createActivePokemon({ ability: ABILITIES.solarPower, spAttack: 100 });
    const noAbilityAttacker = createActivePokemon({ ability: "", spAttack: 100 });
    const defender = createActivePokemon({ defense: 100, spDefense: 100 });
    const move = createMove({ type: TYPES.fire, power: 80, category: "special" });

    const rng = createMockRng(100); // max roll
    const state = createMockState({ type: WEATHER.sun, turnsLeft: 5, source: MOVES.sunnyDay });

    const withSolarPower = calculateGen4Damage(
      { attacker, defender, move, isCrit: false, state, rng } as DamageContext,
      GEN4_TYPE_CHART,
    );

    const withoutSolarPower = calculateGen4Damage(
      { attacker: noAbilityAttacker, defender, move, isCrit: false, state, rng } as DamageContext,
      GEN4_TYPE_CHART,
    );

    // Source: Gen4 damage formula with Solar Power 1.5x SpAtk modifier
    // Derivation (Solar Power, max roll):
    //   levelFactor = floor(2*50/5)+2 = 22
    //   atk = floor(100*150/100) = 150 (Solar Power 1.5x SpAtk)
    //   baseDamage = floor(floor(22*80*150/100)/50) = floor(2640/50) = 52
    //   weather(sun, fire) = floor(52*1.5) = 78; +2 = 80
    //   random = floor(80*100/100) = 80; no STAB; effectiveness=1 → 80
    // (Weather applied before +2 per Showdown Gen 4 scripts.ts)
    expect(withSolarPower.damage).toBe(80);
    // Without Solar Power: atk=100, baseDamage=floor(1760/50)=35
    //   weather = floor(35*1.5)=52; +2=54; random=54; no STAB; eff=1 → 54
    expect(withoutSolarPower.damage).toBe(54);
  });

  it("given Solar Power attacker using a special move without sun, when damage is calculated, then no SpAtk boost is applied", () => {
    // Source: Bulbapedia — Solar Power: only activates in harsh sunlight
    const attacker = createActivePokemon({ ability: ABILITIES.solarPower, spAttack: 100 });
    const noAbilityAttacker = createActivePokemon({ ability: "", spAttack: 100 });
    const defender = createActivePokemon({ defense: 100, spDefense: 100 });
    const move = createMove({ type: TYPES.fire, power: 80, category: "special" });

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
    const attacker = createActivePokemon({ ability: ABILITIES.solarPower, attack: 100 });
    const noAbilityAttacker = createActivePokemon({ ability: "", attack: 100 });
    const defender = createActivePokemon({ defense: 100 });
    const move = createMove({ type: TYPES.fire, power: 80, category: "physical" });

    const rng = createMockRng(100);
    const state = createMockState({ type: WEATHER.sun, turnsLeft: 5, source: MOVES.sunnyDay });

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
    const attacker = createActivePokemon({ ability: ABILITIES.solarPower, spAttack: 100 });
    const noAbilityAttacker = createActivePokemon({ ability: "", spAttack: 100 });
    const defender = createActivePokemon({ spDefense: 100 });
    const move = createMove({ type: TYPES.water, power: 80, category: "special" });

    const rng = createMockRng(100);
    const state = createMockState({ type: WEATHER.rain, turnsLeft: 5, source: MOVES.rainDance });

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

  it("given Solar Power attacker using a different special move in sun, when damage is calculated, then SpAtk is boosted by exactly 1.5x (second independent case)", () => {
    // Source: Bulbapedia — Solar Power boosts SpAtk by 1.5x in harsh sunlight for any special move
    // Source: Showdown data/abilities.ts — Solar Power onModifySpAPriority
    // Uses different stats/power than first test to triangulate the formula
    const attacker = createActivePokemon({ ability: ABILITIES.solarPower, spAttack: 120 });
    const noAbilityAttacker = createActivePokemon({ ability: "", spAttack: 120 });
    const defender = createActivePokemon({ defense: 100, spDefense: 100 });
    const move = createMove({ type: TYPES.water, power: 60, category: "special" });

    const rng = createMockRng(100);
    const state = createMockState({ type: WEATHER.sun, turnsLeft: 5, source: MOVES.sunnyDay });

    const withSolarPower = calculateGen4Damage(
      { attacker, defender, move, isCrit: false, state, rng } as DamageContext,
      GEN4_TYPE_CHART,
    );

    const withoutSolarPower = calculateGen4Damage(
      { attacker: noAbilityAttacker, defender, move, isCrit: false, state, rng } as DamageContext,
      GEN4_TYPE_CHART,
    );

    // Source: Gen4 damage formula with Solar Power 1.5x SpAtk, Water move in sun
    // Derivation (Solar Power, max roll, Water/60/SpAtk=120):
    //   atk = floor(120*150/100) = 180 (Solar Power)
    //   baseDamage = floor(floor(22*60*180/100)/50) = floor(2376/50) = 47
    //   weather(sun, water) = floor(47*0.5) = 23; +2 = 25; random = 25
    //   no STAB; effectiveness=1 → 25
    // (Weather applied before +2 per Showdown Gen 4 scripts.ts)
    expect(withSolarPower.damage).toBe(25);
    // Without Solar Power: atk=120
    //   baseDamage = floor(floor(22*60*120/100)/50) = floor(1584/50) = 31
    //   weather = floor(31*0.5)=15; +2=17; random=17; no STAB; eff=1 → 17
    expect(withoutSolarPower.damage).toBe(17);
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
    const attacker = createActivePokemon({ ability: ABILITIES.flowerGift, attack: 100 });
    const noAbilityAttacker = createActivePokemon({ ability: "", attack: 100 });
    const defender = createActivePokemon({ defense: 100 });
    const move = createMove({ type: TYPES.normal, power: 80, category: "physical" });

    const rng = createMockRng(100);
    const state = createMockState({ type: WEATHER.sun, turnsLeft: 5, source: MOVES.sunnyDay });

    const withFlowerGift = calculateGen4Damage(
      { attacker, defender, move, isCrit: false, state, rng } as DamageContext,
      GEN4_TYPE_CHART,
    );

    const withoutFlowerGift = calculateGen4Damage(
      { attacker: noAbilityAttacker, defender, move, isCrit: false, state, rng } as DamageContext,
      GEN4_TYPE_CHART,
    );

    // Source: Gen4 damage formula with Flower Gift 1.5x Atk modifier
    // Derivation (Flower Gift attacker, max roll):
    //   levelFactor = 22; atk = floor(100*150/100) = 150 (Flower Gift)
    //   baseDamage = floor(floor(22*80*150/100)/50) = floor(2640/50) = 52
    //   no weather mod for Normal; +2 = 54; random = 54
    //   STAB (Normal attacker, Normal move) = floor(54*1.5) = 81; eff=1 → 81
    expect(withFlowerGift.damage).toBe(81);
    // Without Flower Gift: atk=100, baseDamage=35; +2=37; random=37
    //   STAB = floor(37*1.5) = 55; eff=1 → 55
    expect(withoutFlowerGift.damage).toBe(55);
  });

  it("given Flower Gift defender taking a special move in sun, when damage is calculated, then SpDef is boosted by 1.5x (less damage taken)", () => {
    // Source: Bulbapedia — Flower Gift: boosts SpDef of the holder by 50% in sun
    // Source: Showdown data/abilities.ts — Flower Gift onAllyModifySpDPriority
    const attacker = createActivePokemon({ spAttack: 100 });
    const flowerGiftDefender = createActivePokemon({
      ability: ABILITIES.flowerGift,
      spDefense: 100,
    });
    const normalDefender = createActivePokemon({ ability: "", spDefense: 100 });
    const move = createMove({ type: TYPES.water, power: 80, category: "special" });

    const rng = createMockRng(100);
    const state = createMockState({ type: WEATHER.sun, turnsLeft: 5, source: MOVES.sunnyDay });

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

    // Source: Gen4 damage formula with Flower Gift 1.5x SpDef on defender
    // Derivation (vs Flower Gift defender, max roll):
    //   atk=100; def=floor(100*150/100)=150 (Flower Gift SpDef boost)
    //   baseDamage = floor(floor(22*80*100/150)/50) = floor(floor(1173.33)/50) = floor(1173/50) = 23
    //   weather(sun, water) = floor(23*0.5) = 11; +2 = 13; random = 13
    //   no STAB; eff=1 → 13
    // (Weather applied before +2 per Showdown Gen 4 scripts.ts)
    expect(againstFlowerGift.damage).toBe(13);
    // Without Flower Gift: def=100, baseDamage=floor(1760/50)=35
    //   weather = floor(35*0.5)=17; +2=19; random=19; no STAB; eff=1 → 19
    expect(againstNormal.damage).toBe(19);
  });

  it("given Flower Gift defender in sun attacked by Mold Breaker attacker, when damage is calculated, then SpDef boost is ignored", () => {
    // Source: Showdown data/abilities.ts — Mold Breaker ignores Flower Gift SpDef boost
    // Triangulation: second case for the Mold Breaker bypass path added in Gen4DamageCalc
    const moldBreakerAttacker = createActivePokemon({ ability: ABILITIES.moldBreaker, spAttack: 100 });
    const flowerGiftDefender = createActivePokemon({
      ability: ABILITIES.flowerGift,
      spDefense: 100,
    });
    const move = createMove({ type: TYPES.water, power: 80, category: "special" });

    const rng = createMockRng(100);
    const state = createMockState({ type: WEATHER.sun, turnsLeft: 5, source: MOVES.sunnyDay });

    const result = calculateGen4Damage(
      {
        attacker: moldBreakerAttacker,
        defender: flowerGiftDefender,
        move,
        isCrit: false,
        state,
        rng,
      } as DamageContext,
      GEN4_TYPE_CHART,
    );

    // Mold Breaker ignores Flower Gift: SpDef stays at 100 (no 1.5x boost)
    // Derivation (Mold Breaker bypasses Flower Gift, max roll):
    //   atk=100; def=100 (Flower Gift bypassed by Mold Breaker)
    //   baseDamage = floor(floor(22*80*100/100)/50) = floor(1760/50) = 35
    //   weather(sun, water) = floor(35*0.5) = 17; +2 = 19; random = 19
    //   no STAB; eff=1 → 19 (same as no-ability case in previous test)
    // (Weather applied before +2 per Showdown Gen 4 scripts.ts)
    expect(result.damage).toBe(19);
  });

  it("given Flower Gift attacker without sun, when using a physical move, then no Attack boost is applied", () => {
    // Source: Bulbapedia — Flower Gift: only activates in harsh sunlight
    const attacker = createActivePokemon({ ability: ABILITIES.flowerGift, attack: 100 });
    const noAbilityAttacker = createActivePokemon({ ability: "", attack: 100 });
    const defender = createActivePokemon({ defense: 100 });
    const move = createMove({ type: TYPES.normal, power: 80, category: "physical" });

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
    const attacker = createActivePokemon({ ability: ABILITIES.flowerGift, spAttack: 100 });
    const noAbilityAttacker = createActivePokemon({ ability: "", spAttack: 100 });
    const defender = createActivePokemon({ spDefense: 100 });
    const move = createMove({ type: TYPES.fire, power: 80, category: "special" });

    const rng = createMockRng(100);
    const state = createMockState({ type: WEATHER.sun, turnsLeft: 5, source: MOVES.sunnyDay });

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
    const attacker = createActivePokemon({ ability: ABILITIES.scrappy, attack: 100 });
    const ghostDefender = createActivePokemon({
      types: [TYPES.ghost],
      defense: 100,
    });
    const move = createMove({ type: TYPES.normal, power: 80, category: "physical" });

    const rng = createMockRng(100);
    const state = createMockState();

    const result = calculateGen4Damage(
      { attacker, defender: ghostDefender, move, isCrit: false, state, rng } as DamageContext,
      GEN4_TYPE_CHART,
    );

    // Source: Gen4 damage formula with Scrappy overriding Ghost immunity for Normal moves
    // Derivation (Scrappy Normal vs Ghost, max roll):
    //   atk=100, def=100; baseDamage = floor(floor(22*80*100/100)/50) = 35
    //   no weather; +2=37; random=37; STAB(Normal attacker, Normal move) = floor(37*1.5)=55
    //   Scrappy: Normal vs Ghost immunity → neutral(1x); baseDamage = floor(55*1)=55
    expect(result.damage).toBe(55);
    expect(result.effectiveness).toBe(1); // neutral, not immune
  });

  it("given Scrappy attacker using a Fighting move against Ghost/Dark, when damage is calculated, then Ghost immunity is overridden and Dark weakness applies", () => {
    // Source: Bulbapedia — Scrappy: removes Ghost immunity for Normal and Fighting
    // Source: Showdown Gen 4 — Scrappy allows Fighting to hit Ghost
    // Derivation: Fighting vs Ghost/Dark — Ghost immunity overridden, Fighting vs Dark = 2x
    const attacker = createActivePokemon({ ability: ABILITIES.scrappy, attack: 100 });
    const ghostDarkDefender = createActivePokemon({
      types: [TYPES.ghost, TYPES.dark],
      defense: 100,
    });
    const move = createMove({ type: TYPES.fighting, power: 80, category: "physical" });

    const rng = createMockRng(100);
    const state = createMockState();

    const result = calculateGen4Damage(
      { attacker, defender: ghostDarkDefender, move, isCrit: false, state, rng } as DamageContext,
      GEN4_TYPE_CHART,
    );

    // Source: Gen4 damage formula with Scrappy overriding Ghost immunity for Fighting moves
    // Derivation (Scrappy Fighting vs Ghost/Dark, max roll):
    //   baseDamage = 35; +2=37; random=37; no STAB (Normal attacker, Fighting move)
    //   Scrappy: Ghost immunity removed; Fighting vs Dark = 2x → floor(37*2)=74
    expect(result.damage).toBe(74);
    expect(result.effectiveness).toBe(2);
  });

  it("given a non-Scrappy attacker using a Normal move against Ghost, when damage is calculated, then Ghost immunity still applies", () => {
    // Source: Bulbapedia — without Scrappy, Normal is immune to Ghost
    const attacker = createActivePokemon({ ability: "", attack: 100 });
    const ghostDefender = createActivePokemon({
      types: [TYPES.ghost],
      defense: 100,
    });
    const move = createMove({ type: TYPES.normal, power: 80, category: "physical" });

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
    const attacker = createActivePokemon({ ability: ABILITIES.scrappy, attack: 100 });
    const ghostDefender = createActivePokemon({
      types: [TYPES.ghost],
      defense: 100,
    });
    const move = createMove({ type: TYPES.fire, power: 80, category: "physical" });

    const rng = createMockRng(100);
    const state = createMockState();

    const result = calculateGen4Damage(
      { attacker, defender: ghostDefender, move, isCrit: false, state, rng } as DamageContext,
      GEN4_TYPE_CHART,
    );

    // Source: Gen4 damage formula — Fire vs Ghost is neutral (1x), Scrappy irrelevant
    // Derivation: baseDamage=35; +2=37; random=37; no STAB; Fire vs Ghost=1x → 37
    expect(result.damage).toBe(37);
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
      ability: ABILITIES.normalize,
      attack: 100,
      types: [TYPES.fire],
    });
    const fireAttackerNoAbility = createActivePokemon({
      ability: "",
      attack: 100,
      types: [TYPES.fire],
    });
    const defender = createActivePokemon({ defense: 100, types: [TYPES.normal] });
    const fireMove = createMove({ type: TYPES.fire, power: 80, category: "physical" });

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

    // Source: Gen4 damage formula — Normalize converts Fire move to Normal type
    // Derivation (with Normalize): move=Normal, attacker=Fire → no STAB
    //   baseDamage=35; +2=37; random=37; no STAB; Normal vs Normal=1x → 37
    expect(withNormalize.damage).toBe(37);
    // Without Normalize: Fire STAB applies (1.5x), Fire vs Normal=1x
    //   baseDamage=35; +2=37; random=37; STAB=floor(37*1.5)=55; eff=1 → 55
    expect(withoutNormalize.damage).toBe(55);
  });

  it("given Normalize attacker that is Normal-type using any move, when damage is calculated, then STAB applies (move becomes Normal = matching type)", () => {
    // Source: Bulbapedia — Normalize: all moves become Normal; Normal-type Pokemon get STAB
    // Derivation: Normal-type attacker with Normalize → move becomes Normal → STAB applies
    const normalAttacker = createActivePokemon({
      ability: ABILITIES.normalize,
      attack: 100,
      types: [TYPES.normal],
    });
    const normalAttackerNoAbility = createActivePokemon({
      ability: "",
      attack: 100,
      types: [TYPES.normal],
    });
    const defender = createActivePokemon({ defense: 100, types: [TYPES.water] });
    // Use a Fire move — without Normalize, no STAB (attacker is Normal, move is Fire)
    // With Normalize, the Fire move becomes Normal → Normal-type attacker gets STAB
    const fireMove = createMove({ type: TYPES.fire, power: 80, category: "physical" });

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

    // Source: Gen4 damage formula — Normalize gives Normal STAB, changes effectiveness
    // Derivation (with Normalize): move=Normal, attacker=Normal → STAB(1.5x)
    //   baseDamage=35; +2=37; random=37; STAB=floor(37*1.5)=55; Normal vs Water=1x → 55
    expect(withNormalize.damage).toBe(55);
    // Without Normalize: Fire move, Normal attacker → no STAB; Fire vs Water=0.5x
    //   baseDamage=35; +2=37; random=37; no STAB; floor(37*0.5)=18 → 18
    expect(withoutNormalize.damage).toBe(18);
  });

  it("given Normalize attacker using a Fighting move against Ghost, when damage is calculated, then move becomes Normal (immune to Ghost)", () => {
    // Source: Bulbapedia — Normalize: moves become Normal type; Normal is immune to Ghost
    // This is a notable downside of Normalize — Fighting moves no longer hit Ghost
    const attacker = createActivePokemon({
      ability: ABILITIES.normalize,
      attack: 100,
      types: [TYPES.normal],
    });
    const ghostDefender = createActivePokemon({ types: [TYPES.ghost], defense: 100 });
    const fightingMove = createMove({
      type: TYPES.fighting,
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
      ability: ABILITIES.normalize,
      spAttack: 100,
      types: [TYPES.normal],
    });
    const defender = createActivePokemon({ spDefense: 100, types: [TYPES.normal] });
    const waterMove = createMove({ type: TYPES.water, power: 80, category: "special" });

    const rng = createMockRng(100);
    const rainState = createMockState({ type: WEATHER.rain, turnsLeft: 5, source: MOVES.rainDance });

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
    const slowStartVolatiles = new Map([[ABILITIES.slowStart, { turnsLeft: 5 }]]);
    const attacker = createActivePokemon({
      ability: ABILITIES.slowStart,
      attack: 100,
      volatiles: slowStartVolatiles,
    });
    const noAbilityAttacker = createActivePokemon({ ability: "", attack: 100 });
    const defender = createActivePokemon({ defense: 100 });
    const move = createMove({ type: TYPES.normal, power: 80, category: "physical" });

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

    // Source: Gen4 damage formula with Slow Start 0.5x Attack modifier
    // Derivation (Slow Start, max roll):
    //   atk = floor(100/2) = 50 (Slow Start halves Attack)
    //   baseDamage = floor(floor(22*80*50/100)/50) = floor(880/50) = 17
    //   no weather; +2=19; random=19; STAB(Normal/Normal)=floor(19*1.5)=28; eff=1 → 28
    expect(withSlowStart.damage).toBe(28);
    // Without Slow Start: atk=100, baseDamage=35; +2=37; random=37
    //   STAB=floor(37*1.5)=55; eff=1 → 55
    expect(withoutSlowStart.damage).toBe(55);
  });

  it("given Slow Start attacker without slow-start volatile (expired), when using a physical move, then Attack is not halved", () => {
    // Source: Bulbapedia — Slow Start: after 5 turns, the halving stops
    // Source: Showdown Gen 4 — Slow Start checks for volatile, not just ability
    const attacker = createActivePokemon({
      ability: ABILITIES.slowStart,
      attack: 100,
      // No slow-start volatile = effect has expired
    });
    const noAbilityAttacker = createActivePokemon({ ability: "", attack: 100 });
    const defender = createActivePokemon({ defense: 100 });
    const move = createMove({ type: TYPES.normal, power: 80, category: "physical" });

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
    const slowStartVolatiles = new Map([[ABILITIES.slowStart, { turnsLeft: 3 }]]);
    const attacker = createActivePokemon({
      ability: ABILITIES.slowStart,
      spAttack: 100,
      volatiles: slowStartVolatiles,
    });
    const noAbilityAttacker = createActivePokemon({ ability: "", spAttack: 100 });
    const defender = createActivePokemon({ spDefense: 100 });
    const move = createMove({ type: TYPES.fire, power: 80, category: "special" });

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

    const slowStartVolatiles = new Map([[ABILITIES.slowStart, { turnsLeft: 4 }]]);
    const slowPokemon = createActivePokemon({
      ability: ABILITIES.slowStart,
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
      { moveId: MOVES.tackle, ppUsed: 0, ppUps: 0 },
    ] as PokemonInstance["moves"];
    fastPokemon.pokemon.moves = [
      { moveId: MOVES.tackle, ppUsed: 0, ppUps: 0 },
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
    const fastPokemon = createActivePokemon({ ability: ABILITIES.slowStart });
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
      { moveId: MOVES.tackle, ppUsed: 0, ppUps: 0 },
    ] as PokemonInstance["moves"];
    slowerPokemon.pokemon.moves = [
      { moveId: MOVES.tackle, ppUsed: 0, ppUps: 0 },
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
// Slow Start — damage calc behavior after volatile expiry
// ===========================================================================
// NOTE: The actual EoT countdown integration tests (volatile decrement + removal
// through the real BattleEngine) are in:
//   packages/battle/tests/engine/gen4-eot-handlers.test.ts → "slow-start-countdown EoT slot"
// The tests below verify damage calc behavior when the volatile is absent (expired).

describe("Gen4 Slow Start — damage calc after volatile expiry", () => {
  it("given Slow Start ability but no slow-start volatile (expired), when using a physical move, then full Attack is used (same as no-ability baseline)", () => {
    // Source: Bulbapedia — Slow Start: halving only applies while the volatile is present
    // Source: Showdown Gen 4 mod — Slow Start checks for volatile, not just ability
    const pokemon = createActivePokemon({
      ability: ABILITIES.slowStart,
      attack: 100,
      // No slow-start volatile = effect has expired
    });
    const noAbilityPokemon = createActivePokemon({ ability: "", attack: 100 });
    const defender = createActivePokemon({ defense: 100 });
    const move = createMove({ type: TYPES.normal, power: 80, category: "physical" });
    const rng = createMockRng(100);
    const state = createMockState();

    const afterExpiry = calculateGen4Damage(
      { attacker: pokemon, defender, move, isCrit: false, state, rng } as DamageContext,
      GEN4_TYPE_CHART,
    );

    const baseline = calculateGen4Damage(
      { attacker: noAbilityPokemon, defender, move, isCrit: false, state, rng } as DamageContext,
      GEN4_TYPE_CHART,
    );

    // Source: Gen4 damage formula — Slow Start expired, no halving applied
    // Both should deal the same damage since no volatile is present
    // Derivation: baseDamage=35; +2=37; random=37; STAB(Normal/Normal)=floor(37*1.5)=55
    expect(afterExpiry.damage).toBe(55);
    expect(baseline.damage).toBe(55);
  });

  it("given Slow Start ability with volatile still active vs expired, when using a physical move, then active volatile halves damage and expired does not (triangulation)", () => {
    // Source: Bulbapedia — Slow Start: halves Attack while volatile is present
    // Triangulation: compare active volatile vs expired to confirm the volatile is the gate
    const slowStartVolatiles = new Map([[ABILITIES.slowStart, { turnsLeft: 3 }]]);
    const activeSlowStart = createActivePokemon({
      ability: ABILITIES.slowStart,
      attack: 100,
      volatiles: slowStartVolatiles,
    });
    const expiredSlowStart = createActivePokemon({
      ability: ABILITIES.slowStart,
      attack: 100,
      // No volatile
    });
    const defender = createActivePokemon({ defense: 100 });
    const move = createMove({ type: TYPES.normal, power: 80, category: "physical" });
    const rng = createMockRng(100);
    const state = createMockState();

    const withVolatile = calculateGen4Damage(
      { attacker: activeSlowStart, defender, move, isCrit: false, state, rng } as DamageContext,
      GEN4_TYPE_CHART,
    );

    const withoutVolatile = calculateGen4Damage(
      { attacker: expiredSlowStart, defender, move, isCrit: false, state, rng } as DamageContext,
      GEN4_TYPE_CHART,
    );

    // Source: Gen4 damage formula with Slow Start active vs expired
    // With volatile: atk=50, baseDamage=17; +2=19; random=19; STAB=floor(19*1.5)=28
    expect(withVolatile.damage).toBe(28);
    // Without volatile: atk=100, baseDamage=35; +2=37; random=37; STAB=floor(37*1.5)=55
    expect(withoutVolatile.damage).toBe(55);
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
    const pokemon = createActivePokemon({ ability: ABILITIES.download });

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
    const pokemon = createActivePokemon({ ability: ABILITIES.download });

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
    const pokemon = createActivePokemon({ ability: ABILITIES.download });

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
    const pokemon = createActivePokemon({ ability: ABILITIES.download });

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
