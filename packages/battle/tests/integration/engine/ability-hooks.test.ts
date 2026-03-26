import type { AbilityTrigger, PokemonInstance } from "@pokemon-lib-ts/core";
import {
  CORE_ABILITY_IDS,
  CORE_ABILITY_TRIGGER_IDS,
  CORE_MOVE_IDS,
  CORE_STATUS_IDS,
  CORE_VOLATILE_IDS,
} from "@pokemon-lib-ts/core";
import { describe, expect, it, vi } from "vitest";
import type { AbilityContext, AbilityResult, BattleConfig } from "../../../src/context";
import { BattleEngine } from "../../../src/engine";
import type { BattleEvent } from "../../../src/events";
import { createTestPokemon } from "../../../src/utils";
import { createMockDataManager } from "../../helpers/mock-data-manager";
import { MockRuleset } from "../../helpers/mock-ruleset";
import { createMockMoveSlot } from "../../helpers/move-slot";

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

const TRIGGERS = CORE_ABILITY_TRIGGER_IDS;

/**
 * Creates an engine with two teams using the ContactImmunityMockRuleset.
 * Side 0: Charizard (speed 80) with tackle (contact)
 * Side 1: Blastoise (speed 120) with tackle (contact) and thunderbolt (non-contact)
 */
function createTestEngine(opts?: {
  side0Moves?: Array<{ moveId: string; currentPP?: number; maxPP?: number; ppUps?: number }>;
  side1Moves?: Array<{ moveId: string; currentPP?: number; maxPP?: number; ppUps?: number }>;
  side0Hp?: number;
  side1Hp?: number;
}) {
  const ruleset = new ContactImmunityMockRuleset();
  const dataManager = createMockDataManager();
  const events: BattleEvent[] = [];

  const defaultMoves = [createMockMoveSlot(CORE_MOVE_IDS.tackle)];
  const makeMoves = (
    moves: Array<{ moveId: string; currentPP?: number; maxPP?: number; ppUps?: number }>,
  ) => moves.map((move) => createMockMoveSlot(move.moveId, move));

  const team1: PokemonInstance[] = [
    createTestPokemon(6, 50, {
      uid: "charizard-1",
      nickname: "Charizard",
      ability: CORE_ABILITY_IDS.blaze,
      moves: opts?.side0Moves ? makeMoves(opts.side0Moves) : defaultMoves,
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
      ability: CORE_ABILITY_IDS.static,
      moves: opts?.side1Moves
        ? makeMoves(opts.side1Moves)
        : [createMockMoveSlot(CORE_MOVE_IDS.tackle), createMockMoveSlot(CORE_MOVE_IDS.thunderbolt)],
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

  ruleset.setGenerationForTest(config.generation);
  const engine = new BattleEngine(config, ruleset, dataManager);
  engine.on((e) => events.push(e));

  return { engine, ruleset, events };
}

// ---- Contact ability hook tests ----

describe("on-contact ability hook", () => {
  it("given a contact move with damage > 0, when move hits defender, then on-contact trigger fires for defender", () => {
    // Source: Showdown sim/battle-actions.ts — contact abilities (Static, Flame Body, etc.)
    // fire when the attacker uses a contact move that deals damage
    const { engine, ruleset, events } = createTestEngine({
      side1Moves: [createMockMoveSlot(CORE_MOVE_IDS.thunderbolt)],
    });
    // MockRuleset default fixedDamage = 10 and tackle has contact: true
    ruleset.setFixedDamage(10);

    ruleset.setAbilityHandler((trigger, _ctx) => {
      if (trigger === TRIGGERS.onContact) {
        return {
          activated: true,
          effects: [
            {
              effectType: "status-inflict" as const,
              target: "opponent" as const,
              status: CORE_STATUS_IDS.paralysis,
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
    const contactTriggers = ruleset.triggerLog.filter((t) => t.trigger === TRIGGERS.onContact);
    expect(contactTriggers).toHaveLength(1);
    // The only contact trigger should be for the defender's pokemon.
    const defenderContactTrigger = contactTriggers.find((t) => t.pokemonUid === "blastoise-1");
    expect(defenderContactTrigger).toEqual({
      trigger: TRIGGERS.onContact,
      pokemonUid: "blastoise-1",
    });
  });

  it("given a non-contact move with damage > 0, when move hits defender, then on-contact trigger does NOT fire for that attack", () => {
    // Source: Showdown — only contact moves trigger contact abilities
    // Thunderbolt has contact: false
    // Both sides use Thunderbolt (non-contact) to ensure no on-contact triggers at all
    const { engine, ruleset } = createTestEngine({
      side0Moves: [createMockMoveSlot(CORE_MOVE_IDS.thunderbolt)],
      side1Moves: [createMockMoveSlot(CORE_MOVE_IDS.thunderbolt)],
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
    const contactTriggers = ruleset.triggerLog.filter((t) => t.trigger === TRIGGERS.onContact);
    expect(contactTriggers).toHaveLength(0);
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
    const blastoise = engine.state.sides[1].active[0];
    expect(blastoise).not.toBeNull();
    blastoise!.substituteHp = 50;
    blastoise!.volatileStatuses.set(CORE_VOLATILE_IDS.substitute, { turnsLeft: -1 });

    ruleset.triggerLog = [];

    // Charizard uses Tackle (contact) on Blastoise — hits substitute
    engine.submitAction(0, { type: "move", side: 0, moveIndex: 0 });
    engine.submitAction(1, { type: "move", side: 1, moveIndex: 0 });

    // Assert: no on-contact triggers for the defender (Blastoise)
    // Note: Blastoise also uses Tackle on Charizard which COULD trigger on-contact on Charizard
    // but we only check defender-side contact from the Charizard->Blastoise attack
    const contactTriggersForBlastoise = ruleset.triggerLog.filter(
      (t) => t.trigger === TRIGGERS.onContact && t.pokemonUid === "blastoise-1",
    );
    expect(contactTriggersForBlastoise).toHaveLength(0);
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
    const blastoise = engine.state.sides[1].active[0];
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
      (t) => t.trigger === TRIGGERS.onContact && t.pokemonUid === "blastoise-1",
    );
    expect(contactTriggersForBlastoise).toHaveLength(0);
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
      if (trigger === TRIGGERS.passiveImmunity) {
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
    const immunityTriggers = ruleset.triggerLog.filter(
      (t) => t.trigger === TRIGGERS.passiveImmunity,
    );
    expect(immunityTriggers).not.toHaveLength(0);

    // Assert: attacker's lastMoveUsed should be set (early-return path sets it)
    const charizard = engine.state.sides[0].active[0];
    expect(charizard).not.toBeNull();
    // After both move executions, charizard should have lastMoveUsed = CORE_MOVE_IDS.tackle
    expect(charizard!.lastMoveUsed).toBe(CORE_MOVE_IDS.tackle);
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
      if (trigger === TRIGGERS.passiveImmunity) {
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
    const immunityTriggers = ruleset.triggerLog.filter(
      (t) => t.trigger === TRIGGERS.passiveImmunity,
    );
    expect(immunityTriggers).not.toHaveLength(0);

    // Assert: the effectiveness event should still be emitted (0 !== 1)
    // since the move did NOT early-return
    const effectivenessEvents = events.filter((e) => e.type === "effectiveness");
    expect(effectivenessEvents).not.toHaveLength(0);
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

    const executeMoveEffectSpy = vi.spyOn(ruleset, "executeMoveEffect");

    ruleset.setAbilityHandler((trigger, _ctx) => {
      if (trigger === TRIGGERS.passiveImmunity) {
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
    expect(executeMoveEffectSpy).not.toHaveBeenCalled();
  });
});

// ---- processAbilityResult: status-inflict effect ----

describe("processAbilityResult: status-inflict effect", () => {
  it("given a status-inflict ability effect targeting opponent, when processAbilityResult runs, then target gets status and event is emitted", () => {
    // Source: Showdown — Static paralysis on contact
    const { engine, ruleset, events } = createTestEngine();

    ruleset.setAbilityHandler((trigger, _ctx) => {
      if (trigger === TRIGGERS.onContact) {
        return {
          activated: true,
          effects: [
            {
              effectType: "status-inflict" as const,
              target: "opponent" as const,
              status: CORE_STATUS_IDS.paralysis,
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
      (e) => e.type === "status-inflict" && "status" in e && e.status === CORE_STATUS_IDS.paralysis,
    );
    expect(statusEvents).not.toHaveLength(0);
  });

  it("given a status-inflict ability effect targeting opponent who already has a status, when processAbilityResult runs, then status is NOT overwritten", () => {
    // Source: Showdown — cannot overwrite existing primary status
    const { engine, ruleset, events } = createTestEngine();

    ruleset.setAbilityHandler((trigger, _ctx) => {
      if (trigger === TRIGGERS.onContact) {
        return {
          activated: true,
          effects: [
            {
              effectType: "status-inflict" as const,
              target: "opponent" as const,
              status: CORE_STATUS_IDS.paralysis,
            },
          ],
          messages: ["Static tried to paralyze!"],
        };
      }
      return { activated: false, effects: [], messages: [] };
    });

    engine.start();

    // Give Charizard burn before the turn
    const charizard = engine.state.sides[0].active[0];
    expect(charizard).not.toBeNull();
    charizard!.pokemon.status = CORE_STATUS_IDS.burn;

    events.length = 0;

    engine.submitAction(0, { type: "move", side: 0, moveIndex: 0 });
    engine.submitAction(1, { type: "move", side: 1, moveIndex: 0 });

    // Charizard should still have burn, not paralysis
    expect(charizard!.pokemon.status).toBe(CORE_STATUS_IDS.burn);
  });
});

// ---- processAbilityResult: companion volatile initialization ----

describe("processAbilityResult: companion volatile initialization after status infliction", () => {
  it("given ability inflicts badly-poisoned on opponent, when processAbilityResult runs, then target has toxic-counter volatile with turnsLeft=-1 and counter=1", () => {
    // Source: Showdown sim/battle-actions.ts — Toxic (badly-poisoned) damage multiplier starts at
    // 1/16 max HP and increases by 1/16 each EoT (counter starts at 1, increments each turn).
    // turnsLeft:-1 means no countdown (volatile persists until status ends). counter:1 is the
    // initial damage multiplier (N/16 where N = counter value).
    const { engine, ruleset, events } = createTestEngine();

    ruleset.setAbilityHandler((trigger, _ctx) => {
      if (trigger === TRIGGERS.onContact) {
        return {
          activated: true,
          effects: [
            {
              effectType: "status-inflict" as const,
              target: "opponent" as const,
              status: CORE_STATUS_IDS.badlyPoisoned,
            },
          ],
          messages: ["Toxic status inflicted!"],
        };
      }
      return { activated: false, effects: [], messages: [] };
    });

    engine.start();
    events.length = 0;

    engine.submitAction(0, { type: "move", side: 0, moveIndex: 0 });
    engine.submitAction(1, { type: "move", side: 1, moveIndex: 0 });

    // Charizard (side 0) gets badly-poisoned when attacking Blastoise (on-contact fires for defender Blastoise, targeting opponent=Charizard)
    const charizard = engine.state.sides[0].active[0];
    expect(charizard).not.toBeNull();
    expect(charizard!.pokemon.status).toBe(CORE_STATUS_IDS.badlyPoisoned);
    expect(charizard!.volatileStatuses.has(CORE_VOLATILE_IDS.toxicCounter)).toBe(true);
    const toxicCounter = charizard!.volatileStatuses.get(CORE_VOLATILE_IDS.toxicCounter);
    expect(toxicCounter).toBeDefined();
    expect(toxicCounter!.turnsLeft).toBe(-1);
    expect(toxicCounter!.data).toEqual({ counter: 1 });
  });

  it("given ability inflicts sleep on opponent, when processAbilityResult runs, then target has sleep-counter volatile with turnsLeft > 0", () => {
    // Source: Showdown — sleep via ability (e.g., Effect Spore sleep path)
    // The applyPrimaryStatus helper calls rollSleepTurns and sets sleep-counter
    const { engine, ruleset, events } = createTestEngine();

    ruleset.setAbilityHandler((trigger, _ctx) => {
      if (trigger === TRIGGERS.onContact) {
        return {
          activated: true,
          effects: [
            {
              effectType: "status-inflict" as const,
              target: "opponent" as const,
              status: CORE_STATUS_IDS.sleep,
            },
          ],
          messages: ["Sleep inflicted!"],
        };
      }
      return { activated: false, effects: [], messages: [] };
    });

    engine.start();
    events.length = 0;

    engine.submitAction(0, { type: "move", side: 0, moveIndex: 0 });
    engine.submitAction(1, { type: "move", side: 1, moveIndex: 0 });

    // Charizard gets sleep when it attacks Blastoise (on-contact fires for Blastoise, targeting Charizard)
    const charizard = engine.state.sides[0].active[0];
    expect(charizard).not.toBeNull();
    expect(charizard!.pokemon.status).toBe(CORE_STATUS_IDS.sleep);
    expect(charizard!.volatileStatuses.has(CORE_VOLATILE_IDS.sleepCounter)).toBe(true);
    const sleepCounter = charizard!.volatileStatuses.get(CORE_VOLATILE_IDS.sleepCounter);
    expect(sleepCounter).toBeDefined();
    // MockRuleset.rollSleepTurns returns rng.int(1, 3), so turnsLeft is 1-3
    expect(sleepCounter!.turnsLeft).toBeGreaterThanOrEqual(1);
    expect(sleepCounter!.turnsLeft).toBeLessThanOrEqual(3);
    // Verify startTime is stored (needed for Gen 5 sleep counter reset on switch-in)
    // Source: Showdown data/mods/gen5/conditions.ts -- slp.onSwitchIn reads effectState.startTime
    const startTime = (sleepCounter!.data as Record<string, unknown>)?.startTime;
    expect(typeof startTime).toBe("number");
    expect(startTime).toBe(sleepCounter!.turnsLeft);
  });

  it("given ability inflicts freeze on opponent, when processAbilityResult runs, then target has just-frozen volatile with turnsLeft=1", () => {
    // Source: pret/pokecrystal engine/battle/core.asm:1538-1540 — wPlayerJustGotFrozen
    // No Gen 4 ability directly causes freeze, but the engine must handle it if
    // any ability result includes status: 'freeze'. The applyPrimaryStatus helper
    // sets just-frozen { turnsLeft: 1 } to guard against same-turn EoT thaw.
    const { engine, ruleset, events } = createTestEngine();

    ruleset.setAbilityHandler((trigger, _ctx) => {
      if (trigger === TRIGGERS.onContact) {
        return {
          activated: true,
          effects: [
            {
              effectType: "status-inflict" as const,
              target: "opponent" as const,
              status: CORE_STATUS_IDS.freeze,
            },
          ],
          messages: ["Frozen via ability!"],
        };
      }
      return { activated: false, effects: [], messages: [] };
    });

    engine.start();
    events.length = 0;

    engine.submitAction(0, { type: "move", side: 0, moveIndex: 0 });
    engine.submitAction(1, { type: "move", side: 1, moveIndex: 0 });

    // Charizard gets frozen when it attacks Blastoise
    const charizard = engine.state.sides[0].active[0];
    expect(charizard).not.toBeNull();
    expect(charizard!.pokemon.status).toBe(CORE_STATUS_IDS.freeze);
    expect(charizard!.volatileStatuses.has(CORE_VOLATILE_IDS.justFrozen)).toBe(true);
    const justFrozen = charizard!.volatileStatuses.get(CORE_VOLATILE_IDS.justFrozen);
    expect(justFrozen).toBeDefined();
    expect(justFrozen!.turnsLeft).toBe(1);
  });
});

// ---- processAbilityResult: volatile-inflict effect ----

describe("processAbilityResult: volatile-inflict effect", () => {
  it("given a volatile-inflict ability effect targeting opponent, when processAbilityResult runs, then target gets volatile and event is emitted", () => {
    // Source: Showdown — Cute Charm inflicts infatuation on contact
    const { engine, ruleset, events } = createTestEngine();

    ruleset.setAbilityHandler((trigger, _ctx) => {
      if (trigger === TRIGGERS.onContact) {
        return {
          activated: true,
          effects: [
            {
              effectType: "volatile-inflict" as const,
              target: "opponent" as const,
              volatile: CORE_VOLATILE_IDS.infatuation,
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
      (e) =>
        e.type === "volatile-start" &&
        "volatile" in e &&
        e.volatile === CORE_VOLATILE_IDS.infatuation,
    );
    expect(volatileEvents).not.toHaveLength(0);
  });

  it("given a volatile-inflict ability effect targeting opponent who already has that volatile, when processAbilityResult runs, then volatile is NOT duplicated", () => {
    // Source: Showdown — cannot add duplicate volatile status
    const { engine, ruleset, events } = createTestEngine();

    ruleset.setAbilityHandler((trigger, _ctx) => {
      if (trigger === TRIGGERS.onContact) {
        return {
          activated: true,
          effects: [
            {
              effectType: "volatile-inflict" as const,
              target: "opponent" as const,
              volatile: CORE_VOLATILE_IDS.infatuation,
              data: { source: CORE_ABILITY_IDS.cuteCharm },
            },
          ],
          messages: ["Cute Charm tried to infatuate!"],
        };
      }
      return { activated: false, effects: [], messages: [] };
    });

    engine.start();

    // Give Charizard infatuation before the turn
    const charizard = engine.state.sides[0].active[0];
    expect(charizard).not.toBeNull();
    charizard!.volatileStatuses.set(CORE_VOLATILE_IDS.infatuation, { turnsLeft: -1 });

    events.length = 0;

    engine.submitAction(0, { type: "move", side: 0, moveIndex: 0 });
    engine.submitAction(1, { type: "move", side: 1, moveIndex: 0 });

    // Check that no volatile-start event was emitted for infatuation
    // (since Charizard already had it)
    const volatileStartEvents = events.filter(
      (e) =>
        e.type === "volatile-start" &&
        "volatile" in e &&
        e.volatile === CORE_VOLATILE_IDS.infatuation &&
        "pokemon" in e &&
        e.pokemon === "Charizard",
    );
    expect(volatileStartEvents.length).toBe(0);
  });
});

// ---- on-before-move ability hook tests ----

describe("on-before-move ability hook", () => {
  it("given MockRuleset returns movePrevented=true on-before-move, when submitAction move, then move is blocked and lastMoveUsed is set", () => {
    // Source: Showdown sim/battle-actions.ts — beforeMove ability hook can prevent move execution
    // (e.g., Truant skips every other turn)
    const { engine, ruleset, events } = createTestEngine();
    ruleset.setFixedDamage(10);

    ruleset.setAbilityHandler((trigger, _ctx) => {
      if (trigger === TRIGGERS.onBeforeMove) {
        return {
          activated: true,
          messages: ["Charizard is loafing around!"],
          movePrevented: true,
          effects: [],
        };
      }
      return { activated: false, effects: [], messages: [] };
    });

    engine.start();
    events.length = 0;
    ruleset.triggerLog = [];

    // Charizard (side 0) uses Tackle — should be blocked by on-before-move
    engine.submitAction(0, { type: "move", side: 0, moveIndex: 0 });
    engine.submitAction(1, { type: "move", side: 1, moveIndex: 0 });

    // Assert: on-before-move was called
    const beforeMoveTriggers = ruleset.triggerLog.filter(
      (t) => t.trigger === TRIGGERS.onBeforeMove,
    );
    expect(beforeMoveTriggers).not.toHaveLength(0);

    // Assert: the loafing message was emitted
    // Source: Showdown — Truant emits a message when the ability blocks the move
    const loafingMessages = events.filter(
      (e) => e.type === "message" && "text" in e && e.text.includes("loafing"),
    );
    expect(loafingMessages).not.toHaveLength(0);

    // Assert: no damage event from the blocked Pokemon
    // Because both sides fire on-before-move and both are prevented,
    // we check that no damage event was emitted at all
    const damageEvents = events.filter((e) => e.type === "damage");
    expect(damageEvents).toHaveLength(0);
  });

  it("given MockRuleset returns activated=false on-before-move, when submitAction move, then move proceeds normally", () => {
    // Source: Showdown sim/battle-actions.ts — ability does not activate = move proceeds
    const { engine, ruleset, events } = createTestEngine();
    ruleset.setFixedDamage(10);

    ruleset.setAbilityHandler((_trigger, _ctx) => {
      return { activated: false, effects: [], messages: [] };
    });

    engine.start();
    events.length = 0;
    ruleset.triggerLog = [];

    engine.submitAction(0, { type: "move", side: 0, moveIndex: 0 });
    engine.submitAction(1, { type: "move", side: 1, moveIndex: 0 });

    // Assert: on-before-move was called but did not prevent the move
    const beforeMoveTriggers = ruleset.triggerLog.filter(
      (t) => t.trigger === TRIGGERS.onBeforeMove,
    );
    expect(beforeMoveTriggers).not.toHaveLength(0);

    // Assert: damage events were emitted (moves proceeded normally)
    // Source: both Charizard and Blastoise should deal 10 damage each
    const damageEvents = events.filter((e) => e.type === "damage");
    expect(damageEvents.length).toBe(2);
  });
});

// ---- on-damage-taken ability hook tests ----

describe("on-damage-taken ability hook", () => {
  it("given MockRuleset's on-damage-taken returns a type-change effect, when move deals damage, then type-change is applied", () => {
    // Source: Showdown sim/battle-actions.ts — Color Change: changes the target's type
    // to match the type of the move that hit it
    const { engine, ruleset, events } = createTestEngine();
    ruleset.setFixedDamage(10);

    ruleset.setAbilityHandler((trigger, _ctx) => {
      if (trigger === TRIGGERS.onDamageTaken) {
        return {
          activated: true,
          effects: [
            {
              effectType: "type-change" as const,
              target: "self" as const,
              types: ["normal" as const],
            },
          ],
          messages: ["Color Change activated!"],
        };
      }
      return { activated: false, effects: [], messages: [] };
    });

    engine.start();
    events.length = 0;
    ruleset.triggerLog = [];

    engine.submitAction(0, { type: "move", side: 0, moveIndex: 0 });
    engine.submitAction(1, { type: "move", side: 1, moveIndex: 0 });

    // Assert: on-damage-taken was called for the defender
    const damageTakenTriggers = ruleset.triggerLog.filter(
      (t) => t.trigger === TRIGGERS.onDamageTaken,
    );
    expect(damageTakenTriggers).not.toHaveLength(0);

    // Assert: type-change message was emitted
    // Source: BattleEngine.processAbilityResult emits "type changed" messages
    const typeChangeMessages = events.filter(
      (e) => e.type === "message" && "text" in e && e.text.includes("type changed"),
    );
    expect(typeChangeMessages).not.toHaveLength(0);
  });

  it("given damage = 0 from immunity, when ability check runs, then on-damage-taken does NOT fire", () => {
    // Source: Showdown — on-damage-taken only fires when actual damage > 0
    const { engine, ruleset } = createTestEngine();

    // Make damage calc return 0 (type immunity scenario)
    ruleset.calculateDamage = (_ctx) => ({
      damage: 0,
      effectiveness: 0,
      isCrit: false,
      randomFactor: 1,
    });

    ruleset.setAbilityHandler((_trigger, _ctx) => {
      return { activated: false, effects: [], messages: [] };
    });

    engine.start();
    ruleset.triggerLog = [];

    engine.submitAction(0, { type: "move", side: 0, moveIndex: 0 });
    engine.submitAction(1, { type: "move", side: 1, moveIndex: 0 });

    // Assert: on-damage-taken was NOT called (damage was 0)
    const damageTakenTriggers = ruleset.triggerLog.filter(
      (t) => t.trigger === TRIGGERS.onDamageTaken,
    );
    expect(damageTakenTriggers).toHaveLength(0);
  });
});

// ---- on-status-inflicted ability hook tests ----

describe("on-status-inflicted ability hook", () => {
  it("given MockRuleset's on-status-inflicted returns status-inflict effect, when status inflicted on target, then opponent gets same status (Synchronize pattern)", () => {
    // Source: pret/pokeemerald — ABILITY_SYNCHRONIZE: when the holder is poisoned, burned,
    // or paralyzed, the opponent receives the same status condition
    const { engine, ruleset, events } = createTestEngine();
    ruleset.setFixedDamage(10);

    // Make executeMoveEffect inflict paralysis on the defender
    ruleset.executeMoveEffect = (_ctx) => ({
      statusInflicted: CORE_STATUS_IDS.paralysis,
      volatileInflicted: null,
      statChanges: [],
      recoilDamage: 0,
      healAmount: 0,
      switchOut: false,
      messages: [],
    });

    // When on-status-inflicted fires, mirror the status to the opponent
    ruleset.setAbilityHandler((trigger, _ctx) => {
      if (trigger === TRIGGERS.onStatusInflicted) {
        // The status-inflicted pokemon mirrors the status to the opponent
        return {
          activated: true,
          effects: [
            {
              effectType: "status-inflict" as const,
              target: "opponent" as const,
              status: CORE_STATUS_IDS.paralysis,
            },
          ],
          messages: ["Synchronize activated!"],
        };
      }
      return { activated: false, effects: [], messages: [] };
    });

    engine.start();
    events.length = 0;
    ruleset.triggerLog = [];

    // Blastoise (faster, speed 120) attacks Charizard and inflicts paralysis
    engine.submitAction(0, { type: "move", side: 0, moveIndex: 0 });
    engine.submitAction(1, { type: "move", side: 1, moveIndex: 0 });

    // Assert: on-status-inflicted was called
    const statusTriggers = ruleset.triggerLog.filter(
      (t) => t.trigger === TRIGGERS.onStatusInflicted,
    );
    expect(statusTriggers).not.toHaveLength(0);

    // Assert: Synchronize message was emitted
    const syncMessages = events.filter(
      (e) => e.type === "message" && "text" in e && e.text.includes("Synchronize"),
    );
    expect(syncMessages).not.toHaveLength(0);
  });
});

// ---- getPPCost tests ----

describe("getPPCost integration", () => {
  it("given MockRuleset.getPPCost returns 2 (Pressure), when move is used, then PP is deducted by 2", () => {
    // Source: pret/pokeemerald — ABILITY_PRESSURE deducts 2 PP per move use
    // Pressure doubles the PP cost of moves that target the Pressure holder.
    const { engine, ruleset, events } = createTestEngine({
      side0Moves: [createMockMoveSlot(CORE_MOVE_IDS.tackle)],
    });
    ruleset.setFixedDamage(10);
    ruleset.setPPCost(2);

    engine.start();
    events.length = 0;

    // Get Charizard's PP before the move
    const charizard = engine.state.sides[0].active[0];
    expect(charizard).not.toBeNull();
    const ppBefore = charizard!.pokemon.moves[0]!.currentPP;
    // Source: initial PP is 35 (set in createTestEngine)
    expect(ppBefore).toBe(createMockMoveSlot(CORE_MOVE_IDS.tackle).currentPP);

    engine.submitAction(0, { type: "move", side: 0, moveIndex: 0 });
    engine.submitAction(1, { type: "move", side: 1, moveIndex: 0 });

    // Assert: PP was deducted by 2 (Pressure)
    // Source: 35 - 2 = 33
    const ppAfter = charizard!.pokemon.moves[0]!.currentPP;
    expect(ppAfter).toBe(33);
  });

  it("given MockRuleset.getPPCost returns 1 (default, no Pressure), when move is used, then PP is deducted by 1", () => {
    // Source: pret/pokeemerald — standard PP deduction is 1 per move use
    const { engine, ruleset, events } = createTestEngine({
      side0Moves: [createMockMoveSlot(CORE_MOVE_IDS.tackle)],
    });
    ruleset.setFixedDamage(10);
    // Default ppCost is 1 (no setPPCost call needed)

    engine.start();
    events.length = 0;

    const charizard = engine.state.sides[0].active[0];
    expect(charizard).not.toBeNull();
    const ppBefore = charizard!.pokemon.moves[0]!.currentPP;
    // Source: initial PP is 35 (set in createTestEngine)
    expect(ppBefore).toBe(createMockMoveSlot(CORE_MOVE_IDS.tackle).currentPP);

    engine.submitAction(0, { type: "move", side: 0, moveIndex: 0 });
    engine.submitAction(1, { type: "move", side: 1, moveIndex: 0 });

    // Assert: PP was deducted by 1 (standard)
    // Source: 35 - 1 = 34
    const ppAfter = charizard!.pokemon.moves[0]!.currentPP;
    expect(ppAfter).toBe(34);
  });
});
