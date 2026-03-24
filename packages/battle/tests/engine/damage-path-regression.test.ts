import type { MoveData, PokemonInstance } from "@pokemon-lib-ts/core";
import { describe, expect, it } from "vitest";
import type {
  BattleConfig,
  DamageContext,
  DamageResult,
  MoveEffectResult,
} from "../../src/context";
import { BattleEngine } from "../../src/engine";
import type { BattleEvent } from "../../src/events";
import { createTestPokemon } from "../../src/utils";
import { createMockDataManager } from "../helpers/mock-data-manager";
import { MockRuleset } from "../helpers/mock-ruleset";

// ---------------------------------------------------------------------------
// MockRuleset subclass with capLethalDamage support for Sturdy testing
// Source: Bulbapedia Sturdy — "If this Pokémon is at full HP, it will survive
//   a hit that would KO it, with 1 HP remaining" (Gen 5+)
// ---------------------------------------------------------------------------
class SturdyMockRuleset extends MockRuleset {
  capLethalDamage(
    damage: number,
    defender: import("../../src/state").ActivePokemon,
    _attacker: import("../../src/state").ActivePokemon,
    _move: MoveData,
    _state: import("../../src/state").BattleState,
  ): { damage: number; survived: boolean; messages: string[] } {
    const maxHp = defender.pokemon.calculatedStats?.hp ?? defender.pokemon.currentHp;
    // Sturdy: if at full HP, cap damage to leave 1 HP
    if (defender.pokemon.currentHp === maxHp && damage >= defender.pokemon.currentHp) {
      return {
        damage: defender.pokemon.currentHp - 1,
        survived: true,
        messages: [`${defender.pokemon.nickname ?? "Pokemon"} endured the hit!`],
      };
    }
    return { damage, survived: false, messages: [] };
  }
}

// ---------------------------------------------------------------------------
// MockRuleset subclass with Choice item support for miss-lock testing
// Source: Showdown sim/battle-actions.ts — choicelock is set in onModifyMove
//   which fires before the accuracy roll
// ---------------------------------------------------------------------------
class ChoiceMockRuleset extends MockRuleset {
  hasHeldItems(): boolean {
    return true;
  }
}

// ---------------------------------------------------------------------------
// "Endure" MockRuleset: capLethalDamage ALWAYS caps lethal damage to leave 1 HP
// (regardless of full HP). This tests that capLethalDamage is called on every
// hit, not just the first.
// ---------------------------------------------------------------------------
class AlwaysEndureMockRuleset extends MockRuleset {
  capLethalDamage(
    damage: number,
    defender: import("../../src/state").ActivePokemon,
    _attacker: import("../../src/state").ActivePokemon,
    _move: MoveData,
    _state: import("../../src/state").BattleState,
  ): { damage: number; survived: boolean; messages: string[] } {
    // Always cap: if damage would KO, leave 1 HP
    // Source: conceptual -- models Focus Band / Endure behavior for testing
    if (damage >= defender.pokemon.currentHp) {
      return {
        damage: defender.pokemon.currentHp - 1,
        survived: true,
        messages: ["Endured the hit!"],
      };
    }
    return { damage, survived: false, messages: [] };
  }
}

// ---------------------------------------------------------------------------
// Multi-hit + AlwaysEndure: each hit that would KO is capped to leave 1 HP
// ---------------------------------------------------------------------------
class MultiHitEndureMockRuleset extends AlwaysEndureMockRuleset {
  calculateDamage(context: DamageContext): DamageResult {
    return {
      damage: 999, // Each hit would OHKO
      effectiveness: 1,
      isCrit: context.isCrit,
      randomFactor: 1,
    };
  }

  executeMoveEffect(_context: import("../../src/context").MoveEffectContext): MoveEffectResult {
    return {
      statusInflicted: null,
      volatileInflicted: null,
      statChanges: [],
      recoilDamage: 0,
      healAmount: 0,
      switchOut: false,
      messages: [],
      // Return 1 additional hit (2 total) so the multi-hit loop fires
      multiHitCount: 1,
    };
  }
}

class CustomDamageHookMockRuleset extends MockRuleset {
  damageReceivedCalls: Array<{ defenderUid: string; damage: number; moveId: string }> = [];

  override capLethalDamage(
    damage: number,
    defender: import("../../src/state").ActivePokemon,
    _attacker: import("../../src/state").ActivePokemon,
    _move: MoveData,
    _state: import("../../src/state").BattleState,
  ): { damage: number; survived: boolean; messages: string[] } {
    if (damage >= defender.pokemon.currentHp) {
      return {
        damage: defender.pokemon.currentHp - 1,
        survived: true,
        messages: ["Custom damage was capped"],
      };
    }
    return { damage, survived: false, messages: [] };
  }

  override onDamageReceived(
    defender: import("../../src/state").ActivePokemon,
    damage: number,
    move: MoveData,
    _state: import("../../src/state").BattleState,
  ): void {
    this.damageReceivedCalls.push({
      defenderUid: defender.pokemon.uid,
      damage,
      moveId: move.id,
    });
  }
}

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
  };

  const engine = new BattleEngine(config, ruleset, dataManager);
  engine.on((e) => events.push(e));

  return { engine, ruleset, events, dataManager };
}

describe("BattleEngine — damage path regression (#531, #538, #539)", () => {
  describe("#829 — customDamage uses the shared damage pipeline", () => {
    it("given a move effect that applies lethal custom damage, when it resolves, then the engine still applies capLethalDamage and onDamageReceived", () => {
      const ruleset = new CustomDamageHookMockRuleset();
      ruleset.setMoveEffectResult({
        customDamage: {
          target: "defender",
          amount: 999,
          source: "tackle",
          type: "normal",
        },
      });

      const charizard = createTestPokemon(6, 50, {
        uid: "charizard-1",
        nickname: "Charizard",
        moves: [{ moveId: "swords-dance", currentPP: 20, maxPP: 20, ppUps: 0 }],
        calculatedStats: {
          hp: 200,
          attack: 100,
          defense: 100,
          spAttack: 100,
          spDefense: 100,
          speed: 120,
        },
        currentHp: 200,
      });

      const { engine, events } = createEngine({ ruleset, team1: [charizard] });
      engine.start();

      engine.submitAction(0, { type: "move", side: 0, moveIndex: 0 });
      engine.submitAction(1, { type: "move", side: 1, moveIndex: 0 });

      const defender = engine.getState().sides[1].active[0];
      expect(defender?.pokemon.currentHp).toBe(1);

      const damageEvent = events.find((event) => event.type === "damage" && event.side === 1);
      expect(damageEvent).toBeDefined();
      expect(damageEvent && "amount" in damageEvent ? damageEvent.amount : null).toBe(153);

      expect(ruleset.damageReceivedCalls).toContainEqual({
        defenderUid: "blastoise-1",
        damage: 153,
        moveId: "tackle",
      });

      const surviveMessage = events.find(
        (event) => event.type === "message" && event.text === "Custom damage was capped",
      );
      expect(surviveMessage).toBeDefined();
    });
  });

  // -----------------------------------------------------------------------
  // #531: capLethalDamage missing from executeMoveById damage path
  // -----------------------------------------------------------------------
  describe("#531 — capLethalDamage in executeMoveById", () => {
    it("given a status move that triggers a recursive OHKO move via executeMoveById, when Sturdy is active, then the recursive hit is capped to leave 1 HP", () => {
      // Source: Bulbapedia Sturdy — "If at full HP, survives a hit with 1 HP"
      // Scenario: Charizard uses Swords Dance (status move, 0 damage) which triggers
      // a recursive Tackle via executeMoveById. The recursive Tackle deals 999 damage
      // to a full-HP target. Without the fix, capLethalDamage is not called in
      // executeMoveById, so the target dies outright.
      const ruleset = new SturdyMockRuleset();
      ruleset.setFixedDamage(999);

      // The move effect triggers a recursive damaging move
      ruleset.setMoveEffectResult({
        recursiveMove: "tackle",
      });

      const charizard = createTestPokemon(6, 50, {
        uid: "charizard-1",
        nickname: "Charizard",
        moves: [{ moveId: "swords-dance", currentPP: 20, maxPP: 20, ppUps: 0 }],
        calculatedStats: {
          hp: 200,
          attack: 100,
          defense: 100,
          spAttack: 100,
          spDefense: 100,
          speed: 120,
        },
        currentHp: 200,
      });

      const { engine, events } = createEngine({ ruleset, team1: [charizard] });
      engine.start();

      engine.submitAction(0, { type: "move", side: 0, moveIndex: 0 });
      engine.submitAction(1, { type: "move", side: 1, moveIndex: 0 });

      // Charizard uses Swords Dance (status, no damage), then the recursive Tackle fires
      // via executeMoveById. The recursive Tackle deals 999 damage to Blastoise at full HP.
      // capLethalDamage should cap this to leave 1 HP.

      // Find damage events for Blastoise (side 1)
      const blastoiseDamageEvents = events.filter((e) => e.type === "damage" && e.side === 1);

      // MockRuleset.calculateStats for Blastoise (base HP 79, level 50):
      // hp = floor(((2*79 + 31) * 50) / 100) + 50 + 10 = 154
      // Source: MockRuleset.calculateStats formula derivation
      // The recursive hit via executeMoveById should be capped to 154 - 1 = 153
      expect(blastoiseDamageEvents.length).toBeGreaterThanOrEqual(1);
      expect(blastoiseDamageEvents[0].type === "damage" && blastoiseDamageEvents[0].amount).toBe(
        153,
      );

      // Verify Sturdy message was emitted
      const sturdyMessage = events.find(
        (e) => e.type === "message" && e.text.includes("endured the hit"),
      );
      expect(sturdyMessage).toBeDefined();

      // Defender should survive at 1 HP
      const state = engine.getState();
      const defender = state.sides[1].active[0];
      expect(defender?.pokemon.currentHp).toBe(1);
    });

    it("given a recursive move via executeMoveById that would NOT OHKO, when Sturdy is active, then damage passes through unchanged", () => {
      // Source: Bulbapedia Sturdy — only triggers when damage >= currentHp
      const ruleset = new SturdyMockRuleset();
      ruleset.setFixedDamage(50); // not lethal

      ruleset.setMoveEffectResult({
        recursiveMove: "tackle",
      });

      const charizard = createTestPokemon(6, 50, {
        uid: "charizard-1",
        nickname: "Charizard",
        moves: [{ moveId: "swords-dance", currentPP: 20, maxPP: 20, ppUps: 0 }],
        calculatedStats: {
          hp: 200,
          attack: 100,
          defense: 100,
          spAttack: 100,
          spDefense: 100,
          speed: 120,
        },
        currentHp: 200,
      });

      const { engine, events } = createEngine({ ruleset, team1: [charizard] });
      engine.start();

      engine.submitAction(0, { type: "move", side: 0, moveIndex: 0 });
      engine.submitAction(1, { type: "move", side: 1, moveIndex: 0 });

      const blastoiseDamageEvents = events.filter((e) => e.type === "damage" && e.side === 1);

      // Recursive hit via executeMoveById: 50 damage (not lethal, Sturdy does not trigger)
      expect(blastoiseDamageEvents.length).toBeGreaterThanOrEqual(1);
      expect(blastoiseDamageEvents[0].type === "damage" && blastoiseDamageEvents[0].amount).toBe(
        50,
      );

      // No Sturdy message
      const sturdyMessage = events.find(
        (e) => e.type === "message" && e.text.includes("endured the hit"),
      );
      expect(sturdyMessage).toBeUndefined();
    });
  });

  // -----------------------------------------------------------------------
  // #538: Choice lock not applied when move misses
  // -----------------------------------------------------------------------
  describe("#538 — Choice lock on miss", () => {
    it("given a Pokemon with Choice Band, when its move misses, then the choice-locked volatile is still applied", () => {
      // Source: Showdown sim/battle-actions.ts — choicelock is set in onModifyMove
      // before the accuracy roll. A Pokemon is locked into whatever move it selects,
      // regardless of whether it hits or misses.
      const ruleset = new ChoiceMockRuleset();
      ruleset.setAlwaysHit(false); // Force miss

      const choiceBandUser = createTestPokemon(6, 50, {
        uid: "charizard-1",
        nickname: "Charizard",
        moves: [
          { moveId: "tackle", currentPP: 35, maxPP: 35, ppUps: 0 },
          { moveId: "scratch", currentPP: 35, maxPP: 35, ppUps: 0 },
        ],
        heldItem: "choice-band",
        calculatedStats: {
          hp: 200,
          attack: 100,
          defense: 100,
          spAttack: 100,
          spDefense: 100,
          speed: 120,
        },
        currentHp: 200,
      });

      const { engine, events } = createEngine({
        ruleset,
        team1: [choiceBandUser],
      });
      engine.start();

      engine.submitAction(0, { type: "move", side: 0, moveIndex: 0 });
      engine.submitAction(1, { type: "move", side: 1, moveIndex: 0 });

      // Verify the move missed
      const missEvent = events.find((e) => e.type === "move-miss" && e.side === 0);
      expect(missEvent).toBeDefined();

      // Verify the choice-locked volatile is set despite the miss
      const state = engine.getState();
      const actor = state.sides[0].active[0];
      expect(actor).toBeDefined();
      expect(actor!.volatileStatuses.has("choice-locked")).toBe(true);

      const choiceData = actor!.volatileStatuses.get("choice-locked")?.data;
      expect(choiceData).toEqual({ moveId: "tackle" });
    });

    it("given a Pokemon with Choice Scarf whose move hits, then the choice-locked volatile is still applied (baseline)", () => {
      // Source: Bulbapedia — "Choice Scarf locks the holder into the first move used"
      // This is a baseline test to confirm normal behavior still works.
      const ruleset = new ChoiceMockRuleset();

      const choiceScarfUser = createTestPokemon(6, 50, {
        uid: "charizard-1",
        nickname: "Charizard",
        moves: [
          { moveId: "tackle", currentPP: 35, maxPP: 35, ppUps: 0 },
          { moveId: "scratch", currentPP: 35, maxPP: 35, ppUps: 0 },
        ],
        heldItem: "choice-scarf",
        calculatedStats: {
          hp: 200,
          attack: 100,
          defense: 100,
          spAttack: 100,
          spDefense: 100,
          speed: 120,
        },
        currentHp: 200,
      });

      const { engine } = createEngine({
        ruleset,
        team1: [choiceScarfUser],
      });
      engine.start();

      engine.submitAction(0, { type: "move", side: 0, moveIndex: 0 });
      engine.submitAction(1, { type: "move", side: 1, moveIndex: 0 });

      const state = engine.getState();
      const actor = state.sides[0].active[0];
      expect(actor).toBeDefined();
      expect(actor!.volatileStatuses.has("choice-locked")).toBe(true);
      expect(actor!.volatileStatuses.get("choice-locked")?.data).toEqual({ moveId: "tackle" });
    });
  });

  // -----------------------------------------------------------------------
  // #539: capLethalDamage not called for hits 2+ in multi-hit move loop
  // -----------------------------------------------------------------------
  describe("#539 — capLethalDamage in multi-hit loop", () => {
    it("given a 2-hit move where each hit would OHKO, when AlwaysEndure caps every lethal hit, then the second hit is also capped and target survives at 1 HP", () => {
      // Source: Showdown sim/battle-actions.ts — capLethalDamage (onDamage handlers)
      // run before EACH hit's HP subtraction in multi-hit moves.
      // Without the fix, hit 2 bypasses capLethalDamage and KOs the target.
      // With the fix, hit 2 also calls capLethalDamage, which caps damage to 0
      // (since target is already at 1 HP, cap to 1-1=0, but we leave at 1).
      const ruleset = new MultiHitEndureMockRuleset();

      const { engine, events } = createEngine({ ruleset });
      engine.start();

      engine.submitAction(0, { type: "move", side: 0, moveIndex: 0 });
      engine.submitAction(1, { type: "move", side: 1, moveIndex: 0 });

      // Find damage events for Blastoise (side 1)
      const blastoiseDamageEvents = events.filter((e) => e.type === "damage" && e.side === 1);

      // MockRuleset.calculateStats for Blastoise (base HP 79, level 50):
      // hp = floor(((2*79 + 31) * 50) / 100) + 50 + 10 = 154
      // Source: MockRuleset.calculateStats formula derivation
      // First hit: 999 damage capped to 154-1 = 153 (leaves 1 HP)
      expect(blastoiseDamageEvents.length).toBeGreaterThanOrEqual(1);
      expect(blastoiseDamageEvents[0].type === "damage" && blastoiseDamageEvents[0].amount).toBe(
        153,
      );

      // Count endure messages that appear directly before damage events on side 1.
      // Both hits on Blastoise should trigger the endure cap.
      // (Blastoise's own attack on Charizard also triggers endure messages, so
      // we count endure messages that precede side-1 damage events specifically.)
      let endureCountForDefender = 0;
      for (let i = 0; i < events.length; i++) {
        const ev = events[i];
        if (ev.type === "message" && ev.text.includes("Endured the hit")) {
          // Check if the next damage event is for side 1
          for (let j = i + 1; j < events.length; j++) {
            if (events[j].type === "damage") {
              if ((events[j] as { side: number }).side === 1) {
                endureCountForDefender++;
              }
              break;
            }
          }
        }
      }
      // Both hits on Blastoise trigger endure
      expect(endureCountForDefender).toBe(2);

      // Target should survive at 1 HP after both hits (AlwaysEndure prevents KO on each hit)
      const state = engine.getState();
      const defender = state.sides[1].active[0];
      expect(defender?.pokemon.currentHp).toBe(1);
    });

    it("given a 2-hit move where neither hit would KO, then capLethalDamage does not alter damage", () => {
      // Source: capLethalDamage only fires when damage >= currentHp — non-lethal
      // hits pass through unchanged.
      const ruleset = new AlwaysEndureMockRuleset();
      ruleset.setFixedDamage(30);

      // Set up multi-hit: 1 additional hit beyond the first
      ruleset.setMoveEffectResult({
        multiHitCount: 1,
      });

      const { engine, events } = createEngine({ ruleset });
      engine.start();

      engine.submitAction(0, { type: "move", side: 0, moveIndex: 0 });
      engine.submitAction(1, { type: "move", side: 1, moveIndex: 0 });

      const blastoiseDamageEvents = events.filter((e) => e.type === "damage" && e.side === 1);

      // Both hits deal full 30 damage — not lethal, endure not triggered
      expect(blastoiseDamageEvents[0].type === "damage" && blastoiseDamageEvents[0].amount).toBe(
        30,
      );
      expect(blastoiseDamageEvents[1].type === "damage" && blastoiseDamageEvents[1].amount).toBe(
        30,
      );

      // No endure messages since neither hit was lethal
      const endureMessages = events.filter(
        (e) => e.type === "message" && e.text.includes("Endured the hit"),
      );
      expect(endureMessages.length).toBe(0);
    });
  });
});
