import type { AbilityTrigger, PokemonInstance } from "@pokemon-lib-ts/core";
import { describe, expect, it } from "vitest";
import type { AbilityContext, BattleConfig, EndOfTurnEffect } from "../../src/context";
import { BattleEngine } from "../../src/engine";
import type { BattleEvent } from "../../src/events";
import { createTestPokemon } from "../../src/utils";
import { createMockDataManager } from "../helpers/mock-data-manager";
import { MockRuleset } from "../helpers/mock-ruleset";

// ---------------------------------------------------------------------------
// Bug #484: Speed Boost (and other EoT abilities) fire multiple times per turn
// ---------------------------------------------------------------------------

describe("Bug #484 — EoT ability deduplication", () => {
  /**
   * A mock ruleset that returns multiple EoT cases that all dispatch
   * applyAbility("on-turn-end") and tracks how many times applyAbility
   * is called with "on-turn-end".
   */
  class SpeedBoostMockRuleset extends MockRuleset {
    onTurnEndCallCount = 0;

    override getEndOfTurnOrder(): readonly EndOfTurnEffect[] {
      // Return multiple ability-dispatching EoT cases.
      // Before the fix, each of these would independently call
      // applyAbility("on-turn-end") for all active Pokemon.
      return ["weather-healing", "shed-skin", "speed-boost"];
    }

    override hasAbilities(): boolean {
      return true;
    }

    override applyAbility(trigger: AbilityTrigger, _context: AbilityContext) {
      if (trigger === "on-turn-end") {
        this.onTurnEndCallCount++;
        // Simulate Speed Boost: +1 speed to the Pokemon
        return {
          activated: true,
          effects: [
            {
              effectType: "stat-change" as const,
              target: "self" as const,
              stat: "speed" as const,
              stages: 1,
            },
          ],
          messages: ["Speed Boost activated!"],
        };
      }
      return { activated: false, effects: [], messages: [] };
    }
  }

  function createSpeedBoostEngine(overrides?: {
    seed?: number;
    team1?: PokemonInstance[];
    team2?: PokemonInstance[];
  }) {
    const ruleset = new SpeedBoostMockRuleset();
    const dataManager = createMockDataManager();
    const events: BattleEvent[] = [];

    const team1 = overrides?.team1 ?? [
      createTestPokemon(6, 50, {
        uid: "ninjask-1",
        nickname: "Ninjask",
        ability: "speed-boost",
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

    const team2 = overrides?.team2 ?? [
      createTestPokemon(9, 50, {
        uid: "snorlax-1",
        nickname: "Snorlax",
        ability: "thick-fat",
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

    const config: BattleConfig = {
      generation: 3,
      format: "singles",
      teams: [team1, team2],
      seed: overrides?.seed ?? 12345,
    };

    ruleset.setGenerationForTest(config.generation);
    const engine = new BattleEngine(config, ruleset, dataManager);
    engine.on((e) => events.push(e));

    return { engine, ruleset, events };
  }

  it("given a Pokemon with Speed Boost and 3 EoT ability-dispatching cases, when the turn ends, then applyAbility on-turn-end fires exactly once per Pokemon", () => {
    // Source: pret/pokeemerald src/battle_util.c — ABILITYEFFECT_ENDTURN fires once per Pokemon
    // Source: Bulbapedia — "Speed Boost raises Speed by 1 stage at the end of each turn"
    // Bug #484: before the fix, applyAbility("on-turn-end") fired once per EoT case
    // (weather-healing, shed-skin, speed-boost = 3 times). After the fix, it fires once.
    // Arrange
    const { engine, ruleset, events } = createSpeedBoostEngine();

    // Act
    engine.start();
    // Both sides attack each other
    engine.submitAction(0, { type: "move", side: 0, moveIndex: 0 });
    engine.submitAction(1, { type: "move", side: 1, moveIndex: 0 });

    // Assert: applyAbility("on-turn-end") should fire exactly once per active Pokemon
    // We have 2 active Pokemon (one per side), so exactly 2 calls total.
    // Before the fix this was 6 (3 EoT cases x 2 active Pokemon).
    // Source: pret/pokeemerald — each Pokemon's EoT ability fires once per turn
    expect(ruleset.onTurnEndCallCount).toBe(2);

    // The speed stat-change events should also be exactly 2 (one per active Pokemon)
    const speedBoostEvents = events.filter(
      (e) => e.type === "stat-change" && e.stat === "speed" && e.stages === 1,
    );
    expect(speedBoostEvents.length).toBe(2);
  });

  it("given a Pokemon with Speed Boost and 5 EoT ability-dispatching cases, when the turn ends, then speed stage increases by exactly +1", () => {
    // Source: pret/pokeemerald src/battle_util.c — ABILITYEFFECT_ENDTURN fires once per Pokemon
    // Source: Bulbapedia — Speed Boost raises Speed by 1 stage per turn, not N stages
    // Arrange: use a ruleset that returns 5 ability-dispatching EoT cases
    class FiveAbilityCasesRuleset extends SpeedBoostMockRuleset {
      override getEndOfTurnOrder(): readonly EndOfTurnEffect[] {
        return ["weather-healing", "shed-skin", "poison-heal", "bad-dreams", "speed-boost"];
      }
    }

    const ruleset = new FiveAbilityCasesRuleset();
    const dataManager = createMockDataManager();
    const events: BattleEvent[] = [];

    const team1 = [
      createTestPokemon(6, 50, {
        uid: "ninjask-1",
        nickname: "Ninjask",
        ability: "speed-boost",
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

    const team2 = [
      createTestPokemon(9, 50, {
        uid: "snorlax-1",
        nickname: "Snorlax",
        ability: "thick-fat",
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

    const config: BattleConfig = {
      generation: 3,
      format: "singles",
      teams: [team1, team2],
      seed: 99999,
    };

    ruleset.setGenerationForTest(config.generation);
    const engine = new BattleEngine(config, ruleset, dataManager);
    engine.on((e) => events.push(e));

    // Act
    engine.start();
    engine.submitAction(0, { type: "move", side: 0, moveIndex: 0 });
    engine.submitAction(1, { type: "move", side: 1, moveIndex: 0 });

    // Assert: still only 2 on-turn-end calls (one per active Pokemon, despite 5 EoT cases)
    // Before the fix: 10 calls (5 cases x 2 Pokemon). After: 2.
    expect(ruleset.onTurnEndCallCount).toBe(2);

    // Speed stage for Ninjask (side 0) should be +1, not +5
    const ninjaskSpeedBoosts = events.filter(
      (e) => e.type === "stat-change" && e.stat === "speed" && e.side === 0,
    );
    expect(ninjaskSpeedBoosts.length).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// Bug #494: Uproar wakes sleeping Pokemon unconditionally
// ---------------------------------------------------------------------------

describe("Bug #494 — Uproar wake condition", () => {
  /**
   * A mock ruleset that includes "uproar" in the EoT order so the uproar
   * handler fires during processEndOfTurn().
   */
  class UproarMockRuleset extends MockRuleset {
    override getEndOfTurnOrder(): readonly EndOfTurnEffect[] {
      return ["uproar"];
    }
  }

  function createUproarEngine(overrides?: { seed?: number }) {
    const ruleset = new UproarMockRuleset();
    const dataManager = createMockDataManager();
    const events: BattleEvent[] = [];

    // Side 0: Pokemon that will have uproar volatile
    const team1 = [
      createTestPokemon(6, 50, {
        uid: "exploud-1",
        nickname: "Exploud",
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

    // Side 1: Pokemon that is asleep
    const team2 = [
      createTestPokemon(9, 50, {
        uid: "snorlax-1",
        nickname: "Snorlax",
        status: "sleep",
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

    const config: BattleConfig = {
      generation: 3,
      format: "singles",
      teams: [team1, team2],
      seed: overrides?.seed ?? 12345,
    };

    ruleset.setGenerationForTest(config.generation);
    const engine = new BattleEngine(config, ruleset, dataManager);
    engine.on((e) => events.push(e));

    return { engine, ruleset, events };
  }

  it("given a Pokemon with uproar (1 turn remaining) and an asleep opponent, when the turn ends (uproar expires), then the opponent is NOT woken up", () => {
    // Source: Bulbapedia — Uproar prevents sleep while the user is in uproar
    // Bug #494: before the fix, sleeping Pokemon were woken even when uproar
    // expired on the same turn, because the wake check ran inside the same loop
    // as the decrement instead of checking afterwards.
    // Arrange
    const { engine, events } = createUproarEngine();
    engine.start();

    // Manually set up uproar volatile with 1 turn left on side 0's active Pokemon
    const side0Active = engine.getState().sides[0].active[0]!;
    side0Active.volatileStatuses.set("uproar" as any, { turnsLeft: 1 });

    // Ensure side 1 is asleep with enough sleep counter turns to stay asleep
    // through the turn resolution (processSleepTurn checks this volatile)
    const side1Active = engine.getState().sides[1].active[0]!;
    side1Active.pokemon.status = "sleep";
    side1Active.volatileStatuses.set("sleep-counter" as any, { turnsLeft: 5 });

    // Act: both sides use tackle, which triggers EoT processing
    engine.submitAction(0, { type: "move", side: 0, moveIndex: 0 });
    engine.submitAction(1, { type: "move", side: 1, moveIndex: 0 });

    // Assert: uproar ended (volatile-end emitted), and sleeper was NOT woken
    // by the uproar handler (sleep-cure events from normal turn processing are
    // separate; we check that no uproar-sourced wake happened)
    const volatileEndEvents = events.filter(
      (e) => e.type === "volatile-end" && e.volatile === "uproar",
    );
    expect(volatileEndEvents.length).toBe(1);

    // Filter for uproar-specific wake messages (not general sleep processing)
    const uproarWakeMessages = events.filter(
      (e) => e.type === "message" && typeof e.text === "string" && e.text.includes("uproar"),
    );
    // The only uproar message should be "uproar ended", not "woke up due to the uproar"
    const wakeMessages = uproarWakeMessages.filter(
      (e) => e.type === "message" && e.text.includes("woke up"),
    );
    expect(wakeMessages.length).toBe(0);

    // The opponent should still be asleep (the uproar handler should not have woken it)
    expect(side1Active.pokemon.status).toBe("sleep");
  });

  it("given a Pokemon with uproar (2 turns remaining) and an asleep opponent, when the turn ends (uproar still active), then the opponent IS woken up", () => {
    // Source: Bulbapedia — Uproar prevents sleep while the user is in uproar
    // When uproar is still active after decrement (2 -> 1), sleeping Pokemon should wake.
    // Arrange
    const { engine, events } = createUproarEngine();
    engine.start();

    // Set up uproar volatile with 2 turns left (will go to 1, still active)
    const side0Active = engine.getState().sides[0].active[0]!;
    side0Active.volatileStatuses.set("uproar" as any, { turnsLeft: 2 });

    // Ensure side 1 is asleep with enough turns to stay asleep through turn processing
    const side1Active = engine.getState().sides[1].active[0]!;
    side1Active.pokemon.status = "sleep";
    side1Active.volatileStatuses.set("sleep-counter" as any, { turnsLeft: 5 });

    // Act
    engine.submitAction(0, { type: "move", side: 0, moveIndex: 0 });
    engine.submitAction(1, { type: "move", side: 1, moveIndex: 0 });

    // Assert: uproar is still active (no volatile-end emitted)
    const volatileEndEvents = events.filter(
      (e) => e.type === "volatile-end" && e.volatile === "uproar",
    );
    expect(volatileEndEvents.length).toBe(0);

    // The sleeping opponent SHOULD be woken up since uproar is still active
    // Check for uproar-specific wake message
    const uproarWakeMessages = events.filter(
      (e) =>
        e.type === "message" &&
        typeof e.text === "string" &&
        e.text.includes("woke up due to the uproar"),
    );
    expect(uproarWakeMessages.length).toBe(1);

    // Snorlax should no longer be asleep
    expect(side1Active.pokemon.status).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Bug #879: Mystery Berry clears the held item without item-consumed
// ---------------------------------------------------------------------------

describe("Bug #879 — Mystery Berry item consumption event", () => {
  class MysteryBerryMockRuleset extends MockRuleset {
    override hasHeldItems(): boolean {
      return true;
    }

    override getEndOfTurnOrder(): readonly EndOfTurnEffect[] {
      return ["mystery-berry"];
    }
  }

  function createMysteryBerryEngine() {
    const ruleset = new MysteryBerryMockRuleset();
    const dataManager = createMockDataManager();
    const events: BattleEvent[] = [];

    const team1 = [
      createTestPokemon(6, 50, {
        uid: "charizard-1",
        nickname: "Charizard",
        heldItem: "mystery-berry",
        moves: [
          { moveId: "tackle", currentPP: 0, maxPP: 35, ppUps: 0 },
          { moveId: "growl", currentPP: 35, maxPP: 35, ppUps: 0 },
        ],
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

    const team2 = [
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
          speed: 80,
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

    return { engine, events };
  }

  it("given a Pokemon holding Mystery Berry with an empty move PP slot, when the turn ends, then PP is restored and item-consumed is emitted", () => {
    // Source: pret/pokecrystal engine/battle/core.asm:1328-1464 HandleMysteryberry
    const { engine, events } = createMysteryBerryEngine();

    engine.start();
    events.length = 0;

    engine.submitAction(0, { type: "move", side: 0, moveIndex: 1 });
    engine.submitAction(1, { type: "move", side: 1, moveIndex: 0 });

    const itemConsumed = events.find((e) => e.type === "item-consumed");
    expect(itemConsumed).toBeDefined();
    if (itemConsumed?.type === "item-consumed") {
      expect(itemConsumed.side).toBe(0);
      expect(itemConsumed.pokemon).toBe("Charizard");
      expect(itemConsumed.item).toBe("mystery-berry");
    }

    const active = engine.state.sides[0].active[0];
    expect(active?.pokemon.heldItem).toBeNull();
    expect(active?.pokemon.moves[0]?.currentPP).toBe(5);
  });
});

// ---------------------------------------------------------------------------
// Bug #514: Uproar wake-up bypasses Soundproof
// ---------------------------------------------------------------------------

/**
 * Bug #514: Uproar is a sound-based move/effect. Soundproof (Gen 3+) should
 * block Uproar from waking sleeping Pokemon, but the engine unconditionally
 * woke all sleeping Pokemon during the uproar EoT effect.
 *
 * Source: Bulbapedia — Soundproof protects from sound-based effects including Uproar
 * Source: Showdown sim/battle-actions.ts — Soundproof immunity to Uproar
 */
describe("Bug #514 — Uproar + Soundproof", () => {
  /**
   * MockRuleset subclass that enables abilities and includes uproar in EoT.
   */
  class UproarSoundproofMockRuleset extends MockRuleset {
    private abilityEnabled = false;

    enableAbilities(enabled: boolean) {
      this.abilityEnabled = enabled;
    }

    override hasAbilities(): boolean {
      return this.abilityEnabled;
    }

    override getEndOfTurnOrder(): readonly EndOfTurnEffect[] {
      return ["uproar"];
    }
  }

  function createUproarEngine(options?: { hasAbilities?: boolean }) {
    const ruleset = new UproarSoundproofMockRuleset();
    ruleset.enableAbilities(options?.hasAbilities ?? true);
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
          speed: 120,
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
          speed: 80,
        },
        currentHp: 200,
      }),
    ];

    const config: BattleConfig = {
      generation: 5,
      format: "singles",
      teams: [team1, team2],
      seed: 42,
    };

    ruleset.setGenerationForTest(config.generation);
    const engine = new BattleEngine(config, ruleset, dataManager);
    engine.on((e) => events.push(e));

    return { engine, ruleset, events };
  }

  it("given a sleeping Pokemon with soundproof ability, when uproar EoT fires, then Pokemon remains asleep", () => {
    // Arrange
    const { engine, events } = createUproarEngine({ hasAbilities: true });
    engine.start();

    // Set up: side 0 has uproar active, side 1 is asleep with Soundproof
    const side0Active = engine.getState().sides[0].active[0]!;
    side0Active.volatileStatuses.set("uproar" as any, { turnsLeft: 2 });

    const side1Active = engine.getState().sides[1].active[0]!;
    side1Active.pokemon.status = "sleep";
    side1Active.volatileStatuses.set("sleep-counter" as any, { turnsLeft: 5 });
    side1Active.ability = "soundproof";

    // Act
    engine.submitAction(0, { type: "move", side: 0, moveIndex: 0 });
    engine.submitAction(1, { type: "move", side: 1, moveIndex: 0 });

    // Assert — Soundproof blocks uproar wake-up; Pokemon remains asleep
    // Source: Bulbapedia — Soundproof blocks sound-based effects including Uproar
    expect(side1Active.pokemon.status).toBe("sleep");

    // No uproar-specific wake message for the Soundproof Pokemon
    const uproarWakeMessages = events.filter(
      (e) =>
        e.type === "message" &&
        typeof e.text === "string" &&
        e.text.includes("Blastoise") &&
        e.text.includes("woke up due to the uproar"),
    );
    expect(uproarWakeMessages.length).toBe(0);
  });

  it("given a sleeping Pokemon without soundproof ability, when uproar EoT fires, then Pokemon wakes up", () => {
    // Arrange
    const { engine, events } = createUproarEngine({ hasAbilities: true });
    engine.start();

    // Set up: side 0 has uproar active, side 1 is asleep without Soundproof
    const side0Active = engine.getState().sides[0].active[0]!;
    side0Active.volatileStatuses.set("uproar" as any, { turnsLeft: 2 });

    const side1Active = engine.getState().sides[1].active[0]!;
    side1Active.pokemon.status = "sleep";
    side1Active.volatileStatuses.set("sleep-counter" as any, { turnsLeft: 5 });
    side1Active.ability = "torrent"; // Not soundproof

    // Act
    engine.submitAction(0, { type: "move", side: 0, moveIndex: 0 });
    engine.submitAction(1, { type: "move", side: 1, moveIndex: 0 });

    // Assert — without Soundproof, uproar wakes the sleeping Pokemon
    // Source: Bulbapedia — Uproar wakes sleeping Pokemon each turn
    expect(side1Active.pokemon.status).toBeNull();

    const uproarWakeMessages = events.filter(
      (e) =>
        e.type === "message" &&
        typeof e.text === "string" &&
        e.text.includes("Blastoise") &&
        e.text.includes("woke up due to the uproar"),
    );
    expect(uproarWakeMessages.length).toBe(1);
  });

  it("given Gen 1 (no abilities) sleeping Pokemon, when uproar EoT fires, then Pokemon wakes up normally", () => {
    // Arrange — abilities disabled (Gen 1/2 behavior)
    const { engine, events } = createUproarEngine({ hasAbilities: false });
    engine.start();

    // Set up: side 0 has uproar active, side 1 is asleep
    const side0Active = engine.getState().sides[0].active[0]!;
    side0Active.volatileStatuses.set("uproar" as any, { turnsLeft: 2 });

    const side1Active = engine.getState().sides[1].active[0]!;
    side1Active.pokemon.status = "sleep";
    side1Active.volatileStatuses.set("sleep-counter" as any, { turnsLeft: 5 });
    // Even if ability field is set, hasAbilities() returns false
    side1Active.ability = "soundproof";

    // Act
    engine.submitAction(0, { type: "move", side: 0, moveIndex: 0 });
    engine.submitAction(1, { type: "move", side: 1, moveIndex: 0 });

    // Assert — when hasAbilities() is false, Soundproof check is skipped; Pokemon wakes up
    // Source: Showdown — Abilities don't exist in Gen 1-2
    expect(side1Active.pokemon.status).toBeNull();

    const uproarWakeMessages = events.filter(
      (e) =>
        e.type === "message" &&
        typeof e.text === "string" &&
        e.text.includes("Blastoise") &&
        e.text.includes("woke up due to the uproar"),
    );
    expect(uproarWakeMessages.length).toBe(1);
  });
});
