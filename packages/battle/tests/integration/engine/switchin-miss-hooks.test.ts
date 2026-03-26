import {
  CORE_ABILITY_IDS,
  CORE_ABILITY_TRIGGER_IDS,
  CORE_MOVE_IDS,
  CORE_STATUS_IDS,
  CORE_VOLATILE_IDS,
  createMoveSlot,
  type PokemonInstance,
} from "@pokemon-lib-ts/core";
import { GEN3_SPECIES_IDS } from "@pokemon-lib-ts/gen3";
import { describe, expect, it, vi } from "vitest";
import type { BattleConfig } from "../../../src/context";
import { BattleEngine } from "../../../src/engine";
import type { BattleEvent } from "../../../src/events";
import { createTestPokemon } from "../../../src/utils";
import { createMockDataManager } from "../../helpers/mock-data-manager";
import { MockRuleset } from "../../helpers/mock-ruleset";

// ─── Helpers ──────────────────────────────────────────────────────────────────

const ABILITIES = CORE_ABILITY_IDS;
const MOVES = CORE_MOVE_IDS;
const STATUS = CORE_STATUS_IDS;
const VOLATILES = CORE_VOLATILE_IDS;
const SPECIES = GEN3_SPECIES_IDS;

function createEngine(overrides?: {
  seed?: number;
  team1?: PokemonInstance[];
  team2?: PokemonInstance[];
  ruleset?: MockRuleset;
}) {
  const ruleset = (overrides?.ruleset ?? new MockRuleset()).setGenerationForTest(3);
  const dataManager = createMockDataManager();
  const events: BattleEvent[] = [];

  const team1 = overrides?.team1 ?? [
    createTestPokemon(SPECIES.charizard, 50, {
      uid: "charizard-1",
      nickname: "Charizard",
      moves: [createMoveSlot(MOVES.tackle), createMoveSlot(MOVES.thunderbolt)],
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
    createTestPokemon(SPECIES.pikachu, 50, {
      uid: "pikachu-1",
      nickname: "Pikachu",
      moves: [createMoveSlot(MOVES.quickAttack)],
      calculatedStats: {
        hp: 100,
        attack: 80,
        defense: 60,
        spAttack: 80,
        spDefense: 60,
        speed: 130,
      },
      currentHp: 100,
    }),
  ];

  const team2 = overrides?.team2 ?? [
    createTestPokemon(SPECIES.blastoise, 50, {
      uid: "blastoise-1",
      nickname: "Blastoise",
      moves: [createMoveSlot(MOVES.tackle)],
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
    createTestPokemon(SPECIES.charizard, 50, {
      uid: "charizard-2",
      nickname: "Charizard2",
      moves: [createMoveSlot(MOVES.tackle)],
      calculatedStats: {
        hp: 200,
        attack: 100,
        defense: 100,
        spAttack: 100,
        spDefense: 100,
        speed: 90,
      },
      currentHp: 200,
    }),
  ];

  const config: BattleConfig = {
    generation: 3,
    format: "singles",
    teams: [team1, team2],
    seed: overrides?.seed ?? 12345,
  };

  const engine = new BattleEngine(config, ruleset, dataManager);
  engine.on((e) => events.push(e));

  return { engine, ruleset, events, dataManager };
}

// ─── Bug #483: onSwitchIn called on mid-battle switch ────────────────────────

describe("Bug #483: onSwitchIn hook wiring", () => {
  it("given a battle where Player 1 switches Pokemon mid-battle, when the switch resolves, then ruleset.onSwitchIn() is called with the new Pokemon", () => {
    // Source: Engine must delegate switch-in hooks to the ruleset.
    // sendOut() must call ruleset.onSwitchIn() so gen-specific switch-in
    // effects (e.g., Gen 5 sleep counter reset) are processed.
    const ruleset = new MockRuleset();
    const onSwitchInSpy = vi.spyOn(ruleset, "onSwitchIn");
    const { engine } = createEngine({ ruleset });

    engine.start();

    // onSwitchIn is called during start() for both leads
    expect(onSwitchInSpy).toHaveBeenCalledTimes(2);
    onSwitchInSpy.mockClear();

    // Side 0 switches to Pikachu (team slot 1), side 1 uses Tackle
    engine.submitAction(0, { type: "switch", side: 0, switchTo: 1 });
    engine.submitAction(1, { type: "move", side: 1, moveIndex: 0 });

    // onSwitchIn should have been called once for the new pokemon (Pikachu)
    expect(onSwitchInSpy).toHaveBeenCalledTimes(1);
    const [pokemon, state] = onSwitchInSpy.mock.calls[0];
    expect(pokemon.pokemon.uid).toBe("pikachu-1");
    expect(state).toBeDefined();
  });

  it("given initial battle start, when both leads are sent out, then ruleset.onSwitchIn() is called for each lead", () => {
    // Source: Engine sendOut() calls onSwitchIn even during initial send-out.
    const ruleset = new MockRuleset();
    const onSwitchInSpy = vi.spyOn(ruleset, "onSwitchIn");
    const { engine } = createEngine({ ruleset });

    engine.start();

    // Both leads should have had onSwitchIn called
    expect(onSwitchInSpy).toHaveBeenCalledTimes(2);
    const uids = onSwitchInSpy.mock.calls.map((call) => call[0].pokemon.uid);
    expect(uids).toContain("charizard-1");
    expect(uids).toContain("blastoise-1");
  });
});

// ─── Bug #495: onMoveMiss for semi-invulnerable misses ───────────────────────

describe("Bug #495: onMoveMiss called for semi-invulnerable target miss", () => {
  it("given a defender in semi-invulnerable state (flying), when an attacker uses a move that cannot hit it, then onMoveMiss() is called", () => {
    // Source: Showdown sim/battle-actions.ts — semi-invulnerable immunity checks
    // should still trigger miss-related effects (e.g., Explosion self-faint on miss).
    const ruleset = new MockRuleset();
    const onMoveMinSpy = vi.spyOn(ruleset, "onMoveMiss");
    const { engine } = createEngine({ ruleset });

    engine.start();

    // Put Blastoise (defender, side 1) into semi-invulnerable "flying" state
    const defender = engine.state.sides[1].active[0]!;
    defender.volatileStatuses.set(VOLATILES.flying, { turnsLeft: 1 });

    // Side 0 uses Tackle (cannot hit flying targets), side 1 uses Tackle
    engine.submitAction(0, { type: "move", side: 0, moveIndex: 0 });
    engine.submitAction(1, { type: "move", side: 1, moveIndex: 0 });

    // onMoveMiss should have been called for the Tackle that missed against flying target
    expect(onMoveMinSpy).toHaveBeenCalled();
    const call = onMoveMinSpy.mock.calls.find((c) => c[0].pokemon.uid === "charizard-1");
    expect(call).toBeDefined();
    expect(call![1].id).toBe(MOVES.tackle);
  });

  it("given a second scenario where a different move misses a semi-invulnerable target, when the move executes, then onMoveMiss() is also called", () => {
    // Triangulation: verify with a different move (Thunderbolt vs flying target)
    // Source: same as above — all semi-invulnerable misses must delegate to onMoveMiss
    const ruleset = new MockRuleset();
    const onMoveMinSpy = vi.spyOn(ruleset, "onMoveMiss");
    const { engine } = createEngine({ ruleset });

    engine.start();

    // Put Blastoise into "flying" semi-invulnerable state
    const defender = engine.state.sides[1].active[0]!;
    defender.volatileStatuses.set(VOLATILES.flying, { turnsLeft: 1 });

    // Side 0 uses Thunderbolt (index 1), side 1 uses Tackle
    engine.submitAction(0, { type: "move", side: 0, moveIndex: 1 });
    engine.submitAction(1, { type: "move", side: 1, moveIndex: 0 });

    // onMoveMiss should be called for Thunderbolt miss
    const call = onMoveMinSpy.mock.calls.find((c) => c[1].id === MOVES.thunderbolt);
    expect(call).toBeDefined();
    expect(call![0].pokemon.uid).toBe("charizard-1");
  });
});

// ─── Bug #150: Double-KO replacement abilities target correct opponent ───────

describe("Bug #150: double-KO switch-in ability targeting", () => {
  it("given both active Pokemon faint simultaneously and both trainers send replacements, when both replacements enter, then switch-in abilities can correctly target the replacement (not the fainted Pokemon)", () => {
    // Source: Showdown sim/battle.ts — simultaneous switches send out both first,
    // then fire abilities in speed order so each targets the opponent's new Pokemon.
    const ruleset = new MockRuleset();
    const applyAbilitySpy = vi.spyOn(ruleset, "applyAbility");

    // Enable abilities for this test
    ruleset.hasAbilities = () => true;
    // Set damage to 0 so the moves themselves don't KO — both will die from poison at end of turn
    ruleset.setFixedDamage(0);

    const team1 = [
      createTestPokemon(SPECIES.charizard, 50, {
        uid: "charizard-starter",
        nickname: "CharStarter",
        moves: [createMoveSlot(MOVES.tackle)],
        calculatedStats: {
          hp: 100,
          attack: 100,
          defense: 100,
          spAttack: 100,
          spDefense: 100,
          speed: 120,
        },
        currentHp: 1,
        status: STATUS.poison,
      }),
      createTestPokemon(SPECIES.pikachu, 50, {
        uid: "pikachu-replacement",
        nickname: "PikaReplace",
        moves: [createMoveSlot(MOVES.quickAttack)],
        calculatedStats: {
          hp: 100,
          attack: 80,
          defense: 60,
          spAttack: 80,
          spDefense: 60,
          speed: 130,
        },
        currentHp: 100,
        abilityId: ABILITIES.static,
      }),
    ];

    const team2 = [
      createTestPokemon(SPECIES.blastoise, 50, {
        uid: "blastoise-starter",
        nickname: "BlastStarter",
        moves: [createMoveSlot(MOVES.tackle)],
        calculatedStats: {
          hp: 100,
          attack: 100,
          defense: 100,
          spAttack: 100,
          spDefense: 100,
          speed: 80,
        },
        currentHp: 1,
        status: STATUS.poison,
      }),
      createTestPokemon(SPECIES.charizard, 50, {
        uid: "charizard-replacement",
        nickname: "CharReplace",
        moves: [createMoveSlot(MOVES.tackle)],
        calculatedStats: {
          hp: 200,
          attack: 100,
          defense: 100,
          spAttack: 100,
          spDefense: 100,
          speed: 90,
        },
        currentHp: 200,
        abilityId: ABILITIES.blaze,
      }),
    ];

    const { engine } = createEngine({ ruleset, team1, team2, seed: 42 });
    engine.start();

    // Set HP to 1 AFTER engine start (constructor recalculates stats and resets HP)
    engine.state.sides[0].active[0]!.pokemon.currentHp = 1;
    engine.state.sides[1].active[0]!.pokemon.currentHp = 1;

    // Clear the spy from start() ability calls
    applyAbilitySpy.mockClear();

    // Both use Tackle (0 damage). End-of-turn poison kills both (1 HP each).
    engine.submitAction(0, { type: "move", side: 0, moveIndex: 0 });
    engine.submitAction(1, { type: "move", side: 1, moveIndex: 0 });

    // Both should faint from poison at end-of-turn — engine transitions to switch-prompt
    expect(engine.getPhase()).toBe("switch-prompt");

    // Both sides submit their replacement
    engine.submitSwitch(0, 1);
    engine.submitSwitch(1, 1);

    // Now verify: the switch-in ability calls should target the REPLACEMENT Pokemon,
    // not the fainted ones
    const switchInAbilityCalls = applyAbilitySpy.mock.calls.filter(
      (call) => call[0] === CORE_ABILITY_TRIGGER_IDS.onSwitchIn,
    );

    // Both replacements should have had their switch-in abilities fired
    expect(switchInAbilityCalls.length).toBe(2);

    // Each call's opponent should be the OTHER replacement, not a fainted Pokemon
    for (const call of switchInAbilityCalls) {
      const context = call[1];
      const pokemonUid = context.pokemon.pokemon.uid;
      const opponentUid = context.opponent.pokemon.uid;

      // The opponent should be one of the replacements, not one of the fainted starters
      expect(opponentUid).not.toBe("charizard-starter");
      expect(opponentUid).not.toBe("blastoise-starter");

      // Verify they target the correct replacement
      if (pokemonUid === "pikachu-replacement") {
        expect(opponentUid).toBe("charizard-replacement");
      } else if (pokemonUid === "charizard-replacement") {
        expect(opponentUid).toBe("pikachu-replacement");
      }
    }
  });

  it("given a double-KO where replacements have different speeds, when abilities fire, then the faster replacement's ability fires first", () => {
    // Source: Showdown sim/battle.ts — switch-in abilities fire in speed order
    // (faster first), consistent with start() behavior.
    const ruleset = new MockRuleset();
    const abilityOrder: string[] = [];

    // Enable abilities and track the order
    ruleset.hasAbilities = () => true;
    // Set damage to 0 so moves don't KO — both die from poison at end of turn
    ruleset.setFixedDamage(0);
    const origApplyAbility = ruleset.applyAbility.bind(ruleset);
    ruleset.applyAbility = (trigger, context) => {
      if (trigger === CORE_ABILITY_TRIGGER_IDS.onSwitchIn) {
        abilityOrder.push(context.pokemon.pokemon.uid);
      }
      return origApplyAbility(trigger, context);
    };

    // Pikachu speed=130 (faster), Charizard2 speed=90 (slower)
    const team1 = [
      createTestPokemon(SPECIES.charizard, 50, {
        uid: "starter-1",
        nickname: "Starter1",
        moves: [createMoveSlot(MOVES.tackle)],
        calculatedStats: {
          hp: 100,
          attack: 100,
          defense: 100,
          spAttack: 100,
          spDefense: 100,
          speed: 120,
        },
        currentHp: 1,
        status: STATUS.poison,
      }),
      createTestPokemon(SPECIES.pikachu, 50, {
        uid: "fast-replacement",
        nickname: "FastReplace",
        moves: [createMoveSlot(MOVES.quickAttack)],
        calculatedStats: {
          hp: 100,
          attack: 80,
          defense: 60,
          spAttack: 80,
          spDefense: 60,
          speed: 130,
        },
        currentHp: 100,
      }),
    ];

    const team2 = [
      createTestPokemon(SPECIES.blastoise, 50, {
        uid: "starter-2",
        nickname: "Starter2",
        moves: [createMoveSlot(MOVES.tackle)],
        calculatedStats: {
          hp: 100,
          attack: 100,
          defense: 100,
          spAttack: 100,
          spDefense: 100,
          speed: 80,
        },
        currentHp: 1,
        status: STATUS.poison,
      }),
      createTestPokemon(SPECIES.charizard, 50, {
        uid: "slow-replacement",
        nickname: "SlowReplace",
        moves: [createMoveSlot(MOVES.tackle)],
        calculatedStats: {
          hp: 200,
          attack: 100,
          defense: 100,
          spAttack: 100,
          spDefense: 100,
          speed: 90,
        },
        currentHp: 200,
      }),
    ];

    const { engine } = createEngine({ ruleset, team1, team2, seed: 42 });
    engine.start();

    // Set HP to 1 AFTER engine start (constructor recalculates stats and resets HP)
    engine.state.sides[0].active[0]!.pokemon.currentHp = 1;
    engine.state.sides[1].active[0]!.pokemon.currentHp = 1;

    // Override replacement Pokemon speeds AFTER engine recalculates stats.
    // Pikachu (side 0, team slot 1) → speed 200 (fastest)
    // Charizard2 (side 1, team slot 1) → speed 50 (slowest)
    // Source: Engine recalculates stats in constructor; we override afterward for test control.
    engine.state.sides[0].team[1].calculatedStats!.speed = 200;
    engine.state.sides[1].team[1].calculatedStats!.speed = 50;

    // Clear tracking from start
    abilityOrder.length = 0;

    // Both use Tackle (0 damage). End-of-turn poison kills both (1 HP each).
    engine.submitAction(0, { type: "move", side: 0, moveIndex: 0 });
    engine.submitAction(1, { type: "move", side: 1, moveIndex: 0 });

    expect(engine.getPhase()).toBe("switch-prompt");

    // Both submit replacements
    engine.submitSwitch(0, 1);
    engine.submitSwitch(1, 1);

    // The faster replacement (speed 200) should fire its ability before the slower one (speed 50)
    expect(abilityOrder).toEqual(["fast-replacement", "slow-replacement"]);
  });

  it("given a double-KO where replacements tie on speed, when abilities fire, then replacement order uses the battle tie-break instead of submission order", () => {
    const ruleset = new MockRuleset();
    const abilityOrder: string[] = [];

    ruleset.hasAbilities = () => true;
    ruleset.setFixedDamage(0);
    const origApplyAbility = ruleset.applyAbility.bind(ruleset);
    ruleset.applyAbility = (trigger, context) => {
      if (trigger === CORE_ABILITY_TRIGGER_IDS.onSwitchIn) {
        abilityOrder.push(context.pokemon.pokemon.uid);
      }
      return origApplyAbility(trigger, context);
    };

    const team1 = [
      createTestPokemon(SPECIES.charizard, 50, {
        uid: "starter-1",
        nickname: "Starter1",
        moves: [createMoveSlot(MOVES.tackle)],
        calculatedStats: {
          hp: 100,
          attack: 100,
          defense: 100,
          spAttack: 100,
          spDefense: 100,
          speed: 120,
        },
        currentHp: 1,
        status: STATUS.poison,
      }),
      createTestPokemon(SPECIES.pikachu, 50, {
        uid: "side-0-replacement",
        nickname: "Side0Replace",
        moves: [createMoveSlot(MOVES.quickAttack)],
        calculatedStats: {
          hp: 100,
          attack: 80,
          defense: 60,
          spAttack: 80,
          spDefense: 60,
          speed: 100,
        },
        currentHp: 100,
      }),
    ];

    const team2 = [
      createTestPokemon(SPECIES.blastoise, 50, {
        uid: "starter-2",
        nickname: "Starter2",
        moves: [createMoveSlot(MOVES.tackle)],
        calculatedStats: {
          hp: 100,
          attack: 100,
          defense: 100,
          spAttack: 100,
          spDefense: 100,
          speed: 80,
        },
        currentHp: 1,
        status: STATUS.poison,
      }),
      createTestPokemon(SPECIES.charizard, 50, {
        uid: "side-1-replacement",
        nickname: "Side1Replace",
        moves: [createMoveSlot(MOVES.tackle)],
        calculatedStats: {
          hp: 200,
          attack: 100,
          defense: 100,
          spAttack: 100,
          spDefense: 100,
          speed: 100,
        },
        currentHp: 200,
      }),
    ];

    const { engine } = createEngine({ ruleset, team1, team2, seed: 1 });
    vi.spyOn(engine.state.rng, "chance").mockReturnValue(false);
    engine.start();

    engine.state.sides[0].active[0]!.pokemon.currentHp = 1;
    engine.state.sides[1].active[0]!.pokemon.currentHp = 1;
    engine.state.sides[0].team[1].calculatedStats!.speed = 100;
    engine.state.sides[1].team[1].calculatedStats!.speed = 100;

    abilityOrder.length = 0;

    engine.submitAction(0, { type: "move", side: 0, moveIndex: 0 });
    engine.submitAction(1, { type: "move", side: 1, moveIndex: 0 });

    expect(engine.getPhase()).toBe("switch-prompt");

    engine.submitSwitch(0, 1);
    engine.submitSwitch(1, 1);

    // Source: In a tied replacement switch-in ability case, battle RNG decides the order.
    // This test stubs the tie-break roll to false so side 1 resolves before side 0.
    expect(abilityOrder).toEqual(["side-1-replacement", "side-0-replacement"]);
  });
});
