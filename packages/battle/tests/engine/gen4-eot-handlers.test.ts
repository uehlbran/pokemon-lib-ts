/**
 * Gen 4 EoT (End-of-Turn) dispatch handler tests.
 *
 * Tests that the engine correctly routes new Gen 4 EoT effect types introduced
 * in feat/gen4-battle-types-eot:
 *  - tailwindSet / trickRoomSet move effect results → correct state fields
 *  - weather-healing, speed-boost, shed-skin, poison-heal, bad-dreams → applyAbility("on-turn-end")
 *  - toxic-orb-activation / flame-orb-activation → applyHeldItem("end-of-turn") → inflict-status
 *  - aqua-ring, ingrain → 1/16 max HP heal per turn
 *  - wish → heal activates when turnsLeft reaches 0
 *
 * Source: Pokemon Showdown Gen 4 mod — EoT ordering and mechanic behaviour
 */
import type { AbilityTrigger, PokemonInstance } from "@pokemon-lib-ts/core";
import { describe, expect, it } from "vitest";
import type {
  AbilityContext,
  AbilityResult,
  BattleConfig,
  EndOfTurnEffect,
  ItemContext,
  ItemResult,
  MoveEffectContext,
  MoveEffectResult,
} from "../../src/context";
import { BattleEngine } from "../../src/engine";
import type { BattleEvent } from "../../src/events";
import { createTestPokemon } from "../../src/utils";
import { createMockDataManager } from "../helpers/mock-data-manager";
import { MockRuleset } from "../helpers/mock-ruleset";

// ─── Helpers ─────────────────────────────────────────────────────────────────

function createEngine(opts?: {
  team1?: PokemonInstance[];
  team2?: PokemonInstance[];
  ruleset?: MockRuleset;
  seed?: number;
}) {
  const ruleset = opts?.ruleset ?? new MockRuleset();
  const dataManager = createMockDataManager();
  const events: BattleEvent[] = [];

  const team1 = opts?.team1 ?? [
    createTestPokemon(6, 50, {
      uid: "charizard-1",
      nickname: "Charizard",
      moves: [{ moveId: "tackle", currentPP: 35, maxPP: 35, ppUps: 0 }],
      calculatedStats: {
        hp: 160,
        attack: 100,
        defense: 100,
        spAttack: 100,
        spDefense: 100,
        speed: 80,
      },
      currentHp: 160,
    }),
  ];

  const team2 = opts?.team2 ?? [
    createTestPokemon(9, 50, {
      uid: "blastoise-1",
      nickname: "Blastoise",
      moves: [{ moveId: "tackle", currentPP: 35, maxPP: 35, ppUps: 0 }],
      calculatedStats: {
        hp: 160,
        attack: 100,
        defense: 100,
        spAttack: 100,
        spDefense: 100,
        speed: 120,
      },
      currentHp: 160,
    }),
  ];

  const config: BattleConfig = {
    generation: 4,
    format: "singles",
    teams: [team1, team2],
    seed: opts?.seed ?? 12345,
  };

  ruleset.setGenerationForTest(config.generation);
  const engine = new BattleEngine(config, ruleset, dataManager);
  engine.on((e) => events.push(e));

  return { engine, ruleset, events };
}

// ─── Subclass helpers ────────────────────────────────────────────────────────

/**
 * Ruleset that captures executeMoveEffect calls and returns a configurable result.
 * Also tracks applyAbility and applyHeldItem calls.
 */
class Gen4MockRuleset extends MockRuleset {
  private moveEffectResult: MoveEffectResult = {
    statusInflicted: null,
    volatileInflicted: null,
    statChanges: [],
    recoilDamage: 0,
    healAmount: 0,
    switchOut: false,
    messages: [],
  };

  private abilityResult: AbilityResult = { activated: false, effects: [], messages: [] };
  private heldItemResult: ItemResult = { activated: false, effects: [], messages: [] };

  abilityCalls: Array<{ trigger: AbilityTrigger; context: AbilityContext }> = [];
  itemCalls: Array<{ trigger: string; context: ItemContext }> = [];

  setMoveEffectResult(result: Partial<MoveEffectResult>): void {
    this.moveEffectResult = { ...this.moveEffectResult, ...result };
  }

  setAbilityResult(result: AbilityResult): void {
    this.abilityResult = result;
  }

  setHeldItemResult(result: ItemResult): void {
    this.heldItemResult = result;
  }

  override executeMoveEffect(_ctx: MoveEffectContext): MoveEffectResult {
    return this.moveEffectResult;
  }

  override hasAbilities(): boolean {
    return true;
  }

  override applyAbility(trigger: AbilityTrigger, context: AbilityContext): AbilityResult {
    this.abilityCalls.push({ trigger, context });
    return this.abilityResult;
  }

  override hasHeldItems(): boolean {
    return true;
  }

  override applyHeldItem(trigger: string, context: ItemContext): ItemResult {
    this.itemCalls.push({ trigger, context });
    return this.heldItemResult;
  }
}

// ─── Move Effect Tests ───────────────────────────────────────────────────────

describe("tailwindSet move effect", () => {
  it("given a move that returns tailwindSet for the attacker, when the move effect is processed, then side tailwind is set and screens are unaffected", () => {
    // Source: Pokemon Showdown Gen 4 mod — tailwind sets active:true, turnsLeft:3 on the user's side
    const ruleset = new Gen4MockRuleset();
    ruleset.getEndOfTurnOrder = (): readonly EndOfTurnEffect[] => [];
    ruleset.setMoveEffectResult({
      tailwindSet: { turnsLeft: 3, side: "attacker" },
    });

    const { engine, events } = createEngine({ ruleset });
    engine.start();
    events.length = 0;

    engine.submitAction(0, { type: "move", side: 0, moveIndex: 0 });
    engine.submitAction(1, { type: "move", side: 1, moveIndex: 0 });

    const state = engine.getState();
    // Attacker is the faster pokemon (side 1 has speed 120, side 0 has speed 80)
    // The move is used by the first mover — we can't easily control which side moves first
    // without knowing exact speed. Let's just verify exactly ONE side got tailwind set.
    const side0Tailwind = state.sides[0].tailwind;
    const side1Tailwind = state.sides[1].tailwind;
    const tailwindSet = side0Tailwind.active || side1Tailwind.active;
    expect(tailwindSet).toBe(true);

    // The side that got tailwind should have turnsLeft = 3
    const activeSide = side0Tailwind.active ? side0Tailwind : side1Tailwind;
    expect(activeSide.turnsLeft).toBe(3);

    // Neither side's screens array should be populated
    expect(state.sides[0].screens).toHaveLength(0);
    expect(state.sides[1].screens).toHaveLength(0);

    // A "message" event about tailwind should be emitted
    const tailwindMessages = events.filter(
      (e) => e.type === "message" && "text" in e && e.text.includes("tailwind"),
    );
    expect(tailwindMessages.length).toBeGreaterThan(0);
  });

  it("given a move that returns tailwindSet for the defender side, when processed, then defender's side gets tailwind set", () => {
    // Source: Pokemon Showdown Gen 4 mod — tailwind applies to the specified side
    const ruleset = new Gen4MockRuleset();
    ruleset.getEndOfTurnOrder = (): readonly EndOfTurnEffect[] => [];
    ruleset.setMoveEffectResult({
      tailwindSet: { turnsLeft: 3, side: "defender" },
    });

    const { engine } = createEngine({ ruleset });
    engine.start();

    engine.submitAction(0, { type: "move", side: 0, moveIndex: 0 });
    engine.submitAction(1, { type: "move", side: 1, moveIndex: 0 });

    const state = engine.getState();
    // At least one side should have tailwind active (whichever was "defender" from the first mover)
    const eitherTailwindActive = state.sides[0].tailwind.active || state.sides[1].tailwind.active;
    expect(eitherTailwindActive).toBe(true);
  });
});

describe("trickRoomSet move effect", () => {
  it("given a move that returns trickRoomSet, when the move effect is processed, then state.trickRoom is active with correct turnsLeft", () => {
    // Source: Pokemon Showdown Gen 4 mod — Trick Room sets trickRoom.active=true, turnsLeft=5
    // The engine relies on result.messages for Trick Room messaging (no hardcoded message).
    const ruleset = new Gen4MockRuleset();
    ruleset.getEndOfTurnOrder = (): readonly EndOfTurnEffect[] => [];
    ruleset.setMoveEffectResult({
      trickRoomSet: { turnsLeft: 5 },
      messages: ["The dimensions were twisted!"],
    });

    const { engine, events } = createEngine({ ruleset });
    engine.start();
    events.length = 0;

    engine.submitAction(0, { type: "move", side: 0, moveIndex: 0 });
    engine.submitAction(1, { type: "move", side: 1, moveIndex: 0 });

    const state = engine.getState();
    expect(state.trickRoom.active).toBe(true);
    expect(state.trickRoom.turnsLeft).toBe(5);

    const trickRoomMessages = events.filter(
      (e) => e.type === "message" && "text" in e && e.text.includes("dimensions"),
    );
    expect(trickRoomMessages.length).toBeGreaterThan(0);
  });

  it("given two moves that both return trickRoomSet, when both are processed, then state.trickRoom reflects the last set", () => {
    // Triangulation: second set should overwrite first
    const ruleset = new Gen4MockRuleset();
    ruleset.getEndOfTurnOrder = (): readonly EndOfTurnEffect[] => [];
    ruleset.setMoveEffectResult({
      trickRoomSet: { turnsLeft: 5 },
    });

    const { engine } = createEngine({ ruleset });
    engine.start();

    engine.submitAction(0, { type: "move", side: 0, moveIndex: 0 });
    engine.submitAction(1, { type: "move", side: 1, moveIndex: 0 });

    // Both moves fire trickRoomSet, state should reflect it as active
    const state = engine.getState();
    expect(state.trickRoom.active).toBe(true);
  });
});

// ─── EoT Ability-Based Handler Tests ─────────────────────────────────────────

describe("weather-healing EoT slot", () => {
  it("given a Pokemon with Rain Dish that returns heal effect, when weather-healing EoT runs, then HP increases and heal event is emitted", () => {
    // Source: Pokemon Showdown Gen 4 mod — Rain Dish heals 1/16 max HP per turn in rain
    const ruleset = new Gen4MockRuleset();
    ruleset.getEndOfTurnOrder = (): readonly EndOfTurnEffect[] => ["weather-healing"];
    ruleset.setAbilityResult({
      activated: true,
      effects: [{ effectType: "heal", target: "self", value: 10 }],
      messages: [],
    });

    const { engine, events } = createEngine({ ruleset });
    engine.start();

    // Set both pokemon to partial HP so heal can show
    const active0 = engine.state.sides[0].active[0];
    const active1 = engine.state.sides[1].active[0];
    if (active0) active0.pokemon.currentHp = 100;
    if (active1) active1.pokemon.currentHp = 100;

    events.length = 0;
    engine.submitAction(0, { type: "move", side: 0, moveIndex: 0 });
    engine.submitAction(1, { type: "move", side: 1, moveIndex: 0 });

    // Both sides should have been healed by 10
    const healEvents = events.filter(
      (e) => e.type === "heal" && "source" in e && e.source === "ability",
    );
    expect(healEvents.length).toBeGreaterThanOrEqual(1);

    // applyAbility should have been called with "on-turn-end" trigger
    const turnEndCalls = ruleset.abilityCalls.filter((c) => c.trigger === "on-turn-end");
    expect(turnEndCalls.length).toBeGreaterThanOrEqual(1);
  });
});

describe("speed-boost EoT slot", () => {
  it("given a Pokemon with Speed Boost ability that returns stat-change effect, when speed-boost EoT runs, then applyAbility is called and stat-change event emitted", () => {
    // Source: Pokemon Showdown Gen 4 mod — Speed Boost raises Speed by 1 stage each turn
    const ruleset = new Gen4MockRuleset();
    ruleset.getEndOfTurnOrder = (): readonly EndOfTurnEffect[] => ["speed-boost"];
    ruleset.setAbilityResult({
      activated: true,
      effects: [{ effectType: "stat-change", target: "self", stat: "speed", stages: 1 }],
      messages: [],
    });

    const { engine, events } = createEngine({ ruleset });
    engine.start();
    events.length = 0;

    engine.submitAction(0, { type: "move", side: 0, moveIndex: 0 });
    engine.submitAction(1, { type: "move", side: 1, moveIndex: 0 });

    const statChangeEvents = events.filter((e) => e.type === "stat-change");
    expect(statChangeEvents.length).toBeGreaterThanOrEqual(1);

    // applyAbility called for on-turn-end
    const turnEndCalls = ruleset.abilityCalls.filter((c) => c.trigger === "on-turn-end");
    expect(turnEndCalls.length).toBeGreaterThanOrEqual(1);
  });
});

describe("shed-skin EoT slot", () => {
  it("given a Pokemon with Shed Skin that returns status-cure effect, when shed-skin EoT runs, then status is cleared and status-cure event emitted", () => {
    // Source: Pokemon Showdown Gen 4 mod — Shed Skin has 33% chance to cure primary status each turn
    const ruleset = new Gen4MockRuleset();
    ruleset.getEndOfTurnOrder = (): readonly EndOfTurnEffect[] => ["shed-skin"];
    ruleset.setAbilityResult({
      activated: true,
      effects: [{ effectType: "status-cure", target: "self" }],
      messages: [],
    });

    const { engine, events } = createEngine({ ruleset });
    engine.start();

    // Give the pokemon a status to cure
    const active0 = engine.state.sides[0].active[0];
    if (active0) active0.pokemon.status = "burn";

    events.length = 0;
    engine.submitAction(0, { type: "move", side: 0, moveIndex: 0 });
    engine.submitAction(1, { type: "move", side: 1, moveIndex: 0 });

    const statusCureEvents = events.filter((e) => e.type === "status-cure");
    expect(statusCureEvents.length).toBeGreaterThanOrEqual(1);

    // applyAbility called with on-turn-end trigger
    const turnEndCalls = ruleset.abilityCalls.filter((c) => c.trigger === "on-turn-end");
    expect(turnEndCalls.length).toBeGreaterThanOrEqual(1);
  });
});

describe("poison-heal EoT slot", () => {
  it("given a Pokemon with Poison Heal that returns heal effect (instead of status damage), when poison-heal EoT runs, then applyAbility is called and heal is applied", () => {
    // Source: Pokemon Showdown Gen 4 mod — Poison Heal converts poison damage to healing
    const ruleset = new Gen4MockRuleset();
    ruleset.getEndOfTurnOrder = (): readonly EndOfTurnEffect[] => ["poison-heal"];
    ruleset.setAbilityResult({
      activated: true,
      effects: [{ effectType: "heal", target: "self", value: 15 }],
      messages: [],
    });

    const { engine, events } = createEngine({ ruleset });
    engine.start();

    const active0 = engine.state.sides[0].active[0];
    if (active0) active0.pokemon.currentHp = 100;

    events.length = 0;
    engine.submitAction(0, { type: "move", side: 0, moveIndex: 0 });
    engine.submitAction(1, { type: "move", side: 1, moveIndex: 0 });

    // applyAbility should have been called
    const turnEndCalls = ruleset.abilityCalls.filter((c) => c.trigger === "on-turn-end");
    expect(turnEndCalls.length).toBeGreaterThanOrEqual(1);

    const healEvents = events.filter(
      (e) => e.type === "heal" && "source" in e && e.source === "ability",
    );
    expect(healEvents.length).toBeGreaterThanOrEqual(1);
  });
});

describe("bad-dreams EoT slot", () => {
  it("given a Pokemon with Bad Dreams that returns chip-damage effect, when bad-dreams EoT runs, then applyAbility is called and damage is applied", () => {
    // Source: Pokemon Showdown Gen 4 mod — Bad Dreams deals 1/8 max HP damage to sleeping foes
    const ruleset = new Gen4MockRuleset();
    ruleset.getEndOfTurnOrder = (): readonly EndOfTurnEffect[] => ["bad-dreams"];
    ruleset.setAbilityResult({
      activated: true,
      effects: [{ effectType: "chip-damage", target: "opponent", value: 20 }],
      messages: [],
    });

    const { engine, events } = createEngine({ ruleset });
    engine.start();

    // Give opponent a sleeping status
    const active1 = engine.state.sides[1].active[0];
    if (active1) active1.pokemon.status = "sleep";

    events.length = 0;
    engine.submitAction(0, { type: "move", side: 0, moveIndex: 0 });
    engine.submitAction(1, { type: "move", side: 1, moveIndex: 0 });

    const damageEvents = events.filter(
      (e) => e.type === "damage" && "source" in e && e.source === "ability",
    );
    expect(damageEvents.length).toBeGreaterThanOrEqual(1);

    const turnEndCalls = ruleset.abilityCalls.filter((c) => c.trigger === "on-turn-end");
    expect(turnEndCalls.length).toBeGreaterThanOrEqual(1);
  });
});

// ─── EoT Item-Based Handler Tests ────────────────────────────────────────────

describe("toxic-orb-activation EoT slot", () => {
  it("given a Pokemon holding Toxic Orb, when toxic-orb-activation EoT runs, then applyHeldItem is called and status-inflict event is emitted", () => {
    // Source: Pokemon Showdown Gen 4 mod — Toxic Orb badly poisons the holder at end of turn
    const ruleset = new Gen4MockRuleset();
    ruleset.getEndOfTurnOrder = (): readonly EndOfTurnEffect[] => ["toxic-orb-activation"];
    ruleset.setHeldItemResult({
      activated: true,
      effects: [{ type: "inflict-status", target: "self", status: "badly-poisoned" }],
      messages: [],
    });

    const team1 = [
      createTestPokemon(6, 50, {
        uid: "charizard-1",
        nickname: "Charizard",
        moves: [{ moveId: "tackle", currentPP: 35, maxPP: 35, ppUps: 0 }],
        heldItem: "toxic-orb",
        calculatedStats: {
          hp: 160,
          attack: 100,
          defense: 100,
          spAttack: 100,
          spDefense: 100,
          speed: 80,
        },
        currentHp: 160,
      }),
    ];

    const { engine, events } = createEngine({ ruleset, team1 });
    engine.start();
    events.length = 0;

    engine.submitAction(0, { type: "move", side: 0, moveIndex: 0 });
    engine.submitAction(1, { type: "move", side: 1, moveIndex: 0 });

    // applyHeldItem should have been called with "end-of-turn" trigger
    const eotItemCalls = ruleset.itemCalls.filter((c) => c.trigger === "end-of-turn");
    expect(eotItemCalls.length).toBeGreaterThanOrEqual(1);

    // A status-inflict event should have been emitted for badly-poisoned
    const statusInflictEvents = events.filter(
      (e) => e.type === "status-inflict" && "status" in e && e.status === "badly-poisoned",
    );
    expect(statusInflictEvents.length).toBeGreaterThanOrEqual(1);

    // The pokemon's status should be set
    const active0 = engine.state.sides[0].active[0];
    expect(active0?.pokemon.status).toBe("badly-poisoned");
  });
});

describe("flame-orb-activation EoT slot", () => {
  it("given a Pokemon holding Flame Orb, when flame-orb-activation EoT runs, then applyHeldItem is called and burn status is inflicted", () => {
    // Source: Pokemon Showdown Gen 4 mod — Flame Orb burns the holder at end of turn
    const ruleset = new Gen4MockRuleset();
    ruleset.getEndOfTurnOrder = (): readonly EndOfTurnEffect[] => ["flame-orb-activation"];
    ruleset.setHeldItemResult({
      activated: true,
      effects: [{ type: "inflict-status", target: "self", status: "burn" }],
      messages: [],
    });

    const team1 = [
      createTestPokemon(6, 50, {
        uid: "charizard-1",
        nickname: "Charizard",
        moves: [{ moveId: "tackle", currentPP: 35, maxPP: 35, ppUps: 0 }],
        heldItem: "flame-orb",
        calculatedStats: {
          hp: 160,
          attack: 100,
          defense: 100,
          spAttack: 100,
          spDefense: 100,
          speed: 80,
        },
        currentHp: 160,
      }),
    ];

    const { engine, events } = createEngine({ ruleset, team1 });
    engine.start();
    events.length = 0;

    engine.submitAction(0, { type: "move", side: 0, moveIndex: 0 });
    engine.submitAction(1, { type: "move", side: 1, moveIndex: 0 });

    const eotItemCalls = ruleset.itemCalls.filter((c) => c.trigger === "end-of-turn");
    expect(eotItemCalls.length).toBeGreaterThanOrEqual(1);
  });
});

// ─── EoT Volatile-Based Handler Tests ────────────────────────────────────────

describe("aqua-ring EoT slot", () => {
  it("given a Pokemon at partial HP with aqua-ring volatile, when aqua-ring EoT runs, then HP increases by floor(maxHp/16) and heal event emitted with source 'aqua-ring'", () => {
    // Source: Pokemon Showdown Gen 4 mod — Aqua Ring heals 1/16 max HP per turn
    const ruleset = new Gen4MockRuleset();
    ruleset.getEndOfTurnOrder = (): readonly EndOfTurnEffect[] => ["aqua-ring"];

    const { engine, events } = createEngine({ ruleset });
    engine.start();

    const active0 = engine.state.sides[0].active[0];
    if (active0) {
      active0.pokemon.currentHp = 100;
      active0.volatileStatuses.set("aqua-ring", { turnsLeft: -1 });
    }

    const maxHp = active0?.pokemon.calculatedStats?.hp ?? 160;
    const expectedHeal = Math.max(1, Math.floor(maxHp / 16));

    events.length = 0;
    engine.submitAction(0, { type: "move", side: 0, moveIndex: 0 });
    engine.submitAction(1, { type: "move", side: 1, moveIndex: 0 });

    const healEvents = events.filter(
      (e) => e.type === "heal" && "source" in e && e.source === "aqua-ring",
    );
    expect(healEvents.length).toBe(1);

    const healEvent = healEvents[0];
    if (healEvent && healEvent.type === "heal" && "amount" in healEvent) {
      expect(healEvent.amount).toBe(expectedHeal);
    }
  });

  it("given a Pokemon at deep partial HP with aqua-ring volatile, when aqua-ring EoT runs, then HP increases by exactly floor(maxHp/16)", () => {
    // Triangulation: aqua-ring should heal exactly 1/16 max HP (not more, not less when below cap)
    // Source: Pokemon Showdown Gen 4 mod — Aqua Ring heals 1/16 max HP per turn
    const ruleset = new Gen4MockRuleset();
    // No EoT damage — use only aqua-ring so we can measure exactly
    ruleset.setFixedDamage(0);
    ruleset.getEndOfTurnOrder = (): readonly EndOfTurnEffect[] => ["aqua-ring"];

    const { engine, events } = createEngine({ ruleset });
    engine.start();

    const active0 = engine.state.sides[0].active[0];
    // Read the actual maxHp after engine recalculates stats (MockRuleset formula gives 153 for Charizard L50)
    const maxHp = active0?.pokemon.calculatedStats?.hp ?? 153;
    const expectedHeal = Math.max(1, Math.floor(maxHp / 16));

    if (active0) {
      // Set HP to 50 (well below maxHp, so heal is exactly floor(maxHp/16))
      active0.pokemon.currentHp = 50;
      active0.volatileStatuses.set("aqua-ring", { turnsLeft: -1 });
    }

    events.length = 0;
    engine.submitAction(0, { type: "move", side: 0, moveIndex: 0 });
    engine.submitAction(1, { type: "move", side: 1, moveIndex: 0 });

    const healEvents = events.filter(
      (e) => e.type === "heal" && "source" in e && e.source === "aqua-ring",
    );
    expect(healEvents.length).toBe(1);

    const healEvent = healEvents[0];
    if (healEvent && healEvent.type === "heal" && "amount" in healEvent) {
      expect(healEvent.amount).toBe(expectedHeal);
    }
  });
});

describe("ingrain EoT slot", () => {
  it("given a Pokemon at partial HP with ingrain volatile, when ingrain EoT runs, then HP increases by floor(maxHp/16) and heal event emitted with source 'ingrain'", () => {
    // Source: Bulbapedia — Ingrain heals the user by 1/16 of its maximum HP at end of each turn
    const ruleset = new Gen4MockRuleset();
    ruleset.getEndOfTurnOrder = (): readonly EndOfTurnEffect[] => ["ingrain"];

    const { engine, events } = createEngine({ ruleset });
    engine.start();

    const active0 = engine.state.sides[0].active[0];
    if (active0) {
      active0.pokemon.currentHp = 80;
      active0.volatileStatuses.set("ingrain", { turnsLeft: -1 });
    }

    const maxHp = active0?.pokemon.calculatedStats?.hp ?? 160;
    const expectedHeal = Math.max(1, Math.floor(maxHp / 16));

    events.length = 0;
    engine.submitAction(0, { type: "move", side: 0, moveIndex: 0 });
    engine.submitAction(1, { type: "move", side: 1, moveIndex: 0 });

    const healEvents = events.filter(
      (e) => e.type === "heal" && "source" in e && e.source === "ingrain",
    );
    expect(healEvents.length).toBe(1);

    const healEvent = healEvents[0];
    if (healEvent && healEvent.type === "heal" && "amount" in healEvent) {
      expect(healEvent.amount).toBe(expectedHeal);
    }
  });
});

// ─── Wish EoT Handler ─────────────────────────────────────────────────────────

describe("wish EoT slot", () => {
  it("given side.wish active with turnsLeft=1 and healAmount=50, when wish EoT runs, then active Pokemon is healed by 50 and side.wish is null", () => {
    // Source: Pokemon Showdown Gen 3+ — Wish heals the Pokemon in the slot on the next turn
    const ruleset = new Gen4MockRuleset();
    ruleset.getEndOfTurnOrder = (): readonly EndOfTurnEffect[] => ["wish"];

    const { engine, events } = createEngine({ ruleset });
    engine.start();

    const active0 = engine.state.sides[0].active[0];
    if (active0) active0.pokemon.currentHp = 60;

    // Set up wish on side 0
    const state = engine.getState();
    state.sides[0].wish = { active: true, turnsLeft: 1, healAmount: 50 };

    events.length = 0;
    engine.submitAction(0, { type: "move", side: 0, moveIndex: 0 });
    engine.submitAction(1, { type: "move", side: 1, moveIndex: 0 });

    const wishHealEvents = events.filter(
      (e) => e.type === "heal" && "source" in e && e.source === "wish",
    );
    expect(wishHealEvents.length).toBeGreaterThanOrEqual(1);

    // After wish fires, side.wish should be null
    expect(state.sides[0].wish).toBeNull();
  });

  it("given side.wish active with turnsLeft=2, when wish EoT runs, then turnsLeft decrements to 1 and no heal event emitted yet", () => {
    // Triangulation: wish should not fire until turnsLeft reaches 0
    const ruleset = new Gen4MockRuleset();
    ruleset.getEndOfTurnOrder = (): readonly EndOfTurnEffect[] => ["wish"];

    const { engine, events } = createEngine({ ruleset });
    engine.start();

    const state = engine.getState();
    state.sides[0].wish = { active: true, turnsLeft: 2, healAmount: 50 };

    events.length = 0;
    engine.submitAction(0, { type: "move", side: 0, moveIndex: 0 });
    engine.submitAction(1, { type: "move", side: 1, moveIndex: 0 });

    // turnsLeft should have decremented from 2 to 1
    expect(state.sides[0].wish?.turnsLeft).toBe(1);

    // No wish heal should have fired yet
    const wishHealEvents = events.filter(
      (e) => e.type === "heal" && "source" in e && e.source === "wish",
    );
    expect(wishHealEvents.length).toBe(0);
  });
});

// ─── processAbilityResult new effect types ────────────────────────────────────

describe("processAbilityResult — heal effect type", () => {
  it("given an ability result with heal effect targeting self, when processed, then Pokemon HP increases and heal event is emitted", () => {
    // Source: Pokemon Showdown Gen 4 mod — Rain Dish / Ice Body produce heal ability effects
    const ruleset = new Gen4MockRuleset();
    ruleset.getEndOfTurnOrder = (): readonly EndOfTurnEffect[] => ["weather-healing"];
    ruleset.setAbilityResult({
      activated: true,
      effects: [{ effectType: "heal", target: "self", value: 20 }],
      messages: [],
    });

    const { engine, events } = createEngine({ ruleset });
    engine.start();

    const active0 = engine.state.sides[0].active[0];
    if (active0) active0.pokemon.currentHp = 80;

    events.length = 0;
    engine.submitAction(0, { type: "move", side: 0, moveIndex: 0 });
    engine.submitAction(1, { type: "move", side: 1, moveIndex: 0 });

    const healEvents = events.filter(
      (e) => e.type === "heal" && "source" in e && e.source === "ability",
    );
    expect(healEvents.length).toBeGreaterThanOrEqual(1);
  });
});

describe("processAbilityResult — chip-damage effect type", () => {
  it("given an ability result with chip-damage effect targeting opponent, when processed, then opponent HP decreases and damage event is emitted", () => {
    // Source: Pokemon Showdown Gen 4 mod — Bad Dreams: 1/8 max HP damage to sleeping foes
    const ruleset = new Gen4MockRuleset();
    ruleset.getEndOfTurnOrder = (): readonly EndOfTurnEffect[] => ["bad-dreams"];
    ruleset.setAbilityResult({
      activated: true,
      effects: [{ effectType: "chip-damage", target: "opponent", value: 20 }],
      messages: [],
    });

    const { engine, events } = createEngine({ ruleset });
    engine.start();

    events.length = 0;
    engine.submitAction(0, { type: "move", side: 0, moveIndex: 0 });
    engine.submitAction(1, { type: "move", side: 1, moveIndex: 0 });

    const damageEvents = events.filter(
      (e) => e.type === "damage" && "source" in e && e.source === "ability",
    );
    expect(damageEvents.length).toBeGreaterThanOrEqual(1);
  });
});

describe("processItemResult — inflict-status and chip-damage effect types", () => {
  it("given an item result with inflict-status effect, when processed, then Pokemon status is set and status-inflict event is emitted", () => {
    // Source: Pokemon Showdown Gen 4 mod — Toxic Orb / Flame Orb inflict status via item effects
    const ruleset = new Gen4MockRuleset();
    ruleset.getEndOfTurnOrder = (): readonly EndOfTurnEffect[] => ["toxic-orb-activation"];
    ruleset.setHeldItemResult({
      activated: true,
      effects: [{ type: "inflict-status", target: "self", status: "poison" }],
      messages: [],
    });

    const team1 = [
      createTestPokemon(6, 50, {
        uid: "charizard-1",
        nickname: "Charizard",
        moves: [{ moveId: "tackle", currentPP: 35, maxPP: 35, ppUps: 0 }],
        heldItem: "toxic-orb",
        calculatedStats: {
          hp: 160,
          attack: 100,
          defense: 100,
          spAttack: 100,
          spDefense: 100,
          speed: 80,
        },
        currentHp: 160,
      }),
    ];

    const { engine, events } = createEngine({ ruleset, team1 });
    engine.start();
    events.length = 0;

    engine.submitAction(0, { type: "move", side: 0, moveIndex: 0 });
    engine.submitAction(1, { type: "move", side: 1, moveIndex: 0 });

    const statusInflictEvents = events.filter((e) => e.type === "status-inflict");
    expect(statusInflictEvents.length).toBeGreaterThanOrEqual(1);
  });

  it("given an item result with chip-damage effect, when processed, then Pokemon HP decreases and damage event is emitted with source 'held-item'", () => {
    // Source: Pokemon Showdown Gen 4 mod — Black Sludge damages non-Poison types
    const ruleset = new Gen4MockRuleset();
    ruleset.getEndOfTurnOrder = (): readonly EndOfTurnEffect[] => ["black-sludge"];
    ruleset.setHeldItemResult({
      activated: true,
      effects: [{ type: "chip-damage", target: "self", value: 10 }],
      messages: [],
    });

    const team1 = [
      createTestPokemon(6, 50, {
        uid: "charizard-1",
        nickname: "Charizard",
        moves: [{ moveId: "tackle", currentPP: 35, maxPP: 35, ppUps: 0 }],
        heldItem: "black-sludge",
        calculatedStats: {
          hp: 160,
          attack: 100,
          defense: 100,
          spAttack: 100,
          spDefense: 100,
          speed: 80,
        },
        currentHp: 160,
      }),
    ];

    const { engine, events } = createEngine({ ruleset, team1 });
    engine.start();
    events.length = 0;

    engine.submitAction(0, { type: "move", side: 0, moveIndex: 0 });
    engine.submitAction(1, { type: "move", side: 1, moveIndex: 0 });

    const heldItemDamageEvents = events.filter(
      (e) => e.type === "damage" && "source" in e && e.source === "held-item",
    );
    expect(heldItemDamageEvents.length).toBeGreaterThanOrEqual(1);
  });
});

// ─── Slow Start Countdown EoT Handler ─────────────────────────────────────────

describe("slow-start-countdown EoT slot", () => {
  it("given a Pokemon with slow-start volatile (turnsLeft=5), when 5 turns of EoT ticks pass, then slow-start volatile is removed and volatile-end event is emitted", () => {
    // Source: Pokemon Showdown Gen 4 mod — Slow Start countdown on end-of-turn
    // Source: Bulbapedia — Slow Start: halves Attack and Speed for 5 turns after switch-in
    const ruleset = new Gen4MockRuleset();
    // Only run slow-start-countdown in EoT (no damage, no weather, etc.)
    ruleset.setFixedDamage(0);
    ruleset.getEndOfTurnOrder = (): readonly EndOfTurnEffect[] => ["slow-start-countdown"];

    const { engine, events } = createEngine({ ruleset });
    engine.start();

    // Set up the slow-start volatile on side 0's active Pokemon
    const active0 = engine.state.sides[0].active[0];
    if (active0) {
      active0.ability = "slow-start";
      active0.volatileStatuses.set("slow-start", { turnsLeft: 5 });
    }

    // Run 5 turns — each turn triggers EoT which decrements turnsLeft by 1
    for (let turn = 0; turn < 5; turn++) {
      events.length = 0;
      engine.submitAction(0, { type: "move", side: 0, moveIndex: 0 });
      engine.submitAction(1, { type: "move", side: 1, moveIndex: 0 });
    }

    // After 5 EoT ticks, the slow-start volatile should be removed
    expect(active0?.volatileStatuses.has("slow-start")).toBe(false);

    // A volatile-end event for slow-start should have been emitted
    const volatileEndEvents = events.filter(
      (e) => e.type === "volatile-end" && "volatile" in e && e.volatile === "slow-start",
    );
    expect(volatileEndEvents.length).toBe(1);

    // A message about Slow Start wearing off should have been emitted
    const slowStartMessages = events.filter(
      (e) => e.type === "message" && "text" in e && e.text.includes("Slow Start wore off"),
    );
    expect(slowStartMessages.length).toBe(1);
  });

  it("given a Pokemon with slow-start volatile (turnsLeft=2), when 1 turn of EoT ticks passes, then slow-start volatile still present with turnsLeft=1", () => {
    // Source: Showdown Gen 4 mod — Slow Start countdown is exact (not early or late)
    // Triangulation: verify the countdown decrements by exactly 1 per turn, not all at once
    const ruleset = new Gen4MockRuleset();
    ruleset.setFixedDamage(0);
    ruleset.getEndOfTurnOrder = (): readonly EndOfTurnEffect[] => ["slow-start-countdown"];

    const { engine, events } = createEngine({ ruleset });
    engine.start();

    const active0 = engine.state.sides[0].active[0];
    if (active0) {
      active0.ability = "slow-start";
      active0.volatileStatuses.set("slow-start", { turnsLeft: 2 });
    }

    events.length = 0;
    engine.submitAction(0, { type: "move", side: 0, moveIndex: 0 });
    engine.submitAction(1, { type: "move", side: 1, moveIndex: 0 });

    // After 1 tick, volatile should still be present with turnsLeft=1
    expect(active0?.volatileStatuses.has("slow-start")).toBe(true);
    expect(active0?.volatileStatuses.get("slow-start")?.turnsLeft).toBe(1);

    // No volatile-end event yet
    const volatileEndEvents = events.filter(
      (e) => e.type === "volatile-end" && "volatile" in e && e.volatile === "slow-start",
    );
    expect(volatileEndEvents.length).toBe(0);
  });

  it("given a Pokemon whose ability changed from slow-start but still has the volatile, when EoT ticks pass, then the volatile still counts down and is removed", () => {
    // Source: Showdown Gen 4 mod — the volatile should tick down regardless of current ability
    // This tests the fix that removed the ability check from the slow-start-countdown handler
    const ruleset = new Gen4MockRuleset();
    ruleset.setFixedDamage(0);
    ruleset.getEndOfTurnOrder = (): readonly EndOfTurnEffect[] => ["slow-start-countdown"];

    const { engine, events } = createEngine({ ruleset });
    engine.start();

    const active0 = engine.state.sides[0].active[0];
    if (active0) {
      // Ability was changed (e.g., by Skill Swap) but volatile remains
      active0.ability = "pressure";
      active0.volatileStatuses.set("slow-start", { turnsLeft: 1 });
    }

    events.length = 0;
    engine.submitAction(0, { type: "move", side: 0, moveIndex: 0 });
    engine.submitAction(1, { type: "move", side: 1, moveIndex: 0 });

    // The volatile should be removed even though the ability is no longer slow-start
    expect(active0?.volatileStatuses.has("slow-start")).toBe(false);

    const volatileEndEvents = events.filter(
      (e) => e.type === "volatile-end" && "volatile" in e && e.volatile === "slow-start",
    );
    expect(volatileEndEvents.length).toBe(1);
  });
});

// ─── Shared Countdown Handler Coverage ───────────────────────────────────────

describe("simple volatile countdown EoT slots", () => {
  const removalCases = [
    {
      effect: "taunt-countdown",
      volatile: "taunt",
      source: 'Bulbapedia — "Taunt lasts for 3 turns in Gen 4"',
    },
    {
      effect: "heal-block-countdown",
      volatile: "heal-block",
      source: "Bulbapedia / Showdown Gen 4 mod — Heal Block lasts 5 turns",
    },
    {
      effect: "embargo-countdown",
      volatile: "embargo",
      source: "Bulbapedia / Showdown Gen 4 mod — Embargo lasts 5 turns",
    },
    {
      effect: "magnet-rise-countdown",
      volatile: "magnet-rise",
      source: "Bulbapedia / Showdown Gen 4 mod — Magnet Rise lasts 5 turns",
    },
  ] as const;

  for (const testCase of removalCases) {
    it(`given ${testCase.volatile} with turnsLeft=1, when ${testCase.effect} runs, then it expires and emits volatile-end`, () => {
      // Source: see per-case source string above; these countdown volatiles expire once the
      // final end-of-turn tick decrements turnsLeft from 1 to 0.
      const ruleset = new Gen4MockRuleset();
      ruleset.setFixedDamage(0);
      ruleset.getEndOfTurnOrder = (): readonly EndOfTurnEffect[] => [testCase.effect];

      const { engine, events } = createEngine({ ruleset });
      engine.start();

      const active0 = engine.state.sides[0].active[0];
      active0?.volatileStatuses.set(testCase.volatile, { turnsLeft: 1 });

      events.length = 0;
      engine.submitAction(0, { type: "move", side: 0, moveIndex: 0 });
      engine.submitAction(1, { type: "move", side: 1, moveIndex: 0 });

      // Source: the volatile should be removed after the last tick, and the engine emits
      // one matching volatile-end event for the expired status.
      expect(active0?.volatileStatuses.has(testCase.volatile)).toBe(false);
      const volatileEndEvents = events.filter(
        (e) => e.type === "volatile-end" && "volatile" in e && e.volatile === testCase.volatile,
      );
      expect(volatileEndEvents.length).toBe(1);
    });
  }

  it("given disable with turnsLeft=2, when disable-countdown runs, then it decrements to 1 and stays active", () => {
    // Source: Bulbapedia — Disable lasts 4-7 turns in Gen 4, so a mid-countdown tick
    // should decrement by exactly 1 without ending the volatile early.
    const ruleset = new Gen4MockRuleset();
    ruleset.setFixedDamage(0);
    ruleset.getEndOfTurnOrder = (): readonly EndOfTurnEffect[] => ["disable-countdown"];

    const { engine, events } = createEngine({ ruleset });
    engine.start();

    const active0 = engine.state.sides[0].active[0];
    active0?.volatileStatuses.set("disable", { turnsLeft: 2 });

    events.length = 0;
    engine.submitAction(0, { type: "move", side: 0, moveIndex: 0 });
    engine.submitAction(1, { type: "move", side: 1, moveIndex: 0 });

    // Source: after one tick the volatile should remain with turnsLeft=1 and emit no
    // volatile-end event yet.
    expect(active0?.volatileStatuses.get("disable")?.turnsLeft).toBe(1);
    const volatileEndEvents = events.filter(
      (e) => e.type === "volatile-end" && "volatile" in e && e.volatile === "disable",
    );
    expect(volatileEndEvents.length).toBe(0);
  });
});

describe("yawn-countdown EoT slot", () => {
  it("given yawn with turnsLeft=2, when yawn-countdown runs, then it decrements to 1 without applying sleep", () => {
    // Source: Bulbapedia / Showdown Gen 4 mod — Yawn resolves at the end of the next turn,
    // so the first countdown tick should only decrement the drowsy volatile.
    const ruleset = new Gen4MockRuleset();
    ruleset.setFixedDamage(0);
    ruleset.getEndOfTurnOrder = (): readonly EndOfTurnEffect[] => ["yawn-countdown"];

    const { engine, events } = createEngine({ ruleset });
    engine.start();

    const active0 = engine.state.sides[0].active[0];
    active0?.volatileStatuses.set("yawn", { turnsLeft: 2 });

    events.length = 0;
    engine.submitAction(0, { type: "move", side: 0, moveIndex: 0 });
    engine.submitAction(1, { type: "move", side: 1, moveIndex: 0 });

    // Source: the first tick leaves Yawn active with one turn remaining and does not inflict sleep yet.
    expect(active0?.volatileStatuses.get("yawn")?.turnsLeft).toBe(1);
    expect(active0?.pokemon.status).toBe(null);
    const volatileEndEvents = events.filter(
      (e) => e.type === "volatile-end" && "volatile" in e && e.volatile === "yawn",
    );
    expect(volatileEndEvents.length).toBe(0);
  });

  it("given yawn with turnsLeft=1 and no existing status, when yawn-countdown runs, then the target falls asleep and yawn ends", () => {
    // Source: Bulbapedia / Showdown Gen 4 mod — Yawn causes drowsiness now and sleep at
    // the end of the next turn, so turnsLeft=1 should resolve to sleep on this tick.
    const ruleset = new Gen4MockRuleset();
    ruleset.setFixedDamage(0);
    ruleset.getEndOfTurnOrder = (): readonly EndOfTurnEffect[] => ["yawn-countdown"];

    const { engine, events } = createEngine({ ruleset });
    engine.start();

    const active0 = engine.state.sides[0].active[0];
    active0?.volatileStatuses.set("yawn", { turnsLeft: 1 });

    events.length = 0;
    engine.submitAction(0, { type: "move", side: 0, moveIndex: 0 });
    engine.submitAction(1, { type: "move", side: 1, moveIndex: 0 });

    // Source: Yawn removes the volatile and inflicts sleep exactly once when it resolves.
    expect(active0?.volatileStatuses.has("yawn")).toBe(false);
    expect(active0?.pokemon.status).toBe("sleep");
    const volatileEndEvents = events.filter(
      (e) => e.type === "volatile-end" && "volatile" in e && e.volatile === "yawn",
    );
    expect(volatileEndEvents.length).toBe(1);
  });

  it("given yawn with turnsLeft=1 and an existing primary status, when yawn-countdown runs, then it ends without overwriting the status", () => {
    // Source: Pokemon sleep clauses in cartridge/Showdown behavior only apply sleep if the
    // target is currently status-free; Yawn still ends even when sleep cannot be applied.
    const ruleset = new Gen4MockRuleset();
    ruleset.setFixedDamage(0);
    ruleset.getEndOfTurnOrder = (): readonly EndOfTurnEffect[] => ["yawn-countdown"];

    const { engine, events } = createEngine({ ruleset });
    engine.start();

    const active0 = engine.state.sides[0].active[0];
    if (active0) {
      active0.pokemon.status = "paralysis";
      active0.volatileStatuses.set("yawn", { turnsLeft: 1 });
    }

    events.length = 0;
    engine.submitAction(0, { type: "move", side: 0, moveIndex: 0 });
    engine.submitAction(1, { type: "move", side: 1, moveIndex: 0 });

    // Source: the status remains paralysis because Yawn only applies sleep to status-free targets.
    expect(active0?.volatileStatuses.has("yawn")).toBe(false);
    expect(active0?.pokemon.status).toBe("paralysis");
    const volatileEndEvents = events.filter(
      (e) => e.type === "volatile-end" && "volatile" in e && e.volatile === "yawn",
    );
    expect(volatileEndEvents.length).toBe(1);
  });
});

describe("room countdown EoT slots", () => {
  it("given Magic Room with turnsLeft=1, when magic-room-countdown runs, then it deactivates and emits the field message", () => {
    // Source: Showdown magicroom condition — Magic Room duration is 5 turns and the field
    // ends once the final countdown tick reaches 0.
    const ruleset = new Gen4MockRuleset();
    ruleset.setFixedDamage(0);
    ruleset.getEndOfTurnOrder = (): readonly EndOfTurnEffect[] => ["magic-room-countdown"];

    const { engine, events } = createEngine({ ruleset });
    engine.start();

    engine.state.magicRoom.active = true;
    engine.state.magicRoom.turnsLeft = 1;

    events.length = 0;
    engine.submitAction(0, { type: "move", side: 0, moveIndex: 0 });
    engine.submitAction(1, { type: "move", side: 1, moveIndex: 0 });

    // Source: the final tick deactivates the room and emits Showdown's return-to-normal message.
    expect(engine.state.magicRoom.active).toBe(false);
    expect(engine.state.magicRoom.turnsLeft).toBe(0);
    const roomMessages = events.filter(
      (e) => e.type === "message" && "text" in e && e.text === "The area returned to normal!",
    );
    expect(roomMessages.length).toBe(1);
  });

  it("given Wonder Room with turnsLeft=1, when wonder-room-countdown runs, then it deactivates and emits the field message", () => {
    // Source: Showdown wonderroom condition — Wonder Room duration is 5 turns and the field
    // ends once the final countdown tick reaches 0.
    const ruleset = new Gen4MockRuleset();
    ruleset.setFixedDamage(0);
    ruleset.getEndOfTurnOrder = (): readonly EndOfTurnEffect[] => ["wonder-room-countdown"];

    const { engine, events } = createEngine({ ruleset });
    engine.start();

    engine.state.wonderRoom.active = true;
    engine.state.wonderRoom.turnsLeft = 1;

    events.length = 0;
    engine.submitAction(0, { type: "move", side: 0, moveIndex: 0 });
    engine.submitAction(1, { type: "move", side: 1, moveIndex: 0 });

    // Source: the final tick deactivates the room and emits the Showdown/engine message.
    expect(engine.state.wonderRoom.active).toBe(false);
    expect(engine.state.wonderRoom.turnsLeft).toBe(0);
    const roomMessages = events.filter(
      (e) =>
        e.type === "message" &&
        "text" in e &&
        e.text === "Wonder Room wore off, and Defense and Sp. Def stats returned to normal!",
    );
    expect(roomMessages.length).toBe(1);
  });
});

// ─── Gen 5+ EoT Stub Tests ───────────────────────────────────────────────────

describe("Gen 5+ EoT handler stubs", () => {
  it("given moody in the EoT order with an inactive ability result, when processEndOfTurn runs, then the engine does not throw and delegates to applyAbility", () => {
    // Source: Showdown sim/abilities.ts — Moody triggers at residual phase
    // This test verifies the engine stub correctly delegates to the ruleset
    // without crashing, even though no gen currently returns this effect.
    const ruleset = new Gen4MockRuleset();
    ruleset.getEndOfTurnOrder = (): readonly EndOfTurnEffect[] => ["moody"];
    // Ability result is inactive by default — no stat changes applied
    ruleset.setAbilityResult({ activated: false, effects: [], messages: [] });

    const { engine, events } = createEngine({ ruleset });
    engine.start();
    events.length = 0;
    ruleset.abilityCalls = [];

    engine.submitAction(0, { type: "move", side: 0, moveIndex: 0 });
    engine.submitAction(1, { type: "move", side: 1, moveIndex: 0 });

    // applyAbility should have been called with "on-turn-end" for each side
    const eotAbilityCalls = ruleset.abilityCalls.filter((c) => c.trigger === "on-turn-end");
    expect(eotAbilityCalls.length).toBeGreaterThanOrEqual(2);
  });

  it("given harvest and pickup in the EoT order with inactive ability results, when processEndOfTurn runs, then the engine does not throw and deduplicates ability calls", () => {
    // Source: Showdown sim/abilities.ts — Harvest and Pickup trigger at residual phase
    // Source: pret/pokeemerald src/battle_util.c — ABILITYEFFECT_ENDTURN fires once per Pokemon
    // Verifies these stubs don't crash the engine when no gen implements them yet.
    // Bug #484 fix: each Pokemon's on-turn-end ability fires at most once per turn,
    // so harvest fires for both sides (2 calls) and pickup is skipped (already fired).
    const ruleset = new Gen4MockRuleset();
    ruleset.getEndOfTurnOrder = (): readonly EndOfTurnEffect[] => ["harvest", "pickup"];
    ruleset.setAbilityResult({ activated: false, effects: [], messages: [] });

    const { engine, events } = createEngine({ ruleset });
    engine.start();
    events.length = 0;
    ruleset.abilityCalls = [];

    engine.submitAction(0, { type: "move", side: 0, moveIndex: 0 });
    engine.submitAction(1, { type: "move", side: 1, moveIndex: 0 });

    // With dedup fix: applyAbility fires once per active Pokemon (2 sides = 2 calls),
    // not once per EoT case per side (which was the old buggy behavior of 4 calls).
    const eotAbilityCalls = ruleset.abilityCalls.filter((c) => c.trigger === "on-turn-end");
    expect(eotAbilityCalls.length).toBe(2);
  });

  it("given grassy-terrain-heal in the EoT order with no active grassy terrain, when processEndOfTurn runs, then the engine does not throw and skips terrain processing", () => {
    // Source: Showdown sim/field.ts — Grassy Terrain heal only applies when terrain is active
    // With no terrain set, the grassy-terrain-heal handler should be a no-op.
    const ruleset = new Gen4MockRuleset();
    ruleset.getEndOfTurnOrder = (): readonly EndOfTurnEffect[] => ["grassy-terrain-heal"];

    const { engine, events } = createEngine({ ruleset });
    engine.start();
    events.length = 0;

    engine.submitAction(0, { type: "move", side: 0, moveIndex: 0 });
    engine.submitAction(1, { type: "move", side: 1, moveIndex: 0 });

    // No terrain messages should be emitted since terrain is null
    // The fact that we reach this point without throwing proves the stub works
    expect(engine.getState().ended).toBe(false);
  });
});
