import type { ActivePokemon, BattleState, DamageContext } from "@pokemon-lib-ts/battle";
import type { MoveData, PokemonType, SeededRandom } from "@pokemon-lib-ts/core";
import { describe, expect, it } from "vitest";
import { calculateGen6Damage, TYPE_RESIST_BERRIES } from "../src/Gen6DamageCalc";
import { GEN6_TYPE_CHART } from "../src/Gen6TypeChart";

/**
 * Gen 6 Type Resist Berries -- damage calc integration tests.
 *
 * Same mechanics as Gen 5, plus Roseli Berry (Fairy).
 * Gen 6 crit multiplier is 1.5x (not 2.0x) and Facade bypasses burn, but
 * those don't affect berry mechanics.
 *
 * Source: Showdown data/items.ts -- type resist berries onSourceModifyDamage
 * Source: Bulbapedia -- "Roseli Berry" halves damage from Fairy-type moves
 *
 * Fixes: #622 -- type resist berries fired on-damage-taken (post-damage) and damage-boost
 *   effect was ignored by the engine. Now applied in the damage calc (pre-damage).
 */

// ---------------------------------------------------------------------------
// Helper factories (same pattern as damage-calc.test.ts)
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
  volatiles?: Map<string, { turnsLeft: number; data?: Record<string, unknown> }>;
}): ActivePokemon {
  const hp = overrides.hp ?? 200;
  const attack = overrides.attack ?? 100;
  const defense = overrides.defense ?? 100;
  const spAttack = overrides.spAttack ?? 100;
  const spDefense = overrides.spDefense ?? 100;
  const speed = overrides.speed ?? 100;
  return {
    pokemon: {
      uid: "test",
      speciesId: 1,
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
      gender: "male" as any,
      isShiny: false,
      metLocation: "",
      metLevel: 1,
      originalTrainer: "",
      originalTrainerId: 0,
      pokeball: "pokeball",
      calculatedStats: { hp, attack, defense, spAttack, spDefense, speed },
    },
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
    isDynamaxed: false,
    dynamaxTurnsLeft: 0,
    isTerastallized: false,
    teraType: null,
    stellarBoostedTypes: [],
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
    target: "adjacent-foe",
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
    generation: 6,
    critRatio: 0,
  } as MoveData;
}

function makeState(): BattleState {
  return {
    weather: null,
    terrain: null,
    trickRoom: { active: false, turnsLeft: 0 },
    magicRoom: { active: false, turnsLeft: 0 },
    wonderRoom: { active: false, turnsLeft: 0 },
    gravity: { active: false, turnsLeft: 0 },
    format: "singles",
    generation: 6,
    turnNumber: 1,
    sides: [{}, {}],
  } as unknown as BattleState;
}

/** Create a fixed-roll RNG that returns max for rng.int (100 = no damage reduction) */
function makeFixedRng(): SeededRandom {
  return {
    next: () => 0.5,
    int: (_min: number, max: number) => max,
    chance: () => false,
    pick: <T>(arr: readonly T[]) => arr[0] as T,
    shuffle: <T>(arr: readonly T[]) => [...arr],
    getState: () => 0,
    setState: () => {},
  } as unknown as SeededRandom;
}

function makeDamageContext(overrides: {
  attacker?: ActivePokemon;
  defender?: ActivePokemon;
  move?: MoveData;
  state?: BattleState;
  isCrit?: boolean;
}): DamageContext {
  return {
    attacker: overrides.attacker ?? makeActive({}),
    defender: overrides.defender ?? makeActive({}),
    move: overrides.move ?? makeMove({}),
    state: overrides.state ?? makeState(),
    rng: makeFixedRng(),
    isCrit: overrides.isCrit ?? false,
  };
}

const typeChart = GEN6_TYPE_CHART as Record<string, Record<string, number>>;

// ===========================================================================
// Type Resist Berry -- basic activation
// ===========================================================================

describe("Gen 6 type resist berries -- damage calc integration", () => {
  it("given Grass-type defender with Occa Berry vs super-effective Fire move, when damage calculated, then damage is halved via pokeRound", () => {
    // Source: Showdown data/items.ts -- Occa Berry onSourceModifyDamage halves SE Fire damage
    // Derivation: L50, Fire 80BP, Atk=100, Def=100, rng=max (0 reduction)
    //   baseDmg = floor(floor(22*80*100/100)/50)+2 = 37
    //   random factor with int return 0 => floor(37 * (100-0)/100) = 37
    //   no STAB, Fire vs Grass = 2x: 37*2 = 74
    //   Occa Berry: pokeRound(74, 2048) = floor((74*2048+2047)/4096) = 37
    const attacker = makeActive({ types: ["normal"], attack: 100 });
    const defender = makeActive({
      types: ["grass"],
      defense: 100,
      heldItem: "occa-berry",
    });
    const fireMove = makeMove({ type: "fire", power: 80, category: "physical" });

    const result = calculateGen6Damage(
      makeDamageContext({ attacker, defender, move: fireMove }),
      typeChart,
    );

    expect(result.damage).toBe(37);
    expect(result.effectiveness).toBe(2);
    // Berry should be consumed
    expect(defender.pokemon.heldItem).toBeNull();
  });

  it("given Grass-type defender WITHOUT Occa Berry vs super-effective Fire move, when damage calculated, then full 2x damage applies", () => {
    // Source: Showdown data/items.ts -- without resist berry, full SE damage
    // Derivation: baseDmg = 37, Fire vs Grass = 2x: 37*2 = 74
    const attacker = makeActive({ types: ["normal"], attack: 100 });
    const defender = makeActive({
      types: ["grass"],
      defense: 100,
    });
    const fireMove = makeMove({ type: "fire", power: 80, category: "physical" });

    const result = calculateGen6Damage(
      makeDamageContext({ attacker, defender, move: fireMove }),
      typeChart,
    );

    expect(result.damage).toBe(74);
    expect(result.effectiveness).toBe(2);
  });

  it("given Normal-type defender with Occa Berry vs neutral Fire move, when damage calculated, then Occa Berry does NOT activate (not SE)", () => {
    // Source: Showdown data/items.ts -- type resist berries only activate on SE damage
    const attacker = makeActive({ types: ["normal"], attack: 100 });
    const defender = makeActive({
      types: ["normal"],
      defense: 100,
      heldItem: "occa-berry",
    });
    const fireMove = makeMove({ type: "fire", power: 80, category: "physical" });

    const result = calculateGen6Damage(
      makeDamageContext({ attacker, defender, move: fireMove }),
      typeChart,
    );

    // Berry NOT consumed
    expect(defender.pokemon.heldItem).toBe("occa-berry");
    expect(result.damage).toBe(37);
  });
});

// ===========================================================================
// Roseli Berry (Fairy) -- Gen 6 exclusive
// ===========================================================================

describe("Gen 6 Roseli Berry -- halves Fairy-type SE damage", () => {
  it("given Dragon-type defender with Roseli Berry vs SE Fairy move, when damage calculated, then damage is halved", () => {
    // Source: Bulbapedia -- Roseli Berry: "Weakens a supereffective Fairy-type attack"
    // Attacker is Normal-type to avoid STAB on Fairy move
    // Derivation: L50, Fairy 80BP, SpA=100, SpDef=100, no STAB, Fairy vs Dragon = 2x
    //   baseDmg = 37, Fairy vs Dragon = 2x: 74
    //   Roseli Berry: pokeRound(74, 2048) = floor((74*2048+2047)/4096) = 37
    const attacker = makeActive({ types: ["normal"], spAttack: 100 });
    const defender = makeActive({
      types: ["dragon"],
      spDefense: 100,
      heldItem: "roseli-berry",
    });
    const fairyMove = makeMove({ type: "fairy", power: 80, category: "special" });

    const result = calculateGen6Damage(
      makeDamageContext({ attacker, defender, move: fairyMove }),
      typeChart,
    );

    expect(result.damage).toBe(37);
    expect(result.effectiveness).toBe(2);
    expect(defender.pokemon.heldItem).toBeNull();
  });

  it("given Fire-type defender with Roseli Berry vs NVE Fairy move, when damage calculated, then Roseli Berry does NOT activate (not SE)", () => {
    // Source: Showdown data/items.ts -- resist berries only activate when SE
    // Fairy vs Fire = 0.5x (NVE), so berry should not activate
    // Attacker is Normal-type to avoid STAB on Fairy move
    const attacker = makeActive({ types: ["normal"], spAttack: 100 });
    const defender = makeActive({
      types: ["fire"],
      spDefense: 100,
      heldItem: "roseli-berry",
    });
    const fairyMove = makeMove({ type: "fairy", power: 80, category: "special" });

    const result = calculateGen6Damage(
      makeDamageContext({ attacker, defender, move: fairyMove }),
      typeChart,
    );

    expect(defender.pokemon.heldItem).toBe("roseli-berry");
    // Fairy vs Fire = 0.5x (NVE)
    expect(result.effectiveness).toBe(0.5);
  });
});

// ===========================================================================
// Magic Room suppresses resist berries (Gen 6)
// ===========================================================================

describe("Gen 6 type resist berries -- Magic Room suppression", () => {
  it("given Dragon-type defender with Roseli Berry vs SE Fairy move under Magic Room, when damage calculated, then berry does NOT activate and full SE damage applies", () => {
    // Source: Showdown data/moves.ts -- Magic Room: "For 5 turns, held items have no effect"
    // Source: Bulbapedia -- Magic Room: "Nullifies the effect of each Pokémon's held item"
    // Without Magic Room the same setup gives 37 (halved). Under Magic Room: full 74.
    // Attacker is Normal-type to avoid STAB on Fairy move.
    const attacker = makeActive({ types: ["normal"], spAttack: 100 });
    const defender = makeActive({
      types: ["dragon"],
      spDefense: 100,
      heldItem: "roseli-berry",
    });
    const fairyMove = makeMove({ type: "fairy", power: 80, category: "special" });
    const magicRoomState = {
      ...makeState(),
      magicRoom: { active: true, turnsLeft: 3 },
    } as unknown as BattleState;

    const result = calculateGen6Damage(
      makeDamageContext({ attacker, defender, move: fairyMove, state: magicRoomState }),
      typeChart,
    );

    // Berry NOT consumed — Magic Room suppresses it
    expect(defender.pokemon.heldItem).toBe("roseli-berry");
    // Full SE damage: Fairy vs Dragon = 2x: 74
    expect(result.damage).toBe(74);
  });

  it("given Dragon-type defender with Roseli Berry vs SE Fairy move when Magic Room is inactive, when damage calculated, then berry activates normally", () => {
    // Source: Showdown data/moves.ts -- Magic Room only suppresses when active
    // Without Magic Room the berry should halve SE damage as expected.
    // Attacker is Normal-type to avoid STAB on Fairy move.
    const attacker = makeActive({ types: ["normal"], spAttack: 100 });
    const defender = makeActive({
      types: ["dragon"],
      spDefense: 100,
      heldItem: "roseli-berry",
    });
    const fairyMove = makeMove({ type: "fairy", power: 80, category: "special" });

    const result = calculateGen6Damage(
      makeDamageContext({ attacker, defender, move: fairyMove }),
      typeChart,
    );

    // Berry consumed — Magic Room not active
    expect(defender.pokemon.heldItem).toBeNull();
    // Halved SE damage: Fairy vs Dragon = 2x: 74 -> pokeRound(74, 2048) = 37
    expect(result.damage).toBe(37);
  });
});

// ===========================================================================
// Table completeness
// ===========================================================================

describe("Gen 6 TYPE_RESIST_BERRIES table", () => {
  it("given the table, then it has 18 entries (17 from Gen 5 + Roseli Berry for Fairy)", () => {
    // Source: Bulbapedia -- 18 type-resist berries in Gen 6 (added Roseli for Fairy)
    expect(Object.keys(TYPE_RESIST_BERRIES).length).toBe(18);
  });

  it("given the table, then Roseli Berry maps to fairy type", () => {
    // Source: Bulbapedia -- Roseli Berry: "halves damage from Fairy-type moves"
    expect(TYPE_RESIST_BERRIES["roseli-berry"]).toBe("fairy");
  });
});

// ===========================================================================
// Klutz suppression (Gen 6)
// ===========================================================================

describe("Gen 6 type resist berries -- Klutz suppression", () => {
  it("given defender with Klutz + Roseli Berry vs SE Fairy move, when damage calculated, then Klutz suppresses berry", () => {
    // Source: Showdown data/abilities.ts -- Klutz prevents item usage
    // Attacker is Normal-type to avoid STAB on Fairy move
    const attacker = makeActive({ types: ["normal"], spAttack: 100 });
    const defender = makeActive({
      types: ["dragon"],
      spDefense: 100,
      heldItem: "roseli-berry",
      ability: "klutz",
    });
    const fairyMove = makeMove({ type: "fairy", power: 80, category: "special" });

    const result = calculateGen6Damage(
      makeDamageContext({ attacker, defender, move: fairyMove }),
      typeChart,
    );

    // Full SE damage (no STAB, Fairy vs Dragon = 2x: 37*2 = 74), berry NOT consumed
    expect(result.damage).toBe(74);
    expect(defender.pokemon.heldItem).toBe("roseli-berry");
  });
});
