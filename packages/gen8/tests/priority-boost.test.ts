import type { ActivePokemon, BattleAction, BattleSide, BattleState } from "@pokemon-lib-ts/battle";
import type { PokemonType, SeededRandom } from "@pokemon-lib-ts/core";
import { createOnFieldPokemon as createBattleOnFieldPokemon } from "@pokemon-lib-ts/battle/utils";
import {
  CORE_ABILITY_IDS,
  CORE_ABILITY_SLOTS,
  CORE_GENDERS,
  CORE_ITEM_IDS,
  CORE_MOVE_IDS,
  CORE_TYPE_IDS,
  createEvs,
  createIvs,
  createMoveSlot,
  createPokemonInstance,
} from "@pokemon-lib-ts/core";
import { describe, expect, it } from "vitest";
import {
  createGen8DataManager,
  GEN8_ABILITY_IDS,
  GEN8_MOVE_IDS,
  GEN8_NATURE_IDS,
  GEN8_SPECIES_IDS,
} from "../src";
import { Gen8Ruleset } from "../src/Gen8Ruleset";

/**
 * Tests for issue #783: Prankster/Gale Wings/Triage priority boost
 * in Gen 8 resolveTurnOrder (inherited from BaseRuleset).
 *
 * Gen 8 inherits resolveTurnOrder from BaseRuleset. Before this fix,
 * ability-based priority boosts were never applied to turn ordering.
 *
 * Source: Showdown sim/battle.ts -- getActionSpeed computes effective priority
 *   including ability boosts via onModifyPriority
 */

// ---------------------------------------------------------------------------
// Test helpers
// ---------------------------------------------------------------------------

const dataManager = createGen8DataManager()
const abilityIds = { ...CORE_ABILITY_IDS, ...GEN8_ABILITY_IDS } as const
const itemIds = CORE_ITEM_IDS
const moveIds = { ...CORE_MOVE_IDS, ...GEN8_MOVE_IDS } as const
const natureIds = GEN8_NATURE_IDS
const speciesIds = GEN8_SPECIES_IDS
const typeIds = CORE_TYPE_IDS
const defaultSpecies = dataManager.getSpecies(speciesIds.pikachu)
const defaultNature = dataManager.getNature(natureIds.hardy).id
const defaultTackle = dataManager.getMove(moveIds.tackle)

function createCanonicalMoveSlot(moveId: (typeof moveIds)[keyof typeof moveIds]) {
  const move = dataManager.getMove(moveId)
  return createMoveSlot(move.id, move.pp)
}

function createScenarioMoveSlot(
  moveId: (typeof moveIds)[keyof typeof moveIds],
  currentPP?: number,
) {
  const canonicalSlot = createCanonicalMoveSlot(moveId)
  return {
    ...canonicalSlot,
    currentPP: currentPP ?? canonicalSlot.currentPP,
  }
}

function createOnFieldPokemon(
  overrides: {
    speed?: number;
    ability?: string | null;
    status?: string | null;
    heldItem?: string | null;
    speedStage?: number;
    moves?: Array<ReturnType<typeof createScenarioMoveSlot>>;
    types?: PokemonType[];
    currentHp?: number;
    maxHp?: number;
  } = {},
): ActivePokemon {
  const maxHp = overrides.maxHp ?? 200
  const pokemon = createPokemonInstance(defaultSpecies, 50, makeRng(), {
    nature: defaultNature,
    ivs: createIvs(),
    evs: createEvs(),
    abilitySlot: CORE_ABILITY_SLOTS.normal1,
    gender: CORE_GENDERS.male,
    isShiny: false,
    moves: [defaultTackle.id],
    heldItem: overrides.heldItem ?? null,
    friendship: defaultSpecies.baseFriendship,
    metLocation: "test",
    originalTrainer: "Test",
    originalTrainerId: 0,
    pokeball: itemIds.pokeBall,
  })

  pokemon.moves =
    overrides.moves?.map((move) =>
      createMoveSlot(
        move.moveId,
        move.maxPP,
        move.maxPP > move.currentPP ? Math.round((move.maxPP / move.currentPP - 1) / 0.2) : 0,
      ),
    ) ?? [createCanonicalMoveSlot(moveIds.tackle)]
  if (overrides.moves) {
    pokemon.moves = overrides.moves.map((move) => ({
      moveId: move.moveId,
      currentPP: move.currentPP,
      maxPP: move.maxPP,
      ppUps: 0,
    }))
  }
  pokemon.ability = overrides.ability ?? CORE_ABILITY_IDS.none
  pokemon.currentHp = overrides.currentHp ?? maxHp
  pokemon.status = overrides.status ?? null
  pokemon.heldItem = overrides.heldItem ?? null
  pokemon.calculatedStats = {
    hp: maxHp,
    speed: overrides.speed ?? 100,
    attack: 100,
    defense: 100,
    spAttack: 100,
    spDefense: 100,
  }

  const active = createBattleOnFieldPokemon(
    pokemon,
    0,
    overrides.types ?? [...(defaultSpecies.types as PokemonType[])],
  )
  active.ability = overrides.ability ?? CORE_ABILITY_IDS.none
  active.statStages.speed = overrides.speedStage ?? 0
  return active
}

function createBattleSide(index: 0 | 1, active: ActivePokemon[] = []): BattleSide {
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
    generation: 8,
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

function makeRng(nextVal = 0.5): SeededRandom {
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

describe("Gen8Ruleset.resolveTurnOrder -- Prankster priority boost (#783)", () => {
  const ruleset = new Gen8Ruleset();

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
        moves: [createScenarioMoveSlot(moveIds.willOWisp)],
      });
      const opponent = createOnFieldPokemon({
        speed: 200, // Faster, but lower priority
        moves: [createScenarioMoveSlot(moveIds.tackle)],
      });

      const sideA = createBattleSide(0, [pranksterUser]);
      const sideB = createBattleSide(1, [opponent]);
      const state = createBattleState(sideA, sideB);

      const actions: BattleAction[] = [
        { type: "move", side: 0, moveIndex: 0, target: 1 },
        { type: "move", side: 1, moveIndex: 0, target: 0 },
      ];

      const ordered = ruleset.resolveTurnOrder(actions, state, makeRng());

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
        moves: [createScenarioMoveSlot(moveIds.tackle)],
      });
      const opponent = createOnFieldPokemon({
        speed: 200, // Faster
        moves: [createScenarioMoveSlot(moveIds.tackle)],
      });

      const sideA = createBattleSide(0, [pranksterUser]);
      const sideB = createBattleSide(1, [opponent]);
      const state = createBattleState(sideA, sideB);

      const actions: BattleAction[] = [
        { type: "move", side: 0, moveIndex: 0, target: 1 },
        { type: "move", side: 1, moveIndex: 0, target: 0 },
      ];

      const ordered = ruleset.resolveTurnOrder(actions, state, makeRng());

      // Opponent (side 1) should go first since Prankster doesn't boost physical
      expect(ordered[0].type).toBe("move");
      expect((ordered[0] as { side: number }).side).toBe(1);
    },
  );
});

// ---------------------------------------------------------------------------
// Gale Wings priority boost (#783)
// ---------------------------------------------------------------------------

describe("Gen8Ruleset.resolveTurnOrder -- Gale Wings priority boost (#783)", () => {
  const ruleset = new Gen8Ruleset();

  it(
    "given Gale Wings user at full HP with a Flying-type move vs faster opponent, " +
      "when resolving turn order, then Gale Wings user moves first due to +1 priority",
    () => {
      // Source: Showdown data/abilities.ts -- Gale Wings: +1 to Flying moves at full HP (Gen 7+)
      // Brave Bird has base priority 0; Gale Wings boosts it to +1.

      const galeWingsUser = createOnFieldPokemon({
        ability: abilityIds.galeWings,
        speed: 50, // Slower to prove priority beats speed
        moves: [createScenarioMoveSlot(moveIds.braveBird)],
        types: [typeIds.normal, typeIds.flying],
        currentHp: 200,
        maxHp: 200,
      });
      const opponent = createOnFieldPokemon({
        speed: 200, // Faster, but lower priority
        moves: [createScenarioMoveSlot(moveIds.tackle)],
      });

      const sideA = createBattleSide(0, [galeWingsUser]);
      const sideB = createBattleSide(1, [opponent]);
      const state = createBattleState(sideA, sideB);

      const actions: BattleAction[] = [
        { type: "move", side: 0, moveIndex: 0, target: 1 },
        { type: "move", side: 1, moveIndex: 0, target: 0 },
      ];

      const ordered = ruleset.resolveTurnOrder(actions, state, makeRng());

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
        ability: abilityIds.galeWings,
        speed: 50, // Slower
        moves: [createScenarioMoveSlot(moveIds.braveBird)],
        types: [typeIds.normal, typeIds.flying],
        currentHp: 150, // Not at full HP
        maxHp: 200,
      });
      const opponent = createOnFieldPokemon({
        speed: 200, // Faster
        moves: [createScenarioMoveSlot(moveIds.tackle)],
      });

      const sideA = createBattleSide(0, [galeWingsUser]);
      const sideB = createBattleSide(1, [opponent]);
      const state = createBattleState(sideA, sideB);

      const actions: BattleAction[] = [
        { type: "move", side: 0, moveIndex: 0, target: 1 },
        { type: "move", side: 1, moveIndex: 0, target: 0 },
      ];

      const ordered = ruleset.resolveTurnOrder(actions, state, makeRng());

      // Opponent (side 1) should go first since Gale Wings is inactive
      expect(ordered[0].type).toBe("move");
      expect((ordered[0] as { side: number }).side).toBe(1);
    },
  );
});

// ---------------------------------------------------------------------------
// Triage priority boost (#783)
// ---------------------------------------------------------------------------

describe("Gen8Ruleset.resolveTurnOrder -- Triage priority boost (#783)", () => {
  const ruleset = new Gen8Ruleset();

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
        moves: [createScenarioMoveSlot(moveIds.drainPunch)],
      });
      const opponent = createOnFieldPokemon({
        speed: 200, // Faster, but Quick Attack only has +1 priority
        moves: [createScenarioMoveSlot(moveIds.quickAttack)],
      });

      const sideA = createBattleSide(0, [triageUser]);
      const sideB = createBattleSide(1, [opponent]);
      const state = createBattleState(sideA, sideB);

      const actions: BattleAction[] = [
        { type: "move", side: 0, moveIndex: 0, target: 1 },
        { type: "move", side: 1, moveIndex: 0, target: 0 },
      ];

      const ordered = ruleset.resolveTurnOrder(actions, state, makeRng());

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
        moves: [createScenarioMoveSlot(moveIds.tackle)],
      });
      const opponent = createOnFieldPokemon({
        speed: 200, // Faster
        moves: [createScenarioMoveSlot(moveIds.tackle)],
      });

      const sideA = createBattleSide(0, [triageUser]);
      const sideB = createBattleSide(1, [opponent]);
      const state = createBattleState(sideA, sideB);

      const actions: BattleAction[] = [
        { type: "move", side: 0, moveIndex: 0, target: 1 },
        { type: "move", side: 1, moveIndex: 0, target: 0 },
      ];

      const ordered = ruleset.resolveTurnOrder(actions, state, makeRng());

      // Opponent (side 1) should go first since Triage doesn't boost non-healing
      expect(ordered[0].type).toBe("move");
      expect((ordered[0] as { side: number }).side).toBe(1);
    },
  );
});
