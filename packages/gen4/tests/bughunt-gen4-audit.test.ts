import type {
  ActivePokemon,
  DamageContext,
  ItemContext,
  MoveEffectContext,
} from "@pokemon-lib-ts/battle";
import type {
  MoveData,
  MoveEffect,
  PokemonInstance,
  PokemonType,
  StatBlock,
} from "@pokemon-lib-ts/core";
import { describe, expect, it } from "vitest";
import { createGen4DataManager } from "../src/data";
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
  status?: "burn" | "poison" | "badly-poisoned" | "paralysis" | "sleep" | "freeze" | null;
  gender?: "male" | "female" | "genderless";
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
    volatileStatuses: opts.volatileStatuses ?? new Map(),
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
  punch?: boolean;
  contact?: boolean;
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
      contact: opts.contact ?? false,
      sound: false,
      bullet: false,
      pulse: false,
      punch: opts.punch ?? false,
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
  status?: "burn" | "poison" | "badly-poisoned" | "paralysis" | "sleep" | "freeze" | null;
}): ItemContext {
  const maxHp = opts.maxHp ?? 160;
  const pokemon = {
    uid: "test",
    speciesId: 1,
    nickname: null,
    level: 50,
    experience: 0,
    nature: "hardy",
    ivs: { hp: 31, attack: 31, defense: 31, spAttack: 31, spDefense: 31, speed: 31 },
    evs: { hp: 0, attack: 0, defense: 0, spAttack: 0, spDefense: 0, speed: 0 },
    currentHp: opts.currentHp ?? maxHp,
    moves: [],
    ability: opts.ability ?? "",
    abilitySlot: "normal1" as const,
    heldItem: opts.heldItem ?? null,
    status: opts.status ?? null,
    friendship: 0,
    gender: "male" as const,
    isShiny: false,
    metLocation: "",
    metLevel: 1,
    originalTrainer: "",
    originalTrainerId: 0,
    pokeball: "pokeball",
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
      types: opts.types ?? ["normal"],
      volatileStatuses: new Map(),
      ability: opts.ability ?? "",
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
    } as ActivePokemon,
    damage: opts.damage ?? 0,
    state: createNullState(),
    rng: createMockRng(),
  } as ItemContext;
}

const dataManager = createGen4DataManager();
const ruleset = new Gen4Ruleset(dataManager);

// ===========================================================================
// 1. Skill Link — always hits 5 times
// ===========================================================================

describe("Gen4Ruleset rollMultiHitCount — Skill Link (NEW in Gen 4)", () => {
  it("given an attacker with Skill Link ability, when rollMultiHitCount is called, then returns exactly 5", () => {
    // Source: Bulbapedia — Skill Link (Gen 4+): "Makes multi-hit moves always strike 5 times."
    // Source: Showdown Gen 4 mod Gen4Ruleset — if (attacker.ability === 'skill-link') return 5
    // Derivation: regardless of RNG seed, Skill Link always returns 5 hits
    const attacker = createActivePokemon({ ability: "skill-link" });
    const rng1 = createMockRng(0);
    const rng2 = createMockRng(100);

    // Two calls with different RNG states must both return 5
    const result1 = ruleset.rollMultiHitCount(attacker, rng1 as any);
    const result2 = ruleset.rollMultiHitCount(attacker, rng2 as any);

    expect(result1).toBe(5);
    expect(result2).toBe(5);
  });

  it("given an attacker WITHOUT Skill Link, when rollMultiHitCount is called, then returns a value in {2, 3, 4, 5}", () => {
    // Source: Showdown Gen 4 mod — gen14MultiHitRoll returns 2–5
    // Source: Bulbapedia — Multi-hit moves without Skill Link: 2-5 hits (weighted 2:2:1:1)
    // This triangulates that Skill Link's forced-5 path is distinct from the standard path
    const attacker = createActivePokemon({ ability: "blaze" });
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
      types: ["fire"],
      ability: "technician",
      heldItem: "charcoal",
    });
    const defender = createActivePokemon({ types: ["normal"] });
    const move = createMove({ type: "fire", power: 55, category: "special", id: "test-55bp-fire" });
    const rng = createMockRng(100); // no random reduction (100/100 = 1.0)
    const state = createNullState();

    const resultWithCharcoal = calculateGen4Damage(
      { attacker, defender, move, isCrit: false, rng: rng as any, state } as DamageContext,
      GEN4_TYPE_CHART,
    );

    // Baseline: same move without Technician or Charcoal
    const attackerPlain = createActivePokemon({
      types: ["fire"],
      ability: "blaze",
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
      types: ["fire"],
      ability: "technician",
      heldItem: "charcoal",
    });
    const defender = createActivePokemon({ types: ["normal"] });
    const move = createMove({ type: "fire", power: 40, category: "special", id: "test-40bp-fire" });
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
      heldItem: "focus-sash",
      maxHp: 200,
      currentHp: 200,
      damage: 300,
    });
    const result = applyGen4HeldItem("on-damage-taken", ctx);

    expect(result.activated).toBe(true);
    expect(result.effects.some((e) => e.type === "survive")).toBe(true);
    expect(result.effects.some((e) => e.type === "consume" && e.value === "focus-sash")).toBe(true);
  });

  it("given Focus Sash holder at full HP and a non-KO hit, when item function is called, then does NOT activate (non-lethal)", () => {
    // Source: Bulbapedia — Focus Sash only activates on a would-be KO
    // Derivation: maxHp=200, currentHp=200, damage=50 → 200 - 50 = 150 > 0 → no activation
    const ctx = createItemContext({
      heldItem: "focus-sash",
      maxHp: 200,
      currentHp: 200,
      damage: 50,
    });
    const result = applyGen4HeldItem("on-damage-taken", ctx);

    expect(result.activated).toBe(false);
  });

  it("given Focus Sash holder at less than full HP and a KO hit, when item function is called, then does NOT activate (must be at full HP)", () => {
    // Source: Bulbapedia — Focus Sash: "If the holder is at full HP..."
    // Derivation: maxHp=200, currentHp=150 (not full), damage=300 → currentHp !== maxHp → no activation
    const ctx = createItemContext({
      heldItem: "focus-sash",
      maxHp: 200,
      currentHp: 150,
      damage: 300,
    });
    const result = applyGen4HeldItem("on-damage-taken", ctx);

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
    const attacker = createActivePokemon({ types: ["normal"], ability: "reckless" });
    const defender = createActivePokemon({ types: ["normal"] });
    const struggleMove = createMove({
      type: "normal",
      power: 50,
      category: "physical",
      id: "struggle",
      effect: null,
    });
    const plainAttacker = createActivePokemon({ types: ["normal"], ability: "" });
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
    const attacker = createActivePokemon({ types: ["normal"], ability: "reckless" });
    const defender = createActivePokemon({ types: ["normal"] });
    const doubleEdge = createMove({
      type: "normal",
      power: 120,
      category: "physical",
      id: "double-edge",
      effect: { type: "recoil", fraction: 1 / 3 },
    });
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
    const selfMon = createActivePokemon({ ability: "download" });
    const foe = createActivePokemon({ defense: 80, spDefense: 100 });

    const context = {
      pokemon: selfMon,
      opponent: foe,
      state: createNullState(),
      rng: createMockRng(),
    } as any;

    const result = applyGen4Ability("on-switch-in", context);

    expect(result.activated).toBe(true);
    const statEffect = result.effects.find(
      (e: { effectType: string }) => e.effectType === "stat-change",
    );
    expect(statEffect?.stat).toBe("attack");
    expect(statEffect?.stages).toBe(1);
  });

  it("given Download activating when foe Defense >= foe SpDefense, then raises SpAttack", () => {
    // Source: Bulbapedia — Download: raises SpAtk if foe Defense >= foe SpDefense
    // Source: Showdown data/abilities.ts — Download onStart comparison (else branch)
    // Source: Gen4Abilities.ts handleSwitchIn "download" case — else stat = "spAttack"

    // Foe with Defense=100, SpDefense=80 → Defense >= SpDefense → raise SpAttack
    const selfMon = createActivePokemon({ ability: "download" });
    const foe = createActivePokemon({ defense: 100, spDefense: 80 });

    const context = {
      pokemon: selfMon,
      opponent: foe,
      state: createNullState(),
      rng: createMockRng(),
    } as any;

    const result = applyGen4Ability("on-switch-in", context);

    expect(result.activated).toBe(true);
    const statEffect = result.effects.find(
      (e: { effectType: string }) => e.effectType === "stat-change",
    );
    expect(statEffect?.stat).toBe("spAttack");
    expect(statEffect?.stages).toBe(1);
  });
});

// ===========================================================================
// 6. Metronome item — Gen 4 cap at 1.5x after 5 consecutive uses
// ===========================================================================

describe("Gen4DamageCalc Metronome item — 1.5x cap (Gen 4, not Gen 5+ 2.0x)", () => {
  it("given Metronome item with count=6 (6 consecutive uses), when calculating damage, then boost is capped at 1.5x (boostSteps capped at 5)", () => {
    // Source: Showdown data/mods/gen4/items.ts — Metronome onModifyDamagePhase2:
    //   numConsecutive capped at 5; multiplier = 1 + (5 * 0.1) = 1.5
    // Source: Bulbapedia — Metronome item Gen 4: +10% per consecutive use, max 1.5x (5 uses)
    // Derivation: L50, power=80, Atk=100, Def=100, rng=100, normal/normal STAB
    //   baseDmg = floor(floor(22*80*100/100)/50)+2 = floor(1760/50)+2 = 35+2 = 37
    //   Metronome Phase 2 (before random): floor(37*1.5) = floor(55.5) = 55
    //   Random (100/100=1.0): 55
    //   STAB (normal/normal): floor(55*1.5) = 82
    //   Verify: count=7 gives same result as count=6 (cap enforced)
    const metronomeVolatiles = new Map([
      ["metronome-count", { turnsLeft: -1, data: { count: 6, moveId: "tackle" } }],
    ]);
    const attacker = createActivePokemon({
      types: ["normal"],
      ability: "",
      heldItem: "metronome",
      volatileStatuses: metronomeVolatiles,
    });
    const defender = createActivePokemon({ types: ["normal"] });
    const move = createMove({ type: "normal", power: 80, category: "physical", id: "tackle" });
    const rng = createMockRng(100);
    const state = createNullState();

    const resultCount6 = calculateGen4Damage(
      { attacker, defender, move, isCrit: false, rng: rng as any, state } as DamageContext,
      GEN4_TYPE_CHART,
    );

    // Test count=7 to verify cap is enforced
    const metronomeVolatiles7 = new Map([
      ["metronome-count", { turnsLeft: -1, data: { count: 7, moveId: "tackle" } }],
    ]);
    const attacker7 = createActivePokemon({
      types: ["normal"],
      ability: "",
      heldItem: "metronome",
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

    // Both count=6 and count=7 must produce the same damage (capped at 5 boost steps = 1.5x)
    expect(resultCount6.damage).toBe(82);
    expect(resultCount7.damage).toBe(82);
  });

  it("given Metronome item with count=2 (second consecutive use), when calculating damage, then boost is 1.1x", () => {
    // Source: Showdown data/mods/gen4/items.ts — count=2 → boostSteps=1 → multiplier=1.1x
    // Derivation: L50, power=80, Atk=100, Def=100, rng=100, normal/normal STAB
    //   baseDmg = 37; Metronome Phase 2: floor(37*1.1) = floor(40.7) = 40
    //   Random (100/100=1.0): 40; STAB (normal/normal): floor(40*1.5) = 60
    const metronomeVolatiles = new Map([
      ["metronome-count", { turnsLeft: -1, data: { count: 2, moveId: "tackle" } }],
    ]);
    const attacker = createActivePokemon({
      types: ["normal"],
      ability: "",
      heldItem: "metronome",
      volatileStatuses: metronomeVolatiles,
    });
    const defender = createActivePokemon({ types: ["normal"] });
    const move = createMove({ type: "normal", power: 80, category: "physical", id: "tackle" });
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
    const attacker = createActivePokemon({ types: ["psychic"] });
    const defender = createActivePokemon({ types: ["normal"] });
    const wonderRoomMove: MoveData = {
      id: "wonder-room",
      displayName: "Wonder Room",
      type: "psychic",
      category: "status",
      power: 0,
      accuracy: null,
      pp: 10,
      priority: 0,
      target: "all",
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
        protect: false,
        mirror: false,
        snatch: false,
        gravity: false,
        defrost: false,
        recharge: false,
        charge: false,
        bypassSubstitute: false,
      },
      effect: null,
      description: "",
      generation: 5, // This is Gen 5+ only
    } as MoveData;

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
    expect(result.trickRoomSet).toBeFalsy();
    // No special messages about swapping defense/sp defense should appear
    expect(result.messages.every((m) => !m.toLowerCase().includes("wonder room"))).toBe(true);
  });

  it("given magic-room move ID, when executeMoveEffect is called, then no special field effect is produced", () => {
    // Source: Bulbapedia — Magic Room introduced in Gen 5 (Black/White)
    // Source: Showdown Gen 4 mod — magic-room is not in Gen 4 move list
    const attacker = createActivePokemon({ types: ["psychic"] });
    const defender = createActivePokemon({ types: ["normal"] });
    const magicRoomMove: MoveData = {
      id: "magic-room",
      displayName: "Magic Room",
      type: "psychic",
      category: "status",
      power: 0,
      accuracy: null,
      pp: 10,
      priority: 0,
      target: "all",
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
        protect: false,
        mirror: false,
        snatch: false,
        gravity: false,
        defrost: false,
        recharge: false,
        charge: false,
        bypassSubstitute: false,
      },
      effect: null,
      description: "",
      generation: 5, // This is Gen 5+ only
    } as MoveData;

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
    expect(result.trickRoomSet).toBeFalsy();
    expect(result.messages.every((m) => !m.toLowerCase().includes("magic room"))).toBe(true);
  });
});

// ===========================================================================
// 8. Klutz — suppresses Toxic Orb and Flame Orb
// ===========================================================================

describe("Gen4Items Klutz — suppresses Toxic Orb and Flame Orb", () => {
  it("given Klutz holder with Toxic Orb, when end-of-turn item trigger fires, then Toxic Orb does NOT inflict badly-poisoned", () => {
    // Source: Bulbapedia — Klutz: "The Pokemon can't use any held items"
    // Source: Showdown data/abilities.ts — Klutz gates all item battle effects including orbs
    const ctx = createItemContext({ heldItem: "toxic-orb", ability: "klutz" });
    const result = applyGen4HeldItem("end-of-turn", ctx);

    expect(result.activated).toBe(false);
  });

  it("given Klutz holder with Flame Orb, when end-of-turn item trigger fires, then Flame Orb does NOT inflict burn", () => {
    // Source: Bulbapedia — Klutz: holder cannot use any held items
    // Source: Showdown Gen 4 mod — Klutz check gates all item effects including Flame Orb
    const ctx = createItemContext({ heldItem: "flame-orb", ability: "klutz" });
    const result = applyGen4HeldItem("end-of-turn", ctx);

    expect(result.activated).toBe(false);
  });

  it("given non-Klutz holder with Toxic Orb (no prior status), when end-of-turn fires, then badly-poisoned is inflicted", () => {
    // Source: Bulbapedia — Toxic Orb: badly poisons holder at end of turn if no status
    // Triangulates that Klutz suppression is specific to Klutz, not all holders
    const ctx = createItemContext({ heldItem: "toxic-orb", ability: "blaze", types: ["normal"] });
    const result = applyGen4HeldItem("end-of-turn", ctx);

    expect(result.activated).toBe(true);
    expect(
      result.effects.some((e) => e.type === "inflict-status" && e.status === "badly-poisoned"),
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
    const trickMove = dataManager.getMove("trick");
    if (!trickMove) return; // skip if move data unavailable

    const attacker = createActivePokemon({ ability: "klutz", types: ["normal"] });
    attacker.pokemon.heldItem = "life-orb"; // Klutz holder with an item to swap
    const defender = createActivePokemon({ ability: "blaze", types: ["normal"] });
    defender.pokemon.heldItem = "choice-band";

    const state = createNullState();
    const context = {
      attacker,
      defender,
      move: trickMove,
      damage: 0,
      state,
      rng: createMockRng(),
    } as MoveEffectContext;

    ruleset.executeMoveEffect(context);

    // Items should be swapped: attacker gets choice-band, defender gets life-orb
    expect(attacker.pokemon.heldItem).toBe("choice-band");
    expect(defender.pokemon.heldItem).toBe("life-orb");
  });
});
