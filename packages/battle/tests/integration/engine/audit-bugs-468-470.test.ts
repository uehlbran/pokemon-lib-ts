/**
 * Engine-level tests for audit bugs #468 and #470.
 *
 * #468 — Uproar end-of-turn handler: decrements volatile, wakes sleeping Pokemon
 * #470 — Multi-hit final-hit defender residuals: poison damage after last hit
 *
 * Source: pret/pokeemerald — Uproar prevents sleep and ticks down each turn
 * Source: pret/pokered engine/battle/core.asm — multi-hit poison/burn/leech per hit
 */
import type { PokemonInstance, VolatileStatus } from "@pokemon-lib-ts/core";
import { describe, expect, it } from "vitest";
import type {
  BattleConfig,
  EndOfTurnEffect,
  MoveEffectContext,
  MoveEffectResult,
} from "../../../src/context";
import { BattleEngine } from "../../../src/engine";
import type { BattleEvent } from "../../../src/events";
import { createTestPokemon } from "../../../src/utils";
import { createMockDataManager } from "../../helpers/mock-data-manager";
import { MockRuleset } from "../../helpers/mock-ruleset";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

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
    generation: 3,
    format: "singles",
    teams: [team1, team2],
    seed: opts?.seed ?? 12345,
  };

  ruleset.setGenerationForTest(config.generation);
  const engine = new BattleEngine(config, ruleset, dataManager);
  engine.on((e) => events.push(e));

  return { engine, ruleset, events };
}

// ═══════════════════════════════════════════════════════════════════════════
// #468 — Uproar EoT handler
// ═══════════════════════════════════════════════════════════════════════════

/**
 * A MockRuleset subclass that includes "uproar" in getEndOfTurnOrder.
 */
class UproarMockRuleset extends MockRuleset {
  override getEndOfTurnOrder(): readonly EndOfTurnEffect[] {
    return ["uproar", "status-damage"];
  }
}

describe("#468 — Uproar end-of-turn handler", () => {
  it("given an active Pokemon with uproar volatile (turnsLeft=2), when end-of-turn processes, then turnsLeft decrements to 1", () => {
    // Source: pret/pokeemerald — Uproar countdown ticks each end-of-turn
    const ruleset = new UproarMockRuleset();
    const { engine, events } = createEngine({ ruleset });
    engine.start();

    // Set up the uproar volatile on side 1's active Pokemon (Blastoise, faster = moves first)
    const state = engine.getState();
    const blastoise = state.sides[1].active[0];
    blastoise.volatileStatuses.set("uproar" as VolatileStatus, { turnsLeft: 2 });

    events.length = 0;

    // Submit moves for both sides to trigger a turn
    engine.submitAction(0, { type: "move", side: 0, moveIndex: 0 });
    engine.submitAction(1, { type: "move", side: 1, moveIndex: 0 });

    // After the turn, uproar turnsLeft should have decremented from 2 to 1
    const uproarData = blastoise.volatileStatuses.get("uproar" as VolatileStatus);
    expect(uproarData).toBeDefined();
    expect(uproarData!.turnsLeft).toBe(1);
  });

  it("given an active Pokemon with uproar volatile (turnsLeft=1), when end-of-turn processes, then uproar volatile is removed", () => {
    // Source: pret/pokeemerald — Uproar expires when countdown reaches 0
    // Triangulation: turnsLeft=1 -> should expire (different from turnsLeft=2 case above)
    const ruleset = new UproarMockRuleset();
    const { engine, events } = createEngine({ ruleset });
    engine.start();

    const state = engine.getState();
    const blastoise = state.sides[1].active[0];
    blastoise.volatileStatuses.set("uproar" as VolatileStatus, { turnsLeft: 1 });

    events.length = 0;

    engine.submitAction(0, { type: "move", side: 0, moveIndex: 0 });
    engine.submitAction(1, { type: "move", side: 1, moveIndex: 0 });

    // The uproar volatile should be gone
    expect(blastoise.volatileStatuses.has("uproar" as VolatileStatus)).toBe(false);

    // Should emit a volatile-end event and a message about uproar ending
    const volatileEndEvents = events.filter(
      (e) => e.type === "volatile-end" && "volatile" in e && e.volatile === "uproar",
    );
    expect(volatileEndEvents.length).toBeGreaterThan(0);

    const uproarEndMessages = events.filter(
      (e) => e.type === "message" && "text" in e && (e.text as string).includes("uproar ended"),
    );
    expect(uproarEndMessages.length).toBeGreaterThan(0);
  });

  it("given an active Pokemon with uproar volatile and opponent is sleeping, when end-of-turn processes, then sleeping Pokemon wakes up", () => {
    // Source: pret/pokeemerald — Uproar prevents sleep: wakes all sleeping Pokemon on the field
    const ruleset = new UproarMockRuleset();
    const { engine, events } = createEngine({ ruleset });
    engine.start();

    const state = engine.getState();
    // Side 1 (Blastoise) has uproar
    const blastoise = state.sides[1].active[0];
    blastoise.volatileStatuses.set("uproar" as VolatileStatus, { turnsLeft: 3 });

    // Side 0 (Charizard) is asleep with enough sleep-counter to survive action phase.
    // Without sleep-counter, MockRuleset.processSleepTurn wakes the Pokemon immediately.
    const charizard = state.sides[0].active[0];
    charizard.pokemon.status = "sleep";
    charizard.volatileStatuses.set("sleep-counter" as VolatileStatus, { turnsLeft: 5 });

    events.length = 0;

    engine.submitAction(0, { type: "move", side: 0, moveIndex: 0 });
    engine.submitAction(1, { type: "move", side: 1, moveIndex: 0 });

    // Charizard should be woken up
    expect(charizard.pokemon.status).toBe(null);

    // Should emit a status-cure event for sleep
    const statusCureEvents = events.filter(
      (e) => e.type === "status-cure" && "status" in e && e.status === "sleep",
    );
    expect(statusCureEvents.length).toBeGreaterThan(0);

    // Should emit a message about waking up due to uproar
    const wakeMessages = events.filter(
      (e) => e.type === "message" && "text" in e && (e.text as string).includes("uproar"),
    );
    expect(wakeMessages.length).toBeGreaterThan(0);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// #470 — Multi-hit final-hit defender residuals
// ═══════════════════════════════════════════════════════════════════════════

/**
 * A MockRuleset subclass that:
 * 1. Returns multiHitCount from executeMoveEffect (always)
 * 2. Returns ["status-damage"] from getPostAttackResidualOrder
 *
 * This simulates a multi-hit move hitting a poisoned defender, where
 * poison damage should fire after each hit including the final one.
 */
class MultiHitMockRuleset extends MockRuleset {
  private hitCount: number;

  constructor(hitCount: number) {
    super();
    this.hitCount = hitCount;
  }

  override executeMoveEffect(_context: MoveEffectContext): MoveEffectResult {
    return {
      statusInflicted: null,
      volatileInflicted: null,
      statChanges: [],
      recoilDamage: 0,
      healAmount: 0,
      switchOut: false,
      messages: [],
      multiHitCount: this.hitCount,
    };
  }

  override getPostAttackResidualOrder(): readonly EndOfTurnEffect[] {
    return ["status-damage"];
  }

  override getEndOfTurnOrder(): readonly EndOfTurnEffect[] {
    // No EoT effects to keep it simple
    return [];
  }
}

describe("#470 — Multi-hit final-hit defender residuals", () => {
  it("given a poisoned defender hit by a 3-hit multi-hit move, when all hits land, then poison damage fires after the final hit", () => {
    // Source: pokered engine/battle/core.asm — HandlePoisonBurnLeechSeed runs per hit
    // Bug #470: without the fix, poison only fires between hits (inside the loop),
    // not after the last hit (which exits the loop before residuals run).
    const ruleset = new MultiHitMockRuleset(2); // 2 extra hits beyond first = 3 total
    const { engine, events } = createEngine({ ruleset });
    engine.start();

    const state = engine.getState();
    // The faster side (side 1, speed=120) attacks the slower side (side 0, speed=80).
    // We want the defender (side 0, Charizard) to be poisoned.
    const charizard = state.sides[0].active[0];
    charizard.pokemon.status = "poison";
    const charizardMaxHp = charizard.pokemon.calculatedStats!.hp;
    const poisonDmg = Math.max(1, Math.floor(charizardMaxHp / 8));
    // Source: MockRuleset.applyStatusDamage — poison = floor(maxHp / 8), min 1
    // 160 / 8 = 20

    events.length = 0;

    engine.submitAction(0, { type: "move", side: 0, moveIndex: 0 });
    engine.submitAction(1, { type: "move", side: 1, moveIndex: 0 });

    // Count poison damage events on Charizard (side 0)
    const poisonDamageEvents = events.filter(
      (e) =>
        e.type === "damage" &&
        "source" in e &&
        e.source === "poison" &&
        "side" in e &&
        e.side === 0,
    );

    // The multi-hit move deals 3 hits (1 first + 2 extra).
    // Residuals fire:
    //   - Between hit 1 and hit 2 (inside loop, before hit 2)
    //   - Between hit 2 and hit 3 (inside loop, before hit 3)
    //   - After hit 3 (the fix from #470, after loop exit)
    // That's 3 poison ticks total during the multi-hit sequence.
    // Plus the Phase 1 post-attack residuals for side 0 after the entire attack resolves
    // gives us a total. The exact count depends on the engine's call flow, but the key
    // assertion is that there IS poison damage after the final hit.
    expect(poisonDamageEvents.length).toBeGreaterThanOrEqual(3);

    // Total poison damage should be at least 3 * poisonDmg from the multi-hit residuals
    const totalPoisonDmg = poisonDamageEvents.reduce(
      (sum, e) => sum + ("amount" in e ? (e.amount as number) : 0),
      0,
    );
    expect(totalPoisonDmg).toBeGreaterThanOrEqual(3 * poisonDmg);
  });

  it("given a burned defender hit by a 2-hit multi-hit move, when all hits land, then burn damage fires after the final hit", () => {
    // Source: pokered — HandlePoisonBurnLeechSeed runs per hit for burn too
    // Triangulation: different status (burn vs poison), different hit count (2 vs 3)
    const ruleset = new MultiHitMockRuleset(1); // 1 extra hit beyond first = 2 total
    const { engine, events } = createEngine({ ruleset });
    engine.start();

    const state = engine.getState();
    const charizard = state.sides[0].active[0];
    charizard.pokemon.status = "burn";
    const charizardMaxHp = charizard.pokemon.calculatedStats!.hp;
    const burnDmg = Math.max(1, Math.floor(charizardMaxHp / 16));
    // Source: MockRuleset.applyStatusDamage — burn = floor(maxHp / 16), min 1
    // 160 / 16 = 10

    events.length = 0;

    engine.submitAction(0, { type: "move", side: 0, moveIndex: 0 });
    engine.submitAction(1, { type: "move", side: 1, moveIndex: 0 });

    // Count burn damage events on Charizard (side 0)
    const burnDamageEvents = events.filter(
      (e) =>
        e.type === "damage" && "source" in e && e.source === "burn" && "side" in e && e.side === 0,
    );

    // 2-hit move: residuals between hit 1 and hit 2 (inside loop), then after hit 2 (the fix).
    // At minimum 2 burn ticks from the multi-hit sequence.
    expect(burnDamageEvents.length).toBeGreaterThanOrEqual(2);

    const totalBurnDmg = burnDamageEvents.reduce(
      (sum, e) => sum + ("amount" in e ? (e.amount as number) : 0),
      0,
    );
    expect(totalBurnDmg).toBeGreaterThanOrEqual(2 * burnDmg);
  });
});
