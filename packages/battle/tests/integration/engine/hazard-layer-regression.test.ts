/**
 * Regression tests for Bug #537:
 * Entry hazard layers never increment beyond 1.
 *
 * The engine's processEffectResult handler only pushes a new hazard entry when
 * none exists. There is no else branch to increment `layers` on the existing
 * entry, so Spikes layer 2 and 3, and Toxic Spikes layer 2, are silently lost.
 *
 * Source: Showdown data/moves.ts — spikes.condition.onSwitchIn:
 *   damageAmounts = [0, 3, 4, 6]  (fractions of 24: 1/8, 1/6, 1/4 for layers 1-3)
 * Source: Showdown data/moves.ts — toxicspikes.condition.onSwitchIn:
 *   if (layers >= 2) badly poisoned, else regular poison
 */

import type { PokemonInstance } from "@pokemon-lib-ts/core";
import { CORE_HAZARD_IDS, CORE_TYPE_IDS } from "@pokemon-lib-ts/core";
import { createGen4DataManager, GEN4_MOVE_IDS, GEN4_SPECIES_IDS } from "@pokemon-lib-ts/gen4";
import { describe, expect, it } from "vitest";
import type { BattleConfig, MoveEffectContext, MoveEffectResult } from "../../../src/context";
import { BattleEngine } from "../../../src/engine";
import type { BattleEvent, HazardSetEvent } from "../../../src/events";
import { createTestPokemon } from "../../../src/utils";
import { MockRuleset } from "../../helpers/mock-ruleset";

/** MockRuleset that signals a hazard-set via executeMoveEffect on each call. */
class HazardMockRuleset extends MockRuleset {
  private _hazardType: import("@pokemon-lib-ts/core").EntryHazardType = CORE_HAZARD_IDS.spikes;
  private _hazardEffectActive = false;

  setHazard(hazard: import("@pokemon-lib-ts/core").EntryHazardType): void {
    this._hazardType = hazard;
  }

  enableHazardEffect(enabled: boolean): void {
    this._hazardEffectActive = enabled;
  }

  override executeMoveEffect(context: MoveEffectContext): MoveEffectResult {
    if (this._hazardEffectActive) {
      // Only set hazard when the attacker is on side 0 (simulates side 0 using Spikes)
      const attackerSideIndex = context.state.sides.findIndex((side) =>
        side.active.some((a) => a?.pokemon === context.attacker.pokemon),
      );
      if (attackerSideIndex === 0) {
        return {
          statusInflicted: null,
          volatileInflicted: null,
          statChanges: [],
          recoilDamage: 0,
          healAmount: 0,
          switchOut: false,
          messages: [],
          hazardSet: { hazard: this._hazardType, targetSide: 1 },
        };
      }
    }
    return super.executeMoveEffect(context);
  }
}

class ToxicSpikesAbsorbMockRuleset extends MockRuleset {
  override getAvailableHazards(): readonly import("@pokemon-lib-ts/core").EntryHazardType[] {
    return [CORE_HAZARD_IDS.toxicSpikes];
  }

  override applyEntryHazards(
    pokemon: import("../../../src/state").ActivePokemon,
    side: import("../../../src/state").BattleSide,
    _state?: import("../../../src/state").BattleState,
  ): import("../../../src/context").EntryHazardResult {
    if (
      pokemon.types.includes(CORE_TYPE_IDS.poison) &&
      side.hazards.some((hazard) => hazard.type === CORE_HAZARD_IDS.toxicSpikes)
    ) {
      return {
        damage: 0,
        statusInflicted: null,
        statChanges: [],
        messages: [
          `${pokemon.pokemon.nickname ?? pokemon.pokemon.speciesId.toString()} absorbed the poison spikes!`,
        ],
        hazardsToRemove: [CORE_HAZARD_IDS.toxicSpikes],
      };
    }

    return {
      damage: 0,
      statusInflicted: null,
      statChanges: [],
      messages: [],
    };
  }
}

function createHazardEngine(overrides?: { seed?: number }): {
  engine: BattleEngine;
  ruleset: HazardMockRuleset;
  events: BattleEvent[];
} {
  const ruleset = new HazardMockRuleset();
  ruleset.enableHazardEffect(true);
  const dataManager = createGen4DataManager();
  const events: BattleEvent[] = [];

  const team1: PokemonInstance[] = [
    createTestPokemon(GEN4_SPECIES_IDS.charizard, 50, {
      uid: "charizard-1",
      nickname: "Charizard",
      moves: [{ moveId: GEN4_MOVE_IDS.tackle, currentPP: 35, maxPP: 35, ppUps: 0 }],
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
    createTestPokemon(GEN4_SPECIES_IDS.blastoise, 50, {
      uid: "blastoise-1",
      nickname: "Blastoise",
      moves: [{ moveId: GEN4_MOVE_IDS.tackle, currentPP: 35, maxPP: 35, ppUps: 0 }],
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
    generation: 4,
    format: "singles",
    teams: [team1, team2],
    seed: overrides?.seed ?? 12345,
  };

  ruleset.setGenerationForTest(config.generation);
  const engine = new BattleEngine(config, ruleset, dataManager);
  engine.on((e) => events.push(e));

  return { engine, ruleset, events };
}

function createToxicSpikesAbsorbEngine(): {
  engine: BattleEngine;
  events: BattleEvent[];
} {
  const ruleset = new ToxicSpikesAbsorbMockRuleset();
  const dataManager = createGen4DataManager();
  const events: BattleEvent[] = [];

  const team1: PokemonInstance[] = [
    createTestPokemon(GEN4_SPECIES_IDS.charizard, 50, {
      uid: "charizard-1",
      nickname: "Charizard",
      moves: [{ moveId: GEN4_MOVE_IDS.tackle, currentPP: 35, maxPP: 35, ppUps: 0 }],
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
    createTestPokemon(GEN4_SPECIES_IDS.roselia, 50, {
      uid: "roselia-1",
      nickname: "Roselia",
      moves: [{ moveId: GEN4_MOVE_IDS.tackle, currentPP: 35, maxPP: 35, ppUps: 0 }],
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
    generation: 4,
    format: "singles",
    teams: [team1, team2],
    seed: 12345,
  };

  ruleset.setGenerationForTest(config.generation);
  const engine = new BattleEngine(config, ruleset, dataManager);
  engine.on((e) => events.push(e));

  return { engine, events };
}

// ---------------------------------------------------------------------------
// Bug #537 — Hazard layer increment
// ---------------------------------------------------------------------------

describe("Bug #537 — entry hazard layers must increment beyond 1", () => {
  it("given no hazards on field, when Spikes is used once, then side has 1 Spikes layer", () => {
    // Arrange
    // Source: Showdown data/moves.ts — spikes.condition.layers = 0; onSwitchIn adds 1 per use up to 3
    const { engine, events } = createHazardEngine();
    engine.start();

    // Act — submit one turn where side 0 uses "spikes" (mocked via hazardSet)
    events.length = 0;
    engine.submitAction(0, { type: "move", side: 0, moveIndex: 0 });
    engine.submitAction(1, { type: "move", side: 1, moveIndex: 0 });

    // Assert — side 1 should have 1 Spikes layer
    const side1Hazards = engine.getState().sides[1].hazards;
    const spikes = side1Hazards.find((h) => h.type === CORE_HAZARD_IDS.spikes);
    expect(spikes).toBeDefined();
    expect(spikes?.layers).toBe(1);

    // The hazard-set event should report layer 1
    const hazardSetEvents = events.filter((e): e is HazardSetEvent => e.type === "hazard-set");
    expect(hazardSetEvents.length).toBe(1);
    expect(hazardSetEvents[0]?.layers).toBe(1);
  });

  it("given 1 Spikes layer on field, when Spikes is used again, then layers increments to 2 (REGRESSION: Bug #537)", () => {
    // Arrange — pre-seed 1 layer of Spikes on side 1
    // Source: Showdown data/moves.ts — spikes.condition.onSwitchIn: damageAmounts[layers-1]:
    //   layer 1 = 1/8 HP, layer 2 = 1/6 HP, layer 3 = 1/4 HP
    const { engine, events } = createHazardEngine();
    engine.start();

    // Pre-set 1 existing Spikes layer
    (engine as any).state.sides[1].hazards.push({ type: CORE_HAZARD_IDS.spikes, layers: 1 });

    // Act — use Spikes again (second application)
    events.length = 0;
    engine.submitAction(0, { type: "move", side: 0, moveIndex: 0 });
    engine.submitAction(1, { type: "move", side: 1, moveIndex: 0 });

    // Assert — layers should be 2
    const side1Hazards = engine.getState().sides[1].hazards;
    const spikes = side1Hazards.find((h) => h.type === CORE_HAZARD_IDS.spikes);
    expect(spikes?.layers).toBe(2);

    // Exactly one hazard-set event for this turn (the second layer)
    const hazardSetEvents = events.filter((e): e is HazardSetEvent => e.type === "hazard-set");
    expect(hazardSetEvents.length).toBe(1);
    expect(hazardSetEvents[0]?.layers).toBe(2);
  });

  it("given 2 Spikes layers on field, when Spikes is used a third time, then layers increments to 3 (REGRESSION: Bug #537)", () => {
    // Source: Showdown data/moves.ts — spikes max 3 layers
    // Arrange — pre-seed 2 layers
    const { engine, events } = createHazardEngine();
    engine.start();

    (engine as any).state.sides[1].hazards.push({ type: CORE_HAZARD_IDS.spikes, layers: 2 });

    // Act — third Spikes use
    events.length = 0;
    engine.submitAction(0, { type: "move", side: 0, moveIndex: 0 });
    engine.submitAction(1, { type: "move", side: 1, moveIndex: 0 });

    // Assert — layers must be 3
    const spikes = engine
      .getState()
      .sides[1].hazards.find((h) => h.type === CORE_HAZARD_IDS.spikes);
    expect(spikes?.layers).toBe(3);

    const hazardSetEvents = events.filter((e): e is HazardSetEvent => e.type === "hazard-set");
    expect(hazardSetEvents.length).toBe(1);
    expect(hazardSetEvents[0]?.layers).toBe(3);
  });

  it("given 3 Spikes layers (max), when Spikes ruleset returns hazardSet again, then layers stays at 3 (cap enforcement)", () => {
    // Source: Showdown data/moves.ts — spikes.condition.onSetStatus: fails if layers >= 3
    // In practice the ruleset should NOT return hazardSet at max layers.
    // If it does, the engine must not exceed 3.
    const { engine, events } = createHazardEngine();
    engine.start();

    (engine as any).state.sides[1].hazards.push({ type: CORE_HAZARD_IDS.spikes, layers: 3 });

    events.length = 0;
    engine.submitAction(0, { type: "move", side: 0, moveIndex: 0 });
    engine.submitAction(1, { type: "move", side: 1, moveIndex: 0 });

    // Assert — layers must not exceed 3
    const spikes = engine
      .getState()
      .sides[1].hazards.find((h) => h.type === CORE_HAZARD_IDS.spikes);
    expect(spikes?.layers).toBe(3);

    // No hazard-set event should fire when already at max
    const hazardSetEvents = events.filter((e): e is HazardSetEvent => e.type === "hazard-set");
    expect(hazardSetEvents.length).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// Bug #537 — Toxic Spikes layer 2 changes from poison to badly-poisoned
// ---------------------------------------------------------------------------

describe("Bug #537 — Toxic Spikes layer 2 must register as badly-poisoned source", () => {
  it("given no Toxic Spikes, when Toxic Spikes is used once, then side has 1 Toxic Spikes layer", () => {
    // Source: Showdown data/moves.ts — toxicspikes: layer 1 poisons, layer 2 badly poisons
    const { engine, ruleset, events } = createHazardEngine();
    ruleset.setHazard(CORE_HAZARD_IDS.toxicSpikes);
    engine.start();

    events.length = 0;
    engine.submitAction(0, { type: "move", side: 0, moveIndex: 0 });
    engine.submitAction(1, { type: "move", side: 1, moveIndex: 0 });

    const toxicSpikes = engine
      .getState()
      .sides[1].hazards.find((h) => h.type === CORE_HAZARD_IDS.toxicSpikes);
    expect(toxicSpikes).toBeDefined();
    expect(toxicSpikes?.layers).toBe(1);
  });

  it("given 1 Toxic Spikes layer, when Toxic Spikes is used again, then layers increments to 2 (REGRESSION: Bug #537)", () => {
    // Source: Showdown data/moves.ts — toxicspikes.condition.onSwitchIn:
    //   if (layers >= 2) inflict 'badly-poisoned', else inflict 'poison'
    const { engine, ruleset, events } = createHazardEngine();
    ruleset.setHazard(CORE_HAZARD_IDS.toxicSpikes);
    engine.start();

    // Pre-seed 1 layer
    (engine as any).state.sides[1].hazards.push({
      type: CORE_HAZARD_IDS.toxicSpikes,
      layers: 1,
    });

    events.length = 0;
    engine.submitAction(0, { type: "move", side: 0, moveIndex: 0 });
    engine.submitAction(1, { type: "move", side: 1, moveIndex: 0 });

    // Assert — layers must be 2 for badly-poisoned switch-in to work
    const toxicSpikes = engine
      .getState()
      .sides[1].hazards.find((h) => h.type === CORE_HAZARD_IDS.toxicSpikes);
    expect(toxicSpikes?.layers).toBe(2);

    const hazardSetEvents = events.filter((e): e is HazardSetEvent => e.type === "hazard-set");
    expect(hazardSetEvents.length).toBe(1);
    expect(hazardSetEvents[0]?.layers).toBe(2);
  });

  it("given 2 Toxic Spikes layers (max), when Toxic Spikes is used again, then layers stays at 2 (cap enforcement)", () => {
    // Source: Showdown data/moves.ts — toxicspikes max 2 layers
    const { engine, ruleset, events } = createHazardEngine();
    ruleset.setHazard(CORE_HAZARD_IDS.toxicSpikes);
    engine.start();

    (engine as any).state.sides[1].hazards.push({
      type: CORE_HAZARD_IDS.toxicSpikes,
      layers: 2,
    });

    events.length = 0;
    engine.submitAction(0, { type: "move", side: 0, moveIndex: 0 });
    engine.submitAction(1, { type: "move", side: 1, moveIndex: 0 });

    const toxicSpikes = engine
      .getState()
      .sides[1].hazards.find((h) => h.type === CORE_HAZARD_IDS.toxicSpikes);
    expect(toxicSpikes?.layers).toBe(2);

    // No hazard-set event at max layers
    const hazardSetEvents = events.filter((e): e is HazardSetEvent => e.type === "hazard-set");
    expect(hazardSetEvents.length).toBe(0);
  });
});

describe("Toxic Spikes absorption emits hazard-clear", () => {
  it("given a grounded Poison-type switches in on Toxic Spikes, when the battle starts, then hazard-clear is emitted for Toxic Spikes", () => {
    // Source: Bulbapedia — grounded Poison-types absorb Toxic Spikes on switch-in
    // Source: pret/pokeplatinum — the Toxic Spikes hazard is removed on absorb
    const { engine, events } = createToxicSpikesAbsorbEngine();

    engine.state.sides[1].hazards = [{ type: CORE_HAZARD_IDS.toxicSpikes, layers: 1 }];

    engine.start();

    expect(engine.state.sides[1].hazards).toHaveLength(0);

    const hazardClearEvents = events.filter(
      (event): event is Extract<BattleEvent, { type: "hazard-clear" }> =>
        event.type === "hazard-clear" && event.side === 1,
    );
    // Source: Toxic Spikes absorption should emit the public hazard-clear event for the removed hazard.
    expect(hazardClearEvents).toEqual([
      { type: "hazard-clear", side: 1, hazard: CORE_HAZARD_IDS.toxicSpikes },
    ]);
  });
});

// ---------------------------------------------------------------------------
// Stealth Rock — single layer, should not be affected by layering bug
// ---------------------------------------------------------------------------

describe("Stealth Rock — single-layer hazard unaffected by layering bug", () => {
  it("given no hazards, when Stealth Rock is used once, then side has 1 stealth-rock entry", () => {
    // Source: Showdown data/moves.ts — stealth-rock: no layers (1 use = 1 entry, cannot stack)
    const { engine, ruleset, events } = createHazardEngine();
    ruleset.setHazard(CORE_HAZARD_IDS.stealthRock);
    engine.start();

    events.length = 0;
    engine.submitAction(0, { type: "move", side: 0, moveIndex: 0 });
    engine.submitAction(1, { type: "move", side: 1, moveIndex: 0 });

    const stealthRock = engine
      .getState()
      .sides[1].hazards.find((h) => h.type === CORE_HAZARD_IDS.stealthRock);
    expect(stealthRock).toBeDefined();
    expect(stealthRock?.layers).toBe(1);
  });

  it("given 1 stealth-rock entry already on field, when Stealth Rock ruleset returns hazardSet again, then count stays at 1", () => {
    // Source: Showdown data/moves.ts — Stealth Rock fails if already present
    // Stealth Rock max layers = 1, so the engine cap prevents increment.
    const { engine, ruleset, events } = createHazardEngine();
    ruleset.setHazard(CORE_HAZARD_IDS.stealthRock);
    engine.start();

    (engine as any).state.sides[1].hazards.push({
      type: CORE_HAZARD_IDS.stealthRock,
      layers: 1,
    });

    events.length = 0;
    engine.submitAction(0, { type: "move", side: 0, moveIndex: 0 });
    engine.submitAction(1, { type: "move", side: 1, moveIndex: 0 });

    // Still only 1 stealth-rock (layers stays at 1)
    const stealthRocks = engine
      .getState()
      .sides[1].hazards.filter((h) => h.type === CORE_HAZARD_IDS.stealthRock);
    expect(stealthRocks.length).toBe(1);
    expect(stealthRocks[0]?.layers).toBe(1);

    // No hazard-set event since already at max
    const hazardSetEvents = events.filter((e): e is HazardSetEvent => e.type === "hazard-set");
    expect(hazardSetEvents.length).toBe(0);
  });
});
