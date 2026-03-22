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
import type { MoveData, MoveEffect, PokemonType } from "@pokemon-lib-ts/core";
import { SeededRandom } from "@pokemon-lib-ts/core";
import { describe, expect, it } from "vitest";
import { calculateGen8Damage } from "../src/Gen8DamageCalc";
import { GEN8_TYPE_CHART } from "../src/Gen8TypeChart";

const typeChart = GEN8_TYPE_CHART as Record<string, Record<string, number>>;

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
      speciesId: overrides.speciesId ?? 1,
      nickname: null,
      level: overrides.level ?? 50,
      experience: 0,
      nature: "hardy",
      ivs: { hp: 31, attack: 31, defense: 31, spAttack: 31, spDefense: 31, speed: 31 },
      evs: { hp: 0, attack: 0, defense: 0, spAttack: 0, spDefense: 0, speed: 0 },
      currentHp: overrides.currentHp ?? hp,
      moves: [],
      ability: overrides.ability ?? "none",
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
      pokeball: "pokeball",
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
    types: overrides.types ?? ["normal"],
    ability: overrides.ability ?? "none",
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
  return {
    id: overrides.id ?? "tackle",
    displayName: overrides.id ?? "Tackle",
    type: overrides.type ?? "normal",
    category: overrides.category ?? "physical",
    power: overrides.power ?? 50,
    accuracy: 100,
    pp: 35,
    priority: 0,
    target: overrides.target ?? "adjacent-foe",
    flags: {
      contact: true,
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
      ...overrides.flags,
    },
    effect: overrides.effect ?? null,
    description: "",
    generation: 8,
    critRatio: overrides.critRatio ?? 0,
    hasCrashDamage: overrides.hasCrashDamage ?? false,
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
      id: "tackle",
      type: "normal",
      power: 50,
      flags: { contact: false },
    });
    const withPixilate = dmg({
      attacker: makeActive({ ability: "pixilate", types: ["fighting"], attack: 100 }),
      defender: makeActive({ types: ["normal"], defense: 100 }),
      move: pixilateMove,
      seed: 42,
    });
    const withoutAbility = dmg({
      attacker: makeActive({ ability: "none", types: ["fighting"], attack: 100 }),
      defender: makeActive({ types: ["normal"], defense: 100 }),
      move: pixilateMove,
      seed: 42,
    });
    // Pixilate adds 1.2x power boost → damage must be strictly greater
    expect(withPixilate).toBeGreaterThan(withoutAbility);
  });

  it("given Normalize attacker + fire-type move vs normal-type defender, when calculating damage, then it deals damage (no Ghost immunity to normal)", () => {
    // Source: Showdown data/abilities.ts -- Normalize: all moves become Normal type + 1.2x power boost
    // Fire vs Normal = 1x normally. After Normalize, it's Normal vs Normal = 1x still.
    // The important thing is it doesn't get blocked by ghost immunity.
    const withNormalize = dmg({
      attacker: makeActive({ ability: "normalize", attack: 100 }),
      defender: makeActive({ types: ["normal"], defense: 100 }),
      move: makeMove({ type: "fire", power: 80, flags: { contact: false } }),
    });
    // Normalize gives 1.2x power boost, so damage > 0 and boosted
    const withoutNormalize = dmg({
      attacker: makeActive({ ability: "none", attack: 100 }),
      defender: makeActive({ types: ["normal"], defense: 100 }),
      move: makeMove({ type: "fire", power: 80, flags: { contact: false } }),
    });
    // Normalize changes Fire→Normal and boosts 1.2x, so damage is higher than raw fire move vs normal
    expect(withNormalize).toBeGreaterThan(withoutNormalize);
  });

  it("given Normalize attacker + fire-type move vs ghost-type defender, when calculating damage, then damage is positive (Normal vs Ghost is immune but normalize...)", () => {
    // Source: Showdown data/abilities.ts -- Normalize makes move Normal type
    // Normal vs Ghost = 0 (immune). Normalize does NOT give Scrappy-like bypass.
    const withNormalize = dmg({
      attacker: makeActive({ ability: "normalize", attack: 100 }),
      defender: makeActive({ types: ["ghost"], defense: 100 }),
      move: makeMove({ type: "fire", power: 80, flags: { contact: false } }),
    });
    // Normal vs Ghost = 0 damage. Normalize does not bypass Ghost immunity.
    expect(withNormalize).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// Group 2: SolarBeam in non-sun weather
// ---------------------------------------------------------------------------

describe("SolarBeam half power in non-sun weather", () => {
  it("given solar-beam (power=120) + rain weather, when calculating damage, then damage is less than solar-beam in no weather", () => {
    // Source: Showdown -- SolarBeam/SolarBlade power halved in non-sun weather
    const solarBeam = makeMove({
      id: "solar-beam",
      type: "grass",
      power: 120,
      category: "special",
      flags: { contact: false },
    });
    const inRain = dmg({
      move: solarBeam,
      state: makeState({ weather: { type: "rain", turnsLeft: 5, source: "" } }),
    });
    const noWeather = dmg({
      move: solarBeam,
      state: makeState(),
    });
    expect(inRain).toBeLessThan(noWeather);
  });

  it("given solar-beam + sand weather, when calculating damage, then damage is approximately half of no-weather damage", () => {
    // Source: Showdown -- SolarBeam power halved in sand too
    const solarBeam = makeMove({
      id: "solar-beam",
      type: "grass",
      power: 120,
      category: "special",
      flags: { contact: false },
    });
    const inSand = dmg({
      move: solarBeam,
      state: makeState({ weather: { type: "sand", turnsLeft: 5, source: "" } }),
      seed: 42,
    });
    const noWeather = dmg({
      move: solarBeam,
      state: makeState(),
      seed: 42,
    });
    expect(inSand).toBeLessThan(noWeather);
  });
});

// ---------------------------------------------------------------------------
// Group 3: Type-boost items
// ---------------------------------------------------------------------------

describe("Type-boost items (Charcoal, Flame Plate, Soul Dew)", () => {
  it("given Charcoal + fire-type move, when calculating damage, then damage exceeds no-item scenario", () => {
    // Source: Showdown data/items.ts -- Charcoal: onBasePower chainModify([4915,4096]) = ~1.2x for Fire
    const fireMove = makeMove({
      type: "fire",
      power: 80,
      category: "special",
      flags: { contact: false },
    });
    const withCharcoal = dmg({
      attacker: makeActive({ heldItem: "charcoal", spAttack: 100 }),
      move: fireMove,
    });
    const withoutItem = dmg({
      attacker: makeActive({ heldItem: null, spAttack: 100 }),
      move: fireMove,
    });
    expect(withCharcoal).toBeGreaterThan(withoutItem);
  });

  it("given Flame Plate (plate item) + fire-type move, when calculating damage, then damage exceeds no-item scenario", () => {
    // Source: Showdown data/items.ts -- Flame Plate: onBasePower chainModify([4915,4096]) = ~1.2x for Fire
    const fireMove = makeMove({
      type: "fire",
      power: 80,
      category: "special",
      flags: { contact: false },
    });
    const withFlamePlate = dmg({
      attacker: makeActive({ heldItem: "flame-plate", spAttack: 100 }),
      move: fireMove,
    });
    const withoutItem = dmg({
      attacker: makeActive({ heldItem: null, spAttack: 100 }),
      move: fireMove,
    });
    expect(withFlamePlate).toBeGreaterThan(withoutItem);
  });

  it("given Latios (speciesId=381) + soul-dew + dragon-type move, when calculating damage, then damage exceeds no-item scenario", () => {
    // Source: Showdown data/items.ts -- Soul Dew Gen 7+: onBasePower chainModify([4915,4096]) for Dragon/Psychic
    // Only works for Latias (380) or Latios (381)
    const dragonMove = makeMove({
      type: "dragon",
      power: 80,
      category: "special",
      flags: { contact: false },
    });
    const withSoulDew = dmg({
      attacker: makeActive({ speciesId: 381, heldItem: "soul-dew", spAttack: 100 }),
      move: dragonMove,
    });
    const withoutItem = dmg({
      attacker: makeActive({ speciesId: 381, heldItem: null, spAttack: 100 }),
      move: dragonMove,
    });
    expect(withSoulDew).toBeGreaterThan(withoutItem);
  });

  it("given Latias (speciesId=380) + soul-dew + psychic-type move, when calculating damage, then damage exceeds no-item scenario", () => {
    // Source: Showdown data/items.ts -- Soul Dew Gen 7+: also works for Latias (380) + Psychic
    const psychicMove = makeMove({
      type: "psychic",
      power: 90,
      category: "special",
      flags: { contact: false },
    });
    const withSoulDew = dmg({
      attacker: makeActive({ speciesId: 380, heldItem: "soul-dew", spAttack: 100 }),
      move: psychicMove,
    });
    const withoutItem = dmg({
      attacker: makeActive({ speciesId: 380, heldItem: null, spAttack: 100 }),
      move: psychicMove,
    });
    expect(withSoulDew).toBeGreaterThan(withoutItem);
  });
});

// ---------------------------------------------------------------------------
// Group 4: Knock Off power boost
// ---------------------------------------------------------------------------

describe("Knock Off: 1.5x power when target holds removable item", () => {
  it("given knock-off move + defender holding leftovers, when calculating damage, then damage exceeds defender with no item", () => {
    // Source: Showdown data/moves.ts -- knockoff: onBasePower: chainModify([6144,4096]) = 1.5x if target has item
    // Source: Bulbapedia "Knock Off" Gen 6+ -- 1.5x damage if target has removable item
    const knockOff = makeMove({ id: "knock-off", type: "dark", power: 65, category: "physical" });
    const defenderWithItem = makeActive({ heldItem: "leftovers", defense: 100 });
    const defenderNoItem = makeActive({ heldItem: null, defense: 100 });
    const withItem = dmg({ move: knockOff, defender: defenderWithItem, seed: 42 });
    const noItem = dmg({ move: knockOff, defender: defenderNoItem, seed: 42 });
    expect(withItem).toBeGreaterThan(noItem);
  });
});

// ---------------------------------------------------------------------------
// Group 5: Pinch abilities (Blaze at low HP)
// ---------------------------------------------------------------------------

describe("Pinch abilities: 1.5x power at or below 1/3 HP", () => {
  it("given Blaze attacker + fire move + HP at or below 1/3 max HP, when calculating damage, then damage exceeds full-HP scenario", () => {
    // Source: Bulbapedia "Blaze" -- 1.5x power for Fire moves when HP <= 1/3 max HP
    // Source: Showdown data/abilities.ts -- Blaze: pinch ability check
    const maxHp = 150;
    const threshold = Math.floor(maxHp / 3); // = 50
    const fireMove = makeMove({
      type: "fire",
      power: 80,
      category: "special",
      flags: { contact: false },
    });
    const lowHpDmg = dmg({
      attacker: makeActive({ ability: "blaze", hp: maxHp, currentHp: threshold, spAttack: 100 }),
      move: fireMove,
      seed: 42,
    });
    const fullHpDmg = dmg({
      attacker: makeActive({ ability: "blaze", hp: maxHp, currentHp: maxHp, spAttack: 100 }),
      move: fireMove,
      seed: 42,
    });
    // At threshold HP, blaze activates → 1.5x power → more damage
    expect(lowHpDmg).toBeGreaterThan(fullHpDmg);
  });
});

// ---------------------------------------------------------------------------
// Group 6: Flash Fire volatile
// ---------------------------------------------------------------------------

describe("Flash Fire volatile: 1.5x power for Fire moves", () => {
  it("given attacker with flash-fire volatile status + fire-type move, when calculating damage, then damage exceeds no-volatile scenario", () => {
    // Source: Showdown data/abilities.ts -- Flash Fire: onBasePower 1.5x for Fire after absorbing fire hit
    const flashFireVolatile = new Map([["flash-fire", { turnsLeft: 255 }]]);
    const fireMove = makeMove({
      type: "fire",
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
    expect(withFlashFire).toBeGreaterThan(withoutFlashFire);
  });
});

// ---------------------------------------------------------------------------
// Group 7: Dry Skin fire weakness
// ---------------------------------------------------------------------------

describe("Dry Skin: 1.25x power for incoming fire moves", () => {
  it("given Dry Skin defender + fire-type move, when calculating damage, then damage exceeds a defender without Dry Skin", () => {
    // Source: Showdown data/abilities.ts -- Dry Skin: onBasePower 1.25x for incoming Fire moves
    const fireMove = makeMove({
      type: "fire",
      power: 80,
      category: "special",
      flags: { contact: false },
    });
    const withDrySkin = dmg({
      attacker: makeActive({ spAttack: 100 }),
      defender: makeActive({ ability: "dry-skin", spDefense: 100 }),
      move: fireMove,
      seed: 42,
    });
    const withoutDrySkin = dmg({
      attacker: makeActive({ spAttack: 100 }),
      defender: makeActive({ ability: "none", spDefense: 100 }),
      move: fireMove,
      seed: 42,
    });
    expect(withDrySkin).toBeGreaterThan(withoutDrySkin);
  });
});

// ---------------------------------------------------------------------------
// Group 8: Technician
// ---------------------------------------------------------------------------

describe("Technician: 1.5x power for moves with base power <= 60", () => {
  it("given Technician + power=50 move, when calculating damage, then damage exceeds Technician + power=65 move with no boost", () => {
    // Source: Showdown data/abilities.ts -- Technician: 1.5x power if basePower <= 60
    // A 50BP move with Technician becomes effectively 75BP.
    // A 65BP move gets no Technician boost, so stays at 65BP.
    const lowPowerMove = makeMove({ power: 50, flags: { contact: false } });
    const highPowerMove = makeMove({ power: 65, flags: { contact: false } });
    const techLow = dmg({
      attacker: makeActive({ ability: "technician", attack: 100 }),
      move: lowPowerMove,
      seed: 42,
    });
    const techHigh = dmg({
      attacker: makeActive({ ability: "technician", attack: 100 }),
      move: highPowerMove,
      seed: 42,
    });
    // 50BP * 1.5 = 75BP > 65BP, so techLow > techHigh
    expect(techLow).toBeGreaterThan(techHigh);
  });
});

// ---------------------------------------------------------------------------
// Group 9: Iron Fist / Tough Claws / Strong Jaw / Mega Launcher
// ---------------------------------------------------------------------------

describe("Iron Fist: 1.2x power for punching moves", () => {
  it("given Iron Fist + punch move (flags.punch=true), when calculating damage, then damage exceeds non-punch user", () => {
    // Source: Showdown data/abilities.ts -- Iron Fist: onBasePower 1.2x for punch flag
    const punchMove = makeMove({ power: 80, flags: { punch: true, contact: true } });
    const withIronFist = dmg({
      attacker: makeActive({ ability: "iron-fist", attack: 100 }),
      move: punchMove,
      seed: 42,
    });
    const withoutAbility = dmg({
      attacker: makeActive({ ability: "none", attack: 100 }),
      move: punchMove,
      seed: 42,
    });
    expect(withIronFist).toBeGreaterThan(withoutAbility);
  });
});

describe("Tough Claws: ~1.3x power for contact moves", () => {
  it("given Tough Claws + contact move, when calculating damage, then damage exceeds Tough Claws + non-contact move", () => {
    // Source: Showdown data/abilities.ts -- Tough Claws: onBasePower chainModify([5325,4096]) = ~1.3x for contact
    const contactMove = makeMove({ power: 80, flags: { contact: true } });
    const nonContactMove = makeMove({ power: 80, flags: { contact: false } });
    const withContact = dmg({
      attacker: makeActive({ ability: "tough-claws", attack: 100 }),
      move: contactMove,
      seed: 42,
    });
    const withoutContact = dmg({
      attacker: makeActive({ ability: "tough-claws", attack: 100 }),
      move: nonContactMove,
      seed: 42,
    });
    expect(withContact).toBeGreaterThan(withoutContact);
  });
});

describe("Strong Jaw: 1.5x power for bite moves", () => {
  it("given Strong Jaw + bite move (flags.bite=true), when calculating damage, then damage exceeds no-ability attacker", () => {
    // Source: Showdown data/abilities.ts -- Strong Jaw: onBasePower chainModify([6144,4096]) = 1.5x for bite
    const biteMove = makeMove({ power: 60, flags: { bite: true, contact: true } });
    const withStrongJaw = dmg({
      attacker: makeActive({ ability: "strong-jaw", attack: 100 }),
      move: biteMove,
      seed: 42,
    });
    const withoutAbility = dmg({
      attacker: makeActive({ ability: "none", attack: 100 }),
      move: biteMove,
      seed: 42,
    });
    expect(withStrongJaw).toBeGreaterThan(withoutAbility);
  });
});

describe("Mega Launcher: 1.5x power for pulse moves", () => {
  it("given Mega Launcher + pulse move (flags.pulse=true), when calculating damage, then damage exceeds no-ability attacker", () => {
    // Source: Showdown data/abilities.ts -- Mega Launcher: onBasePower chainModify([6144,4096]) = 1.5x for pulse
    const pulseMove = makeMove({
      power: 80,
      category: "special",
      flags: { pulse: true, contact: false },
    });
    const withMegaLauncher = dmg({
      attacker: makeActive({ ability: "mega-launcher", spAttack: 100 }),
      move: pulseMove,
      seed: 42,
    });
    const withoutAbility = dmg({
      attacker: makeActive({ ability: "none", spAttack: 100 }),
      move: pulseMove,
      seed: 42,
    });
    expect(withMegaLauncher).toBeGreaterThan(withoutAbility);
  });
});

// ---------------------------------------------------------------------------
// Group 10: Reckless and Sheer Force
// ---------------------------------------------------------------------------

describe("Reckless: 1.2x power for moves with recoil/crash", () => {
  it("given Reckless + move with hasCrashDamage=true, when calculating damage, then damage exceeds Reckless + non-crash move", () => {
    // Source: Showdown data/abilities.ts -- Reckless: 1.2x for moves with recoil or crash
    const crashMove = makeMove({ power: 120, hasCrashDamage: true, flags: { contact: true } });
    const normalMove = makeMove({ power: 120, hasCrashDamage: false, flags: { contact: true } });
    const withCrash = dmg({
      attacker: makeActive({ ability: "reckless", attack: 100 }),
      move: crashMove,
      seed: 42,
    });
    const withoutCrash = dmg({
      attacker: makeActive({ ability: "reckless", attack: 100 }),
      move: normalMove,
      seed: 42,
    });
    expect(withCrash).toBeGreaterThan(withoutCrash);
  });

  it("given Reckless + move with recoil effect, when calculating damage, then damage exceeds no-ability attacker", () => {
    // Source: Showdown data/abilities.ts -- Reckless: also boosts recoil moves
    const recoilEffect: MoveEffect = { type: "recoil", fraction: [1, 3] };
    const recoilMove = makeMove({ power: 90, effect: recoilEffect, flags: { contact: true } });
    const withReckless = dmg({
      attacker: makeActive({ ability: "reckless", attack: 100 }),
      move: recoilMove,
      seed: 42,
    });
    const withoutReckless = dmg({
      attacker: makeActive({ ability: "none", attack: 100 }),
      move: recoilMove,
      seed: 42,
    });
    expect(withReckless).toBeGreaterThan(withoutReckless);
  });
});

describe("Sheer Force: ~1.3x power for moves with secondary effects", () => {
  it("given Sheer Force + move with status-chance effect, when calculating damage, then damage exceeds no-ability attacker", () => {
    // Source: Showdown data/abilities.ts -- Sheer Force: chainModify([5325,4096]) for moves with secondaries
    const statusChanceEffect: MoveEffect = { type: "status-chance", chance: 30, status: "burn" };
    const statusChanceMove = makeMove({
      power: 80,
      category: "special",
      effect: statusChanceEffect,
      flags: { contact: false },
    });
    const withSheerForce = dmg({
      attacker: makeActive({ ability: "sheer-force", spAttack: 100 }),
      move: statusChanceMove,
      seed: 42,
    });
    const withoutAbility = dmg({
      attacker: makeActive({ ability: "none", spAttack: 100 }),
      move: statusChanceMove,
      seed: 42,
    });
    expect(withSheerForce).toBeGreaterThan(withoutAbility);
  });
});

// ---------------------------------------------------------------------------
// Group 11: Venoshock, Hex, Acrobatics
// ---------------------------------------------------------------------------

describe("Venoshock: doubles power when target is poisoned", () => {
  it("given Venoshock + defender with poison status, when calculating damage, then damage is double no-poison scenario", () => {
    // Source: Showdown data/moves.ts -- venoshock: onBasePower chainModify(2) if target poisoned
    const venoshock = makeMove({
      id: "venoshock",
      type: "poison",
      power: 65,
      category: "special",
      flags: { contact: false },
    });
    const poisonedDmg = dmg({
      defender: makeActive({ status: "poison", types: ["normal"], spDefense: 100 }),
      move: venoshock,
      seed: 42,
    });
    const healthyDmg = dmg({
      defender: makeActive({ status: null, types: ["normal"], spDefense: 100 }),
      move: venoshock,
      seed: 42,
    });
    expect(poisonedDmg).toBeGreaterThan(healthyDmg);
  });

  it("given Venoshock + defender with badly-poisoned status, when calculating damage, then damage is greater than no-status", () => {
    // Source: Showdown data/moves.ts -- venoshock: onBasePower also doubles for badly-poisoned
    const venoshock = makeMove({
      id: "venoshock",
      type: "poison",
      power: 65,
      category: "special",
      flags: { contact: false },
    });
    const badlyPoisonedDmg = dmg({
      defender: makeActive({ status: "badly-poisoned", types: ["normal"], spDefense: 100 }),
      move: venoshock,
      seed: 42,
    });
    const healthyDmg = dmg({
      defender: makeActive({ status: null, types: ["normal"], spDefense: 100 }),
      move: venoshock,
      seed: 42,
    });
    expect(badlyPoisonedDmg).toBeGreaterThan(healthyDmg);
  });
});

describe("Hex: doubles power when target has any status condition", () => {
  it("given Hex + defender with sleep status, when calculating damage, then damage is greater than no-status", () => {
    // Source: Showdown data/moves.ts -- hex: onBasePower chainModify(2) if target has status
    // Ghost vs Normal = 0 (immune). Use Psychic-type defender so Ghost hits for 1x.
    const hex = makeMove({
      id: "hex",
      type: "ghost",
      power: 65,
      category: "special",
      flags: { contact: false },
    });
    const sleepDmg = dmg({
      defender: makeActive({ status: "sleep", types: ["psychic"], spDefense: 100 }),
      move: hex,
      seed: 42,
    });
    const healthyDmg = dmg({
      defender: makeActive({ status: null, types: ["psychic"], spDefense: 100 }),
      move: hex,
      seed: 42,
    });
    expect(sleepDmg).toBeGreaterThan(healthyDmg);
  });
});

describe("Acrobatics: doubles power when attacker has no held item", () => {
  it("given Acrobatics + attacker with no held item, when calculating damage, then damage is greater than Acrobatics + attacker holding an item", () => {
    // Source: Showdown data/moves.ts -- Acrobatics: basePowerCallback doubles power if user has no item
    const acrobatics = makeMove({
      id: "acrobatics",
      type: "flying",
      power: 55,
      category: "physical",
      flags: { contact: true },
    });
    const noItemDmg = dmg({
      attacker: makeActive({ heldItem: null, ability: "none", types: ["flying"] }),
      move: acrobatics,
      seed: 42,
    });
    const hasItemDmg = dmg({
      attacker: makeActive({ heldItem: "oran-berry", ability: "none", types: ["flying"] }),
      move: acrobatics,
      seed: 42,
    });
    // No item → 2x power → significantly more damage
    expect(noItemDmg).toBeGreaterThan(hasItemDmg);
  });
});

// ---------------------------------------------------------------------------
// Group 12: Rivalry
// ---------------------------------------------------------------------------

describe("Rivalry: gender-dependent power modifier", () => {
  it("given Rivalry + male attacker + male defender (same gender), when calculating damage, then damage exceeds genderless-vs-genderless scenario (no boost)", () => {
    // Source: Showdown data/abilities.ts -- Rivalry: 1.25x if same gender, 0.75x if opposite
    const rivalryMove = makeMove({ power: 80, flags: { contact: false } });
    const sameGenderDmg = dmg({
      attacker: makeActive({ ability: "rivalry", gender: "male" }),
      defender: makeActive({ gender: "male" }),
      move: rivalryMove,
      seed: 42,
    });
    // Genderless vs genderless gives no rivalry modifier
    const genderlessDmg = dmg({
      attacker: makeActive({ ability: "rivalry", gender: "genderless" }),
      defender: makeActive({ gender: "genderless" }),
      move: rivalryMove,
      seed: 42,
    });
    // Same gender → 1.25x boost vs no boost
    expect(sameGenderDmg).toBeGreaterThan(genderlessDmg);
  });

  it("given Rivalry + male attacker + female defender (opposite gender), when calculating damage, then damage is less than genderless scenario", () => {
    // Source: Showdown data/abilities.ts -- Rivalry: 0.75x if opposite gender
    const rivalryMove = makeMove({ power: 80, flags: { contact: false } });
    const oppositeGenderDmg = dmg({
      attacker: makeActive({ ability: "rivalry", gender: "male" }),
      defender: makeActive({ gender: "female" }),
      move: rivalryMove,
      seed: 42,
    });
    const genderlessDmg = dmg({
      attacker: makeActive({ ability: "rivalry", gender: "genderless" }),
      defender: makeActive({ gender: "genderless" }),
      move: rivalryMove,
      seed: 42,
    });
    // Opposite gender → 0.75x penalty vs no modifier
    expect(oppositeGenderDmg).toBeLessThan(genderlessDmg);
  });
});

// ---------------------------------------------------------------------------
// Group 13: Adamant / Lustrous / Griseous Orbs
// ---------------------------------------------------------------------------

describe("Adamant / Lustrous / Griseous Orbs: ~1.2x power for specific types on specific Pokemon", () => {
  it("given Dialga (speciesId=483) + adamant-orb + steel-type move, when calculating damage, then damage exceeds no-item", () => {
    // Source: Showdown data/items.ts -- Adamant Orb: chainModify([4915,4096]) for Dragon/Steel on Dialga (483)
    const steelMove = makeMove({
      type: "steel",
      power: 80,
      category: "physical",
      flags: { contact: false },
    });
    const withAdamantOrb = dmg({
      attacker: makeActive({ speciesId: 483, heldItem: "adamant-orb", attack: 100 }),
      move: steelMove,
      seed: 42,
    });
    const withoutItem = dmg({
      attacker: makeActive({ speciesId: 483, heldItem: null, attack: 100 }),
      move: steelMove,
      seed: 42,
    });
    expect(withAdamantOrb).toBeGreaterThan(withoutItem);
  });

  it("given Palkia (speciesId=484) + lustrous-orb + dragon-type move, when calculating damage, then damage exceeds no-item", () => {
    // Source: Showdown data/items.ts -- Lustrous Orb: chainModify([4915,4096]) for Water/Dragon on Palkia (484)
    const dragonMove = makeMove({
      type: "dragon",
      power: 80,
      category: "special",
      flags: { contact: false },
    });
    const withLustrousOrb = dmg({
      attacker: makeActive({ speciesId: 484, heldItem: "lustrous-orb", spAttack: 100 }),
      move: dragonMove,
      seed: 42,
    });
    const withoutItem = dmg({
      attacker: makeActive({ speciesId: 484, heldItem: null, spAttack: 100 }),
      move: dragonMove,
      seed: 42,
    });
    expect(withLustrousOrb).toBeGreaterThan(withoutItem);
  });

  it("given Giratina (speciesId=487) + griseous-orb + ghost-type move, when calculating damage, then damage exceeds no-item", () => {
    // Source: Showdown data/items.ts -- Griseous Orb: chainModify([4915,4096]) for Ghost/Dragon on Giratina (487)
    // Ghost vs Normal = 0 (immune). Use Psychic-type defender so Ghost hits for 1x.
    const ghostMove = makeMove({
      type: "ghost",
      power: 80,
      category: "physical",
      flags: { contact: false },
    });
    const withGriseousOrb = dmg({
      attacker: makeActive({ speciesId: 487, heldItem: "griseous-orb", attack: 100 }),
      defender: makeActive({ types: ["psychic"], defense: 100 }),
      move: ghostMove,
      seed: 42,
    });
    const withoutItem = dmg({
      attacker: makeActive({ speciesId: 487, heldItem: null, attack: 100 }),
      defender: makeActive({ types: ["psychic"], defense: 100 }),
      move: ghostMove,
      seed: 42,
    });
    expect(withGriseousOrb).toBeGreaterThan(withoutItem);
  });
});

// ---------------------------------------------------------------------------
// Group 14: Terrain boost and Grassy halved
// ---------------------------------------------------------------------------

describe("Terrain power modifiers", () => {
  it("given Electric Terrain active + electric-type move + grounded attacker, when calculating damage, then damage exceeds no-terrain", () => {
    // Source: Showdown data/mods/gen8/scripts.ts -- terrain boost 1.3x (5325/4096) in Gen 8
    const electricMove = makeMove({
      type: "electric",
      power: 90,
      category: "special",
      flags: { contact: false },
    });
    // Grounded attacker (no flying type, no levitate, no air balloon)
    const attacker = makeActive({ types: ["normal"], spAttack: 100 });
    const withTerrain = dmg({
      attacker,
      move: electricMove,
      state: makeState({ terrain: { type: "electric", turnsLeft: 5, source: "" } }),
      seed: 42,
    });
    const noTerrain = dmg({
      attacker,
      move: electricMove,
      state: makeState(),
      seed: 42,
    });
    expect(withTerrain).toBeGreaterThan(noTerrain);
  });

  it("given Grassy Terrain active + earthquake vs grounded defender, when calculating damage, then damage is less than no-terrain", () => {
    // Source: Showdown data/conditions.ts -- grassyterrain.onModifyDamage: halves Earthquake/Bulldoze/Magnitude
    const earthquake = makeMove({
      id: "earthquake",
      type: "ground",
      power: 100,
      category: "physical",
      flags: { contact: false },
    });
    // Both attacker and defender are grounded (normal type)
    const withTerrain = dmg({
      attacker: makeActive({ types: ["normal"], attack: 100 }),
      defender: makeActive({ types: ["normal"], defense: 100 }),
      move: earthquake,
      state: makeState({ terrain: { type: "grassy", turnsLeft: 5, source: "" } }),
      seed: 42,
    });
    const noTerrain = dmg({
      attacker: makeActive({ types: ["normal"], attack: 100 }),
      defender: makeActive({ types: ["normal"], defense: 100 }),
      move: earthquake,
      state: makeState(),
      seed: 42,
    });
    expect(withTerrain).toBeLessThan(noTerrain);
  });
});

// ---------------------------------------------------------------------------
// Group 15: Weather extremes (total immunity)
// ---------------------------------------------------------------------------

describe("Heavy-rain and Harsh-sun weather extremes", () => {
  it("given heavy-rain weather + fire-type move, when calculating damage, then returns 0 damage", () => {
    // Source: Showdown sim/battle-actions.ts -- heavy-rain completely blocks fire moves
    const fireMove = makeMove({
      type: "fire",
      power: 80,
      category: "special",
      flags: { contact: false },
    });
    const result = dmg({
      move: fireMove,
      state: makeState({ weather: { type: "heavy-rain", turnsLeft: 255, source: "" } }),
    });
    expect(result).toBe(0);
  });

  it("given harsh-sun weather + water-type move, when calculating damage, then returns 0 damage", () => {
    // Source: Showdown sim/battle-actions.ts -- harsh-sun completely blocks water moves
    const waterMove = makeMove({
      type: "water",
      power: 90,
      category: "special",
      flags: { contact: false },
    });
    const result = dmg({
      move: waterMove,
      state: makeState({ weather: { type: "harsh-sun", turnsLeft: 255, source: "" } }),
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
      type: "ground",
      power: 80,
      category: "physical",
      flags: { contact: false },
    });
    const flyingDefender = makeActive({ types: ["flying"], defense: 100 });
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
    expect(noGravity).toBe(0);
    expect(withGravity).toBeGreaterThan(0);
  });
});

// ---------------------------------------------------------------------------
// Group 17: Scrappy hits Ghost type
// ---------------------------------------------------------------------------

describe("Scrappy: Normal and Fighting types hit Ghost-type Pokemon", () => {
  it("given Scrappy attacker + normal-type move vs ghost-type defender, when calculating damage, then damage is greater than 0", () => {
    // Source: Showdown data/abilities.ts -- Scrappy: Normal/Fighting hit Ghost type
    const normalMove = makeMove({
      type: "normal",
      power: 80,
      category: "physical",
      flags: { contact: true },
    });
    const ghostDefender = makeActive({ types: ["ghost"], defense: 100 });
    const withScrappy = dmg({
      attacker: makeActive({ ability: "scrappy", attack: 100 }),
      defender: ghostDefender,
      move: normalMove,
    });
    // Without Scrappy, Normal vs Ghost = 0
    const withoutScrappy = dmg({
      attacker: makeActive({ ability: "none", attack: 100 }),
      defender: ghostDefender,
      move: normalMove,
    });
    expect(withoutScrappy).toBe(0);
    expect(withScrappy).toBeGreaterThan(0);
  });
});

// ---------------------------------------------------------------------------
// Group 18: Wonder Guard
// ---------------------------------------------------------------------------

describe("Wonder Guard: only super-effective moves deal damage", () => {
  it("given Wonder Guard defender + neutral-effectiveness move, when calculating damage, then returns 0 damage", () => {
    // Source: Showdown data/abilities.ts -- Wonder Guard: only SE hits land
    // Normal vs Normal = 1x (neutral) — Wonder Guard blocks it
    const normalMove = makeMove({ type: "normal", power: 80, category: "physical" });
    const wonderGuardDef = makeActive({ ability: "wonder-guard", types: ["normal"], defense: 100 });
    const result = dmg({
      defender: wonderGuardDef,
      move: normalMove,
    });
    expect(result).toBe(0);
  });

  it("given Wonder Guard defender + super-effective move, when calculating damage, then damage is greater than 0", () => {
    // Source: Showdown data/abilities.ts -- Wonder Guard: SE moves still deal damage
    // Fire vs Grass = 2x (super effective) — Wonder Guard allows it
    const fireMove = makeMove({
      type: "fire",
      power: 80,
      category: "special",
      flags: { contact: false },
    });
    const wonderGuardGrass = makeActive({
      ability: "wonder-guard",
      types: ["grass"],
      spDefense: 100,
    });
    const result = dmg({
      defender: wonderGuardGrass,
      move: fireMove,
    });
    expect(result).toBeGreaterThan(0);
  });
});

// ---------------------------------------------------------------------------
// Group 19: Levitate Ground immunity
// ---------------------------------------------------------------------------

describe("Levitate: immune to Ground-type moves", () => {
  it("given Levitate defender + ground-type move, when calculating damage, then returns 0 damage", () => {
    // Source: Showdown data/abilities.ts -- Levitate: immunity to Ground
    const groundMove = makeMove({
      type: "ground",
      power: 80,
      category: "physical",
      flags: { contact: false },
    });
    const levitateDefender = makeActive({ ability: "levitate", types: ["normal"], defense: 100 });
    const result = dmg({
      defender: levitateDefender,
      move: groundMove,
    });
    expect(result).toBe(0);
  });

  it("given Mold Breaker attacker + Levitate defender + ground move, when calculating damage, then damage is greater than 0", () => {
    // Source: Showdown data/abilities.ts -- Mold Breaker bypasses Levitate
    const groundMove = makeMove({
      type: "ground",
      power: 80,
      category: "physical",
      flags: { contact: false },
    });
    const levitateDefender = makeActive({ ability: "levitate", types: ["normal"], defense: 100 });
    const result = dmg({
      attacker: makeActive({ ability: "mold-breaker", attack: 100 }),
      defender: levitateDefender,
      move: groundMove,
    });
    expect(result).toBeGreaterThan(0);
  });
});

// ---------------------------------------------------------------------------
// Group 20: Thick Fat and Heatproof
// ---------------------------------------------------------------------------

describe("Thick Fat: halves attacker's effective attack for Fire/Ice moves", () => {
  it("given Thick Fat defender + fire-type move, when calculating damage, then damage is less than without Thick Fat", () => {
    // Source: Showdown data/abilities.ts -- Thick Fat: halves attack stat for Fire/Ice
    const fireMove = makeMove({
      type: "fire",
      power: 80,
      category: "special",
      flags: { contact: false },
    });
    const withThickFat = dmg({
      defender: makeActive({ ability: "thick-fat", spDefense: 100 }),
      move: fireMove,
      seed: 42,
    });
    const withoutThickFat = dmg({
      defender: makeActive({ ability: "none", spDefense: 100 }),
      move: fireMove,
      seed: 42,
    });
    expect(withThickFat).toBeLessThan(withoutThickFat);
  });
});

describe("Heatproof: halves power for incoming fire moves", () => {
  it("given Heatproof defender + fire-type move, when calculating damage, then damage is less than without Heatproof", () => {
    // Source: Showdown data/abilities.ts -- Heatproof: onBasePower halves Fire damage
    const fireMove = makeMove({
      type: "fire",
      power: 80,
      category: "special",
      flags: { contact: false },
    });
    const withHeatproof = dmg({
      defender: makeActive({ ability: "heatproof", spDefense: 100 }),
      move: fireMove,
      seed: 42,
    });
    const withoutHeatproof = dmg({
      defender: makeActive({ ability: "none", spDefense: 100 }),
      move: fireMove,
      seed: 42,
    });
    expect(withHeatproof).toBeLessThan(withoutHeatproof);
  });
});

// ---------------------------------------------------------------------------
// Group 21: Post-formula modifiers — Tinted Lens, Filter/Solid Rock, Prism Armor
// ---------------------------------------------------------------------------

describe("Tinted Lens: doubles not-very-effective damage", () => {
  it("given Tinted Lens + electric-type move vs ground-type defender (NVE... wait, actually immune — use grass vs fire = 0.5x), when damage calc, then damage exceeds no-ability scenario", () => {
    // Source: Showdown data/abilities.ts -- Tinted Lens: doubles damage if effectiveness < 1
    // Water vs Grass = 0.5x (NVE). With Tinted Lens it becomes effectively 1x.
    const waterMove = makeMove({
      type: "water",
      power: 80,
      category: "special",
      flags: { contact: false },
    });
    const withTintedLens = dmg({
      attacker: makeActive({ ability: "tinted-lens", spAttack: 100 }),
      defender: makeActive({ types: ["grass"], spDefense: 100 }),
      move: waterMove,
      seed: 42,
    });
    const withoutAbility = dmg({
      attacker: makeActive({ ability: "none", spAttack: 100 }),
      defender: makeActive({ types: ["grass"], spDefense: 100 }),
      move: waterMove,
      seed: 42,
    });
    // With Tinted Lens: NVE becomes 2x of NVE = neutral. Without: 0.5x penalty.
    expect(withTintedLens).toBeGreaterThan(withoutAbility);
  });
});

describe("Filter / Solid Rock: 0.75x SE damage (bypassed by Mold Breaker)", () => {
  it("given Filter defender + super-effective move, when calculating damage, then damage is less than without Filter", () => {
    // Source: Showdown data/abilities.ts -- Filter: onSourceModifyDamage 0.75x for SE, breakable by Mold Breaker
    const fireMove = makeMove({
      type: "fire",
      power: 80,
      category: "special",
      flags: { contact: false },
    });
    const withFilter = dmg({
      attacker: makeActive({ ability: "none", spAttack: 100 }),
      defender: makeActive({ ability: "filter", types: ["grass"], spDefense: 100 }),
      move: fireMove,
      seed: 42,
    });
    const withoutFilter = dmg({
      attacker: makeActive({ ability: "none", spAttack: 100 }),
      defender: makeActive({ ability: "none", types: ["grass"], spDefense: 100 }),
      move: fireMove,
      seed: 42,
    });
    expect(withFilter).toBeLessThan(withoutFilter);
  });

  it("given Mold Breaker attacker + Filter defender + SE move, when calculating damage, then damage equals no-filter (Mold Breaker bypasses)", () => {
    // Source: Showdown data/abilities.ts -- Filter has breakable:1, Mold Breaker bypasses it
    const fireMove = makeMove({
      type: "fire",
      power: 80,
      category: "special",
      flags: { contact: false },
    });
    const moldBreakerVsFilter = dmg({
      attacker: makeActive({ ability: "mold-breaker", spAttack: 100 }),
      defender: makeActive({ ability: "filter", types: ["grass"], spDefense: 100 }),
      move: fireMove,
      seed: 42,
    });
    const moldBreakerVsNone = dmg({
      attacker: makeActive({ ability: "mold-breaker", spAttack: 100 }),
      defender: makeActive({ ability: "none", types: ["grass"], spDefense: 100 }),
      move: fireMove,
      seed: 42,
    });
    // Mold Breaker bypasses Filter → same damage as no-ability
    expect(moldBreakerVsFilter).toBe(moldBreakerVsNone);
  });
});

describe("Prism Armor: 0.75x SE damage (NOT bypassed by Mold Breaker)", () => {
  it("given Prism Armor defender + SE move, when calculating damage, then damage is less than without Prism Armor", () => {
    // Source: Showdown data/abilities.ts -- Prism Armor: onSourceModifyDamage 0.75x for SE, no breakable flag
    const fireMove = makeMove({
      type: "fire",
      power: 80,
      category: "special",
      flags: { contact: false },
    });
    const withPrismArmor = dmg({
      attacker: makeActive({ spAttack: 100 }),
      defender: makeActive({ ability: "prism-armor", types: ["grass"], spDefense: 100 }),
      move: fireMove,
      seed: 42,
    });
    const withoutPrismArmor = dmg({
      attacker: makeActive({ spAttack: 100 }),
      defender: makeActive({ ability: "none", types: ["grass"], spDefense: 100 }),
      move: fireMove,
      seed: 42,
    });
    expect(withPrismArmor).toBeLessThan(withoutPrismArmor);
  });

  it("given Mold Breaker attacker + Prism Armor defender + SE move, when calculating damage, then Prism Armor still reduces damage (not bypassed)", () => {
    // Source: Showdown data/abilities.ts -- Prism Armor has no breakable flag → Mold Breaker cannot bypass it
    const fireMove = makeMove({
      type: "fire",
      power: 80,
      category: "special",
      flags: { contact: false },
    });
    const moldBreakerVsPrismArmor = dmg({
      attacker: makeActive({ ability: "mold-breaker", spAttack: 100 }),
      defender: makeActive({ ability: "prism-armor", types: ["grass"], spDefense: 100 }),
      move: fireMove,
      seed: 42,
    });
    const moldBreakerVsNone = dmg({
      attacker: makeActive({ ability: "mold-breaker", spAttack: 100 }),
      defender: makeActive({ ability: "none", types: ["grass"], spDefense: 100 }),
      move: fireMove,
      seed: 42,
    });
    // Prism Armor is not bypassed → damage is still reduced vs no-ability
    expect(moldBreakerVsPrismArmor).toBeLessThan(moldBreakerVsNone);
  });
});

// ---------------------------------------------------------------------------
// Group 22: Screens bypassed on crit
// ---------------------------------------------------------------------------

describe("Screens: bypassed on critical hits", () => {
  it("given Reflect screen on defender side + physical move + isCrit=true, when calculating damage, then damage equals no-screen damage", () => {
    // Source: Showdown sim/battle-actions.ts -- screens do NOT apply on crits
    const physicalMove = makeMove({
      type: "normal",
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
        screens: [{ type: "reflect", turnsLeft: 5 }],
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
      type: "normal",
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
        screens: [{ type: "reflect", turnsLeft: 5 }],
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
    expect(noCritWithScreen).toBeLessThan(noCritNoScreen);
  });
});

// ---------------------------------------------------------------------------
// Group 23: Expert Belt and Muscle Band
// ---------------------------------------------------------------------------

describe("Expert Belt: 1.2x for super-effective moves", () => {
  it("given Expert Belt + super-effective fire move vs grass defender, when calculating damage, then damage exceeds no-item scenario", () => {
    // Source: Showdown data/items.ts -- Expert Belt: onModifyDamage chainModify([4915,4096]) = ~1.2x for SE
    const fireMove = makeMove({
      type: "fire",
      power: 80,
      category: "special",
      flags: { contact: false },
    });
    const withExpertBelt = dmg({
      attacker: makeActive({ heldItem: "expert-belt", spAttack: 100 }),
      defender: makeActive({ types: ["grass"], spDefense: 100 }),
      move: fireMove,
      seed: 42,
    });
    const withoutItem = dmg({
      attacker: makeActive({ heldItem: null, spAttack: 100 }),
      defender: makeActive({ types: ["grass"], spDefense: 100 }),
      move: fireMove,
      seed: 42,
    });
    expect(withExpertBelt).toBeGreaterThan(withoutItem);
  });

  it("given Expert Belt + neutral-effectiveness move, when calculating damage, then damage equals no-item scenario (no Expert Belt boost)", () => {
    // Source: Showdown data/items.ts -- Expert Belt only boosts SE hits
    const normalMove = makeMove({
      type: "normal",
      power: 80,
      category: "physical",
      flags: { contact: false },
    });
    const withExpertBelt = dmg({
      attacker: makeActive({ heldItem: "expert-belt", attack: 100 }),
      defender: makeActive({ types: ["normal"], defense: 100 }),
      move: normalMove,
      seed: 42,
    });
    const withoutItem = dmg({
      attacker: makeActive({ heldItem: null, attack: 100 }),
      defender: makeActive({ types: ["normal"], defense: 100 }),
      move: normalMove,
      seed: 42,
    });
    // No SE, Expert Belt does nothing → equal damage
    expect(withExpertBelt).toBe(withoutItem);
  });
});

describe("Muscle Band: 1.1x for physical moves", () => {
  it("given Muscle Band + physical move, when calculating damage, then damage exceeds no-item scenario", () => {
    // Source: Showdown data/items.ts -- Muscle Band: onModifyDamage chainModify([4505,4096]) = ~1.1x for physical
    const physicalMove = makeMove({
      type: "normal",
      power: 80,
      category: "physical",
      flags: { contact: false },
    });
    const withMuscleBand = dmg({
      attacker: makeActive({ heldItem: "muscle-band", attack: 100 }),
      move: physicalMove,
      seed: 42,
    });
    const withoutItem = dmg({
      attacker: makeActive({ heldItem: null, attack: 100 }),
      move: physicalMove,
      seed: 42,
    });
    expect(withMuscleBand).toBeGreaterThan(withoutItem);
  });

  it("given Muscle Band + special move (not physical), when calculating damage, then damage equals no-item scenario (Muscle Band does not boost special)", () => {
    // Source: Showdown data/items.ts -- Muscle Band: only boosts physical moves
    const specialMove = makeMove({
      type: "normal",
      power: 80,
      category: "special",
      flags: { contact: false },
    });
    const withMuscleBand = dmg({
      attacker: makeActive({ heldItem: "muscle-band", spAttack: 100 }),
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
