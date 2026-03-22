import type {
  ActivePokemon,
  BattleAction,
  BattleState,
  DamageContext,
} from "@pokemon-lib-ts/battle";
import type {
  MoveData,
  PokemonInstance,
  PokemonType,
  StatBlock,
  TypeChart,
} from "@pokemon-lib-ts/core";
import { SeededRandom } from "@pokemon-lib-ts/core";
import { describe, expect, it } from "vitest";
import { createGen4DataManager } from "../src/data";
import { calculateGen4Damage } from "../src/Gen4DamageCalc";
import { Gen4Ruleset } from "../src/Gen4Ruleset";

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
  ability?: string;
  heldItem?: string | null;
  status?: PokemonInstance["status"];
  speciesId?: number;
  hasFlashFire?: boolean;
}): ActivePokemon {
  const level = opts.level ?? 50;
  const maxHp = opts.hp ?? 200;
  const stats: StatBlock = {
    hp: maxHp,
    attack: opts.attack ?? 100,
    defense: opts.defense ?? 100,
    spAttack: opts.spAttack ?? 100,
    spDefense: opts.spDefense ?? 100,
    speed: opts.speed ?? 100,
  };

  const pokemon = {
    uid: "test",
    speciesId: opts.speciesId ?? 1,
    nickname: null,
    level,
    experience: 0,
    nature: "hardy",
    ivs: { hp: 0, attack: 0, defense: 0, spAttack: 0, spDefense: 0, speed: 0 },
    evs: { hp: 0, attack: 0, defense: 0, spAttack: 0, spDefense: 0, speed: 0 },
    currentHp: opts.currentHp ?? maxHp,
    moves: [{ moveId: "tackle", pp: 35, maxPp: 35 }],
    ability: opts.ability ?? "",
    abilitySlot: "normal1" as const,
    heldItem: opts.heldItem ?? null,
    status: opts.status ?? null,
    friendship: 0,
    gender: "male" as const,
    isShiny: false,
    metLocation: "",
    metLevel: 1,
    originalTrainer: "",
    originalTrainerId: 0,
    pokeball: "pokeball",
    calculatedStats: stats,
  } as PokemonInstance;

  const volatileStatuses = new Map<string, { turnsLeft: number }>();
  if (opts.hasFlashFire) {
    volatileStatuses.set("flash-fire", { turnsLeft: -1 });
  }

  return {
    pokemon,
    teamSlot: 0,
    statStages: {
      attack: 0,
      defense: 0,
      spAttack: 0,
      spDefense: 0,
      speed: 0,
      accuracy: 0,
      evasion: 0,
    },
    volatileStatuses,
    types: opts.types ?? ["normal"],
    ability: opts.ability ?? "",
    lastMoveUsed: null,
    lastDamageTaken: 0,
    lastDamageType: null,
    turnsOnField: 0,
    movedThisTurn: false,
    consecutiveProtects: 0,
    substituteHp: 0,
    transformed: false,
    transformedSpecies: null,
    isMega: false,
    isDynamaxed: false,
    dynamaxTurnsLeft: 0,
    isTerastallized: false,
    teraType: null,
    stellarBoostedTypes: [],
  } as ActivePokemon;
}

function createMove(opts: {
  type: PokemonType;
  power: number;
  category?: "physical" | "special" | "status";
  id?: string;
}): MoveData {
  return {
    id: opts.id ?? "test-move",
    displayName: "Test Move",
    type: opts.type,
    category: opts.category ?? "physical",
    power: opts.power,
    accuracy: 100,
    pp: 35,
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
    description: "",
    generation: 4,
  } as MoveData;
}

function createNeutralTypeChart(): TypeChart {
  const types: PokemonType[] = [
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
  ];
  const chart = {} as Record<string, Record<string, number>>;
  for (const atk of types) {
    chart[atk] = {};
    for (const def of types) {
      (chart[atk] as Record<string, number>)[def] = 1;
    }
  }
  return chart as TypeChart;
}

function createMockState(weather?: { type: string; turnsLeft: number; source: string } | null) {
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
  weather?: { type: string; turnsLeft: number; source: string } | null;
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
    // Derivation: L50, power=80, Atk=100, Def=100, rng=100, neutral type chart
    //   Attacker types=["fighting"], move type="normal" → no STAB
    //   With Choice Band: Atk becomes floor(150*100/100)=150
    //     levelFactor=22, baseDmg=floor(floor(22*80*150/100)/50)+2=floor(2640/50)+2=52+2=54
    // Source: inline formula derivation
    const attacker = createActivePokemon({
      attack: 100,
      heldItem: "choice-band",
      types: ["fighting"],
    });
    const defender = createActivePokemon({ defense: 100 });
    const move = createMove({ type: "normal", power: 80, category: "physical" });
    const ctx = createDamageContext({ attacker, defender, move });
    const result = calculateGen4Damage(ctx, createNeutralTypeChart());

    expect(result.damage).toBe(54);
  });

  it("given attacker holding Choice Band using physical move with Atk=50, when damage calc, then Attack is multiplied by 1.5 producing higher damage", () => {
    // Derivation: L50, power=80, Atk=50, Def=100, rng=100
    //   Attacker types=["fighting"], move type="normal" → no STAB
    //   With Choice Band: Atk=floor(150*50/100)=75
    //     baseDmg=floor(floor(22*80*75/100)/50)+2=floor(1320/50)+2=26+2=28
    // Source: inline formula derivation — triangulation case with different Atk stat
    const attacker = createActivePokemon({
      attack: 50,
      heldItem: "choice-band",
      types: ["fighting"],
    });
    const defender = createActivePokemon({ defense: 100 });
    const move = createMove({ type: "normal", power: 80, category: "physical" });
    const ctx = createDamageContext({ attacker, defender, move });
    const result = calculateGen4Damage(ctx, createNeutralTypeChart());

    expect(result.damage).toBe(28);
  });

  it("given attacker holding Choice Band using special move, when damage calc, then no Attack boost applied", () => {
    // Source: Bulbapedia — Choice Band only boosts physical moves
    // Derivation: L50, power=80, SpAtk=100, SpDef=100, rng=100
    //   Attacker types=["fighting"], move type="normal" → no STAB
    //   Special move ignores Choice Band: baseDmg=floor(floor(22*80*100/100)/50)+2=37
    const attacker = createActivePokemon({
      spAttack: 100,
      heldItem: "choice-band",
      types: ["fighting"],
    });
    const defender = createActivePokemon({ spDefense: 100 });
    const move = createMove({ type: "normal", power: 80, category: "special" });
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
    // Derivation: L50, power=80, SpAtk=100, SpDef=100, rng=100
    //   Attacker types=["fighting"], move type="normal" → no STAB
    //   With Choice Specs: SpAtk=floor(150*100/100)=150
    //     baseDmg=floor(floor(22*80*150/100)/50)+2=floor(2640/50)+2=52+2=54
    // Source: inline formula derivation
    const attacker = createActivePokemon({
      spAttack: 100,
      heldItem: "choice-specs",
      types: ["fighting"],
    });
    const defender = createActivePokemon({ spDefense: 100 });
    const move = createMove({ type: "normal", power: 80, category: "special" });
    const ctx = createDamageContext({ attacker, defender, move });
    const result = calculateGen4Damage(ctx, createNeutralTypeChart());

    expect(result.damage).toBe(54);
  });

  it("given attacker holding Choice Specs using special move with SpAtk=80, when damage calc, then SpAtk is multiplied by 1.5", () => {
    // Derivation: L50, power=80, SpAtk=80, SpDef=100, rng=100
    //   Attacker types=["fighting"], move type="normal" → no STAB
    //   With Choice Specs: SpAtk=floor(150*80/100)=120
    //     baseDmg=floor(floor(22*80*120/100)/50)+2=floor(2112/50)+2=42+2=44
    // Source: inline formula derivation — triangulation with SpAtk=80
    const attacker = createActivePokemon({
      spAttack: 80,
      heldItem: "choice-specs",
      types: ["fighting"],
    });
    const defender = createActivePokemon({ spDefense: 100 });
    const move = createMove({ type: "normal", power: 80, category: "special" });
    const ctx = createDamageContext({ attacker, defender, move });
    const result = calculateGen4Damage(ctx, createNeutralTypeChart());

    expect(result.damage).toBe(44);
  });

  it("given attacker holding Choice Specs using physical move, then no SpAtk boost applied", () => {
    // Source: Bulbapedia — Choice Specs only boosts special moves
    // Derivation: L50, power=80, Atk=100, Def=100, rng=100
    //   Attacker types=["fighting"], move type="normal" → no STAB
    //   Physical move ignores Choice Specs: baseDmg=37
    const attacker = createActivePokemon({
      attack: 100,
      heldItem: "choice-specs",
      types: ["fighting"],
    });
    const defender = createActivePokemon({ defense: 100 });
    const move = createMove({ type: "normal", power: 80, category: "physical" });
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
    const ruleset = new Gen4Ruleset(createGen4DataManager());
    const rng = new SeededRandom(42);

    const scarfPokemon: PokemonInstance = {
      uid: "scarf",
      speciesId: 1,
      nickname: null,
      level: 50,
      experience: 0,
      nature: "hardy",
      ivs: { hp: 31, attack: 31, defense: 31, spAttack: 31, spDefense: 31, speed: 31 },
      evs: { hp: 0, attack: 0, defense: 0, spAttack: 0, spDefense: 0, speed: 0 },
      currentHp: 200,
      moves: [{ moveId: "tackle", pp: 35, maxPp: 35 }],
      ability: "",
      abilitySlot: "normal1" as const,
      heldItem: "choice-scarf",
      status: null,
      friendship: 0,
      gender: "male" as const,
      isShiny: false,
      metLocation: "",
      metLevel: 1,
      originalTrainer: "",
      originalTrainerId: 0,
      pokeball: "pokeball",
      calculatedStats: {
        hp: 200,
        attack: 100,
        defense: 100,
        spAttack: 100,
        spDefense: 100,
        speed: 100,
      },
    } as PokemonInstance;

    const fastPokemon: PokemonInstance = {
      uid: "fast",
      speciesId: 2,
      nickname: null,
      level: 50,
      experience: 0,
      nature: "hardy",
      ivs: { hp: 31, attack: 31, defense: 31, spAttack: 31, spDefense: 31, speed: 31 },
      evs: { hp: 0, attack: 0, defense: 0, spAttack: 0, spDefense: 0, speed: 0 },
      currentHp: 200,
      moves: [{ moveId: "tackle", pp: 35, maxPp: 35 }],
      ability: "",
      abilitySlot: "normal1" as const,
      heldItem: null,
      status: null,
      friendship: 0,
      gender: "male" as const,
      isShiny: false,
      metLocation: "",
      metLevel: 1,
      originalTrainer: "",
      originalTrainerId: 0,
      pokeball: "pokeball",
      calculatedStats: {
        hp: 200,
        attack: 100,
        defense: 100,
        spAttack: 100,
        spDefense: 100,
        speed: 140,
      },
    } as PokemonInstance;

    const activeScarfHolder: ActivePokemon = {
      pokemon: scarfPokemon,
      teamSlot: 0,
      statStages: {
        attack: 0,
        defense: 0,
        spAttack: 0,
        spDefense: 0,
        speed: 0,
        accuracy: 0,
        evasion: 0,
      },
      volatileStatuses: new Map(),
      types: ["normal"],
      ability: "",
      lastMoveUsed: null,
      lastDamageTaken: 0,
      lastDamageType: null,
      turnsOnField: 0,
      movedThisTurn: false,
      consecutiveProtects: 0,
      substituteHp: 0,
      transformed: false,
      transformedSpecies: null,
      isMega: false,
      isDynamaxed: false,
      dynamaxTurnsLeft: 0,
      isTerastallized: false,
      teraType: null,
      stellarBoostedTypes: [],
    } as ActivePokemon;

    const activeFast: ActivePokemon = {
      pokemon: fastPokemon,
      teamSlot: 0,
      statStages: {
        attack: 0,
        defense: 0,
        spAttack: 0,
        spDefense: 0,
        speed: 0,
        accuracy: 0,
        evasion: 0,
      },
      volatileStatuses: new Map(),
      types: ["normal"],
      ability: "",
      lastMoveUsed: null,
      lastDamageTaken: 0,
      lastDamageType: null,
      turnsOnField: 0,
      movedThisTurn: false,
      consecutiveProtects: 0,
      substituteHp: 0,
      transformed: false,
      transformedSpecies: null,
      isMega: false,
      isDynamaxed: false,
      dynamaxTurnsLeft: 0,
      isTerastallized: false,
      teraType: null,
      stellarBoostedTypes: [],
    } as ActivePokemon;

    const state = {
      phase: "turn-resolve",
      generation: 4,
      format: "singles",
      turnNumber: 1,
      sides: [
        {
          index: 0,
          trainer: null,
          team: [scarfPokemon],
          active: [activeScarfHolder],
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
          team: [fastPokemon],
          active: [activeFast],
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
    const ruleset = new Gen4Ruleset(createGen4DataManager());
    const rng = new SeededRandom(42);

    const scarfPokemon: PokemonInstance = {
      uid: "scarf2",
      speciesId: 1,
      nickname: null,
      level: 50,
      experience: 0,
      nature: "hardy",
      ivs: { hp: 31, attack: 31, defense: 31, spAttack: 31, spDefense: 31, speed: 31 },
      evs: { hp: 0, attack: 0, defense: 0, spAttack: 0, spDefense: 0, speed: 0 },
      currentHp: 200,
      moves: [{ moveId: "tackle", pp: 35, maxPp: 35 }],
      ability: "",
      abilitySlot: "normal1" as const,
      heldItem: "choice-scarf",
      status: null,
      friendship: 0,
      gender: "male" as const,
      isShiny: false,
      metLocation: "",
      metLevel: 1,
      originalTrainer: "",
      originalTrainerId: 0,
      pokeball: "pokeball",
      calculatedStats: {
        hp: 200,
        attack: 100,
        defense: 100,
        spAttack: 100,
        spDefense: 100,
        speed: 80,
      },
    } as PokemonInstance;

    const mediumPokemon: PokemonInstance = {
      uid: "medium",
      speciesId: 2,
      nickname: null,
      level: 50,
      experience: 0,
      nature: "hardy",
      ivs: { hp: 31, attack: 31, defense: 31, spAttack: 31, spDefense: 31, speed: 31 },
      evs: { hp: 0, attack: 0, defense: 0, spAttack: 0, spDefense: 0, speed: 0 },
      currentHp: 200,
      moves: [{ moveId: "tackle", pp: 35, maxPp: 35 }],
      ability: "",
      abilitySlot: "normal1" as const,
      heldItem: null,
      status: null,
      friendship: 0,
      gender: "male" as const,
      isShiny: false,
      metLocation: "",
      metLevel: 1,
      originalTrainer: "",
      originalTrainerId: 0,
      pokeball: "pokeball",
      calculatedStats: {
        hp: 200,
        attack: 100,
        defense: 100,
        spAttack: 100,
        spDefense: 100,
        speed: 110,
      },
    } as PokemonInstance;

    const activeScarfHolder: ActivePokemon = {
      pokemon: scarfPokemon,
      teamSlot: 0,
      statStages: {
        attack: 0,
        defense: 0,
        spAttack: 0,
        spDefense: 0,
        speed: 0,
        accuracy: 0,
        evasion: 0,
      },
      volatileStatuses: new Map(),
      types: ["normal"],
      ability: "",
      lastMoveUsed: null,
      lastDamageTaken: 0,
      lastDamageType: null,
      turnsOnField: 0,
      movedThisTurn: false,
      consecutiveProtects: 0,
      substituteHp: 0,
      transformed: false,
      transformedSpecies: null,
      isMega: false,
      isDynamaxed: false,
      dynamaxTurnsLeft: 0,
      isTerastallized: false,
      teraType: null,
      stellarBoostedTypes: [],
    } as ActivePokemon;

    const activeMedium: ActivePokemon = {
      pokemon: mediumPokemon,
      teamSlot: 0,
      statStages: {
        attack: 0,
        defense: 0,
        spAttack: 0,
        spDefense: 0,
        speed: 0,
        accuracy: 0,
        evasion: 0,
      },
      volatileStatuses: new Map(),
      types: ["normal"],
      ability: "",
      lastMoveUsed: null,
      lastDamageTaken: 0,
      lastDamageType: null,
      turnsOnField: 0,
      movedThisTurn: false,
      consecutiveProtects: 0,
      substituteHp: 0,
      transformed: false,
      transformedSpecies: null,
      isMega: false,
      isDynamaxed: false,
      dynamaxTurnsLeft: 0,
      isTerastallized: false,
      teraType: null,
      stellarBoostedTypes: [],
    } as ActivePokemon;

    const state = {
      phase: "turn-resolve",
      generation: 4,
      format: "singles",
      turnNumber: 1,
      sides: [
        {
          index: 0,
          trainer: null,
          team: [scarfPokemon],
          active: [activeScarfHolder],
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
          team: [mediumPokemon],
          active: [activeMedium],
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

  it("given attacker with flash-fire volatile using Fire move with power=80, when damage calc, then base power is boosted by 1.5x (case 1: Atk=100)", () => {
    // Derivation: L50, power=80, Atk=100, Def=100, rng=100, neutral type chart
    //   Flash Fire is now a damage modifier (ModifyDamagePhase1), not base power.
    //   Source: Showdown data/mods/gen4/abilities.ts — Flash Fire onModifyDamagePhase1
    //   baseDmg = floor(floor(22*80*100/100)/50) = 35
    //   Flash Fire: floor(35*1.5) = 52; +2 = 54
    // Source: inline formula derivation
    const attacker = createActivePokemon({ attack: 100, hasFlashFire: true });
    const defender = createActivePokemon({ defense: 100 });
    const move = createMove({ type: "fire", power: 80, category: "physical" });
    const ctx = createDamageContext({ attacker, defender, move });
    const result = calculateGen4Damage(ctx, createNeutralTypeChart());

    expect(result.damage).toBe(54);
  });

  it("given attacker with flash-fire volatile using Fire move with power=60, when damage calc, then base power is boosted by 1.5x (case 2: Atk=120)", () => {
    // Derivation: L50, power=60, Atk=120, Def=100, rng=100
    //   Flash Fire is now a damage modifier (ModifyDamagePhase1), not base power.
    //   Source: Showdown data/mods/gen4/abilities.ts — Flash Fire onModifyDamagePhase1
    //   baseDmg = floor(floor(22*60*120/100)/50) = floor(1584/50) = 31
    //   Flash Fire: floor(31*1.5) = 46; +2 = 48
    // Source: inline formula derivation — triangulation with different power and Atk
    const attacker = createActivePokemon({ attack: 120, hasFlashFire: true });
    const defender = createActivePokemon({ defense: 100 });
    const move = createMove({ type: "fire", power: 60, category: "physical" });
    const ctx = createDamageContext({ attacker, defender, move });
    const result = calculateGen4Damage(ctx, createNeutralTypeChart());

    expect(result.damage).toBe(48);
  });

  it("given attacker with flash-fire volatile using non-Fire move, then no power boost", () => {
    // Source: Bulbapedia — Flash Fire only boosts Fire-type moves
    // Derivation: L50, power=80, Atk=100, Def=100, rng=100, normal move, no boost
    //   Attacker types=["fighting"], move type="normal" → no STAB
    //   baseDmg=floor(floor(22*80*100/100)/50)+2=37
    const attacker = createActivePokemon({ attack: 100, hasFlashFire: true, types: ["fighting"] });
    const defender = createActivePokemon({ defense: 100 });
    const move = createMove({ type: "normal", power: 80, category: "physical" });
    const ctx = createDamageContext({ attacker, defender, move });
    const result = calculateGen4Damage(ctx, createNeutralTypeChart());

    expect(result.damage).toBe(37);
  });

  it("given attacker WITHOUT flash-fire volatile using Fire move, then no power boost", () => {
    // Source: Bulbapedia — Flash Fire volatile must be active for the boost
    // Derivation: L50, power=80, Atk=100, Def=100, rng=100, fire type, no volatile
    //   baseDmg=floor(floor(22*80*100/100)/50)+2=37
    const attacker = createActivePokemon({ attack: 100 }); // no hasFlashFire
    const defender = createActivePokemon({ defense: 100 });
    const move = createMove({ type: "fire", power: 80, category: "physical" });
    const ctx = createDamageContext({ attacker, defender, move });
    const result = calculateGen4Damage(ctx, createNeutralTypeChart());

    expect(result.damage).toBe(37);
  });
});
