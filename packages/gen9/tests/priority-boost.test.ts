import type { ActivePokemon, BattleAction, BattleSide, BattleState } from "@pokemon-lib-ts/battle";
import { createOnFieldPokemon as createBattleOnFieldPokemon } from "@pokemon-lib-ts/battle/utils";
import type { PokemonType, SeededRandom } from "@pokemon-lib-ts/core";
import {
  CORE_ABILITY_IDS,
  CORE_ABILITY_SLOTS,
  CORE_GENDERS,
  CORE_ITEM_IDS,
  CORE_TYPE_IDS,
  createEvs,
  createIvs,
  createMoveSlot,
  createPokemonInstance,
} from "@pokemon-lib-ts/core";
import { describe, expect, it } from "vitest";
import {
  createGen9DataManager,
  GEN9_ABILITY_IDS,
  GEN9_MOVE_IDS,
  GEN9_NATURE_IDS,
  GEN9_SPECIES_IDS,
} from "../src";
import { Gen9Ruleset } from "../src/Gen9Ruleset";

/**
 * Tests for issue #783: Prankster/Gale Wings/Triage priority boost
 * in Gen 9 resolveTurnOrder (inherited from BaseRuleset).
 *
 * Gen 9 inherits resolveTurnOrder from BaseRuleset. Before this fix,
 * ability-based priority boosts were never applied to turn ordering.
 * Additionally, Gen 9's ability dispatcher was missing the on-priority-check
 * routing for carry-forward abilities (Prankster, Gale Wings, Triage).
 *
 * Source: Showdown sim/battle.ts -- getActionSpeed computes effective priority
 *   including ability boosts via onModifyPriority
 */

// ---------------------------------------------------------------------------
// Test helpers
// ---------------------------------------------------------------------------

const dataManager = createGen9DataManager();
const abilityIds = { ...CORE_ABILITY_IDS, ...GEN9_ABILITY_IDS } as const;
const itemIds = CORE_ITEM_IDS;
const moveIds = GEN9_MOVE_IDS;
const natureIds = GEN9_NATURE_IDS;
const speciesIds = GEN9_SPECIES_IDS;
const defaultSpecies = dataManager.getSpecies(speciesIds.bulbasaur);
const defaultNature = dataManager.getNature(natureIds.hardy).id;

function createCanonicalMoveSlot(moveId: (typeof moveIds)[keyof typeof moveIds]) {
  const move = dataManager.getMove(moveId);
  return createMoveSlot(move.id, move.pp);
}

function createOnFieldPokemon(
  overrides: {
    speed?: number;
    ability?: string | null;
    status?: string | null;
    heldItem?: string | null;
    speedStage?: number;
    moves?: Array<{ moveId: string; currentPP: number; maxPP: number }>;
    types?: PokemonType[];
    currentHp?: number;
    maxHp?: number;
    speciesId?: number;
  } = {},
): ActivePokemon {
  const maxHp = overrides.maxHp ?? 200;
  const speciesRecord = overrides.speciesId
    ? dataManager.getSpecies(overrides.speciesId)
    : defaultSpecies;
  const pokemon = createPokemonInstance(speciesRecord, 50, createDeterministicRng(), {
    nature: defaultNature,
    ivs: createIvs(),
    evs: createEvs(),
    abilitySlot: CORE_ABILITY_SLOTS.normal1,
    gender: CORE_GENDERS.male,
    isShiny: false,
    moves: [moveIds.tackle],
    heldItem: overrides.heldItem ?? null,
    friendship: speciesRecord.baseFriendship,
    metLocation: "test",
    originalTrainer: "Test",
    originalTrainerId: 0,
    pokeball: itemIds.pokeBall,
  });

  pokemon.moves = overrides.moves ?? [createCanonicalMoveSlot(moveIds.tackle)];
  pokemon.ability = overrides.ability ?? abilityIds.none;
  pokemon.currentHp = overrides.currentHp ?? maxHp;
  pokemon.status = overrides.status ?? null;
  pokemon.heldItem = overrides.heldItem ?? null;
  pokemon.calculatedStats = {
    hp: maxHp,
    speed: overrides.speed ?? 100,
    attack: 100,
    defense: 100,
    spAttack: 100,
    spDefense: 100,
  };

  const active = createBattleOnFieldPokemon(
    pokemon,
    0,
    overrides.types ?? [...(speciesRecord.types as PokemonType[])],
  );
  active.ability = overrides.ability ?? abilityIds.none;
  active.statStages.speed = overrides.speedStage ?? 0;
  return active;
}

function createSide(index: 0 | 1, active: ActivePokemon[] = []): BattleSide {
  return {
    index,
    trainer: null,
    team: [],
    active,
    hazards: [],
    screens: [],
    tailwind: { active: false, turnsLeft: 0 },
    luckyChant: { active: false, turnsLeft: 0 },
    wish: null,
    futureAttack: null,
    faintCount: 0,
    gimmickUsed: false,
  } as unknown as BattleSide;
}

function createBattleState(sideA: BattleSide, sideB: BattleSide): BattleState {
  return {
    phase: "turn-end",
    generation: 9,
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
    rng: {
      next: () => 0.5,
      int: () => 1,
      chance: () => false,
      pick: <T>(arr: readonly T[]) => arr[0] as T,
      shuffle: <T>(arr: T[]) => arr,
      getState: () => 0,
      setState: () => {},
    },
    ended: false,
    winner: null,
  } as unknown as BattleState;
}

function createDeterministicRng(nextVal = 0.5): SeededRandom {
  return {
    next: () => nextVal,
    int: () => 1,
    chance: () => false,
    pick: <T>(arr: readonly T[]) => arr[0] as T,
    shuffle: <T>(arr: T[]) => arr,
    getState: () => 0,
    setState: () => {},
  } as unknown as SeededRandom;
}

// ---------------------------------------------------------------------------
// Prankster priority boost (#783)
// ---------------------------------------------------------------------------

describe("Gen9Ruleset.resolveTurnOrder -- Prankster priority boost (#783)", () => {
  const ruleset = new Gen9Ruleset();

  it(
    "given Prankster user with a status move (priority 0) vs faster opponent using priority-0 attack, " +
      "when resolving turn order, then Prankster user moves first due to +1 priority",
    () => {
      // Source: Showdown data/abilities.ts -- Prankster onModifyPriority:
      //   gives +1 priority to status moves
      // Both moves have base priority 0. Prankster boosts will-o-wisp to priority 1.
      // Prankster user should always go first regardless of speed.

      const pranksterUser = createOnFieldPokemon({
        ability: abilityIds.prankster,
        speed: 50, // Slower to prove priority beats speed
        moves: [createCanonicalMoveSlot(moveIds.willOWisp)],
      });
      const opponent = createOnFieldPokemon({
        speed: 200, // Faster, but lower priority
        moves: [createCanonicalMoveSlot(moveIds.tackle)],
      });

      const sideA = createSide(0, [pranksterUser]);
      const sideB = createSide(1, [opponent]);
      const state = createBattleState(sideA, sideB);

      const actions: BattleAction[] = [
        { type: "move", side: 0, moveIndex: 0, target: 1 },
        { type: "move", side: 1, moveIndex: 0, target: 0 },
      ];

      const ordered = ruleset.resolveTurnOrder(actions, state, createDeterministicRng());

      // Prankster user (side 0) should move first
      expect(ordered[0].type).toBe("move");
      expect((ordered[0] as { side: number }).side).toBe(0);
    },
  );

  it(
    "given Prankster user with a physical move, when resolving turn order, " +
      "then priority is NOT boosted (Prankster only affects status moves)",
    () => {
      // Source: Showdown data/abilities.ts -- Prankster only for status moves
      // Prankster does not boost physical/special moves.
      // Faster opponent should go first.

      const pranksterUser = createOnFieldPokemon({
        ability: abilityIds.prankster,
        speed: 50, // Slower
        moves: [createCanonicalMoveSlot(moveIds.tackle)],
      });
      const opponent = createOnFieldPokemon({
        speed: 200, // Faster
        moves: [createCanonicalMoveSlot(moveIds.tackle)],
      });

      const sideA = createSide(0, [pranksterUser]);
      const sideB = createSide(1, [opponent]);
      const state = createBattleState(sideA, sideB);

      const actions: BattleAction[] = [
        { type: "move", side: 0, moveIndex: 0, target: 1 },
        { type: "move", side: 1, moveIndex: 0, target: 0 },
      ];

      const ordered = ruleset.resolveTurnOrder(actions, state, createDeterministicRng());

      // Opponent (side 1) should go first since Prankster doesn't boost physical
      expect(ordered[0].type).toBe("move");
      expect((ordered[0] as { side: number }).side).toBe(1);
    },
  );

  it(
    "given Prankster user with a status move targeting a Dark-type defender, " +
      "when checking Gen9Ruleset Prankster immunity, then the move is blocked",
    () => {
      // Source: Showdown data/abilities.ts -- prankster: Dark targets block boosted status moves.
      // Source: Bulbapedia "Prankster" Gen 7+ -- status moves fail against Dark-type targets.
      const attacker = createOnFieldPokemon({
        ability: abilityIds.prankster,
        moves: [createCanonicalMoveSlot(moveIds.willOWisp)],
      });
      const defender = createOnFieldPokemon({
        types: [CORE_TYPE_IDS.dark],
      });
      const move = dataManager.getMove(moveIds.willOWisp);
      const result = ruleset.getPreExecutionMoveFailure(
        attacker,
        defender,
        move,
        createBattleState(createSide(0, [attacker]), createSide(1, [defender])),
      );

      expect(result).toEqual({
        reason: "blocked by Dark-type immunity",
      });
    },
  );

  it(
    "given Prankster user with a status move targeting a non-Dark defender, " +
      "when checking Gen9Ruleset Prankster immunity, then the move is allowed",
    () => {
      // Source: Showdown data/abilities.ts -- only Dark-type targets block Prankster-boosted status moves.
      const attacker = createOnFieldPokemon({
        ability: abilityIds.prankster,
        moves: [createCanonicalMoveSlot(moveIds.willOWisp)],
      });
      const defender = createOnFieldPokemon({
        types: [CORE_TYPE_IDS.normal],
      });

      const move = dataManager.getMove(moveIds.willOWisp);
      const result = ruleset.getPreExecutionMoveFailure(
        attacker,
        defender,
        move,
        createBattleState(createSide(0, [attacker]), createSide(1, [defender])),
      );

      expect(result).toBeNull();
    },
  );

  it(
    "given Prankster user with a self-targeting status move and a Dark-type opponent, " +
      "when checking Gen9Ruleset Prankster immunity, then the move is allowed",
    () => {
      // Source: Showdown data/abilities.ts -- Dark immunity only applies to opposing-Pokemon targets.
      const attacker = createOnFieldPokemon({
        ability: abilityIds.prankster,
        moves: [createCanonicalMoveSlot(moveIds.agility)],
      });
      const defender = createOnFieldPokemon({
        types: [CORE_TYPE_IDS.dark],
      });
      const agility = dataManager.getMove(moveIds.agility);

      const result = ruleset.getPreExecutionMoveFailure(
        attacker,
        defender,
        agility,
        createBattleState(createSide(0, [attacker]), createSide(1, [defender])),
      );

      expect(result).toBeNull();
    },
  );
});

// ---------------------------------------------------------------------------
// Gale Wings priority boost (#783)
// ---------------------------------------------------------------------------

describe("Gen9Ruleset.resolveTurnOrder -- Gale Wings priority boost (#783)", () => {
  const ruleset = new Gen9Ruleset();

  it(
    "given Gale Wings user at full HP with a Flying-type move vs faster opponent, " +
      "when resolving turn order, then Gale Wings user moves first due to +1 priority",
    () => {
      // Source: Showdown data/abilities.ts -- Gale Wings: +1 to Flying moves at full HP (Gen 7+)
      // Brave Bird has base priority 0; Gale Wings boosts it to +1.

      const galeWingsUser = createOnFieldPokemon({
        speciesId: speciesIds.charizard,
        ability: abilityIds.galeWings,
        speed: 50, // Slower to prove priority beats speed
        moves: [createCanonicalMoveSlot(moveIds.braveBird)],
        currentHp: 200,
        maxHp: 200,
      });
      const opponent = createOnFieldPokemon({
        speed: 200, // Faster, but lower priority
        moves: [createCanonicalMoveSlot(moveIds.tackle)],
      });

      const sideA = createSide(0, [galeWingsUser]);
      const sideB = createSide(1, [opponent]);
      const state = createBattleState(sideA, sideB);

      const actions: BattleAction[] = [
        { type: "move", side: 0, moveIndex: 0, target: 1 },
        { type: "move", side: 1, moveIndex: 0, target: 0 },
      ];

      const ordered = ruleset.resolveTurnOrder(actions, state, createDeterministicRng());

      // Gale Wings user (side 0) should move first
      expect(ordered[0].type).toBe("move");
      expect((ordered[0] as { side: number }).side).toBe(0);
    },
  );

  it(
    "given Gale Wings user NOT at full HP with a Flying-type move, " +
      "when resolving turn order, then priority is NOT boosted (Gen 7+ HP restriction)",
    () => {
      // Source: Showdown data/abilities.ts -- Gale Wings: requires pokemon.hp === pokemon.maxhp
      // In Gen 7+, Gale Wings only works at full HP.

      const galeWingsUser = createOnFieldPokemon({
        speciesId: speciesIds.charizard,
        ability: abilityIds.galeWings,
        speed: 50, // Slower
        moves: [createCanonicalMoveSlot(moveIds.braveBird)],
        currentHp: 150, // Not at full HP
        maxHp: 200,
      });
      const opponent = createOnFieldPokemon({
        speed: 200, // Faster
        moves: [createCanonicalMoveSlot(moveIds.tackle)],
      });

      const sideA = createSide(0, [galeWingsUser]);
      const sideB = createSide(1, [opponent]);
      const state = createBattleState(sideA, sideB);

      const actions: BattleAction[] = [
        { type: "move", side: 0, moveIndex: 0, target: 1 },
        { type: "move", side: 1, moveIndex: 0, target: 0 },
      ];

      const ordered = ruleset.resolveTurnOrder(actions, state, createDeterministicRng());

      // Opponent (side 1) should go first since Gale Wings is inactive
      expect(ordered[0].type).toBe("move");
      expect((ordered[0] as { side: number }).side).toBe(1);
    },
  );
});

// ---------------------------------------------------------------------------
// Triage priority boost (#783)
// ---------------------------------------------------------------------------

describe("Gen9Ruleset.resolveTurnOrder -- Triage priority boost (#783)", () => {
  const ruleset = new Gen9Ruleset();

  it(
    "given Triage user with a healing move (Drain Punch) vs opponent with Quick Attack (+1), " +
      "when resolving turn order, then Triage user moves first due to +3 priority beating +1",
    () => {
      // Source: Showdown data/abilities.ts -- triage: onModifyPriority +3 for heal moves
      // Drain Punch has base priority 0; Triage boosts it to priority 3.
      // Quick Attack has base priority 1.
      // Triage user should go first (3 > 1).

      const triageUser = createOnFieldPokemon({
        ability: abilityIds.triage,
        speed: 50, // Slower to prove priority beats speed
        moves: [createCanonicalMoveSlot(moveIds.drainPunch)],
      });
      const opponent = createOnFieldPokemon({
        speed: 200, // Faster, but Quick Attack only has +1 priority
        moves: [createCanonicalMoveSlot(moveIds.quickAttack)],
      });

      const sideA = createSide(0, [triageUser]);
      const sideB = createSide(1, [opponent]);
      const state = createBattleState(sideA, sideB);

      const actions: BattleAction[] = [
        { type: "move", side: 0, moveIndex: 0, target: 1 },
        { type: "move", side: 1, moveIndex: 0, target: 0 },
      ];

      const ordered = ruleset.resolveTurnOrder(actions, state, createDeterministicRng());

      // Triage user (side 0) should move first (priority 3 > 1)
      expect(ordered[0].type).toBe("move");
      expect((ordered[0] as { side: number }).side).toBe(0);
    },
  );

  it(
    "given Triage user with a non-healing physical move, when resolving turn order, " +
      "then priority is NOT boosted (Triage only affects healing moves)",
    () => {
      // Source: Showdown data/abilities.ts -- Triage only for move.flags.heal
      // Tackle is not a healing move; Triage should not boost it.

      const triageUser = createOnFieldPokemon({
        ability: abilityIds.triage,
        speed: 50, // Slower
        moves: [createCanonicalMoveSlot(moveIds.tackle)],
      });
      const opponent = createOnFieldPokemon({
        speed: 200, // Faster
        moves: [createCanonicalMoveSlot(moveIds.tackle)],
      });

      const sideA = createSide(0, [triageUser]);
      const sideB = createSide(1, [opponent]);
      const state = createBattleState(sideA, sideB);

      const actions: BattleAction[] = [
        { type: "move", side: 0, moveIndex: 0, target: 1 },
        { type: "move", side: 1, moveIndex: 0, target: 0 },
      ];

      const ordered = ruleset.resolveTurnOrder(actions, state, createDeterministicRng());

      // Opponent (side 1) should go first since Triage doesn't boost non-healing
      expect(ordered[0].type).toBe("move");
      expect((ordered[0] as { side: number }).side).toBe(1);
    },
  );
});
