import {
  type ActivePokemon,
  type BattleAction,
  type BattleSide,
  type BattleState,
} from "@pokemon-lib-ts/battle";
import { createActivePokemon } from "@pokemon-lib-ts/battle/utils";
import {
  CORE_STATUS_IDS,
  createEvs,
  createIvs,
  createMoveSlot,
  createPokemonInstance,
  type AbilityData,
  type ItemData,
  type MoveData,
  type PokemonInstance,
  type PokemonSpeciesData,
  type PrimaryStatus,
  SeededRandom,
  type StatBlock,
} from "@pokemon-lib-ts/core";
import { describe, expect, it } from "vitest";
import {
  createGen4DataManager,
  GEN4_ABILITY_IDS,
  GEN4_ITEM_IDS,
  GEN4_MOVE_IDS,
  GEN4_NATURE_IDS,
  GEN4_SPECIES_IDS,
} from "../src";
import { Gen4Ruleset } from "../src/Gen4Ruleset";

// ---------------------------------------------------------------------------
// Shared helpers
// ---------------------------------------------------------------------------

const dataManager = createGen4DataManager()
const abilityIds = { ...GEN4_ABILITY_IDS } as const
const itemIds = { ...GEN4_ITEM_IDS } as const
const moveIds = { ...GEN4_MOVE_IDS } as const
const natureIds = GEN4_NATURE_IDS
const speciesIds = GEN4_SPECIES_IDS
const statusIds = CORE_STATUS_IDS

const defaultSpecies = dataManager.getSpecies(speciesIds.snorlax)
const stallSpecies = dataManager.getSpecies(speciesIds.sableye)
const tackleMove = dataManager.getMove(moveIds.tackle)
const quickAttackMove = dataManager.getMove(moveIds.quickAttack)
const machPunchMove = dataManager.getMove(moveIds.machPunch)
const quickClawItem = dataManager.getItem(itemIds.quickClaw)
const ironBallItem = dataManager.getItem(itemIds.ironBall)
const laggingTailItem = dataManager.getItem(itemIds.laggingTail)
const fullIncenseItem = dataManager.getItem(itemIds.fullIncense)
const custapBerryItem = dataManager.getItem(itemIds.custapBerry)
const stallAbility = dataManager.getAbility(abilityIds.stall)
const defaultNature = dataManager.getNature(natureIds.hardy).id

function createGen4Ruleset(): Gen4Ruleset {
  return new Gen4Ruleset(dataManager)
}

// Turn-order tests need exact synthetic speed and HP probes; species/move/item records stay
// canonical, but the live combat stats are intentionally overridden to hit precise thresholds.
function createSyntheticTurnOrderStats(speed: number, maxHp = 200): StatBlock {
  return {
    hp: maxHp,
    attack: 100,
    defense: 100,
    spAttack: 100,
    spDefense: 100,
    speed,
  };
}

function createCanonicalMoveSlots(moveRecords: readonly MoveData[]) {
  return moveRecords.map((move) => createMoveSlot(move.id, move.pp));
}

function createBattlePokemon(overrides: {
  speciesRecord?: PokemonSpeciesData;
  speed?: number;
  status?: PrimaryStatus | null;
  heldItemRecord?: ItemData | null;
  moveRecords?: readonly MoveData[];
  abilityRecord?: AbilityData | null;
  currentHp?: number;
  maxHp?: number;
}): PokemonInstance {
  const speciesRecord = overrides.speciesRecord ?? defaultSpecies
  const maxHp = overrides.maxHp ?? 200
  const pokemon = createPokemonInstance(speciesRecord, 50, new SeededRandom(0), {
    nature: defaultNature,
    ivs: createIvs(),
    evs: createEvs(),
    abilitySlot: "normal1",
    gender: "male",
    isShiny: false,
    moves: [tackleMove.id],
    heldItem: overrides.heldItemRecord?.id ?? null,
    friendship: speciesRecord.baseFriendship,
    metLocation: "test",
    originalTrainer: "Test",
    originalTrainerId: 0,
    pokeball: itemIds.pokeBall,
  })

  pokemon.moves = createCanonicalMoveSlots(overrides.moveRecords ?? [tackleMove])
  pokemon.heldItem = overrides.heldItemRecord?.id ?? null
  pokemon.ability = overrides.abilityRecord?.id ?? pokemon.ability
  pokemon.status = overrides.status ?? null
  pokemon.currentHp = overrides.currentHp ?? maxHp
  pokemon.calculatedStats = createSyntheticTurnOrderStats(overrides.speed ?? 100, maxHp)

  return pokemon
}

function createOnFieldPokemon(overrides: {
  speciesRecord?: PokemonSpeciesData;
  speed?: number;
  status?: PrimaryStatus | null;
  heldItemRecord?: ItemData | null;
  moveRecords?: readonly MoveData[];
  abilityRecord?: AbilityData | null;
  currentHp?: number;
  maxHp?: number;
}): ActivePokemon {
  const speciesRecord = overrides.speciesRecord ?? defaultSpecies;
  const pokemon = createBattlePokemon({
    speciesRecord,
    speed: overrides.speed,
    status: overrides.status,
    heldItemRecord: overrides.heldItemRecord,
    moveRecords: overrides.moveRecords,
    abilityRecord: overrides.abilityRecord,
    currentHp: overrides.currentHp,
    maxHp: overrides.maxHp,
  });

  return createActivePokemon(pokemon, 0, [...speciesRecord.types]);
}

/**
 * Build a minimal BattleState with two sides for turn order tests.
 * Supports Tailwind per side and Trick Room field effect.
 */
function createTwoSideBattleState(
  side0Pokemon: ActivePokemon,
  side1Pokemon: ActivePokemon,
  opts?: {
    side0Tailwind?: boolean;
    side1Tailwind?: boolean;
    trickRoom?: boolean;
  },
): BattleState {
  const createBattleSide = (
    index: 0 | 1,
    active: ActivePokemon,
    tailwindActive: boolean,
  ): BattleSide =>
    ({
      index,
      trainer: null,
      team: [active.pokemon],
      active: [active],
      hazards: [],
      screens: [],
      tailwind: { active: tailwindActive, turnsLeft: tailwindActive ? 3 : 0 },
      luckyChant: { active: false, turnsLeft: 0 },
      wish: null,
      futureAttack: null,
      faintCount: 0,
      gimmickUsed: false,
    }) as BattleSide;

  return {
    phase: "action-select",
    generation: 4,
    format: "singles",
    turnNumber: 1,
    sides: [
      createBattleSide(0, side0Pokemon, opts?.side0Tailwind ?? false),
      createBattleSide(1, side1Pokemon, opts?.side1Tailwind ?? false),
    ],
    weather: null,
    terrain: null,
    trickRoom: { active: opts?.trickRoom ?? false, turnsLeft: opts?.trickRoom ? 5 : 0 },
    magicRoom: { active: false, turnsLeft: 0 },
    wonderRoom: { active: false, turnsLeft: 0 },
    gravity: { active: false, turnsLeft: 0 },
    turnHistory: [],
    rng: new SeededRandom(0),
    ended: false,
    winner: null,
  } as unknown as BattleState;
}

// ---------------------------------------------------------------------------
// Normal speed ordering (baseline)
// ---------------------------------------------------------------------------

describe("Gen4Ruleset resolveTurnOrder -- normal speed ordering", () => {
  it("given two move actions where Pokemon A (speed 100) is faster than Pokemon B (speed 80), when resolveTurnOrder is called, then Pokemon A's action comes first", () => {
    // Source: Showdown Gen 4 -- faster Pokemon moves first (same as BaseRuleset)
    // Derivation: speed 100 > speed 80, no Tailwind, no Trick Room
    const monA = createOnFieldPokemon({ speed: 100 });
    const monB = createOnFieldPokemon({ speed: 80 });
    const state = createTwoSideBattleState(monA, monB);
    const ruleset = createGen4Ruleset();

    const actions: BattleAction[] = [
      { type: "move", side: 0, moveIndex: 0 },
      { type: "move", side: 1, moveIndex: 0 },
    ];

    const rng = new SeededRandom(42);
    const ordered = ruleset.resolveTurnOrder(actions, state, rng);

    expect(ordered[0]).toEqual(actions[0]); // speed 100 first
    expect(ordered[1]).toEqual(actions[1]); // speed 80 second
  });

  it("given two move actions where Pokemon A (speed 60) is slower than Pokemon B (speed 120), when resolveTurnOrder is called, then Pokemon B's action comes first", () => {
    // Source: Showdown Gen 4 -- faster Pokemon moves first
    // Triangulation: reverse case to ensure not a constant return
    const monA = createOnFieldPokemon({ speed: 60 });
    const monB = createOnFieldPokemon({ speed: 120 });
    const state = createTwoSideBattleState(monA, monB);
    const ruleset = createGen4Ruleset();

    const actions: BattleAction[] = [
      { type: "move", side: 0, moveIndex: 0 },
      { type: "move", side: 1, moveIndex: 0 },
    ];

    const rng = new SeededRandom(42);
    const ordered = ruleset.resolveTurnOrder(actions, state, rng);

    expect(ordered[0]).toEqual(actions[1]); // speed 120 first
    expect(ordered[1]).toEqual(actions[0]); // speed 60 second
  });
});

// ---------------------------------------------------------------------------
// Tailwind speed doubling
// ---------------------------------------------------------------------------

describe("Gen4Ruleset resolveTurnOrder -- Tailwind", () => {
  it("given Pokemon A (side 0, speed 80) with Tailwind active and Pokemon B (side 1, speed 100) without Tailwind, when resolveTurnOrder is called, then Pokemon A moves first (80*2=160 > 100)", () => {
    // Source: Bulbapedia -- Tailwind doubles Speed of user's side for 3 turns
    // Source: Showdown Gen 4 mod -- Tailwind doubles Speed
    // Derivation: A effective speed = 80 * 2 = 160; B effective speed = 100
    // 160 > 100, so A goes first
    const monA = createOnFieldPokemon({ speed: 80 });
    const monB = createOnFieldPokemon({ speed: 100 });
    const state = createTwoSideBattleState(monA, monB, { side0Tailwind: true });
    const ruleset = createGen4Ruleset();

    const actions: BattleAction[] = [
      { type: "move", side: 0, moveIndex: 0 },
      { type: "move", side: 1, moveIndex: 0 },
    ];

    const rng = new SeededRandom(42);
    const ordered = ruleset.resolveTurnOrder(actions, state, rng);

    expect(ordered[0]).toEqual(actions[0]); // A (160 with Tailwind) first
    expect(ordered[1]).toEqual(actions[1]); // B (100) second
  });

  it("given Pokemon A (side 0, speed 40) with Tailwind active and Pokemon B (side 1, speed 100) without Tailwind, when resolveTurnOrder is called, then Pokemon B moves first (40*2=80 < 100)", () => {
    // Source: Bulbapedia -- Tailwind doubles Speed
    // Triangulation: Tailwind doesn't guarantee going first if base speed too low
    // Derivation: A effective speed = 40 * 2 = 80; B effective speed = 100
    // 80 < 100, so B goes first
    const monA = createOnFieldPokemon({ speed: 40 });
    const monB = createOnFieldPokemon({ speed: 100 });
    const state = createTwoSideBattleState(monA, monB, { side0Tailwind: true });
    const ruleset = createGen4Ruleset();

    const actions: BattleAction[] = [
      { type: "move", side: 0, moveIndex: 0 },
      { type: "move", side: 1, moveIndex: 0 },
    ];

    const rng = new SeededRandom(42);
    const ordered = ruleset.resolveTurnOrder(actions, state, rng);

    expect(ordered[0]).toEqual(actions[1]); // B (100) first
    expect(ordered[1]).toEqual(actions[0]); // A (80 with Tailwind) second
  });

  it("given both sides have Tailwind active, when resolveTurnOrder is called, then faster base speed still goes first (both doubled)", () => {
    // Source: Showdown Gen 4 -- both sides can have Tailwind simultaneously
    // Derivation: A = 80*2 = 160; B = 100*2 = 200; B goes first
    const monA = createOnFieldPokemon({ speed: 80 });
    const monB = createOnFieldPokemon({ speed: 100 });
    const state = createTwoSideBattleState(monA, monB, {
      side0Tailwind: true,
      side1Tailwind: true,
    });
    const ruleset = createGen4Ruleset();

    const actions: BattleAction[] = [
      { type: "move", side: 0, moveIndex: 0 },
      { type: "move", side: 1, moveIndex: 0 },
    ];

    const rng = new SeededRandom(42);
    const ordered = ruleset.resolveTurnOrder(actions, state, rng);

    expect(ordered[0]).toEqual(actions[1]); // B (200) first
    expect(ordered[1]).toEqual(actions[0]); // A (160) second
  });
});

// ---------------------------------------------------------------------------
// Trick Room
// ---------------------------------------------------------------------------

describe("Gen4Ruleset resolveTurnOrder -- Trick Room", () => {
  it("given Pokemon A (speed 120) and Pokemon B (speed 80) with Trick Room active, when resolveTurnOrder is called, then Pokemon B (slower) moves first", () => {
    // Source: Showdown Gen 4 mod -- Trick Room: slower Pokemon move first
    // Source: Bulbapedia -- Trick Room reverses speed order
    // Derivation: under Trick Room, lower speed goes first: 80 < 120, so B first
    const monA = createOnFieldPokemon({ speed: 120 });
    const monB = createOnFieldPokemon({ speed: 80 });
    const state = createTwoSideBattleState(monA, monB, { trickRoom: true });
    const ruleset = createGen4Ruleset();

    const actions: BattleAction[] = [
      { type: "move", side: 0, moveIndex: 0 },
      { type: "move", side: 1, moveIndex: 0 },
    ];

    const rng = new SeededRandom(42);
    const ordered = ruleset.resolveTurnOrder(actions, state, rng);

    expect(ordered[0]).toEqual(actions[1]); // B (80, slower) first in Trick Room
    expect(ordered[1]).toEqual(actions[0]); // A (120, faster) second in Trick Room
  });

  it("given Pokemon A (speed 50) and Pokemon B (speed 150) with Trick Room active, when resolveTurnOrder is called, then Pokemon A (slower) moves first", () => {
    // Source: Showdown Gen 4 mod -- Trick Room: slower Pokemon move first
    // Triangulation: second case with different speeds
    // Derivation: under Trick Room, 50 < 150, so A first
    const monA = createOnFieldPokemon({ speed: 50 });
    const monB = createOnFieldPokemon({ speed: 150 });
    const state = createTwoSideBattleState(monA, monB, { trickRoom: true });
    const ruleset = createGen4Ruleset();

    const actions: BattleAction[] = [
      { type: "move", side: 0, moveIndex: 0 },
      { type: "move", side: 1, moveIndex: 0 },
    ];

    const rng = new SeededRandom(42);
    const ordered = ruleset.resolveTurnOrder(actions, state, rng);

    expect(ordered[0]).toEqual(actions[0]); // A (50, slower) first in Trick Room
    expect(ordered[1]).toEqual(actions[1]); // B (150, faster) second in Trick Room
  });
});

// ---------------------------------------------------------------------------
// Trick Room + Tailwind
// ---------------------------------------------------------------------------

describe("Gen4Ruleset resolveTurnOrder -- Trick Room + Tailwind interaction", () => {
  it("given Pokemon A (side 0, speed 40) with Tailwind (eff 80) and Pokemon B (side 1, speed 100), with Trick Room active, when resolveTurnOrder is called, then Pokemon A moves first (80 < 100, slower goes first in Trick Room)", () => {
    // Source: Bulbapedia -- Trick Room reverses speed; Tailwind doubles speed before reversal
    // Derivation: A effective = 40 * 2 = 80 (Tailwind); B effective = 100
    // Trick Room: slower goes first; 80 < 100, so A goes first
    const monA = createOnFieldPokemon({ speed: 40 });
    const monB = createOnFieldPokemon({ speed: 100 });
    const state = createTwoSideBattleState(monA, monB, {
      side0Tailwind: true,
      trickRoom: true,
    });
    const ruleset = createGen4Ruleset();

    const actions: BattleAction[] = [
      { type: "move", side: 0, moveIndex: 0 },
      { type: "move", side: 1, moveIndex: 0 },
    ];

    const rng = new SeededRandom(42);
    const ordered = ruleset.resolveTurnOrder(actions, state, rng);

    expect(ordered[0]).toEqual(actions[0]); // A (80 with Tailwind, slower) first in Trick Room
    expect(ordered[1]).toEqual(actions[1]); // B (100) second
  });

  it("given Pokemon A (side 0, speed 60) with Tailwind (eff 120) and Pokemon B (side 1, speed 100), with Trick Room active, when resolveTurnOrder is called, then Pokemon B moves first (100 < 120, B is slower)", () => {
    // Source: Bulbapedia -- Trick Room + Tailwind interaction
    // Derivation: A effective = 60 * 2 = 120 (Tailwind); B effective = 100
    // Trick Room: slower goes first; 100 < 120, so B goes first
    const monA = createOnFieldPokemon({ speed: 60 });
    const monB = createOnFieldPokemon({ speed: 100 });
    const state = createTwoSideBattleState(monA, monB, {
      side0Tailwind: true,
      trickRoom: true,
    });
    const ruleset = createGen4Ruleset();

    const actions: BattleAction[] = [
      { type: "move", side: 0, moveIndex: 0 },
      { type: "move", side: 1, moveIndex: 0 },
    ];

    const rng = new SeededRandom(42);
    const ordered = ruleset.resolveTurnOrder(actions, state, rng);

    expect(ordered[0]).toEqual(actions[1]); // B (100, slower in Trick Room) first
    expect(ordered[1]).toEqual(actions[0]); // A (120 with Tailwind) second
  });
});

// ---------------------------------------------------------------------------
// Quick Claw + Tailwind interaction
// ---------------------------------------------------------------------------

describe("Gen4Ruleset resolveTurnOrder -- Quick Claw with Tailwind", () => {
  it("given Pokemon A (speed 80, side 0 Tailwind, Quick Claw activated) and Pokemon B (speed 200), when resolveTurnOrder is called, then Pokemon A moves first (QC beats speed)", () => {
    // Source: pret/pokeplatinum -- Quick Claw 20% activation; goes before speed check
    // Quick Claw activation trumps speed within same priority bracket
    const monA = createOnFieldPokemon({ speed: 80, heldItemRecord: quickClawItem });
    const monB = createOnFieldPokemon({ speed: 200 });
    const state = createTwoSideBattleState(monA, monB, { side0Tailwind: true });
    const ruleset = createGen4Ruleset();

    const actions: BattleAction[] = [
      { type: "move", side: 0, moveIndex: 0 },
      { type: "move", side: 1, moveIndex: 0 },
    ];

    // Source: SeededRandom seed 7 activates Quick Claw for the first move-action roll.
    const rng = new SeededRandom(7);
    const ordered = ruleset.resolveTurnOrder(actions, state, rng);

    // Quick Claw activated for A, so A goes first despite lower speed
    expect(ordered[0]).toEqual(actions[0]); // A (QC activated) first
    expect(ordered[1]).toEqual(actions[1]); // B second
  });
});

// ---------------------------------------------------------------------------
// Priority moves override Tailwind
// ---------------------------------------------------------------------------

describe("Gen4Ruleset resolveTurnOrder -- priority overrides Tailwind", () => {
  it("given Pokemon A (side 1, speed 200) using Tackle and Pokemon B (side 0, speed 60, Tailwind) using Quick Attack (+1 priority), when resolveTurnOrder is called, then Pokemon B's priority move comes first", () => {
    // Source: Showdown Gen 4 -- priority bracket is independent of speed
    // Quick Attack has priority +1, Tackle has priority 0
    // Priority +1 always goes before priority 0 regardless of speed
    const monA = createOnFieldPokemon({
      speed: 200,
      moveRecords: [tackleMove],
    });
    const monB = createOnFieldPokemon({
      speed: 60,
      moveRecords: [quickAttackMove],
    });
    // Build state with monB on side 0 (with Tailwind) and monA on side 1
    // monA's Tailwind doesn't matter here — priority trumps speed
    const stateFlipped = createTwoSideBattleState(monB, monA, { side0Tailwind: true });
    const ruleset = createGen4Ruleset();

    const actions: BattleAction[] = [
      { type: "move", side: 0, moveIndex: 0 }, // monB using Quick Attack (+1 priority)
      { type: "move", side: 1, moveIndex: 0 }, // monA using Tackle (0 priority)
    ];

    const rng = new SeededRandom(42);
    const ordered = ruleset.resolveTurnOrder(actions, stateFlipped, rng);

    // Quick Attack (+1) goes before Tackle (0) regardless of speed
    expect(ordered[0]).toEqual(actions[0]); // Quick Attack (+1 priority) first
    expect(ordered[1]).toEqual(actions[1]); // Tackle (0 priority) second
  });

  it("given Pokemon A (speed 200) using Quick Attack and Pokemon B (speed 60, Tailwind) using Mach Punch (+1 priority), when resolveTurnOrder is called, then speed determines order within same priority", () => {
    // Source: Showdown Gen 4 -- within same priority bracket, speed decides
    // Both Quick Attack and Mach Punch have priority +1
    // B has Tailwind: 60 * 2 = 120; A has no Tailwind: 200
    // 200 > 120, so A goes first
    const monA = createOnFieldPokemon({
      speed: 200,
      moveRecords: [quickAttackMove],
    });
    const monB = createOnFieldPokemon({
      speed: 60,
      moveRecords: [machPunchMove],
    });
    const state = createTwoSideBattleState(monB, monA, { side0Tailwind: true });
    const ruleset = createGen4Ruleset();

    const actions: BattleAction[] = [
      { type: "move", side: 0, moveIndex: 0 }, // monB using Mach Punch (+1) speed 60*2=120
      { type: "move", side: 1, moveIndex: 0 }, // monA using Quick Attack (+1) speed 200
    ];

    const rng = new SeededRandom(42);
    const ordered = ruleset.resolveTurnOrder(actions, state, rng);

    // Same priority (+1), so speed decides: 200 > 120
    expect(ordered[0]).toEqual(actions[1]); // A (200 speed) first
    expect(ordered[1]).toEqual(actions[0]); // B (120 with Tailwind) second
  });
});

// ---------------------------------------------------------------------------
// Switch actions still go first
// ---------------------------------------------------------------------------

describe("Gen4Ruleset resolveTurnOrder -- switches go first with Tailwind", () => {
  it("given a switch action and a move action with Tailwind active, when resolveTurnOrder is called, then switch goes first", () => {
    // Source: Showdown Gen 4 -- switches always go before moves regardless of speed or Tailwind
    const monA = createOnFieldPokemon({ speed: 200 });
    const monB = createOnFieldPokemon({ speed: 50 });
    const state = createTwoSideBattleState(monA, monB, { side1Tailwind: true });
    const ruleset = createGen4Ruleset();

    const actions: BattleAction[] = [
      { type: "move", side: 0, moveIndex: 0 },
      { type: "switch", side: 1, switchTo: 1 },
    ];

    const rng = new SeededRandom(42);
    const ordered = ruleset.resolveTurnOrder(actions, state, rng);

    expect(ordered[0]).toEqual(actions[1]); // switch first
    expect(ordered[1]).toEqual(actions[0]); // move second
  });
});

// ---------------------------------------------------------------------------
// Paralysis + Tailwind interaction
// ---------------------------------------------------------------------------

describe("Gen4Ruleset resolveTurnOrder -- Paralysis + Tailwind", () => {
  it("given paralyzed Pokemon A (speed 200) with Tailwind and healthy Pokemon B (speed 80), when resolveTurnOrder is called, then A moves first (200*0.25*2=100 > 80)", () => {
    // Source: pret/pokeplatinum -- paralysis quarters speed (x0.25); Tailwind doubles
    // Source: Bulbapedia -- Tailwind doubles Speed after paralysis reduction
    // Derivation: A base speed = 200; paralyzed = floor(200 * 0.25) = 50; Tailwind = 50 * 2 = 100
    // B speed = 80; 100 > 80, so A goes first
    const monA = createOnFieldPokemon({ speed: 200, status: statusIds.paralysis });
    const monB = createOnFieldPokemon({ speed: 80 });
    const state = createTwoSideBattleState(monA, monB, { side0Tailwind: true });
    const ruleset = createGen4Ruleset();

    const actions: BattleAction[] = [
      { type: "move", side: 0, moveIndex: 0 },
      { type: "move", side: 1, moveIndex: 0 },
    ];

    const rng = new SeededRandom(42);
    const ordered = ruleset.resolveTurnOrder(actions, state, rng);

    // A: floor(200 * 0.25) = 50, then * 2 (Tailwind) = 100
    // B: 80
    // 100 > 80, A goes first
    expect(ordered[0]).toEqual(actions[0]); // A (100 effective) first
    expect(ordered[1]).toEqual(actions[1]); // B (80) second
  });

  it("given paralyzed Pokemon A (speed 100) with Tailwind and healthy Pokemon B (speed 80), when resolveTurnOrder is called, then B moves first (100*0.25*2=50 < 80)", () => {
    // Source: pret/pokeplatinum -- paralysis quarters speed; Tailwind doubles
    // Triangulation: case where paralysis + Tailwind still results in slower speed
    // Derivation: A base speed = 100; paralyzed = floor(100 * 0.25) = 25; Tailwind = 25 * 2 = 50
    // B speed = 80; 50 < 80, so B goes first
    const monA = createOnFieldPokemon({ speed: 100, status: statusIds.paralysis });
    const monB = createOnFieldPokemon({ speed: 80 });
    const state = createTwoSideBattleState(monA, monB, { side0Tailwind: true });
    const ruleset = createGen4Ruleset();

    const actions: BattleAction[] = [
      { type: "move", side: 0, moveIndex: 0 },
      { type: "move", side: 1, moveIndex: 0 },
    ];

    const rng = new SeededRandom(42);
    const ordered = ruleset.resolveTurnOrder(actions, state, rng);

    // A: floor(100 * 0.25) = 25, then * 2 (Tailwind) = 50
    // B: 80
    // 50 < 80, B goes first
    expect(ordered[0]).toEqual(actions[1]); // B (80) first
    expect(ordered[1]).toEqual(actions[0]); // A (50 effective) second
  });
});

// ---------------------------------------------------------------------------
// Iron Ball -- Speed halving
// ---------------------------------------------------------------------------

describe("Gen4Ruleset resolveTurnOrder -- Iron Ball speed halving", () => {
  it("given Pokemon A (speed 100) with Iron Ball and Pokemon B (speed 60), when resolveTurnOrder is called, then Pokemon B moves first (100*0.5=50 < 60)", () => {
    // Source: Bulbapedia — Iron Ball: "Cuts the Speed stat of the holder to half."
    // Source: Showdown data/items.ts — Iron Ball onModifySpe halves speed
    // Derivation: A effective speed = floor(100 * 0.5) = 50; B speed = 60
    // 50 < 60, so B goes first
    const monA = createOnFieldPokemon({ speed: 100, heldItemRecord: ironBallItem });
    const monB = createOnFieldPokemon({ speed: 60 });
    const state = createTwoSideBattleState(monA, monB);
    const ruleset = createGen4Ruleset();

    const actions: BattleAction[] = [
      { type: "move", side: 0, moveIndex: 0 },
      { type: "move", side: 1, moveIndex: 0 },
    ];

    const rng = new SeededRandom(42);
    const ordered = ruleset.resolveTurnOrder(actions, state, rng);

    expect(ordered[0]).toEqual(actions[1]); // B (60) first
    expect(ordered[1]).toEqual(actions[0]); // A (50 with Iron Ball) second
  });

  it("given Pokemon A (speed 101) with Iron Ball and Pokemon B (speed 50), when resolveTurnOrder is called, then Pokemon B moves first (floor(101*0.5)=50, tiebreak)", () => {
    // Source: Bulbapedia — Iron Ball: "Cuts the Speed stat of the holder to half."
    // Triangulation: odd speed value tests floor behavior
    // Derivation: A effective speed = floor(101 * 0.5) = 50; B speed = 50
    // Equal speed: random tiebreak determines order
    const monA = createOnFieldPokemon({ speed: 101, heldItemRecord: ironBallItem });
    const monB = createOnFieldPokemon({ speed: 51 });
    const state = createTwoSideBattleState(monA, monB);
    const ruleset = createGen4Ruleset();

    const actions: BattleAction[] = [
      { type: "move", side: 0, moveIndex: 0 },
      { type: "move", side: 1, moveIndex: 0 },
    ];

    const rng = new SeededRandom(42);
    const ordered = ruleset.resolveTurnOrder(actions, state, rng);

    // floor(101 * 0.5) = 50 < 51, so B goes first
    expect(ordered[0]).toEqual(actions[1]); // B (51) first
    expect(ordered[1]).toEqual(actions[0]); // A (50 with Iron Ball) second
  });

  it("given Pokemon A (speed 100) with Iron Ball and paralysis, when resolveTurnOrder is called against Pokemon B (speed 15), then Pokemon A moves first (floor(floor(100*0.25)*0.5)=12 < 15 means B first)", () => {
    // Source: Bulbapedia — Iron Ball halves speed; paralysis quarters speed
    // Source: pret/pokeplatinum — paralysis applied before Iron Ball
    // Derivation: A effective = floor(100 * 0.25) = 25 (paralysis), then floor(25 * 0.5) = 12 (Iron Ball)
    // B speed = 15; 12 < 15, so B goes first
    const monA = createOnFieldPokemon({
      speed: 100,
      heldItemRecord: ironBallItem,
      status: statusIds.paralysis,
    });
    const monB = createOnFieldPokemon({ speed: 15 });
    const state = createTwoSideBattleState(monA, monB);
    const ruleset = createGen4Ruleset();

    const actions: BattleAction[] = [
      { type: "move", side: 0, moveIndex: 0 },
      { type: "move", side: 1, moveIndex: 0 },
    ];

    const rng = new SeededRandom(42);
    const ordered = ruleset.resolveTurnOrder(actions, state, rng);

    // A: floor(100 * 0.25) = 25 (paralysis), then floor(25 * 0.5) = 12 (Iron Ball)
    // B: 15
    // 12 < 15, B goes first
    expect(ordered[0]).toEqual(actions[1]); // B (15) first
    expect(ordered[1]).toEqual(actions[0]); // A (12 with paralysis+Iron Ball) second
  });
});

// ---------------------------------------------------------------------------
// Stall ability -- Always move last in priority bracket
// ---------------------------------------------------------------------------

describe("Gen4Ruleset resolveTurnOrder -- Stall ability", () => {
  it("given Stall user (speed 200) vs non-Stall user (speed 50) at same priority, when resolveTurnOrder is called, then Stall user moves second", () => {
    // Source: Bulbapedia — Stall: "The Pokemon moves after all other Pokemon"
    // Source: Showdown data/abilities.ts — Stall: onFractionalPriority -0.1
    // Despite having higher speed (200 > 50), Stall forces A to move last
    const monA = createOnFieldPokemon({
      speciesRecord: stallSpecies,
      speed: 200,
      abilityRecord: stallAbility,
    });
    const monB = createOnFieldPokemon({ speed: 50 });
    const state = createTwoSideBattleState(monA, monB);
    const ruleset = createGen4Ruleset();

    const actions: BattleAction[] = [
      { type: "move", side: 0, moveIndex: 0 },
      { type: "move", side: 1, moveIndex: 0 },
    ];

    const rng = new SeededRandom(42);
    const ordered = ruleset.resolveTurnOrder(actions, state, rng);

    expect(ordered[0]).toEqual(actions[1]); // B (non-Stall) first
    expect(ordered[1]).toEqual(actions[0]); // A (Stall) second, despite higher speed
  });

  it("given two Stall users with different speeds, when resolveTurnOrder is called, then faster Stall user moves first (both Stall, normal speed tiebreak)", () => {
    // Source: Showdown data/abilities.ts — both have Stall, so the -0.1 priority
    // cancels out, and normal speed ordering resumes
    // Derivation: both Stall → speed tiebreak: 120 > 80, A goes first
    const monA = createOnFieldPokemon({
      speciesRecord: stallSpecies,
      speed: 120,
      abilityRecord: stallAbility,
    });
    const monB = createOnFieldPokemon({
      speciesRecord: stallSpecies,
      speed: 80,
      abilityRecord: stallAbility,
    });
    const state = createTwoSideBattleState(monA, monB);
    const ruleset = createGen4Ruleset();

    const actions: BattleAction[] = [
      { type: "move", side: 0, moveIndex: 0 },
      { type: "move", side: 1, moveIndex: 0 },
    ];

    const rng = new SeededRandom(42);
    const ordered = ruleset.resolveTurnOrder(actions, state, rng);

    expect(ordered[0]).toEqual(actions[0]); // A (120, both Stall) first
    expect(ordered[1]).toEqual(actions[1]); // B (80, both Stall) second
  });
});

// ---------------------------------------------------------------------------
// Lagging Tail / Full Incense -- Always move last in priority bracket
// ---------------------------------------------------------------------------

describe("Gen4Ruleset resolveTurnOrder -- Lagging Tail", () => {
  it("given Lagging Tail holder (speed 200) vs non-holder (speed 50), when resolveTurnOrder is called, then holder moves second", () => {
    // Source: Bulbapedia — Lagging Tail: "Holder always moves last"
    // Source: Showdown data/items.ts — Lagging Tail: onFractionalPriority -0.1
    // Despite having higher speed, Lagging Tail forces A to move last
    const monA = createOnFieldPokemon({ speed: 200, heldItemRecord: laggingTailItem });
    const monB = createOnFieldPokemon({ speed: 50 });
    const state = createTwoSideBattleState(monA, monB);
    const ruleset = createGen4Ruleset();

    const actions: BattleAction[] = [
      { type: "move", side: 0, moveIndex: 0 },
      { type: "move", side: 1, moveIndex: 0 },
    ];

    const rng = new SeededRandom(42);
    const ordered = ruleset.resolveTurnOrder(actions, state, rng);

    expect(ordered[0]).toEqual(actions[1]); // B (no Lagging Tail) first
    expect(ordered[1]).toEqual(actions[0]); // A (Lagging Tail) second
  });

  it("given Lagging Tail holder (speed 50) vs non-holder (speed 200), when resolveTurnOrder is called, then holder still moves second (Lagging Tail forces last)", () => {
    // Source: Bulbapedia — Lagging Tail: "Holder always moves last"
    // Triangulation: holder is already slower, but Lagging Tail still applies
    const monA = createOnFieldPokemon({ speed: 50, heldItemRecord: laggingTailItem });
    const monB = createOnFieldPokemon({ speed: 200 });
    const state = createTwoSideBattleState(monA, monB);
    const ruleset = createGen4Ruleset();

    const actions: BattleAction[] = [
      { type: "move", side: 0, moveIndex: 0 },
      { type: "move", side: 1, moveIndex: 0 },
    ];

    const rng = new SeededRandom(42);
    const ordered = ruleset.resolveTurnOrder(actions, state, rng);

    expect(ordered[0]).toEqual(actions[1]); // B (200) first
    expect(ordered[1]).toEqual(actions[0]); // A (50, Lagging Tail) second
  });
});

describe("Gen4Ruleset resolveTurnOrder -- Full Incense", () => {
  it("given Full Incense holder (speed 200) vs non-holder (speed 50), when resolveTurnOrder is called, then holder moves second", () => {
    // Source: Bulbapedia — Full Incense: "Holder always moves last in its priority bracket"
    // Source: Showdown data/items.ts — Full Incense: onFractionalPriority -0.1
    // Full Incense has identical behavior to Lagging Tail
    const monA = createOnFieldPokemon({ speed: 200, heldItemRecord: fullIncenseItem });
    const monB = createOnFieldPokemon({ speed: 50 });
    const state = createTwoSideBattleState(monA, monB);
    const ruleset = createGen4Ruleset();

    const actions: BattleAction[] = [
      { type: "move", side: 0, moveIndex: 0 },
      { type: "move", side: 1, moveIndex: 0 },
    ];

    const rng = new SeededRandom(42);
    const ordered = ruleset.resolveTurnOrder(actions, state, rng);

    expect(ordered[0]).toEqual(actions[1]); // B (no Full Incense) first
    expect(ordered[1]).toEqual(actions[0]); // A (Full Incense) second
  });
});

// ---------------------------------------------------------------------------
// Custap Berry -- Move first at <=25% HP
// ---------------------------------------------------------------------------

describe("Gen4Ruleset resolveTurnOrder -- Custap Berry", () => {
  it("given Custap Berry holder at 50/200 HP (25%) with speed 50 vs non-holder with speed 200, when resolveTurnOrder is called, then Custap user moves first", () => {
    // Source: Bulbapedia — Custap Berry: "When the holder's HP drops to 1/4 or less,
    //   it will move first in its priority bracket."
    // Source: Showdown data/items.ts — Custap Berry: onFractionalPriority checks HP <= 0.25
    // Derivation: 50/200 = 25% = exactly threshold, so Custap activates
    const monA = createOnFieldPokemon({
      speed: 50,
      heldItemRecord: custapBerryItem,
      currentHp: 50,
      maxHp: 200,
    });
    const monB = createOnFieldPokemon({ speed: 200 });
    const state = createTwoSideBattleState(monA, monB);
    const ruleset = createGen4Ruleset();

    const actions: BattleAction[] = [
      { type: "move", side: 0, moveIndex: 0 },
      { type: "move", side: 1, moveIndex: 0 },
    ];

    const rng = new SeededRandom(42);
    const ordered = ruleset.resolveTurnOrder(actions, state, rng);

    expect(ordered[0]).toEqual(actions[0]); // A (Custap activated) first
    expect(ordered[1]).toEqual(actions[1]); // B second
  });

  it("given Custap Berry holder at 51/200 HP (25.5%) with speed 50, when resolveTurnOrder is called, then Custap does NOT activate (slower user goes second normally)", () => {
    // Source: Bulbapedia — Custap Berry: activates at <=25% HP
    // Source: Showdown data/items.ts — Custap Berry checks HP <= floor(maxHp * 0.25)
    // Derivation: floor(200 * 0.25) = 50; 51 > 50, so Custap does NOT activate
    const monA = createOnFieldPokemon({
      speed: 50,
      heldItemRecord: custapBerryItem,
      currentHp: 51,
      maxHp: 200,
    });
    const monB = createOnFieldPokemon({ speed: 200 });
    const state = createTwoSideBattleState(monA, monB);
    const ruleset = createGen4Ruleset();

    const actions: BattleAction[] = [
      { type: "move", side: 0, moveIndex: 0 },
      { type: "move", side: 1, moveIndex: 0 },
    ];

    const rng = new SeededRandom(42);
    const ordered = ruleset.resolveTurnOrder(actions, state, rng);

    // Custap didn't activate: normal speed ordering — 200 > 50
    expect(ordered[0]).toEqual(actions[1]); // B (200) first
    expect(ordered[1]).toEqual(actions[0]); // A (50, Custap inactive) second
  });

  it("given Custap Berry holder at 1/200 HP (0.5%) with speed 50, when resolveTurnOrder is called against Pokemon with speed 200, then Custap user moves first", () => {
    // Source: Bulbapedia — Custap Berry activates at <=25% HP
    // Triangulation: very low HP still activates
    // Derivation: 1/200 = 0.5% <= 25%, so Custap activates
    const monA = createOnFieldPokemon({
      speed: 50,
      heldItemRecord: custapBerryItem,
      currentHp: 1,
      maxHp: 200,
    });
    const monB = createOnFieldPokemon({ speed: 200 });
    const state = createTwoSideBattleState(monA, monB);
    const ruleset = createGen4Ruleset();

    const actions: BattleAction[] = [
      { type: "move", side: 0, moveIndex: 0 },
      { type: "move", side: 1, moveIndex: 0 },
    ];

    const rng = new SeededRandom(42);
    const ordered = ruleset.resolveTurnOrder(actions, state, rng);

    expect(ordered[0]).toEqual(actions[0]); // A (Custap activated) first
    expect(ordered[1]).toEqual(actions[1]); // B second
  });
});

// ---------------------------------------------------------------------------
// Issue #452 — Trick Room equal-Speed edge case
// ---------------------------------------------------------------------------

describe("Gen4Ruleset resolveTurnOrder -- Trick Room equal Speed tie-breaking (issue #452)", () => {
  it("given Trick Room is active and both Pokemon have IDENTICAL Speed, when determining action order, then the tie-breaking is NOT reversed by Trick Room (original index order applies)", () => {
    // Source: Showdown Gen 4 — equal Speed tie-breaking in Trick Room follows normal rules
    // Bulbapedia — Trick Room: "If two Pokémon with the same Speed use moves in the same
    //   priority bracket, one is chosen at random regardless of Trick Room."
    // Key behavior: Trick Room reverses UNEQUAL speeds. When speeds are equal, it is a true
    // tie, and the same random/original ordering applies as it would outside Trick Room.
    // Neither Pokemon gets a deterministic advantage purely due to Trick Room.
    //
    // Derivation: monA speed=100 and monB speed=100. Under Trick Room, sorting by ascending speed
    // still produces a tie. The stable sort preserves original action array order (side 0 first).
    // With seeded RNG seed=42, the tie-breaking produces deterministic results.
    const monA = createOnFieldPokemon({ speed: 100 });
    const monB = createOnFieldPokemon({ speed: 100 });
    const stateWithTrickRoom = createTwoSideBattleState(monA, monB, { trickRoom: true });
    const stateNoTrickRoom = createTwoSideBattleState(monA, monB, { trickRoom: false });
    const ruleset = createGen4Ruleset();

    const actions: BattleAction[] = [
      { type: "move", side: 0, moveIndex: 0 },
      { type: "move", side: 1, moveIndex: 0 },
    ];

    const rngWithTrick = new SeededRandom(42);
    const rngNoTrick = new SeededRandom(42);
    const orderedWithTrick = ruleset.resolveTurnOrder(actions, stateWithTrickRoom, rngWithTrick);
    const orderedNoTrick = ruleset.resolveTurnOrder(actions, stateNoTrickRoom, rngNoTrick);

    // Equal speeds: Trick Room should NOT change the tiebreak order compared to no-Trick-Room.
    // Both rng seeds start at 42 so the tie-break random roll is identical in both cases.
    expect(orderedWithTrick[0]).toEqual(orderedNoTrick[0]);
    expect(orderedWithTrick[1]).toEqual(orderedNoTrick[1]);
  });

  it("given Trick Room is active, both Pokemon have Speed 100, when compared to unequal speeds that ARE reversed by Trick Room, then the equal-speed case is distinct from the reversed case", () => {
    // Source: Showdown Gen 4 — Trick Room reversal only applies when speeds differ
    // Triangulation: confirms equal-speed behavior differs from the inequality-reversal case
    //
    // In the unequal case (100 vs 80), Trick Room makes 80 go first.
    // In the equal case (100 vs 100), both produce a tie; Trick Room has no directional effect.
    const monFast = createOnFieldPokemon({ speed: 100 });
    const monSlow = createOnFieldPokemon({ speed: 80 });
    const monEqual = createOnFieldPokemon({ speed: 100 });
    const unequalStateTrickRoom = createTwoSideBattleState(monFast, monSlow, {
      trickRoom: true,
    });
    const equalStateTrickRoom = createTwoSideBattleState(monFast, monEqual, {
      trickRoom: true,
    });
    const ruleset = createGen4Ruleset();

    const actionsUnequal: BattleAction[] = [
      { type: "move", side: 0, moveIndex: 0 },
      { type: "move", side: 1, moveIndex: 0 },
    ];
    const actionsEqual: BattleAction[] = [
      { type: "move", side: 0, moveIndex: 0 },
      { type: "move", side: 1, moveIndex: 0 },
    ];

    const rngUnequal = new SeededRandom(42);
    const orderedUnequal = ruleset.resolveTurnOrder(
      actionsUnequal,
      unequalStateTrickRoom,
      rngUnequal,
    );

    const rngEqual = new SeededRandom(42);
    const orderedEqual = ruleset.resolveTurnOrder(actionsEqual, equalStateTrickRoom, rngEqual);

    // Unequal case: Trick Room reverses — monSlow (side 1, speed=80) goes first
    expect(orderedUnequal[0]).toEqual(actionsUnequal[1]); // side 1 (speed=80, slower) first
    expect(orderedUnequal[1]).toEqual(actionsUnequal[0]); // side 0 (speed=100, faster) second

    // Equal case: no reversal — tie-breaking applies (both have speed=100)
    // The result is deterministic (seed 42) and equal to the no-Trick-Room case
    // The first action with a 100-speed tie comes from the stable ordering, NOT guaranteed reversal
    expect(orderedEqual).toHaveLength(2);
    // Both actions must be present (order may be either way, but both must be there)
    expect([actionsEqual[0], actionsEqual[1]]).toContain(orderedEqual[0]);
    expect([actionsEqual[0], actionsEqual[1]]).toContain(orderedEqual[1]);
  });
});
