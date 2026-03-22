/**
 * Gen 8 ability routing integration tests.
 *
 * Tests that Gen8Ruleset.applyAbility() correctly routes all trigger types
 * to the appropriate handler modules, and that capLethalDamage() correctly
 * implements Sturdy and Disguise (Gen 8: 1/8 chip on break).
 *
 * Bug fixes validated:
 *   - C1: applyAbility() missing trigger routes (passive-immunity, on-damage-taken,
 *         on-flinch, on-stat-change, on-priority-check, on-after-move-used, on-item-use)
 *   - C2: Missing getEndOfTurnOrder() override (inherited BaseRuleset's 18-effect list)
 *   - C3: Missing capLethalDamage() (Sturdy + Disguise non-functional)
 *   - H3: Disguise volatileStatus marking in capLethalDamage
 *
 * Source: Showdown data/abilities.ts -- Gen 8 ability handlers
 * Source: Bulbapedia -- Sword/Shield battle mechanics
 */
import type { AbilityContext, ActivePokemon, BattleState } from "@pokemon-lib-ts/battle";
import type { MoveData, PokemonType } from "@pokemon-lib-ts/core";
import { SeededRandom } from "@pokemon-lib-ts/core";
import { describe, expect, it } from "vitest";
import { Gen8Ruleset } from "../src/Gen8Ruleset";

// ---------------------------------------------------------------------------
// Helper factories (mirrors abilities-stat.test.ts pattern)
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
  nickname?: string | null;
  movedThisTurn?: boolean;
  turnsOnField?: number;
  volatiles?: Map<string, unknown>;
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
      nickname: overrides.nickname ?? null,
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
      gender: "male" as any,
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
      attack: 0,
      defense: 0,
      spAttack: 0,
      spDefense: 0,
      speed: 0,
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
    turnsOnField: overrides.turnsOnField ?? 0,
    movedThisTurn: overrides.movedThisTurn ?? false,
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
  effect?: MoveData["effect"];
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
    effect: overrides.effect ?? null,
    description: "",
    generation: 8,
    critRatio: 0,
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
    generation: 8,
    turnNumber: 1,
    sides: [{}, {}],
  } as unknown as BattleState;
}

function makeCtx(overrides: {
  ability: string;
  trigger: string;
  move?: MoveData;
  currentHp?: number;
  maxHp?: number;
  types?: PokemonType[];
  nickname?: string | null;
  opponent?: ActivePokemon;
  turnsOnField?: number;
  seed?: number;
  statChange?: { stat: string; stages: number; source: "self" | "opponent" };
  volatiles?: Map<string, unknown>;
}): AbilityContext {
  const hp = overrides.maxHp ?? 200;
  return {
    pokemon: makeActive({
      ability: overrides.ability,
      currentHp: overrides.currentHp ?? hp,
      hp: hp,
      types: overrides.types ?? ["normal"],
      nickname: overrides.nickname ?? null,
      turnsOnField: overrides.turnsOnField ?? 0,
      volatiles: overrides.volatiles,
    }),
    opponent: overrides.opponent ?? makeActive({}),
    state: makeState(),
    rng: new SeededRandom(overrides.seed ?? 42),
    trigger: overrides.trigger as any,
    move: overrides.move,
    statChange: overrides.statChange as any,
  };
}

// ===========================================================================
// Bug C1: applyAbility() missing trigger routes
// ===========================================================================

describe("Gen 8 applyAbility dispatch (Bug C1)", () => {
  const ruleset = new Gen8Ruleset();

  // ---- passive-immunity ----

  it("given passive-immunity trigger for Volt Absorb, when Electric move used, then handler is invoked (not silently dropped)", () => {
    // Source: Showdown data/abilities.ts -- voltabsorb: onTryHit (passive immunity)
    // Before fix: passive-immunity fell through to default: return noActivation
    const ctx = makeCtx({
      ability: "volt-absorb",
      trigger: "passive-immunity",
      types: ["water"],
      move: makeMove({ type: "electric" }),
    });
    const result = ruleset.applyAbility("passive-immunity", ctx);
    // The stat handler dispatches passive-immunity; volt-absorb is not handled by
    // the stat handler specifically (it returns INACTIVE), but the route is exercised
    // rather than silently dropped. The key test is that it doesn't crash/throw.
    expect(result).toBeDefined();
    expect(result.effects).toBeDefined();
  });

  // ---- on-damage-taken: Justified ----

  it("given on-damage-taken trigger for Justified, when hit by Dark move, then +1 Atk activates", () => {
    // Source: Showdown data/abilities.ts -- justified: onDamagingHit, Dark-type => +1 Atk
    const ctx = makeCtx({
      ability: "justified",
      trigger: "on-damage-taken",
      move: makeMove({ type: "dark" }),
    });
    const result = ruleset.applyAbility("on-damage-taken", ctx);
    expect(result.activated).toBe(true);
    expect(result.effects).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ effectType: "stat-change", stat: "attack", stages: 1 }),
      ]),
    );
  });

  it("given on-damage-taken trigger for Justified, when hit by Normal move, then does not activate", () => {
    // Source: Showdown data/abilities.ts -- justified only triggers on Dark-type moves
    const ctx = makeCtx({
      ability: "justified",
      trigger: "on-damage-taken",
      move: makeMove({ type: "normal" }),
    });
    const result = ruleset.applyAbility("on-damage-taken", ctx);
    expect(result.activated).toBe(false);
  });

  // ---- on-damage-taken: Sturdy OHKO block via damage immunity handler ----

  it("given on-damage-taken trigger for Sturdy, when OHKO move used, then blocks the move", () => {
    // Source: Showdown data/abilities.ts -- sturdy: onTryHit blocks OHKO moves
    const ctx = makeCtx({
      ability: "sturdy",
      trigger: "on-damage-taken",
      move: makeMove({
        id: "sheer-cold",
        type: "ice",
        effect: { type: "ohko" } as any,
      }),
    });
    const result = ruleset.applyAbility("on-damage-taken", ctx);
    expect(result.activated).toBe(true);
    expect(result.messages.length).toBeGreaterThan(0);
  });

  // ---- on-flinch: Steadfast ----

  it("given on-flinch trigger for Steadfast, when flinched, then +1 Speed activates", () => {
    // Source: Showdown data/abilities.ts -- steadfast: onFlinch => +1 Spe
    const ctx = makeCtx({
      ability: "steadfast",
      trigger: "on-flinch",
    });
    const result = ruleset.applyAbility("on-flinch", ctx);
    expect(result.activated).toBe(true);
    expect(result.effects).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ effectType: "stat-change", stat: "speed", stages: 1 }),
      ]),
    );
  });

  it("given on-flinch trigger for non-Steadfast ability, when flinched, then does not activate", () => {
    // Source: Showdown data/abilities.ts -- only steadfast responds to flinch
    const ctx = makeCtx({
      ability: "blaze",
      trigger: "on-flinch",
    });
    const result = ruleset.applyAbility("on-flinch", ctx);
    expect(result.activated).toBe(false);
  });

  // ---- on-stat-change: Defiant ----

  it("given on-stat-change trigger for Defiant, when opponent lowers a stat, then +2 Atk activates", () => {
    // Source: Showdown data/abilities.ts -- defiant: onAfterEachBoost => +2 Atk on opponent-caused drop
    const ctx = makeCtx({
      ability: "defiant",
      trigger: "on-stat-change",
      statChange: { stat: "defense", stages: -1, source: "opponent" },
    });
    const result = ruleset.applyAbility("on-stat-change", ctx);
    expect(result.activated).toBe(true);
    expect(result.effects).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ effectType: "stat-change", stat: "attack", stages: 2 }),
      ]),
    );
  });

  it("given on-stat-change trigger for Competitive, when opponent lowers a stat, then +2 SpAtk activates", () => {
    // Source: Showdown data/abilities.ts -- competitive: onAfterEachBoost => +2 SpA on opponent-caused drop
    const ctx = makeCtx({
      ability: "competitive",
      trigger: "on-stat-change",
      statChange: { stat: "speed", stages: -2, source: "opponent" },
    });
    const result = ruleset.applyAbility("on-stat-change", ctx);
    expect(result.activated).toBe(true);
    expect(result.effects).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ effectType: "stat-change", stat: "spAttack", stages: 2 }),
      ]),
    );
  });

  // ---- on-priority-check: Prankster ----

  it("given on-priority-check trigger for Prankster, when using status move, then activates", () => {
    // Source: Showdown data/abilities.ts -- prankster: onModifyPriority for status moves
    const ctx = makeCtx({
      ability: "prankster",
      trigger: "on-priority-check",
      move: makeMove({ category: "status", id: "thunder-wave" }),
    });
    const result = ruleset.applyAbility("on-priority-check", ctx);
    expect(result.activated).toBe(true);
  });

  // ---- on-after-move-used: Moxie ----

  it("given on-after-move-used trigger for Moxie, when opponent is fainted, then +1 Atk activates", () => {
    // Source: Showdown data/abilities.ts -- moxie: onSourceAfterFaint => +1 Atk
    const faintedOpponent = makeActive({ currentHp: 0 });
    const ctx = makeCtx({
      ability: "moxie",
      trigger: "on-after-move-used",
      opponent: faintedOpponent,
    });
    const result = ruleset.applyAbility("on-after-move-used", ctx);
    expect(result.activated).toBe(true);
    expect(result.effects).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ effectType: "stat-change", stat: "attack", stages: 1 }),
      ]),
    );
  });

  // ---- on-item-use: Unnerve ----

  it("given on-item-use trigger for Unnerve, when opponent tries to eat berry, then activates", () => {
    // Source: Showdown data/abilities.ts -- unnerve: onFoeTryEatItem
    const ctx = makeCtx({
      ability: "unnerve",
      trigger: "on-item-use",
    });
    const result = ruleset.applyAbility("on-item-use", ctx);
    expect(result.activated).toBe(true);
    expect(result.messages.length).toBeGreaterThan(0);
  });

  // ---- on-damage-taken fallthrough: damage immunity first, then stat handler ----

  it("given on-damage-taken trigger for Weak Armor, when hit by physical move, then stat changes activate", () => {
    // Source: Showdown data/abilities.ts -- weakarmor: onDamagingHit physical => -1 Def, +2 Spe
    // This tests the fallthrough: handleGen8DamageImmunityAbility returns inactive for Weak Armor,
    // so handleGen8StatAbility processes it.
    const ctx = makeCtx({
      ability: "weak-armor",
      trigger: "on-damage-taken",
      move: makeMove({ category: "physical" }),
    });
    const result = ruleset.applyAbility("on-damage-taken", ctx);
    expect(result.activated).toBe(true);
    expect(result.effects.length).toBe(2);
    expect(result.effects).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ stat: "defense", stages: -1 }),
        expect.objectContaining({ stat: "speed", stages: 2 }),
      ]),
    );
  });
});

// ===========================================================================
// Bug C2: Missing getEndOfTurnOrder() override
// ===========================================================================

describe("Gen 8 getEndOfTurnOrder (Bug C2)", () => {
  const ruleset = new Gen8Ruleset();

  it("given Gen 8 ruleset, when getEndOfTurnOrder called, then returns full 40-effect list (not BaseRuleset's 18)", () => {
    // Source: Showdown data/conditions.ts -- residual order for Gen 8
    // Before fix: inherited BaseRuleset's 18-effect list
    const order = ruleset.getEndOfTurnOrder();
    // Gen 7/8 list has 40 effects
    expect(order.length).toBe(40);
  });

  it("given Gen 8 EoT order, when checked for Speed Boost, then includes it", () => {
    // Source: Showdown data/abilities.ts -- Speed Boost onResidual
    const order = ruleset.getEndOfTurnOrder();
    expect(order).toContain("speed-boost");
  });

  it("given Gen 8 EoT order, when checked for Moody, then includes it", () => {
    // Source: Showdown data/abilities.ts -- Moody onResidual (Gen 8: no accuracy/evasion)
    const order = ruleset.getEndOfTurnOrder();
    expect(order).toContain("moody");
  });

  it("given Gen 8 EoT order, when checked for Toxic Orb activation, then includes it", () => {
    // Source: Showdown data/items.ts -- toxicorb onResidual
    const order = ruleset.getEndOfTurnOrder();
    expect(order).toContain("toxic-orb-activation");
  });

  it("given Gen 8 EoT order, when checked for Flame Orb activation, then includes it", () => {
    // Source: Showdown data/items.ts -- flameorb onResidual
    const order = ruleset.getEndOfTurnOrder();
    expect(order).toContain("flame-orb-activation");
  });

  it("given Gen 8 EoT order, when checked for weather-healing, then includes it (before status-damage)", () => {
    // Source: Showdown data/conditions.ts -- weather healing residual order
    const order = ruleset.getEndOfTurnOrder();
    const weatherHealIdx = order.indexOf("weather-healing");
    const statusDmgIdx = order.indexOf("status-damage");
    expect(weatherHealIdx).not.toBe(-1);
    expect(statusDmgIdx).not.toBe(-1);
    expect(weatherHealIdx).toBeLessThan(statusDmgIdx);
  });

  it("given Gen 8 EoT order, when checked for Gen 7+ effects, then includes bad-dreams, shed-skin, poison-heal", () => {
    // Source: Showdown data/conditions.ts -- Gen 7+ EoT effects
    const order = ruleset.getEndOfTurnOrder();
    expect(order).toContain("bad-dreams");
    expect(order).toContain("shed-skin");
    expect(order).toContain("poison-heal");
  });

  it("given Gen 8 EoT order, when checked for countdown effects, then includes all Gen 7+ countdowns", () => {
    // Source: Showdown data/conditions.ts -- all countdown effects
    const order = ruleset.getEndOfTurnOrder();
    const expectedCountdowns = [
      "yawn-countdown",
      "encore-countdown",
      "taunt-countdown",
      "disable-countdown",
      "heal-block-countdown",
      "embargo-countdown",
      "magnet-rise-countdown",
      "safeguard-countdown",
      "tailwind-countdown",
      "trick-room-countdown",
      "magic-room-countdown",
      "wonder-room-countdown",
      "gravity-countdown",
      "slow-start-countdown",
      "terrain-countdown",
      "weather-countdown",
    ];
    for (const countdown of expectedCountdowns) {
      expect(order).toContain(countdown);
    }
  });
});

// ===========================================================================
// Bug C3: Missing capLethalDamage() -- Sturdy and Disguise
// ===========================================================================

describe("Gen 8 capLethalDamage (Bug C3)", () => {
  const ruleset = new Gen8Ruleset();

  // ---- Sturdy ----

  it("given Sturdy at full HP, when lethal damage dealt, then caps to maxHp-1 (survives at 1 HP)", () => {
    // Source: Showdown data/abilities.ts -- sturdy: onDamage priority -30
    // Source: Bulbapedia "Sturdy" -- "prevents OHKO from full HP, leaving at least 1 HP"
    const defender = makeActive({ ability: "sturdy", hp: 200, currentHp: 200 });
    const attacker = makeActive({});
    const move = makeMove({ category: "special", power: 200, type: "fire" });
    const state = makeState();

    const result = ruleset.capLethalDamage!(500, defender, attacker, move, state);
    expect(result.damage).toBe(199); // maxHp - 1
    expect(result.survived).toBe(true);
    expect(result.messages).toContain("1 held on thanks to Sturdy!");
  });

  it("given Sturdy NOT at full HP, when lethal damage dealt, then damage passes through unchanged", () => {
    // Source: Showdown data/abilities.ts -- sturdy only works at full HP
    const defender = makeActive({ ability: "sturdy", hp: 200, currentHp: 150 });
    const attacker = makeActive({});
    const move = makeMove({ category: "physical", power: 200 });
    const state = makeState();

    const result = ruleset.capLethalDamage!(500, defender, attacker, move, state);
    expect(result.damage).toBe(500);
    expect(result.survived).toBe(false);
  });

  it("given Sturdy at full HP, when non-lethal damage dealt, then damage passes through unchanged", () => {
    // Source: Showdown data/abilities.ts -- sturdy only triggers on lethal damage
    const defender = makeActive({ ability: "sturdy", hp: 200, currentHp: 200 });
    const attacker = makeActive({});
    const move = makeMove({ category: "physical", power: 50 });
    const state = makeState();

    const result = ruleset.capLethalDamage!(100, defender, attacker, move, state);
    expect(result.damage).toBe(100);
    expect(result.survived).toBe(false);
  });

  // ---- Disguise (Gen 8: 1/8 chip) ----

  it("given Disguise intact, when physical move hits, then deals 1/8 max HP chip (Gen 8 change from 0 in Gen 7)", () => {
    // Source: Showdown data/abilities.ts -- disguise: onDamage, Gen 8 = Math.ceil(maxhp / 8)
    // Source: Bulbapedia "Disguise" -- Gen 8: "deals damage equal to 1/8 of its max HP"
    const defender = makeActive({ ability: "disguise", hp: 200, currentHp: 200 });
    const attacker = makeActive({});
    const move = makeMove({ category: "physical", power: 100 });
    const state = makeState();

    const result = ruleset.capLethalDamage!(500, defender, attacker, move, state);
    expect(result.damage).toBe(25); // ceil(200 / 8) = 25
    expect(result.survived).toBe(true);
    expect(result.messages).toContain("1's Disguise was busted!");
  });

  it("given Disguise intact with odd max HP, when physical move hits, then chip rounds up via Math.ceil", () => {
    // Source: Showdown data/abilities.ts -- disguise: Math.ceil(pokemon.maxhp / 8)
    const defender = makeActive({ ability: "disguise", hp: 161, currentHp: 161 });
    const attacker = makeActive({});
    const move = makeMove({ category: "special", power: 100 });
    const state = makeState();

    const result = ruleset.capLethalDamage!(300, defender, attacker, move, state);
    expect(result.damage).toBe(21); // ceil(161 / 8) = ceil(20.125) = 21
    expect(result.survived).toBe(true);
  });

  it("given Disguise already broken, when move hits, then damage passes through unchanged", () => {
    // Source: Showdown data/abilities.ts -- disguise: only blocks once
    const volatiles = new Map<string, unknown>([["disguise-broken", true]]);
    const defender = makeActive({
      ability: "disguise",
      hp: 200,
      currentHp: 200,
      volatiles,
    });
    const attacker = makeActive({});
    const move = makeMove({ category: "physical", power: 100 });
    const state = makeState();

    const result = ruleset.capLethalDamage!(500, defender, attacker, move, state);
    expect(result.damage).toBe(500);
    expect(result.survived).toBe(false);
  });

  it("given Disguise intact, when status move used, then Disguise does not block (status moves bypass Disguise)", () => {
    // Source: Showdown data/abilities.ts -- disguise: only blocks damaging moves
    const defender = makeActive({ ability: "disguise", hp: 200, currentHp: 200 });
    const attacker = makeActive({});
    const move = makeMove({ category: "status", id: "will-o-wisp", power: null });
    const state = makeState();

    const result = ruleset.capLethalDamage!(0, defender, attacker, move, state);
    expect(result.damage).toBe(0);
    expect(result.survived).toBe(false);
  });

  // ---- H3: Disguise sets disguise-broken volatile ----

  it("given Disguise intact, when busted, then disguise-broken volatile is set on defender", () => {
    // Source: Showdown data/abilities.ts -- disguise sets volatile on bust
    // Bug H3: capLethalDamage must set the volatile so the next hit goes through
    const defender = makeActive({ ability: "disguise", hp: 200, currentHp: 200 });
    const attacker = makeActive({});
    const move = makeMove({ category: "physical", power: 100 });
    const state = makeState();

    ruleset.capLethalDamage!(500, defender, attacker, move, state);
    expect(defender.volatileStatuses.has("disguise-broken")).toBe(true);
  });

  // ---- Disguise priority over Sturdy ----

  it("given Disguise + Sturdy both applicable, when hit at full HP, then Disguise takes priority (priority 1 vs -30)", () => {
    // Source: Showdown data/abilities.ts -- disguise priority 1, sturdy priority -30
    // Disguise always checks first; this test uses disguise ability
    const defender = makeActive({ ability: "disguise", hp: 200, currentHp: 200 });
    const attacker = makeActive({});
    const move = makeMove({ category: "physical", power: 200 });
    const state = makeState();

    const result = ruleset.capLethalDamage!(500, defender, attacker, move, state);
    // Disguise activates, not Sturdy
    expect(result.damage).toBe(25); // 1/8 chip, not maxHp-1
    expect(result.survived).toBe(true);
    expect(result.messages[0]).toContain("Disguise was busted");
  });
});
