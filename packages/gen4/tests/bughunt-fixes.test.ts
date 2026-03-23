/**
 * Bug fix tests for Gen 4 issues:
 *   #704 — Mold Breaker bypasses Simple (no stage doubling) and Unaware (stages apply)
 *          in getEffectiveStatStage
 *
 * The getEffectiveStatStage function in Gen4DamageCalc was missing Mold Breaker
 * interaction checks. When the attacker has Mold Breaker:
 *   - The defender's Unaware is bypassed (attacker's stat stages are NOT zeroed)
 * When the defender has Mold Breaker:
 *   - The attacker's Simple is bypassed (stages are NOT doubled)
 *
 * Source: Showdown data/abilities.ts — Mold Breaker ignores opponent abilities
 * Source: Bulbapedia — "Mold Breaker: moves used by the Pokemon with this ability
 *   are unaffected by the abilities of other Pokemon"
 */

import type { ActivePokemon, DamageContext } from "@pokemon-lib-ts/battle";
import type { MoveData, PokemonInstance, PokemonType, StatBlock } from "@pokemon-lib-ts/core";
import { describe, expect, it } from "vitest";
import { calculateGen4Damage } from "../src/Gen4DamageCalc";
import { GEN4_TYPE_CHART } from "../src/Gen4TypeChart";

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
    speed: 100,
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
      speed: 0,
      accuracy: 0,
      evasion: 0,
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
  id?: string;
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
// #704 — Mold Breaker bypasses Simple and Unaware in stat stage calc
// ---------------------------------------------------------------------------

describe("Bug #704: Mold Breaker bypasses Simple and Unaware in getEffectiveStatStage", () => {
  describe("Mold Breaker attacker vs Unaware defender", () => {
    it("given attacker with Mold Breaker at +2 Attack, when attacking Unaware defender, then Attack stages are NOT ignored", () => {
      // Source: Showdown data/abilities.ts — Mold Breaker bypasses Unaware
      // Source: Bulbapedia — "Mold Breaker causes the target's abilities to be ignored"
      //
      // Strategy: Compare Mold Breaker +2 Atk vs Unaware defender
      //   against no-ability +2 Atk vs no-ability defender.
      //   Both should deal the same damage — Mold Breaker bypasses Unaware,
      //   so the +2 Attack stages apply normally.
      const moldBreakerAttacker = createActivePokemon({
        ability: "mold-breaker",
        attack: 100,
        statStages: { attack: 2 },
      });
      const unawareDefender = createActivePokemon({
        ability: "unaware",
        defense: 100,
      });

      const normalAttacker = createActivePokemon({
        attack: 100,
        statStages: { attack: 2 },
      });
      const normalDefender = createActivePokemon({
        defense: 100,
      });

      const move = createMove({ type: "normal", power: 80 });

      const moldBreakerResult = calculateGen4Damage(
        createDamageContext({
          attacker: moldBreakerAttacker,
          defender: unawareDefender,
          move,
        }),
        GEN4_TYPE_CHART,
      );

      const normalResult = calculateGen4Damage(
        createDamageContext({
          attacker: normalAttacker,
          defender: normalDefender,
          move,
        }),
        GEN4_TYPE_CHART,
      );

      // Mold Breaker bypasses Unaware — damage should be the same as if Unaware isn't present
      expect(moldBreakerResult.damage).toBe(normalResult.damage);
    });

    it("given attacker WITHOUT Mold Breaker at +2 Attack, when attacking Unaware defender, then Attack stages ARE ignored", () => {
      // Source: Showdown data/abilities.ts — Unaware ignores stat stages
      // Source: Bulbapedia — "Unaware: ignores stat stage changes of the opposing Pokemon"
      //
      // Control test: without Mold Breaker, Unaware should zero the stat stages.
      const boostedAttacker = createActivePokemon({
        attack: 100,
        statStages: { attack: 2 },
      });
      const unawareDefender = createActivePokemon({
        ability: "unaware",
        defense: 100,
      });

      const baseAttacker = createActivePokemon({
        attack: 100,
        statStages: { attack: 0 },
      });
      const normalDefender = createActivePokemon({
        defense: 100,
      });

      const move = createMove({ type: "normal", power: 80 });

      const unawareResult = calculateGen4Damage(
        createDamageContext({
          attacker: boostedAttacker,
          defender: unawareDefender,
          move,
        }),
        GEN4_TYPE_CHART,
      );

      const baseResult = calculateGen4Damage(
        createDamageContext({
          attacker: baseAttacker,
          defender: normalDefender,
          move,
        }),
        GEN4_TYPE_CHART,
      );

      // Unaware makes the +2 stages invisible — damage should match stage-0 damage
      expect(unawareResult.damage).toBe(baseResult.damage);
    });
  });

  describe("Mold Breaker defender vs Simple attacker", () => {
    it("given defender with Mold Breaker, when attacker has Simple at +1 Attack, then Attack stages ARE doubled (defender MB only active when it attacks)", () => {
      // Mold Breaker only suppresses the TARGET's abilities when the Mold Breaker holder
      // is USING A MOVE. When defending (being attacked), the flag is not set, so the
      // attacker's Simple is NOT suppressed by the defender's Mold Breaker.
      // Source: Showdown sim/battle.ts -- moldBreaker flag only set during move execution
      // Source: Showdown data/abilities.ts -- moldbreaker: "Prevents the target's ability from affecting battle mechanics"
      //
      // Strategy: Compare Simple +1 vs Mold Breaker defender
      //   against no-ability +2 vs normal defender.
      //   Defender's Mold Breaker does NOT suppress Simple → damage matches doubled +2.
      const simpleAttacker = createActivePokemon({
        ability: "simple",
        attack: 100,
        statStages: { attack: 1 }, // Simple doubles this to effective +2
      });
      const moldBreakerDefender = createActivePokemon({
        ability: "mold-breaker",
        defense: 100,
      });

      // Control: attacker with +2 stages (no Simple), normal defender
      const doubledAttacker = createActivePokemon({
        attack: 100,
        statStages: { attack: 2 }, // Explicit +2 without Simple
      });
      const normalDefender = createActivePokemon({
        defense: 100,
      });

      const move = createMove({ type: "normal", power: 80 });

      const moldBreakerResult = calculateGen4Damage(
        createDamageContext({
          attacker: simpleAttacker,
          defender: moldBreakerDefender,
          move,
        }),
        GEN4_TYPE_CHART,
      );

      const doubledResult = calculateGen4Damage(
        createDamageContext({
          attacker: doubledAttacker,
          defender: normalDefender,
          move,
        }),
        GEN4_TYPE_CHART,
      );

      // Defender's Mold Breaker does NOT suppress attacker's Simple — stages are doubled
      expect(moldBreakerResult.damage).toBe(doubledResult.damage);
    });

    it("given defender WITHOUT Mold Breaker, when attacker has Simple at +1 Attack, then Attack stages ARE doubled", () => {
      // Source: Bulbapedia — Simple: "Doubles the effects of stat stage changes"
      // Source: Showdown Gen 4 — Simple doubles stat stages in damage calc
      //
      // Control test: without Mold Breaker, Simple should double +1 to +2.
      const simpleAttacker = createActivePokemon({
        ability: "simple",
        attack: 100,
        statStages: { attack: 1 },
      });
      const normalDefender = createActivePokemon({
        defense: 100,
      });

      const referenceAttacker = createActivePokemon({
        attack: 100,
        statStages: { attack: 2 }, // What Simple +1 should effectively be
      });

      const move = createMove({ type: "normal", power: 80 });

      const simpleResult = calculateGen4Damage(
        createDamageContext({
          attacker: simpleAttacker,
          defender: normalDefender,
          move,
        }),
        GEN4_TYPE_CHART,
      );

      const referenceResult = calculateGen4Damage(
        createDamageContext({
          attacker: referenceAttacker,
          defender: normalDefender,
          move,
        }),
        GEN4_TYPE_CHART,
      );

      // Simple +1 = effective +2 → damage should match +2 reference
      expect(simpleResult.damage).toBe(referenceResult.damage);
    });
  });
});
