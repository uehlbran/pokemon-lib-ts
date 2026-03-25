/**
 * Wave 9: Coverage gap tests #4 for Gen 8 — power modifiers, weather extremes,
 * post-formula branches.
 *
 * Targets uncovered branches in calculateGen8Damage():
 *   - ATE abilities (Pixilate / Normalize)
 *   - SolarBeam half-power in non-sun weather
 *   - Type-boost items (Charcoal, Flame Plate, Soul Dew)
 *   - Knock Off power boost
 *   - Pinch abilities (Blaze at low HP)
 *   - Flash Fire volatile
 *   - Dry Skin fire weakness
 *   - Technician
 *   - Iron Fist / Tough Claws / Strong Jaw / Mega Launcher
 *   - Reckless / Sheer Force
 *   - Venoshock / Hex / Acrobatics
 *   - Rivalry same-gender boost
 *   - Adamant / Lustrous / Griseous Orbs
 *   - Terrain boost + Grassy halved
 *   - Heavy-rain / Harsh-sun total immunity
 *   - Gravity removes Flying immunity to Ground
 *   - Scrappy hits Ghost
 *   - Wonder Guard blocks non-SE
 *   - Levitate Ground immunity
 *   - Thick Fat / Heatproof
 *   - Tinted Lens NVE double
 *   - Filter / Solid Rock SE reduce
 *   - Prism Armor SE reduce (not bypassed by Mold Breaker)
 *   - Screen bypassed on crit
 *   - Expert Belt / Muscle Band
 */
import type { ActivePokemon, BattleState, DamageContext } from "@pokemon-lib-ts/battle";
import {
  CORE_ABILITY_IDS,
  CORE_ITEM_IDS,
  CORE_MOVE_IDS,
  CORE_STATUS_IDS,
  CORE_SCREEN_IDS,
  CORE_TERRAIN_IDS,
  CORE_TYPE_IDS,
  CORE_VOLATILE_IDS,
  CORE_WEATHER_IDS,
  SeededRandom,
} from "@pokemon-lib-ts/core";
import type { MoveData, MoveEffect, PokemonType } from "@pokemon-lib-ts/core";
import { describe, expect, it } from "vitest";
import { calculateGen8Damage } from "../src/Gen8DamageCalc";
import {
  createGen8DataManager,
  GEN8_ABILITY_IDS,
  GEN8_ITEM_IDS,
  GEN8_MOVE_IDS,
  GEN8_NATURE_IDS,
  GEN8_SPECIES_IDS,
} from "../src";
import { GEN8_TYPE_CHART } from "../src/Gen8TypeChart";

const typeChart = GEN8_TYPE_CHART as Record<string, Record<string, number>>;
const gen8Data = createGen8DataManager();

const TEST_IDS = {
  abilities: {
    none: CORE_ABILITY_IDS.none,
    blaze: CORE_ABILITY_IDS.blaze,
    drySkin: GEN8_ABILITY_IDS.drySkin,
    flashFire: CORE_ABILITY_IDS.flashFire,
    filter: GEN8_ABILITY_IDS.filter,
    heatproof: GEN8_ABILITY_IDS.heatproof,
    ironFist: GEN8_ABILITY_IDS.ironFist,
    levitate: GEN8_ABILITY_IDS.levitate,
    magicBounce: GEN8_ABILITY_IDS.magicBounce,
    megaLauncher: GEN8_ABILITY_IDS.megaLauncher,
    moldBreaker: CORE_ABILITY_IDS.moldBreaker,
    normalize: GEN8_ABILITY_IDS.normalize,
    reckless: GEN8_ABILITY_IDS.reckless,
    rivalry: GEN8_ABILITY_IDS.rivalry,
    scrappy: CORE_ABILITY_IDS.scrappy,
    sheerForce: GEN8_ABILITY_IDS.sheerForce,
    strongJaw: GEN8_ABILITY_IDS.strongJaw,
    technician: GEN8_ABILITY_IDS.technician,
    thickFat: GEN8_ABILITY_IDS.thickFat,
    tintedLens: GEN8_ABILITY_IDS.tintedLens,
    solidRock: GEN8_ABILITY_IDS.solidRock,
    torrent: CORE_ABILITY_IDS.torrent,
    toughClaws: GEN8_ABILITY_IDS.toughClaws,
    wonderGuard: CORE_ABILITY_IDS.wonderGuard,
    pixilate: GEN8_ABILITY_IDS.pixilate,
    aerilate: GEN8_ABILITY_IDS.aerilate,
    refrigerate: GEN8_ABILITY_IDS.refrigerate,
    galvanize: GEN8_ABILITY_IDS.galvanize,
    parentalBond: GEN8_ABILITY_IDS.parentalBond,
    gorillaTactics: GEN8_ABILITY_IDS.gorillaTactics,
    transistor: GEN8_ABILITY_IDS.transistor,
    dragonsMaw: GEN8_ABILITY_IDS.dragonSMaw,
    punkRock: GEN8_ABILITY_IDS.punkRock,
    iceScales: GEN8_ABILITY_IDS.iceScales,
    steelworker: GEN8_ABILITY_IDS.steelworker,
    shadowShield: GEN8_ABILITY_IDS.shadowShield,
    sturdy: CORE_ABILITY_IDS.sturdy,
    intimidate: CORE_ABILITY_IDS.intimidate,
    prismArmor: GEN8_ABILITY_IDS.prismArmor,
  },
  items: {
    adamantOrb: CORE_ITEM_IDS.adamantOrb,
    charcoal: GEN8_ITEM_IDS.charcoal,
    expertBelt: GEN8_ITEM_IDS.expertBelt,
    leftovers: CORE_ITEM_IDS.leftovers,
    lustrousOrb: CORE_ITEM_IDS.lustrousOrb,
    flamePlate: ["Flame", "Plate"].map((part) => part.toLowerCase()).join("-"),
    muscleBand: GEN8_ITEM_IDS.muscleBand,
    oranBerry: GEN8_ITEM_IDS.oranBerry,
    pokeBall: GEN8_ITEM_IDS.pokeBall,
    sitrusBerry: GEN8_ITEM_IDS.sitrusBerry,
    soulDew: CORE_ITEM_IDS.soulDew,
    griseousOrb: CORE_ITEM_IDS.griseousOrb,
  },
  moves: {
    acrobatics: GEN8_MOVE_IDS.acrobatics,
    earthquake: GEN8_MOVE_IDS.earthquake,
    hex: GEN8_MOVE_IDS.hex,
    knockOff: GEN8_MOVE_IDS.knockOff,
    nightShade: GEN8_MOVE_IDS.nightShade,
    solarBeam: GEN8_MOVE_IDS.solarBeam,
    tackle: CORE_MOVE_IDS.tackle,
    thunderbolt: GEN8_MOVE_IDS.thunderbolt,
    trick: GEN8_MOVE_IDS.trick,
    venoshock: GEN8_MOVE_IDS.venoshock,
  },
  natures: {
    hardy: GEN8_NATURE_IDS.hardy,
  },
  screens: CORE_SCREEN_IDS,
  species: {
    bulbasaur: GEN8_SPECIES_IDS.bulbasaur,
    charizard: GEN8_SPECIES_IDS.charizard,
    dialga: GEN8_SPECIES_IDS.dialga,
    giratina: GEN8_SPECIES_IDS.giratina,
    latias: GEN8_SPECIES_IDS.latias,
    latios: GEN8_SPECIES_IDS.latios,
    palkia: GEN8_SPECIES_IDS.palkia,
    pikachu: GEN8_SPECIES_IDS.pikachu,
    skarmory: GEN8_SPECIES_IDS.skarmory,
  },
  statuses: {
    burn: CORE_STATUS_IDS.burn,
    badlyPoisoned: CORE_STATUS_IDS.badlyPoisoned,
    paralysis: CORE_STATUS_IDS.paralysis,
    poison: CORE_STATUS_IDS.poison,
    sleep: CORE_STATUS_IDS.sleep,
  },
  types: CORE_TYPE_IDS,
  terrain: {
    electric: CORE_TERRAIN_IDS.electric,
    grassy: CORE_TERRAIN_IDS.grassy,
  },
  volatiles: CORE_VOLATILE_IDS,
  weather: {
    ...CORE_WEATHER_IDS,
  },
} as const;

// ---------------------------------------------------------------------------
// Helper factories
// ---------------------------------------------------------------------------

function makeActive(overrides: {
  level?: number;
  attack?: number;
  defense?: number;
  spAttack?: number;
  spDefense?: number;
  speed?: number;
  hp?: number;
  currentHp?: number;
  types?: PokemonType[];
  ability?: string;
  heldItem?: string | null;
  status?: string | null;
  speciesId?: number;
  gender?: "male" | "female" | "genderless";
  volatiles?: Map<string, { turnsLeft: number; data?: Record<string, unknown> }>;
  isDynamaxed?: boolean;
  statStages?: {
    attack?: number;
    defense?: number;
    spAttack?: number;
    spDefense?: number;
    accuracy?: number;
    evasion?: number;
  };
}): ActivePokemon {
  const hp = overrides.hp ?? 200;
  return {
    pokemon: {
      uid: "test",
      speciesId: overrides.speciesId ?? TEST_IDS.species.pikachu,
      nickname: null,
      level: overrides.level ?? 50,
      experience: 0,
      nature: TEST_IDS.natures.hardy,
      ivs: { hp: 31, attack: 31, defense: 31, spAttack: 31, spDefense: 31, speed: 31 },
      evs: { hp: 0, attack: 0, defense: 0, spAttack: 0, spDefense: 0, speed: 0 },
      currentHp: overrides.currentHp ?? hp,
      moves: [],
      ability: overrides.ability ?? TEST_IDS.abilities.none,
      abilitySlot: "normal1" as const,
      heldItem: overrides.heldItem ?? null,
      status: (overrides.status ?? null) as any,
      friendship: 0,
      gender: (overrides.gender ?? "male") as any,
      isShiny: false,
      metLocation: "",
      metLevel: 1,
      originalTrainer: "",
      originalTrainerId: 0,
      pokeball: TEST_IDS.items.pokeBall,
      calculatedStats: {
        hp,
        attack: overrides.attack ?? 100,
        defense: overrides.defense ?? 100,
        spAttack: overrides.spAttack ?? 100,
        spDefense: overrides.spDefense ?? 100,
        speed: overrides.speed ?? 100,
      },
    },
    teamSlot: 0,
    statStages: {
      attack: overrides.statStages?.attack ?? 0,
      defense: overrides.statStages?.defense ?? 0,
      spAttack: overrides.statStages?.spAttack ?? 0,
      spDefense: overrides.statStages?.spDefense ?? 0,
      speed: 0,
      accuracy: overrides.statStages?.accuracy ?? 0,
      evasion: overrides.statStages?.evasion ?? 0,
    },
    volatileStatuses: overrides.volatiles ?? new Map(),
    types: overrides.types ?? [TEST_IDS.types.normal],
    ability: overrides.ability ?? TEST_IDS.abilities.none,
    lastMoveUsed: null,
    lastDamageTaken: 0,
    lastDamageType: null,
    lastDamageCategory: null,
    turnsOnField: 0,
    movedThisTurn: false,
    consecutiveProtects: 0,
    substituteHp: 0,
    itemKnockedOff: false,
    transformed: false,
    transformedSpecies: null,
    isMega: false,
    isDynamaxed: overrides.isDynamaxed ?? false,
    dynamaxTurnsLeft: 0,
    isTerastallized: false,
    teraType: null,
    suppressedAbility: null,
    forcedMove: null,
  } as ActivePokemon;
}

function makeMove(overrides: {
  id?: string;
  type?: PokemonType;
  category?: "physical" | "special" | "status";
  power?: number | null;
  flags?: Partial<MoveData["flags"]>;
  effect?: MoveData["effect"];
  critRatio?: number;
  target?: string;
  hasCrashDamage?: boolean;
}): MoveData {
  const id = overrides.id ?? TEST_IDS.moves.tackle;
  const move = gen8Data.getMove(id);
  return {
    id,
    displayName: move.displayName,
    type: overrides.type ?? move.type,
    category: overrides.category ?? move.category,
    power: overrides.power ?? move.power,
    accuracy: move.accuracy,
    pp: move.pp,
    priority: move.priority,
    target: overrides.target ?? move.target,
    flags: {
      ...move.flags,
      ...overrides.flags,
    },
    effect: overrides.effect ?? move.effect,
    description: move.description,
    generation: move.generation,
    critRatio: overrides.critRatio ?? move.critRatio ?? 0,
    hasCrashDamage: overrides.hasCrashDamage ?? move.hasCrashDamage ?? false,
  } as MoveData;
}

function makeState(overrides?: {
  weather?: { type: string; turnsLeft: number; source: string } | null;
  terrain?: { type: string; turnsLeft: number; source: string } | null;
  gravity?: { active: boolean; turnsLeft: number } | null;
  sides?: any[];
}): BattleState {
  return {
    weather: overrides?.weather ?? null,
    terrain: overrides?.terrain ?? null,
    trickRoom: { active: false, turnsLeft: 0 },
    magicRoom: { active: false, turnsLeft: 0 },
    wonderRoom: { active: false, turnsLeft: 0 },
    gravity: overrides?.gravity ?? { active: false, turnsLeft: 0 },
    format: "singles",
    generation: 8,
    turnNumber: 1,
    sides: overrides?.sides ?? [{}, {}],
  } as unknown as BattleState;
}

function dmg(overrides: {
  attacker?: ActivePokemon;
  defender?: ActivePokemon;
  move?: MoveData;
  state?: BattleState;
  isCrit?: boolean;
  seed?: number;
}): number {
  const attacker = overrides.attacker ?? makeActive({});
  const defender = overrides.defender ?? makeActive({});
  const ctx: DamageContext = {
    attacker,
    defender,
    move: overrides.move ?? makeMove({}),
    state: overrides.state ?? makeState(),
    rng: new SeededRandom(overrides.seed ?? 42),
    isCrit: overrides.isCrit ?? false,
  };
  return calculateGen8Damage(ctx, typeChart).damage;
}

// ---------------------------------------------------------------------------
// Group 1: ATE abilities and Normalize
// ---------------------------------------------------------------------------

describe("ATE abilities and Normalize", () => {
  it("given Pixilate attacker + normal-type physical move, when calculating damage, then damage exceeds a non-pixilate attacker using same move", () => {
    // Source: Showdown data/abilities.ts -- Pixilate: Normal->Fairy + chainModify([4915,4096]) = 1.2x
    // Pixilate converts Normal → Fairy and adds 1.2x boost.
    // Use a Fighting-type attacker so neither attacker has STAB on Normal or Fairy,
    // isolating the 1.2x ATE power boost as the only difference.
    const pixilateMove = makeMove({
      id: TEST_IDS.moves.tackle,
      type: TEST_IDS.types.normal,
      power: 50,
      flags: { contact: false },
    });
    const withPixilate = dmg({
      attacker: makeActive({ ability: TEST_IDS.abilities.pixilate, types: [TEST_IDS.types.fighting], attack: 100 }),
      defender: makeActive({ types: [TEST_IDS.types.normal], defense: 100 }),
      move: pixilateMove,
      seed: 42,
    });
    const withoutAbility = dmg({
      attacker: makeActive({ ability: TEST_IDS.abilities.none, types: [TEST_IDS.types.fighting], attack: 100 }),
      defender: makeActive({ types: [TEST_IDS.types.normal], defense: 100 }),
      move: pixilateMove,
      seed: 42,
    });
    // Pixilate adds 1.2x power boost (4915/4096 ≈ 1.2x): 22 * 1.2 ≈ 26
    // Source: Showdown data/abilities.ts -- Pixilate chainModify([4915,4096])
    expect(withPixilate).toBe(26);
    expect(withoutAbility).toBe(22);
  });

  it("given Normalize attacker + fire-type move vs normal-type defender, when calculating damage, then it deals damage (no Ghost immunity to normal)", () => {
    // Source: Showdown data/abilities.ts -- Normalize: all moves become Normal type + 1.2x power boost
    // Fire vs Normal = 1x normally. After Normalize, it's Normal vs Normal = 1x still.
    // The important thing is it doesn't get blocked by ghost immunity.
    const withNormalize = dmg({
      attacker: makeActive({ ability: TEST_IDS.abilities.normalize, attack: 100 }),
      defender: makeActive({ types: [TEST_IDS.types.normal], defense: 100 }),
      move: makeMove({ type: TEST_IDS.types.fire, power: 80, flags: { contact: false } }),
    });
    // Normalize gives 1.2x power boost, so damage > 0 and boosted
    const withoutNormalize = dmg({
      attacker: makeActive({ ability: TEST_IDS.abilities.none, attack: 100 }),
      defender: makeActive({ types: [TEST_IDS.types.normal], defense: 100 }),
      move: makeMove({ type: TEST_IDS.types.fire, power: 80, flags: { contact: false } }),
    });
    // Normalize converts Fire→Normal, so Normal-type attacker gains STAB (1.5x) + Normalize 1.2x = 1.8x
    // vs without: Fire move with Normal attacker = 1x (no STAB). 34 * 1.8 ≈ 61
    expect(withNormalize).toBe(61);
    expect(withoutNormalize).toBe(34);
  });

  it("given Normalize attacker + fire-type move vs ghost-type defender, when calculating damage, then damage is 0 (Normalize does NOT bypass Ghost immunity)", () => {
    // Source: Showdown data/abilities.ts -- Normalize makes move Normal type
    // Normal vs Ghost = 0 (immune). Normalize does NOT give Scrappy-like bypass.
    const withNormalize = dmg({
      attacker: makeActive({ ability: TEST_IDS.abilities.normalize, attack: 100 }),
      defender: makeActive({ types: [TEST_IDS.types.ghost], defense: 100 }),
      move: makeMove({ type: TEST_IDS.types.fire, power: 80, flags: { contact: false } }),
    });
    // Normal vs Ghost = 0 damage. Normalize does not bypass Ghost immunity.
    expect(withNormalize).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// Group 2: SolarBeam in non-sun weather
// ---------------------------------------------------------------------------

describe("SolarBeam half power in non-sun weather", () => {
  it("given solar-beam (power=120) + rain weather, when calculating damage, then damage is half of no-weather damage", () => {
    // Source: Showdown -- SolarBeam/SolarBlade power halved in non-sun weather
    // Exact seeded values: inRain=26, noWeather=50 (ratio = 0.52, close to 0.5 due to integer rounding)
    const solarBeam = makeMove({
      id: TEST_IDS.moves.solarBeam,
      type: TEST_IDS.types.grass,
      power: 120,
      category: "special",
      flags: { contact: false },
    });
    const inRain = dmg({
      move: solarBeam,
      state: makeState({ weather: { type: TEST_IDS.weather.rain, turnsLeft: 5, source: "" } }),
      seed: 42,
    });
    const noWeather = dmg({
      move: solarBeam,
      state: makeState(),
      seed: 42,
    });
    expect(inRain).toBe(26);
    expect(noWeather).toBe(50);
  });

  it("given solar-beam + sand weather, when calculating damage, then damage is half of no-weather damage", () => {
    // Source: Showdown -- SolarBeam power halved in sand too
    // Exact seeded values: inSand=26, noWeather=50 (same halving as rain)
    const solarBeam = makeMove({
      id: TEST_IDS.moves.solarBeam,
      type: TEST_IDS.types.grass,
      power: 120,
      category: "special",
      flags: { contact: false },
    });
    const inSand = dmg({
      move: solarBeam,
      state: makeState({ weather: { type: TEST_IDS.weather.sand, turnsLeft: 5, source: "" } }),
      seed: 42,
    });
    const noWeather = dmg({
      move: solarBeam,
      state: makeState(),
      seed: 42,
    });
    expect(inSand).toBe(26);
    expect(noWeather).toBe(50);
  });
});

// ---------------------------------------------------------------------------
// Group 3: Type-boost items
// ---------------------------------------------------------------------------

describe("Type-boost items (Charcoal, Flame Plate, Soul Dew)", () => {
  it("given Charcoal + fire-type move (80BP), when calculating damage, then damage matches ~1.2x boost", () => {
    // Source: Showdown data/items.ts -- Charcoal: onBasePower chainModify([4915,4096]) = ~1.2x for Fire
    // Exact seeded values: withCharcoal=41, noItem=34 (ratio ≈ 1.206)
    const fireMove = makeMove({
      type: TEST_IDS.types.fire,
      power: 80,
      category: "special",
      flags: { contact: false },
    });
    const withCharcoal = dmg({
      attacker: makeActive({ heldItem: TEST_IDS.items.charcoal, spAttack: 100 }),
      move: fireMove,
      seed: 42,
    });
    const withoutItem = dmg({
      attacker: makeActive({ heldItem: null, spAttack: 100 }),
      move: fireMove,
      seed: 42,
    });
    expect(withCharcoal).toBe(41);
    expect(withoutItem).toBe(34);
  });

  it("given Flame Plate (plate item) + fire-type move (80BP), when calculating damage, then damage matches ~1.2x boost", () => {
    // Source: Showdown data/items.ts -- Flame Plate: onBasePower chainModify([4915,4096]) = ~1.2x for Fire
    // Exact seeded values: withFlamePlate=41, noItem=34 (ratio ≈ 1.206)
    const fireMove = makeMove({
      type: TEST_IDS.types.fire,
      power: 80,
      category: "special",
      flags: { contact: false },
    });
    const withFlamePlate = dmg({
      attacker: makeActive({ heldItem: TEST_IDS.items.flamePlate, spAttack: 100 }),
      move: fireMove,
      seed: 42,
    });
    const withoutItem = dmg({
      attacker: makeActive({ heldItem: null, spAttack: 100 }),
      move: fireMove,
      seed: 42,
    });
    expect(withFlamePlate).toBe(41);
    expect(withoutItem).toBe(34);
  });

  it("given Latios (speciesId=381) + soul-dew + dragon-type move (80BP), when calculating damage, then damage matches ~1.2x boost", () => {
    // Source: Showdown data/items.ts -- Soul Dew Gen 7+: onBasePower chainModify([4915,4096]) for Dragon/Psychic
    // Only works for Latias (380) or Latios (381)
    // Exact seeded values: withSoulDew=41, noItem=34 (ratio ≈ 1.206)
    const dragonMove = makeMove({
      type: TEST_IDS.types.dragon,
      power: 80,
      category: "special",
      flags: { contact: false },
    });
    const withSoulDew = dmg({
      attacker: makeActive({ speciesId: 381, heldItem: TEST_IDS.items.soulDew, spAttack: 100 }),
      move: dragonMove,
      seed: 42,
    });
    const withoutItem = dmg({
      attacker: makeActive({ speciesId: 381, heldItem: null, spAttack: 100 }),
      move: dragonMove,
      seed: 42,
    });
    expect(withSoulDew).toBe(41);
    expect(withoutItem).toBe(34);
  });

  it("given Latias (speciesId=380) + soul-dew + psychic-type move (90BP), when calculating damage, then damage matches ~1.2x boost", () => {
    // Source: Showdown data/items.ts -- Soul Dew Gen 7+: also works for Latias (380) + Psychic
    // Exact seeded values: withSoulDew=46, noItem=38 (ratio ≈ 1.211)
    const psychicMove = makeMove({
      type: TEST_IDS.types.psychic,
      power: 90,
      category: "special",
      flags: { contact: false },
    });
    const withSoulDew = dmg({
      attacker: makeActive({ speciesId: 380, heldItem: TEST_IDS.items.soulDew, spAttack: 100 }),
      move: psychicMove,
      seed: 42,
    });
    const withoutItem = dmg({
      attacker: makeActive({ speciesId: 380, heldItem: null, spAttack: 100 }),
      move: psychicMove,
      seed: 42,
    });
    expect(withSoulDew).toBe(46);
    expect(withoutItem).toBe(38);
  });
});

// ---------------------------------------------------------------------------
// Group 4: Knock Off power boost
// ---------------------------------------------------------------------------

describe("Knock Off: 1.5x power when target holds removable item", () => {
  it("given knock-off move + defender holding leftovers, when calculating damage, then damage is 1.5x the no-item result", () => {
    // Source: Showdown data/moves.ts -- knockoff: onBasePower: chainModify([6144,4096]) = 1.5x if target has item
    // Source: Bulbapedia "Knock Off" Gen 6+ -- 1.5x damage if target has removable item
    // Exact seeded values: withItem=41, noItem=28 (ratio ≈ 1.46 due to integer rounding)
    const knockOff = makeMove({ id: TEST_IDS.moves.knockOff, type: TEST_IDS.types.dark, power: 65, category: "physical" });
    const defenderWithItem = makeActive({ heldItem: TEST_IDS.items.leftovers, defense: 100 });
    const defenderNoItem = makeActive({ heldItem: null, defense: 100 });
    const withItem = dmg({ move: knockOff, defender: defenderWithItem, seed: 42 });
    const noItem = dmg({ move: knockOff, defender: defenderNoItem, seed: 42 });
    expect(withItem).toBe(41);
    expect(noItem).toBe(28);
  });

  it("given knock-off move + defender holding sitrus-berry (removable), when calculating damage, then same 1.5x boost applies", () => {
    // Source: Showdown data/moves.ts -- knockoff 1.5x boost applies to any removable item
    // sitrus-berry is also removable; same boost applies
    // Exact seeded values: withSitrus=41, noItem=28 (identical to leftovers case)
    const knockOff = makeMove({ id: TEST_IDS.moves.knockOff, type: TEST_IDS.types.dark, power: 65, category: "physical" });
    const defenderWithSitrus = makeActive({ heldItem: TEST_IDS.items.sitrusBerry, defense: 100 });
    const defenderNoItem = makeActive({ heldItem: null, defense: 100 });
    const withSitrus = dmg({ move: knockOff, defender: defenderWithSitrus, seed: 42 });
    const noItem = dmg({ move: knockOff, defender: defenderNoItem, seed: 42 });
    expect(withSitrus).toBe(41);
    expect(noItem).toBe(28);
  });
});

// ---------------------------------------------------------------------------
// Group 5: Pinch abilities (Blaze at low HP)
// ---------------------------------------------------------------------------

describe("Pinch abilities: 1.5x power at or below 1/3 HP", () => {
  it("given Blaze attacker + fire move + HP at or below 1/3 max HP, when calculating damage, then damage is 1.5x the full-HP result", () => {
    // Source: Bulbapedia "Blaze" -- 1.5x power for Fire moves when HP <= 1/3 max HP
    // Source: Showdown data/abilities.ts -- Blaze: pinch ability check
    // floor(150/3)=50; at 50 HP Blaze activates. Exact seeded values: low=50, full=34
    const maxHp = 150;
    const threshold = Math.floor(maxHp / 3); // = 50
    const fireMove = makeMove({
      type: TEST_IDS.types.fire,
      power: 80,
      category: "special",
      flags: { contact: false },
    });
    const lowHpDmg = dmg({
      attacker: makeActive({ ability: TEST_IDS.abilities.blaze, hp: maxHp, currentHp: threshold, spAttack: 100 }),
      move: fireMove,
      seed: 42,
    });
    const fullHpDmg = dmg({
      attacker: makeActive({ ability: TEST_IDS.abilities.blaze, hp: maxHp, currentHp: maxHp, spAttack: 100 }),
      move: fireMove,
      seed: 42,
    });
    expect(lowHpDmg).toBe(50);
    expect(fullHpDmg).toBe(34);
  });

  it("given Torrent attacker + water move + HP at or below 1/3 max HP, when calculating damage, then damage is 1.5x the full-HP result", () => {
    // Source: Bulbapedia "Torrent" -- 1.5x power for Water moves when HP <= 1/3 max HP
    // Source: Showdown data/abilities.ts -- Torrent: same pinch ability check as Blaze
    // Exact seeded values: low=50, full=34 (same formula as Blaze with water/fire swap)
    const maxHp = 150;
    const threshold = Math.floor(maxHp / 3); // = 50
    const waterMove = makeMove({
      type: TEST_IDS.types.water,
      power: 80,
      category: "special",
      flags: { contact: false },
    });
    const lowHpDmg = dmg({
      attacker: makeActive({ ability: TEST_IDS.abilities.torrent, hp: maxHp, currentHp: threshold, spAttack: 100 }),
      move: waterMove,
      seed: 42,
    });
    const fullHpDmg = dmg({
      attacker: makeActive({ ability: TEST_IDS.abilities.torrent, hp: maxHp, currentHp: maxHp, spAttack: 100 }),
      move: waterMove,
      seed: 42,
    });
    expect(lowHpDmg).toBe(50);
    expect(fullHpDmg).toBe(34);
  });
});

// ---------------------------------------------------------------------------
// Group 6: Flash Fire volatile
// ---------------------------------------------------------------------------

describe("Flash Fire volatile: 1.5x power for Fire moves", () => {
  it("given attacker with flash-fire volatile status + fire-type move (80BP), when calculating damage, then damage is 1.5x the non-volatile result", () => {
    // Source: Showdown data/abilities.ts -- Flash Fire: onBasePower 1.5x for Fire after absorbing fire hit
    // Exact seeded values: flashFire=50, noFlashFire=34 (ratio ≈ 1.47 due to integer rounding)
    const flashFireVolatile = new Map([[TEST_IDS.abilities.flashFire, { turnsLeft: 255 }]]);
    const fireMove = makeMove({
      type: TEST_IDS.types.fire,
      power: 80,
      category: "special",
      flags: { contact: false },
    });
    const withFlashFire = dmg({
      attacker: makeActive({ volatiles: flashFireVolatile, spAttack: 100 }),
      move: fireMove,
      seed: 42,
    });
    const withoutFlashFire = dmg({
      attacker: makeActive({ volatiles: new Map(), spAttack: 100 }),
      move: fireMove,
      seed: 42,
    });
    expect(withFlashFire).toBe(50);
    expect(withoutFlashFire).toBe(34);
  });

  it("given attacker with flash-fire volatile status + fire-type move (100BP), when calculating damage, then damage is 1.5x the non-volatile result", () => {
    // Source: Showdown data/abilities.ts -- Flash Fire: same 1.5x boost for higher base power
    // Exact seeded values: flashFire=63, noFlashFire=43 (ratio ≈ 1.47 due to integer rounding)
    const flashFireVolatile = new Map([[TEST_IDS.abilities.flashFire, { turnsLeft: 255 }]]);
    const fireMove100 = makeMove({
      type: TEST_IDS.types.fire,
      power: 100,
      category: "special",
      flags: { contact: false },
    });
    const withFlashFire100 = dmg({
      attacker: makeActive({ volatiles: flashFireVolatile, spAttack: 100 }),
      move: fireMove100,
      seed: 42,
    });
    const withoutFlashFire100 = dmg({
      attacker: makeActive({ volatiles: new Map(), spAttack: 100 }),
      move: fireMove100,
      seed: 42,
    });
    expect(withFlashFire100).toBe(63);
    expect(withoutFlashFire100).toBe(43);
  });
});

// ---------------------------------------------------------------------------
// Group 7: Dry Skin fire weakness
// ---------------------------------------------------------------------------

describe("Dry Skin: 1.25x power for incoming fire moves", () => {
  it("given Dry Skin defender + fire-type move (80BP), when calculating damage, then damage is 1.25x the non-ability result", () => {
    // Source: Showdown data/abilities.ts -- Dry Skin: onBasePower 1.25x for incoming Fire moves
    // Exact seeded values: withDrySkin=43, withoutDrySkin=34 (ratio ≈ 1.26 due to integer rounding)
    const fireMove = makeMove({
      type: TEST_IDS.types.fire,
      power: 80,
      category: "special",
      flags: { contact: false },
    });
    const withDrySkin = dmg({
      attacker: makeActive({ spAttack: 100 }),
      defender: makeActive({ ability: TEST_IDS.abilities.drySkin, spDefense: 100 }),
      move: fireMove,
      seed: 42,
    });
    const withoutDrySkin = dmg({
      attacker: makeActive({ spAttack: 100 }),
      defender: makeActive({ ability: TEST_IDS.abilities.none, spDefense: 100 }),
      move: fireMove,
      seed: 42,
    });
    expect(withDrySkin).toBe(43);
    expect(withoutDrySkin).toBe(34);
  });

  it("given Dry Skin defender + fire-type move (100BP), when calculating damage, then damage is 1.25x the non-ability result", () => {
    // Source: Showdown data/abilities.ts -- Dry Skin: same 1.25x boost at higher base power
    // Exact seeded values: withDrySkin=53, withoutDrySkin=43 (ratio ≈ 1.23 due to integer rounding)
    const fireMove100 = makeMove({
      type: TEST_IDS.types.fire,
      power: 100,
      category: "special",
      flags: { contact: false },
    });
    const withDrySkin100 = dmg({
      attacker: makeActive({ spAttack: 100 }),
      defender: makeActive({ ability: TEST_IDS.abilities.drySkin, spDefense: 100 }),
      move: fireMove100,
      seed: 42,
    });
    const withoutDrySkin100 = dmg({
      attacker: makeActive({ spAttack: 100 }),
      defender: makeActive({ ability: TEST_IDS.abilities.none, spDefense: 100 }),
      move: fireMove100,
      seed: 42,
    });
    expect(withDrySkin100).toBe(53);
    expect(withoutDrySkin100).toBe(43);
  });
});

// ---------------------------------------------------------------------------
// Group 8: Technician
// ---------------------------------------------------------------------------

describe("Technician: 1.5x power for moves with base power <= 60", () => {
  it("given Technician + power=50 move, when calculating damage, then damage matches 50*1.5=75BP effective", () => {
    // Source: Showdown data/abilities.ts -- Technician: 1.5x power if basePower <= 60
    // A 50BP move with Technician becomes effectively 75BP.
    // A 65BP move gets no Technician boost, so stays at 65BP.
    // Exact seeded values: techLow(50BP)=48, techHigh(65BP)=42
    const lowPowerMove = makeMove({ power: 50, flags: { contact: false } });
    const highPowerMove = makeMove({ power: 65, flags: { contact: false } });
    const techLow = dmg({
      attacker: makeActive({ ability: TEST_IDS.abilities.technician, attack: 100 }),
      move: lowPowerMove,
      seed: 42,
    });
    const techHigh = dmg({
      attacker: makeActive({ ability: TEST_IDS.abilities.technician, attack: 100 }),
      move: highPowerMove,
      seed: 42,
    });
    expect(techLow).toBe(48);
    expect(techHigh).toBe(42);
  });

  it("given Technician + power=40 move, when calculating damage, then damage is boosted but below power=70 (no boost)", () => {
    // Source: Showdown data/abilities.ts -- Technician: 1.5x for 40BP = effective 60BP < 70BP
    // A 40BP move with Technician becomes 60BP effective; a 70BP move stays at 70BP.
    // Exact seeded values: techLow(40BP)=39, techHigh(70BP)=45
    const lowPowerMove2 = makeMove({ power: 40, flags: { contact: false } });
    const highPowerMove2 = makeMove({ power: 70, flags: { contact: false } });
    const techLow2 = dmg({
      attacker: makeActive({ ability: TEST_IDS.abilities.technician, attack: 100 }),
      move: lowPowerMove2,
      seed: 42,
    });
    const techHigh2 = dmg({
      attacker: makeActive({ ability: TEST_IDS.abilities.technician, attack: 100 }),
      move: highPowerMove2,
      seed: 42,
    });
    expect(techLow2).toBe(39);
    expect(techHigh2).toBe(45);
  });
});

// ---------------------------------------------------------------------------
// Group 9: Iron Fist / Tough Claws / Strong Jaw / Mega Launcher
// ---------------------------------------------------------------------------

describe("Iron Fist: 1.2x power for punching moves", () => {
  it("given Iron Fist + punch move (80BP, flags.punch=true), when calculating damage, then damage matches 1.2x boost", () => {
    // Source: Showdown data/abilities.ts -- Iron Fist: onBasePower 1.2x for punch flag
    // Exact seeded values: withIronFist=61, without=51 (ratio ≈ 1.196)
    const punchMove = makeMove({ power: 80, flags: { punch: true, contact: true } });
    const withIronFist = dmg({
      attacker: makeActive({ ability: TEST_IDS.abilities.ironFist, attack: 100 }),
      move: punchMove,
      seed: 42,
    });
    const withoutAbility = dmg({
      attacker: makeActive({ ability: TEST_IDS.abilities.none, attack: 100 }),
      move: punchMove,
      seed: 42,
    });
    expect(withIronFist).toBe(61);
    expect(withoutAbility).toBe(51);
  });

  it("given Iron Fist + punch move (60BP, flags.punch=true), when calculating damage, then damage matches 1.2x boost", () => {
    // Source: Showdown data/abilities.ts -- Iron Fist: same 1.2x boost at lower base power
    // Exact seeded values: withIronFist=46, without=39 (ratio ≈ 1.179)
    const punchMove60 = makeMove({ power: 60, flags: { punch: true, contact: true } });
    const withIronFist60 = dmg({
      attacker: makeActive({ ability: TEST_IDS.abilities.ironFist, attack: 100 }),
      move: punchMove60,
      seed: 42,
    });
    const withoutAbility60 = dmg({
      attacker: makeActive({ ability: TEST_IDS.abilities.none, attack: 100 }),
      move: punchMove60,
      seed: 42,
    });
    expect(withIronFist60).toBe(46);
    expect(withoutAbility60).toBe(39);
  });
});

describe("Tough Claws: ~1.3x power for contact moves", () => {
  it("given Tough Claws + contact move (80BP), when calculating damage, then damage matches 1.3x boost", () => {
    // Source: Showdown data/abilities.ts -- Tough Claws: onBasePower chainModify([5325,4096]) = ~1.3x for contact
    // Exact seeded values: contact=66, nonContact=51 (ratio ≈ 1.294)
    const contactMove = makeMove({ power: 80, flags: { contact: true } });
    const nonContactMove = makeMove({ power: 80, flags: { contact: false } });
    const withContact = dmg({
      attacker: makeActive({ ability: TEST_IDS.abilities.toughClaws, attack: 100 }),
      move: contactMove,
      seed: 42,
    });
    const withoutContact = dmg({
      attacker: makeActive({ ability: TEST_IDS.abilities.toughClaws, attack: 100 }),
      move: nonContactMove,
      seed: 42,
    });
    expect(withContact).toBe(66);
    expect(withoutContact).toBe(51);
  });

  it("given Tough Claws + contact move (60BP), when calculating damage, then damage matches 1.3x boost", () => {
    // Source: Showdown data/abilities.ts -- Tough Claws: same ~1.3x boost at 60BP
    // Exact seeded values: contact=49, nonContact=39 (ratio ≈ 1.256)
    const contactMove60 = makeMove({ power: 60, flags: { contact: true } });
    const nonContactMove60 = makeMove({ power: 60, flags: { contact: false } });
    const withContact60 = dmg({
      attacker: makeActive({ ability: TEST_IDS.abilities.toughClaws, attack: 100 }),
      move: contactMove60,
      seed: 42,
    });
    const withoutContact60 = dmg({
      attacker: makeActive({ ability: TEST_IDS.abilities.toughClaws, attack: 100 }),
      move: nonContactMove60,
      seed: 42,
    });
    expect(withContact60).toBe(49);
    expect(withoutContact60).toBe(39);
  });
});

describe("Strong Jaw: 1.5x power for bite moves", () => {
  it("given Strong Jaw + bite move (60BP, flags.bite=true), when calculating damage, then damage matches 1.5x boost", () => {
    // Source: Showdown data/abilities.ts -- Strong Jaw: onBasePower chainModify([6144,4096]) = 1.5x for bite
    // Exact seeded values: withStrongJaw=57, without=39 (ratio ≈ 1.46 due to integer rounding)
    const biteMove = makeMove({ power: 60, flags: { bite: true, contact: true } });
    const withStrongJaw = dmg({
      attacker: makeActive({ ability: TEST_IDS.abilities.strongJaw, attack: 100 }),
      move: biteMove,
      seed: 42,
    });
    const withoutAbility = dmg({
      attacker: makeActive({ ability: TEST_IDS.abilities.none, attack: 100 }),
      move: biteMove,
      seed: 42,
    });
    expect(withStrongJaw).toBe(57);
    expect(withoutAbility).toBe(39);
  });

  it("given Strong Jaw + bite move (80BP, flags.bite=true), when calculating damage, then damage matches 1.5x boost", () => {
    // Source: Showdown data/abilities.ts -- Strong Jaw: same 1.5x boost at higher base power
    // Exact seeded values: withStrongJaw=75, without=51 (ratio ≈ 1.47 due to integer rounding)
    const biteMove80 = makeMove({ power: 80, flags: { bite: true, contact: true } });
    const withStrongJaw80 = dmg({
      attacker: makeActive({ ability: TEST_IDS.abilities.strongJaw, attack: 100 }),
      move: biteMove80,
      seed: 42,
    });
    const withoutAbility80 = dmg({
      attacker: makeActive({ ability: TEST_IDS.abilities.none, attack: 100 }),
      move: biteMove80,
      seed: 42,
    });
    expect(withStrongJaw80).toBe(75);
    expect(withoutAbility80).toBe(51);
  });
});

describe("Mega Launcher: 1.5x power for pulse moves", () => {
  it("given Mega Launcher + pulse move (80BP, flags.pulse=true), when calculating damage, then damage matches 1.5x boost", () => {
    // Source: Showdown data/abilities.ts -- Mega Launcher: onBasePower chainModify([6144,4096]) = 1.5x for pulse
    // Exact seeded values: withMegaLauncher=75, without=51 (ratio ≈ 1.47 due to integer rounding)
    const pulseMove = makeMove({
      power: 80,
      category: "special",
      flags: { pulse: true, contact: false },
    });
    const withMegaLauncher = dmg({
      attacker: makeActive({ ability: TEST_IDS.abilities.megaLauncher, spAttack: 100 }),
      move: pulseMove,
      seed: 42,
    });
    const withoutAbility = dmg({
      attacker: makeActive({ ability: TEST_IDS.abilities.none, spAttack: 100 }),
      move: pulseMove,
      seed: 42,
    });
    expect(withMegaLauncher).toBe(75);
    expect(withoutAbility).toBe(51);
  });

  it("given Mega Launcher + pulse move (90BP, flags.pulse=true), when calculating damage, then damage matches 1.5x boost", () => {
    // Source: Showdown data/abilities.ts -- Mega Launcher: same 1.5x boost at 90BP
    // Exact seeded values: withMegaLauncher=85, without=57 (ratio ≈ 1.49 due to integer rounding)
    const pulseMove90 = makeMove({
      power: 90,
      category: "special",
      flags: { pulse: true, contact: false },
    });
    const withMegaLauncher90 = dmg({
      attacker: makeActive({ ability: TEST_IDS.abilities.megaLauncher, spAttack: 100 }),
      move: pulseMove90,
      seed: 42,
    });
    const withoutAbility90 = dmg({
      attacker: makeActive({ ability: TEST_IDS.abilities.none, spAttack: 100 }),
      move: pulseMove90,
      seed: 42,
    });
    expect(withMegaLauncher90).toBe(85);
    expect(withoutAbility90).toBe(57);
  });
});

// ---------------------------------------------------------------------------
// Group 10: Reckless and Sheer Force
// ---------------------------------------------------------------------------

describe("Reckless: 1.2x power for moves with recoil/crash", () => {
  it("given Reckless + move with hasCrashDamage=true (120BP), when calculating damage, then damage matches 1.2x boost", () => {
    // Source: Showdown data/abilities.ts -- Reckless: 1.2x for moves with recoil or crash
    // Exact seeded values: withCrash=91, withoutCrash=75 (ratio ≈ 1.213)
    const crashMove = makeMove({ power: 120, hasCrashDamage: true, flags: { contact: true } });
    const normalMove = makeMove({ power: 120, hasCrashDamage: false, flags: { contact: true } });
    const withCrash = dmg({
      attacker: makeActive({ ability: TEST_IDS.abilities.reckless, attack: 100 }),
      move: crashMove,
      seed: 42,
    });
    const withoutCrash = dmg({
      attacker: makeActive({ ability: TEST_IDS.abilities.reckless, attack: 100 }),
      move: normalMove,
      seed: 42,
    });
    expect(withCrash).toBe(91);
    expect(withoutCrash).toBe(75);
  });

  it("given Reckless + move with recoil effect (90BP), when calculating damage, then damage matches 1.2x boost", () => {
    // Source: Showdown data/abilities.ts -- Reckless: also boosts recoil moves
    // Exact seeded values: withReckless=69, withoutReckless=57 (ratio ≈ 1.21)
    const recoilEffect: MoveEffect = { type: "recoil", fraction: [1, 3] };
    const recoilMove = makeMove({ power: 90, effect: recoilEffect, flags: { contact: true } });
    const withReckless = dmg({
      attacker: makeActive({ ability: TEST_IDS.abilities.reckless, attack: 100 }),
      move: recoilMove,
      seed: 42,
    });
    const withoutReckless = dmg({
      attacker: makeActive({ ability: TEST_IDS.abilities.none, attack: 100 }),
      move: recoilMove,
      seed: 42,
    });
    expect(withReckless).toBe(69);
    expect(withoutReckless).toBe(57);
  });
});

describe("Sheer Force: ~1.3x power for moves with secondary effects", () => {
  it("given Sheer Force + move with status-chance effect (80BP), when calculating damage, then damage matches ~1.3x boost", () => {
    // Source: Showdown data/abilities.ts -- Sheer Force: chainModify([5325,4096]) for moves with secondaries
    // Exact seeded values: withSheerForce=66, withoutAbility=51 (ratio ≈ 1.294)
    const statusChanceEffect: MoveEffect = { type: "status-chance", chance: 30, status: TEST_IDS.statuses.burn };
    const statusChanceMove = makeMove({
      power: 80,
      category: "special",
      effect: statusChanceEffect,
      flags: { contact: false },
    });
    const withSheerForce = dmg({
      attacker: makeActive({ ability: TEST_IDS.abilities.sheerForce, spAttack: 100 }),
      move: statusChanceMove,
      seed: 42,
    });
    const withoutAbility = dmg({
      attacker: makeActive({ ability: TEST_IDS.abilities.none, spAttack: 100 }),
      move: statusChanceMove,
      seed: 42,
    });
    expect(withSheerForce).toBe(66);
    expect(withoutAbility).toBe(51);
  });
});

// ---------------------------------------------------------------------------
// Group 11: Venoshock, Hex, Acrobatics
// ---------------------------------------------------------------------------

describe("Venoshock: doubles power when target is poisoned", () => {
  it("given Venoshock + defender with poison status, when calculating damage, then damage is double no-poison scenario", () => {
    // Source: Showdown data/moves.ts -- venoshock: onBasePower chainModify(2) if target poisoned
    // Exact seeded values: poisoned=55, healthy=28 (ratio ≈ 1.96 due to integer rounding of 2x)
    const venoshock = makeMove({
      id: TEST_IDS.moves.venoshock,
      type: TEST_IDS.statuses.poison,
      power: 65,
      category: "special",
      flags: { contact: false },
    });
    const poisonedDmg = dmg({
      defender: makeActive({ status: TEST_IDS.statuses.poison, types: [TEST_IDS.types.normal], spDefense: 100 }),
      move: venoshock,
      seed: 42,
    });
    const healthyDmg = dmg({
      defender: makeActive({ status: null, types: [TEST_IDS.types.normal], spDefense: 100 }),
      move: venoshock,
      seed: 42,
    });
    expect(poisonedDmg).toBe(55);
    expect(healthyDmg).toBe(28);
  });

  it("given Venoshock + defender with badly-poisoned status, when calculating damage, then damage is same as poison (2x boost)", () => {
    // Source: Showdown data/moves.ts -- venoshock: onBasePower also doubles for badly-poisoned
    // Exact seeded values: badlyPoisoned=55, healthy=28 (same multiplier as poison)
    const venoshock = makeMove({
      id: TEST_IDS.moves.venoshock,
      type: TEST_IDS.statuses.poison,
      power: 65,
      category: "special",
      flags: { contact: false },
    });
    const badlyPoisonedDmg = dmg({
      defender: makeActive({ status: TEST_IDS.statuses.badlyPoisoned, types: [TEST_IDS.types.normal], spDefense: 100 }),
      move: venoshock,
      seed: 42,
    });
    const healthyDmg = dmg({
      defender: makeActive({ status: null, types: [TEST_IDS.types.normal], spDefense: 100 }),
      move: venoshock,
      seed: 42,
    });
    expect(badlyPoisonedDmg).toBe(55);
    expect(healthyDmg).toBe(28);
  });
});

describe("Hex: doubles power when target has any status condition", () => {
  it("given Hex + defender with sleep status (Psychic-type to avoid Ghost immunity), when calculating damage, then damage is double no-status", () => {
    // Source: Showdown data/moves.ts -- hex: onBasePower chainModify(2) if target has status
    // Ghost vs Normal = 0 (immune). Use Psychic-type defender so Ghost hits for 1x.
    // Exact seeded values: sleep=110, healthy=56 (ratio ≈ 1.96 due to integer rounding of 2x)
    const hex = makeMove({
      id: TEST_IDS.moves.hex,
      type: TEST_IDS.types.ghost,
      power: 65,
      category: "special",
      flags: { contact: false },
    });
    const sleepDmg = dmg({
      defender: makeActive({ status: TEST_IDS.statuses.sleep, types: [TEST_IDS.types.psychic], spDefense: 100 }),
      move: hex,
      seed: 42,
    });
    const healthyDmg = dmg({
      defender: makeActive({ status: null, types: [TEST_IDS.types.psychic], spDefense: 100 }),
      move: hex,
      seed: 42,
    });
    expect(sleepDmg).toBe(110);
    expect(healthyDmg).toBe(56);
  });
});

describe("Acrobatics: doubles power when attacker has no held item", () => {
  it("given Acrobatics + attacker with no held item, when calculating damage, then damage is double the held-item scenario", () => {
    // Source: Showdown data/moves.ts -- Acrobatics: basePowerCallback doubles power if user has no item
    // Exact seeded values: noItem=70, hasItem=36 (ratio ≈ 1.94 due to STAB on flying + integer rounding)
    const acrobatics = makeMove({
      id: TEST_IDS.moves.acrobatics,
      type: TEST_IDS.types.flying,
      power: 55,
      category: "physical",
      flags: { contact: true },
    });
    const noItemDmg = dmg({
      attacker: makeActive({ heldItem: null, ability: TEST_IDS.abilities.none, types: [TEST_IDS.types.flying] }),
      move: acrobatics,
      seed: 42,
    });
    const hasItemDmg = dmg({
      attacker: makeActive({ heldItem: TEST_IDS.items.oranBerry, ability: TEST_IDS.abilities.none, types: [TEST_IDS.types.flying] }),
      move: acrobatics,
      seed: 42,
    });
    // No item → 2x power → significantly more damage
    expect(noItemDmg).toBe(70);
    expect(hasItemDmg).toBe(36);
  });
});

// ---------------------------------------------------------------------------
// Group 12: Rivalry
// ---------------------------------------------------------------------------

describe("Rivalry: gender-dependent power modifier", () => {
  it("given Rivalry + male attacker + male defender (same gender), when calculating damage, then damage matches 1.25x boost vs genderless baseline", () => {
    // Source: Showdown data/abilities.ts -- Rivalry: 1.25x if same gender, 0.75x if opposite
    // Exact seeded values: sameGender=64, genderless=51, opposite=39
    const rivalryMove = makeMove({ power: 80, flags: { contact: false } });
    const sameGenderDmg = dmg({
      attacker: makeActive({ ability: TEST_IDS.abilities.rivalry, gender: "male" }),
      defender: makeActive({ gender: "male" }),
      move: rivalryMove,
      seed: 42,
    });
    // Genderless vs genderless gives no rivalry modifier
    const genderlessDmg = dmg({
      attacker: makeActive({ ability: TEST_IDS.abilities.rivalry, gender: "genderless" }),
      defender: makeActive({ gender: "genderless" }),
      move: rivalryMove,
      seed: 42,
    });
    // Same gender → 1.25x boost vs no boost
    expect(sameGenderDmg).toBe(64);
    expect(genderlessDmg).toBe(51);
  });

  it("given Rivalry + male attacker + female defender (opposite gender), when calculating damage, then damage matches 0.75x penalty vs genderless baseline", () => {
    // Source: Showdown data/abilities.ts -- Rivalry: 0.75x if opposite gender
    // Exact seeded values: opposite=39, genderless=51
    const rivalryMove = makeMove({ power: 80, flags: { contact: false } });
    const oppositeGenderDmg = dmg({
      attacker: makeActive({ ability: TEST_IDS.abilities.rivalry, gender: "male" }),
      defender: makeActive({ gender: "female" }),
      move: rivalryMove,
      seed: 42,
    });
    const genderlessDmg = dmg({
      attacker: makeActive({ ability: TEST_IDS.abilities.rivalry, gender: "genderless" }),
      defender: makeActive({ gender: "genderless" }),
      move: rivalryMove,
      seed: 42,
    });
    // Opposite gender → 0.75x penalty vs no modifier
    expect(oppositeGenderDmg).toBe(39);
    expect(genderlessDmg).toBe(51);
  });
});

// ---------------------------------------------------------------------------
// Group 13: Adamant / Lustrous / Griseous Orbs
// ---------------------------------------------------------------------------

describe("Adamant / Lustrous / Griseous Orbs: ~1.2x power for specific types on specific Pokemon", () => {
  it("given Dialga (speciesId=483) + adamant-orb + steel-type move (80BP), when calculating damage, then damage matches ~1.2x boost", () => {
    // Source: Showdown data/items.ts -- Adamant Orb: chainModify([4915,4096]) for Dragon/Steel on Dialga (483)
    // Exact seeded values: withAdamantOrb=41, noItem=34 (ratio ≈ 1.206)
    const steelMove = makeMove({
      type: TEST_IDS.types.steel,
      power: 80,
      category: "physical",
      flags: { contact: false },
    });
    const withAdamantOrb = dmg({
      attacker: makeActive({ speciesId: 483, heldItem: TEST_IDS.items.adamantOrb, attack: 100 }),
      move: steelMove,
      seed: 42,
    });
    const withoutItem = dmg({
      attacker: makeActive({ speciesId: 483, heldItem: null, attack: 100 }),
      move: steelMove,
      seed: 42,
    });
    expect(withAdamantOrb).toBe(41);
    expect(withoutItem).toBe(34);
  });

  it("given Palkia (speciesId=484) + lustrous-orb + dragon-type move (80BP), when calculating damage, then damage matches ~1.2x boost", () => {
    // Source: Showdown data/items.ts -- Lustrous Orb: chainModify([4915,4096]) for Water/Dragon on Palkia (484)
    // Exact seeded values: withLustrousOrb=41, noItem=34 (ratio ≈ 1.206)
    const dragonMove = makeMove({
      type: TEST_IDS.types.dragon,
      power: 80,
      category: "special",
      flags: { contact: false },
    });
    const withLustrousOrb = dmg({
      attacker: makeActive({ speciesId: 484, heldItem: TEST_IDS.items.lustrousOrb, spAttack: 100 }),
      move: dragonMove,
      seed: 42,
    });
    const withoutItem = dmg({
      attacker: makeActive({ speciesId: 484, heldItem: null, spAttack: 100 }),
      move: dragonMove,
      seed: 42,
    });
    expect(withLustrousOrb).toBe(41);
    expect(withoutItem).toBe(34);
  });

  it("given Giratina (speciesId=487) + griseous-orb + ghost-type move (80BP, Psychic defender), when calculating damage, then damage matches ~1.2x boost", () => {
    // Source: Showdown data/items.ts -- Griseous Orb: chainModify([4915,4096]) for Ghost/Dragon on Giratina (487)
    // Ghost vs Normal = 0 (immune). Use Psychic-type defender so Ghost hits for 1x.
    // Exact seeded values: withGriseousOrb=82, noItem=68 (ratio ≈ 1.206)
    const ghostMove = makeMove({
      type: TEST_IDS.types.ghost,
      power: 80,
      category: "physical",
      flags: { contact: false },
    });
    const withGriseousOrb = dmg({
      attacker: makeActive({ speciesId: 487, heldItem: TEST_IDS.items.griseousOrb, attack: 100 }),
      defender: makeActive({ types: [TEST_IDS.types.psychic], defense: 100 }),
      move: ghostMove,
      seed: 42,
    });
    const withoutItem = dmg({
      attacker: makeActive({ speciesId: 487, heldItem: null, attack: 100 }),
      defender: makeActive({ types: [TEST_IDS.types.psychic], defense: 100 }),
      move: ghostMove,
      seed: 42,
    });
    expect(withGriseousOrb).toBe(82);
    expect(withoutItem).toBe(68);
  });
});

// ---------------------------------------------------------------------------
// Group 14: Terrain boost and Grassy halved
// ---------------------------------------------------------------------------

describe("Terrain power modifiers", () => {
  it("given Electric Terrain active + electric-type move (90BP) + grounded attacker, when calculating damage, then damage matches 1.3x boost", () => {
    // Source: Showdown data/mods/gen8/scripts.ts -- terrain boost 1.3x (5325/4096) in Gen 8
    // Exact seeded values: withTerrain=49, noTerrain=38 (ratio ≈ 1.289)
    const electricMove = makeMove({
      type: TEST_IDS.types.electric,
      power: 90,
      category: "special",
      flags: { contact: false },
    });
    // Grounded attacker (no flying type, no levitate, no air balloon)
    const attacker = makeActive({ types: [TEST_IDS.types.normal], spAttack: 100 });
    const withTerrain = dmg({
      attacker,
      move: electricMove,
      state: makeState({ terrain: { type: TEST_IDS.types.electric, turnsLeft: 5, source: "" } }),
      seed: 42,
    });
    const noTerrain = dmg({
      attacker,
      move: electricMove,
      state: makeState(),
      seed: 42,
    });
    expect(withTerrain).toBe(49);
    expect(noTerrain).toBe(38);
  });

  it("given Grassy Terrain active + earthquake (100BP) vs grounded defender, when calculating damage, then damage matches 0.5x halve", () => {
    // Source: Showdown data/conditions.ts -- grassyterrain.onModifyDamage: halves Earthquake/Bulldoze/Magnitude
    // Exact seeded values: withTerrain=22, noTerrain=43 (ratio ≈ 0.512 due to integer rounding)
    const earthquake = makeMove({
      id: TEST_IDS.moves.earthquake,
      type: TEST_IDS.types.ground,
      power: 100,
      category: "physical",
      flags: { contact: false },
    });
    // Both attacker and defender are grounded (normal type)
    const withTerrain = dmg({
      attacker: makeActive({ types: [TEST_IDS.types.normal], attack: 100 }),
      defender: makeActive({ types: [TEST_IDS.types.normal], defense: 100 }),
      move: earthquake,
      state: makeState({ terrain: { type: TEST_IDS.terrain.grassy, turnsLeft: 5, source: "" } }),
      seed: 42,
    });
    const noTerrain = dmg({
      attacker: makeActive({ types: [TEST_IDS.types.normal], attack: 100 }),
      defender: makeActive({ types: [TEST_IDS.types.normal], defense: 100 }),
      move: earthquake,
      state: makeState(),
      seed: 42,
    });
    expect(withTerrain).toBe(22);
    expect(noTerrain).toBe(43);
  });
});

// ---------------------------------------------------------------------------
// Group 15: Weather extremes (total immunity)
// ---------------------------------------------------------------------------

describe("Heavy-rain and Harsh-sun weather extremes", () => {
  it("given heavy-rain weather + fire-type move, when calculating damage, then returns 0 damage", () => {
    // Source: Showdown sim/battle-actions.ts -- heavy-rain completely blocks fire moves
    const fireMove = makeMove({
      type: TEST_IDS.types.fire,
      power: 80,
      category: "special",
      flags: { contact: false },
    });
    const result = dmg({
      move: fireMove,
      state: makeState({ weather: { type: TEST_IDS.weather.heavyRain, turnsLeft: 255, source: "" } }),
    });
    expect(result).toBe(0);
  });

  it("given harsh-sun weather + water-type move, when calculating damage, then returns 0 damage", () => {
    // Source: Showdown sim/battle-actions.ts -- harsh-sun completely blocks water moves
    const waterMove = makeMove({
      type: TEST_IDS.types.water,
      power: 90,
      category: "special",
      flags: { contact: false },
    });
    const result = dmg({
      move: waterMove,
      state: makeState({ weather: { type: TEST_IDS.weather.harshSun, turnsLeft: 255, source: "" } }),
    });
    expect(result).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// Group 16: Gravity removes Flying immunity to Ground
// ---------------------------------------------------------------------------

describe("Gravity: Ground moves hit Flying-type Pokemon", () => {
  it("given gravity active + ground-type move + flying-type defender, when calculating damage, then damage is greater than 0", () => {
    // Source: Showdown sim/battle-actions.ts -- gravity: ground moves ignore flying type immunity
    // Source: Bulbapedia "Gravity" -- "Flying-type Pokémon and those with Levitate become vulnerable
    //   to Ground-type moves."
    const groundMove = makeMove({
      type: TEST_IDS.types.ground,
      power: 80,
      category: "physical",
      flags: { contact: false },
    });
    const flyingDefender = makeActive({ types: [TEST_IDS.types.flying], defense: 100 });
    const withGravity = dmg({
      move: groundMove,
      defender: flyingDefender,
      state: makeState({ gravity: { active: true, turnsLeft: 5 } }),
    });
    // Without gravity, ground vs flying = 0 (immune)
    const noGravity = dmg({
      move: groundMove,
      defender: flyingDefender,
      state: makeState({ gravity: { active: false, turnsLeft: 0 } }),
    });
    // Exact seeded value: withGravity=34
    expect(noGravity).toBe(0);
    expect(withGravity).toBe(34);
  });
});

// ---------------------------------------------------------------------------
// Group 17: Scrappy hits Ghost type
// ---------------------------------------------------------------------------

describe("Scrappy: Normal and Fighting types hit Ghost-type Pokemon", () => {
  it("given Scrappy attacker + normal-type move vs ghost-type defender, when calculating damage, then damage is greater than 0", () => {
    // Source: Showdown data/abilities.ts -- Scrappy: Normal/Fighting hit Ghost type
    const normalMove = makeMove({
      type: TEST_IDS.types.normal,
      power: 80,
      category: "physical",
      flags: { contact: true },
    });
    const ghostDefender = makeActive({ types: [TEST_IDS.types.ghost], defense: 100 });
    const withScrappy = dmg({
      attacker: makeActive({ ability: TEST_IDS.abilities.scrappy, attack: 100 }),
      defender: ghostDefender,
      move: normalMove,
    });
    // Without Scrappy, Normal vs Ghost = 0
    const withoutScrappy = dmg({
      attacker: makeActive({ ability: TEST_IDS.abilities.none, attack: 100 }),
      defender: ghostDefender,
      move: normalMove,
    });
    // Exact seeded value: withScrappy=51
    expect(withoutScrappy).toBe(0);
    expect(withScrappy).toBe(51);
  });
});

// ---------------------------------------------------------------------------
// Group 18: Wonder Guard
// ---------------------------------------------------------------------------

describe("Wonder Guard: only super-effective moves deal damage", () => {
  it("given Wonder Guard defender + neutral-effectiveness move, when calculating damage, then returns 0 damage", () => {
    // Source: Showdown data/abilities.ts -- Wonder Guard: only SE hits land
    // Normal vs Normal = 1x (neutral) — Wonder Guard blocks it
    const normalMove = makeMove({ type: TEST_IDS.types.normal, power: 80, category: "physical" });
    const wonderGuardDef = makeActive({ ability: TEST_IDS.abilities.wonderGuard, types: [TEST_IDS.types.normal], defense: 100 });
    const result = dmg({
      defender: wonderGuardDef,
      move: normalMove,
    });
    expect(result).toBe(0);
  });

  it("given Wonder Guard defender + super-effective move (fire vs grass), when calculating damage, then damage equals the 2x SE value", () => {
    // Source: Showdown data/abilities.ts -- Wonder Guard: SE moves still deal damage
    // Fire vs Grass = 2x (super effective) — Wonder Guard allows it
    // Exact seeded value: result=68 (seed defaults to 42)
    const fireMove = makeMove({
      type: TEST_IDS.types.fire,
      power: 80,
      category: "special",
      flags: { contact: false },
    });
    const wonderGuardGrass = makeActive({
      ability: TEST_IDS.abilities.wonderGuard,
      types: [TEST_IDS.types.grass],
      spDefense: 100,
    });
    const result = dmg({
      defender: wonderGuardGrass,
      move: fireMove,
      seed: 42,
    });
    expect(result).toBe(68);
  });
});

// ---------------------------------------------------------------------------
// Group 19: Levitate Ground immunity
// ---------------------------------------------------------------------------

describe("Levitate: immune to Ground-type moves", () => {
  it("given Levitate defender + ground-type move, when calculating damage, then returns 0 damage", () => {
    // Source: Showdown data/abilities.ts -- Levitate: immunity to Ground
    const groundMove = makeMove({
      type: TEST_IDS.types.ground,
      power: 80,
      category: "physical",
      flags: { contact: false },
    });
    const levitateDefender = makeActive({ ability: TEST_IDS.abilities.levitate, types: [TEST_IDS.types.normal], defense: 100 });
    const result = dmg({
      defender: levitateDefender,
      move: groundMove,
    });
    expect(result).toBe(0);
  });

  it("given Mold Breaker attacker + Levitate defender + ground move, when calculating damage, then damage equals the base damage (Levitate bypassed)", () => {
    // Source: Showdown data/abilities.ts -- Mold Breaker bypasses Levitate
    // Exact seeded value: result=34 (same as normal ground move — Levitate does not reduce damage, just immunity)
    const groundMove = makeMove({
      type: TEST_IDS.types.ground,
      power: 80,
      category: "physical",
      flags: { contact: false },
    });
    const levitateDefender = makeActive({ ability: TEST_IDS.abilities.levitate, types: [TEST_IDS.types.normal], defense: 100 });
    const result = dmg({
      attacker: makeActive({ ability: TEST_IDS.abilities.moldBreaker, attack: 100 }),
      defender: levitateDefender,
      move: groundMove,
      seed: 42,
    });
    expect(result).toBe(34);
  });
});

// ---------------------------------------------------------------------------
// Group 20: Thick Fat and Heatproof
// ---------------------------------------------------------------------------

describe("Thick Fat: halves attacker's effective attack for Fire/Ice moves", () => {
  it("given Thick Fat defender + fire-type move (80BP), when calculating damage, then damage matches 0.5x reduction", () => {
    // Source: Showdown data/abilities.ts -- Thick Fat: halves attack stat for Fire/Ice
    // Exact seeded values: withThickFat=17, noThickFat=34 (exactly 0.5x)
    const fireMove = makeMove({
      type: TEST_IDS.types.fire,
      power: 80,
      category: "special",
      flags: { contact: false },
    });
    const withThickFat = dmg({
      defender: makeActive({ ability: TEST_IDS.abilities.thickFat, spDefense: 100 }),
      move: fireMove,
      seed: 42,
    });
    const withoutThickFat = dmg({
      defender: makeActive({ ability: TEST_IDS.abilities.none, spDefense: 100 }),
      move: fireMove,
      seed: 42,
    });
    expect(withThickFat).toBe(17);
    expect(withoutThickFat).toBe(34);
  });
});

describe("Heatproof: halves power for incoming fire moves", () => {
  it("given Heatproof defender + fire-type move (80BP), when calculating damage, then damage matches 0.5x reduction", () => {
    // Source: Showdown data/abilities.ts -- Heatproof: onBasePower halves Fire damage
    // Exact seeded values: withHeatproof=17, noHeatproof=34 (exactly 0.5x)
    const fireMove = makeMove({
      type: TEST_IDS.types.fire,
      power: 80,
      category: "special",
      flags: { contact: false },
    });
    const withHeatproof = dmg({
      defender: makeActive({ ability: TEST_IDS.abilities.heatproof, spDefense: 100 }),
      move: fireMove,
      seed: 42,
    });
    const withoutHeatproof = dmg({
      defender: makeActive({ ability: TEST_IDS.abilities.none, spDefense: 100 }),
      move: fireMove,
      seed: 42,
    });
    expect(withHeatproof).toBe(17);
    expect(withoutHeatproof).toBe(34);
  });
});

// ---------------------------------------------------------------------------
// Group 21: Post-formula modifiers — Tinted Lens, Filter/Solid Rock, Prism Armor
// ---------------------------------------------------------------------------

describe("Tinted Lens: doubles not-very-effective damage", () => {
  it("given Tinted Lens + water-type move vs grass-type defender (NVE, 0.5x), when damage calc, then damage matches 2x of NVE (effectively neutral)", () => {
    // Source: Showdown data/abilities.ts -- Tinted Lens: doubles damage if effectiveness < 1
    // Water vs Grass = 0.5x (NVE). With Tinted Lens it becomes effectively 1x.
    // Exact seeded values: withTintedLens=34, noAbility=17 (Tinted Lens doubles 0.5x → 1x)
    const waterMove = makeMove({
      type: TEST_IDS.types.water,
      power: 80,
      category: "special",
      flags: { contact: false },
    });
    const withTintedLens = dmg({
      attacker: makeActive({ ability: TEST_IDS.abilities.tintedLens, spAttack: 100 }),
      defender: makeActive({ types: [TEST_IDS.types.grass], spDefense: 100 }),
      move: waterMove,
      seed: 42,
    });
    const withoutAbility = dmg({
      attacker: makeActive({ ability: TEST_IDS.abilities.none, spAttack: 100 }),
      defender: makeActive({ types: [TEST_IDS.types.grass], spDefense: 100 }),
      move: waterMove,
      seed: 42,
    });
    // With Tinted Lens: NVE becomes 2x of NVE = neutral. Without: 0.5x penalty.
    expect(withTintedLens).toBe(34);
    expect(withoutAbility).toBe(17);
  });
});

describe("Filter / Solid Rock: 0.75x SE damage (bypassed by Mold Breaker)", () => {
  it("given Filter defender + super-effective fire move vs grass (80BP), when calculating damage, then damage matches 0.75x reduction", () => {
    // Source: Showdown data/abilities.ts -- Filter: onSourceModifyDamage 0.75x for SE, breakable by Mold Breaker
    // Exact seeded values: withFilter=51, noFilter=68 (ratio ≈ 0.75 — exactly 3/4)
    const fireMove = makeMove({
      type: TEST_IDS.types.fire,
      power: 80,
      category: "special",
      flags: { contact: false },
    });
    const withFilter = dmg({
      attacker: makeActive({ ability: TEST_IDS.abilities.none, spAttack: 100 }),
      defender: makeActive({ ability: TEST_IDS.abilities.filter, types: [TEST_IDS.types.grass], spDefense: 100 }),
      move: fireMove,
      seed: 42,
    });
    const withoutFilter = dmg({
      attacker: makeActive({ ability: TEST_IDS.abilities.none, spAttack: 100 }),
      defender: makeActive({ ability: TEST_IDS.abilities.none, types: [TEST_IDS.types.grass], spDefense: 100 }),
      move: fireMove,
      seed: 42,
    });
    expect(withFilter).toBe(51);
    expect(withoutFilter).toBe(68);
  });

  it("given Mold Breaker attacker + Filter defender + SE move, when calculating damage, then damage equals no-filter (Mold Breaker bypasses)", () => {
    // Source: Showdown data/abilities.ts -- Filter has breakable:1, Mold Breaker bypasses it
    const fireMove = makeMove({
      type: TEST_IDS.types.fire,
      power: 80,
      category: "special",
      flags: { contact: false },
    });
    const moldBreakerVsFilter = dmg({
      attacker: makeActive({ ability: TEST_IDS.abilities.moldBreaker, spAttack: 100 }),
      defender: makeActive({ ability: TEST_IDS.abilities.filter, types: [TEST_IDS.types.grass], spDefense: 100 }),
      move: fireMove,
      seed: 42,
    });
    const moldBreakerVsNone = dmg({
      attacker: makeActive({ ability: TEST_IDS.abilities.moldBreaker, spAttack: 100 }),
      defender: makeActive({ ability: TEST_IDS.abilities.none, types: [TEST_IDS.types.grass], spDefense: 100 }),
      move: fireMove,
      seed: 42,
    });
    // Mold Breaker bypasses Filter → same damage as no-ability
    expect(moldBreakerVsFilter).toBe(moldBreakerVsNone);
  });
});

describe("Prism Armor: 0.75x SE damage (NOT bypassed by Mold Breaker)", () => {
  it("given Prism Armor defender + SE fire move vs grass (80BP), when calculating damage, then damage matches 0.75x reduction", () => {
    // Source: Showdown data/abilities.ts -- Prism Armor: onSourceModifyDamage 0.75x for SE, no breakable flag
    // Exact seeded values: withPrismArmor=51, noPrismArmor=68 (ratio = 0.75)
    const fireMove = makeMove({
      type: TEST_IDS.types.fire,
      power: 80,
      category: "special",
      flags: { contact: false },
    });
    const withPrismArmor = dmg({
      attacker: makeActive({ spAttack: 100 }),
      defender: makeActive({ ability: TEST_IDS.abilities.prismArmor, types: [TEST_IDS.types.grass], spDefense: 100 }),
      move: fireMove,
      seed: 42,
    });
    const withoutPrismArmor = dmg({
      attacker: makeActive({ spAttack: 100 }),
      defender: makeActive({ ability: TEST_IDS.abilities.none, types: [TEST_IDS.types.grass], spDefense: 100 }),
      move: fireMove,
      seed: 42,
    });
    expect(withPrismArmor).toBe(51);
    expect(withoutPrismArmor).toBe(68);
  });

  it("given Mold Breaker attacker + Prism Armor defender + SE move, when calculating damage, then Prism Armor still reduces damage (not bypassed)", () => {
    // Source: Showdown data/abilities.ts -- Prism Armor has no breakable flag → Mold Breaker cannot bypass it
    // Exact seeded values: prismArmor+moldBreaker=51, noPrismArmor+moldBreaker=68 (still 0.75x reduction)
    const fireMove = makeMove({
      type: TEST_IDS.types.fire,
      power: 80,
      category: "special",
      flags: { contact: false },
    });
    const moldBreakerVsPrismArmor = dmg({
      attacker: makeActive({ ability: TEST_IDS.abilities.moldBreaker, spAttack: 100 }),
      defender: makeActive({ ability: TEST_IDS.abilities.prismArmor, types: [TEST_IDS.types.grass], spDefense: 100 }),
      move: fireMove,
      seed: 42,
    });
    const moldBreakerVsNone = dmg({
      attacker: makeActive({ ability: TEST_IDS.abilities.moldBreaker, spAttack: 100 }),
      defender: makeActive({ ability: TEST_IDS.abilities.none, types: [TEST_IDS.types.grass], spDefense: 100 }),
      move: fireMove,
      seed: 42,
    });
    // Prism Armor is not bypassed → damage is still reduced vs no-ability
    expect(moldBreakerVsPrismArmor).toBe(51);
    expect(moldBreakerVsNone).toBe(68);
  });
});

// ---------------------------------------------------------------------------
// Group 22: Screens bypassed on crit
// ---------------------------------------------------------------------------

describe("Screens: bypassed on critical hits", () => {
  it("given Reflect screen on defender side + physical move + isCrit=true, when calculating damage, then damage equals no-screen damage", () => {
    // Source: Showdown sim/battle-actions.ts -- screens do NOT apply on crits
    const physicalMove = makeMove({
      type: TEST_IDS.types.normal,
      power: 80,
      category: "physical",
      flags: { contact: false },
    });
    const defender = makeActive({ defense: 100 });

    // Put defender in sides[1]
    const sidesWithScreen = [
      { active: [], bench: [], entryHazards: {}, screens: [] },
      {
        active: [defender],
        bench: [],
        entryHazards: {},
        screens: [{ type: TEST_IDS.screens.reflect, turnsLeft: 5 }],
      },
    ];
    const stateWithScreen = makeState({ sides: sidesWithScreen });

    const critWithScreen = dmg({
      attacker: makeActive({ attack: 100 }),
      defender,
      move: physicalMove,
      state: stateWithScreen,
      isCrit: true,
      seed: 42,
    });

    // Without screen (crit removes screen effect)
    const sidesNoScreen = [
      { active: [], bench: [], entryHazards: {}, screens: [] },
      { active: [defender], bench: [], entryHazards: {}, screens: [] },
    ];
    const stateNoScreen = makeState({ sides: sidesNoScreen });

    const critNoScreen = dmg({
      attacker: makeActive({ attack: 100 }),
      defender,
      move: physicalMove,
      state: stateNoScreen,
      isCrit: true,
      seed: 42,
    });

    // On a crit, screen should be bypassed → same damage
    expect(critWithScreen).toBe(critNoScreen);
  });

  it("given Reflect screen on defender side + physical move + isCrit=false, when calculating damage, then damage is less than no-screen scenario", () => {
    // Source: Showdown sim/battle-actions.ts -- screens apply when not a crit
    const physicalMove = makeMove({
      type: TEST_IDS.types.normal,
      power: 80,
      category: "physical",
      flags: { contact: false },
    });
    const defender = makeActive({ defense: 100 });

    const sidesWithScreen = [
      { active: [], bench: [], entryHazards: {}, screens: [] },
      {
        active: [defender],
        bench: [],
        entryHazards: {},
        screens: [{ type: TEST_IDS.screens.reflect, turnsLeft: 5 }],
      },
    ];
    const stateWithScreen = makeState({ sides: sidesWithScreen });

    const noCritWithScreen = dmg({
      attacker: makeActive({ attack: 100 }),
      defender,
      move: physicalMove,
      state: stateWithScreen,
      isCrit: false,
      seed: 42,
    });

    const sidesNoScreen = [
      { active: [], bench: [], entryHazards: {}, screens: [] },
      { active: [defender], bench: [], entryHazards: {}, screens: [] },
    ];
    const stateNoScreen = makeState({ sides: sidesNoScreen });

    const noCritNoScreen = dmg({
      attacker: makeActive({ attack: 100 }),
      defender,
      move: physicalMove,
      state: stateNoScreen,
      isCrit: false,
      seed: 42,
    });

    // Screen halves damage on non-crit
    // Exact seeded values: noCritWithScreen=25, noCritNoScreen=51 (screen halves physical damage)
    expect(noCritWithScreen).toBe(25);
    expect(noCritNoScreen).toBe(51);
  });
});

// ---------------------------------------------------------------------------
// Group 23: Expert Belt and Muscle Band
// ---------------------------------------------------------------------------

describe("Expert Belt: 1.2x for super-effective moves", () => {
  it("given Expert Belt + super-effective fire move vs grass defender (80BP), when calculating damage, then damage matches ~1.2x boost", () => {
    // Source: Showdown data/items.ts -- Expert Belt: onModifyDamage chainModify([4915,4096]) = ~1.2x for SE
    // Exact seeded values: withExpertBelt=82, noItem=68 (ratio ≈ 1.206)
    const fireMove = makeMove({
      type: TEST_IDS.types.fire,
      power: 80,
      category: "special",
      flags: { contact: false },
    });
    const withExpertBelt = dmg({
      attacker: makeActive({ heldItem: TEST_IDS.items.expertBelt, spAttack: 100 }),
      defender: makeActive({ types: [TEST_IDS.types.grass], spDefense: 100 }),
      move: fireMove,
      seed: 42,
    });
    const withoutItem = dmg({
      attacker: makeActive({ heldItem: null, spAttack: 100 }),
      defender: makeActive({ types: [TEST_IDS.types.grass], spDefense: 100 }),
      move: fireMove,
      seed: 42,
    });
    expect(withExpertBelt).toBe(82);
    expect(withoutItem).toBe(68);
  });

  it("given Expert Belt + neutral-effectiveness move, when calculating damage, then damage equals no-item scenario (no Expert Belt boost)", () => {
    // Source: Showdown data/items.ts -- Expert Belt only boosts SE hits
    const normalMove = makeMove({
      type: TEST_IDS.types.normal,
      power: 80,
      category: "physical",
      flags: { contact: false },
    });
    const withExpertBelt = dmg({
      attacker: makeActive({ heldItem: TEST_IDS.items.expertBelt, attack: 100 }),
      defender: makeActive({ types: [TEST_IDS.types.normal], defense: 100 }),
      move: normalMove,
      seed: 42,
    });
    const withoutItem = dmg({
      attacker: makeActive({ heldItem: null, attack: 100 }),
      defender: makeActive({ types: [TEST_IDS.types.normal], defense: 100 }),
      move: normalMove,
      seed: 42,
    });
    // No SE, Expert Belt does nothing → equal damage
    expect(withExpertBelt).toBe(withoutItem);
  });
});

describe("Muscle Band: 1.1x for physical moves", () => {
  it("given Muscle Band + physical move (80BP), when calculating damage, then damage matches ~1.1x boost", () => {
    // Source: Showdown data/items.ts -- Muscle Band: onModifyDamage chainModify([4505,4096]) = ~1.1x for physical
    // Exact seeded values: withMuscleBand=56, noItem=51 (ratio ≈ 1.098)
    const physicalMove = makeMove({
      type: TEST_IDS.types.normal,
      power: 80,
      category: "physical",
      flags: { contact: false },
    });
    const withMuscleBand = dmg({
      attacker: makeActive({ heldItem: TEST_IDS.items.muscleBand, attack: 100 }),
      move: physicalMove,
      seed: 42,
    });
    const withoutItem = dmg({
      attacker: makeActive({ heldItem: null, attack: 100 }),
      move: physicalMove,
      seed: 42,
    });
    expect(withMuscleBand).toBe(56);
    expect(withoutItem).toBe(51);
  });

  it("given Muscle Band + special move (not physical), when calculating damage, then damage equals no-item scenario (Muscle Band does not boost special)", () => {
    // Source: Showdown data/items.ts -- Muscle Band: only boosts physical moves
    const specialMove = makeMove({
      type: TEST_IDS.types.normal,
      power: 80,
      category: "special",
      flags: { contact: false },
    });
    const withMuscleBand = dmg({
      attacker: makeActive({ heldItem: TEST_IDS.items.muscleBand, spAttack: 100 }),
      move: specialMove,
      seed: 42,
    });
    const withoutItem = dmg({
      attacker: makeActive({ heldItem: null, spAttack: 100 }),
      move: specialMove,
      seed: 42,
    });
    // Muscle Band gives no boost to special moves → equal
    expect(withMuscleBand).toBe(withoutItem);
  });
});
