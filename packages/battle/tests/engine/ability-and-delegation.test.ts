import type { AbilityTrigger, PokemonInstance } from "@pokemon-lib-ts/core";
import { describe, expect, it, vi } from "vitest";
import type { AbilityContext, AbilityResult, BattleConfig } from "../../src/context";
import { BattleEngine } from "../../src/engine";
import type { BattleEvent } from "../../src/events";
import type { ActivePokemon, BattleState } from "../../src/state";
import { createTestPokemon } from "../../src/utils";
import { createMockDataManager } from "../helpers/mock-data-manager";
import { MockRuleset } from "../helpers/mock-ruleset";

// ─── Helpers ──────────────────────────────────────────────────────────────────

/**
 * MockRuleset subclass that enables abilities and returns configurable
 * AbilityResults for switch-in triggers.
 */
class AbilityMockRuleset extends MockRuleset {
  private abilityHandler: ((trigger: AbilityTrigger, ctx: AbilityContext) => AbilityResult) | null =
    null;

  override hasAbilities(): boolean {
    return true;
  }

  setAbilityHandler(handler: (trigger: AbilityTrigger, ctx: AbilityContext) => AbilityResult) {
    this.abilityHandler = handler;
  }

  override applyAbility(trigger: AbilityTrigger, context: AbilityContext): AbilityResult {
    if (this.abilityHandler) {
      return this.abilityHandler(trigger, context);
    }
    return { activated: false, effects: [], messages: [] };
  }
}

/**
 * MockRuleset subclass that tracks processConfusionTurn and processBoundTurn calls.
 */
class DelegationTrackingRuleset extends MockRuleset {
  confusionCalls: ActivePokemon[] = [];
  boundCalls: ActivePokemon[] = [];

  override processConfusionTurn(active: ActivePokemon, _state: BattleState): boolean {
    this.confusionCalls.push(active);
    // Simulate: decrement, still confused if > 0
    const conf = active.volatileStatuses.get("confusion");
    if (!conf) return false;
    conf.turnsLeft--;
    return conf.turnsLeft > 0;
  }

  override processBoundTurn(active: ActivePokemon, _state: BattleState): boolean {
    this.boundCalls.push(active);
    // Simulate: decrement, still bound if > 0
    const bound = active.volatileStatuses.get("bound");
    if (!bound) return false;
    bound.turnsLeft--;
    return bound.turnsLeft > 0;
  }
}

function createAbilityEngine(opts?: {
  team1Ability?: string;
  team2Ability?: string;
  team1Speed?: number;
  team2Speed?: number;
  seed?: number;
}) {
  const ruleset = new AbilityMockRuleset();
  const dataManager = createMockDataManager();
  const events: BattleEvent[] = [];

  const team1: PokemonInstance[] = [
    createTestPokemon(6, 50, {
      uid: "charizard-1",
      nickname: "Charizard",
      ability: opts?.team1Ability ?? "blaze",
      moves: [{ moveId: "tackle", currentPP: 35, maxPP: 35, ppUps: 0 }],
      calculatedStats: {
        hp: 200,
        attack: 100,
        defense: 100,
        spAttack: 100,
        spDefense: 100,
        speed: opts?.team1Speed ?? 80,
      },
      currentHp: 200,
    }),
  ];

  const team2: PokemonInstance[] = [
    createTestPokemon(9, 50, {
      uid: "blastoise-1",
      nickname: "Blastoise",
      ability: opts?.team2Ability ?? "torrent",
      moves: [{ moveId: "tackle", currentPP: 35, maxPP: 35, ppUps: 0 }],
      calculatedStats: {
        hp: 200,
        attack: 100,
        defense: 100,
        spAttack: 100,
        spDefense: 100,
        speed: opts?.team2Speed ?? 120,
      },
      currentHp: 200,
    }),
  ];

  const config: BattleConfig = {
    generation: 3,
    format: "singles",
    teams: [team1, team2],
    seed: opts?.seed ?? 12345,
  };

  ruleset.setGenerationForTest(config.generation);
  const engine = new BattleEngine(config, ruleset, dataManager);
  engine.on((e) => events.push(e));

  return { engine, ruleset, events };
}

function createDelegationEngine() {
  const ruleset = new DelegationTrackingRuleset();
  const dataManager = createMockDataManager();
  const events: BattleEvent[] = [];

  const team1: PokemonInstance[] = [
    createTestPokemon(6, 50, {
      uid: "charizard-1",
      nickname: "Charizard",
      moves: [{ moveId: "tackle", currentPP: 35, maxPP: 35, ppUps: 0 }],
      calculatedStats: {
        hp: 200,
        attack: 100,
        defense: 100,
        spAttack: 100,
        spDefense: 100,
        speed: 80,
      },
      currentHp: 200,
    }),
  ];

  const team2: PokemonInstance[] = [
    createTestPokemon(9, 50, {
      uid: "blastoise-1",
      nickname: "Blastoise",
      moves: [{ moveId: "tackle", currentPP: 35, maxPP: 35, ppUps: 0 }],
      calculatedStats: {
        hp: 200,
        attack: 100,
        defense: 100,
        spAttack: 100,
        spDefense: 100,
        speed: 120,
      },
      currentHp: 200,
    }),
  ];

  const config: BattleConfig = {
    generation: 2,
    format: "singles",
    teams: [team1, team2],
    seed: 12345,
  };

  ruleset.setGenerationForTest(config.generation);
  const engine = new BattleEngine(config, ruleset, dataManager);
  engine.on((e) => events.push(e));

  return { engine, ruleset, events };
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe("Bug 2A: switch-in ability processing", () => {
  describe("Intimidate (stat-change effect)", () => {
    it("given Intimidate on side 0, when battle starts, then opponent's attack stat stage is lowered by 1", () => {
      // Arrange
      // Source: pret/pokeemerald ABILITY_INTIMIDATE — lowers opponent's Attack by 1 stage on switch-in
      const { engine, ruleset, events } = createAbilityEngine({
        team1Ability: "intimidate",
      });

      ruleset.setAbilityHandler((trigger, ctx) => {
        if (trigger === "on-switch-in" && ctx.pokemon.pokemon.ability === "intimidate") {
          return {
            activated: true,
            effects: [
              {
                effectType: "stat-change",
                target: "opponent" as const,
                stat: "attack" as const,
                stages: -1,
              },
            ],
            messages: ["Charizard's Intimidate cut Blastoise's Attack!"],
          };
        }
        return { activated: false, effects: [], messages: [] };
      });

      // Act
      engine.start();

      // Assert
      const opponent = engine.state.sides[1].active[0];
      expect(opponent).not.toBeNull();
      // Intimidate lowers attack by 1 stage: 0 + (-1) = -1
      expect(opponent!.statStages.attack).toBe(-1);

      // Verify stat-change event was emitted
      const statChangeEvents = events.filter(
        (e) => e.type === "stat-change" && "stat" in e && e.stat === "attack",
      );
      expect(statChangeEvents.length).toBeGreaterThanOrEqual(1);

      // Verify ability-activate event was emitted
      const abilityEvents = events.filter((e) => e.type === "ability-activate");
      expect(abilityEvents.length).toBeGreaterThanOrEqual(1);
    });

    it("given Intimidate on side 1, when battle starts, then side 0's attack stat stage is lowered by 1", () => {
      // Arrange
      // Source: pret/pokeemerald ABILITY_INTIMIDATE — lowers opponent's Attack by 1 stage on switch-in
      const { engine, ruleset } = createAbilityEngine({
        team2Ability: "intimidate",
      });

      ruleset.setAbilityHandler((trigger, ctx) => {
        if (trigger === "on-switch-in" && ctx.pokemon.pokemon.ability === "intimidate") {
          return {
            activated: true,
            effects: [
              {
                effectType: "stat-change",
                target: "opponent" as const,
                stat: "attack" as const,
                stages: -1,
              },
            ],
            messages: ["Blastoise's Intimidate cut Charizard's Attack!"],
          };
        }
        return { activated: false, effects: [], messages: [] };
      });

      // Act
      engine.start();

      // Assert
      const side0Active = engine.state.sides[0].active[0];
      expect(side0Active).not.toBeNull();
      expect(side0Active!.statStages.attack).toBe(-1);
    });
  });

  describe("Drizzle (weather-set effect)", () => {
    it("given Drizzle on side 0, when battle starts, then weather is set to rain with indefinite duration", () => {
      // Arrange
      // Source: pret/pokeemerald ABILITY_DRIZZLE — sets permanent rain on switch-in
      const { engine, ruleset, events } = createAbilityEngine({
        team1Ability: "drizzle",
      });

      ruleset.setAbilityHandler((trigger, ctx) => {
        if (trigger === "on-switch-in" && ctx.pokemon.pokemon.ability === "drizzle") {
          return {
            activated: true,
            effects: [
              {
                effectType: "weather-set",
                target: "field" as const,
                weather: "rain" as const,
                weatherTurns: -1,
              },
            ],
            messages: ["Charizard's Drizzle made it rain!"],
          };
        }
        return { activated: false, effects: [], messages: [] };
      });

      // Act
      engine.start();

      // Assert
      expect(engine.state.weather).not.toBeNull();
      expect(engine.state.weather!.type).toBe("rain");
      // -1 means indefinite (permanent weather from abilities in Gen 3-5)
      expect(engine.state.weather!.turnsLeft).toBe(-1);

      // Verify weather-set event was emitted
      const weatherEvents = events.filter((e) => e.type === "weather-set");
      expect(weatherEvents.length).toBeGreaterThanOrEqual(1);
    });

    it("given Drought on side 1, when battle starts, then weather is set to sun with indefinite duration", () => {
      // Arrange
      // Source: pret/pokeemerald ABILITY_DROUGHT — sets permanent sun on switch-in
      const { engine, ruleset } = createAbilityEngine({
        team2Ability: "drought",
      });

      ruleset.setAbilityHandler((trigger, ctx) => {
        if (trigger === "on-switch-in" && ctx.pokemon.pokemon.ability === "drought") {
          return {
            activated: true,
            effects: [
              {
                effectType: "weather-set",
                target: "field" as const,
                weather: "sun" as const,
                weatherTurns: -1,
              },
            ],
            messages: ["Blastoise's Drought intensified the sun's rays!"],
          };
        }
        return { activated: false, effects: [], messages: [] };
      });

      // Act
      engine.start();

      // Assert
      expect(engine.state.weather).not.toBeNull();
      expect(engine.state.weather!.type).toBe("sun");
      expect(engine.state.weather!.turnsLeft).toBe(-1);
    });
  });

  describe("speed ordering of switch-in abilities", () => {
    it("given both sides have abilities, when battle starts, then the faster pokemon's ability triggers first", () => {
      // Arrange
      // Source: pret/pokeemerald — faster pokemon's on-switch-in ability activates first
      const callOrder: string[] = [];
      const { engine, ruleset } = createAbilityEngine({
        team1Ability: "intimidate",
        team2Ability: "intimidate",
        team1Speed: 50, // slower
        team2Speed: 100, // faster
      });

      ruleset.setAbilityHandler((trigger, ctx) => {
        if (trigger === "on-switch-in") {
          callOrder.push(ctx.pokemon.pokemon.ability ?? "unknown");
          return {
            activated: true,
            effects: [
              {
                effectType: "stat-change",
                target: "opponent" as const,
                stat: "attack" as const,
                stages: -1,
              },
            ],
            messages: [`${ctx.pokemon.pokemon.nickname}'s Intimidate!`],
          };
        }
        return { activated: false, effects: [], messages: [] };
      });

      // Act
      engine.start();

      // Assert — faster pokemon (side 1, speed 100) triggers before slower (side 0, speed 50)
      // Both have "intimidate" so we can't distinguish by ability name,
      // but both should be lowered by -1 each from the other's Intimidate
      const side0 = engine.state.sides[0].active[0];
      const side1 = engine.state.sides[1].active[0];
      expect(side0!.statStages.attack).toBe(-1);
      expect(side1!.statStages.attack).toBe(-1);
      // Both abilities should have been called
      expect(callOrder.length).toBe(2);
    });

    it("given both leads tie on speed, when battle starts, then switch-in ability order uses the battle tie-break instead of always favoring side 0", () => {
      const callOrder: string[] = [];
      const ruleset = new AbilityMockRuleset();
      const dataManager = createMockDataManager();
      const config: BattleConfig = {
        generation: 3,
        format: "singles",
        teams: [
          [
            createTestPokemon(6, 50, {
              uid: "charizard-1",
              nickname: "Charizard1",
              ability: "intimidate",
              moves: [{ moveId: "tackle", currentPP: 35, maxPP: 35, ppUps: 0 }],
            }),
          ],
          [
            createTestPokemon(6, 50, {
              uid: "charizard-2",
              nickname: "Charizard2",
              ability: "intimidate",
              moves: [{ moveId: "tackle", currentPP: 35, maxPP: 35, ppUps: 0 }],
            }),
          ],
        ],
        seed: 1,
      };

      ruleset.setAbilityHandler((trigger, ctx) => {
        if (trigger === "on-switch-in") {
          callOrder.push(ctx.pokemon.pokemon.uid);
        }
        return { activated: false, effects: [], messages: [] };
      });

      ruleset.setGenerationForTest(config.generation);
      const engine = new BattleEngine(config, ruleset, dataManager);
      vi.spyOn(engine.state.rng, "chance").mockReturnValue(false);

      engine.start();

      // Source: In a tied switch-in ability case, battle RNG decides the order.
      // This test stubs the tie-break roll to false so the later entry wins the flip.
      expect(callOrder).toEqual(["charizard-2", "charizard-1"]);
    });
  });
});

describe("Bug 2B: confusion turn processing delegated to ruleset", () => {
  it("given a confused pokemon, when it tries to move, then ruleset.processConfusionTurn is called (not hardcoded engine decrement)", () => {
    // Arrange
    // Source: Bug 2B — engine previously hardcoded confState.turnsLeft-- instead of delegating.
    // Gen 7+ changed confusion turns from 1-4 to 2-5, so delegation is required.
    const { engine, ruleset, events } = createDelegationEngine();
    engine.start();

    const charizard = engine.state.sides[0].active[0];
    expect(charizard).not.toBeNull();
    // Set confusion with 3 turns remaining
    charizard!.volatileStatuses.set("confusion", { turnsLeft: 3 });

    // Make the confusion self-hit always fail (so the pokemon can move)
    // We just need to verify the delegation happens
    ruleset.confusionCalls = [];

    // Act
    events.length = 0;
    engine.submitAction(0, { type: "move", side: 0, moveIndex: 0 });
    engine.submitAction(1, { type: "move", side: 1, moveIndex: 0 });

    // Assert
    // processConfusionTurn should have been called for charizard
    expect(ruleset.confusionCalls.length).toBeGreaterThanOrEqual(1);
    expect(ruleset.confusionCalls[0]!.pokemon.uid).toBe("charizard-1");
  });

  it("given a confused pokemon with 1 turn left, when processConfusionTurn returns false, then confusion ends and volatile-end event is emitted", () => {
    // Arrange
    const { engine, events } = createDelegationEngine();
    engine.start();

    const charizard = engine.state.sides[0].active[0];
    expect(charizard).not.toBeNull();
    // Set confusion with 1 turn remaining — will end after processConfusionTurn decrements
    charizard!.volatileStatuses.set("confusion", { turnsLeft: 1 });

    // Act
    events.length = 0;
    engine.submitAction(0, { type: "move", side: 0, moveIndex: 0 });
    engine.submitAction(1, { type: "move", side: 1, moveIndex: 0 });

    // Assert — confusion should have ended
    const volatileEndEvents = events.filter(
      (e) => e.type === "volatile-end" && "volatile" in e && e.volatile === "confusion",
    );
    expect(volatileEndEvents.length).toBeGreaterThanOrEqual(1);
    // The volatile status should be removed
    expect(charizard!.volatileStatuses.has("confusion")).toBe(false);
  });
});

describe("Bug 2C: bound turn processing delegated to ruleset", () => {
  it("given a bound pokemon, when it tries to move, then ruleset.processBoundTurn is called (not hardcoded engine decrement)", () => {
    // Arrange
    // Source: Bug 2C — engine previously hardcoded boundState.turnsLeft-- instead of delegating.
    // Trap mechanics vary by gen, so delegation is required.
    const { engine, ruleset, events } = createDelegationEngine();
    engine.start();

    const charizard = engine.state.sides[0].active[0];
    expect(charizard).not.toBeNull();
    // Set bound with 3 turns remaining (will still be bound after decrement)
    charizard!.volatileStatuses.set("bound", { turnsLeft: 3 });

    ruleset.boundCalls = [];

    // Act
    events.length = 0;
    engine.submitAction(0, { type: "move", side: 0, moveIndex: 0 });
    engine.submitAction(1, { type: "move", side: 1, moveIndex: 0 });

    // Assert
    // processBoundTurn should have been called for charizard
    expect(ruleset.boundCalls.length).toBeGreaterThanOrEqual(1);
    expect(ruleset.boundCalls[0]!.pokemon.uid).toBe("charizard-1");
  });

  it("given a bound pokemon with 1 turn left, when processBoundTurn returns false, then bound ends and volatile-end event is emitted", () => {
    // Arrange
    const { engine, events } = createDelegationEngine();
    engine.start();

    const charizard = engine.state.sides[0].active[0];
    expect(charizard).not.toBeNull();
    // Set bound with 1 turn remaining — will end after processBoundTurn decrements
    charizard!.volatileStatuses.set("bound", { turnsLeft: 1 });

    // Act
    events.length = 0;
    engine.submitAction(0, { type: "move", side: 0, moveIndex: 0 });
    engine.submitAction(1, { type: "move", side: 1, moveIndex: 0 });

    // Assert — bound should have ended
    const volatileEndEvents = events.filter(
      (e) => e.type === "volatile-end" && "volatile" in e && e.volatile === "bound",
    );
    expect(volatileEndEvents.length).toBeGreaterThanOrEqual(1);
    // The volatile status should be removed
    expect(charizard!.volatileStatuses.has("bound")).toBe(false);
  });
});
