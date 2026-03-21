import type { AbilityTrigger, PokemonInstance } from "@pokemon-lib-ts/core";
import { describe, expect, it } from "vitest";
import type { AbilityContext, AbilityResult, BattleConfig } from "../../src/context";
import { BattleEngine } from "../../src/engine";
import type { BattleEvent } from "../../src/events";
import { createTestPokemon } from "../../src/utils";
import { createMockDataManager } from "../helpers/mock-data-manager";
import { MockRuleset } from "../helpers/mock-ruleset";

// ---- Helpers ----

/**
 * MockRuleset subclass that enables abilities, tracks which triggers fire,
 * and returns configurable AbilityResults.
 */
class ContactImmunityMockRuleset extends MockRuleset {
  triggerLog: Array<{ trigger: AbilityTrigger; pokemonUid: string }> = [];
  private abilityHandler: ((trigger: AbilityTrigger, ctx: AbilityContext) => AbilityResult) | null =
    null;

  override hasAbilities(): boolean {
    return true;
  }

  setAbilityHandler(handler: (trigger: AbilityTrigger, ctx: AbilityContext) => AbilityResult) {
    this.abilityHandler = handler;
  }

  override applyAbility(trigger: AbilityTrigger, context: AbilityContext): AbilityResult {
    this.triggerLog.push({ trigger, pokemonUid: context.pokemon.pokemon.uid });
    if (this.abilityHandler) {
      return this.abilityHandler(trigger, context);
    }
    return { activated: false, effects: [], messages: [] };
  }
}

/**
 * Creates an engine with two teams using the ContactImmunityMockRuleset.
 * Side 0: Charizard (speed 80) with tackle (contact)
 * Side 1: Blastoise (speed 120) with tackle (contact) and thunderbolt (non-contact)
 */
function createTestEngine(opts?: {
  side0Moves?: Array<{ moveId: string; currentPP: number; maxPP: number; ppUps: number }>;
  side1Moves?: Array<{ moveId: string; currentPP: number; maxPP: number; ppUps: number }>;
  side0Hp?: number;
  side1Hp?: number;
}) {
  const ruleset = new ContactImmunityMockRuleset();
  const dataManager = createMockDataManager();
  const events: BattleEvent[] = [];

  const defaultMoves = [{ moveId: "tackle", currentPP: 35, maxPP: 35, ppUps: 0 }];

  const team1: PokemonInstance[] = [
    createTestPokemon(6, 50, {
      uid: "charizard-1",
      nickname: "Charizard",
      ability: "blaze",
      moves: opts?.side0Moves ?? defaultMoves,
      calculatedStats: {
        hp: 200,
        attack: 100,
        defense: 100,
        spAttack: 100,
        spDefense: 100,
        speed: 80,
      },
      currentHp: opts?.side0Hp ?? 200,
    }),
  ];

  const team2: PokemonInstance[] = [
    createTestPokemon(9, 50, {
      uid: "blastoise-1",
      nickname: "Blastoise",
      ability: "static",
      moves: opts?.side1Moves ?? [
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
      currentHp: opts?.side1Hp ?? 200,
    }),
  ];

  const config: BattleConfig = {
    generation: 4,
    format: "singles",
    teams: [team1, team2],
    seed: 42,
  };

  const engine = new BattleEngine(config, ruleset, dataManager);
  engine.on((e) => events.push(e));

  return { engine, ruleset, events };
}

// ---- Contact ability hook tests ----

describe("on-contact ability hook", () => {
  it("given a contact move with damage > 0, when move hits defender, then on-contact trigger fires for defender", () => {
    // Source: Showdown sim/battle-actions.ts — contact abilities (Static, Flame Body, etc.)
    // fire when the attacker uses a contact move that deals damage
    const { engine, ruleset, events } = createTestEngine();
    // MockRuleset default fixedDamage = 10 and tackle has contact: true
    ruleset.setFixedDamage(10);

    ruleset.setAbilityHandler((trigger, _ctx) => {
      if (trigger === "on-contact") {
        return {
          activated: true,
          effects: [
            {
              effectType: "status-inflict" as const,
              target: "opponent" as const,
              status: "paralysis" as const,
            },
          ],
          messages: ["Blastoise's Static paralyzed Charizard!"],
        };
      }
      return { activated: false, effects: [], messages: [] };
    });

    engine.start();
    events.length = 0;
    ruleset.triggerLog = [];

    // Charizard (side 0) uses Tackle (contact) on Blastoise (side 1)
    engine.submitAction(0, { type: "move", side: 0, moveIndex: 0 });
    engine.submitAction(1, { type: "move", side: 1, moveIndex: 0 });

    // Assert: on-contact was called for the defender (Blastoise)
    const contactTriggers = ruleset.triggerLog.filter((t) => t.trigger === "on-contact");
    expect(contactTriggers.length).toBeGreaterThanOrEqual(1);
    // At least one contact trigger should be for the defender's pokemon
    const defenderContactTrigger = contactTriggers.find(
      (t) => t.pokemonUid === "blastoise-1" || t.pokemonUid === "charizard-1",
    );
    expect(defenderContactTrigger).toBeDefined();
  });

  it("given a non-contact move with damage > 0, when move hits defender, then on-contact trigger does NOT fire for that attack", () => {
    // Source: Showdown — only contact moves trigger contact abilities
    // Thunderbolt has contact: false
    // Both sides use Thunderbolt (non-contact) to ensure no on-contact triggers at all
    const { engine, ruleset } = createTestEngine({
      side0Moves: [{ moveId: "thunderbolt", currentPP: 15, maxPP: 15, ppUps: 0 }],
      side1Moves: [{ moveId: "thunderbolt", currentPP: 15, maxPP: 15, ppUps: 0 }],
    });
    ruleset.setFixedDamage(10);

    ruleset.setAbilityHandler((_trigger, _ctx) => {
      return { activated: false, effects: [], messages: [] };
    });

    engine.start();
    ruleset.triggerLog = [];

    // Both sides use Thunderbolt (non-contact)
    engine.submitAction(0, { type: "move", side: 0, moveIndex: 0 });
    engine.submitAction(1, { type: "move", side: 1, moveIndex: 0 });

    // Assert: no on-contact triggers at all (both moves are non-contact)
    const contactTriggers = ruleset.triggerLog.filter((t) => t.trigger === "on-contact");
    expect(contactTriggers.length).toBe(0);
  });

  it("given a contact move hitting a substitute, when move deals damage, then on-contact trigger does NOT fire", () => {
    // Source: Showdown — contact abilities do not activate if the hit goes to a Substitute
    const { engine, ruleset } = createTestEngine();
    ruleset.setFixedDamage(10);

    ruleset.setAbilityHandler((_trigger, _ctx) => {
      return { activated: false, effects: [], messages: [] };
    });

    engine.start();

    // Set up Blastoise with a substitute
    const blastoise = engine.getActive(1);
    expect(blastoise).not.toBeNull();
    blastoise!.substituteHp = 50;
    blastoise!.volatileStatuses.set("substitute", { turnsLeft: -1 });

    ruleset.triggerLog = [];

    // Charizard uses Tackle (contact) on Blastoise — hits substitute
    engine.submitAction(0, { type: "move", side: 0, moveIndex: 0 });
    engine.submitAction(1, { type: "move", side: 1, moveIndex: 0 });

    // Assert: no on-contact triggers for the defender (Blastoise)
    // Note: Blastoise also uses Tackle on Charizard which COULD trigger on-contact on Charizard
    // but we only check defender-side contact from the Charizard->Blastoise attack
    const contactTriggersForBlastoise = ruleset.triggerLog.filter(
      (t) => t.trigger === "on-contact" && t.pokemonUid === "blastoise-1",
    );
    expect(contactTriggersForBlastoise.length).toBe(0);
  });

  it("given a contact move that KOs the defender, when defender has 0 HP after damage, then on-contact trigger does NOT fire", () => {
    // Source: Showdown — contact abilities do not activate if the defender fainted from the hit
    const { engine, ruleset } = createTestEngine({ side1Hp: 5 });
    // Damage > defender HP so defender will faint
    ruleset.setFixedDamage(10);

    ruleset.setAbilityHandler((_trigger, _ctx) => {
      return { activated: false, effects: [], messages: [] };
    });

    engine.start();
    // Confirm Blastoise has 5 HP (set via the createTestPokemon currentHp override)
    // Note: createTestPokemon might recalculate stats; check actual HP
    const blastoise = engine.getActive(1);
    expect(blastoise).not.toBeNull();
    // Force HP down to 5 to ensure the KO
    blastoise!.pokemon.currentHp = 5;

    ruleset.triggerLog = [];

    // Blastoise (faster, speed 120) attacks first, then Charizard attacks with Tackle
    // But Charizard is slower, so Blastoise attacks first. We need Charizard to attack Blastoise
    // while Blastoise is at 5 HP. Blastoise moves first (speed 120 > 80).
    // After Blastoise's tackle, Charizard still alive. Then Charizard tackles Blastoise (5 HP).
    engine.submitAction(0, { type: "move", side: 0, moveIndex: 0 });
    engine.submitAction(1, { type: "move", side: 1, moveIndex: 0 });

    // Assert: no on-contact trigger for fainted Blastoise
    const contactTriggersForBlastoise = ruleset.triggerLog.filter(
      (t) => t.trigger === "on-contact" && t.pokemonUid === "blastoise-1",
    );
    expect(contactTriggersForBlastoise.length).toBe(0);
  });
});

// ---- Passive immunity ability hook tests ----

describe("passive-immunity ability hook", () => {
  it("given damage calc returns 0 damage and 0 effectiveness, when passive-immunity handler returns activated, then move early-returns and sets lastMoveUsed", () => {
    // Source: Showdown — Water Absorb, Volt Absorb, Levitate, Flash Fire etc.
    // When damage is 0 due to ability immunity, the move is fully absorbed
    const { engine, ruleset, events } = createTestEngine();

    // Make damage calc return 0 damage and 0 effectiveness (ability immunity)
    ruleset.calculateDamage = (_ctx) => ({
      damage: 0,
      effectiveness: 0,
      isCrit: false,
      randomFactor: 1,
    });

    ruleset.setAbilityHandler((trigger, _ctx) => {
      if (trigger === "passive-immunity") {
        return {
          activated: true,
          effects: [
            {
              effectType: "heal" as const,
              target: "self" as const,
              value: 25,
            },
          ],
          messages: ["Blastoise's Water Absorb restored HP!"],
        };
      }
      return { activated: false, effects: [], messages: [] };
    });

    engine.start();
    events.length = 0;
    ruleset.triggerLog = [];

    // Charizard uses Tackle on Blastoise — damage calc returns 0/effectiveness 0
    engine.submitAction(0, { type: "move", side: 0, moveIndex: 0 });
    engine.submitAction(1, { type: "move", side: 1, moveIndex: 0 });

    // Assert: passive-immunity trigger fired
    const immunityTriggers = ruleset.triggerLog.filter((t) => t.trigger === "passive-immunity");
    expect(immunityTriggers.length).toBeGreaterThanOrEqual(1);

    // Assert: attacker's lastMoveUsed should be set (early-return path sets it)
    const charizard = engine.getActive(0);
    expect(charizard).not.toBeNull();
    // After both move executions, charizard should have lastMoveUsed = "tackle"
    expect(charizard!.lastMoveUsed).toBe("tackle");
  });

  it("given damage calc returns 0 damage and 0 effectiveness, when passive-immunity handler returns NOT activated (type immunity), then move proceeds normally with no early-return", () => {
    // Source: Showdown — type immunities (Normal -> Ghost) return activated: false
    // from the passive-immunity handler, so the move proceeds normally
    const { engine, ruleset, events } = createTestEngine();

    // Make damage calc return 0 damage and 0 effectiveness (type immunity)
    ruleset.calculateDamage = (_ctx) => ({
      damage: 0,
      effectiveness: 0,
      isCrit: false,
      randomFactor: 1,
    });

    ruleset.setAbilityHandler((trigger, _ctx) => {
      if (trigger === "passive-immunity") {
        // Type immunity, not ability immunity — do not activate
        return { activated: false, effects: [], messages: [] };
      }
      return { activated: false, effects: [], messages: [] };
    });

    engine.start();
    events.length = 0;
    ruleset.triggerLog = [];

    // Charizard uses Tackle on Blastoise — damage calc returns 0/effectiveness 0
    engine.submitAction(0, { type: "move", side: 0, moveIndex: 0 });
    engine.submitAction(1, { type: "move", side: 1, moveIndex: 0 });

    // Assert: passive-immunity trigger fired but was not activated
    const immunityTriggers = ruleset.triggerLog.filter((t) => t.trigger === "passive-immunity");
    expect(immunityTriggers.length).toBeGreaterThanOrEqual(1);

    // Assert: the effectiveness event should still be emitted (0 !== 1)
    // since the move did NOT early-return
    const effectivenessEvents = events.filter((e) => e.type === "effectiveness");
    expect(effectivenessEvents.length).toBeGreaterThanOrEqual(1);
  });

  it("given passive-immunity activates, when move is fully absorbed, then subsequent move effects are skipped", () => {
    // Source: Showdown — when an ability fully absorbs a move,
    // no secondary effects, no items, no contact checks happen
    const { engine, ruleset, events } = createTestEngine();

    // Make damage calc return 0 damage and 0 effectiveness
    ruleset.calculateDamage = (_ctx) => ({
      damage: 0,
      effectiveness: 0,
      isCrit: false,
      randomFactor: 1,
    });

    // Track whether executeMoveEffect was called
    let moveEffectCalled = false;
    const originalExecuteMoveEffect = ruleset.executeMoveEffect.bind(ruleset);
    ruleset.executeMoveEffect = (ctx) => {
      moveEffectCalled = true;
      return originalExecuteMoveEffect(ctx);
    };

    ruleset.setAbilityHandler((trigger, _ctx) => {
      if (trigger === "passive-immunity") {
        return {
          activated: true,
          effects: [],
          messages: ["Move was absorbed!"],
        };
      }
      return { activated: false, effects: [], messages: [] };
    });

    engine.start();
    events.length = 0;
    moveEffectCalled = false;

    // Both sides use Tackle. Blastoise (faster) attacks first.
    // Its damage calc returns 0/0 for Charizard.
    // Charizard's passive-immunity check fires... but wait,
    // the passive-immunity checks the DEFENDER (the one being hit).
    // Blastoise attacks Charizard -> calcDamage returns 0/0 -> passive-immunity
    // fires on Charizard (the defender). If activated, the move early-returns.
    engine.submitAction(0, { type: "move", side: 0, moveIndex: 0 });
    engine.submitAction(1, { type: "move", side: 1, moveIndex: 0 });

    // The first move (Blastoise -> Charizard) should early-return.
    // So executeMoveEffect should NOT be called for that first move.
    // But the second move (Charizard -> Blastoise) would also trigger passive-immunity
    // and early-return, so moveEffectCalled should still be false for absorbed moves.
    // Note: moveEffectCalled tracks ALL calls. Since both moves are absorbed,
    // no move effects should fire.
    expect(moveEffectCalled).toBe(false);
  });
});

// ---- processAbilityResult: status-inflict effect ----

describe("processAbilityResult: status-inflict effect", () => {
  it("given a status-inflict ability effect targeting opponent, when processAbilityResult runs, then target gets status and event is emitted", () => {
    // Source: Showdown — Static paralysis on contact
    const { engine, ruleset, events } = createTestEngine();

    ruleset.setAbilityHandler((trigger, _ctx) => {
      if (trigger === "on-contact") {
        return {
          activated: true,
          effects: [
            {
              effectType: "status-inflict" as const,
              target: "opponent" as const,
              status: "paralysis" as const,
            },
          ],
          messages: ["Blastoise's Static paralyzed the attacker!"],
        };
      }
      return { activated: false, effects: [], messages: [] };
    });

    engine.start();
    events.length = 0;

    // Charizard (slower) uses Tackle on Blastoise, Blastoise's on-contact fires Static
    engine.submitAction(0, { type: "move", side: 0, moveIndex: 0 });
    engine.submitAction(1, { type: "move", side: 1, moveIndex: 0 });

    // Blastoise (speed 120) moves first with Tackle on Charizard.
    // Charizard is the defender -> on-contact fires on Charizard with opponent=Blastoise.
    // Then Charizard (speed 80) uses Tackle on Blastoise.
    // Blastoise is the defender -> on-contact fires on Blastoise with opponent=Charizard.
    // The status-inflict targets "opponent" (= Charizard, the attacker).
    // So Charizard should get paralysis from the second attack.

    // Check that at least one status-inflict event was emitted for paralysis
    const statusEvents = events.filter(
      (e) => e.type === "status-inflict" && "status" in e && e.status === "paralysis",
    );
    expect(statusEvents.length).toBeGreaterThanOrEqual(1);
  });

  it("given a status-inflict ability effect targeting opponent who already has a status, when processAbilityResult runs, then status is NOT overwritten", () => {
    // Source: Showdown — cannot overwrite existing primary status
    const { engine, ruleset, events } = createTestEngine();

    ruleset.setAbilityHandler((trigger, _ctx) => {
      if (trigger === "on-contact") {
        return {
          activated: true,
          effects: [
            {
              effectType: "status-inflict" as const,
              target: "opponent" as const,
              status: "paralysis" as const,
            },
          ],
          messages: ["Static tried to paralyze!"],
        };
      }
      return { activated: false, effects: [], messages: [] };
    });

    engine.start();

    // Give Charizard burn before the turn
    const charizard = engine.getActive(0);
    expect(charizard).not.toBeNull();
    charizard!.pokemon.status = "burn";

    events.length = 0;

    engine.submitAction(0, { type: "move", side: 0, moveIndex: 0 });
    engine.submitAction(1, { type: "move", side: 1, moveIndex: 0 });

    // Charizard should still have burn, not paralysis
    expect(charizard!.pokemon.status).toBe("burn");
  });
});

// ---- processAbilityResult: volatile-inflict effect ----

describe("processAbilityResult: volatile-inflict effect", () => {
  it("given a volatile-inflict ability effect targeting opponent, when processAbilityResult runs, then target gets volatile and event is emitted", () => {
    // Source: Showdown — Cute Charm inflicts infatuation on contact
    const { engine, ruleset, events } = createTestEngine();

    ruleset.setAbilityHandler((trigger, _ctx) => {
      if (trigger === "on-contact") {
        return {
          activated: true,
          effects: [
            {
              effectType: "volatile-inflict" as const,
              target: "opponent" as const,
              volatile: "infatuation" as const,
            },
          ],
          messages: ["Blastoise's Cute Charm infatuated the attacker!"],
        };
      }
      return { activated: false, effects: [], messages: [] };
    });

    engine.start();
    events.length = 0;

    engine.submitAction(0, { type: "move", side: 0, moveIndex: 0 });
    engine.submitAction(1, { type: "move", side: 1, moveIndex: 0 });

    // Check that at least one volatile-start event was emitted for infatuation
    const volatileEvents = events.filter(
      (e) => e.type === "volatile-start" && "volatile" in e && e.volatile === "infatuation",
    );
    expect(volatileEvents.length).toBeGreaterThanOrEqual(1);
  });

  it("given a volatile-inflict ability effect targeting opponent who already has that volatile, when processAbilityResult runs, then volatile is NOT duplicated", () => {
    // Source: Showdown — cannot add duplicate volatile status
    const { engine, ruleset, events } = createTestEngine();

    ruleset.setAbilityHandler((trigger, _ctx) => {
      if (trigger === "on-contact") {
        return {
          activated: true,
          effects: [
            {
              effectType: "volatile-inflict" as const,
              target: "opponent" as const,
              volatile: "infatuation" as const,
              data: { source: "cute-charm" },
            },
          ],
          messages: ["Cute Charm tried to infatuate!"],
        };
      }
      return { activated: false, effects: [], messages: [] };
    });

    engine.start();

    // Give Charizard infatuation before the turn
    const charizard = engine.getActive(0);
    expect(charizard).not.toBeNull();
    charizard!.volatileStatuses.set("infatuation", { turnsLeft: -1 });

    events.length = 0;

    engine.submitAction(0, { type: "move", side: 0, moveIndex: 0 });
    engine.submitAction(1, { type: "move", side: 1, moveIndex: 0 });

    // Check that no volatile-start event was emitted for infatuation
    // (since Charizard already had it)
    const volatileStartEvents = events.filter(
      (e) =>
        e.type === "volatile-start" &&
        "volatile" in e &&
        e.volatile === "infatuation" &&
        "pokemon" in e &&
        e.pokemon === "Charizard",
    );
    expect(volatileStartEvents.length).toBe(0);
  });
});
