import type { MoveData, PokemonInstance, PokemonSpeciesData } from "@pokemon-lib-ts/core";
import { DataManager } from "@pokemon-lib-ts/core";
import { describe, expect, it } from "vitest";
import type {
  BattleConfig,
  DamageContext,
  DamageResult,
  EndOfTurnEffect,
  MoveEffectContext,
  MoveEffectResult,
} from "../../src/context";
import { BattleEngine } from "../../src/engine";
import type { BattleEvent } from "../../src/events";
import { createTestPokemon } from "../../src/utils";
import { MockRuleset } from "../helpers/mock-ruleset";

/**
 * MockRuleset subclass that includes future-attack in the end-of-turn order
 * and supports configurable executeMoveEffect for scheduling future attacks.
 */
class FutureAttackMockRuleset extends MockRuleset {
  private effectHandler: ((ctx: MoveEffectContext) => MoveEffectResult) | null = null;
  private futureSightDamage = 80;

  setEffectHandler(handler: (ctx: MoveEffectContext) => MoveEffectResult) {
    this.effectHandler = handler;
  }

  setFutureSightDamage(damage: number) {
    this.futureSightDamage = damage;
  }

  override getEndOfTurnOrder(): readonly EndOfTurnEffect[] {
    return ["future-attack"];
  }

  override executeMoveEffect(context: MoveEffectContext): MoveEffectResult {
    if (this.effectHandler) {
      return this.effectHandler(context);
    }
    return super.executeMoveEffect(context);
  }

  override calculateDamage(context: DamageContext): DamageResult {
    // For future sight, return a configurable damage amount
    if (context.move.id === "future-sight") {
      return {
        damage: this.futureSightDamage,
        effectiveness: 1,
        isCrit: false,
        randomFactor: 1,
      };
    }
    return super.calculateDamage(context);
  }
}

/**
 * Creates a DataManager with future-sight move data.
 */
function createFutureAttackDataManager(): DataManager {
  const dm = new DataManager();

  const tackleMoveData: MoveData = {
    id: "tackle",
    displayName: "Tackle",
    type: "normal",
    category: "physical",
    power: 40,
    accuracy: 100,
    pp: 35,
    priority: 0,
    target: "adjacent-foe",
    flags: {
      contact: true,
      sound: false,
      bullet: false,
      pulse: false,
      punch: false,
      bite: false,
      wind: false,
      slicing: false,
      powder: false,
      protect: true,
      mirror: true,
      snatch: false,
      gravity: false,
      defrost: false,
      recharge: false,
      charge: false,
      bypassSubstitute: false,
    },
    effect: null,
    description: "A physical attack.",
    generation: 1,
  };

  const futureSightMoveData: MoveData = {
    id: "future-sight",
    displayName: "Future Sight",
    type: "psychic",
    category: "special",
    power: 120,
    accuracy: 100,
    pp: 10,
    priority: 0,
    target: "adjacent-foe",
    flags: {
      contact: false,
      sound: false,
      bullet: false,
      pulse: false,
      punch: false,
      bite: false,
      wind: false,
      slicing: false,
      powder: false,
      protect: false,
      mirror: false,
      snatch: false,
      gravity: false,
      defrost: false,
      recharge: false,
      charge: false,
      bypassSubstitute: false,
    },
    effect: null,
    description: "Two turns after this move is used, a hunk of psychic energy attacks the target.",
    generation: 2,
  };

  const charizardSpecies: PokemonSpeciesData = {
    id: 6,
    name: "charizard",
    displayName: "Charizard",
    types: ["fire", "flying"],
    baseStats: { hp: 78, attack: 84, defense: 78, spAttack: 109, spDefense: 85, speed: 100 },
    abilities: { normal: ["blaze"], hidden: "solar-power" },
    genderRatio: 87.5,
    catchRate: 45,
    baseExp: 240,
    expGroup: "medium-slow",
    evYield: { spAttack: 3 },
    eggGroups: ["monster", "dragon"],
    learnset: { levelUp: [{ level: 1, move: "tackle" }], tm: [], egg: [], tutor: [] },
    evolution: null,
    dimensions: { height: 1.7, weight: 90.5 },
    spriteKey: "charizard",
    baseFriendship: 70,
    generation: 1,
    isLegendary: false,
    isMythical: false,
  };

  const blastoiseSpecies: PokemonSpeciesData = {
    ...charizardSpecies,
    id: 9,
    name: "blastoise",
    displayName: "Blastoise",
    types: ["water"],
    baseStats: { hp: 79, attack: 83, defense: 100, spAttack: 85, spDefense: 105, speed: 78 },
    abilities: { normal: ["torrent"], hidden: "rain-dish" },
    spriteKey: "blastoise",
  };

  const typeChart: Record<string, Record<string, number>> = {};
  const allTypes = [
    "normal",
    "fire",
    "water",
    "electric",
    "grass",
    "ice",
    "fighting",
    "poison",
    "ground",
    "flying",
    "psychic",
    "bug",
    "rock",
    "ghost",
    "dragon",
    "dark",
    "steel",
    "fairy",
  ];
  for (const atk of allTypes) {
    const row: Record<string, number> = {};
    typeChart[atk] = row;
    for (const def of allTypes) {
      row[def] = 1;
    }
  }

  dm.loadFromObjects({
    pokemon: [charizardSpecies, blastoiseSpecies],
    moves: [tackleMoveData, futureSightMoveData],
    typeChart: typeChart as unknown as import("@pokemon-lib-ts/core").TypeChart,
  });

  return dm;
}

function createFutureAttackEngine() {
  const ruleset = new FutureAttackMockRuleset();
  const dataManager = createFutureAttackDataManager();
  const events: BattleEvent[] = [];

  const team1: PokemonInstance[] = [
    createTestPokemon(6, 50, {
      uid: "charizard-1",
      nickname: "Charizard",
      moves: [
        { moveId: "tackle", currentPP: 35, maxPP: 35, ppUps: 0 },
        { moveId: "future-sight", currentPP: 10, maxPP: 10, ppUps: 0 },
      ],
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

  const team2: PokemonInstance[] = [
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
        speed: 120,
      },
      currentHp: 200,
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
  engine.on((event) => events.push(event));

  return { engine, ruleset, events };
}

describe("Future Sight end-of-turn processing", () => {
  it("given a pending future attack with turnsLeft=2, when end of turn runs, then the counter decrements to 1 and no damage is dealt", () => {
    // Source: Bulbapedia — "Future Sight strikes two turns after it is used"
    // Arrange
    const { engine, events } = createFutureAttackEngine();
    engine.start();

    // Manually set a future attack on side 1 (targeting Blastoise's side)
    engine.state.sides[1].futureAttack = {
      moveId: "future-sight",
      turnsLeft: 2,
      damage: 0, // Gen 4: damage calculated at hit time
      sourceSide: 0,
    };

    // Act — run a turn (both use tackle)
    engine.submitAction(0, { type: "move", side: 0, moveIndex: 0 });
    engine.submitAction(1, { type: "move", side: 1, moveIndex: 0 });

    // Assert — turnsLeft should be decremented to 1
    expect(engine.state.sides[1].futureAttack).not.toBeNull();
    expect(engine.state.sides[1].futureAttack!.turnsLeft).toBe(1);

    // No future-sight damage event should have been emitted
    const futureSightDamage = events.filter(
      (e) => e.type === "damage" && "source" in e && e.source === "future-sight",
    );
    expect(futureSightDamage.length).toBe(0);
  });

  it("given a pending future attack with turnsLeft=1, when end of turn runs, then damage is calculated and dealt to the target", () => {
    // Source: Bulbapedia — "In Generations II-IV, damage is calculated when
    // Future Sight or Doom Desire hits."
    // Arrange
    const { engine, ruleset, events } = createFutureAttackEngine();
    // Source: Test expectation derived from mock damage (80 damage configured in ruleset)
    ruleset.setFutureSightDamage(80);
    engine.start();

    // Set future attack about to trigger (turnsLeft=1, damage=0 for Gen 4 calc-on-hit)
    engine.state.sides[1].futureAttack = {
      moveId: "future-sight",
      turnsLeft: 1,
      damage: 0, // Gen 4: damage calculated at hit time
      sourceSide: 0,
    };

    // Act
    engine.submitAction(0, { type: "move", side: 0, moveIndex: 0 });
    engine.submitAction(1, { type: "move", side: 1, moveIndex: 0 });

    // Assert — future attack should have been cleared
    expect(engine.state.sides[1].futureAttack).toBeNull();

    // Source: Mock FutureAttackMockRuleset.calculateDamage returns 80 for future-sight
    // Blastoise should have taken future sight damage (80) plus tackle damage (10)
    const futureSightDamage = events.filter(
      (e) => e.type === "damage" && "source" in e && e.source === "future-sight",
    );
    expect(futureSightDamage.length).toBe(1);

    // Verify the damage amount from future sight is 80
    const fsEvent = futureSightDamage[0]!;
    expect(fsEvent.type === "damage" && fsEvent.amount).toBe(80);
  });
});

// ---------------------------------------------------------------------------
// Bug #505: Future attack damage recalculation for Gen 5+
// ---------------------------------------------------------------------------

describe("Bug #505 — Future attack recalculation (Gen 5+)", () => {
  /**
   * MockRuleset subclass that implements recalculatesFutureAttackDamage()
   * and allows configuring whether recalculation is enabled.
   */
  class RecalcFutureAttackMockRuleset extends FutureAttackMockRuleset {
    private shouldRecalculate = false;

    setRecalculates(value: boolean) {
      this.shouldRecalculate = value;
    }

    recalculatesFutureAttackDamage(): boolean {
      return this.shouldRecalculate;
    }
  }

  it("given a Gen 5 battle with non-zero stored future attack damage, when attack triggers, then damage is recalculated using current stats", () => {
    // Arrange — set up a ruleset that recalculates and returns a different value
    const ruleset = new RecalcFutureAttackMockRuleset();
    ruleset.setRecalculates(true);
    // The calculateDamage for future-sight returns this value on recalculation
    // Source: Showdown — Gen 5+ always recalculates at hit time
    ruleset.setFutureSightDamage(120);

    const dataManager = createFutureAttackDataManager();
    const events: BattleEvent[] = [];

    const team1: PokemonInstance[] = [
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
          speed: 80,
        },
        currentHp: 200,
      }),
    ];

    const team2: PokemonInstance[] = [
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
          speed: 120,
        },
        currentHp: 200,
      }),
    ];

    const config: BattleConfig = {
      generation: 5,
      format: "singles",
      teams: [team1, team2],
      seed: 42,
    };

    ruleset.setGenerationForTest(config.generation);
    const engine = new BattleEngine(config, ruleset, dataManager);
    engine.on((event) => events.push(event));
    engine.start();

    // Set future attack with NON-ZERO stored damage (50), but recalculation should override it
    engine.state.sides[1].futureAttack = {
      moveId: "future-sight",
      turnsLeft: 1,
      damage: 50, // Stored at use time — should be IGNORED in Gen 5+
      sourceSide: 0,
    };

    // Act
    engine.submitAction(0, { type: "move", side: 0, moveIndex: 0 });
    engine.submitAction(1, { type: "move", side: 1, moveIndex: 0 });

    // Assert — damage should be recalculated (120), not the stored value (50)
    // Source: Bulbapedia — "From Generation V onwards, damage is calculated when
    //   Future Sight or Doom Desire hits, not when it is used."
    const futureSightDamage = events.filter(
      (e) => e.type === "damage" && "source" in e && e.source === "future-sight",
    );
    expect(futureSightDamage.length).toBe(1);
    const fsEvent = futureSightDamage[0]!;
    expect(fsEvent.type === "damage" && fsEvent.amount).toBe(120);
  });

  it("given a Gen 4 battle with non-zero stored future attack damage, when attack triggers, then stored damage is used unchanged", () => {
    // Arrange — Gen 4 does NOT recalculate
    const ruleset = new RecalcFutureAttackMockRuleset();
    ruleset.setRecalculates(false);
    // Set a different value that would be used if recalculation happened
    ruleset.setFutureSightDamage(120);

    const dataManager = createFutureAttackDataManager();
    const events: BattleEvent[] = [];

    const team1: PokemonInstance[] = [
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
          speed: 80,
        },
        currentHp: 200,
      }),
    ];

    const team2: PokemonInstance[] = [
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
          speed: 120,
        },
        currentHp: 200,
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
    engine.on((event) => events.push(event));
    engine.start();

    // Set future attack with stored damage of 50
    engine.state.sides[1].futureAttack = {
      moveId: "future-sight",
      turnsLeft: 1,
      damage: 50, // Stored at use time — should be USED in Gen 4
      sourceSide: 0,
    };

    // Act
    engine.submitAction(0, { type: "move", side: 0, moveIndex: 0 });
    engine.submitAction(1, { type: "move", side: 1, moveIndex: 0 });

    // Assert — damage should be the stored value (50), not recalculated (120)
    // Source: Bulbapedia — "In Generations II-IV, damage is calculated when used"
    const futureSightDamage = events.filter(
      (e) => e.type === "damage" && "source" in e && e.source === "future-sight",
    );
    expect(futureSightDamage.length).toBe(1);
    const fsEvent = futureSightDamage[0]!;
    expect(fsEvent.type === "damage" && fsEvent.amount).toBe(50);
  });
});
