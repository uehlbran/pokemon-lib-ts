import type { PokemonInstance, PokemonSpeciesData, TypeChart } from "@pokemon-lib-ts/core";
import { DataManager } from "@pokemon-lib-ts/core";
import { describe, expect, it } from "vitest";
import { createMockMoveSlot } from "../../helpers/move-slot";
import { CORE_ABILITY_IDS, CORE_MOVE_IDS, CORE_TYPE_IDS } from "@pokemon-lib-ts/core";
import type { BattleConfig } from "../../../src/context";
import { BattleEngine } from "../../../src/engine";
import type { BattleEvent } from "../../../src/events";
import { createTestPokemon } from "../../../src/utils";
import { MockRuleset } from "../../helpers/mock-ruleset";

/**
 * Creates a DataManager pre-loaded with both the standard mock data and a CORE_MOVE_IDS.pursuit move.
 */
function createDataManagerWithPursuit(): DataManager {
  const dm = new DataManager();

  dm.loadFromObjects({
    pokemon: [],
    moves: [],
    typeChart: {},
  });

  const pursuitMove = {
    id: CORE_MOVE_IDS.pursuit,
    displayName: "Pursuit",
    type: CORE_TYPE_IDS.dark as const,
    category: "physical" as const,
    power: 40,
    accuracy: 100,
    pp: 20,
    priority: 0,
    target: "adjacent-foe" as const,
    flags: {
      contact: true,
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
    description:
      "An attack move that inflicts double damage if used on a target that is switching out.",
    generation: 2,
  };

  // We need a fresh DataManager with all data including pursuit
  const fullDm = new DataManager();
  // Build the type chart (all neutral)
  const allTypes = [
    CORE_TYPE_IDS.normal,
    CORE_TYPE_IDS.fire,
    CORE_TYPE_IDS.water,
    CORE_TYPE_IDS.electric,
    CORE_TYPE_IDS.grass,
    CORE_TYPE_IDS.ice,
    CORE_TYPE_IDS.fighting,
    CORE_TYPE_IDS.poison,
    CORE_TYPE_IDS.ground,
    CORE_TYPE_IDS.flying,
    CORE_TYPE_IDS.psychic,
    CORE_TYPE_IDS.bug,
    CORE_TYPE_IDS.rock,
    CORE_TYPE_IDS.ghost,
    CORE_TYPE_IDS.dragon,
    CORE_TYPE_IDS.dark,
    CORE_TYPE_IDS.steel,
    CORE_TYPE_IDS.fairy,
  ];
  const typeChart: Record<string, Record<string, number>> = {};
  for (const atk of allTypes) {
    const row: Record<string, number> = {};
    for (const def of allTypes) {
      row[def] = 1;
    }
    typeChart[atk] = row;
  }

  const charizardSpecies = {
    id: 6,
    name: "charizard",
    displayName: "Charizard",
    types: [CORE_TYPE_IDS.fire, CORE_TYPE_IDS.flying] as [CORE_TYPE_IDS.fire, CORE_TYPE_IDS.flying],
    baseStats: { hp: 78, attack: 84, defense: 78, spAttack: 109, spDefense: 85, speed: 100 },
    abilities: { normal: [CORE_ABILITY_IDS.blaze], hidden: CORE_ABILITY_IDS.solarPower },
    genderRatio: 87.5,
    catchRate: 45,
    baseExp: 240,
    expGroup: "medium-slow" as const,
    evYield: { spAttack: 3 },
    eggGroups: ["monster", CORE_TYPE_IDS.dragon],
    learnset: { levelUp: [], tm: [], egg: [], tutor: [] },
    evolution: null,
    dimensions: { height: 1.7, weight: 90.5 },
    spriteKey: "charizard",
    baseFriendship: 70,
    generation: 1,
    isLegendary: false,
    isMythical: false,
  };

  const blastoiseSpecies = {
    id: 9,
    name: "blastoise",
    displayName: "Blastoise",
    types: [CORE_TYPE_IDS.water] as [CORE_TYPE_IDS.water],
    baseStats: { hp: 79, attack: 83, defense: 100, spAttack: 85, spDefense: 105, speed: 78 },
    abilities: { normal: [CORE_ABILITY_IDS.torrent], hidden: CORE_ABILITY_IDS.rainDish },
    genderRatio: 87.5,
    catchRate: 45,
    baseExp: 239,
    expGroup: "medium-slow" as const,
    evYield: { spDefense: 3 },
    eggGroups: ["monster", "water1"],
    learnset: { levelUp: [], tm: [], egg: [], tutor: [] },
    evolution: null,
    dimensions: { height: 1.6, weight: 85.5 },
    spriteKey: "blastoise",
    baseFriendship: 70,
    generation: 1,
    isLegendary: false,
    isMythical: false,
  };

  const pikachuSpecies = {
    id: 25,
    name: "pikachu",
    displayName: "Pikachu",
    types: [CORE_TYPE_IDS.electric] as [CORE_TYPE_IDS.electric],
    baseStats: { hp: 35, attack: 55, defense: 40, spAttack: 50, spDefense: 50, speed: 90 },
    abilities: { normal: [CORE_ABILITY_IDS.static], hidden: CORE_ABILITY_IDS.lightningRod },
    genderRatio: 50,
    catchRate: 190,
    baseExp: 112,
    expGroup: "medium-fast" as const,
    evYield: { speed: 2 },
    eggGroups: ["field", CORE_TYPE_IDS.fairy],
    learnset: { levelUp: [], tm: [], egg: [], tutor: [] },
    evolution: null,
    dimensions: { height: 0.4, weight: 6.0 },
    spriteKey: "pikachu",
    baseFriendship: 70,
    generation: 1,
    isLegendary: false,
    isMythical: false,
  };

  fullDm.loadFromObjects({
    pokemon: [
      charizardSpecies,
      blastoiseSpecies,
      pikachuSpecies,
    ] as unknown as PokemonSpeciesData[],
    moves: [
      {
        id: CORE_MOVE_IDS.tackle,
        displayName: "Tackle",
        type: CORE_TYPE_IDS.normal,
        category: "physical",
        power: 40,
        accuracy: 100,
        pp: 35,
        priority: 0,
        target: "adjacent-foe",
        flags: {
          contact: true,
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
        description: "A physical attack in which the user charges and slams into the target.",
        generation: 1,
      },
      pursuitMove,
    ],
    typeChart: typeChart as unknown as TypeChart,
  });

  return fullDm;
}

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

  const dataManager = createDataManagerWithPursuit();
  const events: BattleEvent[] = [];

  const team1 = overrides?.team1 ?? [
    createTestPokemon(6, 50, {
      uid: "charizard-1",
      nickname: "Charizard",
      moves: [createMockMoveSlot(CORE_MOVE_IDS.pursuit)],
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
    createTestPokemon(9, 50, {
      uid: "blastoise-1",
      nickname: "Blastoise",
      moves: [createMockMoveSlot(CORE_MOVE_IDS.tackle)],
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
    createTestPokemon(25, 50, {
      uid: "pikachu-bench",
      nickname: "Pikachu",
      moves: [createMockMoveSlot(CORE_MOVE_IDS.tackle)],
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
        expect.objectContaining({ type: "move-start", side: 0, move: CORE_MOVE_IDS.pursuit }),
        expect.objectContaining({ type: "move-start", side: 1, move: CORE_MOVE_IDS.tackle }),
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
        expect.objectContaining({ type: "move-start", side: 0, move: CORE_MOVE_IDS.pursuit }),
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

      const dataManager = createDataManagerWithPursuit();
      const events: BattleEvent[] = [];

      const team1 = [
        createTestPokemon(6, 50, {
          uid: "charizard-gen1",
          nickname: "Charizard",
          moves: [createMockMoveSlot(CORE_MOVE_IDS.pursuit)],
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
        createTestPokemon(9, 50, {
          uid: "blastoise-gen1",
          nickname: "Blastoise",
          moves: [createMockMoveSlot(CORE_MOVE_IDS.tackle)],
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
        createTestPokemon(25, 50, {
          uid: "pikachu-gen1-bench",
          nickname: "Pikachu",
          moves: [createMockMoveSlot(CORE_MOVE_IDS.tackle)],
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
