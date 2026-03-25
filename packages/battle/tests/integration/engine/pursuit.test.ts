import type { PokemonInstance } from "@pokemon-lib-ts/core";
import { createGen2DataManager, GEN2_MOVE_IDS, GEN2_SPECIES_IDS } from "@pokemon-lib-ts/gen2";
import { describe, expect, it } from "vitest";
import { createMockMoveSlot } from "../../helpers/move-slot";
import type { BattleConfig } from "../../../src/context";
import { BattleEngine } from "../../../src/engine";
import type { BattleEvent } from "../../../src/events";
import { createTestPokemon } from "../../../src/utils";
import { MockRuleset } from "../../helpers/mock-ruleset";

function createEngine(overrides?: {
  seed?: number;
  team1?: PokemonInstance[];
  team2?: PokemonInstance[];
  ruleset?: MockRuleset;
  generation?: number;
}) {
  const ruleset = overrides?.ruleset ?? new MockRuleset();

  // Override generation if requested
  if (overrides?.generation !== undefined) {
    Object.defineProperty(ruleset, "generation", { value: overrides.generation, writable: true });
  }

  const dataManager = createGen2DataManager();
  const events: BattleEvent[] = [];

  const team1 = overrides?.team1 ?? [
    createTestPokemon(GEN2_SPECIES_IDS.charizard, 50, {
      uid: "charizard-1",
      nickname: "Charizard",
      moves: [createMockMoveSlot(GEN2_MOVE_IDS.pursuit)],
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

  const team2 = overrides?.team2 ?? [
    createTestPokemon(GEN2_SPECIES_IDS.blastoise, 50, {
      uid: "blastoise-1",
      nickname: "Blastoise",
      moves: [createMockMoveSlot(GEN2_MOVE_IDS.tackle)],
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
    createTestPokemon(GEN2_SPECIES_IDS.pikachu, 50, {
      uid: "pikachu-bench",
      nickname: "Pikachu",
      moves: [createMockMoveSlot(GEN2_MOVE_IDS.tackle)],
      calculatedStats: {
        hp: 120,
        attack: 80,
        defense: 60,
        spAttack: 80,
        spDefense: 80,
        speed: 130,
      },
      currentHp: 120,
    }),
  ];

  const config: BattleConfig = {
    generation: 2,
    format: "singles",
    teams: [team1, team2],
    seed: overrides?.seed ?? 12345,
  };

  const engine = new BattleEngine(config, ruleset, dataManager);
  engine.on((e) => events.push(e));

  return { engine, ruleset, events, dataManager };
}

describe("Pursuit — pre-switch execution", () => {
  describe("Gen 2+ Pursuit fires before opponent switch", () => {
    it("given side 0 uses Pursuit and side 1 switches, when turn resolves, then Pursuit executes before the switch", () => {
      // Arrange
      const ruleset = new MockRuleset();
      Object.defineProperty(ruleset, "generation", { value: 2, writable: true });
      const { engine, events } = createEngine({ ruleset });
      engine.start();

      // Act — side 0 uses Pursuit, side 1 switches (Blastoise → Pikachu)
      engine.submitAction(0, { type: "move", side: 0, moveIndex: 0 });
      engine.submitAction(1, { type: "switch", side: 1, switchTo: 1 });

      // Assert — a move-start event for Pursuit must appear before the switch-out event for side 1
      const moveStarts = events
        .map((e, i) => ({ e, i }))
        .filter(({ e }) => e.type === "move-start");
      const switchOuts = events
        .map((e, i) => ({ e, i }))
        .filter(({ e }) => e.type === "switch-out");

      // There must be exactly one Pursuit move-start in this sequence
      expect(moveStarts).toHaveLength(1);

      // The first move-start from the action phase must precede side 1's switch-out
      // (side 1 starts with a switch-in at battle start, so we look at the post-start switch-out)
      const postStartSwitchOut = switchOuts.find(({ e }) => {
        const se = e as { type: string; side?: number };
        return se.side === 1;
      });
      const firstActionMoveStart = moveStarts[0];

      expect(firstActionMoveStart?.e).toEqual(expect.objectContaining({ type: "move-start" }));
      expect(postStartSwitchOut?.e).toEqual(expect.objectContaining({ type: "switch-out", side: 1 }));
      if (firstActionMoveStart && postStartSwitchOut) {
        // Pursuit (move-start) should appear at or before side 1's switch-out
        expect(firstActionMoveStart.i).toBeLessThanOrEqual(postStartSwitchOut.i);
      }
    });

    it("given side 0 uses Pursuit and side 1 switches, when turn resolves, then a damage event is emitted before the switch-in", () => {
      // Arrange
      const ruleset = new MockRuleset();
      Object.defineProperty(ruleset, "generation", { value: 2, writable: true });
      const { engine, events } = createEngine({ ruleset });
      engine.start();

      // Act
      engine.submitAction(0, { type: "move", side: 0, moveIndex: 0 });
      engine.submitAction(1, { type: "switch", side: 1, switchTo: 1 });

      // Assert — damage must occur (Pursuit hit the switching Pokemon)
      const damageEvents = events.filter((e) => e.type === "damage");
      expect(damageEvents).toHaveLength(1);

      // The Pikachu should have switched in (confirming switch still happened)
      const switchIns = events.filter((e) => e.type === "switch-in");
      // 2 initial + 1 from the switch action
      expect(switchIns).toHaveLength(3);
    });
  });

  describe("Pursuit does NOT fire early when opponent uses a move", () => {
    it("given both sides use moves (no switch), when turn resolves, then Pursuit does not get special pre-switch treatment", () => {
      // Arrange
      const ruleset = new MockRuleset();
      Object.defineProperty(ruleset, "generation", { value: 2, writable: true });
      const { engine, events } = createEngine({ ruleset });
      engine.start();

      // Act — both sides use moves, no switch
      engine.submitAction(0, { type: "move", side: 0, moveIndex: 0 });
      engine.submitAction(1, { type: "move", side: 1, moveIndex: 0 });

      // Assert — no switch-out events after start (no switching happened)
      const switchOuts = events.filter((e) => e.type === "switch-out");
      expect(switchOuts).toEqual([]);

      // Both moves fired normally in action order, with no pre-switch shortcut.
      const moveStarts = events.filter((e) => e.type === "move-start");
      expect(moveStarts).toEqual([
        expect.objectContaining({ type: "move-start", side: 0, move: GEN2_MOVE_IDS.pursuit }),
        expect.objectContaining({ type: "move-start", side: 1, move: GEN2_MOVE_IDS.tackle }),
      ]);
    });
  });

  describe("Pursuit is removed from orderedActions after pre-switch execution", () => {
    it("given side 0 uses Pursuit and side 1 switches, when turn resolves, then Pursuit fires exactly once", () => {
      // Arrange
      const ruleset = new MockRuleset();
      Object.defineProperty(ruleset, "generation", { value: 2, writable: true });
      const { engine, events } = createEngine({ ruleset });
      engine.start();

      // Act
      engine.submitAction(0, { type: "move", side: 0, moveIndex: 0 });
      engine.submitAction(1, { type: "switch", side: 1, switchTo: 1 });

      // Assert — exactly one move-start event (Pursuit fires once, not twice)
      const moveStarts = events.filter((e) => e.type === "move-start");
      expect(moveStarts).toEqual([
        expect.objectContaining({ type: "move-start", side: 0, move: GEN2_MOVE_IDS.pursuit }),
      ]);
    });
  });

  describe("Gen 1 does NOT trigger Pursuit pre-switch", () => {
    it("given gen=1 ruleset, side 0 uses Pursuit, side 1 switches, when turn resolves, then no pre-switch damage occurs", () => {
      // Arrange — gen 1 ruleset: shouldExecutePursuitPreSwitch() returns false
      class Gen1MockRuleset extends MockRuleset {
        override shouldExecutePursuitPreSwitch(): boolean {
          return false;
        }
      }
      const ruleset = new Gen1MockRuleset();
      expect(ruleset.generation).toBe(1);

      const dataManager = createGen2DataManager();
      const events: BattleEvent[] = [];

      const team1 = [
        createTestPokemon(GEN2_SPECIES_IDS.charizard, 50, {
          uid: "charizard-gen1",
          nickname: "Charizard",
          moves: [createMockMoveSlot(GEN2_MOVE_IDS.pursuit)],
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

      const team2 = [
        createTestPokemon(GEN2_SPECIES_IDS.blastoise, 50, {
          uid: "blastoise-gen1",
          nickname: "Blastoise",
          moves: [createMockMoveSlot(GEN2_MOVE_IDS.tackle)],
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
        createTestPokemon(GEN2_SPECIES_IDS.pikachu, 50, {
          uid: "pikachu-gen1-bench",
          nickname: "Pikachu",
          moves: [createMockMoveSlot(GEN2_MOVE_IDS.tackle)],
          calculatedStats: {
            hp: 120,
            attack: 80,
            defense: 60,
            spAttack: 80,
            spDefense: 80,
            speed: 130,
          },
          currentHp: 120,
        }),
      ];

      const config: BattleConfig = {
        generation: 1,
        format: "singles",
        teams: [team1, team2],
        seed: 12345,
      };

      const engine = new BattleEngine(config, ruleset, dataManager);
      engine.on((e) => events.push(e));
      engine.start();

      // Act
      engine.submitAction(0, { type: "move", side: 0, moveIndex: 0 });
      engine.submitAction(1, { type: "switch", side: 1, switchTo: 1 });

      // Assert — switch happens first (gen 1 has no Pursuit pre-check)
      // The switch-in for Pikachu must occur, and Pursuit fires AFTER the switch
      const switchIns = events.filter((e) => e.type === "switch-in");
      // 2 initial switch-ins at battle start + 1 for Pikachu coming in
      expect(switchIns.length).toBeGreaterThanOrEqual(3);

      // The Pursuit move-start must come AFTER the last switch-out (no pre-switch execution)
      const moveStartIndices = events
        .map((e, i) => ({ e, i }))
        .filter(({ e }) => e.type === "move-start")
        .map(({ i }) => i);

      const lastSwitchOutIndex = events
        .map((e, i) => ({ e, i }))
        .filter(({ e }) => e.type === "switch-out")
        .map(({ i }) => i)
        .at(-1);

      if (moveStartIndices.length > 0 && lastSwitchOutIndex !== undefined) {
        // In gen 1, the switch occurs before Pursuit fires (no pre-check)
        const firstMoveStart = moveStartIndices.at(0);
        if (firstMoveStart !== undefined) {
          expect(firstMoveStart).toBeGreaterThan(lastSwitchOutIndex);
        }
      }
    });
  });
});
