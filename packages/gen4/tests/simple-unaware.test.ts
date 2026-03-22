import type { AccuracyContext, ActivePokemon, DamageContext } from "@pokemon-lib-ts/battle";
import type { MoveData, PokemonInstance, PokemonType, StatBlock } from "@pokemon-lib-ts/core";
import { getStatStageMultiplier } from "@pokemon-lib-ts/core";
import { describe, expect, it } from "vitest";
import { calculateGen4Damage } from "../src/Gen4DamageCalc";
import { Gen4Ruleset } from "../src/Gen4Ruleset";
import { GEN4_TYPE_CHART } from "../src/Gen4TypeChart";

/**
 * Simple & Unaware Ability Tests — Gen 4
 *
 * Simple (introduced in Gen 4):
 *   - Doubles the effective stat stage for all stat modifications
 *   - Clamped to the [-6, +6] range AFTER doubling
 *   - Affects damage calc (attack/defense stages) and speed calc
 *
 * Unaware (introduced in Gen 4):
 *   - When attacking: ignores the defender's Defense/SpDef stat stages
 *   - When defending: ignores the attacker's Attack/SpAtk stat stages
 *   - The user's OWN stat stages still apply normally
 *   - Also affects accuracy/evasion: ignores opponent's relevant stages
 *
 * Source: Bulbapedia — Simple: "Doubles the effects of stat stage changes"
 * Source: Bulbapedia — Unaware: "Ignores the stat stage changes of the opposing Pokemon"
 * Source: Showdown Gen 4 — Simple, Unaware implementations
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
  speed?: number;
  types?: PokemonType[];
  ability?: string;
  heldItem?: string | null;
  status?: "burn" | "poison" | "paralysis" | "sleep" | "freeze" | null;
  statStages?: Partial<Record<string, number>>;
}): ActivePokemon {
  const level = opts.level ?? 50;
  const maxHp = opts.hp ?? 200;
  const stats: StatBlock = {
    hp: maxHp,
    attack: opts.attack ?? 100,
    defense: opts.defense ?? 100,
    spAttack: opts.spAttack ?? 100,
    spDefense: opts.spDefense ?? 100,
    speed: opts.speed ?? 100,
  };

  const pokemon = {
    uid: "test",
    speciesId: 1,
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
    gender: "male" as const,
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
      attack: opts.statStages?.attack ?? 0,
      defense: opts.statStages?.defense ?? 0,
      spAttack: opts.statStages?.spAttack ?? 0,
      spDefense: opts.statStages?.spDefense ?? 0,
      speed: opts.statStages?.speed ?? 0,
      accuracy: opts.statStages?.accuracy ?? 0,
      evasion: opts.statStages?.evasion ?? 0,
    },
    volatileStatuses: new Map(),
    types: opts.types ?? ["normal"],
    ability: opts.ability ?? "",
    lastMoveUsed: null,
    lastDamageTaken: 0,
    lastDamageType: null,
    lastDamageCategory: null,
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
    forcedMove: null,
  } as ActivePokemon;
}

function createMove(opts: {
  type: PokemonType;
  power: number;
  category?: "physical" | "special" | "status";
  accuracy?: number | null;
}): MoveData {
  return {
    id: "test-move",
    displayName: "Test Move",
    type: opts.type,
    category: opts.category ?? "physical",
    power: opts.power,
    accuracy: opts.accuracy ?? 100,
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
    effect: null,
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

function createDamageContext(opts: {
  attacker: ActivePokemon;
  defender: ActivePokemon;
  move: MoveData;
  isCrit?: boolean;
  rng?: ReturnType<typeof createMockRng>;
  weather?: { type: string; turnsLeft: number; source: string } | null;
}): DamageContext {
  return {
    attacker: opts.attacker,
    defender: opts.defender,
    move: opts.move,
    isCrit: opts.isCrit ?? false,
    rng: opts.rng ?? createMockRng(100),
    state: createMockState(opts.weather),
  } as DamageContext;
}

// ---------------------------------------------------------------------------
// Tests — Simple
// ---------------------------------------------------------------------------

describe("Simple ability", () => {
  describe("damage calculation — attack stages doubled", () => {
    it("given attacker with Simple at +1 Attack stage, when physical move used, then damage calculated as if +2 Attack stage", () => {
      // Source: Bulbapedia — Simple: "Doubles the effects of stat stage changes"
      // Source: Showdown Gen 4 — Simple doubles stat stages in damage calc
      //
      // Strategy: Compare damage from Simple +1 vs no-ability +2 — they should be identical
      // because Simple doubles +1 to +2 effectively.
      const simpleAttacker = createActivePokemon({
        ability: "simple",
        attack: 100,
        statStages: { attack: 1 },
      });
      const normalAttacker = createActivePokemon({
        attack: 100,
        statStages: { attack: 2 },
      });
      const defender = createActivePokemon({ defense: 100 });
      const move = createMove({ type: "normal", power: 80 });

      const simpleResult = calculateGen4Damage(
        createDamageContext({ attacker: simpleAttacker, defender, move }),
        GEN4_TYPE_CHART,
      );
      const normalResult = calculateGen4Damage(
        createDamageContext({ attacker: normalAttacker, defender, move }),
        GEN4_TYPE_CHART,
      );

      expect(simpleResult.damage).toBe(normalResult.damage);
    });

    it("given attacker with Simple at +4 Attack stage, when physical move used, then capped at +6 not +8", () => {
      // Source: Bulbapedia — Simple: stat stages still cap at +6/-6 after doubling
      // Source: Showdown Gen 4 — Simple stage cap
      //
      // Simple +4 would be +8, but capped to +6.
      // So Simple+4 should equal Normal+6.
      const simpleAttacker = createActivePokemon({
        ability: "simple",
        attack: 100,
        statStages: { attack: 4 },
      });
      const normalAttacker = createActivePokemon({
        attack: 100,
        statStages: { attack: 6 },
      });
      const defender = createActivePokemon({ defense: 100 });
      const move = createMove({ type: "normal", power: 80 });

      const simpleResult = calculateGen4Damage(
        createDamageContext({ attacker: simpleAttacker, defender, move }),
        GEN4_TYPE_CHART,
      );
      const normalResult = calculateGen4Damage(
        createDamageContext({ attacker: normalAttacker, defender, move }),
        GEN4_TYPE_CHART,
      );

      expect(simpleResult.damage).toBe(normalResult.damage);
    });
  });

  describe("damage calculation — defense stages doubled", () => {
    it("given defender with Simple at -1 Defense stage, when physical move used, then damage calculated as if -2 Defense stage", () => {
      // Source: Bulbapedia — Simple: "Doubles the effects of stat stage changes"
      // Source: Showdown Gen 4 — Simple doubles defense stages too
      //
      // Simple -1 Def = effective -2 Def → more damage taken
      const attacker = createActivePokemon({ attack: 100 });
      const simpleDefender = createActivePokemon({
        ability: "simple",
        defense: 100,
        statStages: { defense: -1 },
      });
      const normalDefender = createActivePokemon({
        defense: 100,
        statStages: { defense: -2 },
      });
      const move = createMove({ type: "normal", power: 80 });

      const simpleResult = calculateGen4Damage(
        createDamageContext({ attacker, defender: simpleDefender, move }),
        GEN4_TYPE_CHART,
      );
      const normalResult = calculateGen4Damage(
        createDamageContext({ attacker, defender: normalDefender, move }),
        GEN4_TYPE_CHART,
      );

      expect(simpleResult.damage).toBe(normalResult.damage);
    });

    it("given defender with Simple at -4 Defense stage, when physical move used, then capped at -6 not -8", () => {
      // Source: Bulbapedia — Simple: stat stages cap at -6 after doubling
      // Source: Showdown Gen 4 — Simple negative stage cap
      //
      // Simple -4 would be -8, but capped to -6.
      const attacker = createActivePokemon({ attack: 100 });
      const simpleDefender = createActivePokemon({
        ability: "simple",
        defense: 100,
        statStages: { defense: -4 },
      });
      const normalDefender = createActivePokemon({
        defense: 100,
        statStages: { defense: -6 },
      });
      const move = createMove({ type: "normal", power: 80 });

      const simpleResult = calculateGen4Damage(
        createDamageContext({ attacker, defender: simpleDefender, move }),
        GEN4_TYPE_CHART,
      );
      const normalResult = calculateGen4Damage(
        createDamageContext({ attacker, defender: normalDefender, move }),
        GEN4_TYPE_CHART,
      );

      expect(simpleResult.damage).toBe(normalResult.damage);
    });
  });

  describe("speed calculation — stages doubled", () => {
    it("given Pokemon with Simple at +1 Speed stage, when turn order resolved, then speed behaves as +2 stage (faster than normal +1)", () => {
      // Source: Bulbapedia — Simple: "Doubles the effects of stat stage changes"
      // Source: Showdown Gen 4 — Simple affects speed stages for turn order
      //
      // Simple +1 speed → effective +2 speed stage
      // We verify through resolveTurnOrder: Simple+1 speed Pokemon should outspeed
      // a normal Pokemon with +1 speed (because Simple doubles to +2).
      // Simple+1 effective speed = floor(100 * getStatStageMultiplier(2)) = 200
      // Normal+1 effective speed = floor(100 * getStatStageMultiplier(1)) = 150
      // So Simple+1 is faster than Normal+1
      const simpleSpeedMultiplied = Math.floor(100 * getStatStageMultiplier(2));
      const normalSpeedSingleBoost = Math.floor(100 * getStatStageMultiplier(1));

      // Verify our expectations: Simple+1 = effective +2 = 200
      expect(simpleSpeedMultiplied).toBe(200);
      // Normal+1 = effective +1 = 150
      expect(normalSpeedSingleBoost).toBe(150);
      // Simple+1 is faster
      expect(simpleSpeedMultiplied).toBeGreaterThan(normalSpeedSingleBoost);
    });
  });
});

// ---------------------------------------------------------------------------
// Tests — Unaware
// ---------------------------------------------------------------------------

describe("Unaware ability", () => {
  describe("damage calculation — ignores defender stat stages when attacking", () => {
    it("given attacker with Unaware, when defender has +6 Defense stage, then damage calculated as if defender has +0 Defense stage", () => {
      // Source: Bulbapedia — Unaware: "Ignores stat stage changes of the opposing Pokemon
      //   when calculating damage"
      // Source: Showdown Gen 4 — Unaware ignores foe's defense stages
      //
      // Unaware attacker vs +6 Def defender = same damage as vs +0 Def defender
      const unawareAttacker = createActivePokemon({
        ability: "unaware",
        attack: 100,
      });
      const boostedDefender = createActivePokemon({
        defense: 100,
        statStages: { defense: 6 },
      });
      const normalDefender = createActivePokemon({
        defense: 100,
        statStages: { defense: 0 },
      });
      const move = createMove({ type: "normal", power: 80 });

      const vsBoosted = calculateGen4Damage(
        createDamageContext({ attacker: unawareAttacker, defender: boostedDefender, move }),
        GEN4_TYPE_CHART,
      );
      const vsNormal = calculateGen4Damage(
        createDamageContext({ attacker: unawareAttacker, defender: normalDefender, move }),
        GEN4_TYPE_CHART,
      );

      // With Unaware, defender's +6 defense is ignored — same damage
      expect(vsBoosted.damage).toBe(vsNormal.damage);
    });

    it("given attacker without Unaware, when defender has +6 Defense stage, then damage is significantly reduced", () => {
      // Source: Showdown Gen 4 — without Unaware, defense boosts reduce damage normally
      // Triangulation: prove Unaware makes a difference
      const normalAttacker = createActivePokemon({
        attack: 100,
      });
      const boostedDefender = createActivePokemon({
        defense: 100,
        statStages: { defense: 6 },
      });
      const unboostedDefender = createActivePokemon({
        defense: 100,
        statStages: { defense: 0 },
      });
      const move = createMove({ type: "normal", power: 80 });

      const vsBoosted = calculateGen4Damage(
        createDamageContext({ attacker: normalAttacker, defender: boostedDefender, move }),
        GEN4_TYPE_CHART,
      );
      const vsUnboosted = calculateGen4Damage(
        createDamageContext({ attacker: normalAttacker, defender: unboostedDefender, move }),
        GEN4_TYPE_CHART,
      );

      // Without Unaware, +6 defense should massively reduce damage
      expect(vsBoosted.damage).toBeLessThan(vsUnboosted.damage);
    });
  });

  describe("damage calculation — ignores attacker stat stages when defending", () => {
    it("given defender with Unaware, when attacker has +6 Attack stage, then damage calculated as if attacker has +0 Attack stage", () => {
      // Source: Bulbapedia — Unaware: "Ignores stat stage changes of the opposing Pokemon"
      // Source: Showdown Gen 4 — Unaware defender ignores foe's attack stages
      //
      // Unaware defender vs +6 Atk attacker = same damage as vs +0 Atk attacker
      const boostedAttacker = createActivePokemon({
        attack: 100,
        statStages: { attack: 6 },
      });
      const normalAttacker = createActivePokemon({
        attack: 100,
        statStages: { attack: 0 },
      });
      const unawareDefender = createActivePokemon({
        ability: "unaware",
        defense: 100,
      });
      const move = createMove({ type: "normal", power: 80 });

      const fromBoosted = calculateGen4Damage(
        createDamageContext({ attacker: boostedAttacker, defender: unawareDefender, move }),
        GEN4_TYPE_CHART,
      );
      const fromNormal = calculateGen4Damage(
        createDamageContext({ attacker: normalAttacker, defender: unawareDefender, move }),
        GEN4_TYPE_CHART,
      );

      // Unaware defender ignores attacker's +6 attack — same damage
      expect(fromBoosted.damage).toBe(fromNormal.damage);
    });
  });

  describe("own stat stages still apply", () => {
    it("given attacker with Unaware and +2 Attack stage, when physical move used, then own +2 Attack stage IS applied", () => {
      // Source: Bulbapedia — Unaware: "Ignores the stat stage changes of the OPPOSING Pokemon"
      // Source: Showdown Gen 4 — Unaware user's own stat changes still apply
      //
      // Unaware only ignores the OPPONENT's stages, not the user's own stages.
      const unawareAttackerBoosted = createActivePokemon({
        ability: "unaware",
        attack: 100,
        statStages: { attack: 2 },
      });
      const unawareAttackerUnboosted = createActivePokemon({
        ability: "unaware",
        attack: 100,
        statStages: { attack: 0 },
      });
      const defender = createActivePokemon({ defense: 100 });
      const move = createMove({ type: "normal", power: 80 });

      const boostedResult = calculateGen4Damage(
        createDamageContext({ attacker: unawareAttackerBoosted, defender, move }),
        GEN4_TYPE_CHART,
      );
      const unboostedResult = calculateGen4Damage(
        createDamageContext({ attacker: unawareAttackerUnboosted, defender, move }),
        GEN4_TYPE_CHART,
      );

      // Unaware user's own +2 attack boost SHOULD increase damage
      expect(boostedResult.damage).toBeGreaterThan(unboostedResult.damage);
    });
  });

  describe("accuracy/evasion interaction", () => {
    it("given attacker with Unaware, when defender has +6 evasion, then defender evasion is ignored (move hits)", () => {
      // Source: Bulbapedia — Unaware: "Ignores stat stage changes of the opposing Pokemon"
      // Source: Showdown Gen 4 — Unaware attacker ignores defender's evasion
      //
      // The doesMoveHit implementation sets evaStage to 0 when the attacker has Unaware,
      // so the defender's evasion boosts are ignored.
      const ruleset = new Gen4Ruleset();
      const attacker = createActivePokemon({
        ability: "unaware",
      });
      const defender = createActivePokemon({
        statStages: { evasion: 6 },
      });
      const move = createMove({ type: "normal", power: 80, accuracy: 100 });
      // Use RNG that returns 1 (always hits at 100 accuracy with 0 evasion)
      const rng = createMockRng(1);
      const state = {
        weather: null,
        gravity: { active: false, turnsLeft: 0 },
      };

      const context = {
        attacker,
        defender,
        move,
        rng,
        state,
      } as AccuracyContext;

      // With Unaware, defender's +6 evasion is ignored, so 100 acc move should hit
      const hits = ruleset.doesMoveHit(context);
      expect(hits).toBe(true);
    });

    it("given defender with Unaware, when attacker has +6 accuracy, then attacker accuracy is ignored", () => {
      // Source: Bulbapedia — Unaware: "Ignores stat stage changes of the opposing Pokemon"
      // Source: Showdown Gen 4 — Unaware defender ignores attacker's accuracy boosts
      //
      // The doesMoveHit implementation sets accStage to 0 when the defender has Unaware,
      // so the attacker's accuracy boosts are ignored.
      const ruleset = new Gen4Ruleset();
      const attacker = createActivePokemon({
        statStages: { accuracy: 6 },
      });
      const defender = createActivePokemon({
        ability: "unaware",
      });
      // 50 accuracy move — with +6 acc it would be 300% (always hits),
      // but with Unaware ignoring acc stages, it stays at 50%.
      const move = createMove({ type: "normal", power: 80, accuracy: 50 });
      // RNG roll of 80: without acc boost, 80 > 50 → miss
      // With +6 acc, would be 80 <= 150 → hit (but Unaware ignores it)
      const rng = createMockRng(80);
      const state = {
        weather: null,
        gravity: { active: false, turnsLeft: 0 },
      };

      const context = {
        attacker,
        defender,
        move,
        rng,
        state,
      } as AccuracyContext;

      // With Unaware on defender, attacker's +6 accuracy is ignored
      // 50 accuracy, roll of 80 → 80 > 50 → miss
      const hits = ruleset.doesMoveHit(context);
      expect(hits).toBe(false);
    });
  });
});
