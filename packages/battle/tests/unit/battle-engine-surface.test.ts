import {
  CORE_ABILITY_IDS,
  CORE_MOVE_IDS,
  type DataManager,
  type PokemonInstance,
  type PokemonSpeciesData,
} from "@pokemon-lib-ts/core";
import { GEN1_SPECIES_IDS } from "@pokemon-lib-ts/gen1";
import type { BattleConfig } from "../../src/context";
import { BattleEngine } from "../../src/engine";
import type { BattleEvent } from "../../src/events";
import { createTestPokemon } from "../../src/utils";
import { createMockDataManager } from "../helpers/mock-data-manager";
import { MockRuleset } from "../helpers/mock-ruleset";
import { createMockMoveSlot } from "../helpers/move-slot";

class TrappedSwitchRuleset extends MockRuleset {
  override canSwitch(): boolean {
    return false;
  }
}

class ValidatingRuleset extends MockRuleset {
  readonly validationCalls: Array<{ speciesId: number; pokemonUid: string }> = [];
  private readonly invalidMessages = new Map<string, string[]>();

  setInvalidPokemon(pokemonUid: string, errors: readonly string[]): void {
    this.invalidMessages.set(pokemonUid, [...errors]);
  }

  override validatePokemon(pokemon: PokemonInstance, species: PokemonSpeciesData) {
    this.validationCalls.push({ speciesId: species.id, pokemonUid: pokemon.uid });

    const errors = this.invalidMessages.get(pokemon.uid);
    if (errors) {
      return { valid: false, errors };
    }

    return { valid: true, errors: [] };
  }
}

class AbilityAwareMockRuleset extends MockRuleset {
  override hasAbilities(): boolean {
    return true;
  }
}

function createTestEngine(overrides?: {
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
    createTestPokemon(GEN1_SPECIES_IDS.charizard, 50, {
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
    createTestPokemon(GEN1_SPECIES_IDS.blastoise, 50, {
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
  };

  const engine = new BattleEngine(config, ruleset, dataManager);
  engine.on((e) => events.push(e));

  return { engine, ruleset, events };
}

describe("BattleEngine surface", () => {
  describe("constructor", () => {
    it("given a valid config, when engine is created, then initial phase is battle-start", () => {
      const { engine } = createTestEngine();

      expect(engine.getPhase()).toBe("battle-start");
    });

    it("given a valid config, when engine is created, then battle is not ended", () => {
      const { engine } = createTestEngine();

      expect(engine.isEnded()).toBe(false);
      expect(engine.getWinner()).toBeNull();
    });

    it("given a valid config, when engine is created, then teams are stored", () => {
      const { engine } = createTestEngine();

      expect(engine.state.sides[0].team).toHaveLength(1);
      expect(engine.state.sides[1].team).toHaveLength(1);
    });

    it("given caller-owned team members, when engine is created, then constructor state stays engine-owned and does not mutate the caller objects", () => {
      const team1 = [
        createTestPokemon(GEN1_SPECIES_IDS.pikachu, 5, {
          currentHp: 1,
          calculatedStats: {
            hp: 1,
            attack: 1,
            defense: 1,
            spAttack: 1,
            spDefense: 1,
            speed: 1,
          },
        }),
      ];
      const originalPokemon = team1[0]!;
      const originalMoves = originalPokemon.moves;
      const originalEvs = originalPokemon.evs;
      const originalIvs = originalPokemon.ivs;
      const originalCalculatedStats = originalPokemon.calculatedStats;

      const { engine } = createTestEngine({ team1 });

      const enginePokemon = engine.getTeam(0)[0]!;
      expect(enginePokemon).not.toBe(originalPokemon);
      expect(enginePokemon.moves).not.toBe(originalMoves);
      expect(enginePokemon.evs).not.toBe(originalEvs);
      expect(enginePokemon.ivs).not.toBe(originalIvs);
      expect(enginePokemon.calculatedStats).not.toBe(originalCalculatedStats);

      expect(originalPokemon.currentHp).toBe(1);
      expect(originalPokemon.calculatedStats).toEqual({
        hp: 1,
        attack: 1,
        defense: 1,
        spAttack: 1,
        spDefense: 1,
        speed: 1,
      });

      originalPokemon.currentHp = 7;
      originalPokemon.moves[0]!.currentPP = 1;
      originalPokemon.evs = { ...originalPokemon.evs, hp: 200 };

      // Source: createTestPokemon recalculates current HP from the cloned engine-owned stats.
      expect(enginePokemon.currentHp).toBe(enginePokemon.calculatedStats.hp);
      // Source: createMockMoveSlot(CORE_MOVE_IDS.tackle) derives Tackle PP from canonical move data.
      expect(enginePokemon.moves[0]!.currentPP).toBe(
        createMockMoveSlot(CORE_MOVE_IDS.tackle).currentPP,
      );
      expect(enginePokemon.evs.hp).toBe(0);
    });

    it("given a ruleset whose generation does not match the battle config, when engine is created, then it throws", () => {
      const ruleset = new MockRuleset();
      Object.defineProperty(ruleset, "generation", { value: 9 });

      const dataManager = createMockDataManager();
      const config: BattleConfig = {
        generation: 1,
        format: "singles",
        teams: [
          [createTestPokemon(GEN1_SPECIES_IDS.charizard, 50)],
          [createTestPokemon(GEN1_SPECIES_IDS.blastoise, 50)],
        ],
        seed: 12345,
      };

      expect(() => new BattleEngine(config, ruleset, dataManager)).toThrow(
        "BattleEngine: ruleset generation 9 does not match battle generation 1",
      );
    });

    it("given a non-singles battle format, when engine is created, then it rejects unsupported multi-active formats", () => {
      const dataManager = createMockDataManager();
      const config: BattleConfig = {
        generation: 1,
        format: "doubles",
        teams: [
          [createTestPokemon(GEN1_SPECIES_IDS.charizard, 50)],
          [createTestPokemon(GEN1_SPECIES_IDS.blastoise, 50)],
        ],
        seed: 12345,
      };

      expect(() => new BattleEngine(config, new MockRuleset(), dataManager)).toThrow(
        'BattleEngine: battle format "doubles" is not supported',
      );
    });

    it("given a battle team, when engine is created, then the ruleset validates each pokemon during setup", () => {
      const ruleset = new ValidatingRuleset();

      createTestEngine({ ruleset });

      expect(ruleset.validationCalls).toEqual([
        { speciesId: 6, pokemonUid: "charizard-1" },
        { speciesId: 9, pokemonUid: "blastoise-1" },
      ]);
    });

    it("given an illegal pokemon, when engine is created, then battle setup fails fast with the validation errors", () => {
      const ruleset = new ValidatingRuleset();
      ruleset.setInvalidPokemon("charizard-1", [`Move "${CORE_MOVE_IDS.sketch}" is not legal`]);

      expect(() => createTestEngine({ ruleset })).toThrow(
        `BattleEngine: battle validation failed: teams[0][0]: Move "${CORE_MOVE_IDS.sketch}" is not legal`,
      );
      expect(ruleset.validationCalls).toEqual([
        { speciesId: 6, pokemonUid: "charizard-1" },
        { speciesId: 9, pokemonUid: "blastoise-1" },
      ]);
    });
  });

  describe("validateConfig", () => {
    it("given a valid singles setup, when validateConfig is called, then it returns a valid result", () => {
      const ruleset = new MockRuleset();
      const dataManager = createMockDataManager();
      const team1 = [createTestPokemon(GEN1_SPECIES_IDS.charizard, 50)];
      const team2 = [createTestPokemon(GEN1_SPECIES_IDS.blastoise, 50)];

      const result = BattleEngine.validateConfig(
        {
          generation: 1,
          format: "singles",
          teams: [team1, team2],
          seed: 12345,
        },
        ruleset,
        dataManager,
      );

      expect(result).toEqual({ valid: true, errors: [] });
    });

    it("given an unknown species id, when validateConfig is called, then it returns a structured species error", () => {
      const dataManager = createMockDataManager();
      const result = BattleEngine.validateConfig(
        {
          generation: 1,
          format: "singles",
          teams: [
            [createTestPokemon(999, 50, { uid: "missing-species" })],
            [createTestPokemon(GEN1_SPECIES_IDS.blastoise, 50)],
          ],
          seed: 12345,
        },
        new MockRuleset(),
        dataManager,
      );

      expect(result.valid).toBe(false);
      expect(result.errors).toContainEqual({
        entity: "species",
        id: "999",
        field: "teams[0][0].speciesId",
        message: 'Species "999" is not available in the loaded data',
      });
    });

    it("given an unknown move id, when validateConfig is called, then it returns a structured move error", () => {
      const dataManager = createMockDataManager();
      const missingMoveSlot = {
        ...createMockMoveSlot(CORE_MOVE_IDS.tackle),
        moveId: "missing-move",
      };
      const result = BattleEngine.validateConfig(
        {
          generation: 1,
          format: "singles",
          teams: [
            [
              createTestPokemon(GEN1_SPECIES_IDS.charizard, 50, {
                uid: "charizard-1",
                moves: [missingMoveSlot],
              }),
            ],
            [createTestPokemon(GEN1_SPECIES_IDS.blastoise, 50)],
          ],
          seed: 12345,
        },
        new MockRuleset(),
        dataManager,
      );

      expect(result.valid).toBe(false);
      expect(result.errors).toContainEqual({
        entity: "move",
        id: "missing-move",
        field: "teams[0][0].moves[0].moveId",
        message: 'Move "missing-move" is not available in Gen 1',
      });
    });

    it("given an unknown held item id, when validateConfig is called, then it returns a structured item error", () => {
      const dataManager = createMockDataManager();
      const result = BattleEngine.validateConfig(
        {
          generation: 1,
          format: "singles",
          teams: [
            [
              createTestPokemon(GEN1_SPECIES_IDS.charizard, 50, {
                uid: "charizard-1",
                heldItem: "missing-item",
              }),
            ],
            [createTestPokemon(GEN1_SPECIES_IDS.blastoise, 50)],
          ],
          seed: 12345,
        },
        new MockRuleset(),
        dataManager,
      );

      expect(result.valid).toBe(false);
      expect(result.errors).toContainEqual({
        entity: "item",
        id: "missing-item",
        field: "teams[0][0].heldItem",
        message: 'Item "missing-item" is not available in Gen 1',
      });
    });

    it("given abilities are supported but the ability id is unknown, when validateConfig is called, then it returns a structured ability error", () => {
      const dataManager = createMockDataManager();
      const result = BattleEngine.validateConfig(
        {
          generation: 4,
          format: "singles",
          teams: [
            [
              createTestPokemon(GEN1_SPECIES_IDS.charizard, 50, {
                uid: "charizard-1",
                ability: "missing-ability",
              }),
            ],
            [
              createTestPokemon(GEN1_SPECIES_IDS.blastoise, 50, {
                ability: CORE_ABILITY_IDS.blaze,
              }),
            ],
          ],
          seed: 12345,
        },
        new AbilityAwareMockRuleset().setGenerationForTest(4),
        dataManager,
      );

      expect(result.valid).toBe(false);
      expect(result.errors).toContainEqual({
        entity: "ability",
        id: "missing-ability",
        field: "teams[0][0].ability",
        message: 'Ability "missing-ability" is not available in Gen 4',
      });
    });

    it("given a side has no pokemon, when validateConfig is called, then it returns a structured team error", () => {
      const dataManager = createMockDataManager();
      const result = BattleEngine.validateConfig(
        {
          generation: 1,
          format: "singles",
          teams: [[], [createTestPokemon(GEN1_SPECIES_IDS.blastoise, 50)]],
          seed: 12345,
        },
        new MockRuleset(),
        dataManager,
      );

      expect(result.valid).toBe(false);
      expect(result.errors).toContainEqual({
        entity: "team",
        id: "side-0",
        field: "teams[0]",
        message: "Side 0 must have at least 1 Pokemon for singles battles",
      });
    });
  });

  describe("getAvailableMoves", () => {
    it("given an active pokemon with PP, when getAvailableMoves is called, then moves are returned", () => {
      const { engine } = createTestEngine();
      engine.start();

      const moves = engine.getAvailableMoves(0);
      const tackleSlot = createMockMoveSlot(CORE_MOVE_IDS.tackle);

      expect(moves).toHaveLength(1);
      expect(moves[0]?.moveId).toBe(CORE_MOVE_IDS.tackle);
      // Source: createMockMoveSlot(CORE_MOVE_IDS.tackle) derives the canonical PP value from move data.
      expect(moves[0]?.pp).toBe(tackleSlot.currentPP);
      expect(moves[0]?.disabled).toBe(false);
    });

    it("given an active pokemon with 0 PP, when getAvailableMoves is called, then move is marked disabled", () => {
      const team1 = [
        createTestPokemon(GEN1_SPECIES_IDS.charizard, 50, {
          uid: "charizard-1",
          nickname: "Charizard",
          moves: [createMockMoveSlot(CORE_MOVE_IDS.tackle, { currentPP: 0 })],
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
      const { engine } = createTestEngine({ team1 });
      engine.start();

      const moves = engine.getAvailableMoves(0);

      expect(moves[0]?.disabled).toBe(true);
      expect(moves[0]?.disabledReason).toBe("No PP remaining");
    });
  });

  describe("input isolation", () => {
    it("given caller-owned team members, when a full turn resolves, then the original pokemon objects stay unchanged", () => {
      const originalMoveSlot = createMockMoveSlot(CORE_MOVE_IDS.tackle);
      const team1 = [
        createTestPokemon(GEN1_SPECIES_IDS.charizard, 50, {
          uid: "charizard-1",
          nickname: "Charizard",
          currentHp: 17,
          moves: [originalMoveSlot],
          calculatedStats: {
            hp: 17,
            attack: 17,
            defense: 17,
            spAttack: 17,
            spDefense: 17,
            speed: 17,
          },
        }),
      ];

      const originalPokemon = team1[0]!;
      const originalMoves = structuredClone(originalPokemon.moves);
      const originalCalculatedStats = { ...originalPokemon.calculatedStats };

      const { engine } = createTestEngine({ team1 });
      engine.start();

      engine.submitAction(0, { type: "move", side: 0, moveIndex: 0 });
      engine.submitAction(1, { type: "move", side: 1, moveIndex: 0 });

      expect(originalPokemon.currentHp).toBe(17);
      expect(originalPokemon.moves).toEqual(originalMoves);
      expect(originalPokemon.calculatedStats).toEqual(originalCalculatedStats);
      expect(originalPokemon.timesAttacked).toBeUndefined();
      expect(originalPokemon.rageFistLastHitTurns).toBeUndefined();
    });

    it("given a voluntary switch path, when the battle state changes, then the original team objects stay unchanged", () => {
      const originalCharizardMove = createMockMoveSlot(CORE_MOVE_IDS.tackle);
      const originalPikachuMove = createMockMoveSlot(CORE_MOVE_IDS.tackle);
      const team1 = [
        createTestPokemon(GEN1_SPECIES_IDS.charizard, 50, {
          uid: "charizard-1",
          nickname: "Charizard",
          currentHp: 21,
          moves: [originalCharizardMove],
        }),
        createTestPokemon(GEN1_SPECIES_IDS.pikachu, 50, {
          uid: "pikachu-1",
          nickname: "Pikachu",
          currentHp: 11,
          moves: [originalPikachuMove],
        }),
      ];

      const originalTeamSnapshot = structuredClone(team1);

      const { engine } = createTestEngine({ team1 });
      engine.start();

      engine.submitAction(0, { type: "switch", side: 0, switchTo: 1 });
      engine.submitAction(1, { type: "move", side: 1, moveIndex: 0 });

      expect(team1).toEqual(originalTeamSnapshot);
      expect(engine.getTeam(0)[0]).not.toBe(team1[0]);
      expect(engine.getTeam(0)[1]).not.toBe(team1[1]);
    });

    it("given a pokemon takes damage and later switches out, when inspecting battle state, then the internal copy preserves that in-battle state without mutating the caller object", () => {
      const team1 = [
        createTestPokemon(GEN1_SPECIES_IDS.charizard, 50, {
          uid: "charizard-1",
          nickname: "Charizard",
          currentHp: 33,
          moves: [createMockMoveSlot(CORE_MOVE_IDS.tackle)],
        }),
        createTestPokemon(GEN1_SPECIES_IDS.pikachu, 50, {
          uid: "pikachu-1",
          nickname: "Pikachu",
          moves: [createMockMoveSlot(CORE_MOVE_IDS.tackle)],
        }),
      ];

      const originalCharizard = team1[0]!;
      const { engine } = createTestEngine({ team1 });
      engine.start();

      engine.submitAction(0, { type: "move", side: 0, moveIndex: 0 });
      engine.submitAction(1, { type: "move", side: 1, moveIndex: 0 });

      const damagedClone = engine.getTeam(0)[0]!;
      expect(damagedClone.currentHp).toBeLessThan(damagedClone.calculatedStats.hp);

      engine.submitAction(0, { type: "switch", side: 0, switchTo: 1 });
      engine.submitAction(1, { type: "move", side: 1, moveIndex: 0 });

      const benchedClone = engine.getTeam(0)[0]!;
      expect(benchedClone.uid).toBe("charizard-1");
      expect(benchedClone.currentHp).toBe(damagedClone.currentHp);
      expect(originalCharizard.currentHp).toBe(33);
    });
  });

  describe("getAvailableSwitches", () => {
    it("given a team with alive benched pokemon, when getAvailableSwitches is called, then valid slots are returned", () => {
      const team1 = [
        createTestPokemon(GEN1_SPECIES_IDS.charizard, 50, {
          uid: "charizard-1",
          nickname: "Charizard",
          currentHp: 200,
          calculatedStats: {
            hp: 200,
            attack: 100,
            defense: 100,
            spAttack: 100,
            spDefense: 100,
            speed: 120,
          },
        }),
        createTestPokemon(GEN1_SPECIES_IDS.pikachu, 50, {
          uid: "pikachu-1",
          nickname: "Pikachu",
          currentHp: 100,
          calculatedStats: {
            hp: 100,
            attack: 80,
            defense: 60,
            spAttack: 80,
            spDefense: 80,
            speed: 130,
          },
        }),
      ];
      const { engine } = createTestEngine({ team1 });
      engine.start();

      const switches = engine.getAvailableSwitches(0);

      expect(switches).toEqual([1]);
    });

    it("given a team with only one pokemon, when getAvailableSwitches is called, then empty array is returned", () => {
      const { engine } = createTestEngine();
      engine.start();

      const switches = engine.getAvailableSwitches(0);

      expect(switches).toEqual([]);
    });

    it("given the active pokemon has fainted but a healthy bench remains, when getAvailableSwitches is called, then trap checks are skipped for replacement flow", () => {
      const team1 = [
        createTestPokemon(GEN1_SPECIES_IDS.charizard, 50, {
          uid: "charizard-1",
          nickname: "Charizard",
          currentHp: 0,
          moves: [createMockMoveSlot(CORE_MOVE_IDS.tackle)],
        }),
        createTestPokemon(GEN1_SPECIES_IDS.pikachu, 50, {
          uid: "pikachu-1",
          nickname: "Pikachu",
          currentHp: 150,
          moves: [createMockMoveSlot(CORE_MOVE_IDS.tackle)],
        }),
      ];
      const { engine } = createTestEngine({
        team1,
        ruleset: new TrappedSwitchRuleset(),
      });
      engine.start();
      engine.state.sides[0].active[0]!.pokemon.currentHp = 0;

      const switches = engine.getAvailableSwitches(0);

      expect(switches).toEqual([1]);
    });
  });

  describe("event system", () => {
    it("given multiple listeners, when events are emitted, then all listeners receive events", () => {
      const { engine } = createTestEngine();
      const log1: BattleEvent[] = [];
      const log2: BattleEvent[] = [];
      engine.on((e) => log1.push(e));
      engine.on((e) => log2.push(e));

      engine.start();

      expect(log1.length).toBeGreaterThan(0);
      expect(log1.length).toBe(log2.length);
    });

    it("given a removed listener, when events are emitted, then removed listener does not receive events", () => {
      const { engine } = createTestEngine();
      const log: BattleEvent[] = [];
      const listener = (e: BattleEvent) => log.push(e);
      engine.on(listener);
      engine.off(listener);

      engine.start();

      expect(log).toHaveLength(0);
    });

    it("given a battle with events, when getEventLog is called, then all events are returned", () => {
      const { engine } = createTestEngine();

      engine.start();

      const log = engine.getEventLog();
      expect(log.length).toBeGreaterThan(0);
      expect(log[0]?.type).toBe("battle-start");
    });

    it("given a retrieved event log, when the caller mutates that array, then the engine's backing log is unchanged", () => {
      const { engine } = createTestEngine();
      engine.start();

      const log = engine.getEventLog();
      const originalLength = log.length;

      (log as BattleEvent[]).push({ type: "message", text: "mutated" });

      expect(log.length).toBe(originalLength + 1);
      expect(engine.getEventLog()).toHaveLength(originalLength);
    });
  });

  describe("serialization", () => {
    it("given a started battle, when serialized and deserialized, then state is preserved", () => {
      const ruleset = new MockRuleset();
      const dataManager = createMockDataManager();
      const { engine } = createTestEngine({ ruleset, dataManager });
      engine.start();

      const serialized = engine.serialize();
      const restored = BattleEngine.deserialize(serialized, ruleset, dataManager);

      expect(restored.getPhase()).toBe(engine.getPhase());
      expect(restored.getState().turnNumber).toBe(engine.getState().turnNumber);
      expect(restored.getState().generation).toBe(engine.getState().generation);
      expect(restored.isEnded()).toBe(engine.isEnded());
    });
  });
});
