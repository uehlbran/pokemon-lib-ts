import type { ActivePokemon, BattleState } from "@pokemon-lib-ts/battle";
import {
  CORE_ABILITY_IDS,
  CORE_STATUS_IDS,
  CORE_TYPE_IDS,
  CORE_VOLATILE_IDS,
  type PrimaryStatus,
  SeededRandom,
} from "@pokemon-lib-ts/core";
import { describe, expect, it } from "vitest";
import { GEN5_ABILITY_IDS } from "../src";
import { Gen5Ruleset } from "../src/Gen5Ruleset";

const ABILITIES = { ...CORE_ABILITY_IDS, ...GEN5_ABILITY_IDS };
const STATUSES = CORE_STATUS_IDS;
const VOLATILES = CORE_VOLATILE_IDS;

/**
 * Helper: create a minimal ActivePokemon mock for status tests.
 */
function createOnFieldPokemon(overrides: {
  maxHp?: number;
  currentHp?: number;
  status?: PrimaryStatus | null;
  ability?: string;
  volatileStatuses?: Map<string, { turnsLeft: number; data?: Record<string, unknown> }>;
}): ActivePokemon {
  const maxHp = overrides.maxHp ?? 200;
  return {
    pokemon: {
      calculatedStats: { hp: maxHp },
      currentHp: overrides.currentHp ?? maxHp,
      status: overrides.status ?? null,
    },
    ability: overrides.ability ?? ABILITIES.blaze,
    volatileStatuses: overrides.volatileStatuses ?? new Map(),
    types: [CORE_TYPE_IDS.normal],
    statStages: {
      attack: 0,
      defense: 0,
      spAttack: 0,
      spDefense: 0,
      speed: 0,
      accuracy: 0,
      evasion: 0,
    },
  } as unknown as ActivePokemon;
}

function createBattleState(): BattleState {
  return {} as unknown as BattleState;
}

describe("Gen5Ruleset status conditions", () => {
  const ruleset = new Gen5Ruleset();

  // --- Sleep ---

  describe(STATUSES.sleep, () => {
    it("given sleeping pokemon in Gen5, when rollSleepTurns is called, then returns value in [1, 3]", () => {
      // Source: references/pokemon-showdown/data/mods/gen5/conditions.ts -- slp duration 1-3 turns
      // Gen 5+: sleep lasts 1-3 turns (BaseRuleset default)
      const rng = new SeededRandom(42);
      const results = new Set<number>();
      for (let i = 0; i < 200; i++) {
        const turns = ruleset.rollSleepTurns(rng);
        expect(turns).toBeGreaterThanOrEqual(1);
        expect(turns).toBeLessThanOrEqual(3);
        results.add(turns);
      }
      // Should see all possible values with enough rolls
      // Source: references/pokemon-showdown/data/mods/gen5/conditions.ts -- sleep duration is 1, 2, or 3 turns (3 distinct values)
      expect(results.size).toBe(3);
    });

    it("given sleeping pokemon in Gen5, when rollSleepTurns is called with different seed, then returns value in [1, 3]", () => {
      // Source: references/pokemon-showdown/data/mods/gen5/conditions.ts -- slp duration 1-3 turns
      // Triangulation case with different seed
      const rng = new SeededRandom(12345);
      for (let i = 0; i < 50; i++) {
        const turns = ruleset.rollSleepTurns(rng);
        expect(turns).toBeGreaterThanOrEqual(1);
        expect(turns).toBeLessThanOrEqual(3);
      }
    });

    it("given sleeping pokemon in Gen5 switching in, when onSwitchIn fires, then sleep counter resets to initial value", () => {
      // Source: references/pokemon-showdown/data/mods/gen5/conditions.ts -- slp.onSwitchIn resets effectState.time
      // Gen 5 unique mechanic: sleep counter resets on switch-in
      const rng = new SeededRandom(42);
      const initialTurns = ruleset.rollSleepTurns(rng);
      const sleepCounter = { turnsLeft: 1, data: { startTime: initialTurns } };
      const pokemon = createOnFieldPokemon({
        status: STATUSES.sleep,
        volatileStatuses: new Map([[VOLATILES.sleepCounter, sleepCounter]]),
      });
      const state = createBattleState();

      // Simulate switch-in: the sleep counter should reset
      ruleset.onSwitchIn(pokemon, state);

      const resetCounter = pokemon.volatileStatuses.get(VOLATILES.sleepCounter);
      // After reset, turnsLeft should be back to startTime
      // Source: references/pokemon-showdown/data/mods/gen5/conditions.ts -- slp.onSwitchIn sets effectState.time = startTime
      expect(resetCounter?.turnsLeft).toBe(initialTurns);
    });

    it("given sleeping pokemon in Gen5, when processSleepTurn fires and counter reaches 0, then can act on wake turn", () => {
      // Source: references/pokemon-showdown/data/conditions.ts -- slp.onBeforeMove: when time <= 0, calls cureStatus() then returns (no return false)
      // Gen 5+ can act on the wake turn; Gen 1-4 Showdown returns false (cannot act)
      const pokemon = createOnFieldPokemon({
        status: STATUSES.sleep,
        volatileStatuses: new Map([[VOLATILES.sleepCounter, { turnsLeft: 1 }]]),
      });
      const state = createBattleState();

      // Process: should decrement from 1 to 0 and wake up
      const canAct = ruleset.processSleepTurn(pokemon, state);
      // Source: references/pokemon-showdown/data/conditions.ts -- slp.onBeforeMove returns undefined (not false) when waking; pokemon can act
      expect(canAct).toBe(true);
      expect(pokemon.pokemon.status).toBeNull();
    });
  });

  // --- Burn ---

  describe(STATUSES.burn, () => {
    it("given burned pokemon in Gen5, when applyStatusDamage is called with 200 max HP, then takes 25 damage (1/8)", () => {
      // Source: Bulbapedia -- burn damage 1/8 HP in Gen 5 (changed to 1/16 in Gen 7)
      const pokemon = createOnFieldPokemon({ maxHp: 200 });
      const state = createBattleState();
      const damage = ruleset.applyStatusDamage(pokemon, STATUSES.burn, state);
      // 200 / 8 = 25
      expect(damage).toBe(25);
    });

    it("given burned pokemon in Gen5, when applyStatusDamage is called with 100 max HP, then takes 12 damage (1/8)", () => {
      // Source: Bulbapedia -- burn damage 1/8 HP in Gen 5 (changed to 1/16 in Gen 7)
      // Triangulation case
      const pokemon = createOnFieldPokemon({ maxHp: 100 });
      const state = createBattleState();
      const damage = ruleset.applyStatusDamage(pokemon, STATUSES.burn, state);
      // floor(100 / 8) = 12
      expect(damage).toBe(12);
    });

    it("given burned pokemon in Gen5 with 1 max HP, when applyStatusDamage is called, then takes at least 1 damage", () => {
      // Source: All status damage has a minimum of 1
      const pokemon = createOnFieldPokemon({ maxHp: 1 });
      const state = createBattleState();
      const damage = ruleset.applyStatusDamage(pokemon, STATUSES.burn, state);
      expect(damage).toBe(1);
    });
  });

  // --- Paralysis ---

  describe(STATUSES.paralysis, () => {
    it("given paralyzed pokemon in Gen5, when checkFullParalysis is called, then returns true with 25% chance", () => {
      // Source: BaseRuleset.checkFullParalysis() -- 25% (unchanged Gen 5)
      const rng = new SeededRandom(42);
      let trueCount = 0;
      const iterations = 1000;
      const pokemon = createOnFieldPokemon({ status: STATUSES.paralysis });

      for (let i = 0; i < iterations; i++) {
        if (ruleset.checkFullParalysis(pokemon, rng)) {
          trueCount++;
        }
      }

      // Tolerance derivation: Binomial(n=1000, p=0.25) → std dev = sqrt(1000*0.25*0.75) ≈ 13.7
      // 3σ interval ≈ ±41 counts → ratio range [0.209, 0.291]; using ±0.07 gives comfortable margin
      const ratio = trueCount / iterations;
      expect(ratio).toBeGreaterThan(0.18);
      expect(ratio).toBeLessThan(0.32);
    });

    it("given paralyzed pokemon in Gen5, when checkFullParalysis with different seed, then also approximates 25%", () => {
      // Source: BaseRuleset.checkFullParalysis() -- 25% (unchanged Gen 5)
      // Triangulation case
      const rng = new SeededRandom(99999);
      let trueCount = 0;
      const iterations = 1000;
      const pokemon = createOnFieldPokemon({ status: STATUSES.paralysis });

      for (let i = 0; i < iterations; i++) {
        if (ruleset.checkFullParalysis(pokemon, rng)) {
          trueCount++;
        }
      }

      // Tolerance derivation: Binomial(n=1000, p=0.25) → std dev ≈ 13.7; ±0.07 = ~5σ margin
      const ratio = trueCount / iterations;
      expect(ratio).toBeGreaterThan(0.18);
      expect(ratio).toBeLessThan(0.32);
    });
  });

  // --- Freeze ---

  describe(STATUSES.freeze, () => {
    it("given frozen pokemon in Gen5, when checkFreezeThaw is called, then returns true with 20% chance", () => {
      // Source: BaseRuleset.checkFreezeThaw() -- 20% (unchanged Gen 5)
      const rng = new SeededRandom(42);
      let thawCount = 0;
      const iterations = 1000;
      const pokemon = createOnFieldPokemon({ status: STATUSES.freeze });

      for (let i = 0; i < iterations; i++) {
        if (ruleset.checkFreezeThaw(pokemon, rng)) {
          thawCount++;
        }
      }

      // Tolerance derivation: Binomial(n=1000, p=0.20) → std dev = sqrt(1000*0.2*0.8) ≈ 12.6
      // 3σ interval ≈ ±38 counts → ratio range [0.162, 0.238]; using ±0.07 gives comfortable margin
      const ratio = thawCount / iterations;
      expect(ratio).toBeGreaterThan(0.13);
      expect(ratio).toBeLessThan(0.27);
    });

    it("given frozen pokemon in Gen5, when checkFreezeThaw with different seed, then also approximates 20%", () => {
      // Source: BaseRuleset.checkFreezeThaw() -- 20% (unchanged Gen 5)
      // Triangulation case
      const rng = new SeededRandom(77777);
      let thawCount = 0;
      const iterations = 1000;
      const pokemon = createOnFieldPokemon({ status: STATUSES.freeze });

      for (let i = 0; i < iterations; i++) {
        if (ruleset.checkFreezeThaw(pokemon, rng)) {
          thawCount++;
        }
      }

      // Tolerance derivation: Binomial(n=1000, p=0.20) → std dev ≈ 12.6; ±0.07 = ~5.5σ margin
      const ratio = thawCount / iterations;
      expect(ratio).toBeGreaterThan(0.13);
      expect(ratio).toBeLessThan(0.27);
    });
  });

  // --- Poison ---

  describe(STATUSES.poison, () => {
    it("given poisoned pokemon in Gen5, when applyStatusDamage with 160 max HP, then takes 20 damage (1/8)", () => {
      // Source: Standard poison mechanics -- 1/8 max HP per turn (consistent Gen 3+)
      const pokemon = createOnFieldPokemon({ maxHp: 160 });
      const state = createBattleState();
      const damage = ruleset.applyStatusDamage(pokemon, STATUSES.poison, state);
      // floor(160 / 8) = 20
      expect(damage).toBe(20);
    });

    it("given poisoned pokemon in Gen5, when applyStatusDamage with 200 max HP, then takes 25 damage (1/8)", () => {
      // Source: Standard poison mechanics -- 1/8 max HP per turn (consistent Gen 3+)
      // Triangulation case
      const pokemon = createOnFieldPokemon({ maxHp: 200 });
      const state = createBattleState();
      const damage = ruleset.applyStatusDamage(pokemon, STATUSES.poison, state);
      // floor(200 / 8) = 25
      expect(damage).toBe(25);
    });
  });

  // --- Toxic (Badly Poisoned) ---

  describe(`${STATUSES.badlyPoisoned} (toxic)`, () => {
    it("given badly-poisoned (toxic) pokemon in Gen5 at toxic counter 3, when applyStatusDamage with 160 max HP, then takes 30 damage (3/16)", () => {
      // Source: Toxic increments: N/16 where N is the counter value
      const pokemon = createOnFieldPokemon({
        maxHp: 160,
        volatileStatuses: new Map([
          [VOLATILES.toxicCounter, { turnsLeft: 99, data: { counter: 3 } }],
        ]),
      });
      const state = createBattleState();
      const damage = ruleset.applyStatusDamage(pokemon, STATUSES.badlyPoisoned, state);
      // floor(160 * 3 / 16) = floor(30) = 30
      expect(damage).toBe(30);
    });

    it("given badly-poisoned (toxic) pokemon in Gen5 at toxic counter 1, when applyStatusDamage with 160 max HP, then takes 10 damage (1/16)", () => {
      // Source: Toxic increments: N/16 where N is the counter value (counter starts at 1)
      // Triangulation case
      const pokemon = createOnFieldPokemon({
        maxHp: 160,
        volatileStatuses: new Map([
          [VOLATILES.toxicCounter, { turnsLeft: 99, data: { counter: 1 } }],
        ]),
      });
      const state = createBattleState();
      const damage = ruleset.applyStatusDamage(pokemon, STATUSES.badlyPoisoned, state);
      // floor(160 * 1 / 16) = floor(10) = 10
      expect(damage).toBe(10);
    });

    it("given badly-poisoned pokemon, when applyStatusDamage called, then toxic counter increments", () => {
      // Source: Toxic counter increments by 1 each turn (handled by BaseRuleset)
      const toxicState = { turnsLeft: 99, data: { counter: 2 } };
      const pokemon = createOnFieldPokemon({
        maxHp: 160,
        volatileStatuses: new Map([[VOLATILES.toxicCounter, toxicState]]),
      });
      const state = createBattleState();
      ruleset.applyStatusDamage(pokemon, STATUSES.badlyPoisoned, state);
      // Counter should have incremented from 2 to 3
      // Source: references/pokemon-showdown/sim/battle-actions.ts -- toxic counter increments each turn
      expect((toxicState.data as Record<string, unknown>).counter).toBe(3);
    });
  });

  // --- Confusion ---

  describe(VOLATILES.confusion, () => {
    it("given confused pokemon in Gen5, when getConfusionSelfHitChance is called, then returns 0.5", () => {
      // Source: Gen 1-6 confusion self-hit is 50% (Gen 7+ reduced to 33%)
      expect(ruleset.getConfusionSelfHitChance()).toBe(0.5);
    });

    it("given confused pokemon in Gen5, when rollConfusionSelfHit is called, then approximately 50% hit themselves", () => {
      // Source: Gen 1-6 confusion self-hit is 50% (Gen 7+ reduced to 33%)
      const rng = new SeededRandom(42);
      let hitCount = 0;
      const iterations = 1000;
      for (let i = 0; i < iterations; i++) {
        if (ruleset.rollConfusionSelfHit(rng)) {
          hitCount++;
        }
      }
      // Tolerance derivation: Binomial(n=1000, p=0.50) → std dev = sqrt(1000*0.5*0.5) ≈ 15.8
      // 3σ interval ≈ ±47 counts → ratio range [0.453, 0.547]; using ±0.07 gives comfortable margin
      const ratio = hitCount / iterations;
      expect(ratio).toBeGreaterThan(0.43);
      expect(ratio).toBeLessThan(0.57);
    });
  });
});
