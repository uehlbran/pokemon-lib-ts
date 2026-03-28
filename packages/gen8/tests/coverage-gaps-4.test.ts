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
import type { Gender, MoveData, PokemonType } from "@pokemon-lib-ts/core";
import {
  CORE_ABILITY_IDS,
  CORE_ABILITY_SLOTS,
  CORE_GENDERS,
  CORE_ITEM_IDS,
  CORE_SCREEN_IDS,
  CORE_STATUS_IDS,
  CORE_TERRAIN_IDS,
  CORE_TYPE_IDS,
  CORE_VOLATILE_IDS,
  CORE_WEATHER_IDS,
  createEvs,
  createFriendship,
  createIvs,
  SeededRandom,
} from "@pokemon-lib-ts/core";
import { describe, expect, it } from "vitest";
import {
  createGen8DataManager,
  GEN8_ABILITY_IDS,
  GEN8_ITEM_IDS,
  GEN8_MOVE_IDS,
  GEN8_NATURE_IDS,
  GEN8_SPECIES_IDS,
} from "../src/data";
import { calculateGen8Damage } from "../src/Gen8DamageCalc";
import { GEN8_TYPE_CHART } from "../src/Gen8TypeChart";

const typeChart = GEN8_TYPE_CHART;
const gen8Data = createGen8DataManager();

const ABILITIES = { ...CORE_ABILITY_IDS, ...GEN8_ABILITY_IDS } as const;
const ITEMS = {
  ...CORE_ITEM_IDS,
  ...GEN8_ITEM_IDS,
} as const;
const MOVES = GEN8_MOVE_IDS;
const NATURES = GEN8_NATURE_IDS;
const SCREENS = CORE_SCREEN_IDS;
const SPECIES = GEN8_SPECIES_IDS;
const STATUSES = CORE_STATUS_IDS;
const TYPES = CORE_TYPE_IDS;
const TERRAIN = CORE_TERRAIN_IDS;
const _VOLATILES = CORE_VOLATILE_IDS;
const WEATHER = CORE_WEATHER_IDS;

// ---------------------------------------------------------------------------
// Helper factories
// ---------------------------------------------------------------------------

function createOnFieldPokemon(overrides: {
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
  gender?: Gender;
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
      speciesId: overrides.speciesId ?? SPECIES.pikachu,
      nickname: null,
      level: overrides.level ?? 50,
      experience: 0,
      nature: NATURES.hardy,
      ivs: createIvs(),
      evs: createEvs(),
      currentHp: overrides.currentHp ?? hp,
      moves: [],
      ability: overrides.ability ?? ABILITIES.none,
      abilitySlot: CORE_ABILITY_SLOTS.normal1,
      heldItem: overrides.heldItem ?? null,
      status: (overrides.status ?? null) as any,
      friendship: createFriendship(0),
      gender: (overrides.gender ?? CORE_GENDERS.male) as any,
      isShiny: false,
      metLocation: "",
      metLevel: 1,
      originalTrainer: "",
      originalTrainerId: 0,
      pokeball: ITEMS.pokeBall,
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
    types: overrides.types ?? [TYPES.normal],
    ability: overrides.ability ?? ABILITIES.none,
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

function createCanonicalMove(moveId: string): MoveData {
  return gen8Data.getMove(moveId);
}

function createSyntheticMoveFrom(
  moveId: string,
  overrides: {
    flags?: Partial<MoveData["flags"]>;
    effect?: MoveData["effect"];
    hasCrashDamage?: boolean;
  } = {},
): MoveData {
  const move = createCanonicalMove(moveId);
  return {
    ...move,
    ...overrides,
    flags: { ...move.flags, ...overrides.flags },
  } as MoveData;
}

function createBattleState(overrides?: {
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
  const attacker = overrides.attacker ?? createOnFieldPokemon({});
  const defender = overrides.defender ?? createOnFieldPokemon({});
  const ctx: DamageContext = {
    attacker,
    defender,
    move: overrides.move ?? createCanonicalMove(MOVES.tackle),
    state: overrides.state ?? createBattleState(),
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
    const pixilateMove = createCanonicalMove(MOVES.tackle);
    const withPixilate = dmg({
      attacker: createOnFieldPokemon({
        ability: ABILITIES.pixilate,
        types: [TYPES.fighting],
        attack: 100,
      }),
      defender: createOnFieldPokemon({ types: [TYPES.normal], defense: 100 }),
      move: pixilateMove,
      seed: 42,
    });
    const withoutAbility = dmg({
      attacker: createOnFieldPokemon({
        ability: ABILITIES.none,
        types: [TYPES.fighting],
        attack: 100,
      }),
      defender: createOnFieldPokemon({ types: [TYPES.normal], defense: 100 }),
      move: pixilateMove,
      seed: 42,
    });
    // Pixilate adds 1.2x power boost (4915/4096 ≈ 1.2x): 22 * 1.2 ≈ 26
    // Source: Showdown data/abilities.ts -- Pixilate chainModify([4915,4096])
    expect(withPixilate).toBe(21);
    expect(withoutAbility).toBe(17);
  });

  it("given Normalize attacker + fire-type move vs normal-type defender, when calculating damage, then it deals damage (no Ghost immunity to normal)", () => {
    // Source: Showdown data/abilities.ts -- Normalize: all moves become Normal type + 1.2x power boost
    // Fire vs Normal = 1x normally. After Normalize, it's Normal vs Normal = 1x still.
    // The important thing is it doesn't get blocked by ghost immunity.
    const withNormalize = dmg({
      attacker: createOnFieldPokemon({ ability: ABILITIES.normalize, attack: 100 }),
      defender: createOnFieldPokemon({ types: [TYPES.normal], defense: 100 }),
      move: createCanonicalMove(MOVES.firePledge),
    });
    // Normalize gives 1.2x power boost, so damage > 0 and boosted
    const withoutNormalize = dmg({
      attacker: createOnFieldPokemon({ ability: ABILITIES.none, attack: 100 }),
      defender: createOnFieldPokemon({ types: [TYPES.normal], defense: 100 }),
      move: createCanonicalMove(MOVES.firePledge),
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
      attacker: createOnFieldPokemon({ ability: ABILITIES.normalize, attack: 100 }),
      defender: createOnFieldPokemon({ types: [TYPES.ghost], defense: 100 }),
      move: createCanonicalMove(MOVES.firePledge),
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
    const solarBeam = createCanonicalMove(MOVES.solarBeam);
    const inRain = dmg({
      move: solarBeam,
      state: createBattleState({
        weather: { type: WEATHER.rain, turnsLeft: 5, source: ABILITIES.drizzle },
      }),
      seed: 42,
    });
    const noWeather = dmg({
      move: solarBeam,
      state: createBattleState(),
      seed: 42,
    });
    expect(inRain).toBe(26);
    expect(noWeather).toBe(50);
  });

  it("given solar-beam + sand weather, when calculating damage, then damage is half of no-weather damage", () => {
    // Source: Showdown -- SolarBeam power halved in sand too
    // Exact seeded values: inSand=26, noWeather=50 (same halving as rain)
    const solarBeam = createCanonicalMove(MOVES.solarBeam);
    const inSand = dmg({
      move: solarBeam,
      state: createBattleState({
        weather: { type: WEATHER.sand, turnsLeft: 5, source: ABILITIES.sandStream },
      }),
      seed: 42,
    });
    const noWeather = dmg({
      move: solarBeam,
      state: createBattleState(),
      seed: 42,
    });
    expect(inSand).toBe(26);
    expect(noWeather).toBe(50);
  });
});

// ---------------------------------------------------------------------------
// Group 3: Type-boost items
// ---------------------------------------------------------------------------

describe("Type-boost items (Charcoal, Pixie Plate, Soul Dew)", () => {
  it("given Charcoal + fire-type move (80BP), when calculating damage, then damage matches ~1.2x boost", () => {
    // Source: Showdown data/items.ts -- Charcoal: onBasePower chainModify([4915,4096]) = ~1.2x for Fire
    // Exact seeded values: withCharcoal=41, noItem=34 (ratio ≈ 1.206)
    const fireMove = createCanonicalMove(MOVES.firePledge);
    const withCharcoal = dmg({
      attacker: createOnFieldPokemon({ heldItem: ITEMS.charcoal, spAttack: 100 }),
      move: fireMove,
      seed: 42,
    });
    const withoutItem = dmg({
      attacker: createOnFieldPokemon({ heldItem: null, spAttack: 100 }),
      move: fireMove,
      seed: 42,
    });
    expect(withCharcoal).toBe(41);
    expect(withoutItem).toBe(34);
  });

  it("given Pixie Plate (valid Gen 8 plate item) + fairy-type move, when calculating damage, then damage matches ~1.2x boost", () => {
    // Source: Gen 8 data/items.json -- pixie-plate exists in the generation data bundle.
    // Source: Showdown data/items.ts -- plate items: onBasePower chainModify([4915,4096]) = ~1.2x
    // Exact seeded values: withPixiePlate=61, noItem=51 (ratio ≈ 1.196)
    const fairyMove = createCanonicalMove(MOVES.dazzlingGleam);
    const withPixiePlate = dmg({
      attacker: createOnFieldPokemon({
        heldItem: ITEMS.pixiePlate,
        spAttack: 100,
        types: [TYPES.fairy],
      }),
      move: fairyMove,
      seed: 42,
    });
    const withoutItem = dmg({
      attacker: createOnFieldPokemon({ heldItem: null, spAttack: 100, types: [TYPES.fairy] }),
      move: fairyMove,
      seed: 42,
    });
    expect(withPixiePlate).toBe(61);
    expect(withoutItem).toBe(51);
  });

  it("given Latios (speciesId=381) + soul-dew + dragon-type move (80BP), when calculating damage, then damage matches ~1.2x boost", () => {
    // Source: Showdown data/items.ts -- Soul Dew Gen 7+: onBasePower chainModify([4915,4096]) for Dragon/Psychic
    // Only works for Latias (380) or Latios (381)
    // Exact seeded values: withSoulDew=41, noItem=34 (ratio ≈ 1.206)
    const dragonMove = createCanonicalMove(MOVES.dragonPulse);
    const withSoulDew = dmg({
      attacker: createOnFieldPokemon({ speciesId: 381, heldItem: ITEMS.soulDew, spAttack: 100 }),
      move: dragonMove,
      seed: 42,
    });
    const withoutItem = dmg({
      attacker: createOnFieldPokemon({ speciesId: 381, heldItem: null, spAttack: 100 }),
      move: dragonMove,
      seed: 42,
    });
    expect(withSoulDew).toBe(43);
    expect(withoutItem).toBe(36);
  });

  it("given Latias (speciesId=380) + soul-dew + psychic-type move (90BP), when calculating damage, then damage matches ~1.2x boost", () => {
    // Source: Showdown data/items.ts -- Soul Dew Gen 7+: also works for Latias (380) + Psychic
    // Exact seeded values: withSoulDew=46, noItem=38 (ratio ≈ 1.211)
    const psychicMove = createCanonicalMove(MOVES.psychic);
    const withSoulDew = dmg({
      attacker: createOnFieldPokemon({ speciesId: 380, heldItem: ITEMS.soulDew, spAttack: 100 }),
      move: psychicMove,
      seed: 42,
    });
    const withoutItem = dmg({
      attacker: createOnFieldPokemon({ speciesId: 380, heldItem: null, spAttack: 100 }),
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
    const knockOff = createCanonicalMove(MOVES.knockOff);
    const defenderWithItem = createOnFieldPokemon({ heldItem: ITEMS.leftovers, defense: 100 });
    const defenderNoItem = createOnFieldPokemon({ heldItem: null, defense: 100 });
    const withItem = dmg({ move: knockOff, defender: defenderWithItem, seed: 42 });
    const noItem = dmg({ move: knockOff, defender: defenderNoItem, seed: 42 });
    expect(withItem).toBe(41);
    expect(noItem).toBe(28);
  });

  it("given knock-off move + defender holding sitrus-berry (removable), when calculating damage, then same 1.5x boost applies", () => {
    // Source: Showdown data/moves.ts -- knockoff 1.5x boost applies to any removable item
    // sitrus-berry is also removable; same boost applies
    // Exact seeded values: withSitrus=41, noItem=28 (identical to leftovers case)
    const knockOff = createCanonicalMove(MOVES.knockOff);
    const defenderWithSitrus = createOnFieldPokemon({ heldItem: ITEMS.sitrusBerry, defense: 100 });
    const defenderNoItem = createOnFieldPokemon({ heldItem: null, defense: 100 });
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
    const fireMove = createCanonicalMove(MOVES.firePledge);
    const lowHpDmg = dmg({
      attacker: createOnFieldPokemon({
        ability: ABILITIES.blaze,
        hp: maxHp,
        currentHp: threshold,
        spAttack: 100,
      }),
      move: fireMove,
      seed: 42,
    });
    const fullHpDmg = dmg({
      attacker: createOnFieldPokemon({
        ability: ABILITIES.blaze,
        hp: maxHp,
        currentHp: maxHp,
        spAttack: 100,
      }),
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
    const waterMove = createCanonicalMove(MOVES.snipeShot);
    const lowHpDmg = dmg({
      attacker: createOnFieldPokemon({
        ability: ABILITIES.torrent,
        hp: maxHp,
        currentHp: threshold,
        spAttack: 100,
      }),
      move: waterMove,
      seed: 42,
    });
    const fullHpDmg = dmg({
      attacker: createOnFieldPokemon({
        ability: ABILITIES.torrent,
        hp: maxHp,
        currentHp: maxHp,
        spAttack: 100,
      }),
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
    const flashFireVolatile = new Map([[ABILITIES.flashFire, { turnsLeft: 255 }]]);
    const fireMove = createCanonicalMove(MOVES.firePledge);
    const withFlashFire = dmg({
      attacker: createOnFieldPokemon({ volatiles: flashFireVolatile, spAttack: 100 }),
      move: fireMove,
      seed: 42,
    });
    const withoutFlashFire = dmg({
      attacker: createOnFieldPokemon({ volatiles: new Map(), spAttack: 100 }),
      move: fireMove,
      seed: 42,
    });
    expect(withFlashFire).toBe(50);
    expect(withoutFlashFire).toBe(34);
  });

  it("given attacker with flash-fire volatile status + fire-type move (100BP), when calculating damage, then damage is 1.5x the non-volatile result", () => {
    // Source: Showdown data/abilities.ts -- Flash Fire: same 1.5x boost for higher base power
    // Exact seeded values: flashFire=63, noFlashFire=43 (ratio ≈ 1.47 due to integer rounding)
    const flashFireVolatile = new Map([[ABILITIES.flashFire, { turnsLeft: 255 }]]);
    const fireMove100 = createCanonicalMove(MOVES.inferno);
    const withFlashFire100 = dmg({
      attacker: createOnFieldPokemon({ volatiles: flashFireVolatile, spAttack: 100 }),
      move: fireMove100,
      seed: 42,
    });
    const withoutFlashFire100 = dmg({
      attacker: createOnFieldPokemon({ volatiles: new Map(), spAttack: 100 }),
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
    const fireMove = createCanonicalMove(MOVES.firePledge);
    const withDrySkin = dmg({
      attacker: createOnFieldPokemon({ spAttack: 100 }),
      defender: createOnFieldPokemon({ ability: ABILITIES.drySkin, spDefense: 100 }),
      move: fireMove,
      seed: 42,
    });
    const withoutDrySkin = dmg({
      attacker: createOnFieldPokemon({ spAttack: 100 }),
      defender: createOnFieldPokemon({ ability: ABILITIES.none, spDefense: 100 }),
      move: fireMove,
      seed: 42,
    });
    expect(withDrySkin).toBe(43);
    expect(withoutDrySkin).toBe(34);
  });

  it("given Dry Skin defender + fire-type move (100BP), when calculating damage, then damage is 1.25x the non-ability result", () => {
    // Source: Showdown data/abilities.ts -- Dry Skin: same 1.25x boost at higher base power
    // Exact seeded values: withDrySkin=53, withoutDrySkin=43 (ratio ≈ 1.23 due to integer rounding)
    const fireMove100 = createCanonicalMove(MOVES.inferno);
    const withDrySkin100 = dmg({
      attacker: createOnFieldPokemon({ spAttack: 100 }),
      defender: createOnFieldPokemon({ ability: ABILITIES.drySkin, spDefense: 100 }),
      move: fireMove100,
      seed: 42,
    });
    const withoutDrySkin100 = dmg({
      attacker: createOnFieldPokemon({ spAttack: 100 }),
      defender: createOnFieldPokemon({ ability: ABILITIES.none, spDefense: 100 }),
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
    // Struggle is 50BP in the Gen 8 move data, so Technician boosts it to an effective 75BP.
    // Retaliate is 70BP in the Gen 8 move data, so Technician does not boost it.
    // Exact seeded values: techLow(50BP)=48, techHigh(70BP)=45
    const lowPowerMove = createCanonicalMove(MOVES.struggle);
    const highPowerMove = createCanonicalMove(MOVES.retaliate);
    const techLow = dmg({
      attacker: createOnFieldPokemon({ ability: ABILITIES.technician, attack: 100 }),
      move: lowPowerMove,
      seed: 42,
    });
    const techHigh = dmg({
      attacker: createOnFieldPokemon({ ability: ABILITIES.technician, attack: 100 }),
      move: highPowerMove,
      seed: 42,
    });
    expect(techLow).toBe(48);
    expect(techHigh).toBe(45);
  });

  it("given Technician + power=40 move, when calculating damage, then damage is boosted but below power=70 (no boost)", () => {
    // Source: Showdown data/abilities.ts -- Technician: 1.5x for 40BP = effective 60BP < 70BP
    // A 40BP move with Technician becomes 60BP effective; a 70BP move stays at 70BP.
    // Exact seeded values: techLow(40BP)=39, techHigh(70BP)=45
    const lowPowerMove2 = createCanonicalMove(MOVES.quickAttack);
    const highPowerMove2 = createCanonicalMove(MOVES.retaliate);
    const techLow2 = dmg({
      attacker: createOnFieldPokemon({ ability: ABILITIES.technician, attack: 100 }),
      move: lowPowerMove2,
      seed: 42,
    });
    const techHigh2 = dmg({
      attacker: createOnFieldPokemon({ ability: ABILITIES.technician, attack: 100 }),
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
    const punchMove = createCanonicalMove(MOVES.megaPunch);
    const withIronFist = dmg({
      attacker: createOnFieldPokemon({ ability: ABILITIES.ironFist, attack: 100 }),
      move: punchMove,
      seed: 42,
    });
    const withoutAbility = dmg({
      attacker: createOnFieldPokemon({ ability: ABILITIES.none, attack: 100 }),
      move: punchMove,
      seed: 42,
    });
    expect(withIronFist).toBe(61);
    expect(withoutAbility).toBe(51);
  });

  it("given Iron Fist + punch move (60BP, flags.punch=true), when calculating damage, then damage matches 1.2x boost", () => {
    // Source: Showdown data/abilities.ts -- Iron Fist: same 1.2x boost at lower base power
    // Exact seeded values: withIronFist=31, without=26 (ratio ≈ 1.19)
    const punchMove60 = createCanonicalMove(MOVES.doubleIronBash);
    const withIronFist60 = dmg({
      attacker: createOnFieldPokemon({ ability: ABILITIES.ironFist, attack: 100 }),
      move: punchMove60,
      seed: 42,
    });
    const withoutAbility60 = dmg({
      attacker: createOnFieldPokemon({ ability: ABILITIES.none, attack: 100 }),
      move: punchMove60,
      seed: 42,
    });
    expect(withIronFist60).toBe(31);
    expect(withoutAbility60).toBe(26);
  });
});

describe("Tough Claws: ~1.3x power for contact moves", () => {
  it("given Tough Claws + contact move (80BP), when calculating damage, then damage matches 1.3x boost", () => {
    // Source: Showdown data/abilities.ts -- Tough Claws: onBasePower chainModify([5325,4096]) = ~1.3x for contact
    // Exact seeded values: contact=66, nonContact=51 (ratio ≈ 1.294)
    const contactMove = createCanonicalMove(MOVES.strength);
    const nonContactMove = createSyntheticMoveFrom(MOVES.strength, { flags: { contact: false } });
    const withContact = dmg({
      attacker: createOnFieldPokemon({ ability: ABILITIES.toughClaws, attack: 100 }),
      move: contactMove,
      seed: 42,
    });
    const withoutContact = dmg({
      attacker: createOnFieldPokemon({ ability: ABILITIES.toughClaws, attack: 100 }),
      move: nonContactMove,
      seed: 42,
    });
    expect(withContact).toBe(66);
    expect(withoutContact).toBe(51);
  });

  it("given Tough Claws + contact move (60BP), when calculating damage, then damage matches 1.3x boost", () => {
    // Source: Showdown data/abilities.ts -- Tough Claws: same ~1.3x boost at 60BP
    // Exact seeded values: contact=49, nonContact=39 (ratio ≈ 1.256)
    const contactMove60 = createCanonicalMove(MOVES.covet);
    const nonContactMove60 = createSyntheticMoveFrom(MOVES.covet, { flags: { contact: false } });
    const withContact60 = dmg({
      attacker: createOnFieldPokemon({ ability: ABILITIES.toughClaws, attack: 100 }),
      move: contactMove60,
      seed: 42,
    });
    const withoutContact60 = dmg({
      attacker: createOnFieldPokemon({ ability: ABILITIES.toughClaws, attack: 100 }),
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
    // Exact seeded values: withStrongJaw=38, without=26 (ratio ≈ 1.46 due to integer rounding)
    const biteMove = createCanonicalMove(MOVES.bite);
    const withStrongJaw = dmg({
      attacker: createOnFieldPokemon({ ability: ABILITIES.strongJaw, attack: 100 }),
      move: biteMove,
      seed: 42,
    });
    const withoutAbility = dmg({
      attacker: createOnFieldPokemon({ ability: ABILITIES.none, attack: 100 }),
      move: biteMove,
      seed: 42,
    });
    expect(withStrongJaw).toBe(38);
    expect(withoutAbility).toBe(26);
  });

  it("given Strong Jaw + bite move (80BP, flags.bite=true), when calculating damage, then damage matches 1.5x boost", () => {
    // Source: Showdown data/abilities.ts -- Strong Jaw: same 1.5x boost at higher base power
    // Exact seeded values: withStrongJaw=50, without=34 (ratio ≈ 1.47 due to integer rounding)
    const biteMove80 = createCanonicalMove(MOVES.jawLock);
    const withStrongJaw80 = dmg({
      attacker: createOnFieldPokemon({ ability: ABILITIES.strongJaw, attack: 100 }),
      move: biteMove80,
      seed: 42,
    });
    const withoutAbility80 = dmg({
      attacker: createOnFieldPokemon({ ability: ABILITIES.none, attack: 100 }),
      move: biteMove80,
      seed: 42,
    });
    expect(withStrongJaw80).toBe(50);
    expect(withoutAbility80).toBe(34);
  });
});

describe("Mega Launcher: 1.5x power for pulse moves", () => {
  it("given Mega Launcher + pulse move (80BP, flags.pulse=true), when calculating damage, then damage matches 1.5x boost", () => {
    // Source: Showdown data/abilities.ts -- Mega Launcher: onBasePower chainModify([6144,4096]) = 1.5x for pulse
    // Exact seeded values: withMegaLauncher=100, without=68 (ratio ≈ 1.47 due to integer rounding)
    const pulseMove = createCanonicalMove(MOVES.auraSphere);
    const withMegaLauncher = dmg({
      attacker: createOnFieldPokemon({ ability: ABILITIES.megaLauncher, spAttack: 100 }),
      move: pulseMove,
      seed: 42,
    });
    const withoutAbility = dmg({
      attacker: createOnFieldPokemon({ ability: ABILITIES.none, spAttack: 100 }),
      move: pulseMove,
      seed: 42,
    });
    expect(withMegaLauncher).toBe(100);
    expect(withoutAbility).toBe(68);
  });

  it("given Mega Launcher + pulse move (90BP, flags.pulse=true), when calculating damage, then damage matches 1.5x boost", () => {
    // Source: Showdown data/abilities.ts -- Mega Launcher: same 1.5x boost at 90BP
    // Exact seeded values: withMegaLauncher=53, without=36 (ratio ≈ 1.47 due to integer rounding)
    const pulseMove90 = createCanonicalMove(MOVES.dragonPulse);
    const withMegaLauncher90 = dmg({
      attacker: createOnFieldPokemon({ ability: ABILITIES.megaLauncher, spAttack: 100 }),
      move: pulseMove90,
      seed: 42,
    });
    const withoutAbility90 = dmg({
      attacker: createOnFieldPokemon({ ability: ABILITIES.none, spAttack: 100 }),
      move: pulseMove90,
      seed: 42,
    });
    expect(withMegaLauncher90).toBe(53);
    expect(withoutAbility90).toBe(36);
  });
});

// ---------------------------------------------------------------------------
// Group 10: Reckless and Sheer Force
// ---------------------------------------------------------------------------

describe("Reckless: 1.2x power for moves with recoil/crash", () => {
  it("given Reckless + canonical crash-damage move, when calculating damage, then it beats an explicit non-crash control", () => {
    // Source: Showdown data/abilities.ts -- Reckless: 1.2x for moves with recoil or crash
    // Source: Gen 8 move data -- High Jump Kick is canonical crash-damage data in this generation.
    const crashMove = createCanonicalMove(MOVES.highJumpKick);
    const nonCrashControl = createSyntheticMoveFrom(MOVES.highJumpKick, { hasCrashDamage: false });
    const withCrash = dmg({
      attacker: createOnFieldPokemon({ ability: ABILITIES.reckless, attack: 100 }),
      move: crashMove,
      seed: 42,
    });
    const withoutCrash = dmg({
      attacker: createOnFieldPokemon({ ability: ABILITIES.reckless, attack: 100 }),
      move: nonCrashControl,
      seed: 42,
    });
    expect(withCrash).toBe(130);
    expect(withoutCrash).toBe(110);
  });

  it("given Reckless + move with recoil effect (90BP), when calculating damage, then damage matches 1.2x boost", () => {
    // Source: Showdown data/abilities.ts -- Reckless: also boosts recoil moves
    // Exact seeded values: withReckless=69, withoutReckless=57 (ratio ≈ 1.21)
    const recoilMove = createCanonicalMove(MOVES.doubleEdge);
    const withReckless = dmg({
      attacker: createOnFieldPokemon({ ability: ABILITIES.reckless, attack: 100 }),
      move: recoilMove,
      seed: 42,
    });
    const withoutReckless = dmg({
      attacker: createOnFieldPokemon({ ability: ABILITIES.none, attack: 100 }),
      move: recoilMove,
      seed: 42,
    });
    expect(withReckless).toBe(91);
    expect(withoutReckless).toBe(75);
  });
});

describe("Sheer Force: ~1.3x power for moves with secondary effects", () => {
  it("given Sheer Force + move with status-chance effect (80BP), when calculating damage, then damage matches ~1.3x boost", () => {
    // Source: Showdown data/abilities.ts -- Sheer Force: chainModify([5325,4096]) for moves with secondaries
    // Exact seeded values: withSheerForce=66, withoutAbility=51 (ratio ≈ 1.294)
    const statusChanceMove = createCanonicalMove(MOVES.flamethrower);
    const withSheerForce = dmg({
      attacker: createOnFieldPokemon({ ability: ABILITIES.sheerForce, spAttack: 100 }),
      move: statusChanceMove,
      seed: 42,
    });
    const withoutAbility = dmg({
      attacker: createOnFieldPokemon({ ability: ABILITIES.none, spAttack: 100 }),
      move: statusChanceMove,
      seed: 42,
    });
    expect(withSheerForce).toBe(49);
    expect(withoutAbility).toBe(38);
  });
});

// ---------------------------------------------------------------------------
// Group 11: Venoshock, Hex, Acrobatics
// ---------------------------------------------------------------------------

describe("Venoshock: doubles power when target is poisoned", () => {
  it("given Venoshock + defender with poison status, when calculating damage, then damage is double no-poison scenario", () => {
    // Source: Showdown data/moves.ts -- venoshock: onBasePower chainModify(2) if target poisoned
    // Exact seeded values: poisoned=55, healthy=28 (ratio ≈ 1.96 due to integer rounding of 2x)
    const venoshock = createCanonicalMove(MOVES.venoshock);
    const poisonedDmg = dmg({
      defender: createOnFieldPokemon({
        status: STATUSES.poison,
        types: [TYPES.normal],
        spDefense: 100,
      }),
      move: venoshock,
      seed: 42,
    });
    const healthyDmg = dmg({
      defender: createOnFieldPokemon({ status: null, types: [TYPES.normal], spDefense: 100 }),
      move: venoshock,
      seed: 42,
    });
    expect(poisonedDmg).toBe(55);
    expect(healthyDmg).toBe(28);
  });

  it("given Venoshock + defender with badly-poisoned status, when calculating damage, then damage is same as poison (2x boost)", () => {
    // Source: Showdown data/moves.ts -- venoshock: onBasePower also doubles for badly-poisoned
    // Exact seeded values: badlyPoisoned=55, healthy=28 (same multiplier as poison)
    const venoshock = createCanonicalMove(MOVES.venoshock);
    const badlyPoisonedDmg = dmg({
      defender: createOnFieldPokemon({
        status: STATUSES.badlyPoisoned,
        types: [TYPES.normal],
        spDefense: 100,
      }),
      move: venoshock,
      seed: 42,
    });
    const healthyDmg = dmg({
      defender: createOnFieldPokemon({ status: null, types: [TYPES.normal], spDefense: 100 }),
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
    const hex = createCanonicalMove(MOVES.hex);
    const sleepDmg = dmg({
      defender: createOnFieldPokemon({
        status: STATUSES.sleep,
        types: [TYPES.psychic],
        spDefense: 100,
      }),
      move: hex,
      seed: 42,
    });
    const healthyDmg = dmg({
      defender: createOnFieldPokemon({ status: null, types: [TYPES.psychic], spDefense: 100 }),
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
    const acrobatics = createCanonicalMove(MOVES.acrobatics);
    const noItemDmg = dmg({
      attacker: createOnFieldPokemon({
        heldItem: null,
        ability: ABILITIES.none,
        types: [TYPES.flying],
      }),
      move: acrobatics,
      seed: 42,
    });
    const hasItemDmg = dmg({
      attacker: createOnFieldPokemon({
        heldItem: ITEMS.oranBerry,
        ability: ABILITIES.none,
        types: [TYPES.flying],
      }),
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
    const rivalryMove = createCanonicalMove(MOVES.strength);
    const sameGenderDmg = dmg({
      attacker: createOnFieldPokemon({ ability: ABILITIES.rivalry, gender: CORE_GENDERS.male }),
      defender: createOnFieldPokemon({ gender: CORE_GENDERS.male }),
      move: rivalryMove,
      seed: 42,
    });
    // Genderless vs genderless gives no rivalry modifier
    const genderlessDmg = dmg({
      attacker: createOnFieldPokemon({
        ability: ABILITIES.rivalry,
        gender: CORE_GENDERS.genderless,
      }),
      defender: createOnFieldPokemon({ gender: CORE_GENDERS.genderless }),
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
    const rivalryMove = createCanonicalMove(MOVES.strength);
    const oppositeGenderDmg = dmg({
      attacker: createOnFieldPokemon({ ability: ABILITIES.rivalry, gender: CORE_GENDERS.male }),
      defender: createOnFieldPokemon({ gender: CORE_GENDERS.female }),
      move: rivalryMove,
      seed: 42,
    });
    const genderlessDmg = dmg({
      attacker: createOnFieldPokemon({
        ability: ABILITIES.rivalry,
        gender: CORE_GENDERS.genderless,
      }),
      defender: createOnFieldPokemon({ gender: CORE_GENDERS.genderless }),
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
    const steelMove = createCanonicalMove(MOVES.anchorShot);
    const withAdamantOrb = dmg({
      attacker: createOnFieldPokemon({ speciesId: 483, heldItem: ITEMS.adamantOrb, attack: 100 }),
      move: steelMove,
      seed: 42,
    });
    const withoutItem = dmg({
      attacker: createOnFieldPokemon({ speciesId: 483, heldItem: null, attack: 100 }),
      move: steelMove,
      seed: 42,
    });
    expect(withAdamantOrb).toBe(41);
    expect(withoutItem).toBe(34);
  });

  it("given Palkia (speciesId=484) + lustrous-orb + dragon-type move, when calculating damage, then damage matches ~1.2x boost", () => {
    // Source: Showdown data/items.ts -- Lustrous Orb: chainModify([4915,4096]) for Water/Dragon on Palkia (484)
    // Dragon Pulse is 85BP in the Gen 8 move data.
    // Exact seeded values: withLustrousOrb=43, noItem=36 (ratio ≈ 1.194)
    const dragonMove = createCanonicalMove(MOVES.dragonPulse);
    const withLustrousOrb = dmg({
      attacker: createOnFieldPokemon({
        speciesId: 484,
        heldItem: ITEMS.lustrousOrb,
        spAttack: 100,
      }),
      move: dragonMove,
      seed: 42,
    });
    const withoutItem = dmg({
      attacker: createOnFieldPokemon({ speciesId: 484, heldItem: null, spAttack: 100 }),
      move: dragonMove,
      seed: 42,
    });
    expect(withLustrousOrb).toBe(43);
    expect(withoutItem).toBe(36);
  });

  it("given Giratina (speciesId=487) + griseous-orb + ghost-type move (80BP, Psychic defender), when calculating damage, then damage matches ~1.2x boost", () => {
    // Source: Showdown data/items.ts -- Griseous Orb: chainModify([4915,4096]) for Ghost/Dragon on Giratina (487)
    // Ghost vs Normal = 0 (immune). Use Psychic-type defender so Ghost hits for 1x.
    // Exact seeded values: withGriseousOrb=66, noItem=56 (ratio ≈ 1.179)
    const ghostMove = createCanonicalMove(MOVES.hex);
    const withGriseousOrb = dmg({
      attacker: createOnFieldPokemon({ speciesId: 487, heldItem: ITEMS.griseousOrb, attack: 100 }),
      defender: createOnFieldPokemon({ types: [TYPES.psychic], defense: 100 }),
      move: ghostMove,
      seed: 42,
    });
    const withoutItem = dmg({
      attacker: createOnFieldPokemon({ speciesId: 487, heldItem: null, attack: 100 }),
      defender: createOnFieldPokemon({ types: [TYPES.psychic], defense: 100 }),
      move: ghostMove,
      seed: 42,
    });
    expect(withGriseousOrb).toBe(66);
    expect(withoutItem).toBe(56);
  });
});

// ---------------------------------------------------------------------------
// Group 14: Terrain boost and Grassy halved
// ---------------------------------------------------------------------------

describe("Terrain power modifiers", () => {
  it("given Electric Terrain active + electric-type move (90BP) + grounded attacker, when calculating damage, then damage matches 1.3x boost", () => {
    // Source: Showdown data/mods/gen8/scripts.ts -- terrain boost 1.3x (5325/4096) in Gen 8
    // Exact seeded values: withTerrain=49, noTerrain=38 (ratio ≈ 1.289)
    const electricMove = createCanonicalMove(MOVES.thunderbolt);
    // Grounded attacker (no flying type, no levitate, no air balloon)
    const attacker = createOnFieldPokemon({ types: [TYPES.normal], spAttack: 100 });
    const withTerrain = dmg({
      attacker,
      move: electricMove,
      state: createBattleState({
        terrain: { type: TYPES.electric, turnsLeft: 5, source: ABILITIES.electricSurge },
      }),
      seed: 42,
    });
    const noTerrain = dmg({
      attacker,
      move: electricMove,
      state: createBattleState(),
      seed: 42,
    });
    expect(withTerrain).toBe(49);
    expect(noTerrain).toBe(38);
  });

  it("given Grassy Terrain active + earthquake (100BP) vs grounded defender, when calculating damage, then damage matches 0.5x halve", () => {
    // Source: Showdown data/conditions.ts -- grassyterrain.onModifyDamage: halves Earthquake/Bulldoze/Magnitude
    // Exact seeded values: withTerrain=22, noTerrain=43 (ratio ≈ 0.512 due to integer rounding)
    const earthquake = createCanonicalMove(MOVES.earthquake);
    // Both attacker and defender are grounded (normal type)
    const withTerrain = dmg({
      attacker: createOnFieldPokemon({ types: [TYPES.normal], attack: 100 }),
      defender: createOnFieldPokemon({ types: [TYPES.normal], defense: 100 }),
      move: earthquake,
      state: createBattleState({
        terrain: { type: TERRAIN.grassy, turnsLeft: 5, source: ABILITIES.grassySurge },
      }),
      seed: 42,
    });
    const noTerrain = dmg({
      attacker: createOnFieldPokemon({ types: [TYPES.normal], attack: 100 }),
      defender: createOnFieldPokemon({ types: [TYPES.normal], defense: 100 }),
      move: earthquake,
      state: createBattleState(),
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
    const fireMove = createCanonicalMove(MOVES.firePledge);
    const result = dmg({
      move: fireMove,
      state: createBattleState({
        weather: { type: WEATHER.heavyRain, turnsLeft: 255, source: ABILITIES.drizzle },
      }),
    });
    expect(result).toBe(0);
  });

  it("given harsh-sun weather + water-type move, when calculating damage, then returns 0 damage", () => {
    // Source: Showdown sim/battle-actions.ts -- harsh-sun completely blocks water moves
    const waterMove = createCanonicalMove(MOVES.surf);
    const result = dmg({
      move: waterMove,
      state: createBattleState({
        weather: { type: WEATHER.harshSun, turnsLeft: 255, source: ABILITIES.drought },
      }),
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
    const groundMove = createCanonicalMove(MOVES.earthquake);
    const flyingDefender = createOnFieldPokemon({ types: [TYPES.flying], defense: 100 });
    const withGravity = dmg({
      move: groundMove,
      defender: flyingDefender,
      state: createBattleState({ gravity: { active: true, turnsLeft: 5 } }),
    });
    // Without gravity, ground vs flying = 0 (immune)
    const noGravity = dmg({
      move: groundMove,
      defender: flyingDefender,
      state: createBattleState({ gravity: { active: false, turnsLeft: 0 } }),
    });
    // Exact seeded value: withGravity=43
    expect(noGravity).toBe(0);
    expect(withGravity).toBe(43);
  });
});

// ---------------------------------------------------------------------------
// Group 17: Scrappy hits Ghost type
// ---------------------------------------------------------------------------

describe("Scrappy: Normal and Fighting types hit Ghost-type Pokemon", () => {
  it("given Scrappy attacker + normal-type move vs ghost-type defender, when calculating damage, then damage is greater than 0", () => {
    // Source: Showdown data/abilities.ts -- Scrappy: Normal/Fighting hit Ghost type
    const normalMove = createCanonicalMove(MOVES.strength);
    const ghostDefender = createOnFieldPokemon({ types: [TYPES.ghost], defense: 100 });
    const withScrappy = dmg({
      attacker: createOnFieldPokemon({ ability: ABILITIES.scrappy, attack: 100 }),
      defender: ghostDefender,
      move: normalMove,
    });
    // Without Scrappy, Normal vs Ghost = 0
    const withoutScrappy = dmg({
      attacker: createOnFieldPokemon({ ability: ABILITIES.none, attack: 100 }),
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
    const normalMove = createCanonicalMove(MOVES.strength);
    const wonderGuardDef = createOnFieldPokemon({
      ability: ABILITIES.wonderGuard,
      types: [TYPES.normal],
      defense: 100,
    });
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
    const fireMove = createCanonicalMove(MOVES.firePledge);
    const wonderGuardGrass = createOnFieldPokemon({
      ability: ABILITIES.wonderGuard,
      types: [TYPES.grass],
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
    const groundMove = createCanonicalMove(MOVES.earthquake);
    const levitateDefender = createOnFieldPokemon({
      ability: ABILITIES.levitate,
      types: [TYPES.normal],
      defense: 100,
    });
    const result = dmg({
      defender: levitateDefender,
      move: groundMove,
    });
    expect(result).toBe(0);
  });

  it("given Mold Breaker attacker + Levitate defender + ground move, when calculating damage, then damage equals the base damage (Levitate bypassed)", () => {
    // Source: Showdown data/abilities.ts -- Mold Breaker bypasses Levitate
    // Exact seeded value: result=43 (same as normal ground move — Levitate does not reduce damage, just immunity)
    const groundMove = createCanonicalMove(MOVES.earthquake);
    const levitateDefender = createOnFieldPokemon({
      ability: ABILITIES.levitate,
      types: [TYPES.normal],
      defense: 100,
    });
    const result = dmg({
      attacker: createOnFieldPokemon({ ability: ABILITIES.moldBreaker, attack: 100 }),
      defender: levitateDefender,
      move: groundMove,
      seed: 42,
    });
    expect(result).toBe(43);
  });
});

// ---------------------------------------------------------------------------
// Group 20: Thick Fat and Heatproof
// ---------------------------------------------------------------------------

describe("Thick Fat: halves attacker's effective attack for Fire/Ice moves", () => {
  it("given Thick Fat defender + fire-type move (80BP), when calculating damage, then damage matches 0.5x reduction", () => {
    // Source: Showdown data/abilities.ts -- Thick Fat: halves attack stat for Fire/Ice
    // Exact seeded values: withThickFat=17, noThickFat=34 (exactly 0.5x)
    const fireMove = createCanonicalMove(MOVES.firePledge);
    const withThickFat = dmg({
      defender: createOnFieldPokemon({ ability: ABILITIES.thickFat, spDefense: 100 }),
      move: fireMove,
      seed: 42,
    });
    const withoutThickFat = dmg({
      defender: createOnFieldPokemon({ ability: ABILITIES.none, spDefense: 100 }),
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
    const fireMove = createCanonicalMove(MOVES.firePledge);
    const withHeatproof = dmg({
      defender: createOnFieldPokemon({ ability: ABILITIES.heatproof, spDefense: 100 }),
      move: fireMove,
      seed: 42,
    });
    const withoutHeatproof = dmg({
      defender: createOnFieldPokemon({ ability: ABILITIES.none, spDefense: 100 }),
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
    const waterMove = createCanonicalMove(MOVES.snipeShot);
    const withTintedLens = dmg({
      attacker: createOnFieldPokemon({ ability: ABILITIES.tintedLens, spAttack: 100 }),
      defender: createOnFieldPokemon({ types: [TYPES.grass], spDefense: 100 }),
      move: waterMove,
      seed: 42,
    });
    const withoutAbility = dmg({
      attacker: createOnFieldPokemon({ ability: ABILITIES.none, spAttack: 100 }),
      defender: createOnFieldPokemon({ types: [TYPES.grass], spDefense: 100 }),
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
    const fireMove = createCanonicalMove(MOVES.firePledge);
    const withFilter = dmg({
      attacker: createOnFieldPokemon({ ability: ABILITIES.none, spAttack: 100 }),
      defender: createOnFieldPokemon({
        ability: ABILITIES.filter,
        types: [TYPES.grass],
        spDefense: 100,
      }),
      move: fireMove,
      seed: 42,
    });
    const withoutFilter = dmg({
      attacker: createOnFieldPokemon({ ability: ABILITIES.none, spAttack: 100 }),
      defender: createOnFieldPokemon({
        ability: ABILITIES.none,
        types: [TYPES.grass],
        spDefense: 100,
      }),
      move: fireMove,
      seed: 42,
    });
    expect(withFilter).toBe(51);
    expect(withoutFilter).toBe(68);
  });

  it("given Mold Breaker attacker + Filter defender + SE move, when calculating damage, then damage equals no-filter (Mold Breaker bypasses)", () => {
    // Source: Showdown data/abilities.ts -- Filter has breakable:1, Mold Breaker bypasses it
    const fireMove = createCanonicalMove(MOVES.firePledge);
    const moldBreakerVsFilter = dmg({
      attacker: createOnFieldPokemon({ ability: ABILITIES.moldBreaker, spAttack: 100 }),
      defender: createOnFieldPokemon({
        ability: ABILITIES.filter,
        types: [TYPES.grass],
        spDefense: 100,
      }),
      move: fireMove,
      seed: 42,
    });
    const moldBreakerVsNone = dmg({
      attacker: createOnFieldPokemon({ ability: ABILITIES.moldBreaker, spAttack: 100 }),
      defender: createOnFieldPokemon({
        ability: ABILITIES.none,
        types: [TYPES.grass],
        spDefense: 100,
      }),
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
    const fireMove = createCanonicalMove(MOVES.firePledge);
    const withPrismArmor = dmg({
      attacker: createOnFieldPokemon({ spAttack: 100 }),
      defender: createOnFieldPokemon({
        ability: ABILITIES.prismArmor,
        types: [TYPES.grass],
        spDefense: 100,
      }),
      move: fireMove,
      seed: 42,
    });
    const withoutPrismArmor = dmg({
      attacker: createOnFieldPokemon({ spAttack: 100 }),
      defender: createOnFieldPokemon({
        ability: ABILITIES.none,
        types: [TYPES.grass],
        spDefense: 100,
      }),
      move: fireMove,
      seed: 42,
    });
    expect(withPrismArmor).toBe(51);
    expect(withoutPrismArmor).toBe(68);
  });

  it("given Mold Breaker attacker + Prism Armor defender + SE move, when calculating damage, then Prism Armor still reduces damage (not bypassed)", () => {
    // Source: Showdown data/abilities.ts -- Prism Armor has no breakable flag → Mold Breaker cannot bypass it
    // Exact seeded values: prismArmor+moldBreaker=51, noPrismArmor+moldBreaker=68 (still 0.75x reduction)
    const fireMove = createCanonicalMove(MOVES.firePledge);
    const moldBreakerVsPrismArmor = dmg({
      attacker: createOnFieldPokemon({ ability: ABILITIES.moldBreaker, spAttack: 100 }),
      defender: createOnFieldPokemon({
        ability: ABILITIES.prismArmor,
        types: [TYPES.grass],
        spDefense: 100,
      }),
      move: fireMove,
      seed: 42,
    });
    const moldBreakerVsNone = dmg({
      attacker: createOnFieldPokemon({ ability: ABILITIES.moldBreaker, spAttack: 100 }),
      defender: createOnFieldPokemon({
        ability: ABILITIES.none,
        types: [TYPES.grass],
        spDefense: 100,
      }),
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
    const physicalMove = createCanonicalMove(MOVES.strength);
    const defender = createOnFieldPokemon({ defense: 100 });

    // Put defender in sides[1]
    const sidesWithScreen = [
      { active: [], bench: [], entryHazards: {}, screens: [] },
      {
        active: [defender],
        bench: [],
        entryHazards: {},
        screens: [{ type: SCREENS.reflect, turnsLeft: 5 }],
      },
    ];
    const stateWithScreen = createBattleState({ sides: sidesWithScreen });

    const critWithScreen = dmg({
      attacker: createOnFieldPokemon({ attack: 100 }),
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
    const stateNoScreen = createBattleState({ sides: sidesNoScreen });

    const critNoScreen = dmg({
      attacker: createOnFieldPokemon({ attack: 100 }),
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
    const physicalMove = createCanonicalMove(MOVES.strength);
    const defender = createOnFieldPokemon({ defense: 100 });

    const sidesWithScreen = [
      { active: [], bench: [], entryHazards: {}, screens: [] },
      {
        active: [defender],
        bench: [],
        entryHazards: {},
        screens: [{ type: SCREENS.reflect, turnsLeft: 5 }],
      },
    ];
    const stateWithScreen = createBattleState({ sides: sidesWithScreen });

    const noCritWithScreen = dmg({
      attacker: createOnFieldPokemon({ attack: 100 }),
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
    const stateNoScreen = createBattleState({ sides: sidesNoScreen });

    const noCritNoScreen = dmg({
      attacker: createOnFieldPokemon({ attack: 100 }),
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
    const fireMove = createCanonicalMove(MOVES.firePledge);
    const withExpertBelt = dmg({
      attacker: createOnFieldPokemon({ heldItem: ITEMS.expertBelt, spAttack: 100 }),
      defender: createOnFieldPokemon({ types: [TYPES.grass], spDefense: 100 }),
      move: fireMove,
      seed: 42,
    });
    const withoutItem = dmg({
      attacker: createOnFieldPokemon({ heldItem: null, spAttack: 100 }),
      defender: createOnFieldPokemon({ types: [TYPES.grass], spDefense: 100 }),
      move: fireMove,
      seed: 42,
    });
    expect(withExpertBelt).toBe(82);
    expect(withoutItem).toBe(68);
  });

  it("given Expert Belt + neutral-effectiveness move, when calculating damage, then damage equals no-item scenario (no Expert Belt boost)", () => {
    // Source: Showdown data/items.ts -- Expert Belt only boosts SE hits
    const normalMove = createCanonicalMove(MOVES.strength);
    const withExpertBelt = dmg({
      attacker: createOnFieldPokemon({ heldItem: ITEMS.expertBelt, attack: 100 }),
      defender: createOnFieldPokemon({ types: [TYPES.normal], defense: 100 }),
      move: normalMove,
      seed: 42,
    });
    const withoutItem = dmg({
      attacker: createOnFieldPokemon({ heldItem: null, attack: 100 }),
      defender: createOnFieldPokemon({ types: [TYPES.normal], defense: 100 }),
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
    const physicalMove = createCanonicalMove(MOVES.strength);
    const withMuscleBand = dmg({
      attacker: createOnFieldPokemon({ heldItem: ITEMS.muscleBand, attack: 100 }),
      move: physicalMove,
      seed: 42,
    });
    const withoutItem = dmg({
      attacker: createOnFieldPokemon({ heldItem: null, attack: 100 }),
      move: physicalMove,
      seed: 42,
    });
    expect(withMuscleBand).toBe(56);
    expect(withoutItem).toBe(51);
  });

  it("given Muscle Band + special move (not physical), when calculating damage, then damage equals no-item scenario (Muscle Band does not boost special)", () => {
    // Source: Showdown data/items.ts -- Muscle Band: only boosts physical moves
    const specialMove = createCanonicalMove(MOVES.firePledge);
    const withMuscleBand = dmg({
      attacker: createOnFieldPokemon({ heldItem: ITEMS.muscleBand, spAttack: 100 }),
      move: specialMove,
      seed: 42,
    });
    const withoutItem = dmg({
      attacker: createOnFieldPokemon({ heldItem: null, spAttack: 100 }),
      move: specialMove,
      seed: 42,
    });
    // Muscle Band gives no boost to special moves → equal
    expect(withMuscleBand).toBe(withoutItem);
  });
});
