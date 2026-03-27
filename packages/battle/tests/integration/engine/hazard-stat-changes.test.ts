import type { DataManager, PokemonInstance } from "@pokemon-lib-ts/core";
import {
  CORE_HAZARD_IDS,
  CORE_MOVE_IDS,
  CORE_STAT_IDS,
  createPokemonInstance,
  SeededRandom,
} from "@pokemon-lib-ts/core";
import { describe, expect, it } from "vitest";
import type { BattleConfig, EntryHazardResult } from "../../../src/context";
import { BattleEngine } from "../../../src/engine";
import type { BattleEvent } from "../../../src/events";
import type { ActivePokemon, BattleSide, BattleState } from "../../../src/state";
import { createMockDataManager } from "../../helpers/mock-data-manager";
import { MockRuleset } from "../../helpers/mock-ruleset";

/**
 * Tests for issue #609: sendOut() must apply EntryHazardResult.statChanges.
 *
 * Sticky Web lowers the incoming Pokemon's Speed by 1 stage on switch-in.
 * The ruleset returns statChanges in EntryHazardResult; the engine must apply them.
 *
 * Source: Showdown data/moves.ts — stickyweb: this.boost({spe: -1}, pokemon)
 * Source: Bulbapedia — "Sticky Web lowers the Speed stat of each opposing Pokemon
 *   that switches in by one stage."
 */

function createBattlePokemonFixture(
  dataManager: DataManager,
  speciesId: number,
  uid: string,
  seed: number,
): PokemonInstance {
  const species = dataManager.getSpecies(speciesId);
  return {
    ...createPokemonInstance(species, 50, new SeededRandom(seed), {
      moves: [dataManager.getMove(CORE_MOVE_IDS.tackle)],
    }),
    uid,
  };
}

function createHazardBattleEngine(overrides?: {
  seed?: number;
  team1?: PokemonInstance[];
  team2?: PokemonInstance[];
  ruleset?: MockRuleset;
  dataManager?: DataManager;
}): { engine: BattleEngine; ruleset: MockRuleset; events: BattleEvent[] } {
  const ruleset = overrides?.ruleset ?? new MockRuleset();
  const dataManager = overrides?.dataManager ?? createMockDataManager();
  const events: BattleEvent[] = [];

  const team1 = overrides?.team1 ?? [
    createBattlePokemonFixture(dataManager, 6, "charizard-1", 1),
    createBattlePokemonFixture(dataManager, 25, "pikachu-1", 2),
  ];

  const team2 = overrides?.team2 ?? [createBattlePokemonFixture(dataManager, 9, "blastoise-1", 3)];

  const config: BattleConfig = {
    generation: 1,
    format: "singles",
    teams: [team1, team2],
    seed: overrides?.seed ?? 12345,
  };

  const engine = new BattleEngine(config, ruleset, dataManager);
  engine.on((e) => events.push(e));

  return { engine, ruleset, events };
}

describe("Entry hazard stat changes in sendOut (issue #609)", () => {
  it("given Sticky Web on the field, when a Pokemon switches in, then its Speed stage decreases by 1", () => {
    // Arrange
    const ruleset = new MockRuleset();

    // Override getAvailableHazards to include sticky-web
    // Source: Showdown — Sticky Web is an entry hazard type
    ruleset.getAvailableHazards = () => [CORE_HAZARD_IDS.stickyWeb] as any;

    // Override applyEntryHazards to return a Speed drop
    // Source: Showdown data/moves.ts — stickyweb: this.boost({spe: -1}, pokemon)
    ruleset.applyEntryHazards = (
      _pokemon: ActivePokemon,
      _side: BattleSide,
      _state?: BattleState,
    ): EntryHazardResult => {
      return {
        damage: 0,
        statusInflicted: null,
        statChanges: [{ stat: "speed", stages: -1 }],
        messages: ["Pikachu was caught in a Sticky Web!"],
      };
    };

    const { engine, events } = createHazardBattleEngine({ ruleset });

    engine.start();

    // Add sticky-web hazard to side 0 (Charizard's side)
    const state = engine.getState();
    state.sides[0].hazards.push({ type: CORE_HAZARD_IDS.stickyWeb as any, layers: 1 });

    events.length = 0;

    // Act — Charizard voluntarily switches to Pikachu (normal switch, not faint-forced)
    engine.submitAction(0, { type: "switch", side: 0, switchTo: 1 });
    engine.submitAction(1, { type: "move", side: 1, moveIndex: 0 });

    // Assert — Pikachu should have speed stat stage = -1
    const pikachu = state.sides[0].active[0]!;
    // Source: Bulbapedia — "Sticky Web lowers Speed by one stage on switch-in"
    expect(pikachu.statStages.speed).toBe(-1);

    // Also verify a stat-change event was emitted
    const statChangeEvents = events.filter((e) => e.type === "stat-change");
    expect(statChangeEvents).toHaveLength(1);
    const speedChange = statChangeEvents.find(
      (e) => e.type === "stat-change" && e.stat === CORE_STAT_IDS.speed,
    );
    expect(speedChange?.stages).toBe(-1);
    expect(speedChange?.currentStage).toBe(-1);
  });

  it("given a hazard that deals both damage and stat changes, when a Pokemon switches in, then both are applied", () => {
    // Arrange — hypothetical hazard that deals damage AND changes stats
    // (This tests the combination path)
    const ruleset = new MockRuleset();
    ruleset.setFixedDamage(0);

    ruleset.getAvailableHazards = () => [CORE_HAZARD_IDS.stealthRock] as any;

    ruleset.applyEntryHazards = (
      _pokemon: ActivePokemon,
      _side: BattleSide,
      _state?: BattleState,
    ): EntryHazardResult => {
      return {
        damage: 25,
        statusInflicted: null,
        // Source: Hypothetical combined hazard for testing the engine's ability to apply
        // both damage and stat changes from a single EntryHazardResult
        statChanges: [{ stat: "attack", stages: -1 }],
        messages: ["Pointed stones dug into Pikachu!", "Pikachu's Attack fell!"],
      };
    };

    const { engine, events } = createHazardBattleEngine({ ruleset });

    engine.start();

    const state = engine.getState();
    state.sides[0].hazards.push({ type: CORE_HAZARD_IDS.stealthRock as any, layers: 1 });

    events.length = 0;

    // Act — voluntary switch
    engine.submitAction(0, { type: "switch", side: 0, switchTo: 1 });
    engine.submitAction(1, { type: "move", side: 1, moveIndex: 0 });

    // Assert
    const pikachu = state.sides[0].active[0]!;
    // Source: EntryHazardResult.statChanges applied by engine after damage
    expect(pikachu.statStages.attack).toBe(-1);
    expect(pikachu.pokemon.calculatedStats?.hp).toBe(pikachu.pokemon.currentHp + 25);
  });
});
