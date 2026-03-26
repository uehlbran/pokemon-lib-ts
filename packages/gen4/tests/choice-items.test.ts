import type {
  ActivePokemon,
  BattleAction,
  BattleState,
  DamageContext,
} from "@pokemon-lib-ts/battle";
import type { MoveData, PokemonType, StatBlock, TypeChart } from "@pokemon-lib-ts/core";
import {
  CORE_ABILITY_IDS,
  CORE_ABILITY_SLOTS,
  CORE_GENDERS,
  CORE_ITEM_IDS,
  CORE_MOVE_IDS,
  CORE_TYPE_IDS,
  CORE_VOLATILE_IDS,
  createMoveSlot,
  NEUTRAL_NATURES,
  SeededRandom,
} from "@pokemon-lib-ts/core";
import { describe, expect, it } from "vitest";
import {
  createGen4DataManager,
  GEN4_ABILITY_IDS,
  GEN4_ITEM_IDS,
  GEN4_MOVE_IDS,
  GEN4_NATURE_IDS,
  GEN4_SPECIES_IDS,
  GEN4_TYPES,
} from "../src";
import { calculateGen4Damage } from "../src/Gen4DamageCalc";
import { Gen4Ruleset } from "../src/Gen4Ruleset";
import { createSyntheticOnFieldPokemon } from "./helpers/createSyntheticOnFieldPokemon";

/**
 * Gen 4 Choice Item Tests — Choice Band, Choice Specs, Choice Scarf
 *
 * Sources:
 *   - Bulbapedia — Choice Band: "Raises the holder's Attack by 50%"
 *   - Bulbapedia — Choice Specs: "Raises the holder's Special Attack by 50%"
 *   - Bulbapedia — Choice Scarf: "Raises the holder's Speed by 50%"
 *   - Showdown sim/items.ts — Choice item implementations
 */

// ---------------------------------------------------------------------------
// Test helpers
// ---------------------------------------------------------------------------

const DATA_MANAGER = createGen4DataManager();
const ABILITIES = { ...CORE_ABILITY_IDS, ...GEN4_ABILITY_IDS } as const;
const ITEMS = { ...CORE_ITEM_IDS, ...GEN4_ITEM_IDS } as const;
const MOVES = { ...CORE_MOVE_IDS, ...GEN4_MOVE_IDS } as const;
const SPECIES = GEN4_SPECIES_IDS;
const TYPES = CORE_TYPE_IDS;
const VOLATILES = CORE_VOLATILE_IDS;
const DEFAULT_NATURE = NEUTRAL_NATURES[0] ?? GEN4_NATURE_IDS.hardy;

const TACKLE = DATA_MANAGER.getMove(MOVES.tackle);

function createMockRng(intReturnValue: number) {
  return {
    next: () => 0,
    int: (_min: number, _max: number) => intReturnValue,
    chance: () => false,
    pick: <T>(arr: readonly T[]) => arr[0] as T,
    shuffle: <T>(arr: readonly T[]) => [...arr],
    getState: () => 0,
    setState: () => {},
  };
}

function createActivePokemon(opts: {
  level?: number;
  attack?: number;
  defense?: number;
  spAttack?: number;
  spDefense?: number;
  hp?: number;
  currentHp?: number;
  speed?: number;
  types?: PokemonType[];
  ability?: PokemonInstance["ability"];
  heldItem?: PokemonInstance["heldItem"];
  status?: PokemonInstance["status"];
  speciesId?: PokemonInstance["speciesId"];
  hasFlashFire?: boolean;
}): ActivePokemon {
  const maxHp = opts.hp ?? 200;
  const calculatedStats: StatBlock = {
    hp: maxHp,
    attack: opts.attack ?? 100,
    defense: opts.defense ?? 100,
    spAttack: opts.spAttack ?? 100,
    spDefense: opts.spDefense ?? 100,
    speed: opts.speed ?? 100,
  };
  const volatileStatuses = new Map<string, { turnsLeft: number }>();
  if (opts.hasFlashFire) {
    volatileStatuses.set(VOLATILES.flashFire, { turnsLeft: -1 });
  }
  return createSyntheticOnFieldPokemon({
    ability: opts.ability ?? ABILITIES.none,
    abilitySlot: CORE_ABILITY_SLOTS.normal1,
    calculatedStats,
    currentHp: opts.currentHp ?? maxHp,
    gender: CORE_GENDERS.male,
    heldItem: opts.heldItem ?? null,
    level: opts.level ?? 50,
    moveSlots: [createMoveSlot(TACKLE.id, TACKLE.pp)],
    nature: DEFAULT_NATURE,
    pokeball: ITEMS.pokeBall,
    speciesId: opts.speciesId ?? SPECIES.bulbasaur,
    statStages: {},
    status: opts.status ?? null,
    types: opts.types ?? [TYPES.normal],
    volatileStatuses,
  });
}

function getMove(id: MoveData["id"], overrides?: Partial<MoveData>): MoveData {
  const move = DATA_MANAGER.getMove(id);
  return {
    ...move,
    ...overrides,
  } as MoveData;
}

function createTurnOrderState(
  left: ActivePokemon,
  right: ActivePokemon,
  rng: SeededRandom,
): BattleState {
  return {
    phase: "turn-resolve",
    generation: 4,
    format: "singles",
    turnNumber: 1,
    sides: [
      {
        index: 0,
        trainer: null,
        team: [left.pokemon],
        active: [left],
        hazards: [],
        screens: [],
        tailwind: { active: false, turnsLeft: 0 },
        luckyChant: { active: false, turnsLeft: 0 },
        wish: null,
        futureAttack: null,
        faintCount: 0,
        gimmickUsed: false,
      },
      {
        index: 1,
        trainer: null,
        team: [right.pokemon],
        active: [right],
        hazards: [],
        screens: [],
        tailwind: { active: false, turnsLeft: 0 },
        luckyChant: { active: false, turnsLeft: 0 },
        wish: null,
        futureAttack: null,
        faintCount: 0,
        gimmickUsed: false,
      },
    ],
    weather: null,
    terrain: null,
    trickRoom: { active: false, turnsLeft: 0 },
    magicRoom: { active: false, turnsLeft: 0 },
    wonderRoom: { active: false, turnsLeft: 0 },
    gravity: { active: false, turnsLeft: 0 },
    turnHistory: [],
    rng,
    ended: false,
    winner: null,
  } as unknown as BattleState;
}

function createNeutralTypeChart(): TypeChart {
  const chart = {} as Record<string, Record<string, number>>;
  for (const atk of GEN4_TYPES) {
    chart[atk] = {};
    for (const def of GEN4_TYPES) {
      (chart[atk] as Record<string, number>)[def] = 1;
    }
  }
  return chart as TypeChart;
}

function createMockState(weather?: BattleState["weather"] | null) {
  return {
    weather: weather ?? null,
  } as DamageContext["state"];
}

function createDamageContext(opts: {
  attacker: ActivePokemon;
  defender: ActivePokemon;
  move: MoveData;
  isCrit?: boolean;
  rng?: ReturnType<typeof createMockRng>;
  weather?: BattleState["weather"] | null;
}): DamageContext {
  return {
    attacker: opts.attacker,
    defender: opts.defender,
    move: opts.move,
    isCrit: opts.isCrit ?? false,
    rng: opts.rng ?? createMockRng(100),
    state: createMockState(opts.weather),
  } as DamageContext;
}

// ---------------------------------------------------------------------------
// Choice Band damage modifier
// ---------------------------------------------------------------------------

describe("Gen 4 Choice Band damage modifier", () => {
  // Source: Bulbapedia — Choice Band: "Boosts the holder's Attack by 50%,
  //   but only allows the use of the first move selected."
  // Source: Showdown sim/items.ts — Choice Band onModifyAtk

  it("given attacker holding Choice Band using physical move with Atk=100, when damage calc, then Attack is multiplied by 1.5 producing higher damage", () => {
    // Derivation: L50 Strength, Atk=100, Def=100, rng=100, neutral type chart
    //   Attacker types=[fighting], move type=normal → no STAB
    //   With Choice Band: Atk becomes floor(150*100/100)=150
    //     levelFactor=22, baseDmg=floor(floor(22*80*150/100)/50)+2=floor(2640/50)+2=52+2=54
    // Source: inline formula derivation
    const attacker = createActivePokemon({
      attack: 100,
      heldItem: ITEMS.choiceBand,
      types: [TYPES.fighting],
    });
    const defender = createActivePokemon({ defense: 100 });
    const move = getMove(MOVES.strength);
    const ctx = createDamageContext({ attacker, defender, move });
    const result = calculateGen4Damage(ctx, createNeutralTypeChart());

    expect(result.damage).toBe(54);
  });

  it("given attacker holding Choice Band using physical move with Atk=50, when damage calc, then Attack is multiplied by 1.5 producing higher damage", () => {
    // Derivation: L50 Strength, Atk=50, Def=100, rng=100
    //   Attacker types=[fighting], move type=normal → no STAB
    //   With Choice Band: Atk=floor(150*50/100)=75
    //     baseDmg=floor(floor(22*80*75/100)/50)+2=floor(1320/50)+2=26+2=28
    // Source: inline formula derivation — triangulation case with different Atk stat
    const attacker = createActivePokemon({
      attack: 50,
      heldItem: ITEMS.choiceBand,
      types: [TYPES.fighting],
    });
    const defender = createActivePokemon({ defense: 100 });
    const move = getMove(MOVES.strength);
    const ctx = createDamageContext({ attacker, defender, move });
    const result = calculateGen4Damage(ctx, createNeutralTypeChart());

    expect(result.damage).toBe(28);
  });

  it("given attacker holding Choice Band using special move, when damage calc, then no Attack boost applied", () => {
    // Source: Bulbapedia — Choice Band only boosts physical moves
    // Derivation: L50 Lava Plume, SpAtk=100, SpDef=100, rng=100
    //   Attacker types=[fighting], move type=fire → no STAB
    //   Special move ignores Choice Band: baseDmg=floor(floor(22*80*100/100)/50)+2=37
    const attacker = createActivePokemon({
      spAttack: 100,
      heldItem: ITEMS.choiceBand,
      types: [TYPES.fighting],
    });
    const defender = createActivePokemon({ spDefense: 100 });
    const move = getMove(MOVES.lavaPlume);
    const ctx = createDamageContext({ attacker, defender, move });
    const result = calculateGen4Damage(ctx, createNeutralTypeChart());

    // Without Choice Band boost: 37
    expect(result.damage).toBe(37);
  });
});

// ---------------------------------------------------------------------------
// Choice Specs damage modifier
// ---------------------------------------------------------------------------

describe("Gen 4 Choice Specs damage modifier", () => {
  // Source: Bulbapedia — Choice Specs: "Boosts the holder's Sp. Atk by 50%,
  //   but only allows the use of the first move selected."
  // Source: Showdown sim/items.ts — Choice Specs onModifySpA

  it("given attacker holding Choice Specs using special move with SpAtk=100, when damage calc, then SpAtk is multiplied by 1.5", () => {
    // Derivation: L50 Lava Plume, SpAtk=100, SpDef=100, rng=100
    //   Attacker types=[fighting], move type=fire → no STAB
    //   With Choice Specs: SpAtk=floor(150*100/100)=150
    //     baseDmg=floor(floor(22*80*150/100)/50)+2=floor(2640/50)+2=52+2=54
    // Source: inline formula derivation
    const attacker = createActivePokemon({
      spAttack: 100,
      heldItem: ITEMS.choiceSpecs,
      types: [TYPES.fighting],
    });
    const defender = createActivePokemon({ spDefense: 100 });
    const move = getMove(MOVES.lavaPlume);
    const ctx = createDamageContext({ attacker, defender, move });
    const result = calculateGen4Damage(ctx, createNeutralTypeChart());

    expect(result.damage).toBe(54);
  });

  it("given attacker holding Choice Specs using special move with SpAtk=80, when damage calc, then SpAtk is multiplied by 1.5", () => {
    // Derivation: L50 Lava Plume, SpAtk=80, SpDef=100, rng=100
    //   Attacker types=[fighting], move type=fire → no STAB
    //   With Choice Specs: SpAtk=floor(150*80/100)=120
    //     baseDmg=floor(floor(22*80*120/100)/50)+2=floor(2112/50)+2=42+2=44
    // Source: inline formula derivation — triangulation with SpAtk=80
    const attacker = createActivePokemon({
      spAttack: 80,
      heldItem: ITEMS.choiceSpecs,
      types: [TYPES.fighting],
    });
    const defender = createActivePokemon({ spDefense: 100 });
    const move = getMove(MOVES.lavaPlume);
    const ctx = createDamageContext({ attacker, defender, move });
    const result = calculateGen4Damage(ctx, createNeutralTypeChart());

    expect(result.damage).toBe(44);
  });

  it("given attacker holding Choice Specs using physical move, then no SpAtk boost applied", () => {
    // Source: Bulbapedia — Choice Specs only boosts special moves
    // Derivation: L50 Strength, Atk=100, Def=100, rng=100
    //   Attacker types=[fighting], move type=normal → no STAB
    //   Physical move ignores Choice Specs: baseDmg=37
    const attacker = createActivePokemon({
      attack: 100,
      heldItem: ITEMS.choiceSpecs,
      types: [TYPES.fighting],
    });
    const defender = createActivePokemon({ defense: 100 });
    const move = getMove(MOVES.strength);
    const ctx = createDamageContext({ attacker, defender, move });
    const result = calculateGen4Damage(ctx, createNeutralTypeChart());

    expect(result.damage).toBe(37);
  });
});

// ---------------------------------------------------------------------------
// Choice Scarf speed modifier
// ---------------------------------------------------------------------------

describe("Gen 4 Choice Scarf speed modifier", () => {
  // Source: Bulbapedia — Choice Scarf: "Raises the holder's Speed by 50%,
  //   but only allows the use of the first move selected."
  // Source: Showdown sim/items.ts — Choice Scarf onModifySpe

  it("given a Pokemon holding Choice Scarf with 100 base speed, when resolving turn order, then Scarf holder moves first over 140 speed non-holder", () => {
    // Source: Bulbapedia — Choice Scarf: 1.5x Speed
    // Derivation: 100 speed * 1.5 = 150 effective speed > 140
    const ruleset = new Gen4Ruleset(DATA_MANAGER);
    const rng = new SeededRandom(42);
    const activeScarfHolder = createActivePokemon({
      speed: 100,
      heldItem: ITEMS.choiceScarf,
    });
    const activeFast = createActivePokemon({
      speciesId: SPECIES.ivysaur,
      speed: 140,
    });
    const state = createTurnOrderState(activeScarfHolder, activeFast, rng);

    const actions: BattleAction[] = [
      { type: "move", side: 0, moveIndex: 0 },
      { type: "move", side: 1, moveIndex: 0 },
    ];

    const ordered = ruleset.resolveTurnOrder(actions, state, rng);
    // Scarf holder (100 * 1.5 = 150) should move before fast Pokemon (140)
    expect(ordered[0]!.side).toBe(0);
    expect(ordered[1]!.side).toBe(1);
  });

  it("given a Pokemon holding Choice Scarf with 80 base speed, when resolving turn order, then Scarf holder has 120 effective speed and moves first over 110 speed non-holder", () => {
    // Source: Bulbapedia — Choice Scarf: 1.5x Speed
    // Derivation: 80 speed * 1.5 = 120 effective speed > 110
    const ruleset = new Gen4Ruleset(DATA_MANAGER);
    const rng = new SeededRandom(42);
    const activeScarfHolder = createActivePokemon({
      speed: 80,
      heldItem: ITEMS.choiceScarf,
    });
    const activeMedium = createActivePokemon({
      speciesId: SPECIES.ivysaur,
      speed: 110,
    });
    const state = createTurnOrderState(activeScarfHolder, activeMedium, rng);

    const actions: BattleAction[] = [
      { type: "move", side: 0, moveIndex: 0 },
      { type: "move", side: 1, moveIndex: 0 },
    ];

    const ordered = ruleset.resolveTurnOrder(actions, state, rng);
    // Scarf holder (80 * 1.5 = 120) should move before medium speed (110)
    expect(ordered[0]!.side).toBe(0);
    expect(ordered[1]!.side).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// Flash Fire volatile damage boost
// ---------------------------------------------------------------------------

describe("Gen 4 Flash Fire volatile damage boost", () => {
  // Source: Bulbapedia — Flash Fire: "raises the power of Fire-type moves by 50%
  //   while it is in effect"
  // Source: Showdown data/abilities.ts — Flash Fire onBasePowerPriority

  it("given attacker with flash-fire volatile using Lava Plume, when damage calc, then damage is boosted by 1.5x (case 1: SpAtk=100)", () => {
    // Derivation: L50 Lava Plume, SpAtk=100, SpDef=100, rng=100, neutral type chart
    //   Flash Fire is now a damage modifier (ModifyDamagePhase1), not base power.
    //   Source: Showdown data/mods/gen4/abilities.ts — Flash Fire onModifyDamagePhase1
    //   baseDmg = floor(floor(22*80*100/100)/50) = 35
    //   Flash Fire: floor(35*1.5) = 52; +2 = 54
    // Source: inline formula derivation
    const attacker = createActivePokemon({ spAttack: 100, hasFlashFire: true });
    const defender = createActivePokemon({ spDefense: 100 });
    const move = getMove(MOVES.lavaPlume);
    const ctx = createDamageContext({ attacker, defender, move });
    const result = calculateGen4Damage(ctx, createNeutralTypeChart());

    expect(result.damage).toBe(54);
  });

  it("given attacker with flash-fire volatile using Lava Plume, when damage calc, then damage is boosted by 1.5x (case 2: SpAtk=120)", () => {
    // Derivation: L50 Lava Plume, SpAtk=120, SpDef=100, rng=100
    //   Flash Fire is now a damage modifier (ModifyDamagePhase1), not base power.
    //   Source: Showdown data/mods/gen4/abilities.ts — Flash Fire onModifyDamagePhase1
    //   baseDmg = floor(floor(22*80*120/100)/50) = floor(2112/50) = 42
    //   Flash Fire: floor(42*1.5) = 63; +2 = 65
    // Source: inline formula derivation — triangulation with different SpAtk
    const attacker = createActivePokemon({ spAttack: 120, hasFlashFire: true });
    const defender = createActivePokemon({ spDefense: 100 });
    const move = getMove(MOVES.lavaPlume);
    const ctx = createDamageContext({ attacker, defender, move });
    const result = calculateGen4Damage(ctx, createNeutralTypeChart());

    expect(result.damage).toBe(65);
  });

  it("given attacker with flash-fire volatile using Strength, then no power boost", () => {
    // Source: Bulbapedia — Flash Fire only boosts Fire-type moves
    // Derivation: L50 Strength, Atk=100, Def=100, rng=100, normal move, no boost
    //   Attacker types=[fighting], move type=normal → no STAB
    //   baseDmg=floor(floor(22*80*100/100)/50)+2=37
    const attacker = createActivePokemon({
      attack: 100,
      hasFlashFire: true,
      types: [TYPES.fighting],
    });
    const defender = createActivePokemon({ defense: 100 });
    const move = getMove(MOVES.strength);
    const ctx = createDamageContext({ attacker, defender, move });
    const result = calculateGen4Damage(ctx, createNeutralTypeChart());

    expect(result.damage).toBe(37);
  });

  it("given attacker without flash-fire volatile using Lava Plume, then no power boost", () => {
    // Source: Bulbapedia — Flash Fire volatile must be active for the boost
    // Derivation: L50 Lava Plume, SpAtk=100, SpDef=100, rng=100, fire type, no volatile
    //   baseDmg=floor(floor(22*80*100/100)/50)+2=37
    const attacker = createActivePokemon({ spAttack: 100 });
    const defender = createActivePokemon({ spDefense: 100 });
    const move = getMove(MOVES.lavaPlume);
    const ctx = createDamageContext({ attacker, defender, move });
    const result = calculateGen4Damage(ctx, createNeutralTypeChart());

    expect(result.damage).toBe(37);
  });
});
