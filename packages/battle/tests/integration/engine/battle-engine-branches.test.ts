import type { PokemonInstance } from "@pokemon-lib-ts/core";
import {
  CORE_END_OF_TURN_EFFECT_IDS,
  CORE_ITEM_IDS,
  CORE_MOVE_IDS,
  CORE_STATUS_IDS,
  CORE_TYPE_IDS,
  CORE_VOLATILE_IDS,
  DataManager,
} from "@pokemon-lib-ts/core";
import { GEN1_MOVE_IDS } from "@pokemon-lib-ts/gen1";
import { GEN3_MOVE_IDS } from "@pokemon-lib-ts/gen3";
import { describe, expect, it } from "vitest";
import type { AbilityContext, AbilityResult, BattleConfig } from "../../../src/context";
import { BattleEngine } from "../../../src/engine";
import type { BattleEvent } from "../../../src/events";
import type { VolatileStatusState } from "../../../src/state";
import { createTestPokemon } from "../../../src/utils";
import { createMockDataManager, MOCK_SPECIES_IDS } from "../../helpers/mock-data-manager";
import { createMockMoveSlot } from "../../helpers/move-slot";
import { MockRuleset } from "../../helpers/mock-ruleset";

function createEngine(overrides?: {
  seed?: number;
  team1?: PokemonInstance[];
  team2?: PokemonInstance[];
  ruleset?: MockRuleset;
  dataManager?: DataManager;
  trainers?: [
    { id: string; displayName: string; trainerClass: string } | null,
    { id: string; displayName: string; trainerClass: string } | null,
  ];
}) {
  const ruleset = overrides?.ruleset ?? new MockRuleset();
  const dataManager = overrides?.dataManager ?? createMockDataManager();
  const events: BattleEvent[] = [];

  const team1 = overrides?.team1 ?? [
    createTestPokemon(MOCK_SPECIES_IDS.charizard, 50, {
      uid: "charizard-1",
      nickname: "Charizard",
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
  ];

  const team2 = overrides?.team2 ?? [
    createTestPokemon(MOCK_SPECIES_IDS.blastoise, 50, {
      uid: "blastoise-1",
      nickname: "Blastoise",
      moves: [createMockMoveSlot(CORE_MOVE_IDS.tackle)],
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
    generation: 1,
    format: "singles",
    teams: [team1, team2],
    seed: overrides?.seed ?? 12345,
    trainers: overrides?.trainers,
  };

  const engine = new BattleEngine(config, ruleset, dataManager);
  engine.on((e) => events.push(e));

  return { engine, ruleset, events, dataManager };
}

const SYNTHETIC_MISSING_MOVE_ID = "nonexistent-move";

function createSyntheticMissingMoveSlot(
  overrides: Partial<{ currentPP: number; maxPP: number; ppUps: number }> = {},
) {
  return {
    moveId: SYNTHETIC_MISSING_MOVE_ID,
    currentPP: overrides.currentPP ?? 10,
    maxPP: overrides.maxPP ?? 15,
    ppUps: overrides.ppUps ?? 0,
  };
}

describe("BattleEngine — branch coverage", () => {
  describe("constructor with trainers", () => {
    it("given trainers in config, when engine is created, then trainer data is stored on sides", () => {
      // Arrange & Act
      const { engine } = createEngine({
        trainers: [
          { id: "trainer-1", displayName: "Red", trainerClass: "Champion" },
          { id: "trainer-2", displayName: "Blue", trainerClass: "Rival" },
        ],
      });

      // Assert
      const state = engine.getState();
      expect(state.sides[0].trainer).toEqual({
        id: "trainer-1",
        displayName: "Red",
        trainerClass: "Champion",
      });
      expect(state.sides[1].trainer).toEqual({
        id: "trainer-2",
        displayName: "Blue",
        trainerClass: "Rival",
      });
    });

    it("given one null trainer, when engine is created, then that side has null trainer", () => {
      // Arrange & Act
      const { engine } = createEngine({
        trainers: [{ id: "trainer-1", displayName: "Red", trainerClass: "Champion" }, null],
      });

      // Assert
      expect(engine.getState().sides[0].trainer).toEqual({
        id: "trainer-1",
        displayName: "Red",
        trainerClass: "Champion",
      });
      expect(engine.getState().sides[1].trainer).toBeNull();
    });
  });

  describe("constructor with unknown species", () => {
    it("given a pokemon with unknown species, when engine is created, then it throws", () => {
      // Arrange
      const team1 = [
        createTestPokemon(999, 50, {
          uid: "unknown-1",
          nickname: "Unknown",
          currentHp: 150,
        }),
      ];

      // Act & Assert — engine must validate species at construction time
      expect(() => createEngine({ team1 })).toThrow(/999/);
    });

    it("given all team members have valid species, when engine is created, then stats are calculated", () => {
      // Arrange — use the canonical mock Charizard species id from the mock data manager.
      const team1 = [
        createTestPokemon(MOCK_SPECIES_IDS.charizard, 50, {
          uid: "charizard-1",
          nickname: "Charizard",
          moves: [createMockMoveSlot(CORE_MOVE_IDS.tackle)],
          currentHp: 200,
        }),
      ];

      // Act
      const { engine, ruleset, dataManager } = createEngine({ team1 });

      // Assert — stats are populated from the owning species data via the ruleset.
      const pokemon = engine.state.sides[0].team[0] as PokemonInstance;
      const expectedStats = ruleset.calculateStats(
        pokemon,
        dataManager.getSpecies(MOCK_SPECIES_IDS.charizard),
      );
      expect(pokemon.calculatedStats).toEqual(expectedStats);
    });
  });

  describe("start with abilities", () => {
    it("given a ruleset with abilities and slower lead, when battle starts, then abilities trigger in speed order", () => {
      // Arrange — side 1 (FastMon, speed 120) should trigger first
      // Use canonical mock species ids and override calculateStats
      // to return the desired speeds without recalculating from base stats.
      const team1 = [
        createTestPokemon(MOCK_SPECIES_IDS.blastoise, 50, {
          uid: "slow-mon",
          nickname: "SlowMon",
          moves: [createMockMoveSlot(CORE_MOVE_IDS.tackle)],
          currentHp: 200,
        }),
      ];
      const team2 = [
        createTestPokemon(MOCK_SPECIES_IDS.charizard, 50, {
          uid: "fast-mon",
          nickname: "FastMon",
          moves: [createMockMoveSlot(CORE_MOVE_IDS.tackle)],
          currentHp: 200,
        }),
      ];

      const ruleset = new MockRuleset();
      // Override calculateStats so speed values are deterministic for the test
      (ruleset as unknown as Record<string, unknown>).calculateStats = (
        pokemon: PokemonInstance,
      ) => ({
        hp: 200,
        attack: 100,
        defense: 100,
        spAttack: 100,
        spDefense: 100,
        speed: pokemon.speciesId === 9 ? 50 : 120,
      });
      // Override to enable abilities
      (ruleset as unknown as Record<string, unknown>).hasAbilities = () => true;
      const abilityTriggers: number[] = [];
      (ruleset as unknown as Record<string, unknown>).applyAbility = (
        _trigger: string,
        ctx: AbilityContext,
      ): AbilityResult => {
        // Track which side's ability triggered first
        const side = ctx.pokemon.pokemon.uid === "fast-mon" ? 1 : 0;
        abilityTriggers.push(side);
        return { activated: false, effects: [], messages: [] };
      };

      const { engine } = createEngine({ team1, team2, ruleset });

      // Act
      engine.start();

      // Assert — side 1 (FastMon, speed 120) should trigger first
      expect(abilityTriggers[0]).toBe(1);
      expect(abilityTriggers[1]).toBe(0);
    });
  });

  describe("protect interaction", () => {
    it("given a defending pokemon with protect volatile, when a protectable move is used, then it is blocked", () => {
      // Arrange
      const { engine, events } = createEngine();
      engine.start();

      // Set protect on Blastoise
      const blastoise = engine.state.sides[1].active[0];
      const startingHp = blastoise?.pokemon.currentHp;
      blastoise?.volatileStatuses.set(CORE_VOLATILE_IDS.protect, { turnsLeft: 1 });

      // Act
      engine.submitAction(0, { type: "move", side: 0, moveIndex: 0 });
      engine.submitAction(1, { type: "move", side: 1, moveIndex: 0 });

      // Assert
      expect(events).toContainEqual({
        type: "message",
        text: "Blastoise protected itself!",
      });
      expect(blastoise?.pokemon.currentHp).toBe(startingHp);
    });
  });

  describe("substitute interaction", () => {
    it("given a defending pokemon with a substitute, when a damaging move hits, then substitute takes damage", () => {
      // Arrange
      const { engine, events } = createEngine();
      engine.start();

      // Give Blastoise a substitute
      const blastoise1 = engine.state.sides[1].active[0];
      if (!blastoise1) throw new Error("Expected active pokemon on side 1");
      const startingSubstituteHp = 50;
      // MockRuleset deals a fixed 10 damage, so the substitute should end at 40 HP.
      const expectedSubstituteHp = startingSubstituteHp - 10;
      const startingHp = blastoise1.pokemon.currentHp;
      blastoise1.substituteHp = startingSubstituteHp;
      blastoise1.volatileStatuses.set(CORE_VOLATILE_IDS.substitute, { turnsLeft: -1 });

      // Act
      engine.submitAction(0, { type: "move", side: 0, moveIndex: 0 });
      engine.submitAction(1, { type: "move", side: 1, moveIndex: 0 });

      // Assert
      expect(events).toContainEqual({
        type: "message",
        text: "The substitute took damage!",
      });
      expect(engine.state.sides[1].active[0]?.substituteHp).toBe(expectedSubstituteHp);
      expect(engine.state.sides[1].active[0]?.pokemon.currentHp).toBe(startingHp);
    });

    it("given a substitute that breaks, when damage exceeds sub HP, then substitute is removed", () => {
      // Arrange — substitute has 5 HP, damage is 10
      const { engine, events } = createEngine();
      engine.start();

      const blastoise2 = engine.state.sides[1].active[0];
      if (!blastoise2) throw new Error("Expected active pokemon on side 1");
      blastoise2.substituteHp = 5;
      blastoise2.volatileStatuses.set(CORE_VOLATILE_IDS.substitute, { turnsLeft: -1 });

      // Act
      engine.submitAction(0, { type: "move", side: 0, moveIndex: 0 });
      engine.submitAction(1, { type: "move", side: 1, moveIndex: 0 });

      // Assert
      const subEnd = events.find(
        (e) => e.type === "volatile-end" && "volatile" in e && e.volatile === CORE_VOLATILE_IDS.substitute,
      );
      expect(subEnd).toBeDefined();
      expect(engine.state.sides[1].active[0]?.substituteHp).toBe(0);
    });
  });

  describe("effectiveness event", () => {
    it("given a move with non-1x effectiveness, when damage is calculated, then effectiveness event is emitted", () => {
      // Arrange
      const ruleset = new MockRuleset();
      (ruleset as unknown as Record<string, unknown>).calculateDamage = () => ({
        damage: 20,
        effectiveness: 2,
        isCrit: false,
        randomFactor: 1,
      });

      const { engine, events } = createEngine({ ruleset });
      engine.start();

      // Act
      engine.submitAction(0, { type: "move", side: 0, moveIndex: 0 });
      engine.submitAction(1, { type: "move", side: 1, moveIndex: 0 });

      // Assert
      expect(events).toContainEqual({
        type: "effectiveness",
        multiplier: 2,
      });
    });
  });

  describe("held item activation event", () => {
    it("given a held item activates without being consumed, when the engine processes the item result, then item-activate is emitted", () => {
      // Arrange
      const team1 = [
        createTestPokemon(MOCK_SPECIES_IDS.charizard, 50, {
          uid: "charizard-1",
          nickname: "Charizard",
          moves: [createMockMoveSlot(CORE_MOVE_IDS.tackle)],
          heldItem: CORE_ITEM_IDS.choiceBand,
          currentHp: 200,
        }),
      ];

      const ruleset = new MockRuleset();
      (ruleset as unknown as Record<string, unknown>).hasHeldItems = () => true;
      (ruleset as unknown as Record<string, unknown>).applyHeldItem = () => ({
        activated: true,
        effects: [],
        messages: [],
      });

      const { engine, events } = createEngine({ team1, ruleset });
      engine.start();

      // Act
      engine.submitAction(0, { type: "move", side: 0, moveIndex: 0 });
      engine.submitAction(1, { type: "move", side: 1, moveIndex: 0 });

      // Assert
      const activateEvent = events.find((e) => e.type === "item-activate");
      expect(activateEvent).toEqual(
        expect.objectContaining({
          type: "item-activate",
          side: 0,
          pokemon: "Charizard",
          item: CORE_ITEM_IDS.choiceBand,
        }),
      );
      const consumedEvent = events.find((e) => e.type === "item-consumed");
      expect(consumedEvent).toBeUndefined();
      expect(engine.getActive(0)?.pokemon.heldItem).toBe(CORE_ITEM_IDS.choiceBand);
    });
  });

  describe("getAvailableMoves with disabled move", () => {
    it("given a pokemon with a disabled move, when getAvailableMoves is called, then move is marked disabled", () => {
      // Arrange
      const team1 = [
        createTestPokemon(MOCK_SPECIES_IDS.charizard, 50, {
          uid: "charizard-1",
          nickname: "Charizard",
          moves: [
            createMockMoveSlot(CORE_MOVE_IDS.tackle),
            createMockMoveSlot(GEN1_MOVE_IDS.scratch),
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

      const { engine } = createEngine({ team1 });
      engine.start();

      // Disable tackle
      engine.state.sides[0].active[0]?.volatileStatuses.set(CORE_VOLATILE_IDS.disable, {
        turnsLeft: 3,
        data: { moveId: CORE_MOVE_IDS.tackle },
      });

      // Act
      const moves = engine.getAvailableMoves(0);

      // Assert
      const tackle = moves.find((m) => m.moveId === CORE_MOVE_IDS.tackle);
      const scratch = moves.find((m) => m.moveId === GEN1_MOVE_IDS.scratch);
      expect(tackle?.disabled).toBe(true);
      expect(tackle?.disabledReason).toBe("Move is disabled");
      expect(scratch?.disabled).toBe(false);
    });
  });

  describe("getAvailableMoves with unknown move data", () => {
    it("given a pokemon with a move not in the data manager, when getAvailableMoves is called, then the move is skipped and a warning is emitted", () => {
      // Arrange
      const team1 = [
        createTestPokemon(MOCK_SPECIES_IDS.charizard, 50, {
          uid: "charizard-1",
          nickname: "Charizard",
          moves: [createSyntheticMissingMoveSlot()],
          currentHp: 200,
        }),
      ];

      const { engine, events } = createEngine({ team1 });
      engine.start();

      // Act
      const moves = engine.getAvailableMoves(0);

      // Assert — unknown move is excluded; engine emits a warning
      expect(moves).toHaveLength(0);
      expect(events).toContainEqual({
        type: "engine-warning",
        message: `Move "${SYNTHETIC_MISSING_MOVE_ID}" not found in data for Pokémon "6". Slot skipped.`,
      });
    });

    it("given a pokemon locked into a missing forced move, when getAvailableMoves is called, then the move is skipped and a warning is emitted", () => {
      // Arrange
      const team1 = [
        createTestPokemon(MOCK_SPECIES_IDS.charizard, 50, {
          uid: "charizard-1",
          nickname: "Charizard",
          moves: [
            createSyntheticMissingMoveSlot(),
            createMockMoveSlot(GEN1_MOVE_IDS.scratch, { currentPP: 20, maxPP: 20 }),
          ],
          currentHp: 200,
        }),
      ];

      const { engine, events } = createEngine({ team1 });
      engine.start();

      const active = engine.state.sides[0].active[0];
      expect(active).not.toBeNull();
      active!.forcedMove = { moveIndex: 0, moveId: SYNTHETIC_MISSING_MOVE_ID };

      // Act
      const moves = engine.getAvailableMoves(0);

      // Assert — the missing forced move is skipped, and the remaining move stays locked
      expect(moves).toHaveLength(1);
      expect(moves[0]).toEqual(
        expect.objectContaining({
          index: 1,
          moveId: GEN1_MOVE_IDS.scratch,
          disabled: true,
          disabledReason: "Locked into move",
        }),
      );
      expect(events).toContainEqual({
        type: "engine-warning",
        message: `Move "${SYNTHETIC_MISSING_MOVE_ID}" not found in data for Pokémon "6". Slot skipped.`,
      });
    });
  });

  describe("getDefenderSelectedMove with unknown move data", () => {
    it("given the defender selected a move missing from the data manager, when Sucker Punch resolves, then the engine emits a warning instead of silently treating it as switching", () => {
      // Source: Showdown sim/battle-actions.ts Gen 4 — Sucker Punch depends on the target's selected move.
      // Issue #843: missing move data must be surfaced distinctly from the normal null sentinel used for switching.
      const team2 = [
        createTestPokemon(MOCK_SPECIES_IDS.blastoise, 50, {
          uid: "blastoise-1",
          nickname: "Blastoise",
          moves: [createSyntheticMissingMoveSlot({ currentPP: 35, maxPP: 35 })],
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

      const { engine, events } = createEngine({ team2 });
      engine.start();

      // Simulate the turn state the engine would have when resolving Sucker Punch.
      (engine as any).currentTurnActions = [
        { type: "move", side: 0, moveIndex: 0 },
        { type: "move", side: 1, moveIndex: 0 },
      ];

      const defenderSelectedMove = (engine as any).getDefenderSelectedMove(1);

      expect(defenderSelectedMove).toBeNull();
      const warning = events.find((e) => e.type === "engine-warning");
      expect(warning).toEqual(
        expect.objectContaining({
          type: "engine-warning",
          message: expect.stringContaining("defenderSelectedMove"),
        }),
      );
    });
  });

  describe("sleep status handling", () => {
    it("given a sleeping pokemon, when it tries to move, then it cannot act", () => {
      // Arrange
      const { engine, events } = createEngine();
      engine.start();

      // Put Blastoise to sleep with turns remaining
      engine.state.sides[1].active[0]!.pokemon.status = CORE_STATUS_IDS.sleep;
      // Use a volatile to track sleep turns (the engine checks for this)
      (engine.state.sides[1].active[0]!.volatileStatuses as Map<string, VolatileStatusState>).set(
        CORE_VOLATILE_IDS.sleepCounter,
        {
          turnsLeft: 3,
        },
      );

      // Act
      engine.submitAction(0, { type: "move", side: 0, moveIndex: 0 });
      engine.submitAction(1, { type: "move", side: 1, moveIndex: 0 });

      // Assert
      expect(events).toContainEqual({
        type: "message",
        text: "Blastoise is fast asleep!",
      });
      expect(
        events.find((e) => e.type === "move-start" && "pokemon" in e && e.pokemon === "Blastoise"),
      ).toBeUndefined();
      expect(engine.state.sides[1].active[0]?.pokemon.status).toBe(CORE_STATUS_IDS.sleep);
    });

    it("given a sleeping pokemon with 0 turns left, when it tries to move, then it wakes up", () => {
      // Arrange
      const { engine, events } = createEngine();
      engine.start();

      engine.state.sides[1].active[0]!.pokemon.status = CORE_STATUS_IDS.sleep;
      (engine.state.sides[1].active[0]!.volatileStatuses as Map<string, VolatileStatusState>).set(
        CORE_VOLATILE_IDS.sleepCounter,
        {
          turnsLeft: 0,
        },
      );

      // Act
      engine.submitAction(0, { type: "move", side: 0, moveIndex: 0 });
      engine.submitAction(1, { type: "move", side: 1, moveIndex: 0 });

      // Assert
      expect(events).toContainEqual({
        type: "status-cure",
        side: 1,
        pokemon: "Blastoise",
        status: CORE_STATUS_IDS.sleep,
      });
      expect(
        events.find((e) => e.type === "move-start" && "pokemon" in e && e.pokemon === "Blastoise"),
      ).toEqual(
        expect.objectContaining({
          type: "move-start",
          side: 1,
          pokemon: "Blastoise",
          move: CORE_MOVE_IDS.tackle,
        }),
      );
      expect(engine.state.sides[1].active[0]?.pokemon.status).toBeNull();
    });
  });

  describe("sleep-counter startTime storage", () => {
    it("given self-inflicted sleep via Rest (turnsLeft=2), when applyPrimaryStatus runs, then sleep-counter stores startTime=2", () => {
      // Source: Showdown data/mods/gen5/conditions.ts -- slp.onSwitchIn reads effectState.startTime
      // startTime must be stored at infliction so Gen 5 can reset turnsLeft on switch-in.
      // Arrange
      const ruleset = new MockRuleset();
      ruleset.executeMoveEffect = () => ({
        statusInflicted: null,
        volatileInflicted: null,
        statChanges: [],
        recoilDamage: 0,
        healAmount: 0,
        switchOut: false,
        messages: [],
        selfStatusInflicted: CORE_STATUS_IDS.sleep as const,
        selfVolatileData: { turnsLeft: 2 },
      });

      const { engine } = createEngine({ ruleset, seed: 42 });
      engine.start();

      // Act
      engine.submitAction(0, { type: "move", side: 0, moveIndex: 0 });
      engine.submitAction(1, { type: "move", side: 1, moveIndex: 0 });

      // Assert — attacker (Charizard, side 0) self-inflicted sleep with turnsLeft=2
      const attacker = engine.state.sides[0].active[0];
      expect(attacker?.pokemon.status).toBe(CORE_STATUS_IDS.sleep);
      const sleepCounter = attacker?.volatileStatuses.get(CORE_VOLATILE_IDS.sleepCounter);
      expect(sleepCounter).toBeDefined();
      expect(sleepCounter!.turnsLeft).toBe(2);
      // The key assertion: startTime must equal the turnsLeft value at infliction time
      // Source: Showdown data/mods/gen5/conditions.ts — slp.onSwitchIn uses effectState.startTime
      const startTime = (sleepCounter!.data as Record<string, unknown>)?.startTime;
      expect(startTime).toBe(2);
    });
  });

  describe("freeze status handling", () => {
    it("given a frozen pokemon, when freeze thaw fails, then it cannot act", () => {
      // Arrange — use a ruleset where freeze never thaws
      const ruleset = new MockRuleset();
      (ruleset as unknown as Record<string, unknown>).checkFreezeThaw = () => false;

      const { engine, events } = createEngine({ ruleset });
      engine.start();

      engine.state.sides[1].active[0]!.pokemon.status = CORE_STATUS_IDS.freeze;

      // Act
      engine.submitAction(0, { type: "move", side: 0, moveIndex: 0 });
      engine.submitAction(1, { type: "move", side: 1, moveIndex: 0 });

      // Assert
      expect(events).toContainEqual({
        type: "message",
        text: "Blastoise is frozen solid!",
      });
      expect(
        events.find((e) => e.type === "move-start" && "pokemon" in e && e.pokemon === "Blastoise"),
      ).toBeUndefined();
      expect(engine.state.sides[1].active[0]?.pokemon.status).toBe(CORE_STATUS_IDS.freeze);
    });

    it("given a frozen pokemon, when freeze thaw succeeds, then it can act", () => {
      // Arrange — use a ruleset where freeze always thaws
      const ruleset = new MockRuleset();
      (ruleset as unknown as Record<string, unknown>).checkFreezeThaw = () => true;

      const { engine, events } = createEngine({ ruleset });
      engine.start();

      engine.state.sides[1].active[0]!.pokemon.status = CORE_STATUS_IDS.freeze;

      // Act
      engine.submitAction(0, { type: "move", side: 0, moveIndex: 0 });
      engine.submitAction(1, { type: "move", side: 1, moveIndex: 0 });

      // Assert
      expect(events).toContainEqual({
        type: "status-cure",
        side: 1,
        pokemon: "Blastoise",
        status: CORE_STATUS_IDS.freeze,
      });
      expect(
        events.find((e) => e.type === "move-start" && "pokemon" in e && e.pokemon === "Blastoise"),
      ).toEqual(
        expect.objectContaining({
          type: "move-start",
          side: 1,
          pokemon: "Blastoise",
          move: CORE_MOVE_IDS.tackle,
        }),
      );
      expect(engine.state.sides[1].active[0]?.pokemon.status).toBeNull();
    });

    it("given a frozen pokemon using a defrost move, when RNG would never thaw, then the move still thaws the user", () => {
      // Arrange — ruleset always fails freeze thaw RNG; defrost flag must guarantee thaw
      const ruleset = new MockRuleset();
      (ruleset as unknown as Record<string, unknown>).checkFreezeThaw = () => false;

      const team1 = [
        createTestPokemon(MOCK_SPECIES_IDS.charizard, 50, {
          uid: "charizard-defrost",
          nickname: "Charizard",
          moves: [createMockMoveSlot(GEN3_MOVE_IDS.flameWheel)],
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

      const { engine, events } = createEngine({ ruleset, team1 });
      engine.start();

      // Freeze side 0 (Charizard)
      engine.state.sides[0].active[0]!.pokemon.status = CORE_STATUS_IDS.freeze;

      // Act — Charizard uses flame-wheel (defrost move), opponent uses tackle
      engine.submitAction(0, { type: "move", side: 0, moveIndex: 0 });
      engine.submitAction(1, { type: "move", side: 1, moveIndex: 0 });

      // Assert — status-cure for freeze must be emitted despite RNG always failing
      expect(events).toContainEqual({
        type: "status-cure",
        side: 0,
        pokemon: "Charizard",
        status: CORE_STATUS_IDS.freeze,
      });
      expect(
        events.find((e) => e.type === "move-start" && "pokemon" in e && e.pokemon === "Charizard"),
      ).toEqual(
        expect.objectContaining({
          type: "move-start",
          side: 0,
          pokemon: "Charizard",
          move: GEN3_MOVE_IDS.flameWheel,
        }),
      );

      // Charizard must no longer be frozen
      expect(engine.state.sides[0].active[0]?.pokemon.status).toBeNull();
    });
  });

  describe("confusion self-hit", () => {
    it("given seed 0 and a confused pokemon, when the self-hit branch resolves, then confusion damage is applied instead of the selected move", () => {
      // Seed 0 deterministically reaches the self-hit branch in the current PRNG flow.
      const { engine, events } = createEngine({ seed: 0 });
      engine.start();

      engine.state.sides[1].active[0]?.volatileStatuses.set(CORE_VOLATILE_IDS.confusion, { turnsLeft: 5 });

      engine.submitAction(0, { type: "move", side: 0, moveIndex: 0 });
      engine.submitAction(1, { type: "move", side: 1, moveIndex: 0 });

      expect(
        events.filter(
          (event) =>
            event.type === "damage" ||
            (event.type === "message" &&
              (event.text === "Blastoise is confused!" ||
                event.text === "It hurt itself in its confusion!")),
        ),
      ).toEqual([
        {
          type: "damage",
          side: 1,
          pokemon: "Blastoise",
          amount: 10,
          currentHp: 144,
          maxHp: 154,
          source: CORE_MOVE_IDS.tackle,
        },
        {
          type: "message",
          text: "Blastoise is confused!",
        },
        {
          type: "message",
          text: "It hurt itself in its confusion!",
        },
        {
          type: "damage",
          side: 1,
          pokemon: "Blastoise",
          amount: 19,
          currentHp: 125,
          maxHp: 154,
          source: CORE_VOLATILE_IDS.confusion,
        },
      ]);
      expect(
        events.filter(
          (event) =>
            event.type === "move-start" && "pokemon" in event && event.pokemon === "Blastoise",
        ),
      ).toEqual([]);
    });
  });

  describe("confusion ending", () => {
    it("given confusion with 0 turns left, when pokemon tries to move, then confusion ends", () => {
      // Arrange
      const { engine, events } = createEngine();
      engine.start();

      engine.state.sides[1].active[0]?.volatileStatuses.set(CORE_VOLATILE_IDS.confusion, { turnsLeft: 0 });

      // Act
      engine.submitAction(0, { type: "move", side: 0, moveIndex: 0 });
      engine.submitAction(1, { type: "move", side: 1, moveIndex: 0 });

      // Assert
      expect(events).toContainEqual({
        type: "volatile-end",
        side: 1,
        pokemon: "Blastoise",
        volatile: CORE_VOLATILE_IDS.confusion,
      });
      expect(engine.state.sides[1].active[0]?.volatileStatuses.has(CORE_VOLATILE_IDS.confusion)).toBe(false);
      expect(
        events.find((e) => e.type === "move-start" && "pokemon" in e && e.pokemon === "Blastoise"),
      ).toEqual(
        expect.objectContaining({
          type: "move-start",
          side: 1,
          pokemon: "Blastoise",
          move: CORE_MOVE_IDS.tackle,
        }),
      );
    });
  });

  describe("switch during mid-turn faint", () => {
    it("given a pokemon faints mid-turn to move damage, when the fainted pokemon should act next, then it skips", () => {
      // Arrange — Blastoise at 1 HP, Charizard faster
      const team2 = [
        createTestPokemon(MOCK_SPECIES_IDS.blastoise, 50, {
          uid: "blastoise-1",
          nickname: "Blastoise",
          moves: [createMockMoveSlot(CORE_MOVE_IDS.tackle)],
          calculatedStats: {
            hp: 200,
            attack: 100,
            defense: 100,
            spAttack: 100,
            spDefense: 100,
            speed: 80,
          },
          currentHp: 1,
        }),
      ];

      const { engine, events } = createEngine({ team2 });
      engine.start();
      engine.state.sides[1].active[0]!.pokemon.currentHp = 1;

      // Act
      engine.submitAction(0, { type: "move", side: 0, moveIndex: 0 });
      engine.submitAction(1, { type: "move", side: 1, moveIndex: 0 });

      // Assert — Blastoise fainted, so it shouldn't have a move-start event
      const blastoiseMoves = events.filter(
        (e) => e.type === "move-start" && "pokemon" in e && e.pokemon === "Blastoise",
      );
      expect(blastoiseMoves).toHaveLength(0);
    });
  });

  describe("no active pokemon edge case", () => {
    it("given no active pokemon, when getAvailableMoves is called, then empty array returned", () => {
      // Arrange
      const { engine } = createEngine();
      // Don't start — no active pokemon set

      // Act
      const moves = engine.getAvailableMoves(0);

      // Assert
      expect(moves).toEqual([]);
    });
  });

  describe("getActive returns null when no active", () => {
    it("given engine not started, when getActive is called, then null is returned", () => {
      // Arrange
      const { engine } = createEngine();

      // Act
      const side0Active = engine.getActive(0);
      const side1Active = engine.getActive(1);

      // Assert
      expect(side0Active).toBeNull();
      expect(side1Active).toBeNull();
      expect(engine.getState().sides[0].active).toEqual([]);
      expect(engine.getState().sides[1].active).toEqual([]);
    });
  });

  describe("weather damage with weather effects", () => {
    it("given weather with damage and a ruleset that applies weather effects, when end of turn runs, then the exact weather-damage event is emitted", () => {
      // Arrange
      const ruleset = new MockRuleset();
      (ruleset as unknown as Record<string, unknown>).hasWeather = () => true;
      (ruleset as unknown as Record<string, unknown>).applyWeatherEffects = () => [
        { side: 0, pokemon: "Charizard", damage: 12, message: "Hurt by sand" },
      ];
      const patchedRuleset = Object.create(ruleset) as MockRuleset;
      patchedRuleset.getEndOfTurnOrder = () => [
        CORE_END_OF_TURN_EFFECT_IDS.weatherDamage,
        CORE_END_OF_TURN_EFFECT_IDS.statusDamage,
      ];

      const { engine, events } = createEngine({ ruleset: patchedRuleset });
      engine.start();

      engine.state.weather = { type: "sand", turnsLeft: 5, source: "sandstream" };
      const startingHp = engine.state.sides[0].active[0]?.pokemon.currentHp ?? 0;

      // Act
      engine.submitAction(0, { type: "move", side: 0, moveIndex: 0 });
      engine.submitAction(1, { type: "move", side: 1, moveIndex: 0 });

      // Assert
      expect(
        events.filter((e) => e.type === "damage" && "source" in e && e.source === "weather-sand"),
      ).toEqual([
        {
          type: "damage",
          side: 0,
          pokemon: "Charizard",
          amount: 12,
          currentHp: 131,
          maxHp: 153,
          source: "weather-sand",
        },
      ]);
      const charizard = engine.state.sides[0].active[0];
      // Charizard takes 10 from Blastoise's tackle, then 12 from sand at end of turn.
      expect(charizard?.pokemon.currentHp).toBe(startingHp - 10 - 12);
    });
  });

  describe("speed tiebreak in turn order", () => {
    it("given two pokemon with the same speed, when turn order is resolved with fixed seeds, then the PRNG decides the first mover deterministically", () => {
      const getFirstMover = (seed: number) => {
        const t1 = [
          createTestPokemon(MOCK_SPECIES_IDS.charizard, 50, {
            uid: "mon-a",
            nickname: "MonA",
            moves: [createMockMoveSlot(CORE_MOVE_IDS.tackle)],
            currentHp: 200,
          }),
        ];
        const t2 = [
          createTestPokemon(MOCK_SPECIES_IDS.blastoise, 50, {
            uid: "mon-b",
            nickname: "MonB",
            moves: [createMockMoveSlot(CORE_MOVE_IDS.tackle)],
            currentHp: 200,
          }),
        ];

        // Use a ruleset that gives both Pokemon the same speed (100) to force a tie.
        const ruleset = new MockRuleset();
        (ruleset as unknown as Record<string, unknown>).calculateStats = () => ({
          hp: 200,
          attack: 100,
          defense: 100,
          spAttack: 100,
          spDefense: 100,
          speed: 100,
        });

        const { engine, events } = createEngine({ team1: t1, team2: t2, seed, ruleset });
        engine.start();
        engine.submitAction(0, { type: "move", side: 0, moveIndex: 0 });
        engine.submitAction(1, { type: "move", side: 1, moveIndex: 0 });

        const moveStarts = events.filter((e) => e.type === "move-start");
        if (moveStarts.length > 0 && moveStarts[0]?.type === "move-start") {
          return moveStarts[0].pokemon;
        }
        throw new Error("Expected at least one move-start event");
      };

      expect(getFirstMover(0)).toBe("MonB");
      expect(getFirstMover(1)).toBe("MonA");
    });
  });
});
