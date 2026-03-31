import type { DataManager, PokemonInstance } from "@pokemon-lib-ts/core";
import {
  CORE_ABILITY_IDS,
  CORE_ITEM_IDS,
  CORE_VOLATILE_IDS,
  createMoveSlot,
} from "@pokemon-lib-ts/core";
import { createGen5DataManager, GEN5_MOVE_IDS, Gen5Ruleset } from "@pokemon-lib-ts/gen5";
import { createGen6DataManager, GEN6_MOVE_IDS, Gen6Ruleset } from "@pokemon-lib-ts/gen6";
import { Gen7Ruleset } from "@pokemon-lib-ts/gen7";
import { Gen9Ruleset } from "@pokemon-lib-ts/gen9";
import { describe, expect, it } from "vitest";
import { createGen7DataManager } from "../../../../gen7/src/data/index";
import { GEN7_MOVE_IDS } from "../../../../gen7/src/data/reference-ids";
import { createGen9DataManager } from "../../../../gen9/src/data/index";
import { GEN9_ITEM_IDS, GEN9_MOVE_IDS } from "../../../../gen9/src/data/reference-ids";
import type { BattleConfig } from "../../../src/context";
import { BattleEngine } from "../../../src/engine";
import type { BattleEvent } from "../../../src/events";
import { createTestPokemon } from "../../../src/utils";

function createKnownMoveSlot(dataManager: DataManager, moveId: string) {
  const move = dataManager.getMove(moveId);
  return createMoveSlot(move.id, move.pp);
}

function createEngine(options: {
  generation: 5 | 6 | 7 | 9;
  ruleset: Gen5Ruleset | Gen6Ruleset | Gen7Ruleset | Gen9Ruleset;
  dataManager: DataManager;
  team1: PokemonInstance[];
  team2: PokemonInstance[];
}) {
  const events: BattleEvent[] = [];
  const config: BattleConfig = {
    generation: options.generation,
    format: "singles",
    teams: [options.team1, options.team2],
    seed: 42,
  };

  const engine = new BattleEngine(config, options.ruleset, options.dataManager);
  engine.on((event) => events.push(event));
  engine.start();

  return { engine, events };
}

describe("later-gen runtime dispatch regressions", () => {
  it("given Gen 5 Embargo, when the target holds Leftovers, then the volatile is applied and end-of-turn item healing is suppressed", () => {
    const dataManager = createGen5DataManager();
    const ruleset = new Gen5Ruleset(dataManager);
    const team1 = [
      createTestPokemon(6, 50, {
        uid: "charizard-1",
        nickname: "Charizard",
        ability: CORE_ABILITY_IDS.blaze,
        moves: [
          createKnownMoveSlot(dataManager, GEN5_MOVE_IDS.embargo),
          createKnownMoveSlot(dataManager, GEN5_MOVE_IDS.tackle),
        ],
      }),
    ];
    const team2 = [
      createTestPokemon(9, 50, {
        uid: "blastoise-1",
        nickname: "Blastoise",
        ability: CORE_ABILITY_IDS.torrent,
        heldItem: CORE_ITEM_IDS.leftovers,
        moves: [createKnownMoveSlot(dataManager, GEN5_MOVE_IDS.tackle)],
      }),
    ];

    const { engine, events } = createEngine({
      generation: 5,
      ruleset,
      dataManager,
      team1,
      team2,
    });

    const target = engine.state.sides[1].active[0]!;
    target.pokemon.currentHp = 100;

    engine.submitAction(0, { type: "move", side: 0, moveIndex: 0 });
    engine.submitAction(1, { type: "move", side: 1, moveIndex: 0 });

    // Source: Showdown data/moves.ts — Embargo starts at 5 turns and ticks down at
    // the end of the application turn, leaving 4 turns remaining here.
    expect(target.volatileStatuses.has(CORE_VOLATILE_IDS.embargo)).toBe(true);
    expect(target.volatileStatuses.get(CORE_VOLATILE_IDS.embargo)?.turnsLeft).toBe(4);

    const leftoversHeals = events.filter(
      (event) =>
        event.type === "heal" && event.side === 1 && event.source === CORE_ITEM_IDS.leftovers,
    );
    expect(leftoversHeals).toHaveLength(0);
  });

  it("given Gen 5 Heal Block, when the target tries to use Rest next turn, then healing is blocked by the applied volatile", () => {
    const dataManager = createGen5DataManager();
    const ruleset = new Gen5Ruleset(dataManager);
    const team1 = [
      createTestPokemon(6, 50, {
        uid: "charizard-1",
        nickname: "Charizard",
        ability: CORE_ABILITY_IDS.blaze,
        moves: [
          createKnownMoveSlot(dataManager, GEN5_MOVE_IDS.healBlock),
          createKnownMoveSlot(dataManager, GEN5_MOVE_IDS.tackle),
        ],
      }),
    ];
    const team2 = [
      createTestPokemon(9, 50, {
        uid: "blastoise-1",
        nickname: "Blastoise",
        ability: CORE_ABILITY_IDS.torrent,
        moves: [
          createKnownMoveSlot(dataManager, GEN5_MOVE_IDS.rest),
          createKnownMoveSlot(dataManager, GEN5_MOVE_IDS.tackle),
        ],
      }),
    ];

    const { engine, events } = createEngine({
      generation: 5,
      ruleset,
      dataManager,
      team1,
      team2,
    });

    const target = engine.state.sides[1].active[0]!;
    target.pokemon.currentHp = 60;

    engine.submitAction(0, { type: "move", side: 0, moveIndex: 0 });
    engine.submitAction(1, { type: "move", side: 1, moveIndex: 1 });

    expect(target.volatileStatuses.has(CORE_VOLATILE_IDS.healBlock)).toBe(true);

    const hpAfterHealBlockTurn = target.pokemon.currentHp;
    engine.submitAction(0, { type: "move", side: 0, moveIndex: 1 });
    engine.submitAction(1, { type: "move", side: 1, moveIndex: 0 });

    expect(target.pokemon.status).toBeNull();
    expect(target.pokemon.currentHp).toBeLessThanOrEqual(hpAfterHealBlockTurn);
    expect(
      events.some(
        (event) => event.type === "heal" && event.side === 1 && event.source === "move-effect",
      ),
    ).toBe(false);
  });

  it("given Gen 5 Aqua Ring and Ingrain, when each move resolves, then the matching self-volatile is applied and the existing end-of-turn healing reader fires", () => {
    const dataManager = createGen5DataManager();
    const ruleset = new Gen5Ruleset(dataManager);
    const team1 = [
      createTestPokemon(6, 50, {
        uid: "charizard-1",
        nickname: "Charizard",
        ability: CORE_ABILITY_IDS.blaze,
        moves: [
          createKnownMoveSlot(dataManager, GEN5_MOVE_IDS.aquaRing),
          createKnownMoveSlot(dataManager, GEN5_MOVE_IDS.ingrain),
        ],
      }),
    ];
    const team2 = [
      createTestPokemon(9, 50, {
        uid: "blastoise-1",
        nickname: "Blastoise",
        ability: CORE_ABILITY_IDS.torrent,
        moves: [createKnownMoveSlot(dataManager, GEN5_MOVE_IDS.tackle)],
      }),
    ];

    const { engine, events } = createEngine({
      generation: 5,
      ruleset,
      dataManager,
      team1,
      team2,
    });

    const attacker = engine.state.sides[0].active[0]!;
    attacker.pokemon.currentHp = 100;

    engine.submitAction(0, { type: "move", side: 0, moveIndex: 0 });
    engine.submitAction(1, { type: "move", side: 1, moveIndex: 0 });

    expect(attacker.volatileStatuses.has(CORE_VOLATILE_IDS.aquaRing)).toBe(true);
    const aquaRingHeals = events.filter(
      (event) =>
        event.type === "heal" && event.side === 0 && event.source === CORE_VOLATILE_IDS.aquaRing,
    );
    expect(aquaRingHeals.length).toBeGreaterThan(0);

    attacker.pokemon.currentHp = 100;
    engine.submitAction(0, { type: "move", side: 0, moveIndex: 1 });
    engine.submitAction(1, { type: "move", side: 1, moveIndex: 0 });

    expect(attacker.volatileStatuses.has(CORE_VOLATILE_IDS.ingrain)).toBe(true);
    const ingrainHeals = events.filter(
      (event) =>
        event.type === "heal" && event.side === 0 && event.source === CORE_VOLATILE_IDS.ingrain,
    );
    expect(ingrainHeals.length).toBeGreaterThan(0);
  });

  it("given Gen 5 Future Sight and Doom Desire, when each move resolves, then the target side gets a scheduled future attack and the delayed hit lands through the shared engine channel", () => {
    const dataManager = createGen5DataManager();
    const ruleset = new Gen5Ruleset(dataManager);
    const team1 = [
      createTestPokemon(6, 50, {
        uid: "charizard-1",
        nickname: "Charizard",
        ability: CORE_ABILITY_IDS.blaze,
        moves: [
          createKnownMoveSlot(dataManager, GEN5_MOVE_IDS.futureSight),
          createKnownMoveSlot(dataManager, GEN5_MOVE_IDS.doomDesire),
          createKnownMoveSlot(dataManager, GEN5_MOVE_IDS.tackle),
        ],
      }),
    ];
    const team2 = [
      createTestPokemon(9, 50, {
        uid: "blastoise-1",
        nickname: "Blastoise",
        ability: CORE_ABILITY_IDS.torrent,
        moves: [createKnownMoveSlot(dataManager, GEN5_MOVE_IDS.tackle)],
      }),
    ];

    const { engine, events } = createEngine({
      generation: 5,
      ruleset,
      dataManager,
      team1,
      team2,
    });

    engine.submitAction(0, { type: "move", side: 0, moveIndex: 0 });
    engine.submitAction(1, { type: "move", side: 1, moveIndex: 0 });

    expect(engine.state.sides[1].futureAttack?.moveId).toBe(GEN5_MOVE_IDS.futureSight);
    expect(engine.state.sides[1].futureAttack?.turnsLeft).toBe(2);

    engine.submitAction(0, { type: "move", side: 0, moveIndex: 2 });
    engine.submitAction(1, { type: "move", side: 1, moveIndex: 0 });
    engine.submitAction(0, { type: "move", side: 0, moveIndex: 2 });
    engine.submitAction(1, { type: "move", side: 1, moveIndex: 0 });

    expect(
      events.some(
        (event) =>
          event.type === "damage" && event.side === 1 && event.source === GEN5_MOVE_IDS.futureSight,
      ),
    ).toBe(true);
    expect(engine.state.sides[1].futureAttack).toBeNull();

    engine.submitAction(0, { type: "move", side: 0, moveIndex: 1 });
    engine.submitAction(1, { type: "move", side: 1, moveIndex: 0 });

    expect(engine.state.sides[1].futureAttack?.moveId).toBe(GEN5_MOVE_IDS.doomDesire);
    expect(engine.state.sides[1].futureAttack?.turnsLeft).toBe(2);
  });

  it("given Gen 5 Gastro Acid, when the suppressed target switches out, then its original ability is restored instead of persisting blank", () => {
    const dataManager = createGen5DataManager();
    const ruleset = new Gen5Ruleset(dataManager);
    const team1 = [
      createTestPokemon(6, 50, {
        uid: "charizard-1",
        nickname: "Charizard",
        ability: CORE_ABILITY_IDS.blaze,
        moves: [
          createKnownMoveSlot(dataManager, GEN5_MOVE_IDS.gastroAcid),
          createKnownMoveSlot(dataManager, GEN5_MOVE_IDS.tackle),
        ],
      }),
    ];
    const team2 = [
      createTestPokemon(9, 50, {
        uid: "blastoise-1",
        nickname: "Blastoise",
        ability: CORE_ABILITY_IDS.torrent,
        moves: [createKnownMoveSlot(dataManager, GEN5_MOVE_IDS.tackle)],
      }),
      createTestPokemon(3, 50, {
        uid: "venusaur-2",
        nickname: "Venusaur",
        ability: CORE_ABILITY_IDS.overgrow,
        moves: [createKnownMoveSlot(dataManager, GEN5_MOVE_IDS.tackle)],
      }),
    ];

    const { engine } = createEngine({
      generation: 5,
      ruleset,
      dataManager,
      team1,
      team2,
    });

    const blastoise = engine.state.sides[1].active[0]!;

    engine.submitAction(0, { type: "move", side: 0, moveIndex: 0 });
    engine.submitAction(1, { type: "move", side: 1, moveIndex: 0 });

    expect(blastoise.suppressedAbility).toBe(CORE_ABILITY_IDS.torrent);
    expect(blastoise.ability).toBe("");

    engine.submitAction(0, { type: "move", side: 0, moveIndex: 1 });
    engine.submitAction(1, { type: "switch", side: 1, switchTo: 1 });

    expect(engine.state.sides[1].team[0]?.ability).toBe(CORE_ABILITY_IDS.torrent);
    expect(engine.state.sides[1].team[0]?.status).toBeNull();
  });

  it("given Gen 5 Stockpile into Spit Up, when the user releases stored energy, then the runtime consumes the stockpile layers and removes only the applied defensive boosts", () => {
    const dataManager = createGen5DataManager();
    const ruleset = new Gen5Ruleset(dataManager);
    const team1 = [
      createTestPokemon(6, 50, {
        uid: "charizard-1",
        nickname: "Charizard",
        ability: CORE_ABILITY_IDS.blaze,
        moves: [
          createKnownMoveSlot(dataManager, GEN5_MOVE_IDS.stockpile),
          createKnownMoveSlot(dataManager, GEN5_MOVE_IDS.spitUp),
        ],
        calculatedStats: {
          hp: 220,
          attack: 100,
          defense: 100,
          spAttack: 100,
          spDefense: 100,
          speed: 120,
        },
        currentHp: 220,
      }),
    ];
    const team2 = [
      createTestPokemon(9, 50, {
        uid: "blastoise-1",
        nickname: "Blastoise",
        ability: CORE_ABILITY_IDS.torrent,
        moves: [createKnownMoveSlot(dataManager, GEN5_MOVE_IDS.tackle)],
        calculatedStats: {
          hp: 240,
          attack: 90,
          defense: 100,
          spAttack: 90,
          spDefense: 100,
          speed: 60,
        },
        currentHp: 240,
      }),
    ];

    const { engine, events } = createEngine({
      generation: 5,
      ruleset,
      dataManager,
      team1,
      team2,
    });

    const attacker = engine.state.sides[0].active[0]!;
    const defender = engine.state.sides[1].active[0]!;

    engine.submitAction(0, { type: "move", side: 0, moveIndex: 0 });
    engine.submitAction(1, { type: "move", side: 1, moveIndex: 0 });
    engine.submitAction(0, { type: "move", side: 0, moveIndex: 0 });
    engine.submitAction(1, { type: "move", side: 1, moveIndex: 0 });

    expect(attacker.volatileStatuses.get(CORE_VOLATILE_IDS.stockpile)?.data?.layers).toBe(2);
    expect(attacker.statStages.defense).toBe(2);
    expect(attacker.statStages.spDefense).toBe(2);

    const defenderHpBeforeSpitUp = defender.pokemon.currentHp;
    engine.submitAction(0, { type: "move", side: 0, moveIndex: 1 });
    engine.submitAction(1, { type: "move", side: 1, moveIndex: 0 });

    expect(attacker.volatileStatuses.has(CORE_VOLATILE_IDS.stockpile)).toBe(false);
    expect(attacker.statStages.defense).toBe(0);
    expect(attacker.statStages.spDefense).toBe(0);
    expect(defender.pokemon.currentHp).toBeLessThan(defenderHpBeforeSpitUp);
    expect(
      events.some(
        (event) =>
          event.type === "damage" && event.side === 1 && event.source === GEN5_MOVE_IDS.spitUp,
      ),
    ).toBe(true);
  });

  it("given Gen 5 Stockpile into Swallow, when the user consumes stored energy, then HP is restored and the tracked defensive boosts are removed", () => {
    const dataManager = createGen5DataManager();
    const ruleset = new Gen5Ruleset(dataManager);
    const team1 = [
      createTestPokemon(6, 50, {
        uid: "charizard-1",
        nickname: "Charizard",
        ability: CORE_ABILITY_IDS.blaze,
        moves: [
          createKnownMoveSlot(dataManager, GEN5_MOVE_IDS.stockpile),
          createKnownMoveSlot(dataManager, GEN5_MOVE_IDS.swallow),
        ],
        calculatedStats: {
          hp: 220,
          attack: 90,
          defense: 100,
          spAttack: 100,
          spDefense: 100,
          speed: 120,
        },
        currentHp: 220,
      }),
    ];
    const team2 = [
      createTestPokemon(9, 50, {
        uid: "blastoise-1",
        nickname: "Blastoise",
        ability: CORE_ABILITY_IDS.torrent,
        moves: [createKnownMoveSlot(dataManager, GEN5_MOVE_IDS.tackle)],
        calculatedStats: {
          hp: 240,
          attack: 80,
          defense: 100,
          spAttack: 90,
          spDefense: 100,
          speed: 60,
        },
        currentHp: 240,
      }),
    ];

    const { engine, events } = createEngine({
      generation: 5,
      ruleset,
      dataManager,
      team1,
      team2,
    });

    const attacker = engine.state.sides[0].active[0]!;

    engine.submitAction(0, { type: "move", side: 0, moveIndex: 0 });
    engine.submitAction(1, { type: "move", side: 1, moveIndex: 0 });
    engine.submitAction(0, { type: "move", side: 0, moveIndex: 0 });
    engine.submitAction(1, { type: "move", side: 1, moveIndex: 0 });

    attacker.pokemon.currentHp = 60;
    const hpBeforeSwallow = attacker.pokemon.currentHp;

    engine.submitAction(0, { type: "move", side: 0, moveIndex: 1 });
    engine.submitAction(1, { type: "move", side: 1, moveIndex: 0 });

    expect(attacker.pokemon.currentHp).toBeGreaterThan(hpBeforeSwallow);
    expect(attacker.volatileStatuses.has(CORE_VOLATILE_IDS.stockpile)).toBe(false);
    expect(attacker.statStages.defense).toBe(0);
    expect(attacker.statStages.spDefense).toBe(0);
    expect(
      events.some(
        (event) => event.type === "heal" && event.side === 0 && event.source === "move-effect",
      ),
    ).toBe(true);
  });

  it("given Gen 9 availability checks for Belch, Recycle, Spit Up, and Swallow, when the tracked state changes, then getAvailableMoves reflects the runtime pre-execution failures instead of leaving the moves falsely usable", () => {
    const dataManager = createGen9DataManager();
    const ruleset = new Gen9Ruleset(dataManager);
    const team1 = [
      createTestPokemon(6, 50, {
        uid: "charizard-1",
        nickname: "Charizard",
        ability: CORE_ABILITY_IDS.blaze,
        moves: [
          createKnownMoveSlot(dataManager, GEN9_MOVE_IDS.belch),
          createKnownMoveSlot(dataManager, GEN9_MOVE_IDS.recycle),
          createKnownMoveSlot(dataManager, GEN9_MOVE_IDS.spitUp),
          createKnownMoveSlot(dataManager, GEN9_MOVE_IDS.swallow),
        ],
      }),
    ];
    const team2 = [
      createTestPokemon(9, 50, {
        uid: "blastoise-1",
        nickname: "Blastoise",
        ability: CORE_ABILITY_IDS.torrent,
        moves: [createKnownMoveSlot(dataManager, GEN9_MOVE_IDS.tackle)],
      }),
    ];

    const { engine } = createEngine({
      generation: 9,
      ruleset,
      dataManager,
      team1,
      team2,
    });

    const attacker = engine.state.sides[0].active[0]!;
    const initialChoices = engine.getAvailableMoves(0);

    expect(initialChoices.find((move) => move.moveId === GEN9_MOVE_IDS.belch)?.disabledReason).toBe(
      "Requires a Berry to be eaten",
    );
    expect(
      initialChoices.find((move) => move.moveId === GEN9_MOVE_IDS.recycle)?.disabledReason,
    ).toBe("No recyclable item");
    expect(
      initialChoices.find((move) => move.moveId === GEN9_MOVE_IDS.spitUp)?.disabledReason,
    ).toBe("No stockpiled energy");
    expect(
      initialChoices.find((move) => move.moveId === GEN9_MOVE_IDS.swallow)?.disabledReason,
    ).toBe("No stockpiled energy");

    attacker.pokemon.lastItem = GEN9_ITEM_IDS.sitrusBerry;
    attacker.pokemon.ateBerry = true;
    attacker.volatileStatuses.set(CORE_VOLATILE_IDS.stockpile, {
      turnsLeft: -1,
      data: { layers: 2, defenseBoostsApplied: 1, spDefenseBoostsApplied: 1 },
    });

    const updatedChoices = engine.getAvailableMoves(0);

    expect(updatedChoices.find((move) => move.moveId === GEN9_MOVE_IDS.belch)?.disabled).toBe(
      false,
    );
    expect(updatedChoices.find((move) => move.moveId === GEN9_MOVE_IDS.recycle)?.disabled).toBe(
      false,
    );
    expect(updatedChoices.find((move) => move.moveId === GEN9_MOVE_IDS.spitUp)?.disabled).toBe(
      false,
    );
    expect(updatedChoices.find((move) => move.moveId === GEN9_MOVE_IDS.swallow)?.disabled).toBe(
      false,
    );
  });

  it("given Gen 6 Telekinesis, when the move resolves and subsequent turns pass, then the volatile is applied with the expected duration and expires through the end-of-turn countdown", () => {
    const dataManager = createGen6DataManager();
    const ruleset = new Gen6Ruleset(dataManager);
    const team1 = [
      createTestPokemon(6, 50, {
        uid: "charizard-1",
        nickname: "Charizard",
        ability: CORE_ABILITY_IDS.blaze,
        moves: [
          createKnownMoveSlot(dataManager, GEN6_MOVE_IDS.telekinesis),
          createKnownMoveSlot(dataManager, GEN6_MOVE_IDS.tackle),
        ],
      }),
    ];
    const team2 = [
      createTestPokemon(9, 50, {
        uid: "blastoise-1",
        nickname: "Blastoise",
        ability: CORE_ABILITY_IDS.torrent,
        moves: [createKnownMoveSlot(dataManager, GEN6_MOVE_IDS.tackle)],
      }),
    ];

    const { engine } = createEngine({
      generation: 6,
      ruleset,
      dataManager,
      team1,
      team2,
    });

    const target = engine.state.sides[1].active[0]!;

    engine.submitAction(0, { type: "move", side: 0, moveIndex: 0 });
    engine.submitAction(1, { type: "move", side: 1, moveIndex: 0 });

    expect(target.volatileStatuses.has(CORE_VOLATILE_IDS.telekinesis)).toBe(true);
    expect(target.volatileStatuses.get(CORE_VOLATILE_IDS.telekinesis)?.turnsLeft).toBe(2);

    engine.submitAction(0, { type: "move", side: 0, moveIndex: 1 });
    engine.submitAction(1, { type: "move", side: 1, moveIndex: 0 });
    expect(target.volatileStatuses.get(CORE_VOLATILE_IDS.telekinesis)?.turnsLeft).toBe(1);

    engine.submitAction(0, { type: "move", side: 0, moveIndex: 1 });
    engine.submitAction(1, { type: "move", side: 1, moveIndex: 0 });
    expect(target.volatileStatuses.has(CORE_VOLATILE_IDS.telekinesis)).toBe(false);
  });

  it("given Gen 7 Core Enforcer, when the target already moved this turn, then the move applies the existing suppression state instead of remaining data-only", () => {
    const dataManager = createGen7DataManager();
    const ruleset = new Gen7Ruleset(dataManager);
    const team1 = [
      createTestPokemon(9, 50, {
        uid: "blastoise-1",
        nickname: "Blastoise",
        ability: CORE_ABILITY_IDS.torrent,
        moves: [
          createKnownMoveSlot(dataManager, GEN7_MOVE_IDS.coreEnforcer),
          createKnownMoveSlot(dataManager, GEN7_MOVE_IDS.tackle),
        ],
      }),
    ];
    const team2 = [
      createTestPokemon(6, 50, {
        uid: "charizard-1",
        nickname: "Charizard",
        ability: CORE_ABILITY_IDS.blaze,
        moves: [createKnownMoveSlot(dataManager, GEN7_MOVE_IDS.tackle)],
      }),
    ];

    const { engine } = createEngine({
      generation: 7,
      ruleset,
      dataManager,
      team1,
      team2,
    });

    engine.state.sides[0].active[0]!.pokemon.calculatedStats!.speed = 50;
    engine.state.sides[1].active[0]!.pokemon.calculatedStats!.speed = 150;

    const target = engine.state.sides[1].active[0]!;

    engine.submitAction(0, { type: "move", side: 0, moveIndex: 0 });
    engine.submitAction(1, { type: "move", side: 1, moveIndex: 0 });

    expect(target.suppressedAbility).toBe(CORE_ABILITY_IDS.blaze);
    expect(target.ability).toBe("");
  });

  it("given Gen 9 Psychic Noise, when the target tries to heal on the next turn, then the move applies the shared heal-block volatile with the shorter duration", () => {
    const dataManager = createGen9DataManager();
    const ruleset = new Gen9Ruleset(dataManager);
    const team1 = [
      createTestPokemon(6, 50, {
        uid: "charizard-1",
        nickname: "Charizard",
        ability: CORE_ABILITY_IDS.blaze,
        moves: [
          createKnownMoveSlot(dataManager, GEN9_MOVE_IDS.psychicNoise),
          createKnownMoveSlot(dataManager, GEN9_MOVE_IDS.tackle),
        ],
      }),
    ];
    const team2 = [
      createTestPokemon(9, 50, {
        uid: "blastoise-1",
        nickname: "Blastoise",
        ability: CORE_ABILITY_IDS.torrent,
        moves: [
          createKnownMoveSlot(dataManager, GEN9_MOVE_IDS.rest),
          createKnownMoveSlot(dataManager, GEN9_MOVE_IDS.tackle),
        ],
      }),
    ];

    const { engine, events } = createEngine({
      generation: 9,
      ruleset,
      dataManager,
      team1,
      team2,
    });

    const target = engine.state.sides[1].active[0]!;
    target.pokemon.currentHp = 60;

    engine.submitAction(0, { type: "move", side: 0, moveIndex: 0 });
    engine.submitAction(1, { type: "move", side: 1, moveIndex: 1 });

    expect(target.volatileStatuses.has(CORE_VOLATILE_IDS.healBlock)).toBe(true);
    expect(target.volatileStatuses.get(CORE_VOLATILE_IDS.healBlock)?.turnsLeft).toBe(1);

    const hpAfterPsychicNoiseTurn = target.pokemon.currentHp;
    engine.submitAction(0, { type: "move", side: 0, moveIndex: 1 });
    engine.submitAction(1, { type: "move", side: 1, moveIndex: 0 });

    expect(target.pokemon.status).toBeNull();
    expect(target.pokemon.currentHp).toBeLessThanOrEqual(hpAfterPsychicNoiseTurn);
    expect(target.volatileStatuses.has(CORE_VOLATILE_IDS.healBlock)).toBe(false);
    expect(
      events.some(
        (event) => event.type === "heal" && event.side === 1 && event.source === "move-effect",
      ),
    ).toBe(false);
  });

  it("given Gen 9 Sitrus Berry consumption, when Belch and Recycle become valid and the user switches out and back, then the persistent state survives the switch and Recycle restores the consumed item", () => {
    const dataManager = createGen9DataManager();
    const ruleset = new Gen9Ruleset(dataManager);
    const team1 = [
      createTestPokemon(6, 50, {
        uid: "charizard-1",
        nickname: "Charizard",
        ability: CORE_ABILITY_IDS.blaze,
        heldItem: GEN9_ITEM_IDS.sitrusBerry,
        moves: [
          createKnownMoveSlot(dataManager, GEN9_MOVE_IDS.belch),
          createKnownMoveSlot(dataManager, GEN9_MOVE_IDS.recycle),
          createKnownMoveSlot(dataManager, GEN9_MOVE_IDS.tackle),
        ],
        calculatedStats: {
          hp: 200,
          attack: 90,
          defense: 80,
          spAttack: 110,
          spDefense: 90,
          speed: 120,
        },
        currentHp: 90,
      }),
      createTestPokemon(25, 50, {
        uid: "pikachu-2",
        nickname: "Pikachu",
        ability: CORE_ABILITY_IDS.static,
        moves: [createKnownMoveSlot(dataManager, GEN9_MOVE_IDS.tackle)],
      }),
    ];
    const team2 = [
      createTestPokemon(9, 50, {
        uid: "blastoise-1",
        nickname: "Blastoise",
        ability: CORE_ABILITY_IDS.torrent,
        moves: [createKnownMoveSlot(dataManager, GEN9_MOVE_IDS.tackle)],
        calculatedStats: {
          hp: 240,
          attack: 120,
          defense: 100,
          spAttack: 100,
          spDefense: 100,
          speed: 60,
        },
        currentHp: 240,
      }),
    ];

    const { engine } = createEngine({
      generation: 9,
      ruleset,
      dataManager,
      team1,
      team2,
    });

    engine.state.sides[0].active[0]!.pokemon.currentHp = 60;

    let choices = engine.getAvailableMoves(0);
    expect(choices.find((move) => move.moveId === GEN9_MOVE_IDS.belch)?.disabled).toBe(true);
    expect(choices.find((move) => move.moveId === GEN9_MOVE_IDS.recycle)?.disabled).toBe(true);

    engine.submitAction(0, { type: "move", side: 0, moveIndex: 2 });
    engine.submitAction(1, { type: "move", side: 1, moveIndex: 0 });

    const charizard = engine.state.sides[0].active[0]!;
    expect(charizard.pokemon.heldItem).toBeNull();
    expect(charizard.pokemon.lastItem).toBe(GEN9_ITEM_IDS.sitrusBerry);
    expect(charizard.pokemon.ateBerry).toBe(true);

    choices = engine.getAvailableMoves(0);
    expect(choices.find((move) => move.moveId === GEN9_MOVE_IDS.belch)?.disabled).toBe(false);
    expect(choices.find((move) => move.moveId === GEN9_MOVE_IDS.recycle)?.disabled).toBe(false);

    engine.submitAction(0, { type: "switch", side: 0, switchTo: 1 });
    engine.submitAction(1, { type: "move", side: 1, moveIndex: 0 });
    engine.submitAction(0, { type: "switch", side: 0, switchTo: 0 });
    engine.submitAction(1, { type: "move", side: 1, moveIndex: 0 });

    const returnedCharizard = engine.state.sides[0].active[0]!;
    expect(returnedCharizard.pokemon.ateBerry).toBe(true);
    expect(returnedCharizard.pokemon.lastItem).toBe(GEN9_ITEM_IDS.sitrusBerry);

    choices = engine.getAvailableMoves(0);
    expect(choices.find((move) => move.moveId === GEN9_MOVE_IDS.belch)?.disabled).toBe(false);
    expect(choices.find((move) => move.moveId === GEN9_MOVE_IDS.recycle)?.disabled).toBe(false);

    returnedCharizard.pokemon.currentHp = returnedCharizard.pokemon.calculatedStats?.hp ?? 153;
    engine.submitAction(0, { type: "move", side: 0, moveIndex: 1 });
    engine.submitAction(1, { type: "move", side: 1, moveIndex: 0 });

    expect(returnedCharizard.pokemon.heldItem).toBe(GEN9_ITEM_IDS.sitrusBerry);
    expect(returnedCharizard.pokemon.lastItem).toBeNull();
    expect(
      engine.getAvailableMoves(0).find((move) => move.moveId === GEN9_MOVE_IDS.recycle)
        ?.disabledReason,
    ).toBe("Already holding an item");
  });

  it("given Gen 9 Power Trick into Baton Pass, when the replacement is chosen, then the incoming Pokemon inherits the live power-trick volatile through the real engine switch prompt", () => {
    function runScenario(usePowerTrick: boolean) {
      const dataManager = createGen9DataManager();
      const ruleset = new Gen9Ruleset(dataManager);
      const team1 = [
        createTestPokemon(6, 50, {
          uid: "charizard-1",
          nickname: "Charizard",
          ability: CORE_ABILITY_IDS.blaze,
          moves: [
            createKnownMoveSlot(dataManager, GEN9_MOVE_IDS.powerTrick),
            createKnownMoveSlot(dataManager, GEN9_MOVE_IDS.batonPass),
          ],
          calculatedStats: {
            hp: 180,
            attack: 55,
            defense: 170,
            spAttack: 100,
            spDefense: 100,
            speed: 120,
          },
          currentHp: 180,
        }),
        createTestPokemon(25, 50, {
          uid: "pikachu-2",
          nickname: "Pikachu",
          ability: CORE_ABILITY_IDS.static,
          moves: [createKnownMoveSlot(dataManager, GEN9_MOVE_IDS.tackle)],
          calculatedStats: {
            hp: 180,
            attack: 50,
            defense: 180,
            spAttack: 80,
            spDefense: 80,
            speed: 110,
          },
          currentHp: 180,
        }),
      ];
      const team2 = [
        createTestPokemon(9, 50, {
          uid: "blastoise-1",
          nickname: "Blastoise",
          ability: CORE_ABILITY_IDS.torrent,
          moves: [createKnownMoveSlot(dataManager, GEN9_MOVE_IDS.tackle)],
          calculatedStats: {
            hp: 240,
            attack: 80,
            defense: 100,
            spAttack: 90,
            spDefense: 100,
            speed: 60,
          },
          currentHp: 240,
        }),
      ];

      const { engine } = createEngine({
        generation: 9,
        ruleset,
        dataManager,
        team1,
        team2,
      });

      if (usePowerTrick) {
        engine.submitAction(0, { type: "move", side: 0, moveIndex: 0 });
        engine.submitAction(1, { type: "move", side: 1, moveIndex: 0 });
        expect(
          engine.state.sides[0].active[0]?.volatileStatuses.has(CORE_VOLATILE_IDS.powerTrick),
        ).toBe(true);
        engine.submitAction(0, { type: "move", side: 0, moveIndex: 1 });
        engine.submitAction(1, { type: "move", side: 1, moveIndex: 0 });
      } else {
        engine.submitAction(0, { type: "move", side: 0, moveIndex: 1 });
        engine.submitAction(1, { type: "move", side: 1, moveIndex: 0 });
      }
      engine.submitSwitch(0, 1);

      const replacement = engine.state.sides[0].active[0]!;
      const defender = engine.state.sides[1].active[0]!;
      const defenderHpBeforeAttack = defender.pokemon.currentHp;

      engine.submitAction(0, { type: "move", side: 0, moveIndex: 0 });
      engine.submitAction(1, { type: "move", side: 1, moveIndex: 0 });

      return {
        replacement,
        damageDealt: defenderHpBeforeAttack - defender.pokemon.currentHp,
      };
    }

    const baseline = runScenario(false);
    const powered = runScenario(true);

    expect(powered.replacement.volatileStatuses.has(CORE_VOLATILE_IDS.powerTrick)).toBe(true);
    expect(baseline.replacement.volatileStatuses.has(CORE_VOLATILE_IDS.powerTrick)).toBe(false);
    expect(powered.damageDealt).toBeGreaterThan(0);
  });
});
