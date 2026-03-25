import type { AbilityContext, ActivePokemon, BattleState } from "@pokemon-lib-ts/battle";
import {
  CORE_ABILITY_IDS,
  CORE_STATUS_IDS,
  CORE_TYPE_IDS,
  NEUTRAL_NATURES,
  type PokemonInstance,
  type PokemonType,
  type PrimaryStatus,
  type StatBlock,
} from "@pokemon-lib-ts/core";
import { describe, expect, it } from "vitest";
import {
  createGen3DataManager,
  GEN3_ABILITY_IDS,
  GEN3_ITEM_IDS,
  GEN3_MOVE_IDS,
  GEN3_SPECIES_IDS,
  applyGen3Ability,
  Gen3Ruleset,
} from "../../src";

/**
 * Gen 3 Wave 3 Ability Tests
 *
 * Tests for abilities introduced/refined in Wave 3:
 *   - Trace: copies opponent's ability on switch-in
 *   - Pressure: PP deducted is 2 when facing Pressure (via getPPCost)
 *   - Truant: alternates between acting and loafing (on-before-move)
 *   - Color Change: changes type to the type of the damaging move that hit it (on-damage-taken)
 *   - Synchronize: mirrors burn/paralysis/poison to opponent (on-status-inflicted)
 *
 * Source hierarchy for Gen 3:
 *   1. pret/pokeemerald disassembly (ground truth)
 *   2. Pokemon Showdown Gen 3 mod
 *   3. Bulbapedia
 */

// ---------------------------------------------------------------------------
// Test helpers
// ---------------------------------------------------------------------------

const dataManager = createGen3DataManager();
const A = {
  ...CORE_ABILITY_IDS,
  ...GEN3_ABILITY_IDS,
} as const;
const S = CORE_STATUS_IDS;
const T = CORE_TYPE_IDS;
const I = GEN3_ITEM_IDS;
const M = GEN3_MOVE_IDS;
const SP = GEN3_SPECIES_IDS;
const DEFAULT_NATURE = NEUTRAL_NATURES[0];
const PRESSURE_NAME = dataManager.getAbility(A.pressure).displayName;
const TRUANT_TURN = "truant-turn" as const;
const FLAMETHROWER = dataManager.getMove(M.flamethrower);
const THUNDERBOLT = dataManager.getMove(M.thunderbolt);

function createMockRng(nextValues: number[] = [0]) {
  let index = 0;
  return {
    next: () => {
      const val = nextValues[index % nextValues.length]!;
      index++;
      return val;
    },
    int: (_min: number, _max: number) => 85,
    chance: () => false,
    pick: <T>(arr: readonly T[]) => arr[0] as T,
    shuffle: <T>(arr: readonly T[]) => [...arr],
    getState: () => 0,
    setState: () => {},
  };
}

function createMockPokemon(opts: {
  types?: PokemonType[];
  ability?: string;
  status?: PrimaryStatus | null;
  hp?: number;
  maxHp?: number;
  gender?: "male" | "female" | "genderless";
  nickname?: string | null;
  speciesId?: number;
  heldItem?: string | null;
}): ActivePokemon {
  const maxHp = opts.maxHp ?? 200;
  const stats: StatBlock = {
    hp: maxHp,
    attack: 100,
    defense: 100,
    spAttack: 100,
    spDefense: 100,
    speed: 100,
  };

  const pokemon = {
    uid: "test-mon",
    speciesId: opts.speciesId ?? SP.gardevoir,
    nickname: opts.nickname ?? null,
    level: 50,
    experience: 0,
    nature: DEFAULT_NATURE,
    ivs: { hp: 0, attack: 0, defense: 0, spAttack: 0, spDefense: 0, speed: 0 },
    evs: { hp: 0, attack: 0, defense: 0, spAttack: 0, spDefense: 0, speed: 0 },
    currentHp: opts.hp ?? maxHp,
    moves: [],
    ability: opts.ability ?? A.none,
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
    pokeball: I.pokeBall,
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
    volatileStatuses: new Map(),
    types: opts.types ?? [T.normal],
    ability: opts.ability ?? A.none,
    lastMoveUsed: null,
    lastDamageTaken: 0,
    lastDamageType: null,
    lastDamageCategory: null,
    turnsOnField: 1,
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
  } as unknown as ActivePokemon;
}

function createMinimalBattleState(
  side0Active: ActivePokemon,
  side1Active: ActivePokemon,
): BattleState {
  return {
    sides: [
      {
        active: [side0Active],
        team: [side0Active.pokemon],
        screens: { reflect: null, lightScreen: null, auroraVeil: null },
        hazards: [],
        tailwind: { active: false, turnsLeft: 0 },
        futureAttack: null,
        faintCount: 0,
        gimmickUsed: false,
        trainer: null,
      },
      {
        active: [side1Active],
        team: [side1Active.pokemon],
        screens: { reflect: null, lightScreen: null, auroraVeil: null },
        hazards: [],
        tailwind: { active: false, turnsLeft: 0 },
        futureAttack: null,
        faintCount: 0,
        gimmickUsed: false,
        trainer: null,
      },
    ],
    weather: { type: null, turnsLeft: 0, source: null },
    terrain: { type: null, turnsLeft: 0, source: null },
    trickRoom: { active: false, turnsLeft: 0 },
    turnNumber: 1,
    phase: "action-select" as const,
    winner: null,
    ended: false,
  } as BattleState;
}

// ===========================================================================
// Trace -- copies opponent's ability on switch-in
// ===========================================================================

describe("Gen 3 Trace ability (on-switch-in)", () => {
  // Source: pret/pokeemerald — ABILITY_TRACE copies foe's ability on entry
  // Source: Bulbapedia — "Trace copies the opponent's Ability when entering battle"

  it("given a Pokemon with Trace, when switching in vs opponent with Intimidate, then copies Intimidate", () => {
    // Source: pret/pokeemerald — Trace copies the foe's ability, returns ability-change effect
    const tracer = createMockPokemon({
      types: [T.psychic],
      ability: A.trace,
      nickname: "Gardevoir",
    });
    const opponent = createMockPokemon({
      types: [T.normal],
      ability: A.intimidate,
      nickname: "Tauros",
    });
    const state = createMinimalBattleState(tracer, opponent);
    const rng = createMockRng();

    const context: AbilityContext = {
      pokemon: tracer,
      opponent,
      state,
      rng,
      trigger: "on-switch-in",
    };

    const result = applyGen3Ability("on-switch-in", context);
    expect(result.activated).toBe(true);
    expect(result.effects).toEqual([
      {
      effectType: "ability-change",
      target: "self",
      newAbility: A.intimidate,
      },
    ]);
    expect(result.messages).toEqual([`Gardevoir traced Tauros's ${A.intimidate}!`]);
  });

  it("given a Pokemon with Trace, when switching in vs opponent with Trace, then does not copy (banned)", () => {
    // Source: pret/pokeemerald — Trace cannot copy itself
    // Source: Bulbapedia — "Trace will not copy Trace"
    const tracer = createMockPokemon({
      types: [T.psychic],
      ability: A.trace,
      nickname: "Gardevoir",
    });
    const opponent = createMockPokemon({
      types: [T.psychic],
      ability: A.trace,
      nickname: "Alakazam",
    });
    const state = createMinimalBattleState(tracer, opponent);
    const rng = createMockRng();

    const context: AbilityContext = {
      pokemon: tracer,
      opponent,
      state,
      rng,
      trigger: "on-switch-in",
    };

    const result = applyGen3Ability("on-switch-in", context);
    expect(result.activated).toBe(false);
    expect(result.effects).toHaveLength(0);
  });

  it("given a Pokemon with Trace, when switching in vs opponent with Levitate, then copies Levitate", () => {
    // Source: pret/pokeemerald — Trace can copy any non-banned ability
    // Levitate is NOT in the Gen 3 banned list (only Trace itself is banned)
    const tracer = createMockPokemon({
      types: [T.psychic],
      ability: A.trace,
      nickname: "Gardevoir",
    });
    const opponent = createMockPokemon({
      types: [T.ghost, T.poison],
      ability: A.levitate,
      nickname: "Gengar",
    });
    const state = createMinimalBattleState(tracer, opponent);
    const rng = createMockRng();

    const context: AbilityContext = {
      pokemon: tracer,
      opponent,
      state,
      rng,
      trigger: "on-switch-in",
    };

    const result = applyGen3Ability("on-switch-in", context);
    expect(result.activated).toBe(true);
    expect(result.effects).toHaveLength(1);
    expect(result.effects[0]).toEqual({
      effectType: "ability-change",
      target: "self",
      newAbility: A.levitate,
    });
  });

  it("given a Pokemon with Trace, when switching in with no opponent, then does not activate", () => {
    // Edge case: no opponent present (e.g., fainted or empty slot)
    const tracer = createMockPokemon({ types: [T.psychic], ability: A.trace });
    const state = createMinimalBattleState(tracer, createMockPokemon({ types: [T.normal] }));
    const rng = createMockRng();

    const context: AbilityContext = {
      pokemon: tracer,
      opponent: undefined,
      state,
      rng,
      trigger: "on-switch-in",
    };

    const result = applyGen3Ability("on-switch-in", context);
    expect(result.activated).toBe(false);
  });
});

// ===========================================================================
// Pressure -- PP cost doubles, announced on switch-in
// ===========================================================================

describe("Gen 3 Pressure ability", () => {
  // Source: pret/pokeemerald — ABILITY_PRESSURE deducts extra PP
  // Source: Bulbapedia — "Pressure causes moves targeting the Ability-bearer to use 2 PP"

  describe("on-switch-in announcement", () => {
    it("given a Pokemon with Pressure, when switching in, then announces message", () => {
      // Source: pret/pokeemerald — Pressure announces on entry with no battle effect
      const pressureMon = createMockPokemon({
        types: [T.ice, T.flying],
        ability: A.pressure,
        nickname: "Articuno",
      });
      const opponent = createMockPokemon({ types: [T.normal] });
      const state = createMinimalBattleState(pressureMon, opponent);
      const rng = createMockRng();

      const context: AbilityContext = {
        pokemon: pressureMon,
        opponent,
        state,
        rng,
        trigger: "on-switch-in",
      };

      const result = applyGen3Ability("on-switch-in", context);
      expect(result.activated).toBe(true);
      expect(result.effects).toEqual([]);
      expect(result.messages).toEqual([`Articuno is exerting its ${PRESSURE_NAME}!`]);
    });
  });

  describe("getPPCost via Gen3Ruleset", () => {
    it("given a defender with Pressure, when actor uses a move, then PP cost is 2", () => {
      // Source: pret/pokeemerald — ABILITY_PRESSURE: deductsExtraMove
      // Source: Bulbapedia — "moves targeting the Ability-bearer use 2 PP"
      const ruleset = new Gen3Ruleset();
      const actor = createMockPokemon({ types: [T.normal], ability: A.none });
      const defender = createMockPokemon({ types: [T.ice, T.flying], ability: A.pressure });
      const state = createMinimalBattleState(actor, defender);

      const ppCost = ruleset.getPPCost(actor, defender, state);
      expect(ppCost).toBe(2);
    });

    it("given a defender without Pressure, when actor uses a move, then PP cost is 1", () => {
      // Source: pret/pokeemerald — default PP cost is 1 without Pressure
      const ruleset = new Gen3Ruleset();
      const actor = createMockPokemon({ types: [T.normal], ability: A.none });
      const defender = createMockPokemon({ types: [T.fire], ability: A.blaze });
      const state = createMinimalBattleState(actor, defender);

      const ppCost = ruleset.getPPCost(actor, defender, state);
      expect(ppCost).toBe(1);
    });

    it("given no defender (null), when actor uses a move, then PP cost is 1", () => {
      // Edge case: defender is null (e.g., field-targeting move or fainted opponent)
      const ruleset = new Gen3Ruleset();
      const actor = createMockPokemon({ types: [T.normal], ability: A.none });
      const state = createMinimalBattleState(actor, createMockPokemon({ types: [T.normal] }));

      const ppCost = ruleset.getPPCost(actor, null, state);
      expect(ppCost).toBe(1);
    });
  });
});

// ===========================================================================
// Truant -- alternates acting and loafing
// ===========================================================================

describe("Gen 3 Truant ability (on-before-move)", () => {
  // Source: pret/pokeemerald src/battle_util.c — ABILITY_TRUANT
  // Source: Bulbapedia — "Truant causes the Pokemon to use a move only every other turn"

  it("given Truant with no truant-turn volatile (first turn), when on-before-move fires, then move proceeds and volatile is NOT set (toggle is at end-of-turn)", () => {
    // Source: pret/pokeemerald -- Truant toggle at ABILITYEFFECT_ENDTURN, not at move execution
    // Source: pret/pokeemerald -- Truant acts on the turn it switches in
    const slaking = createMockPokemon({
      types: [T.normal],
      ability: A.truant,
      nickname: "Slaking",
    });
    const opponent = createMockPokemon({ types: [T.normal] });
    const state = createMinimalBattleState(slaking, opponent);
    const rng = createMockRng();

    // Ensure no volatile set initially
    expect(slaking.volatileStatuses.has(TRUANT_TURN)).toBe(false);

    const context: AbilityContext = {
      pokemon: slaking,
      opponent,
      state,
      rng,
      trigger: "on-before-move",
    };

    const result = applyGen3Ability("on-before-move", context);
    // Move proceeds (activated: false means the ability did not block the move)
    expect(result.activated).toBe(false);
    expect(result.movePrevented).toBeUndefined();
    // on-before-move does NOT toggle; volatile should NOT be set here
    expect(slaking.volatileStatuses.has(TRUANT_TURN)).toBe(false);
  });

  it("given Truant with truant-turn volatile (second turn), when on-before-move fires, then move is prevented but volatile is NOT removed (toggle is at end-of-turn)", () => {
    // Source: pret/pokeemerald -- Truant check at ABILITYEFFECT_MOVES_BLOCK
    // Source: pret/pokeemerald -- Truant toggle at ABILITYEFFECT_ENDTURN
    const slaking = createMockPokemon({
      types: [T.normal],
      ability: A.truant,
      nickname: "Slaking",
    });
    // Pre-set the truant-turn volatile (simulating previous end-of-turn toggle)
    slaking.volatileStatuses.set(TRUANT_TURN, { turnsLeft: -1 });
    const opponent = createMockPokemon({ types: [T.normal] });
    const state = createMinimalBattleState(slaking, opponent);
    const rng = createMockRng();

    const context: AbilityContext = {
      pokemon: slaking,
      opponent,
      state,
      rng,
      trigger: "on-before-move",
    };

    const result = applyGen3Ability("on-before-move", context);
    expect(result.activated).toBe(true);
    expect(result.movePrevented).toBe(true);
    expect(result.messages[0]).toContain("Slaking");
    expect(result.messages[0]).toContain("loafing around");
    // on-before-move does NOT toggle; volatile should STILL be present
    expect(slaking.volatileStatuses.has(TRUANT_TURN)).toBe(true);
  });

  it("given Truant, when simulating 3 consecutive turns with end-of-turn toggles, then the pattern is act-loaf-act", () => {
    // Source: pret/pokeemerald -- ABILITY_TRUANT alternates via ABILITYEFFECT_ENDTURN
    // Source: Bulbapedia -- "Truant causes the Pokemon to loaf around every other turn"
    const slaking = createMockPokemon({
      types: [T.normal],
      ability: A.truant,
      nickname: "Slaking",
    });
    const opponent = createMockPokemon({ types: [T.normal] });
    const state = createMinimalBattleState(slaking, opponent);
    const rng = createMockRng();

    const makeContext = (trigger: "on-before-move" | "on-turn-end"): AbilityContext => ({
      pokemon: slaking,
      opponent,
      state,
      rng,
      trigger,
    });

    // Turn 1: acts (no volatile)
    const r1 = applyGen3Ability("on-before-move", makeContext("on-before-move"));
    expect(r1.activated).toBe(false);
    expect(r1.movePrevented).toBeUndefined();
    // End of turn 1: toggle sets volatile
    applyGen3Ability("on-turn-end", makeContext("on-turn-end"));
    expect(slaking.volatileStatuses.has(TRUANT_TURN)).toBe(true);

    // Turn 2: loafs (volatile present)
    const r2 = applyGen3Ability("on-before-move", makeContext("on-before-move"));
    expect(r2.activated).toBe(true);
    expect(r2.movePrevented).toBe(true);
    // End of turn 2: toggle removes volatile
    applyGen3Ability("on-turn-end", makeContext("on-turn-end"));
    expect(slaking.volatileStatuses.has(TRUANT_TURN)).toBe(false);

    // Turn 3: acts again (volatile was removed)
    const r3 = applyGen3Ability("on-before-move", makeContext("on-before-move"));
    expect(r3.activated).toBe(false);
    expect(r3.movePrevented).toBeUndefined();
  });

  it("given a non-Truant Pokemon, when on-before-move fires, then move proceeds normally", () => {
    // Non-Truant abilities should not block moves
    const normal = createMockPokemon({ types: [T.normal], ability: A.keenEye });
    const opponent = createMockPokemon({ types: [T.normal] });
    const state = createMinimalBattleState(normal, opponent);
    const rng = createMockRng();

    const context: AbilityContext = {
      pokemon: normal,
      opponent,
      state,
      rng,
      trigger: "on-before-move",
    };

    const result = applyGen3Ability("on-before-move", context);
    expect(result.activated).toBe(false);
    expect(result.movePrevented).toBeUndefined();
  });
});

// ===========================================================================
// Color Change -- changes type to move's type on being hit
// ===========================================================================

describe("Gen 3 Color Change ability (on-damage-taken)", () => {
  // Source: pret/pokeemerald src/battle_util.c — ABILITY_COLOR_CHANGE
  // Source: Bulbapedia — "Color Change changes the user's type to that of the move that hits it"

  it("given a Pokemon with Color Change hit by a Fire move, when on-damage-taken fires, then type changes to Fire", () => {
    // Source: pret/pokeemerald — Color Change sets holder's type to the incoming move's type
    const kecleon = createMockPokemon({
      types: [T.normal],
      ability: A.colorChange,
      nickname: "Kecleon",
    });
    const opponent = createMockPokemon({ types: [T.fire] });
    const state = createMinimalBattleState(kecleon, opponent);
    const rng = createMockRng();
    const fireMove = FLAMETHROWER;

    const context: AbilityContext = {
      pokemon: kecleon,
      opponent,
      state,
      rng,
      trigger: "on-damage-taken",
      move: fireMove,
      damage: 50,
    };

    const result = applyGen3Ability("on-damage-taken", context);
    expect(result.activated).toBe(true);
    expect(result.effects).toHaveLength(1);
    expect(result.effects[0]).toEqual({
      effectType: "type-change",
      target: "self",
      types: [T.fire],
    });
    expect(result.messages).toEqual([`Kecleon's Color Change made it the fire type!`]);
  });

  it("given a Pokemon with Color Change hit by an Electric move, when on-damage-taken fires, then type changes to Electric", () => {
    // Second triangulation case: different move type
    // Source: pret/pokeemerald — Color Change activates for any damaging move type
    const kecleon = createMockPokemon({
      types: [T.normal],
      ability: A.colorChange,
      nickname: "Kecleon",
    });
    const opponent = createMockPokemon({ types: [T.electric] });
    const state = createMinimalBattleState(kecleon, opponent);
    const rng = createMockRng();
    const electricMove = THUNDERBOLT;

    const context: AbilityContext = {
      pokemon: kecleon,
      opponent,
      state,
      rng,
      trigger: "on-damage-taken",
      move: electricMove,
      damage: 60,
    };

    const result = applyGen3Ability("on-damage-taken", context);
    expect(result.activated).toBe(true);
    expect(result.effects[0]).toEqual({
      effectType: "type-change",
      target: "self",
      types: [T.electric],
    });
  });

  it("given a mono-Fire Kecleon hit by a Fire move, when on-damage-taken fires, then no type change", () => {
    // Source: pret/pokeemerald — Color Change does not activate if already that mono-type
    // Source: Bulbapedia — "Color Change does not activate if the Pokemon is already the type"
    const kecleon = createMockPokemon({
      types: [T.fire],
      ability: A.colorChange,
      nickname: "Kecleon",
    });
    const opponent = createMockPokemon({ types: [T.fire] });
    const state = createMinimalBattleState(kecleon, opponent);
    const rng = createMockRng();
    const fireMove = FLAMETHROWER;

    const context: AbilityContext = {
      pokemon: kecleon,
      opponent,
      state,
      rng,
      trigger: "on-damage-taken",
      move: fireMove,
      damage: 50,
    };

    const result = applyGen3Ability("on-damage-taken", context);
    expect(result.activated).toBe(false);
    expect(result.effects).toHaveLength(0);
  });

  it("given a dual-typed (Fire/Flying) Pokemon with Color Change hit by a Fire move, when on-damage-taken fires, then Color Change does NOT activate", () => {
    // pokeemerald IS_BATTLER_OF_TYPE checks both type slots — if EITHER matches, no activation.
    // Source: pret/pokeemerald src/battle_util.c line 2757 —
    //   gBattleMons[battler].types[0] == type || gBattleMons[battler].types[1] == type
    const kecleon = createMockPokemon({
      types: [T.fire, T.flying],
      ability: A.colorChange,
      nickname: "Kecleon",
    });
    const opponent = createMockPokemon({ types: [T.fire] });
    const state = createMinimalBattleState(kecleon, opponent);
    const rng = createMockRng();
    const fireMove = FLAMETHROWER;

    const context: AbilityContext = {
      pokemon: kecleon,
      opponent,
      state,
      rng,
      trigger: "on-damage-taken",
      move: fireMove,
      damage: 50,
    };

    const result = applyGen3Ability("on-damage-taken", context);
    // Fire type is already in slot 0 — Color Change does NOT activate
    expect(result.activated).toBe(false);
    expect(result.effects).toHaveLength(0);
  });

  it("given a non-Color-Change Pokemon, when on-damage-taken fires, then no type change", () => {
    // Other abilities should not trigger type changes
    const normal = createMockPokemon({ types: [T.normal], ability: A.sturdy });
    const opponent = createMockPokemon({ types: [T.fire] });
    const state = createMinimalBattleState(normal, opponent);
    const rng = createMockRng();
    const fireMove = FLAMETHROWER;

    const context: AbilityContext = {
      pokemon: normal,
      opponent,
      state,
      rng,
      trigger: "on-damage-taken",
      move: fireMove,
      damage: 50,
    };

    const result = applyGen3Ability("on-damage-taken", context);
    expect(result.activated).toBe(false);
  });

  it("given Color Change with no move in context, when on-damage-taken fires, then no activation", () => {
    // Edge case: no move information present
    const kecleon = createMockPokemon({
      types: [T.normal],
      ability: A.colorChange,
    });
    const opponent = createMockPokemon({ types: [T.fire] });
    const state = createMinimalBattleState(kecleon, opponent);
    const rng = createMockRng();

    const context: AbilityContext = {
      pokemon: kecleon,
      opponent,
      state,
      rng,
      trigger: "on-damage-taken",
      // No move
    };

    const result = applyGen3Ability("on-damage-taken", context);
    expect(result.activated).toBe(false);
  });
});

// ===========================================================================
// Synchronize -- mirrors burn/paralysis/poison to opponent
// ===========================================================================

describe("Gen 3 Synchronize ability (on-status-inflicted)", () => {
  // Source: pret/pokeemerald src/battle_util.c — ABILITY_SYNCHRONIZE
  // Source: Bulbapedia — "Synchronize passes burn, paralysis, and poison to the opponent"

  it("given a Pokemon with Synchronize that received paralysis, when on-status-inflicted fires, then opponent gets paralysis", () => {
    // Source: pret/pokeemerald — Synchronize mirrors paralysis to foe
    const syncer = createMockPokemon({
      types: [T.psychic],
      ability: A.synchronize,
      status: S.paralysis,
      nickname: "Alakazam",
    });
    const opponent = createMockPokemon({
      types: [T.normal],
      ability: A.none,
      status: null,
      nickname: "Tauros",
    });
    const state = createMinimalBattleState(syncer, opponent);
    const rng = createMockRng();

    const context: AbilityContext = {
      pokemon: syncer,
      opponent,
      state,
      rng,
      trigger: "on-status-inflicted",
    };

    const result = applyGen3Ability("on-status-inflicted", context);
    expect(result.activated).toBe(true);
    expect(result.effects).toHaveLength(1);
    expect(result.effects[0]).toEqual({
      effectType: "status-inflict",
      target: "opponent",
      status: S.paralysis,
    });
    expect(result.messages).toEqual([`Alakazam's Synchronize shared its paralysis with Tauros!`]);
  });

  it("given a Pokemon with Synchronize that received burn, when on-status-inflicted fires, then opponent gets burn", () => {
    // Source: pret/pokeemerald — Synchronize mirrors burn
    const syncer = createMockPokemon({
      types: [T.psychic],
      ability: A.synchronize,
      status: S.burn,
      nickname: "Espeon",
    });
    const opponent = createMockPokemon({
      types: [T.normal],
      ability: A.none,
      status: null,
      nickname: "Snorlax",
    });
    const state = createMinimalBattleState(syncer, opponent);
    const rng = createMockRng();

    const context: AbilityContext = {
      pokemon: syncer,
      opponent,
      state,
      rng,
      trigger: "on-status-inflicted",
    };

    const result = applyGen3Ability("on-status-inflicted", context);
    expect(result.activated).toBe(true);
    expect(result.effects[0]).toEqual({
      effectType: "status-inflict",
      target: "opponent",
      status: S.burn,
    });
  });

  it("given a Pokemon with Synchronize that received poison, when on-status-inflicted fires, then opponent gets poison", () => {
    // Source: pret/pokeemerald — Synchronize mirrors poison
    const syncer = createMockPokemon({
      types: [T.psychic],
      ability: A.synchronize,
      status: S.poison,
      nickname: "Gardevoir",
    });
    const opponent = createMockPokemon({
      types: [T.normal],
      ability: A.none,
      status: null,
      nickname: "Slaking",
    });
    const state = createMinimalBattleState(syncer, opponent);
    const rng = createMockRng();

    const context: AbilityContext = {
      pokemon: syncer,
      opponent,
      state,
      rng,
      trigger: "on-status-inflicted",
    };

    const result = applyGen3Ability("on-status-inflicted", context);
    expect(result.activated).toBe(true);
    expect(result.effects[0]).toEqual({
      effectType: "status-inflict",
      target: "opponent",
      status: S.poison,
    });
  });

  it("given a Pokemon with Synchronize that received badly-poisoned, when on-status-inflicted fires, then opponent gets regular poison (Gen 3 downgrade)", () => {
    // In Gen 3, Synchronize downgrades badly-poisoned to regular poison before mirroring.
    // Source: pret/pokeemerald src/battle_util.c lines 2976-2977, 2992-2993 —
    //   if (synchronizeMoveEffect == MOVE_EFFECT_TOXIC) synchronizeMoveEffect = MOVE_EFFECT_POISON
    const syncer = createMockPokemon({
      types: [T.psychic],
      ability: A.synchronize,
      status: S.badlyPoisoned,
      nickname: "Alakazam",
    });
    const opponent = createMockPokemon({
      types: [T.normal],
      ability: A.none,
      status: null,
      nickname: "Tauros",
    });
    const state = createMinimalBattleState(syncer, opponent);
    const rng = createMockRng();

    const context: AbilityContext = {
      pokemon: syncer,
      opponent,
      state,
      rng,
      trigger: "on-status-inflicted",
    };

    const result = applyGen3Ability("on-status-inflicted", context);
    expect(result.activated).toBe(true);
    // Opponent receives regular poison, NOT badly-poisoned — Gen 3 downgrade
    expect(result.effects[0]).toEqual({
      effectType: "status-inflict",
      target: "opponent",
      status: S.poison,
    });
  });

  it("given a Pokemon with Synchronize that received sleep, when on-status-inflicted fires, then does NOT mirror sleep", () => {
    // Source: pret/pokeemerald — Synchronize does NOT work with sleep
    // Source: Bulbapedia — "Synchronize does not activate for Sleep or Freeze"
    const syncer = createMockPokemon({
      types: [T.psychic],
      ability: A.synchronize,
      status: S.sleep,
      nickname: "Alakazam",
    });
    const opponent = createMockPokemon({
      types: [T.normal],
      ability: A.none,
      status: null,
    });
    const state = createMinimalBattleState(syncer, opponent);
    const rng = createMockRng();

    const context: AbilityContext = {
      pokemon: syncer,
      opponent,
      state,
      rng,
      trigger: "on-status-inflicted",
    };

    const result = applyGen3Ability("on-status-inflicted", context);
    expect(result.activated).toBe(false);
    expect(result.effects).toHaveLength(0);
  });

  it("given a Pokemon with Synchronize that received freeze, when on-status-inflicted fires, then does NOT mirror freeze", () => {
    // Source: pret/pokeemerald — Synchronize does NOT work with freeze
    // Source: Bulbapedia — "Synchronize does not activate for Sleep or Freeze"
    const syncer = createMockPokemon({
      types: [T.psychic],
      ability: A.synchronize,
      status: S.freeze,
      nickname: "Alakazam",
    });
    const opponent = createMockPokemon({
      types: [T.normal],
      ability: A.none,
      status: null,
    });
    const state = createMinimalBattleState(syncer, opponent);
    const rng = createMockRng();

    const context: AbilityContext = {
      pokemon: syncer,
      opponent,
      state,
      rng,
      trigger: "on-status-inflicted",
    };

    const result = applyGen3Ability("on-status-inflicted", context);
    expect(result.activated).toBe(false);
    expect(result.effects).toHaveLength(0);
  });

  it("given a Pokemon with Synchronize and paralyzed opponent, when on-status-inflicted fires, then does NOT trigger (opponent already has status)", () => {
    // Source: pret/pokeemerald — cannot synchronize if opponent already has a primary status
    const syncer = createMockPokemon({
      types: [T.psychic],
      ability: A.synchronize,
      status: S.paralysis,
      nickname: "Alakazam",
    });
    const opponent = createMockPokemon({
      types: [T.normal],
      ability: A.none,
      status: S.paralysis, // Already has status
    });
    const state = createMinimalBattleState(syncer, opponent);
    const rng = createMockRng();

    const context: AbilityContext = {
      pokemon: syncer,
      opponent,
      state,
      rng,
      trigger: "on-status-inflicted",
    };

    const result = applyGen3Ability("on-status-inflicted", context);
    expect(result.activated).toBe(false);
    expect(result.effects).toHaveLength(0);
  });

  it("given a Pokemon with Synchronize but no status, when on-status-inflicted fires, then does not activate", () => {
    // Edge case: trigger fires but the pokemon has no status (shouldn't normally happen)
    const syncer = createMockPokemon({
      types: [T.psychic],
      ability: A.synchronize,
      status: null,
    });
    const opponent = createMockPokemon({
      types: [T.normal],
      ability: A.none,
      status: null,
    });
    const state = createMinimalBattleState(syncer, opponent);
    const rng = createMockRng();

    const context: AbilityContext = {
      pokemon: syncer,
      opponent,
      state,
      rng,
      trigger: "on-status-inflicted",
    };

    const result = applyGen3Ability("on-status-inflicted", context);
    expect(result.activated).toBe(false);
  });

  it("given a non-Synchronize Pokemon that received paralysis, when on-status-inflicted fires, then does not activate", () => {
    // Other abilities should not trigger synchronize logic
    const normal = createMockPokemon({
      types: [T.psychic],
      ability: A.innerFocus,
      status: S.paralysis,
    });
    const opponent = createMockPokemon({
      types: [T.normal],
      ability: A.none,
      status: null,
    });
    const state = createMinimalBattleState(normal, opponent);
    const rng = createMockRng();

    const context: AbilityContext = {
      pokemon: normal,
      opponent,
      state,
      rng,
      trigger: "on-status-inflicted",
    };

    const result = applyGen3Ability("on-status-inflicted", context);
    expect(result.activated).toBe(false);
  });
});
