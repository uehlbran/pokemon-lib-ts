import type { ActivePokemon, DamageContext, ItemContext } from "@pokemon-lib-ts/battle";
import {
  CORE_ABILITY_IDS,
  CORE_ABILITY_SLOTS,
  CORE_GENDERS,
  CORE_ITEM_TRIGGER_IDS,
  CORE_STATUS_IDS,
  CORE_TYPE_IDS,
  CORE_VOLATILE_IDS,
  SeededRandom,
  createMoveSlot,
  type MoveData,
  type PokemonInstance,
  type PokemonType,
  type PrimaryStatus,
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
  calculateGen4Damage,
  applyGen4HeldItem,
  Gen4Ruleset,
  GEN4_TYPE_CHART,
} from "../src";

/**
 * Gen 4 Cross-System Interaction Tests
 *
 * Verifies ability + item + move interactions that span multiple
 * implementation files (Gen4DamageCalc, Gen4Items, Gen4Ruleset).
 *
 * Coverage:
 *   - Magic Guard + Life Orb: boost applies, recoil does NOT (issue #549)
 *   - Unburden + Berry consumption: volatile set when berry is consumed
 *   - Klutz + items: ALL item triggers suppressed (damage calc + on-hit)
 *   - Technician boundary: exactly 60 BP → boosted; 61 BP → NOT boosted
 *   - Life Orb: recoil only when damage > 0 (not on miss/0-damage)
 *   - Charti Berry: halves SE Rock damage (consumed after activation)
 *   - Skill Link: rollMultiHitCount always returns 5
 *   - Type-resist berry + Unburden: consuming berry activates Unburden volatile
 *   - Reckless: Struggle (effect: null) is NOT boosted
 *   - Focus Sash: does NOT activate when not at full HP
 *   - Lum Berry: cures each of the 5 primary statuses individually
 *
 * Sources:
 *   - Showdown Gen 4 mod — ability/item interaction dispatch
 *   - Bulbapedia — individual ability and item mechanic pages
 *   - pret/pokeplatinum — multi-hit, Technician, Skill Link
 */

// ---------------------------------------------------------------------------
// Test helpers
// ---------------------------------------------------------------------------

function createMockRng(intReturnValue = 100, chanceResult = false) {
  return {
    next: () => 0,
    int: (_min: number, _max: number) => intReturnValue,
    chance: (_p: number) => chanceResult,
    pick: <T>(arr: readonly T[]) => arr[0] as T,
    shuffle: <T>(arr: readonly T[]) => [...arr],
    getState: () => 0,
    setState: () => {},
  };
}

const dataManager = createGen4DataManager();
const A = GEN4_ABILITY_IDS;
const I = GEN4_ITEM_IDS;
const M = GEN4_MOVE_IDS;
const N = GEN4_NATURE_IDS;
const S = GEN4_SPECIES_IDS;
const AS = CORE_ABILITY_SLOTS;
const G = CORE_GENDERS;
const TRIGGERS = CORE_ITEM_TRIGGER_IDS;
const T = CORE_TYPE_IDS;
const ST = CORE_STATUS_IDS;
const V = CORE_VOLATILE_IDS;
const NONE = CORE_ABILITY_IDS.none;
const TACKLE = dataManager.getMove(M.tackle);
const STRENGTH = dataManager.getMove(M.strength);
const EMBER = dataManager.getMove(M.ember);
const FLAME_WHEEL = dataManager.getMove(M.flameWheel);
const WATER_PULSE = dataManager.getMove(M.waterPulse);
const ROCK_SLIDE = dataManager.getMove(M.rockSlide);
const DOUBLE_EDGE = dataManager.getMove(M.doubleEdge);
const STRUGGLE = dataManager.getMove(M.struggle);
const TECHNICIAN_FAIL_POWER = 61;

function createActivePokemon(opts: {
  level?: number;
  attack?: number;
  defense?: number;
  spAttack?: number;
  spDefense?: number;
  hp?: number;
  currentHp?: number;
  types?: PokemonType[];
  ability?: string;
  heldItem?: string | null;
  status?: PrimaryStatus | null;
  speciesId?: number;
  gender?: (typeof G)[keyof typeof G];
}): ActivePokemon {
  const level = opts.level ?? 50;
  const maxHp = opts.hp ?? 200;
  const stats: StatBlock = {
    hp: maxHp,
    attack: opts.attack ?? 100,
    defense: opts.defense ?? 100,
    spAttack: opts.spAttack ?? 100,
    spDefense: opts.spDefense ?? 100,
    speed: 100,
  };

  const pokemon = {
    uid: "test",
    speciesId: opts.speciesId ?? S.bulbasaur,
    nickname: null,
    level,
    experience: 0,
    nature: N.hardy,
    ivs: { hp: 0, attack: 0, defense: 0, spAttack: 0, spDefense: 0, speed: 0 },
    evs: { hp: 0, attack: 0, defense: 0, spAttack: 0, spDefense: 0, speed: 0 },
    currentHp: opts.currentHp ?? maxHp,
    moves: [createMoveSlot(TACKLE.id, TACKLE.pp)],
    ability: opts.ability ?? NONE,
    abilitySlot: AS.normal1,
    heldItem: opts.heldItem ?? null,
    status: opts.status ?? null,
    friendship: 0,
    gender: opts.gender ?? G.male,
    isShiny: false,
    metLocation: "",
    metLevel: 1,
    originalTrainer: "",
    originalTrainerId: 0,
    pokeball: I.pokeBall,
    calculatedStats: stats,
  } as PokemonInstance;

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
    volatileStatuses: new Map(),
    types: opts.types ?? [T.normal],
    ability: opts.ability ?? NONE,
    lastMoveUsed: null,
    lastDamageTaken: 0,
    lastDamageType: null,
    lastDamageCategory: null,
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
    forcedMove: null,
  } as ActivePokemon;
}

function createSyntheticMoveFromData(id: string, overrides: Partial<MoveData>): MoveData {
  const base = dataManager.getMove(id);
  return {
    ...base,
    ...overrides,
  } as MoveData;
}

function createDamageContext(opts: {
  attacker: ActivePokemon;
  defender: ActivePokemon;
  move: MoveData;
  isCrit?: boolean;
  rng?: ReturnType<typeof createMockRng>;
}): DamageContext {
  return {
    attacker: opts.attacker,
    defender: opts.defender,
    move: opts.move,
    isCrit: opts.isCrit ?? false,
    rng: opts.rng ?? createMockRng(100),
    state: { weather: null, sides: [], ended: false } as unknown as DamageContext["state"],
  } as DamageContext;
}

function createItemContext(opts: {
  heldItem?: string | null;
  ability?: string;
  types?: PokemonType[];
  currentHp?: number;
  maxHp?: number;
  damage?: number;
  status?: PrimaryStatus | null;
  hasConfusion?: boolean;
}): ItemContext {
  const volatileStatuses = new Map<string, unknown>();
  if (opts.hasConfusion) volatileStatuses.set(V.confusion, true);

  const maxHp = opts.maxHp ?? 160;
  return {
    pokemon: {
      pokemon: {
        uid: "test",
        speciesId: S.bulbasaur,
        nickname: null,
        level: 50,
        experience: 0,
        nature: N.hardy,
        ivs: { hp: 31, attack: 31, defense: 31, spAttack: 31, spDefense: 31, speed: 31 },
        evs: { hp: 0, attack: 0, defense: 0, spAttack: 0, spDefense: 0, speed: 0 },
        currentHp: opts.currentHp ?? maxHp,
        moves: [createMoveSlot(TACKLE.id, TACKLE.pp)],
        ability: opts.ability ?? NONE,
        abilitySlot: AS.normal1,
        heldItem: opts.heldItem ?? null,
        status: opts.status ?? null,
        friendship: 0,
        gender: G.male,
        isShiny: false,
        metLocation: "",
        metLevel: 1,
        originalTrainer: "",
        originalTrainerId: 0,
        pokeball: I.pokeBall,
        calculatedStats: {
          hp: maxHp,
          attack: 100,
          defense: 100,
          spAttack: 100,
          spDefense: 100,
          speed: 100,
        },
      } as PokemonInstance,
      types: opts.types ?? [T.normal],
      volatileStatuses,
      ability: opts.ability ?? NONE,
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
    },
    state: {
      weather: null,
      sides: [],
      ended: false,
    } as unknown as ItemContext["state"],
    rng: createMockRng(),
    damage: opts.damage,
  } as unknown as ItemContext;
}

// ===========================================================================
// Magic Guard + Life Orb
// ===========================================================================

describe("Magic Guard + Life Orb interaction", () => {
  it("given Magic Guard holder with Life Orb and damage > 0, when on-hit triggers, then no chip-damage is emitted (issue #549)", () => {
    // Source: Bulbapedia — Magic Guard: "prevents all indirect damage"
    // Source: Showdown Gen 4 — Magic Guard prevents Life Orb self-damage
    // The 1.3x damage boost is in calculateGen4Damage (not this item trigger),
    // so the holder still deals boosted damage — only the recoil is prevented.
    const ctx = createItemContext({
      heldItem: I.lifeOrb,
      ability: A.magicGuard,
      maxHp: 200,
      damage: 80,
    });
    const result = applyGen4HeldItem(TRIGGERS.onHit, ctx);

    // Magic Guard: no recoil
    expect(result).toEqual({ activated: false, effects: [], messages: [] });
  });

  it("given Magic Guard holder with Life Orb, when damage calc runs, then 1.3x boost IS still applied", () => {
    // Source: Showdown Gen 4 mod — Life Orb 1.3x boost is in calculateGen4Damage (Phase 2),
    // not gated by ability. Magic Guard only prevents the on-hit recoil chip.
    // Derivation: L50, power=80, Atk=100, Def=100, rng=100, no STAB (Water attacker, Normal move)
    //   baseDmg = floor(floor(22*80*100/100)/50)+2 = floor(1760/50)+2 = 35+2 = 37
    //   Life Orb Phase 2: floor(37*1.3) = 48
    //   rng=100: floor(48*100/100) = 48
    // Without Life Orb: 37
    const attacker = createActivePokemon({
      ability: A.magicGuard,
      heldItem: I.lifeOrb,
      attack: 100,
      types: [T.water], // use non-Normal type to avoid STAB complication
    });
    const defender = createActivePokemon({ defense: 100, types: [T.normal] });
    const move = STRENGTH;

    const withLOResult = calculateGen4Damage(
      createDamageContext({ attacker, defender, move, rng: createMockRng(100) }),
      GEN4_TYPE_CHART,
    );

    const noLOAttacker = createActivePokemon({
      ability: A.magicGuard,
      heldItem: null,
      attack: 100,
      types: [T.water],
    });
    const withoutLOResult = calculateGen4Damage(
      createDamageContext({ attacker: noLOAttacker, defender, move, rng: createMockRng(100) }),
      GEN4_TYPE_CHART,
    );

    // Derivation: L50, power=80, Atk=100, Def=100, rng=100, no STAB (Water vs Normal move)
    //   baseDmg = floor(floor(22*80*100/100)/50)+2 = 35+2 = 37; rng=37; neutral eff=1
    //   With Life Orb: floor(37*1.3) = 48
    //   Without Life Orb: 37
    expect(withLOResult.damage).toBe(48);
    expect(withoutLOResult.damage).toBe(37);
    expect(withLOResult.damage).toBeGreaterThan(withoutLOResult.damage);
  });

  it("given non-Magic-Guard holder with Life Orb and damage > 0, when on-hit triggers, then chip-damage IS emitted (200 maxHP → 20 recoil)", () => {
    // Source: Bulbapedia — Life Orb: "deals floor(maxHP/10) recoil per hit"
    // Derivation: floor(200 / 10) = 20
    const ctx = createItemContext({
      heldItem: I.lifeOrb,
      ability: A.swiftSwim, // non-Magic Guard ability
      maxHp: 200,
      damage: 80,
    });
    const result = applyGen4HeldItem(TRIGGERS.onHit, ctx);

    expect(result).toEqual({
      activated: true,
      effects: [{ type: "chip-damage", target: "self", value: 20 }],
      messages: ["Pokemon #1 is hurt by its Life Orb!"],
    });
  });
});

// ===========================================================================
// Unburden + item consumption
// ===========================================================================

describe("Unburden + item consumption", () => {
  it("given Unburden holder consuming Sitrus Berry via on-damage-taken trigger, when activated, then unburden volatile is set", () => {
    // Source: Bulbapedia — Unburden: "Doubles the Pokemon's Speed stat when its held item
    //   is used or lost."
    // Source: Showdown data/abilities.ts — Unburden onAfterUseItem
    // When any consume effect fires and the holder has Unburden, the volatile is set.
    const ctx = createItemContext({
      heldItem: I.sitrusBerry,
      ability: A.unburden,
      maxHp: 160,
      currentHp: 60, // below 50% threshold
      damage: 20, // damage that dropped HP
    });

    expect((ctx.pokemon.volatileStatuses as Map<string, unknown>).has(V.unburden)).toBe(false);
    const result = applyGen4HeldItem(TRIGGERS.onDamageTaken, ctx);

    expect(result.effects.some((e) => e.type === "consume")).toBe(true);
    // The Unburden volatile should now be set in the pokemon's volatileStatuses
    expect((ctx.pokemon.volatileStatuses as Map<string, unknown>).has(V.unburden)).toBe(true);
  });

  it("given Unburden holder consuming Salac Berry via on-damage-taken trigger, when activated, then unburden volatile is set", () => {
    // Triangulation: different berry type still triggers Unburden
    // Source: Showdown data/abilities.ts — Unburden fires on ANY item consumption
    // Salac Berry activates when hpAfterDamage <= floor(maxHp * 0.25)
    // maxHp=160, threshold=floor(160*0.25)=40; currentHp=35, damage=5 → hpAfterDamage=30 ≤ 40 → triggers
    const ctx = createItemContext({
      heldItem: I.salacBerry,
      ability: A.unburden,
      maxHp: 160,
      currentHp: 35, // above damage but will be at 30 after, which is ≤ 40 (25%)
      damage: 5,
    });

    const result = applyGen4HeldItem(TRIGGERS.onDamageTaken, ctx);

    expect(result.effects.some((e) => e.type === "consume")).toBe(true);
    expect((ctx.pokemon.volatileStatuses as Map<string, unknown>).has(V.unburden)).toBe(true);
  });

  it("given non-Unburden holder consuming a berry, when activated, then unburden volatile is NOT set", () => {
    // Control case: non-Unburden ability should not receive the volatile
    const ctx = createItemContext({
      heldItem: I.sitrusBerry,
      ability: A.swiftSwim,
      maxHp: 160,
      currentHp: 60,
      damage: 20,
    });

    applyGen4HeldItem(TRIGGERS.onDamageTaken, ctx);

    expect((ctx.pokemon.volatileStatuses as Map<string, unknown>).has(V.unburden)).toBe(false);
  });
});

// ===========================================================================
// Klutz + items
// ===========================================================================

describe("Klutz + items — all triggers suppressed", () => {
  it("given Klutz holder with Leftovers, when end-of-turn triggers, then item does NOT activate", () => {
    // Source: Bulbapedia — Klutz: "The Pokemon can't use any held items."
    // Source: Showdown data/abilities.ts — Klutz gates all item battle effects
    const ctx = createItemContext({ heldItem: I.leftovers, ability: A.klutz, maxHp: 160 });
    const result = applyGen4HeldItem(TRIGGERS.endOfTurn, ctx);

    expect(result).toEqual({ activated: false, effects: [], messages: [] });
  });

  it("given Klutz holder with Toxic Orb, when end-of-turn triggers, then item does NOT activate (Klutz blocks status orbs)", () => {
    // Source: Bulbapedia — Klutz prevents item use including Toxic Orb
    const ctx = createItemContext({ heldItem: I.toxicOrb, ability: A.klutz, status: null });
    const result = applyGen4HeldItem(TRIGGERS.endOfTurn, ctx);

    expect(result).toEqual({ activated: false, effects: [], messages: [] });
  });

  it("given Klutz holder with Life Orb, when damage calc runs, then 1.3x boost is NOT applied", () => {
    // Source: Bulbapedia — Klutz suppresses all item-based stat modifiers
    // Derivation: L50, power=80, Atk=100, Def=100, rng=100, no STAB (Water vs Normal move)
    //   baseDmg=35+2=37; no STAB, neutral eff → 37
    //   Life Orb normally: floor(37*1.3)=48; with Klutz: remains 37
    const attacker = createActivePokemon({
      ability: A.klutz,
      heldItem: I.lifeOrb,
      attack: 100,
      types: [T.water], // no STAB so we can verify the raw 37 easily
    });
    const noItemAttacker = createActivePokemon({
      ability: A.klutz,
      heldItem: null,
      attack: 100,
      types: [T.water],
    });
    const defender = createActivePokemon({ defense: 100, types: [T.normal] });
    const move = STRENGTH;

    const klutzonResult = calculateGen4Damage(
      createDamageContext({ attacker, defender, move, rng: createMockRng(100) }),
      GEN4_TYPE_CHART,
    );

    const noItemResult = calculateGen4Damage(
      createDamageContext({ attacker: noItemAttacker, defender, move, rng: createMockRng(100) }),
      GEN4_TYPE_CHART,
    );

    // Klutz: Life Orb boost NOT applied → same as no item
    expect(klutzonResult.damage).toBe(noItemResult.damage);
    expect(klutzonResult.damage).toBe(37);
  });

  it("given Klutz holder with Life Orb and damage > 0, when on-hit triggers, then NO recoil is emitted", () => {
    // Source: Bulbapedia — Klutz blocks all item effects including Life Orb recoil
    const ctx = createItemContext({
      heldItem: I.lifeOrb,
      ability: A.klutz,
      maxHp: 200,
      damage: 80,
    });
    const result = applyGen4HeldItem(TRIGGERS.onHit, ctx);

    expect(result).toEqual({ activated: false, effects: [], messages: [] });
  });

  it("given Klutz holder with Focus Sash at full HP, when on-damage-taken triggers with KO damage, then Focus Sash does NOT activate", () => {
    // Source: Bulbapedia — Klutz blocks Focus Sash (all item triggers suppressed)
    const ctx = createItemContext({
      heldItem: I.focusSash,
      ability: A.klutz,
      maxHp: 160,
      currentHp: 160,
      damage: 200,
    });
    const result = applyGen4HeldItem(TRIGGERS.onDamageTaken, ctx);

    expect(result).toEqual({ activated: false, effects: [], messages: [] });
  });
});

// ===========================================================================
// Technician — exact 60/61 BP boundary
// ===========================================================================

describe("Technician — exact base power boundary (60 vs 61 BP)", () => {
  it("given Technician attacker with exactly 60 BP move, when calculating damage, then power IS boosted by 1.5x (60 → 90)", () => {
    // Source: Bulbapedia — Technician: "Moves with a base power of 60 or less are boosted by 50%"
    // Source: Showdown data/abilities.ts — Technician onBasePower: if bp <= 60 return bp * 1.5
    // Derivation: L50, power=60, Atk=100, Def=100, rng=100, no STAB (Water vs Normal)
    //   No Tech: baseDmg = floor(floor(22*60*100/100)/50)+2 = floor(1320/50)+2 = 26+2 = 28
    //   With Tech (power=90): baseDmg = floor(floor(22*90*100/100)/50)+2 = floor(1980/50)+2 = 39+2 = 41
    const techAttacker = createActivePokemon({
      ability: A.technician,
      attack: 100,
      types: [T.water],
    });
    const noTechAttacker = createActivePokemon({ ability: NONE, attack: 100, types: [T.water] });
    const defender = createActivePokemon({ defense: 100, types: [T.normal] });
    const move60 = FLAME_WHEEL;

    const techResult = calculateGen4Damage(
      createDamageContext({
        attacker: techAttacker,
        defender,
        move: move60,
        rng: createMockRng(100),
      }),
      GEN4_TYPE_CHART,
    );
    const noTechResult = calculateGen4Damage(
      createDamageContext({
        attacker: noTechAttacker,
        defender,
        move: move60,
        rng: createMockRng(100),
      }),
      GEN4_TYPE_CHART,
    );

    // With Technician (power 60 → 90): 41
    // Without Technician (power 60):   28
    expect(techResult.damage).toBe(41);
    expect(noTechResult.damage).toBe(28);
    expect(techResult.damage).toBeGreaterThan(noTechResult.damage);
  });

  it("given Technician attacker with exactly 61 BP move, when calculating damage, then power is NOT boosted", () => {
    // Source: Bulbapedia — Technician only applies to moves with base power ≤ 60; 61 is excluded
    // Source: Showdown data/abilities.ts — Technician onBasePower: strict ≤ 60 check
    // Derivation: L50, power=61, Atk=100, Def=100, rng=100, no STAB (Water vs Normal)
    //   baseDmg = floor(floor(22*61*100/100)/50)+2 = floor(1342/50)+2 = 26+2 = 28
    const techAttacker = createActivePokemon({
      ability: A.technician,
      attack: 100,
      types: [T.water],
    });
    const noTechAttacker = createActivePokemon({ ability: NONE, attack: 100, types: [T.water] });
    const defender = createActivePokemon({ defense: 100, types: [T.normal] });
    const move61 = createSyntheticMoveFromData(M.aerialAce, {
      type: T.normal,
      power: TECHNICIAN_FAIL_POWER,
    });

    const techResult = calculateGen4Damage(
      createDamageContext({
        attacker: techAttacker,
        defender,
        move: move61,
        rng: createMockRng(100),
      }),
      GEN4_TYPE_CHART,
    );
    const noTechResult = calculateGen4Damage(
      createDamageContext({
        attacker: noTechAttacker,
        defender,
        move: move61,
        rng: createMockRng(100),
      }),
      GEN4_TYPE_CHART,
    );

    // 61 BP > 60: Technician does not apply → identical damage to no-Technician
    expect(techResult.damage).toBe(noTechResult.damage);
    expect(techResult.damage).toBe(28);
  });
});

// ===========================================================================
// Life Orb on-hit — zero-damage cases
// ===========================================================================

describe("Life Orb — no recoil when damage is 0 or absent", () => {
  it("given Life Orb holder with damage = 0 (miss/protect), when on-hit triggers, then no recoil is emitted", () => {
    // Source: Showdown Gen 4 mod — Life Orb chip only fires when damage > 0
    // On a miss, the engine never calls on-hit at all (damage > 0 gate in BattleEngine.ts).
    // But if it does fire with damage=0, the item handler must also guard.
    const ctx = createItemContext({
      heldItem: I.lifeOrb,
      ability: NONE,
      maxHp: 200,
      damage: 0,
    });
    const result = applyGen4HeldItem(TRIGGERS.onHit, ctx);

    expect(result).toEqual({ activated: false, effects: [], messages: [] });
  });

  it("given Life Orb holder with damage = 100 (normal hit) and 200 max HP, when on-hit triggers, then recoil = floor(200/10) = 20", () => {
    // Source: Bulbapedia — Life Orb: "The user loses 1/10 of its maximum HP after each attack."
    // Derivation: floor(200 / 10) = 20
    const ctx = createItemContext({
      heldItem: I.lifeOrb,
      ability: NONE,
      maxHp: 200,
      damage: 100,
    });
    const result = applyGen4HeldItem(TRIGGERS.onHit, ctx);

    expect(result).toEqual({
      activated: true,
      effects: [{ type: "chip-damage", target: "self", value: 20 }],
      messages: ["Pokemon #1 is hurt by its Life Orb!"],
    });
  });
});

// ===========================================================================
// Charti Berry — halves SE Rock damage
// ===========================================================================

describe("Charti Berry — halves super-effective Rock-type damage", () => {
  it("given Flying-type defender with Charti Berry vs Rock move (SE), when damage calculated, then damage is halved and berry consumed", () => {
    // Source: Bulbapedia — Charti Berry: "Weakens a supereffective Rock-type move against holder."
    // Source: Showdown sim/items.ts — type-resist berries onSourceModifyDamage halve SE damage
    // Derivation: L50, Rock 75BP, Atk=100, Def=100, rng=100
    //   baseDmg = floor(floor(22*75*100/100)/50)+2 = 33+2 = 35
    //   random=35, no STAB, Rock vs Flying = 2x: floor(35*2) = 70
    //   Charti Berry halves: floor(70*0.5) = 35
    const attacker = createActivePokemon({ attack: 100, types: [T.normal] });
    const defender = createActivePokemon({
      defense: 100,
      types: [T.flying],
      heldItem: I.chartiBerry,
    });
    const rockMove = ROCK_SLIDE;

    const withBerry = calculateGen4Damage(
      createDamageContext({ attacker, defender, move: rockMove, rng: createMockRng(100) }),
      GEN4_TYPE_CHART,
    );

    // Berry should be consumed after activation
    expect(defender.pokemon.heldItem).toBeNull();
    // Damage should be halved from the un-berried SE value
    expect(withBerry.damage).toBe(35);
    expect(withBerry.effectiveness).toBe(2);
  });

  it("given Flying-type defender WITHOUT Charti Berry vs Rock move (SE), when damage calculated, then full SE damage applied", () => {
    // Triangulation: without the berry, damage is the full 2x SE value
    // Derivation: 35 base damage × 2 effectiveness = 70
    const attacker = createActivePokemon({ attack: 100, types: [T.normal] });
    const defender = createActivePokemon({ defense: 100, types: [T.flying], heldItem: null });
    const rockMove = ROCK_SLIDE;

    const withoutBerry = calculateGen4Damage(
      createDamageContext({ attacker, defender, move: rockMove, rng: createMockRng(100) }),
      GEN4_TYPE_CHART,
    );

    // Source: 37 base damage × 2 effectiveness = 74
    expect(withoutBerry.damage).toBe(70);
    expect(withoutBerry.effectiveness).toBe(2);
  });

  it("given Ground-type defender with Charti Berry vs Normal move (neutral), when damage calculated, then berry does NOT activate (only SE)", () => {
    // Source: Bulbapedia — type-resist berries only activate against super-effective moves
    const attacker = createActivePokemon({ attack: 100, types: [T.normal] });
    const defender = createActivePokemon({
      defense: 100,
      types: [T.ground],
      heldItem: I.chartiBerry,
    });
    const normalMove = STRENGTH;

    calculateGen4Damage(
      createDamageContext({ attacker, defender, move: normalMove, rng: createMockRng(100) }),
      GEN4_TYPE_CHART,
    );

    // Berry NOT consumed when move is neutral
    expect(defender.pokemon.heldItem).toBe(I.chartiBerry);
  });
});

// ===========================================================================
// Skill Link — always 5 hits
// ===========================================================================

describe("Skill Link — rollMultiHitCount always returns 5", () => {
  it("given attacker with Skill Link, when rollMultiHitCount is called with any seed, then always returns 5", () => {
    // Source: Bulbapedia — Skill Link (Gen 4): "Always has moves that attack 2 to 5 times hit 5 times."
    // Source: Showdown Gen 4 — Skill Link ability returns 5 hits for multi-hit moves
    // Source: pret/pokeplatinum — Gen 4 multi-hit table: [2,2,2,3,3,3,4,5]; Skill Link bypasses it
    const ruleset = new Gen4Ruleset();
    const attacker = createActivePokemon({ ability: A.skillLink });

    // Try 10 different seeds — all should return 5
    for (let seed = 0; seed < 10; seed++) {
      const rng = new SeededRandom(seed);
      const hits = ruleset.rollMultiHitCount(attacker, rng);
      expect(hits).toBe(5);
    }
  });

  it("given attacker WITHOUT Skill Link, when rollMultiHitCount is called, then may return 2, 3, 4, or 5 (not locked to 5)", () => {
    // Triangulation: without Skill Link, the Gen 1-4 weighted table can return lower values
    // Source: pret/pokeplatinum — Gen 4 multi-hit uses 8-entry table: 2,2,2,3,3,3,4,5
    const ruleset = new Gen4Ruleset();
    const attacker = createActivePokemon({ ability: NONE });

    // Run many seeds and confirm we see values other than 5
    const results = new Set<number>();
    for (let seed = 0; seed < 100; seed++) {
      const rng = new SeededRandom(seed);
      results.add(ruleset.rollMultiHitCount(attacker, rng));
    }

    // Should see multiple different values (not all 5)
    expect(results.size).toBeGreaterThan(1);
    // All values must be in the valid range
    for (const v of results) {
      expect(v).toBeGreaterThanOrEqual(2);
      expect(v).toBeLessThanOrEqual(5);
    }
  });
});

// ===========================================================================
// Reckless — Struggle (effect: null) is NOT boosted
// ===========================================================================

describe("Reckless — Struggle is NOT boosted", () => {
  it("given Reckless attacker using Struggle (effect: null), when calculating damage, then no Reckless boost applied", () => {
    // Source: Bulbapedia — Reckless: "Powers up moves that have recoil damage."
    //   Struggle does not have a recoil MoveEffect — it has effect: null.
    // Source: Showdown data/abilities.ts — Reckless checks for recoil flag; Struggle has no effect
    // Derivation: L50, power=50, Atk=100, Def=100, rng=100, no STAB (Water vs Normal)
    //   baseDmg = floor(floor(22*50*100/100)/50)+2 = floor(1100/50)+2 = 22+2 = 24
    //   No boost (Struggle has effect:null) → 24
    const recklessAttacker = createActivePokemon({
      ability: A.reckless,
      attack: 100,
      types: [T.water],
    });
    const noAbilityAttacker = createActivePokemon({ ability: NONE, attack: 100, types: [T.water] });
    const defender = createActivePokemon({ defense: 100, types: [T.normal] });

    // Struggle: effect is null (no MoveEffect)
    const struggle = STRUGGLE;

    const recklessResult = calculateGen4Damage(
      createDamageContext({
        attacker: recklessAttacker,
        defender,
        move: struggle,
        rng: createMockRng(100),
      }),
      GEN4_TYPE_CHART,
    );
    const noAbilityResult = calculateGen4Damage(
      createDamageContext({
        attacker: noAbilityAttacker,
        defender,
        move: struggle,
        rng: createMockRng(100),
      }),
      GEN4_TYPE_CHART,
    );

    // Reckless does NOT boost Struggle — damage must be identical
    expect(recklessResult.damage).toBe(noAbilityResult.damage);
    expect(recklessResult.damage).toBe(24);
  });

  it("given Reckless attacker using Double-Edge (recoil effect), when calculating damage, then 1.2x boost IS applied", () => {
    // Source: Bulbapedia — Reckless: Double-Edge is a recoil move and IS boosted
    // Derivation: L50, power=120, Atk=100, Def=100, rng=100, no STAB (Water vs Normal)
    //   No Reckless: baseDmg = floor(floor(22*120*100/100)/50)+2 = floor(2640/50)+2 = 52+2 = 54
    //   Reckless: power=floor(120*1.2)=144; baseDmg = floor(floor(22*144*100/100)/50)+2 = floor(3168/50)+2 = 63+2 = 65
    const recklessAttacker = createActivePokemon({
      ability: A.reckless,
      attack: 100,
      types: [T.water],
    });
    const noAbilityAttacker = createActivePokemon({ ability: NONE, attack: 100, types: [T.water] });
    const defender = createActivePokemon({ defense: 100, types: [T.normal] });

    const doubleEdge = DOUBLE_EDGE;

    const recklessResult = calculateGen4Damage(
      createDamageContext({
        attacker: recklessAttacker,
        defender,
        move: doubleEdge,
        rng: createMockRng(100),
      }),
      GEN4_TYPE_CHART,
    );
    const noAbilityResult = calculateGen4Damage(
      createDamageContext({
        attacker: noAbilityAttacker,
        defender,
        move: doubleEdge,
        rng: createMockRng(100),
      }),
      GEN4_TYPE_CHART,
    );

    expect(recklessResult.damage).toBe(65);
    expect(noAbilityResult.damage).toBe(54);
    expect(recklessResult.damage).toBeGreaterThan(noAbilityResult.damage);
  });
});

// ===========================================================================
// Focus Sash — does NOT activate when not at full HP
// ===========================================================================

describe("Focus Sash — does not activate unless holder is at full HP", () => {
  it("given Focus Sash holder at 159/160 HP (not full), when KO damage is taken, then Focus Sash does NOT activate", () => {
    // Source: Bulbapedia — Focus Sash: "If the Pokemon holding this item would be knocked out
    //   by a move while at full HP, it will survive with 1 HP."
    // The key condition: holder must be at full HP (currentHp === maxHp).
    const ctx = createItemContext({
      heldItem: I.focusSash,
      maxHp: 160,
      currentHp: 159, // one below full
      damage: 200, // would KO
    });
    const result = applyGen4HeldItem(TRIGGERS.onDamageTaken, ctx);

    expect(result).toEqual({ activated: false, effects: [], messages: [] });
  });

  it("given Focus Sash holder at full HP (160/160), when KO damage is taken, then survives at 1 HP and berry consumed", () => {
    // Source: Bulbapedia — Focus Sash activates only when at full HP
    const ctx = createItemContext({
      heldItem: I.focusSash,
      maxHp: 160,
      currentHp: 160, // full HP
      damage: 200, // would KO
    });
    const result = applyGen4HeldItem(TRIGGERS.onDamageTaken, ctx);

    expect(result).toEqual({
      activated: true,
      effects: [
        { type: "survive", target: "self", value: 1 },
        { type: "consume", target: "self", value: I.focusSash },
      ],
      messages: ["Pokemon #1 held on with its Focus Sash!"],
    });
  });
});

// ===========================================================================
// Lum Berry — cures each of the 5 primary statuses
// ===========================================================================

describe("Lum Berry — cures all primary statuses individually", () => {
  const statuses = [ST.burn, ST.poison, ST.badlyPoisoned, ST.paralysis, ST.sleep, ST.freeze] as const;

  for (const status of statuses) {
    it(`given Lum Berry and status=${status}, when end-of-turn triggers, then status is cured and berry consumed`, () => {
      // Source: Showdown Gen 4 mod — Lum Berry cures any primary status condition
      // Source: Bulbapedia — Lum Berry: "Cures any major status condition"
      const ctx = createItemContext({ heldItem: I.lumBerry, status });
      const result = applyGen4HeldItem(TRIGGERS.endOfTurn, ctx);

      expect(result.effects.some((e) => e.type === "status-cure")).toBe(true);
      expect(result.effects.some((e) => e.type === "consume" && "value" in e && e.value === I.lumBerry)).toBe(true);
    });
  }
});

// ===========================================================================
// Type-resist Berry + Unburden
// ===========================================================================

describe("Type-resist Berry + Unburden interaction", () => {
  it("given Unburden holder with Charti Berry targeted by SE Rock move, when damage calculated, then Unburden volatile is activated", () => {
    // Source: Bulbapedia — Unburden activates on ANY item consumption, including resist berries
    // Source: Showdown Gen 4 — type-resist berries consumed in calculateGen4Damage (direct mutation)
    //   After berry is consumed, Unburden volatile is set on defender if they have Unburden
    const attacker = createActivePokemon({ attack: 100, types: [T.normal] });
    const defender = createActivePokemon({
      defense: 100,
      types: [T.flying],
      heldItem: I.chartiBerry,
      ability: A.unburden,
    });
    const rockMove = ROCK_SLIDE;

    expect(defender.volatileStatuses.has(V.unburden)).toBe(false);

    calculateGen4Damage(
      createDamageContext({ attacker, defender, move: rockMove, rng: createMockRng(100) }),
      GEN4_TYPE_CHART,
    );

    // Berry consumed → Unburden volatile should be set
    expect(defender.pokemon.heldItem).toBeNull();
    expect(defender.volatileStatuses.has(V.unburden)).toBe(true);
  });
});
