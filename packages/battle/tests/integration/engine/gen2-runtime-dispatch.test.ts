import type { DataManager, PokemonInstance } from "@pokemon-lib-ts/core";
import {
  CORE_ABILITY_SLOTS,
  CORE_GENDERS,
  CORE_NATURE_IDS,
  CORE_POKEMON_DEFAULTS,
  CORE_STAT_IDS,
  CORE_STATUS_IDS,
  CORE_VOLATILE_IDS,
  createDvs,
  createFriendship,
  createMoveSlot,
  createStatExp,
} from "@pokemon-lib-ts/core";
import {
  createGen2DataManager,
  GEN2_ITEM_IDS,
  GEN2_MOVE_IDS,
  GEN2_SPECIES_IDS,
  Gen2Ruleset,
} from "@pokemon-lib-ts/gen2";
import { describe, expect, it } from "vitest";
import type { BattleConfig } from "../../../src/context";
import { BattleEngine } from "../../../src/engine";
import type { BattleEvent } from "../../../src/events";

function createGen2Pokemon(
  dataManager: DataManager,
  speciesId: number,
  level: number,
  moveIds: string[],
  overrides?: Partial<PokemonInstance>,
): PokemonInstance {
  const species = dataManager.getSpecies(speciesId);

  return {
    uid: `gen2-${speciesId}-${level}-${moveIds.join("-")}`,
    speciesId,
    nickname: species.displayName,
    level,
    experience: 0,
    nature: CORE_NATURE_IDS.hardy,
    ivs: createDvs(),
    evs: createStatExp(),
    currentHp: 200,
    moves: moveIds.map((moveId) => {
      const moveData = dataManager.getMove(moveId);
      return createMoveSlot(moveData.id, moveData.pp);
    }),
    ability: "",
    abilitySlot: CORE_ABILITY_SLOTS.normal1,
    heldItem: null,
    status: null,
    friendship: createFriendship(species.baseFriendship),
    gender: species.genderRatio === null ? CORE_GENDERS.genderless : CORE_GENDERS.male,
    isShiny: false,
    metLocation: CORE_POKEMON_DEFAULTS.metLocation,
    metLevel: level,
    originalTrainer: CORE_POKEMON_DEFAULTS.originalTrainer,
    originalTrainerId: CORE_POKEMON_DEFAULTS.originalTrainerId,
    pokeball: GEN2_ITEM_IDS.pokeBall,
    ...overrides,
  };
}

function createGen2Engine(options: {
  team1: PokemonInstance[];
  team2: PokemonInstance[];
  seed?: number;
}) {
  const dataManager = createGen2DataManager();
  const ruleset = new Gen2Ruleset();
  const events: BattleEvent[] = [];
  const config: BattleConfig = {
    generation: 2,
    format: "singles",
    teams: [options.team1, options.team2],
    seed: options.seed ?? 42,
  };

  const engine = new BattleEngine(config, ruleset, dataManager);
  engine.on((event) => events.push(event));
  engine.start();

  return { engine, events, dataManager };
}

describe("Gen 2 runtime dispatch regressions", () => {
  it("given a damaged badly-poisoned user, when Rest is used, then the engine cures poison, clears toxic tracking, restores HP, and applies fixed sleep through the real Gen 2 ruleset", () => {
    const dataManager = createGen2DataManager();
    const team1 = [
      createGen2Pokemon(dataManager, GEN2_SPECIES_IDS.snorlax, 50, [GEN2_MOVE_IDS.rest], {
        uid: "snorlax-1",
        calculatedStats: {
          hp: 260,
          attack: 110,
          defense: 90,
          spAttack: 65,
          spDefense: 110,
          speed: 30,
        },
        currentHp: 260,
      }),
    ];
    const team2 = [
      createGen2Pokemon(dataManager, GEN2_SPECIES_IDS.magikarp, 50, [GEN2_MOVE_IDS.splash], {
        uid: "magikarp-1",
        calculatedStats: {
          hp: 120,
          attack: 20,
          defense: 55,
          spAttack: 15,
          spDefense: 20,
          speed: 80,
        },
        currentHp: 120,
      }),
    ];

    const { engine, events } = createGen2Engine({ team1, team2 });
    const snorlax = engine.state.sides[0].active[0]!;
    const startingMaxHp = snorlax.pokemon.calculatedStats?.hp ?? snorlax.pokemon.currentHp;
    snorlax.pokemon.currentHp = 80;
    snorlax.pokemon.status = CORE_STATUS_IDS.poison;
    snorlax.volatileStatuses.set(CORE_VOLATILE_IDS.toxicCounter, {
      turnsLeft: -1,
      data: { counter: 3 },
    });

    engine.submitAction(0, { type: "move", side: 0, moveIndex: 0 });
    engine.submitAction(1, { type: "move", side: 1, moveIndex: 0 });

    expect(snorlax.pokemon.currentHp).toBe(startingMaxHp);
    expect(snorlax.pokemon.status).toBe(CORE_STATUS_IDS.sleep);
    expect(snorlax.volatileStatuses.has(CORE_VOLATILE_IDS.toxicCounter)).toBe(false);
    expect(snorlax.volatileStatuses.get(CORE_VOLATILE_IDS.sleepCounter)?.turnsLeft).toBe(2);
    expect(events).toContainEqual(
      expect.objectContaining({ type: "status-cure", side: 0, status: CORE_STATUS_IDS.poison }),
    );
    expect(events).toContainEqual(
      expect.objectContaining({ type: "status-inflict", side: 0, status: CORE_STATUS_IDS.sleep }),
    );
    expect(events).toContainEqual(
      expect.objectContaining({
        type: "heal",
        side: 0,
        amount: startingMaxHp - 80,
        source: "move-effect",
      }),
    );
  });

  it("given Perish Song is used, when the turn resolves, then both battlers gain the volatile and the same-turn countdown ticks to 3", () => {
    // Source: pret/pokecrystal engine/battle/move_effects/perish_song.asm sets count=4
    // and the turn-end residual pass decrements it to 3 on the application turn.
    const dataManager = createGen2DataManager();
    const team1 = [
      createGen2Pokemon(dataManager, GEN2_SPECIES_IDS.lapras, 50, [GEN2_MOVE_IDS.perishSong], {
        uid: "lapras-1",
        calculatedStats: {
          hp: 220,
          attack: 85,
          defense: 80,
          spAttack: 85,
          spDefense: 95,
          speed: 60,
        },
        currentHp: 220,
      }),
    ];
    const team2 = [
      createGen2Pokemon(dataManager, GEN2_SPECIES_IDS.magikarp, 50, [GEN2_MOVE_IDS.splash], {
        uid: "magikarp-2",
        calculatedStats: {
          hp: 120,
          attack: 20,
          defense: 55,
          spAttack: 15,
          spDefense: 20,
          speed: 80,
        },
        currentHp: 120,
      }),
    ];

    const { engine, events } = createGen2Engine({ team1, team2 });

    engine.submitAction(0, { type: "move", side: 0, moveIndex: 0 });
    engine.submitAction(1, { type: "move", side: 1, moveIndex: 0 });

    const side0 = engine.state.sides[0].active[0]!;
    const side1 = engine.state.sides[1].active[0]!;
    expect(side0.volatileStatuses.get(CORE_VOLATILE_IDS.perishSong)?.data).toEqual({ counter: 3 });
    expect(side1.volatileStatuses.get(CORE_VOLATILE_IDS.perishSong)?.data).toEqual({ counter: 3 });

    const perishMessages = events.filter(
      (event) =>
        event.type === "message" &&
        (event.text === "Lapras's perish count fell to 3!" ||
          event.text === "Magikarp's perish count fell to 3!"),
    );
    expect(perishMessages).toHaveLength(2);
  });

  it("given a non-Ghost user uses Curse, when the turn resolves, then the engine applies the self stat changes through the real Gen 2 ruleset", () => {
    const dataManager = createGen2DataManager();
    const team1 = [
      createGen2Pokemon(dataManager, GEN2_SPECIES_IDS.snorlax, 50, [GEN2_MOVE_IDS.curse], {
        uid: "snorlax-curse",
        calculatedStats: {
          hp: 260,
          attack: 110,
          defense: 90,
          spAttack: 65,
          spDefense: 110,
          speed: 30,
        },
        currentHp: 260,
      }),
    ];
    const team2 = [
      createGen2Pokemon(dataManager, GEN2_SPECIES_IDS.magikarp, 50, [GEN2_MOVE_IDS.splash], {
        uid: "magikarp-non-ghost-curse",
        calculatedStats: {
          hp: 120,
          attack: 20,
          defense: 55,
          spAttack: 15,
          spDefense: 20,
          speed: 80,
        },
        currentHp: 120,
      }),
    ];

    const { engine, events } = createGen2Engine({ team1, team2 });
    const snorlax = engine.state.sides[0].active[0]!;

    engine.submitAction(0, { type: "move", side: 0, moveIndex: 0 });
    engine.submitAction(1, { type: "move", side: 1, moveIndex: 0 });

    expect(snorlax.statStages.attack).toBe(1);
    expect(snorlax.statStages.defense).toBe(1);
    expect(snorlax.statStages.speed).toBe(-1);
    const statChanges = events.filter((event) => event.type === "stat-change" && event.side === 0);
    expect(statChanges).toEqual([
      expect.objectContaining({
        type: "stat-change",
        side: 0,
        stat: CORE_STAT_IDS.speed,
        stages: -1,
        currentStage: -1,
      }),
      expect.objectContaining({
        type: "stat-change",
        side: 0,
        stat: CORE_STAT_IDS.attack,
        stages: 1,
        currentStage: 1,
      }),
      expect.objectContaining({
        type: "stat-change",
        side: 0,
        stat: CORE_STAT_IDS.defense,
        stages: 1,
        currentStage: 1,
      }),
    ]);
  });

  it("given a Ghost-type user uses Curse, when the turn resolves, then the user loses half HP and the target gains the curse volatile", () => {
    // Source: Gen 2 Curse uses the Ghost branch for Ghost-type users: lose half max HP
    // and apply the curse volatile to the target.
    const dataManager = createGen2DataManager();
    const team1 = [
      createGen2Pokemon(dataManager, GEN2_SPECIES_IDS.gengar, 50, [GEN2_MOVE_IDS.curse], {
        uid: "gengar-curse",
        calculatedStats: {
          hp: 180,
          attack: 65,
          defense: 60,
          spAttack: 130,
          spDefense: 75,
          speed: 110,
        },
        currentHp: 180,
      }),
    ];
    const team2 = [
      createGen2Pokemon(dataManager, GEN2_SPECIES_IDS.magikarp, 50, [GEN2_MOVE_IDS.splash], {
        uid: "magikarp-curse",
        calculatedStats: {
          hp: 120,
          attack: 20,
          defense: 55,
          spAttack: 15,
          spDefense: 20,
          speed: 80,
        },
        currentHp: 120,
      }),
    ];

    const { engine, events } = createGen2Engine({ team1, team2 });
    const gengar = engine.state.sides[0].active[0]!;
    const magikarp = engine.state.sides[1].active[0]!;
    const gengarMaxHp = gengar.pokemon.calculatedStats?.hp ?? gengar.pokemon.currentHp;
    const magikarpMaxHp = magikarp.pokemon.calculatedStats?.hp ?? magikarp.pokemon.currentHp;

    engine.submitAction(0, { type: "move", side: 0, moveIndex: 0 });
    engine.submitAction(1, { type: "move", side: 1, moveIndex: 0 });

    expect(gengar.pokemon.currentHp).toBe(gengarMaxHp - Math.floor(gengarMaxHp / 2));
    expect(magikarp.volatileStatuses.has(CORE_VOLATILE_IDS.curse)).toBe(true);
    expect(events).toContainEqual(
      expect.objectContaining({
        type: "damage",
        side: 0,
        amount: Math.floor(gengarMaxHp / 2),
        source: "recoil",
      }),
    );
    expect(events).toContainEqual(
      expect.objectContaining({
        type: "volatile-start",
        side: 1,
        volatile: CORE_VOLATILE_IDS.curse,
      }),
    );
    expect(events).toContainEqual(
      expect.objectContaining({
        type: "damage",
        side: 1,
        amount: Math.max(1, Math.floor(magikarpMaxHp / 4)),
        source: "curse",
      }),
    );
  });
});
