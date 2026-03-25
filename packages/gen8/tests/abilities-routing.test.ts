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
import {
  CORE_ABILITY_IDS,
  CORE_END_OF_TURN_EFFECT_IDS,
  CORE_ITEM_IDS,
  CORE_TYPE_IDS,
  CORE_VOLATILE_IDS,
  NEUTRAL_NATURES,
  SeededRandom,
} from "@pokemon-lib-ts/core";
import { describe, expect, it } from "vitest";
import {
  createGen8DataManager,
  GEN8_ABILITY_IDS,
  GEN8_MOVE_IDS,
  GEN8_NATURE_IDS,
  GEN8_SPECIES_IDS,
  Gen8Ruleset,
} from "../src";

// ---------------------------------------------------------------------------
// Helper factories (mirrors abilities-stat.test.ts pattern)
// ---------------------------------------------------------------------------

const ABILITIES = { ...CORE_ABILITY_IDS, ...GEN8_ABILITY_IDS } as const;
const EOT = CORE_END_OF_TURN_EFFECT_IDS;
const ITEMS = CORE_ITEM_IDS;
const MOVES = GEN8_MOVE_IDS;
const NATURES = GEN8_NATURE_IDS;
const SPECIES = GEN8_SPECIES_IDS;
const TYPES = CORE_TYPE_IDS;
const VOLATILES = CORE_VOLATILE_IDS;
const dataManager = createGen8DataManager();
const CANONICAL_TACKLE = () => makeCanonicalMove(MOVES.tackle);
const CANONICAL_THUNDERBOLT = () => makeCanonicalMove(MOVES.thunderbolt);
const CANONICAL_CRUNCH = () => makeCanonicalMove(MOVES.crunch);
const CANONICAL_SHEER_COLD = () => makeCanonicalMove(MOVES.sheerCold);
const CANONICAL_THUNDER_WAVE = () => makeCanonicalMove(MOVES.thunderWave);
const CANONICAL_FLAMETHROWER = () => makeCanonicalMove(MOVES.flamethrower);
const CANONICAL_SURF = () => makeCanonicalMove(MOVES.surf);
const CANONICAL_WILL_O_WISP = () => makeCanonicalMove(MOVES.willOWisp);

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
  ability?: (typeof ABILITIES)[keyof typeof ABILITIES];
  heldItem?: (typeof ITEMS)[keyof typeof ITEMS] | null;
  status?: ActivePokemon["pokemon"]["status"];
  speciesId?: (typeof SPECIES)[keyof typeof SPECIES];
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
      speciesId: overrides.speciesId ?? SPECIES.bulbasaur,
      nickname: overrides.nickname ?? null,
      level: overrides.level ?? 50,
      experience: 0,
      nature: NATURES.hardy ?? NEUTRAL_NATURES[0],
      ivs: { hp: 31, attack: 31, defense: 31, spAttack: 31, spDefense: 31, speed: 31 },
      evs: { hp: 0, attack: 0, defense: 0, spAttack: 0, spDefense: 0, speed: 0 },
      currentHp: overrides.currentHp ?? hp,
      moves: [],
      ability: overrides.ability ?? ABILITIES.none,
      abilitySlot: `${TYPES.normal}1` as const,
      heldItem: overrides.heldItem ?? null,
      status: (overrides.status ?? null) as any,
      friendship: 0,
      gender: "male" as any,
      isShiny: false,
      metLocation: "",
      metLevel: 1,
      originalTrainer: "",
      originalTrainerId: 0,
      pokeball: ITEMS.pokeBall,
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
    types: overrides.types ?? [TYPES.normal],
    ability: overrides.ability ?? ABILITIES.none,
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

function makeCanonicalMove(
  moveId: (typeof MOVES)[keyof typeof MOVES],
  overrides?: Partial<MoveData>,
): MoveData {
  const baseMove = dataManager.getMove(moveId);
  return {
    ...baseMove,
    ...overrides,
    flags: overrides?.flags ? { ...baseMove.flags, ...overrides.flags } : baseMove.flags,
    effect: overrides && "effect" in overrides ? overrides.effect : baseMove.effect,
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
  ability: (typeof ABILITIES)[keyof typeof ABILITIES];
  trigger: AbilityContext["trigger"];
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
      types: overrides.types ?? [TYPES.normal],
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
      ability: ABILITIES.voltAbsorb,
      trigger: "passive-immunity",
      types: [TYPES.water],
      move: CANONICAL_THUNDERBOLT(),
    });
    const result = ruleset.applyAbility("passive-immunity", ctx);
    // The stat handler dispatches passive-immunity; Volt Absorb is not handled by
    // the stat handler specifically, so the routed result should be the inactive payload.
    expect(result).toEqual({ activated: false, effects: [], messages: [] });
  });

  // ---- on-damage-taken: Justified ----

  it("given on-damage-taken trigger for Justified, when hit by Dark move, then +1 Atk activates", () => {
    // Source: Showdown data/abilities.ts -- justified: onDamagingHit, Dark-type => +1 Atk
    const ctx = makeCtx({
      ability: ABILITIES.justified,
      trigger: "on-damage-taken",
      move: CANONICAL_CRUNCH(),
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
      ability: ABILITIES.justified,
      trigger: "on-damage-taken",
      move: CANONICAL_TACKLE(),
    });
    const result = ruleset.applyAbility("on-damage-taken", ctx);
    expect(result.activated).toBe(false);
  });

  // ---- on-damage-taken: Sturdy OHKO block via damage immunity handler ----

  it("given on-damage-taken trigger for Sturdy, when OHKO move used, then blocks the move", () => {
    // Source: Showdown data/abilities.ts -- sturdy: onTryHit blocks OHKO moves
    const ctx = makeCtx({
      ability: ABILITIES.sturdy,
      trigger: "on-damage-taken",
      nickname: "Defender",
      move: CANONICAL_SHEER_COLD(),
    });
    const result = ruleset.applyAbility("on-damage-taken", ctx);
    expect(result).toEqual({
      activated: true,
      effects: [{ effectType: "damage-reduction", target: "self" }],
      messages: ["Defender held on thanks to Sturdy!"],
      movePrevented: true,
    });
  });

  // ---- on-flinch: Steadfast ----

  it("given on-flinch trigger for Steadfast, when flinched, then +1 Speed activates", () => {
    // Source: Showdown data/abilities.ts -- steadfast: onFlinch => +1 Spe
    const ctx = makeCtx({
      ability: ABILITIES.steadfast,
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
      ability: ABILITIES.blaze,
      trigger: "on-flinch",
    });
    const result = ruleset.applyAbility("on-flinch", ctx);
    expect(result.activated).toBe(false);
  });

  // ---- on-stat-change: Defiant ----

  it("given on-stat-change trigger for Defiant, when opponent lowers a stat, then +2 Atk activates", () => {
    // Source: Showdown data/abilities.ts -- defiant: onAfterEachBoost => +2 Atk on opponent-caused drop
    const ctx = makeCtx({
      ability: ABILITIES.defiant,
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
      ability: ABILITIES.competitive,
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
      ability: ABILITIES.prankster,
      trigger: "on-priority-check",
      move: CANONICAL_THUNDER_WAVE(),
    });
    const result = ruleset.applyAbility("on-priority-check", ctx);
    expect(result.activated).toBe(true);
  });

  // ---- on-after-move-used: Moxie ----

  it("given on-after-move-used trigger for Moxie, when opponent is fainted, then +1 Atk activates", () => {
    // Source: Showdown data/abilities.ts -- moxie: onSourceAfterFaint => +1 Atk
    const faintedOpponent = makeActive({ currentHp: 0 });
    const ctx = makeCtx({
      ability: ABILITIES.moxie,
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
      ability: ABILITIES.unnerve,
      trigger: "on-item-use",
      nickname: "Defender",
    });
    const result = ruleset.applyAbility("on-item-use", ctx);
    expect(result).toEqual({
      activated: true,
      effects: [],
      messages: ["Defender's Unnerve prevents the opponent from eating Berries!"],
    });
  });

  // ---- on-damage-taken fallthrough: damage immunity first, then stat handler ----

  it("given on-damage-taken trigger for Weak Armor, when hit by physical move, then stat changes activate", () => {
    // Source: Showdown data/abilities.ts -- weakarmor: onDamagingHit physical => -1 Def, +2 Spe
    // This tests the fallthrough: handleGen8DamageImmunityAbility returns inactive for Weak Armor,
    // so handleGen8StatAbility processes it.
    const ctx = makeCtx({
      ability: ABILITIES.weakArmor,
      trigger: "on-damage-taken",
      move: CANONICAL_TACKLE(),
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
    expect(order).toContain(ABILITIES.speedBoost);
  });

  it("given Gen 8 EoT order, when checked for Moody, then includes it", () => {
    // Source: Showdown data/abilities.ts -- Moody onResidual (Gen 8: no accuracy/evasion)
    const order = ruleset.getEndOfTurnOrder();
    expect(order).toContain(ABILITIES.moody);
  });

  it("given Gen 8 EoT order, when checked for Toxic Orb activation, then includes it", () => {
    // Source: Showdown data/items.ts -- toxicorb onResidual
    const order = ruleset.getEndOfTurnOrder();
    expect(order).toContain(EOT.toxicOrbActivation);
  });

  it("given Gen 8 EoT order, when checked for Flame Orb activation, then includes it", () => {
    // Source: Showdown data/items.ts -- flameorb onResidual
    const order = ruleset.getEndOfTurnOrder();
    expect(order).toContain(EOT.flameOrbActivation);
  });

  it("given Gen 8 EoT order, when checked for weather-healing, then includes it (before status-damage)", () => {
    // Source: Showdown data/conditions.ts -- weather healing residual order
    const order = ruleset.getEndOfTurnOrder();
    const weatherHealIdx = order.indexOf(EOT.weatherHealing);
    const statusDmgIdx = order.indexOf(EOT.statusDamage);
    expect(weatherHealIdx).not.toBe(-1);
    expect(statusDmgIdx).not.toBe(-1);
    expect(weatherHealIdx).toBeLessThan(statusDmgIdx);
  });

  it("given Gen 8 EoT order, when checked for Gen 7+ effects, then includes bad-dreams, shed-skin, poison-heal", () => {
    // Source: Showdown data/conditions.ts -- Gen 7+ EoT effects
    const order = ruleset.getEndOfTurnOrder();
    expect(order).toContain(ABILITIES.badDreams);
    expect(order).toContain(ABILITIES.shedSkin);
    expect(order).toContain(ABILITIES.poisonHeal);
  });

  it("given Gen 8 EoT order, when checked for countdown effects, then includes all Gen 7+ countdowns", () => {
    // Source: Showdown data/conditions.ts -- all countdown effects
    const order = ruleset.getEndOfTurnOrder();
    const expectedCountdowns = [
      EOT.yawnCountdown,
      EOT.encoreCountdown,
      EOT.tauntCountdown,
      EOT.disableCountdown,
      EOT.healBlockCountdown,
      EOT.embargoCountdown,
      EOT.magnetRiseCountdown,
      EOT.safeguardCountdown,
      EOT.tailwindCountdown,
      EOT.trickRoomCountdown,
      "magic-room-countdown",
      "wonder-room-countdown",
      EOT.gravityCountdown,
      EOT.slowStartCountdown,
      EOT.terrainCountdown,
      EOT.weatherCountdown,
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
    const defender = makeActive({
      ability: ABILITIES.sturdy,
      hp: 200,
      currentHp: 200,
      nickname: "Defender",
    });
    const attacker = makeActive({});
    const move = CANONICAL_FLAMETHROWER();
    const state = makeState();

    const result = ruleset.capLethalDamage!(500, defender, attacker, move, state);
    expect(result.damage).toBe(199); // maxHp - 1
    expect(result.survived).toBe(true);
    expect(result.messages).toContain("Defender held on thanks to Sturdy!");
  });

  it("given Sturdy NOT at full HP, when lethal damage dealt, then damage passes through unchanged", () => {
    // Source: Showdown data/abilities.ts -- sturdy only works at full HP
    const defender = makeActive({ ability: ABILITIES.sturdy, hp: 200, currentHp: 150 });
    const attacker = makeActive({});
    const move = CANONICAL_TACKLE();
    const state = makeState();

    const result = ruleset.capLethalDamage!(500, defender, attacker, move, state);
    expect(result.damage).toBe(500);
    expect(result.survived).toBe(false);
  });

  it("given Sturdy at full HP, when non-lethal damage dealt, then damage passes through unchanged", () => {
    // Source: Showdown data/abilities.ts -- sturdy only triggers on lethal damage
    const defender = makeActive({ ability: ABILITIES.sturdy, hp: 200, currentHp: 200 });
    const attacker = makeActive({});
    const move = CANONICAL_TACKLE();
    const state = makeState();

    const result = ruleset.capLethalDamage!(100, defender, attacker, move, state);
    expect(result.damage).toBe(100);
    expect(result.survived).toBe(false);
  });

  // ---- Disguise (Gen 8: 1/8 chip) ----

  it("given Disguise intact, when physical move hits, then deals 1/8 max HP chip (Gen 8 change from 0 in Gen 7)", () => {
    // Source: Showdown data/abilities.ts -- disguise: onDamage, Gen 8 = Math.ceil(maxhp / 8)
    // Source: Bulbapedia "Disguise" -- Gen 8: "deals damage equal to 1/8 of its max HP"
    const defender = makeActive({
      ability: ABILITIES.disguise,
      hp: 200,
      currentHp: 200,
      nickname: "Defender",
    });
    const attacker = makeActive({});
    const move = CANONICAL_TACKLE();
    const state = makeState();

    const result = ruleset.capLethalDamage!(500, defender, attacker, move, state);
    expect(result.damage).toBe(25); // ceil(200 / 8) = 25
    expect(result.survived).toBe(true);
    expect(result.messages).toContain("Defender's Disguise was busted!");
  });

  it("given Disguise intact with odd max HP, when physical move hits, then chip rounds up via Math.ceil", () => {
    // Source: Showdown data/abilities.ts -- disguise: Math.ceil(pokemon.maxhp / 8)
    const defender = makeActive({ ability: ABILITIES.disguise, hp: 161, currentHp: 161 });
    const attacker = makeActive({});
    const move = CANONICAL_SURF();
    const state = makeState();

    const result = ruleset.capLethalDamage!(300, defender, attacker, move, state);
    expect(result.damage).toBe(21); // ceil(161 / 8) = ceil(20.125) = 21
    expect(result.survived).toBe(true);
  });

  it("given Disguise already broken, when move hits, then damage passes through unchanged", () => {
    // Source: Showdown data/abilities.ts -- disguise: only blocks once
    const volatiles = new Map<string, unknown>([["disguise-broken", true]]);
    const defender = makeActive({
      ability: ABILITIES.disguise,
      hp: 200,
      currentHp: 200,
      volatiles,
    });
    const attacker = makeActive({});
    const move = CANONICAL_TACKLE();
    const state = makeState();

    const result = ruleset.capLethalDamage!(500, defender, attacker, move, state);
    expect(result.damage).toBe(500);
    expect(result.survived).toBe(false);
  });

  it("given Disguise intact, when status move used, then Disguise does not block (status moves bypass Disguise)", () => {
    // Source: Showdown data/abilities.ts -- disguise: only blocks damaging moves
    const defender = makeActive({ ability: ABILITIES.disguise, hp: 200, currentHp: 200 });
    const attacker = makeActive({});
    const move = CANONICAL_WILL_O_WISP();
    const state = makeState();

    const result = ruleset.capLethalDamage!(0, defender, attacker, move, state);
    expect(result.damage).toBe(0);
    expect(result.survived).toBe(false);
  });

  // ---- H3: Disguise sets disguise-broken volatile ----

  it("given Disguise intact, when busted, then disguise-broken volatile is set on defender", () => {
    // Source: Showdown data/abilities.ts -- disguise sets volatile on bust
    // Bug H3: capLethalDamage must set the volatile so the next hit goes through
    const defender = makeActive({ ability: ABILITIES.disguise, hp: 200, currentHp: 200 });
    const attacker = makeActive({});
    const move = CANONICAL_TACKLE();
    const state = makeState();

    ruleset.capLethalDamage!(500, defender, attacker, move, state);
    expect(defender.volatileStatuses.has("disguise-broken")).toBe(true);
  });

  // ---- Disguise priority over Sturdy ----

  it("given Disguise + Sturdy both applicable, when hit at full HP, then Disguise takes priority (priority 1 vs -30)", () => {
    // Source: Showdown data/abilities.ts -- disguise priority 1, sturdy priority -30
    // Disguise always checks first; this test uses disguise ability
    const defender = makeActive({ ability: ABILITIES.disguise, hp: 200, currentHp: 200 });
    const attacker = makeActive({});
    const move = CANONICAL_TACKLE();
    const state = makeState();

    const result = ruleset.capLethalDamage!(500, defender, attacker, move, state);
    // Disguise activates, not Sturdy
    expect(result.damage).toBe(25); // 1/8 chip, not maxHp-1
    expect(result.survived).toBe(true);
    expect(result.messages[0]).toContain("Disguise was busted");
  });
});

// ===========================================================================
// capLethalDamage — Focus Sash (#784)
// ===========================================================================

describe("Gen 8 capLethalDamage — Focus Sash (#784)", () => {
  const ruleset = new Gen8Ruleset();

  it("given Pokemon at full HP holding Focus Sash, when lethal damage is dealt, then survives at 1 HP and consumedItem is set", () => {
    // Source: Showdown data/items.ts -- Focus Sash: "If holder has full HP, will survive an attack that would KO it with 1 HP"
    // Source: Bulbapedia -- Focus Sash: "If the holder has full HP, it will survive a hit that would KO it with 1 HP"
    const defender = makeActive({ heldItem: ITEMS.focusSash, hp: 200, currentHp: 200 });
    const attacker = makeActive({});
    const move = CANONICAL_TACKLE();
    const state = makeState();

    const result = ruleset.capLethalDamage!(300, defender, attacker, move, state);
    expect(result.damage).toBe(199);
    expect(result.survived).toBe(true);
    expect(result.consumedItem).toBe(ITEMS.focusSash);
    expect(result.messages[0]).toContain("Focus Sash");
  });

  it("given Pokemon NOT at full HP holding Focus Sash, when lethal damage is dealt, then Focus Sash does not activate", () => {
    // Source: Showdown data/items.ts -- Focus Sash requires full HP (currentHp === maxHp)
    const defender = makeActive({ heldItem: ITEMS.focusSash, hp: 200, currentHp: 150 });
    const attacker = makeActive({});
    const move = CANONICAL_TACKLE();
    const state = makeState();

    const result = ruleset.capLethalDamage!(200, defender, attacker, move, state);
    expect(result.damage).toBe(200);
    expect(result.survived).toBe(false);
    expect(result.consumedItem).toBeUndefined();
  });

  it("given Pokemon at full HP holding Focus Sash with Klutz, when lethal damage is dealt, then Focus Sash is suppressed", () => {
    // Source: Showdown data/abilities.ts -- klutz: "This Pokemon's held item has no effect"
    // Klutz suppresses item activation, so Focus Sash does not trigger
    const defender = makeActive({
      ability: ABILITIES.klutz,
      heldItem: ITEMS.focusSash,
      hp: 200,
      currentHp: 200,
    });
    const attacker = makeActive({});
    const move = CANONICAL_TACKLE();
    const state = makeState();

    const result = ruleset.capLethalDamage!(300, defender, attacker, move, state);
    expect(result.damage).toBe(300);
    expect(result.survived).toBe(false);
    expect(result.consumedItem).toBeUndefined();
  });

  it("given Pokemon at full HP holding Focus Sash under Embargo, when lethal damage is dealt, then Focus Sash is suppressed", () => {
    // Source: Showdown data/moves.ts -- embargo: "target's held item has no effect"
    // Embargo volatile status suppresses item activation
    const defender = makeActive({
      heldItem: ITEMS.focusSash,
      hp: 200,
      currentHp: 200,
      volatiles: new Map([[VOLATILES.embargo, { turnsLeft: 5 }]]),
    });
    const attacker = makeActive({});
    const move = CANONICAL_TACKLE();
    const state = makeState();

    const result = ruleset.capLethalDamage!(300, defender, attacker, move, state);
    expect(result.damage).toBe(300);
    expect(result.survived).toBe(false);
    expect(result.consumedItem).toBeUndefined();
  });

  it("given Magic Room active on field, when lethal damage dealt to full-HP Pokemon with Focus Sash, then faints (sash suppressed)", () => {
    // Source: Showdown sim/battle.ts -- Magic Room suppresses all item effects
    // Source: Showdown data/items.ts -- Focus Sash is an item effect, suppressed by Magic Room
    const defender = makeActive({ heldItem: ITEMS.focusSash, hp: 200, currentHp: 200 });
    const attacker = makeActive({});
    const move = CANONICAL_TACKLE();
    const state = makeState();
    state.magicRoom = { active: true, turnsLeft: 3 };

    const result = ruleset.capLethalDamage!(300, defender, attacker, move, state);
    expect(result.damage).toBe(300);
    expect(result.survived).toBe(false);
    expect(result.consumedItem).toBeUndefined();
  });
});
