import type { DataManager, PokemonInstance } from "@pokemon-lib-ts/core";
import { describe, expect, it } from "vitest";
import type { AbilityContext, AbilityResult, BattleConfig } from "../../src/context";
import { BattleEngine } from "../../src/engine";
import type { BattleEvent } from "../../src/events";
import type { VolatileStatusState } from "../../src/state";
import { createTestPokemon } from "../../src/utils";
import { createMockDataManager } from "../helpers/mock-data-manager";
import { MockRuleset } from "../helpers/mock-ruleset";

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

  const team2 = overrides?.team2 ?? [
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
      expect(engine.getState().sides[0].trainer).not.toBeNull();
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
      // Arrange — use real species IDs from mock data manager (6 = Charizard)
      const team1 = [
        createTestPokemon(6, 50, {
          uid: "charizard-1",
          nickname: "Charizard",
          moves: [{ moveId: "tackle", currentPP: 35, maxPP: 35, ppUps: 0 }],
          currentHp: 200,
        }),
      ];

      // Act
      const { engine } = createEngine({ team1 });

      // Assert — stats are populated from species data
      const pokemon = engine.state.sides[0].team[0] as PokemonInstance;
      expect(pokemon.calculatedStats).toBeDefined();
      expect(pokemon.calculatedStats?.hp).toBeGreaterThan(0);
    });
  });

  describe("start with abilities", () => {
    it("given a ruleset with abilities and slower lead, when battle starts, then abilities trigger in speed order", () => {
      // Arrange — side 1 (FastMon, speed 120) should trigger first
      // Use real species IDs (6=Charizard, 9=Blastoise) and override calculateStats
      // to return the desired speeds without recalculating from base stats.
      const team1 = [
        createTestPokemon(9, 50, {
          uid: "slow-mon",
          nickname: "SlowMon",
          moves: [{ moveId: "tackle", currentPP: 35, maxPP: 35, ppUps: 0 }],
          currentHp: 200,
        }),
      ];
      const team2 = [
        createTestPokemon(6, 50, {
          uid: "fast-mon",
          nickname: "FastMon",
          moves: [{ moveId: "tackle", currentPP: 35, maxPP: 35, ppUps: 0 }],
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
      engine.state.sides[1].active[0]?.volatileStatuses.set("protect", { turnsLeft: 1 });

      // Act
      engine.submitAction(0, { type: "move", side: 0, moveIndex: 0 });
      engine.submitAction(1, { type: "move", side: 1, moveIndex: 0 });

      // Assert
      const protectMsg = events.find(
        (e) => e.type === "message" && "text" in e && e.text.includes("protected itself"),
      );
      expect(protectMsg).toBeDefined();
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
      blastoise1.substituteHp = 50;
      blastoise1.volatileStatuses.set("substitute", { turnsLeft: -1 });

      // Act
      engine.submitAction(0, { type: "move", side: 0, moveIndex: 0 });
      engine.submitAction(1, { type: "move", side: 1, moveIndex: 0 });

      // Assert
      const subMsg = events.find(
        (e) => e.type === "message" && "text" in e && e.text.includes("substitute took damage"),
      );
      expect(subMsg).toBeDefined();
    });

    it("given a substitute that breaks, when damage exceeds sub HP, then substitute is removed", () => {
      // Arrange — substitute has 5 HP, damage is 10
      const { engine, events } = createEngine();
      engine.start();

      const blastoise2 = engine.state.sides[1].active[0];
      if (!blastoise2) throw new Error("Expected active pokemon on side 1");
      blastoise2.substituteHp = 5;
      blastoise2.volatileStatuses.set("substitute", { turnsLeft: -1 });

      // Act
      engine.submitAction(0, { type: "move", side: 0, moveIndex: 0 });
      engine.submitAction(1, { type: "move", side: 1, moveIndex: 0 });

      // Assert
      const subEnd = events.find(
        (e) => e.type === "volatile-end" && "volatile" in e && e.volatile === "substitute",
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
      const effEvent = events.find(
        (e) => e.type === "effectiveness" && "multiplier" in e && e.multiplier === 2,
      );
      expect(effEvent).toBeDefined();
    });
  });

  describe("getAvailableMoves with disabled move", () => {
    it("given a pokemon with a disabled move, when getAvailableMoves is called, then move is marked disabled", () => {
      // Arrange
      const team1 = [
        createTestPokemon(6, 50, {
          uid: "charizard-1",
          nickname: "Charizard",
          moves: [
            { moveId: "tackle", currentPP: 35, maxPP: 35, ppUps: 0 },
            { moveId: "scratch", currentPP: 35, maxPP: 35, ppUps: 0 },
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
      engine.state.sides[0].active[0]?.volatileStatuses.set("disable", {
        turnsLeft: 3,
        data: { moveId: "tackle" },
      });

      // Act
      const moves = engine.getAvailableMoves(0);

      // Assert
      const tackle = moves.find((m) => m.moveId === "tackle");
      const scratch = moves.find((m) => m.moveId === "scratch");
      expect(tackle?.disabled).toBe(true);
      expect(tackle?.disabledReason).toBe("Move is disabled");
      expect(scratch?.disabled).toBe(false);
    });
  });

  describe("getAvailableMoves with unknown move data", () => {
    it("given a pokemon with a move not in the data manager, when getAvailableMoves is called, then the move is skipped and a warning is emitted", () => {
      // Arrange
      const team1 = [
        createTestPokemon(6, 50, {
          uid: "charizard-1",
          nickname: "Charizard",
          moves: [{ moveId: "nonexistent-move", currentPP: 10, maxPP: 15, ppUps: 0 }],
          currentHp: 200,
        }),
      ];

      const { engine, events } = createEngine({ team1 });
      engine.start();

      // Act
      const moves = engine.getAvailableMoves(0);

      // Assert — unknown move is excluded; engine emits a warning
      expect(moves).toHaveLength(0);
      const warning = events.find((e) => e.type === "engine-warning");
      expect(warning).toBeDefined();
    });
  });

  describe("sleep status handling", () => {
    it("given a sleeping pokemon, when it tries to move, then it cannot act", () => {
      // Arrange
      const { engine, events } = createEngine();
      engine.start();

      // Put Blastoise to sleep with turns remaining
      engine.state.sides[1].active[0]!.pokemon.status = "sleep";
      // Use a volatile to track sleep turns (the engine checks for this)
      (engine.state.sides[1].active[0]!.volatileStatuses as Map<string, VolatileStatusState>).set(
        "sleep-counter",
        {
          turnsLeft: 3,
        },
      );

      // Act
      engine.submitAction(0, { type: "move", side: 0, moveIndex: 0 });
      engine.submitAction(1, { type: "move", side: 1, moveIndex: 0 });

      // Assert
      const sleepMsg = events.find(
        (e) => e.type === "message" && "text" in e && e.text.includes("fast asleep"),
      );
      expect(sleepMsg).toBeDefined();
    });

    it("given a sleeping pokemon with 0 turns left, when it tries to move, then it wakes up", () => {
      // Arrange
      const { engine, events } = createEngine();
      engine.start();

      engine.state.sides[1].active[0]!.pokemon.status = "sleep";
      (engine.state.sides[1].active[0]!.volatileStatuses as Map<string, VolatileStatusState>).set(
        "sleep-counter",
        {
          turnsLeft: 0,
        },
      );

      // Act
      engine.submitAction(0, { type: "move", side: 0, moveIndex: 0 });
      engine.submitAction(1, { type: "move", side: 1, moveIndex: 0 });

      // Assert
      const cureEvent = events.find(
        (e) => e.type === "status-cure" && "status" in e && e.status === "sleep",
      );
      expect(cureEvent).toBeDefined();
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
        selfStatusInflicted: "sleep" as const,
        selfVolatileData: { turnsLeft: 2 },
      });

      const { engine } = createEngine({ ruleset, seed: 42 });
      engine.start();

      // Act
      engine.submitAction(0, { type: "move", side: 0, moveIndex: 0 });
      engine.submitAction(1, { type: "move", side: 1, moveIndex: 0 });

      // Assert — attacker (Charizard, side 0) self-inflicted sleep with turnsLeft=2
      const attacker = engine.state.sides[0].active[0];
      expect(attacker?.pokemon.status).toBe("sleep");
      const sleepCounter = attacker?.volatileStatuses.get("sleep-counter");
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

      engine.state.sides[1].active[0]!.pokemon.status = "freeze";

      // Act
      engine.submitAction(0, { type: "move", side: 0, moveIndex: 0 });
      engine.submitAction(1, { type: "move", side: 1, moveIndex: 0 });

      // Assert
      const freezeMsg = events.find(
        (e) => e.type === "message" && "text" in e && e.text.includes("frozen solid"),
      );
      expect(freezeMsg).toBeDefined();
    });

    it("given a frozen pokemon, when freeze thaw succeeds, then it can act", () => {
      // Arrange — use a ruleset where freeze always thaws
      const ruleset = new MockRuleset();
      (ruleset as unknown as Record<string, unknown>).checkFreezeThaw = () => true;

      const { engine, events } = createEngine({ ruleset });
      engine.start();

      engine.state.sides[1].active[0]!.pokemon.status = "freeze";

      // Act
      engine.submitAction(0, { type: "move", side: 0, moveIndex: 0 });
      engine.submitAction(1, { type: "move", side: 1, moveIndex: 0 });

      // Assert
      const cureEvent = events.find(
        (e) => e.type === "status-cure" && "status" in e && e.status === "freeze",
      );
      expect(cureEvent).toBeDefined();
    });

    it("given a frozen pokemon using a defrost move, when RNG would never thaw, then the move still thaws the user", () => {
      // Arrange — ruleset always fails freeze thaw RNG; defrost flag must guarantee thaw
      const ruleset = new MockRuleset();
      (ruleset as unknown as Record<string, unknown>).checkFreezeThaw = () => false;

      const team1 = [
        createTestPokemon(6, 50, {
          uid: "charizard-defrost",
          nickname: "Charizard",
          moves: [{ moveId: "flame-wheel", currentPP: 25, maxPP: 25, ppUps: 0 }],
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
      engine.state.sides[0].active[0]!.pokemon.status = "freeze";

      // Act — Charizard uses flame-wheel (defrost move), opponent uses tackle
      engine.submitAction(0, { type: "move", side: 0, moveIndex: 0 });
      engine.submitAction(1, { type: "move", side: 1, moveIndex: 0 });

      // Assert — status-cure for freeze must be emitted despite RNG always failing
      const cureEvent = events.find(
        (e) => e.type === "status-cure" && "status" in e && e.status === "freeze",
      );
      expect(cureEvent).toBeDefined();

      // Charizard must no longer be frozen
      expect(engine.state.sides[0].active[0]?.pokemon.status).toBeNull();
    });
  });

  describe("confusion self-hit", () => {
    it("given a confused pokemon, when self-hit triggers, then self-damage is dealt", () => {
      // Arrange — find a seed where confusion self-hit triggers
      let foundSelfHit = false;

      for (let seed = 0; seed < 200; seed++) {
        const { engine, events } = createEngine({ seed });
        engine.start();

        // Blastoise is confused with many turns
        engine.state.sides[1].active[0]?.volatileStatuses.set("confusion", { turnsLeft: 5 });

        engine.submitAction(0, { type: "move", side: 0, moveIndex: 0 });
        engine.submitAction(1, { type: "move", side: 1, moveIndex: 0 });

        const selfHitMsg = events.find(
          (e) => e.type === "message" && "text" in e && e.text.includes("hurt itself"),
        );
        if (selfHitMsg) {
          // Also verify confusion damage was dealt
          const confDamage = events.find(
            (e) => e.type === "damage" && "source" in e && e.source === "confusion",
          );
          expect(confDamage).toBeDefined();
          foundSelfHit = true;
          break;
        }
      }

      expect(foundSelfHit).toBe(true);
    });
  });

  describe("confusion ending", () => {
    it("given confusion with 0 turns left, when pokemon tries to move, then confusion ends", () => {
      // Arrange
      const { engine, events } = createEngine();
      engine.start();

      engine.state.sides[1].active[0]?.volatileStatuses.set("confusion", { turnsLeft: 0 });

      // Act
      engine.submitAction(0, { type: "move", side: 0, moveIndex: 0 });
      engine.submitAction(1, { type: "move", side: 1, moveIndex: 0 });

      // Assert
      const confEnd = events.find(
        (e) => e.type === "volatile-end" && "volatile" in e && e.volatile === "confusion",
      );
      expect(confEnd).toBeDefined();
    });
  });

  describe("switch during mid-turn faint", () => {
    it("given a pokemon faints mid-turn to move damage, when the fainted pokemon should act next, then it skips", () => {
      // Arrange — Blastoise at 1 HP, Charizard faster
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
      const active = engine.getActive(0);

      // Assert
      expect(active).toBeNull();
    });
  });

  describe("weather damage with weather effects", () => {
    it("given weather with damage and a ruleset that applies weather effects, when end of turn runs, then weather damage is emitted", () => {
      // Arrange
      const ruleset = new MockRuleset();
      (ruleset as unknown as Record<string, unknown>).hasWeather = () => true;
      (ruleset as unknown as Record<string, unknown>).applyWeatherEffects = () => [
        { side: 0, pokemon: "Charizard", damage: 12, message: "Hurt by sand" },
      ];
      const patchedRuleset = Object.create(ruleset) as MockRuleset;
      patchedRuleset.getEndOfTurnOrder = () => [
        "weather-damage" as const,
        "status-damage" as const,
      ];

      const { engine, events } = createEngine({ ruleset: patchedRuleset });
      engine.start();

      engine.state.weather = { type: "sand", turnsLeft: 5, source: "sandstream" };

      // Act
      engine.submitAction(0, { type: "move", side: 0, moveIndex: 0 });
      engine.submitAction(1, { type: "move", side: 1, moveIndex: 0 });

      // Assert
      const weatherDamage = events.filter(
        (e) => e.type === "damage" && "source" in e && e.source === "weather-sand",
      );
      expect(weatherDamage.length).toBeGreaterThan(0);
    });
  });

  describe("speed tiebreak in turn order", () => {
    it("given two pokemon with the same speed, when turn order is resolved, then order is decided by RNG", () => {
      // Arrange — both at speed 100; override calculateStats to produce identical speeds
      // Run multiple times with different seeds to get both orderings
      const firstMovers = new Set<string>();
      for (let seed = 0; seed < 50; seed++) {
        const t1 = [
          createTestPokemon(6, 50, {
            uid: "mon-a",
            nickname: "MonA",
            moves: [{ moveId: "tackle", currentPP: 35, maxPP: 35, ppUps: 0 }],
            currentHp: 200,
          }),
        ];
        const t2 = [
          createTestPokemon(9, 50, {
            uid: "mon-b",
            nickname: "MonB",
            moves: [{ moveId: "tackle", currentPP: 35, maxPP: 35, ppUps: 0 }],
            currentHp: 200,
          }),
        ];

        // Use a ruleset that gives both pokemon the same speed (100) to force a tie
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
          firstMovers.add(moveStarts[0].pokemon);
        }
      }

      // Assert — both pokemon should have gone first at least once
      expect(firstMovers.size).toBe(2);
    });
  });
});
