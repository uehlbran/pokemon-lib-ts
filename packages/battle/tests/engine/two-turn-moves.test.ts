import type { PokemonInstance, VolatileStatus } from "@pokemon-lib-ts/core";
import { describe, expect, it } from "vitest";
import type { BattleConfig, MoveEffectContext, MoveEffectResult } from "../../src/context";
import { BattleEngine } from "../../src/engine";
import type { BattleEvent } from "../../src/events";
import { createTestPokemon } from "../../src/utils";
import { createMockDataManager } from "../helpers/mock-data-manager";
import { MockRuleset } from "../helpers/mock-ruleset";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function createEngine(overrides?: {
  seed?: number;
  team1?: PokemonInstance[];
  team2?: PokemonInstance[];
  ruleset?: MockRuleset;
}) {
  const ruleset = overrides?.ruleset ?? new MockRuleset();
  const dataManager = createMockDataManager();
  const events: BattleEvent[] = [];

  const team1 = overrides?.team1 ?? [
    createTestPokemon(6, 50, {
      uid: "charizard-1",
      nickname: "Charizard",
      moves: [
        { moveId: "tackle", currentPP: 35, maxPP: 35, ppUps: 0 },
        { moveId: "thunderbolt", currentPP: 15, maxPP: 15, ppUps: 0 },
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
  };

  const engine = new BattleEngine(config, ruleset, dataManager);
  engine.on((e) => events.push(e));

  return { engine, ruleset, events, dataManager };
}

// ─── Two-Turn Move Engine Infrastructure Tests ────────────────────────────────

describe("two-turn move engine infrastructure", () => {
  describe("given a Pokemon using a charge move, when the charge turn executes, then forcedMove is set and volatile applied", () => {
    it("sets forcedMove on the attacker and applies the volatile status from forcedMoveSet", () => {
      // Arrange: configure executeMoveEffect to return forcedMoveSet on the first call
      const ruleset = new MockRuleset();
      let callCount = 0;
      const origExecute = ruleset.executeMoveEffect.bind(ruleset);
      ruleset.executeMoveEffect = (context: MoveEffectContext): MoveEffectResult => {
        callCount++;
        if (callCount === 1 && context.attacker.pokemon.uid === "charizard-1") {
          return {
            statusInflicted: null,
            volatileInflicted: null,
            statChanges: [],
            recoilDamage: 0,
            healAmount: 0,
            switchOut: false,
            messages: [],
            forcedMoveSet: {
              moveIndex: 0,
              moveId: "tackle",
              volatileStatus: "flying" as VolatileStatus,
            },
          };
        }
        return origExecute(context);
      };

      const { engine, events } = createEngine({ ruleset });
      engine.start();

      // Act: submit moves for both sides
      engine.submitAction(0, { type: "move", side: 0, moveIndex: 0 });
      engine.submitAction(1, { type: "move", side: 1, moveIndex: 0 });

      // Assert: forcedMove should be set on side 0's active Pokemon
      const active0 = engine.state.sides[0].active[0];
      expect(active0).not.toBeNull();
      expect(active0!.forcedMove).toEqual({ moveIndex: 0, moveId: "tackle" });

      // Assert: flying volatile should be applied
      expect(active0!.volatileStatuses.has("flying")).toBe(true);

      // Assert: volatile-start event for "flying" emitted
      const volatileStartEvents = events.filter(
        (e) => e.type === "volatile-start" && "volatile" in e && e.volatile === "flying",
      );
      expect(volatileStartEvents.length).toBe(1);
    });
  });

  describe("given a Pokemon with forcedMove set, when getAvailableMoves is called, then only the forced move is enabled", () => {
    it("returns all moves but only the forced move is not disabled", () => {
      // Arrange
      const { engine } = createEngine();
      engine.start();

      // Directly set forcedMove on side 0's active Pokemon
      const active0 = engine.state.sides[0].active[0];
      expect(active0).not.toBeNull();
      active0!.forcedMove = { moveIndex: 0, moveId: "tackle" };

      // Act
      const moves = engine.getAvailableMoves(0);

      // Assert: the forced move (index 0) should not be disabled
      const forcedMove = moves.find((m) => m.index === 0);
      expect(forcedMove).toBeDefined();
      expect(forcedMove!.disabled).toBe(false);

      // Assert: all other moves should be disabled with reason "Locked into move"
      const otherMoves = moves.filter((m) => m.index !== 0);
      for (const m of otherMoves) {
        expect(m.disabled).toBe(true);
        expect(m.disabledReason).toBe("Locked into move");
      }
    });
  });

  describe("given a Pokemon with forcedMove set, when resolveTurn begins, then the action is overridden to the forced move", () => {
    it("overrides the submitted action and clears forcedMove", () => {
      // Arrange: set up a ruleset that tracks which moveIndex was used
      const ruleset = new MockRuleset();
      const usedMoveIndices: number[] = [];
      const origExecute = ruleset.executeMoveEffect.bind(ruleset);
      ruleset.executeMoveEffect = (context: MoveEffectContext): MoveEffectResult => {
        // Track which move index was used by looking at the move that was executed
        if (context.attacker.pokemon.uid === "charizard-1") {
          usedMoveIndices.push(
            context.attacker.pokemon.moves.findIndex((m) => m.moveId === context.move.id),
          );
        }
        return origExecute(context);
      };

      const { engine } = createEngine({ ruleset });
      engine.start();

      // Set forcedMove to move index 0 (tackle)
      const active0 = engine.state.sides[0].active[0];
      expect(active0).not.toBeNull();
      active0!.forcedMove = { moveIndex: 0, moveId: "tackle" };

      // Act: submit a DIFFERENT move index (1) for side 0
      engine.submitAction(0, { type: "move", side: 0, moveIndex: 1 });
      engine.submitAction(1, { type: "move", side: 1, moveIndex: 0 });

      // Assert: the forced move (index 0) was executed, not index 1
      expect(usedMoveIndices).toContain(0);

      // Assert: forcedMove should be cleared after the turn
      expect(active0!.forcedMove).toBeNull();
    });
  });

  describe("given a defender in flying state, when opponent uses Thunderbolt (not in override map), then the move misses", () => {
    it("emits move-miss when canHitSemiInvulnerable returns false", () => {
      // Arrange
      const { engine, events } = createEngine();
      engine.start();

      // Set the defender (Blastoise, side 1) to "flying" semi-invulnerable state
      const defender = engine.state.sides[1].active[0];
      expect(defender).not.toBeNull();
      defender!.volatileStatuses.set("flying", { turnsLeft: 1 });

      // Act: Charizard uses Thunderbolt (index 1) against flying Blastoise
      engine.submitAction(0, { type: "move", side: 0, moveIndex: 1 });
      engine.submitAction(1, { type: "move", side: 1, moveIndex: 0 });

      // Assert: move-miss event emitted for Charizard's Thunderbolt
      // Source: Showdown — most moves miss against semi-invulnerable targets
      const missEvents = events.filter(
        (e) => e.type === "move-miss" && "pokemon" in e && e.pokemon === "Charizard",
      );
      expect(missEvents.length).toBe(1);
    });
  });

  describe("given a defender in flying state, when canHitSemiInvulnerable returns true for the move, then the move hits", () => {
    it("does not emit move-miss when the ruleset allows hitting the semi-invulnerable state", () => {
      // Arrange: configure ruleset to allow thunderbolt to hit flying targets
      const ruleset = new MockRuleset();
      ruleset.setCanHitSemiInvulnerable("thunderbolt", "flying");

      const { engine, events } = createEngine({ ruleset });
      engine.start();

      // Set the defender to "flying" semi-invulnerable state
      const defender = engine.state.sides[1].active[0];
      expect(defender).not.toBeNull();
      defender!.volatileStatuses.set("flying", { turnsLeft: 1 });

      // Act: Charizard uses Thunderbolt against flying Blastoise
      engine.submitAction(0, { type: "move", side: 0, moveIndex: 1 });
      engine.submitAction(1, { type: "move", side: 1, moveIndex: 0 });

      // Assert: no move-miss event for Charizard's Thunderbolt
      // Source: Showdown — Thunder/Hurricane can hit flying targets; we test via mock
      const missEvents = events.filter(
        (e) => e.type === "move-miss" && "pokemon" in e && e.pokemon === "Charizard",
      );
      expect(missEvents.length).toBe(0);

      // Assert: damage event should be emitted instead (the move landed)
      const damageEvents = events.filter(
        (e) => e.type === "damage" && "pokemon" in e && e.pokemon === "Blastoise",
      );
      expect(damageEvents.length).toBeGreaterThan(0);
    });
  });

  describe("given a defender in underground state, when opponent uses Tackle (not in override map), then canHitSemiInvulnerable is consulted", () => {
    it("auto-misses against underground target when canHitSemiInvulnerable returns false", () => {
      // Arrange
      const { engine, events } = createEngine();
      engine.start();

      // Set the defender to "underground" semi-invulnerable state
      const defender = engine.state.sides[1].active[0];
      expect(defender).not.toBeNull();
      defender!.volatileStatuses.set("underground", { turnsLeft: 1 });

      // Act: Charizard uses Tackle against underground Blastoise
      engine.submitAction(0, { type: "move", side: 0, moveIndex: 0 });
      engine.submitAction(1, { type: "move", side: 1, moveIndex: 0 });

      // Assert: move-miss event emitted (Earthquake would hit underground, Tackle does not)
      // Source: Showdown — Earthquake can hit underground targets via canHitSemiInvulnerable
      const missEvents = events.filter(
        (e) => e.type === "move-miss" && "pokemon" in e && e.pokemon === "Charizard",
      );
      expect(missEvents.length).toBe(1);
    });
  });

  describe("given a semi-invulnerable volatile on the attacker, when the forced move executes on the second turn, then the volatile is removed before damage", () => {
    it("removes the flying volatile from the attacker before move execution", () => {
      // Arrange
      const { engine, events } = createEngine();
      engine.start();

      // Simulate: attacker has "flying" volatile and a forcedMove (second turn of Fly)
      const active0 = engine.state.sides[0].active[0];
      expect(active0).not.toBeNull();
      active0!.volatileStatuses.set("flying", { turnsLeft: 1 });
      active0!.forcedMove = { moveIndex: 0, moveId: "tackle" };

      // Act: turn executes, forced move fires
      engine.submitAction(0, { type: "move", side: 0, moveIndex: 0 });
      engine.submitAction(1, { type: "move", side: 1, moveIndex: 0 });

      // Assert: the "flying" volatile was removed from the attacker
      // Source: Showdown — semi-invulnerable volatile cleared at start of execution turn
      expect(active0!.volatileStatuses.has("flying")).toBe(false);

      // Assert: the move actually executed (damage was dealt, not a miss)
      const damageToDefender = events.filter(
        (e) => e.type === "damage" && "pokemon" in e && e.pokemon === "Blastoise",
      );
      expect(damageToDefender.length).toBeGreaterThan(0);
    });

    it("removes the charging volatile from the attacker before move execution", () => {
      // Arrange: test the non-semi-invulnerable "charging" volatile (SolarBeam, etc.)
      const { engine } = createEngine();
      engine.start();

      const active0 = engine.state.sides[0].active[0];
      expect(active0).not.toBeNull();
      active0!.volatileStatuses.set("charging", { turnsLeft: 1 });
      active0!.forcedMove = { moveIndex: 0, moveId: "tackle" };

      // Act
      engine.submitAction(0, { type: "move", side: 0, moveIndex: 0 });
      engine.submitAction(1, { type: "move", side: 1, moveIndex: 0 });

      // Assert: charging volatile removed
      expect(active0!.volatileStatuses.has("charging")).toBe(false);
    });
  });

  describe("given a defender with charging volatile (not semi-invulnerable), when opponent attacks, then the move still hits", () => {
    it("does not auto-miss because charging is not semi-invulnerable", () => {
      // Arrange: charging is NOT in the semi-invulnerable list
      const { engine, events } = createEngine();
      engine.start();

      const defender = engine.state.sides[1].active[0];
      expect(defender).not.toBeNull();
      defender!.volatileStatuses.set("charging", { turnsLeft: 1 });

      // Act
      engine.submitAction(0, { type: "move", side: 0, moveIndex: 0 });
      engine.submitAction(1, { type: "move", side: 1, moveIndex: 0 });

      // Assert: no move-miss event for Charizard — charging does not grant invulnerability
      // Source: Bulbapedia — SolarBeam/Skull Bash charge turn does NOT make user semi-invulnerable
      const missEvents = events.filter(
        (e) => e.type === "move-miss" && "pokemon" in e && e.pokemon === "Charizard",
      );
      expect(missEvents.length).toBe(0);
    });
  });
});
