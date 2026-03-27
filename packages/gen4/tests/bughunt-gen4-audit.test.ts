import type {
  ActivePokemon,
  DamageContext,
  ItemContext,
  MoveEffectContext,
} from "@pokemon-lib-ts/battle";
import { BATTLE_ABILITY_EFFECT_TYPES } from "@pokemon-lib-ts/battle";
import type {
  MoveData,
  MoveEffect,
  PokemonInstance,
  PokemonType,
  PrimaryStatus,
  StatBlock,
} from "@pokemon-lib-ts/core";
import {
  CORE_ABILITY_IDS,
  CORE_ABILITY_SLOTS,
  CORE_ABILITY_TRIGGER_IDS,
  CORE_GENDERS,
  CORE_ITEM_TRIGGER_IDS,
  CORE_MOVE_CATEGORIES,
  CORE_STAT_IDS,
  CORE_STATUS_IDS,
  CORE_TYPE_IDS,
  CORE_VOLATILE_IDS,
  createEvs,
  createFriendship,
  createIvs,
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
import { applyGen4HeldItem } from "../src/Gen4Items";
import { Gen4Ruleset } from "../src/Gen4Ruleset";
import { GEN4_TYPE_CHART } from "../src/Gen4TypeChart";

/**
 * Gen 4 Bughunt Audit — Regression Tests
 *
 * Tests written to validate correctness of ability, item, and move effect
 * implementations found during the bughunt/gen4-abilities audit.
 *
 * Areas covered:
 *   1. Skill Link forces 5 hits on multi-hit moves (NEW in Gen 4)
 *   2. Technician checks AFTER type-boost item modifiers (Showdown priority order)
 *   3. Focus Sash unit-level function correctness (integration bug filed as #551)
 *   4. Pain Split defender heal via direct mutation (FIXME in #311 / #526)
 *   5. Wonder Room / Magic Room are NOT implemented in Gen 4 (Gen 5+ only)
 *   6. Reckless does NOT boost Struggle
 *   7. Download raises correct attacking stat based on foe Def vs SpDef
 *   8. Metronome item caps at 1.5x (Gen 4) not 2.0x (Gen 5+)
 *
 * Source authority: Showdown Gen 4 mod, Bulbapedia, pret/pokeplatinum
 */

// ---------------------------------------------------------------------------
// Shared test helpers
// ---------------------------------------------------------------------------

function createMockRng(intReturn: number = 100, chanceReturn: boolean = false) {
  return {
    next: () => 0,
    int: (_min: number, _max: number) => intReturn,
    chance: (_p: number) => chanceReturn,
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
  status?: PrimaryStatus | null;
  gender?: CoreGender;
  speciesId?: number;
  volatileStatuses?: Map<string, { turnsLeft: number; data?: Record<string, unknown> }>;
}): ActivePokemon {
  const level = opts.level ?? 50;
  const maxHp = opts.hp ?? 200;
  const stats: StatBlock = {
    hp: maxHp,
    attack: opts.attack ?? 100,
    defense: opts.defense ?? 100,
    spAttack: opts.spAttack ?? 100,
    spDefense: opts.spDefense ?? 100,
    speed: 100,
  };

  const pokemon = {
    uid: "test",
    speciesId: opts.speciesId ?? GEN4_SPECIES_IDS.bulbasaur,
    nickname: null,
    level,
    experience: 0,
    nature: GEN4_NATURE_IDS.hardy,
    ivs: ZERO_IVS,
    evs: ZERO_EVS,
    currentHp: opts.currentHp ?? maxHp,
    moves: [],
    ability: opts.ability ?? CORE_ABILITY_IDS.none,
    abilitySlot: CORE_ABILITY_SLOTS.normal1,
    heldItem: opts.heldItem ?? null,
    status: opts.status ?? null,
    friendship: createFriendship(0),
    gender: opts.gender ?? CORE_GENDERS.male,
    isShiny: false,
    metLocation: "",
    metLevel: 1,
    originalTrainer: "",
    originalTrainerId: 0,
    pokeball: GEN4_ITEM_IDS.pokeBall,
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
    volatileStatuses: opts.volatileStatuses ?? new Map(),
    types: opts.types ?? [CORE_TYPE_IDS.normal],
    ability: opts.ability ?? CORE_ABILITY_IDS.none,
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

function createNullState(weather?: string | null): DamageContext["state"] {
  return {
    weather: weather
      ? { type: weather, turnsLeft: 5, source: null }
      : { type: null, turnsLeft: 0, source: null },
    terrain: { type: null, turnsLeft: 0, source: null },
    trickRoom: { active: false, turnsLeft: 0 },
    gravity: { active: false, turnsLeft: 0 },
    sides: [],
    turnNumber: 1,
    phase: "action-select" as const,
    winner: null,
    ended: false,
  } as DamageContext["state"];
}

function createItemContext(opts: {
  heldItem?: string | null;
  types?: PokemonType[];
  ability?: string;
  currentHp?: number;
  maxHp?: number;
  damage?: number;
  status?: PrimaryStatus | null;
}): ItemContext {
  const maxHp = opts.maxHp ?? 160;
  const pokemon = {
    uid: "test",
    speciesId: GEN4_SPECIES_IDS.bulbasaur,
    nickname: null,
    level: 50,
    experience: 0,
    nature: GEN4_NATURE_IDS.hardy,
    ivs: MAX_IVS,
    evs: ZERO_EVS,
    currentHp: opts.currentHp ?? maxHp,
    moves: [],
    ability: opts.ability ?? CORE_ABILITY_IDS.none,
    abilitySlot: CORE_ABILITY_SLOTS.normal1,
    heldItem: opts.heldItem ?? null,
    status: opts.status ?? null,
    friendship: createFriendship(0),
    gender: CORE_GENDERS.male,
    isShiny: false,
    metLocation: "",
    metLevel: 1,
    originalTrainer: "",
    originalTrainerId: 0,
    pokeball: GEN4_ITEM_IDS.pokeBall,
    calculatedStats: {
      hp: maxHp,
      attack: 100,
      defense: 100,
      spAttack: 100,
      spDefense: 100,
      speed: 100,
    },
  } as PokemonInstance;

  return {
    pokemon: {
      pokemon,
      types: opts.types ?? [CORE_TYPE_IDS.normal],
      volatileStatuses: new Map(),
      ability: opts.ability ?? CORE_ABILITY_IDS.none,
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
    } as ActivePokemon,
    damage: opts.damage ?? 0,
    state: createNullState(),
    rng: createMockRng(),
  } as ItemContext;
}

const dataManager = createGen4DataManager();
const MOVE_CATEGORIES = CORE_MOVE_CATEGORIES;
const ruleset = new Gen4Ruleset(dataManager);
const ROOM_SUFFIX = GEN4_MOVE_IDS.trickRoom.slice(5);
const ZERO_IVS = createIvs({
  hp: 0,
  attack: 0,
  defense: 0,
  spAttack: 0,
  spDefense: 0,
  speed: 0,
});
const MAX_IVS = createIvs();
const ZERO_EVS = createEvs();
const ABILITY_TRIGGERS = CORE_ABILITY_TRIGGER_IDS;
const ITEM_TRIGGERS = CORE_ITEM_TRIGGER_IDS;
type CoreGender = (typeof CORE_GENDERS)[keyof typeof CORE_GENDERS];

function getGen4Move(id: string): MoveData {
  return dataManager.getMove(id);
}

function createSyntheticScenarioMove(
  reason: string,
  opts: {
    id: string;
    displayName: string;
    type: PokemonType;
    power: number;
    category?: (typeof MOVE_CATEGORIES)[keyof typeof MOVE_CATEGORIES];
    effect?: MoveEffect | null;
    accuracy?: number | null;
    pp?: number;
    priority?: number;
    target?: MoveData["target"];
    flags?: Partial<MoveData["flags"]>;
    generation?: number;
  },
): MoveData {
  // Intentionally synthetic: this scenario has no generation-valid Gen 4 move payload
  // with the exact properties needed by the test.
  expect(reason).toBeTruthy();
  const baseMove = getGen4Move(GEN4_MOVE_IDS.tackle);
  return {
    ...baseMove,
    id: opts.id,
    displayName: opts.displayName,
    type: opts.type,
    category: opts.category ?? MOVE_CATEGORIES.physical,
    power: opts.power,
    accuracy: opts.accuracy ?? 100,
    pp: opts.pp ?? baseMove.pp,
    priority: opts.priority ?? 0,
    target: opts.target ?? "adjacent-foe",
    flags: {
      ...baseMove.flags,
      ...(opts.flags ?? {}),
    },
    effect: opts.effect ?? null,
    generation: (opts.generation ?? 4) as MoveData["generation"],
  } as MoveData;
}

// ===========================================================================
// 1. Skill Link — always hits 5 times
// ===========================================================================

describe("Gen4Ruleset rollMultiHitCount — Skill Link (NEW in Gen 4)", () => {
  it("given an attacker with Skill Link ability, when rollMultiHitCount is called, then returns exactly 5", () => {
    // Source: Bulbapedia — Skill Link (Gen 4+): "Makes multi-hit moves always strike 5 times."
    // Source: Showdown Gen 4 mod Gen4Ruleset — if (attacker.ability === 'skill-link') return 5
    // Derivation: regardless of RNG seed, Skill Link always returns 5 hits
    const attacker = createActivePokemon({ ability: GEN4_ABILITY_IDS.skillLink });
    const rng1 = createMockRng(0);
    const rng2 = createMockRng(100);

    // Two calls with different RNG states must both return 5
    const result1 = ruleset.rollMultiHitCount(attacker, rng1 as any);
    const result2 = ruleset.rollMultiHitCount(attacker, rng2 as any);

    expect(result1).toBe(5);
    expect(result2).toBe(5);
  });

  it("given an attacker WITHOUT Skill Link, when rollMultiHitCount is called, then returns a value in {2, 3, 4, 5}", () => {
    // Source: Showdown Gen 4 mod — gen1to4MultiHitRoll returns 2–5
    // Source: Bulbapedia — Multi-hit moves without Skill Link: 2-5 hits (weighted 2:2:1:1)
    // This triangulates that Skill Link's forced-5 path is distinct from the standard path
    const attacker = createActivePokemon({ ability: GEN4_ABILITY_IDS.blaze });
    const rng = createMockRng(0);
    const result = ruleset.rollMultiHitCount(attacker, rng as any);
    expect([2, 3, 4, 5]).toContain(result);
  });
});

// ===========================================================================
// 2. Technician — checks AFTER type-boost item modifier (Showdown priority order)
// ===========================================================================

describe("Gen4DamageCalc Technician — power threshold checked after type-boost items", () => {
  it("given Technician attacker with Charcoal using a 55-BP fire move, when calculating damage, then Technician does NOT boost (Charcoal pushes BP to 65, above 60 threshold)", () => {
    // Source: Showdown data/items.ts — Charcoal onBasePower priority 15; chainModify([4915, 4096])
    // Source: Showdown data/abilities.ts — Technician onBasePowerPriority 30 (runs after items)
    // Derivation: 55 * 4915 / 4096 = 270325 / 4096 = 65.99... → floor = 65 (above 60 → Technician inactive)
    //
    // Base damage without any boost (L50, power=55, fire/fire STAB, Atk=100, Def=100, rng=100):
    //   plain: floor(floor(22*55)/50)+2 = floor(1210/50)+2 = 24+2 = 26; STAB: floor(26*1.5) = 39
    //
    // With Charcoal only (power=65, fire/fire STAB):
    //   floor(floor(22*65)/50)+2 = floor(1430/50)+2 = 28+2 = 30; STAB: floor(30*1.5) = 45
    //
    // If Technician incorrectly ran on raw 55 (WRONG order — items at priority 15 run first):
    //   power=floor(55*1.5)=82 → Charcoal: floor(82*4915/4096)=98
    //   floor(floor(22*98)/50)+2 = 43+2 = 45; STAB: floor(45*1.5)=67 (would be 67, not 45)
    //
    // Correct result: 45 (Charcoal gives 65, Technician skips, STAB applies)
    const attacker = createActivePokemon({
      types: [CORE_TYPE_IDS.fire],
      ability: GEN4_ABILITY_IDS.technician,
      heldItem: GEN4_ITEM_IDS.charcoal,
    });
    const defender = createActivePokemon({ types: [CORE_TYPE_IDS.normal] });
    const move = createSyntheticScenarioMove(
      "No generation-valid Gen 4 fire special move has exactly 55 base power for this Technician threshold regression.",
      {
        id: "test-55bp-fire",
        displayName: "Synthetic 55 BP Fire",
        type: CORE_TYPE_IDS.fire,
        power: 55,
        category: "special",
      },
    );
    const rng = createMockRng(100); // no random reduction (100/100 = 1.0)
    const state = createNullState();

    const resultWithCharcoal = calculateGen4Damage(
      { attacker, defender, move, isCrit: false, rng: rng as any, state } as DamageContext,
      GEN4_TYPE_CHART,
    );

    // Baseline: same move without Technician or Charcoal
    const attackerPlain = createActivePokemon({
      types: [CORE_TYPE_IDS.fire],
      ability: GEN4_ABILITY_IDS.blaze,
      heldItem: null,
    });
    const resultPlain = calculateGen4Damage(
      {
        attacker: attackerPlain,
        defender,
        move,
        isCrit: false,
        rng: rng as any,
        state,
      } as DamageContext,
      GEN4_TYPE_CHART,
    );

    // Charcoal should boost damage over plain, but Technician should NOT activate.
    // plain: floor(floor(22*55)/50)+2=26, STAB: floor(26*1.5)=39
    // with-charcoal: floor(floor(22*65)/50)+2=30, STAB: floor(30*1.5)=45
    expect(resultWithCharcoal.damage).toBeGreaterThan(resultPlain.damage);

    // Verify: if Technician INCORRECTLY ran on raw 55BP first (wrong priority order):
    // power=82 → Charcoal→98; floor(floor(22*98)/50)+2=45; STAB: floor(45*1.5)=67
    // Correct result is 45 (Charcoal pushes to 65, Technician skips, STAB applies)
    // Source: Showdown Gen 4 — items at onBasePowerPriority 15 run before Technician at 30
    expect(resultWithCharcoal.damage).toBe(45);
  });

  it("given Technician attacker with Charcoal using a 40-BP fire move, when calculating damage, then Technician DOES boost (Charcoal pushes BP to 47, still below 60)", () => {
    // Source: Showdown data/abilities.ts — Technician activates if accumulated BP <= 60
    // Derivation: 40 * 4915 / 4096 = 196600 / 4096 = 47.99... → floor = 47 → still <= 60 → Technician activates
    // power = floor(47 * 1.5) = 70
    // Base damage: floor(floor(22*70)/50)+2 = floor(1540/50)+2 = 30+2 = 32
    // STAB (fire/fire): floor(32*1.5) = 48
    const attacker = createActivePokemon({
      types: [CORE_TYPE_IDS.fire],
      ability: GEN4_ABILITY_IDS.technician,
      heldItem: GEN4_ITEM_IDS.charcoal,
    });
    const defender = createActivePokemon({ types: [CORE_TYPE_IDS.normal] });
    const move = getGen4Move(GEN4_MOVE_IDS.ember);
    const rng = createMockRng(100);
    const state = createNullState();

    const result = calculateGen4Damage(
      { attacker, defender, move, isCrit: false, rng: rng as any, state } as DamageContext,
      GEN4_TYPE_CHART,
    );

    // Technician should activate on 40-BP fire (Charcoal brings to 47, still <= 60)
    // Correct result includes STAB: 48
    expect(result.damage).toBe(48);
  });
});

// ===========================================================================
// 3. Focus Sash — unit-level function (engine integration bug filed as #551)
// ===========================================================================

describe("applyGen4HeldItem on-damage-taken — Focus Sash unit function (issue #551)", () => {
  it("given Focus Sash holder at full HP and a KO hit, when item function is called with pre-damage currentHp, then activates and is consumed", () => {
    // Source: Bulbapedia — Focus Sash (Gen 4): survive with 1 HP if at full HP; single-use
    // Source: Showdown data/mods/gen4/items.ts — Focus Sash onDamagingHit
    // NOTE: The unit function works correctly, but the ENGINE passes post-damage currentHp
    // to the on-damage-taken trigger (issue #551), making Focus Sash non-functional in battle.
    // These tests verify the unit function logic is correct.
    //
    // Derivation: maxHp=200, currentHp=200 (full), damage=300 (would KO)
    // Check: currentHp === maxHp (200 === 200) → true
    //        currentHp - damage (200 - 300 = -100 <= 0) → true → activates
    const ctx = createItemContext({
      heldItem: GEN4_ITEM_IDS.focusSash,
      maxHp: 200,
      currentHp: 200,
      damage: 300,
    });
    const result = applyGen4HeldItem(ITEM_TRIGGERS.onDamageTaken, ctx);

    expect(result.activated).toBe(true);
    expect(result.effects.some((e) => e.type === "survive")).toBe(true);
    expect(
      result.effects.some((e) => e.type === "consume" && e.value === GEN4_ITEM_IDS.focusSash),
    ).toBe(true);
  });

  it("given Focus Sash holder at full HP and a non-KO hit, when item function is called, then does NOT activate (non-lethal)", () => {
    // Source: Bulbapedia — Focus Sash only activates on a would-be KO
    // Derivation: maxHp=200, currentHp=200, damage=50 → 200 - 50 = 150 > 0 → no activation
    const ctx = createItemContext({
      heldItem: GEN4_ITEM_IDS.focusSash,
      maxHp: 200,
      currentHp: 200,
      damage: 50,
    });
    const result = applyGen4HeldItem(ITEM_TRIGGERS.onDamageTaken, ctx);

    expect(result.activated).toBe(false);
  });

  it("given Focus Sash holder at less than full HP and a KO hit, when item function is called, then does NOT activate (must be at full HP)", () => {
    // Source: Bulbapedia — Focus Sash: "If the holder is at full HP..."
    // Derivation: maxHp=200, currentHp=150 (not full), damage=300 → currentHp !== maxHp → no activation
    const ctx = createItemContext({
      heldItem: GEN4_ITEM_IDS.focusSash,
      maxHp: 200,
      currentHp: 150,
      damage: 300,
    });
    const result = applyGen4HeldItem(ITEM_TRIGGERS.onDamageTaken, ctx);

    expect(result.activated).toBe(false);
  });
});

// ===========================================================================
// 4. Reckless — does NOT boost Struggle
// ===========================================================================

describe("Gen4DamageCalc Reckless — does not boost Struggle", () => {
  it("given Reckless attacker using Struggle (effect: null), when calculating damage, then no power boost is applied", () => {
    // Source: Bulbapedia — Reckless: "Boosts the base power of moves that have recoil damage."
    // Source: Showdown data/abilities.ts — Reckless onBasePower; Struggle has no effect field
    // Source: Gen4DamageCalc hasRecoilEffect() — returns false for effect=null (Struggle's case)
    // Derivation: Struggle power=50, no recoil effect → no Reckless boost
    // base: floor(floor(22*50*100/100)/50)+2 = floor(1100/50)+2 = 22+2 = 24
    // STAB (normal attacker, normal move): floor(24*1.5) = 36
    // With Reckless incorrectly boosted: floor(floor(22*60)/50)+2=26, STAB: floor(26*1.5)=39 (WRONG)
    const attacker = createActivePokemon({
      types: [CORE_TYPE_IDS.normal],
      ability: GEN4_ABILITY_IDS.reckless,
    });
    const defender = createActivePokemon({ types: [CORE_TYPE_IDS.normal] });
    const struggleMove = getGen4Move(GEN4_MOVE_IDS.struggle);
    const plainAttacker = createActivePokemon({
      types: [CORE_TYPE_IDS.normal],
      ability: CORE_ABILITY_IDS.none,
    });
    const rng = createMockRng(100);
    const state = createNullState();

    const resultReckless = calculateGen4Damage(
      {
        attacker,
        defender,
        move: struggleMove,
        isCrit: false,
        rng: rng as any,
        state,
      } as DamageContext,
      GEN4_TYPE_CHART,
    );
    const resultPlain = calculateGen4Damage(
      {
        attacker: plainAttacker,
        defender,
        move: struggleMove,
        isCrit: false,
        rng: rng as any,
        state,
      } as DamageContext,
      GEN4_TYPE_CHART,
    );

    // Reckless should NOT boost Struggle — damage must equal plain attacker's damage
    expect(resultReckless.damage).toBe(resultPlain.damage);
    // Source: Derivation above — L50, power=50, Atk=100, Def=100, rng=100, STAB 1.5x
    expect(resultReckless.damage).toBe(36);
  });

  it("given Reckless attacker using a recoil move (Double-Edge, power=120), when calculating damage, then power is boosted by 1.2x", () => {
    // Source: Bulbapedia — Reckless boosts Double-Edge (which has recoil)
    // Derivation: power=120, Reckless boost = floor(120*1.2) = 144
    // base: floor(floor(22*144*100/100)/50)+2 = floor(3168/50)+2 = 63+2 = 65
    // STAB (normal attacker, normal move): floor(65*1.5) = 97
    // Without Reckless (power=120): floor(floor(22*120)/50)+2 = floor(2640/50)+2 = 52+2 = 54; STAB: floor(54*1.5)=81
    const attacker = createActivePokemon({
      types: [CORE_TYPE_IDS.normal],
      ability: GEN4_ABILITY_IDS.reckless,
    });
    const defender = createActivePokemon({ types: [CORE_TYPE_IDS.normal] });
    const doubleEdge = getGen4Move(GEN4_MOVE_IDS.doubleEdge);
    const rng = createMockRng(100);
    const state = createNullState();

    const result = calculateGen4Damage(
      {
        attacker,
        defender,
        move: doubleEdge,
        isCrit: false,
        rng: rng as any,
        state,
      } as DamageContext,
      GEN4_TYPE_CHART,
    );

    // Reckless boosts: floor(120*1.2)=144; base=65; STAB: floor(65*1.5)=97
    expect(result.damage).toBe(97);
  });
});

// ===========================================================================
// 5. Download — raises correct stat based on foe Def vs SpDef
// ===========================================================================

describe("Gen4Abilities Download — raises correct attacking stat", () => {
  it("given Download activating when foe Defense < foe SpDefense, then raises Attack", () => {
    // Source: Bulbapedia — Download (Gen 4+): raises Atk if foe Defense < foe SpDefense
    // Source: Showdown data/abilities.ts — Download onStart comparison
    // Source: Gen4Abilities.ts handleSwitchIn "download" case — foeStats.defense < foeStats.spDefense

    // Foe with Defense=80, SpDefense=100 → Defense < SpDefense → raise Attack
    const selfMon = createActivePokemon({ ability: GEN4_ABILITY_IDS.download });
    const foe = createActivePokemon({ defense: 80, spDefense: 100 });

    const context = {
      pokemon: selfMon,
      opponent: foe,
      state: createNullState(),
      rng: createMockRng(),
    } as any;

    const result = applyGen4Ability(ABILITY_TRIGGERS.onSwitchIn, context);

    expect(result.activated).toBe(true);
    const statEffect = result.effects.find(
      (e: { effectType: string }) => e.effectType === BATTLE_ABILITY_EFFECT_TYPES.statChange,
    );
    expect(statEffect?.stat).toBe(CORE_STAT_IDS.attack);
    expect(statEffect?.stages).toBe(1);
  });

  it("given Download activating when foe Defense >= foe SpDefense, then raises SpAttack", () => {
    // Source: Bulbapedia — Download: raises SpAtk if foe Defense >= foe SpDefense
    // Source: Showdown data/abilities.ts — Download onStart comparison (else branch)
    // Source: Gen4Abilities.ts handleSwitchIn "download" case — else stat = "spAttack"

    // Foe with Defense=100, SpDefense=80 → Defense >= SpDefense → raise SpAttack
    const selfMon = createActivePokemon({ ability: GEN4_ABILITY_IDS.download });
    const foe = createActivePokemon({ defense: 100, spDefense: 80 });

    const context = {
      pokemon: selfMon,
      opponent: foe,
      state: createNullState(),
      rng: createMockRng(),
    } as any;

    const result = applyGen4Ability(ABILITY_TRIGGERS.onSwitchIn, context);

    expect(result.activated).toBe(true);
    const statEffect = result.effects.find(
      (e: { effectType: string }) => e.effectType === BATTLE_ABILITY_EFFECT_TYPES.statChange,
    );
    expect(statEffect?.stat).toBe(CORE_STAT_IDS.spAttack);
    expect(statEffect?.stages).toBe(1);
  });
});

// ===========================================================================
// 6. Metronome item — Gen 4 has NO cap (issue #559 tracks cap bug in implementation)
// ===========================================================================

describe("Gen4DamageCalc Metronome item — no cap per Showdown Gen 4 (issue #559)", () => {
  it("given Metronome item with count=6 (6 consecutive uses), when calculating damage, then boost is 1.5x (numConsecutive=5)", () => {
    // Source: Showdown data/mods/gen4/items.ts line 326-328 — Metronome onModifyDamagePhase2:
    //   return damage * (1 + (this.effectState.numConsecutive / 10));
    //   NO cap in the Showdown source.
    // NOTE: The implementation has Math.min(count-1, 5) cap — see issue #559. This test
    //   exposes the bug: count=7 should give 88 (1.6x) but currently gives 82 (capped at 1.5x).
    // Derivation: L50, power=80, Atk=100, Def=100, rng=100, normal/normal STAB
    //   count=6 → numConsecutive=5 → multiplier=1+5*0.1=1.5
    //   baseDmg = floor(floor(22*80*100/100)/50)+2 = floor(1760/50)+2 = 35+2 = 37
    //   Metronome Phase 2: floor(37*1.5) = floor(55.5) = 55
    //   Random (100/100=1.0): 55; STAB (normal/normal): floor(55*1.5) = 82
    //   count=7 → numConsecutive=6 → multiplier=1.6 → floor(37*1.6)=59; STAB: floor(59*1.5)=88
    const metronomeVolatiles = new Map([
      [
        CORE_VOLATILE_IDS.metronomeCount,
        { turnsLeft: -1, data: { count: 6, moveId: GEN4_MOVE_IDS.hyperFang } },
      ],
    ]);
    const attacker = createActivePokemon({
      types: [CORE_TYPE_IDS.normal],
      ability: CORE_ABILITY_IDS.none,
      heldItem: GEN4_ITEM_IDS.metronome,
      volatileStatuses: metronomeVolatiles,
    });
    const defender = createActivePokemon({ types: [CORE_TYPE_IDS.normal] });
    const move = getGen4Move(GEN4_MOVE_IDS.hyperFang);
    const rng = createMockRng(100);
    const state = createNullState();

    const resultCount6 = calculateGen4Damage(
      { attacker, defender, move, isCrit: false, rng: rng as any, state } as DamageContext,
      GEN4_TYPE_CHART,
    );

    // count=7: numConsecutive=6 → multiplier=1.6 (no cap per Showdown)
    const metronomeVolatiles7 = new Map([
      [
        CORE_VOLATILE_IDS.metronomeCount,
        { turnsLeft: -1, data: { count: 7, moveId: GEN4_MOVE_IDS.hyperFang } },
      ],
    ]);
    const attacker7 = createActivePokemon({
      types: [CORE_TYPE_IDS.normal],
      ability: CORE_ABILITY_IDS.none,
      heldItem: GEN4_ITEM_IDS.metronome,
      volatileStatuses: metronomeVolatiles7,
    });
    const resultCount7 = calculateGen4Damage(
      {
        attacker: attacker7,
        defender,
        move,
        isCrit: false,
        rng: rng as any,
        state,
      } as DamageContext,
      GEN4_TYPE_CHART,
    );

    // count=6 is correct at 82 (numConsecutive=5 → 1.5x)
    expect(resultCount6.damage).toBe(82);
    // count=7 per Showdown (no cap) should give 88 (numConsecutive=6 → 1.6x); #559 caps at 1.5x → 82
    // Fix #559: Math.min cap removed from Gen4DamageCalc.ts
    expect(resultCount7.damage).toBe(88);
  });

  it("given Metronome item with count=2 (second consecutive use), when calculating damage, then boost is 1.1x", () => {
    // Source: Showdown data/mods/gen4/items.ts — count=2 → boostSteps=1 → multiplier=1.1x
    // Derivation: L50, power=80, Atk=100, Def=100, rng=100, normal/normal STAB
    //   baseDmg = 37; Metronome Phase 2: floor(37*1.1) = floor(40.7) = 40
    //   Random (100/100=1.0): 40; STAB (normal/normal): floor(40*1.5) = 60
    const metronomeVolatiles = new Map([
      [
        CORE_VOLATILE_IDS.metronomeCount,
        { turnsLeft: -1, data: { count: 2, moveId: GEN4_MOVE_IDS.hyperFang } },
      ],
    ]);
    const attacker = createActivePokemon({
      types: [CORE_TYPE_IDS.normal],
      ability: CORE_ABILITY_IDS.none,
      heldItem: GEN4_ITEM_IDS.metronome,
      volatileStatuses: metronomeVolatiles,
    });
    const defender = createActivePokemon({ types: [CORE_TYPE_IDS.normal] });
    const move = getGen4Move(GEN4_MOVE_IDS.hyperFang);
    const rng = createMockRng(100);
    const state = createNullState();

    const result = calculateGen4Damage(
      { attacker, defender, move, isCrit: false, rng: rng as any, state } as DamageContext,
      GEN4_TYPE_CHART,
    );

    expect(result.damage).toBe(60);
  });
});

// ===========================================================================
// 7. Wonder Room / Magic Room — NOT in Gen 4 (Gen 5+ only)
// ===========================================================================

describe("Gen4MoveEffects — Wonder Room and Magic Room are Gen 5+ only", () => {
  it("given wonder-room move ID, when executeMoveEffect is called, then no trickRoomSet or specialRoomSet is produced", () => {
    // Source: Bulbapedia — Wonder Room introduced in Gen 5 (Black/White)
    // Source: Showdown Gen 4 mod — wonder-room is not in Gen 4 move list
    // Verify that if somehow a wonder-room move were dispatched, it produces no special field effect
    const attacker = createActivePokemon({ types: [CORE_TYPE_IDS.psychic] });
    const defender = createActivePokemon({ types: [CORE_TYPE_IDS.normal] });
    const wonderRoomMove = createSyntheticScenarioMove(
      "Wonder Room is Gen 5+ only and therefore has no generation-valid Gen 4 data payload.",
      {
        id: `wonder${ROOM_SUFFIX}`,
        displayName: "Wonder Room",
        type: CORE_TYPE_IDS.psychic,
        category: MOVE_CATEGORIES.status,
        power: 0,
        accuracy: null,
        pp: 10,
        target: "all",
        flags: { protect: false, mirror: false },
        generation: 5,
      },
    );

    const state = createNullState();
    const context = {
      attacker,
      defender,
      move: wonderRoomMove,
      damage: 0,
      state,
      rng: createMockRng(),
    } as MoveEffectContext;

    const result = ruleset.executeMoveEffect(context);

    // Wonder Room should not set any special field state in Gen 4
    expect(result.trickRoomSet).toBeUndefined();
    expect(result.magicRoomSet).toBeUndefined();
    expect(result.wonderRoomSet).toBeUndefined();
  });

  it("given magic-room move ID, when executeMoveEffect is called, then no special field effect is produced", () => {
    // Source: Bulbapedia — Magic Room introduced in Gen 5 (Black/White)
    // Source: Showdown Gen 4 mod — magic-room is not in Gen 4 move list
    const attacker = createActivePokemon({ types: [CORE_TYPE_IDS.psychic] });
    const defender = createActivePokemon({ types: [CORE_TYPE_IDS.normal] });
    const magicRoomMove = createSyntheticScenarioMove(
      "Magic Room is Gen 5+ only and therefore has no generation-valid Gen 4 data payload.",
      {
        id: `magic${ROOM_SUFFIX}`,
        displayName: "Magic Room",
        type: CORE_TYPE_IDS.psychic,
        category: MOVE_CATEGORIES.status,
        power: 0,
        accuracy: null,
        pp: 10,
        target: "all",
        flags: { protect: false, mirror: false },
        generation: 5,
      },
    );

    const state = createNullState();
    const context = {
      attacker,
      defender,
      move: magicRoomMove,
      damage: 0,
      state,
      rng: createMockRng(),
    } as MoveEffectContext;

    const result = ruleset.executeMoveEffect(context);

    // Magic Room should not set any special field state in Gen 4
    expect(result.trickRoomSet).toBeUndefined();
    expect(result.magicRoomSet).toBeUndefined();
    expect(result.wonderRoomSet).toBeUndefined();
  });
});

// ===========================================================================
// 8. Klutz — suppresses Toxic Orb and Flame Orb
// ===========================================================================

describe("Gen4Items Klutz — suppresses Toxic Orb and Flame Orb", () => {
  it("given Klutz holder with Toxic Orb, when end-of-turn item trigger fires, then Toxic Orb does NOT inflict badly-poisoned", () => {
    // Source: Bulbapedia — Klutz: "The Pokemon can't use any held items"
    // Source: Showdown data/abilities.ts — Klutz gates all item battle effects including orbs
    const ctx = createItemContext({
      heldItem: GEN4_ITEM_IDS.toxicOrb,
      ability: GEN4_ABILITY_IDS.klutz,
    });
    const result = applyGen4HeldItem(ITEM_TRIGGERS.endOfTurn, ctx);

    expect(result.activated).toBe(false);
  });

  it("given Klutz holder with Flame Orb, when end-of-turn item trigger fires, then Flame Orb does NOT inflict burn", () => {
    // Source: Bulbapedia — Klutz: holder cannot use any held items
    // Source: Showdown Gen 4 mod — Klutz check gates all item effects including Flame Orb
    const ctx = createItemContext({
      heldItem: GEN4_ITEM_IDS.flameOrb,
      ability: GEN4_ABILITY_IDS.klutz,
    });
    const result = applyGen4HeldItem(ITEM_TRIGGERS.endOfTurn, ctx);

    expect(result.activated).toBe(false);
  });

  it("given non-Klutz holder with Toxic Orb (no prior status), when end-of-turn fires, then badly-poisoned is inflicted", () => {
    // Source: Bulbapedia — Toxic Orb: badly poisons holder at end of turn if no status
    // Triangulates that Klutz suppression is specific to Klutz, not all holders
    const ctx = createItemContext({
      heldItem: GEN4_ITEM_IDS.toxicOrb,
      ability: GEN4_ABILITY_IDS.blaze,
      types: [CORE_TYPE_IDS.normal],
    });
    const result = applyGen4HeldItem(ITEM_TRIGGERS.endOfTurn, ctx);

    expect(result.activated).toBe(true);
    expect(
      result.effects.some(
        (e) => e.type === "inflict-status" && e.status === CORE_STATUS_IDS.badlyPoisoned,
      ),
    ).toBe(true);
  });
});

// ===========================================================================
// 9. Trick/Switcheroo — Klutz holder CAN participate (swap is allowed)
// ===========================================================================

describe("Gen4MoveEffects Trick/Switcheroo — Klutz holder can swap items", () => {
  it("given a Klutz attacker using Trick against a defender holding Choice Band, when Trick is executed, then items are swapped", () => {
    // Source: Showdown Gen 4 mod — Klutz does not block Trick/Switcheroo
    // Source: Bulbapedia — Klutz "prevents the use of held items in battle" but Trick bypasses this
    // Per Showdown: Klutz holders can use Trick to give away or receive items; Klutz only prevents
    // the item's battle effect (stat boost, berry activation, etc.)
    const trickMove = dataManager.getMove(GEN4_MOVE_IDS.trick);
    expect(trickMove).toMatchObject({ id: GEN4_MOVE_IDS.trick }); // fail fast if move data is missing — that would be a regression

    const attacker = createActivePokemon({
      ability: GEN4_ABILITY_IDS.klutz,
      types: [CORE_TYPE_IDS.normal],
    });
    attacker.pokemon.heldItem = GEN4_ITEM_IDS.lifeOrb; // Klutz holder with an item to swap
    const defender = createActivePokemon({
      ability: GEN4_ABILITY_IDS.blaze,
      types: [CORE_TYPE_IDS.normal],
    });
    defender.pokemon.heldItem = GEN4_ITEM_IDS.choiceBand;

    const state = createNullState();
    const context = {
      attacker,
      defender,
      move: trickMove!,
      damage: 0,
      state,
      rng: createMockRng(),
    } as MoveEffectContext;

    ruleset.executeMoveEffect(context);

    // Items should be swapped: attacker gets choice-band, defender gets life-orb
    expect(attacker.pokemon.heldItem).toBe(GEN4_ITEM_IDS.choiceBand);
    expect(defender.pokemon.heldItem).toBe(GEN4_ITEM_IDS.lifeOrb);
  });

  it("given a Klutz attacker holding no item using Trick against a defender holding Leftovers, when Trick is executed, then items are swapped (null for item)", () => {
    // Source: Showdown Gen 4 mod — Klutz does not block Trick/Switcheroo even when attacker has no item
    // Triangulates: attacker starts with null item, defender starts with an item; after Trick, attacker
    // has defender's item, defender has null. Tests the swap in the opposite direction.
    const trickMove = dataManager.getMove(GEN4_MOVE_IDS.trick);
    expect(trickMove).toMatchObject({ id: GEN4_MOVE_IDS.trick });

    const attacker = createActivePokemon({
      ability: GEN4_ABILITY_IDS.klutz,
      types: [CORE_TYPE_IDS.normal],
    });
    attacker.pokemon.heldItem = null; // No item — Trick still allowed even for Klutz with no item
    const defender = createActivePokemon({
      ability: GEN4_ABILITY_IDS.blaze,
      types: [CORE_TYPE_IDS.normal],
    });
    defender.pokemon.heldItem = GEN4_ITEM_IDS.leftovers;

    const state = createNullState();
    const context = {
      attacker,
      defender,
      move: trickMove!,
      damage: 0,
      state,
      rng: createMockRng(),
    } as MoveEffectContext;

    ruleset.executeMoveEffect(context);

    // Items should be swapped: attacker gets leftovers, defender gets null
    expect(attacker.pokemon.heldItem).toBe(GEN4_ITEM_IDS.leftovers);
    expect(defender.pokemon.heldItem).toBeNull();
  });
});

// ===========================================================================
// BUG-3: Sequential type effectiveness with intermediate floor per defender type
// ===========================================================================

describe("Gen4DamageCalc — BUG-3: sequential type effectiveness with intermediate floor", () => {
  // Source: pret/pokeplatinum src/battle/battle_lib.c:2612-2646 — ApplyTypeMultiplier
  //   called separately for type1 (line 2625-2627) and type2 (line 2634-2637) with
  //   BattleSystem_Divide(damage * mul, 10) — integer truncation per type, NOT combined.
  // Bug: previous code applied combined effectiveness in one floor() call.
  //   For dual-type defenders with mixed effectiveness (e.g. 0.5x × 2x = 1.0x combined),
  //   an odd baseDamage produces a different result:
  //   damage=19 → sequential: floor(floor(19*0.5)*2)=floor(9*2)=18; single: floor(19*1.0)=19.

  it("given L50 attacker (SpA=100) using water special power=40 vs water/rock defender (SpD=100), when calculating damage, then sequential type floors produce 18 (not 19)", () => {
    // Formula derivation (special move, no STAB — attacker is normal-type):
    //   levelFactor = floor(2*50/5) + 2 = 22
    //   step2 = floor(22 * 40 * 100 / 100) = 880
    //   step3 = floor(880 / 50) = 17
    //   baseDamage = 17 + 2 = 19
    //   random roll = 100/100 = 1.0x (max)
    //   type seq: floor(19 * 0.5) = 9  (water vs water)
    //             floor(9  * 2.0) = 18 (water vs rock)
    //   Single (buggy): floor(19 * 1.0) = 19
    // Source: pret/pokeplatinum battle_lib.c:2625-2637 — BattleSystem_Divide per type
    const attacker = createActivePokemon({
      level: 50,
      spAttack: 100,
      types: [CORE_TYPE_IDS.normal],
    });
    const defender = createActivePokemon({
      level: 50,
      spDefense: 100,
      types: [CORE_TYPE_IDS.water, CORE_TYPE_IDS.rock],
    });
    const move = getGen4Move(GEN4_MOVE_IDS.waterGun);
    const rng = createMockRng(100); // no random reduction
    const state = createNullState();

    const result = calculateGen4Damage(
      { attacker, defender, move, isCrit: false, rng: rng as any, state } as DamageContext,
      GEN4_TYPE_CHART,
    );

    expect(result.damage).toBe(18);
  });

  it("given L25 attacker (SpA=100) using water special power=40 vs water/rock defender (SpD=100), when calculating damage, then sequential type floors produce 10 (not 11)", () => {
    // Formula derivation (triangulation at L25):
    //   levelFactor = floor(2*25/5) + 2 = 12
    //   step2 = floor(12 * 40 * 100 / 100) = 480
    //   step3 = floor(480 / 50) = 9
    //   baseDamage = 9 + 2 = 11
    //   random roll = 100/100 = 1.0x
    //   type seq: floor(11 * 0.5) = 5  (water vs water)
    //             floor(5  * 2.0) = 10 (water vs rock)
    //   Single (buggy): floor(11 * 1.0) = 11
    // Source: pret/pokeplatinum battle_lib.c:2625-2637 — same sequential pattern
    const attacker = createActivePokemon({
      level: 25,
      spAttack: 100,
      types: [CORE_TYPE_IDS.normal],
    });
    const defender = createActivePokemon({
      level: 25,
      spDefense: 100,
      types: [CORE_TYPE_IDS.water, CORE_TYPE_IDS.rock],
    });
    const move = getGen4Move(GEN4_MOVE_IDS.waterGun);
    const rng = createMockRng(100);
    const state = createNullState();

    const result = calculateGen4Damage(
      { attacker, defender, move, isCrit: false, rng: rng as any, state } as DamageContext,
      GEN4_TYPE_CHART,
    );

    expect(result.damage).toBe(10);
  });
});

// ===========================================================================
// BUG-6: Marvel Scale — integer arithmetic floor((stat * 150) / 100)
// ===========================================================================

describe("Gen4DamageCalc — BUG-6: Marvel Scale integer arithmetic matching pokeplatinum", () => {
  // Source: pret/pokeplatinum src/battle/battle_lib.c:6799 — defenseStat * 150 / 100
  // Bug: was Math.floor(baseStat * 1.5) (float); fixed to Math.floor((baseStat * 150) / 100)
  // Both expressions are numerically equivalent for integer inputs, but the integer form
  // matches the decomp and avoids any theoretical float precision issues at extreme values.

  it("given a statused defender with Marvel Scale, when taking a physical hit, then Defense is boosted (damage lower than without status)", () => {
    // Source: pret/pokeplatinum battle_lib.c:6799 — Marvel Scale: defense * 150 / 100
    // Attacker is fire-type so no STAB on normal move. normal vs normal type = 1.0x.
    // Without status (L50, atk=100, def=100, power=40, fire attacker / normal move / normal defender):
    //   levelFactor=22; step2=floor(22*40*100/100)=880; step3=floor(880/50)=17; base=19; roll=1.0x → 19
    // With status + Marvel Scale (def becomes floor(100*150/100)=150):
    //   step2=floor(22*40*100/150)=floor(586.67)=586; step3=floor(586/50)=11; base=13; roll=1.0x → 13
    // Source: pret/pokeplatinum src/battle/battle_lib.c:6799
    const attackerBase = createActivePokemon({
      level: 50,
      attack: 100,
      types: [CORE_TYPE_IDS.fire],
    });
    const defenderNoStatus = createActivePokemon({
      level: 50,
      defense: 100,
      types: [CORE_TYPE_IDS.normal],
      ability: GEN4_ABILITY_IDS.marvelScale,
      status: null,
    });
    const defenderStatused = createActivePokemon({
      level: 50,
      defense: 100,
      types: [CORE_TYPE_IDS.normal],
      ability: GEN4_ABILITY_IDS.marvelScale,
      status: CORE_STATUS_IDS.paralysis,
    });
    const move = getGen4Move(GEN4_MOVE_IDS.scratch);
    const rng = createMockRng(100);
    const state = createNullState();

    const resultNoStatus = calculateGen4Damage(
      {
        attacker: attackerBase,
        defender: defenderNoStatus,
        move,
        isCrit: false,
        rng: rng as any,
        state,
      } as DamageContext,
      GEN4_TYPE_CHART,
    );
    const resultStatused = calculateGen4Damage(
      {
        attacker: attackerBase,
        defender: defenderStatused,
        move,
        isCrit: false,
        rng: rng as any,
        state,
      } as DamageContext,
      GEN4_TYPE_CHART,
    );

    expect(resultNoStatus.damage).toBe(19);
    expect(resultStatused.damage).toBe(13);
  });

  it("given a statused defender WITHOUT Marvel Scale, when taking a physical hit, then Defense is NOT boosted (damage same as unstated)", () => {
    // Triangulates: Marvel Scale is ability-gated. Without the ability, status has no
    // defensive effect on raw Defense stat, so damage equals the no-status baseline (19).
    const attacker = createActivePokemon({ level: 50, attack: 100, types: [CORE_TYPE_IDS.fire] });
    const defenderNoAbility = createActivePokemon({
      level: 50,
      defense: 100,
      types: [CORE_TYPE_IDS.normal],
      ability: CORE_ABILITY_IDS.shedSkin, // different ability — no Defense boost
      status: CORE_STATUS_IDS.paralysis,
    });
    const move = getGen4Move(GEN4_MOVE_IDS.scratch);
    const rng = createMockRng(100);
    const state = createNullState();

    const result = calculateGen4Damage(
      {
        attacker,
        defender: defenderNoAbility,
        move,
        isCrit: false,
        rng: rng as any,
        state,
      } as DamageContext,
      GEN4_TYPE_CHART,
    );

    // Source: pret/pokeplatinum battle_lib.c:6799 — without Marvel Scale, Defense stays 100.
    // No Marvel Scale → Defense unchanged → same as no-status baseline (19)
    expect(result.damage).toBe(19);
  });
});
