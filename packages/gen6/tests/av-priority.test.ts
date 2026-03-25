import type { ActivePokemon, BattleAction, BattleSide, BattleState } from "@pokemon-lib-ts/battle";
import { createOnFieldPokemon } from "@pokemon-lib-ts/battle/utils";
import type { PokemonInstance, PrimaryStatus } from "@pokemon-lib-ts/core";
import {
  CORE_ABILITY_SLOTS,
  CORE_GENDERS,
  CORE_NATURE_IDS,
  SeededRandom,
  createMoveSlot,
  createPokemonInstance,
} from "@pokemon-lib-ts/core";
import { describe, expect, it } from "vitest";
import {
  GEN6_ABILITY_IDS,
  GEN6_ITEM_IDS,
  GEN6_MOVE_IDS,
  GEN6_NATURE_IDS,
  GEN6_SPECIES_IDS,
  Gen6Ruleset,
  createGen6DataManager,
} from "../src";

/**
 * Tests for:
 * - Issue #623: Assault Vest blocks status moves
 * - Issue #625: Prankster and Gale Wings +1 priority in resolveTurnOrder
 *
 * Source: Showdown data/items.ts -- Assault Vest: "The holder is unable to use status moves"
 * Source: Showdown data/abilities.ts -- Prankster onModifyPriority
 * Source: Showdown data/mods/gen6/abilities.ts -- Gale Wings (no HP check in Gen 6)
 */

// ---------------------------------------------------------------------------
// Test helpers
// ---------------------------------------------------------------------------

const gen6DataManager = createGen6DataManager();
const GEN6_DEFAULT_LEVEL = 50;
const GEN6_DEFAULT_HP = 200;
const GEN6_DEFAULT_SPEED = 100;

function buildBattleState(sideA: BattleSide, sideB: BattleSide): BattleState {
  return {
    phase: "turn-end",
    generation: 6,
    format: "singles",
    turnNumber: 1,
    sides: [sideA, sideB],
    weather: null,
    terrain: null,
    trickRoom: { active: false, turnsLeft: 0 },
    magicRoom: { active: false, turnsLeft: 0 },
    wonderRoom: { active: false, turnsLeft: 0 },
    gravity: { active: false, turnsLeft: 0 },
    turnHistory: [],
    rng: new SeededRandom(0),
    ended: false,
    winner: null,
  } as BattleState;
}

function buildBattleSide(index: 0 | 1, active: ActivePokemon): BattleSide {
  return {
    index,
    trainer: null,
    team: [active.pokemon],
    active: [active],
    hazards: [],
    screens: [],
    tailwind: { active: false, turnsLeft: 0 },
    luckyChant: { active: false, turnsLeft: 0 },
    wish: null,
    futureAttack: null,
    faintCount: 0,
    gimmickUsed: false,
  } as BattleSide;
}

function createCanonicalGen6PokemonInstance(
  speciesId: number,
  options: {
    abilityOverride?: string;
    currentHp?: number;
    moveIds?: readonly string[];
    primaryStatus?: PrimaryStatus | null;
    seedOffset?: number;
    speed?: number;
  } = {},
): PokemonInstance {
  const species = gen6DataManager.getSpecies(speciesId);
  const pokemon = createPokemonInstance(
    species,
    GEN6_DEFAULT_LEVEL,
    new SeededRandom(0x6d74 + (options.seedOffset ?? 0)),
    {
      nature: GEN6_NATURE_IDS.hardy,
      ivs: {
        hp: 31,
        attack: 31,
        defense: 31,
        spAttack: 31,
        spDefense: 31,
        speed: 31,
      },
      evs: {
        hp: 0,
        attack: 0,
        defense: 0,
        spAttack: 0,
        spDefense: 0,
        speed: 0,
      },
      abilitySlot: CORE_ABILITY_SLOTS.normal1,
      gender: CORE_GENDERS.male,
      isShiny: false,
      heldItem: null,
      friendship: species.baseFriendship,
      metLocation: "test",
      originalTrainer: "Test",
      originalTrainerId: 0,
      pokeball: GEN6_ITEM_IDS.pokeBall,
    },
  );

  pokemon.currentHp = options.currentHp ?? GEN6_DEFAULT_HP;
  pokemon.calculatedStats = {
    hp: options.currentHp ?? GEN6_DEFAULT_HP,
    attack: 100,
    defense: 100,
    spAttack: 100,
    spDefense: 100,
    speed: options.speed ?? GEN6_DEFAULT_SPEED,
  };
  pokemon.moves = (options.moveIds ?? [GEN6_MOVE_IDS.tackle]).map((moveId) => {
    const move = gen6DataManager.getMove(moveId);
    return createMoveSlot(move.id, move.pp);
  });
  if (options.abilityOverride != null) {
    pokemon.ability = options.abilityOverride;
  }
  if (options.primaryStatus !== undefined) {
    pokemon.status = options.primaryStatus;
  }

  return pokemon;
}

function createCanonicalGen6ActivePokemon(
  speciesId: number,
  options: {
    abilityOverride?: string;
    currentHp?: number;
    moveIds?: readonly string[];
    primaryStatus?: PrimaryStatus | null;
    seedOffset?: number;
    speed?: number;
  } = {},
): ActivePokemon {
  const pokemon = createCanonicalGen6PokemonInstance(speciesId, options);
  const species = gen6DataManager.getSpecies(speciesId);
  return createOnFieldPokemon(pokemon, 0, [...species.types]);
}

// ---------------------------------------------------------------------------
// Issue #625: Prankster and Gale Wings +1 priority in resolveTurnOrder
// ---------------------------------------------------------------------------

describe("Gen6Ruleset.resolveTurnOrder -- Prankster priority boost (#625)", () => {
  const ruleset = new Gen6Ruleset();

  it(
    "given Prankster user with a status move vs opponent with a damage move at same base priority, " +
      "when resolveTurnOrder is called, then Prankster user moves first due to +1 priority",
    () => {
      // Source: Showdown data/abilities.ts -- Prankster onModifyPriority:
      //   gives +1 priority to status moves
      // Both moves have base priority 0. Prankster boosts will-o-wisp to priority 1.
      // Prankster user should always go first regardless of speed.

      const pranksterUser = createCanonicalGen6ActivePokemon(GEN6_SPECIES_IDS.pikachu, {
        abilityOverride: GEN6_ABILITY_IDS.prankster,
        moveIds: [GEN6_MOVE_IDS.willOWisp],
        speed: 50,
      });
      const opponent = createCanonicalGen6ActivePokemon(GEN6_SPECIES_IDS.pikachu, {
        moveIds: [GEN6_MOVE_IDS.tackle],
        speed: 200,
      });

      const state = buildBattleState(
        buildBattleSide(0, pranksterUser),
        buildBattleSide(1, opponent),
      );

      const actions: BattleAction[] = [
        { type: "move", side: 0, moveIndex: 0, target: 1 },
        { type: "move", side: 1, moveIndex: 0, target: 0 },
      ];

      const ordered = ruleset.resolveTurnOrder(actions, state, new SeededRandom(0));

      expect(ordered[0].type).toBe("move");
      expect((ordered[0] as { side: number }).side).toBe(0);
    },
  );

  it(
    "given Prankster user with a damage move (physical), when resolveTurnOrder is called, " +
      "then priority is NOT boosted (Prankster only affects status moves)",
    () => {
      // Source: Showdown data/abilities.ts -- Prankster only for status moves
      // Both use physical moves at priority 0; faster Pokemon should go first.

      const pranksterUser = createCanonicalGen6ActivePokemon(GEN6_SPECIES_IDS.pikachu, {
        abilityOverride: GEN6_ABILITY_IDS.prankster,
        moveIds: [GEN6_MOVE_IDS.tackle],
        speed: 50,
      });
      const opponent = createCanonicalGen6ActivePokemon(GEN6_SPECIES_IDS.pikachu, {
        moveIds: [GEN6_MOVE_IDS.tackle],
        speed: 200,
      });

      const state = buildBattleState(
        buildBattleSide(0, pranksterUser),
        buildBattleSide(1, opponent),
      );

      const actions: BattleAction[] = [
        { type: "move", side: 0, moveIndex: 0, target: 1 },
        { type: "move", side: 1, moveIndex: 0, target: 0 },
      ];

      const ordered = ruleset.resolveTurnOrder(actions, state, new SeededRandom(0));

      expect(ordered[0].type).toBe("move");
      expect((ordered[0] as { side: number }).side).toBe(1);
    },
  );
});

describe("Gen6Ruleset.resolveTurnOrder -- Gale Wings priority boost (#625)", () => {
  const ruleset = new Gen6Ruleset();

  it(
    "given Gale Wings user with a Flying-type move vs opponent at same base priority, " +
      "when resolveTurnOrder is called, then Gale Wings user moves first due to +1 priority",
    () => {
      // Source: Bulbapedia "Gale Wings" Gen 6 -- "+1 priority to Flying-type moves"
      // Source: Showdown data/mods/gen6/abilities.ts -- galeWings has no HP check
      // Brave Bird has base priority 0; Gale Wings boosts it to +1.

      const galeWingsUser = createCanonicalGen6ActivePokemon(GEN6_SPECIES_IDS.fletchling, {
        abilityOverride: GEN6_ABILITY_IDS.galeWings,
        moveIds: [GEN6_MOVE_IDS.braveBird],
        speed: 50,
      });
      const opponent = createCanonicalGen6ActivePokemon(GEN6_SPECIES_IDS.pikachu, {
        moveIds: [GEN6_MOVE_IDS.tackle],
        speed: 200,
      });

      const state = buildBattleState(
        buildBattleSide(0, galeWingsUser),
        buildBattleSide(1, opponent),
      );

      const actions: BattleAction[] = [
        { type: "move", side: 0, moveIndex: 0, target: 1 },
        { type: "move", side: 1, moveIndex: 0, target: 0 },
      ];

      const ordered = ruleset.resolveTurnOrder(actions, state, new SeededRandom(0));

      expect(ordered[0].type).toBe("move");
      expect((ordered[0] as { side: number }).side).toBe(0);
    },
  );

  it(
    "given Gale Wings user with a non-Flying move, when resolveTurnOrder is called, " +
      "then priority is NOT boosted",
    () => {
      // Source: Bulbapedia "Gale Wings" -- only Flying-type moves get priority boost
      // Tackle is Normal-type; Gale Wings should not boost it.

      const galeWingsUser = createCanonicalGen6ActivePokemon(GEN6_SPECIES_IDS.fletchling, {
        abilityOverride: GEN6_ABILITY_IDS.galeWings,
        moveIds: [GEN6_MOVE_IDS.tackle],
        speed: 50,
      });
      const opponent = createCanonicalGen6ActivePokemon(GEN6_SPECIES_IDS.pikachu, {
        moveIds: [GEN6_MOVE_IDS.tackle],
        speed: 200,
      });

      const state = buildBattleState(
        buildBattleSide(0, galeWingsUser),
        buildBattleSide(1, opponent),
      );

      const actions: BattleAction[] = [
        { type: "move", side: 0, moveIndex: 0, target: 1 },
        { type: "move", side: 1, moveIndex: 0, target: 0 },
      ];

      const ordered = ruleset.resolveTurnOrder(actions, state, new SeededRandom(0));

      expect(ordered[0].type).toBe("move");
      expect((ordered[0] as { side: number }).side).toBe(1);
    },
  );
});
