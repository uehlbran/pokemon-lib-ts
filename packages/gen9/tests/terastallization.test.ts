import type { ActivePokemon, BattleSide, BattleState } from "@pokemon-lib-ts/battle";
import { createActivePokemon, createTestPokemon } from "@pokemon-lib-ts/battle";
import type { MoveData, PokemonType } from "@pokemon-lib-ts/core";
import { describe, expect, it } from "vitest";
import { calculateTeraStab, Gen9Terastallization } from "../src/Gen9Terastallization";

// ---------------------------------------------------------------------------
// Helper factories
// ---------------------------------------------------------------------------

function makeMove(overrides?: {
  id?: string;
  type?: PokemonType;
  category?: "physical" | "special" | "status";
  power?: number | null;
}): MoveData {
  return {
    id: overrides?.id ?? "tackle",
    displayName: overrides?.id ?? "Tackle",
    type: overrides?.type ?? "normal",
    category: overrides?.category ?? "physical",
    power: overrides?.power ?? 50,
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
    },
    effect: null,
    description: "",
    generation: 9,
    critRatio: 0,
  } as MoveData;
}

/**
 * Create an ActivePokemon for testing.
 * Allows specifying Tera-relevant fields directly.
 */
function makeActive(overrides: {
  types?: PokemonType[];
  ability?: string;
  teraType?: PokemonType;
  isTerastallized?: boolean;
  activeTeraType?: PokemonType | null;
  stellarBoostedTypes?: PokemonType[];
  calculatedStats?: {
    hp: number;
    attack: number;
    defense: number;
    spAttack: number;
    spDefense: number;
    speed: number;
  };
}): ActivePokemon {
  return {
    pokemon: {
      uid: "test-pokemon",
      speciesId: 6, // Charizard by default
      nickname: null,
      level: 50,
      experience: 0,
      nature: "hardy",
      ivs: { hp: 31, attack: 31, defense: 31, spAttack: 31, spDefense: 31, speed: 31 },
      evs: { hp: 0, attack: 0, defense: 0, spAttack: 0, spDefense: 0, speed: 0 },
      currentHp: 200,
      moves: [{ moveId: "tackle", currentPP: 35, maxPP: 35, ppUps: 0 }],
      ability: overrides.ability ?? "blaze",
      abilitySlot: "normal1" as const,
      heldItem: null,
      status: null,
      friendship: 70,
      gender: "male" as any,
      isShiny: false,
      metLocation: "test",
      metLevel: 50,
      originalTrainer: "Test",
      originalTrainerId: 0,
      pokeball: "poke-ball",
      teraType: overrides.teraType,
      calculatedStats: overrides.calculatedStats ?? {
        hp: 200,
        attack: 100,
        defense: 100,
        spAttack: 100,
        spDefense: 100,
        speed: 100,
      },
    },
    teamSlot: 0,
    statStages: {
      hp: 0,
      attack: 0,
      defense: 0,
      spAttack: 0,
      spDefense: 0,
      speed: 0,
      accuracy: 0,
      evasion: 0,
    },
    volatileStatuses: new Map(),
    types: overrides.types ?? ["fire", "flying"],
    ability: overrides.ability ?? "blaze",
    suppressedAbility: null,
    itemKnockedOff: false,
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
    isTerastallized: overrides.isTerastallized ?? false,
    teraType: overrides.activeTeraType ?? null,
    stellarBoostedTypes: overrides.stellarBoostedTypes ?? [],
    forcedMove: null,
  } as ActivePokemon;
}

function makeSide(index: 0 | 1 = 0): BattleSide {
  return {
    index,
    gimmickUsed: false,
    trainer: { id: "test", displayName: "Test", trainerClass: "Trainer" },
    team: [],
    active: [],
    screens: [],
    hazards: [],
    tailwind: { active: false, turnsLeft: 0 },
    luckyChant: { active: false, turnsLeft: 0 },
    wish: null,
    futureAttack: null,
    faintCount: 0,
  } as unknown as BattleSide;
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
    generation: 9,
    turnNumber: 1,
    sides: [{}, {}],
  } as unknown as BattleState;
}

// ═══════════════════════════════════════════════════════════════════════════
// Gen9Terastallization — canUse()
// ═══════════════════════════════════════════════════════════════════════════

describe("Gen9Terastallization canUse()", () => {
  const tera = new Gen9Terastallization();

  it("given a fresh battle with no gimmick used, when canUse is called with a Pokemon that has a teraType, then returns true", () => {
    // Source: Showdown sim/battle.ts -- Tera is available when side hasn't used gimmick
    const pokemon = makeActive({ teraType: "fire", types: ["fire", "flying"] });
    const side = makeSide();
    const state = makeState();
    expect(tera.canUse(pokemon, side, state)).toBe(true);
  });

  it("given a battle where gimmickUsed is true, when canUse is called, then returns false", () => {
    // Source: Showdown sim/battle.ts -- one gimmick per side per battle
    const pokemon = makeActive({ teraType: "fire", types: ["fire", "flying"] });
    const side = makeSide();
    side.gimmickUsed = true;
    const state = makeState();
    expect(tera.canUse(pokemon, side, state)).toBe(false);
  });

  it("given a Pokemon without a teraType, when canUse is called, then returns false", () => {
    // Source: Showdown sim/battle.ts -- Pokemon must have a Tera Type assigned
    const pokemon = makeActive({ types: ["fire", "flying"] }); // no teraType
    const side = makeSide();
    const state = makeState();
    expect(tera.canUse(pokemon, side, state)).toBe(false);
  });

  it("given a Pokemon already terastallized, when canUse is called, then returns false", () => {
    // Source: Showdown sim/battle.ts -- can't Tera if already Tera'd
    const pokemon = makeActive({
      teraType: "fire",
      types: ["fire"],
      isTerastallized: true,
      activeTeraType: "fire",
    });
    const side = makeSide();
    const state = makeState();
    expect(tera.canUse(pokemon, side, state)).toBe(false);
  });

  it("given a Water-type Pokemon with Electric teraType, when canUse is called, then returns true", () => {
    // Source: Showdown sim/battle.ts -- Tera Type can differ from original types
    const pokemon = makeActive({ teraType: "electric", types: ["water"] });
    const side = makeSide();
    const state = makeState();
    expect(tera.canUse(pokemon, side, state)).toBe(true);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// Gen9Terastallization — activate()
// ═══════════════════════════════════════════════════════════════════════════

describe("Gen9Terastallization activate()", () => {
  const tera = new Gen9Terastallization();

  it("given a Water/Flying Gyarados with Water teraType, when activate is called, then sets correct state and emits event", () => {
    // Source: Bulbapedia "Terastallization" -- type changes to Tera Type
    // Source: Showdown sim/battle.ts -- terastallize activation sets isTerastallized, teraType, types
    const pokemon = makeActive({ teraType: "water", types: ["water", "flying"] });
    pokemon.pokemon.uid = "gyarados-1";
    const side = makeSide();
    const state = makeState();

    const events = tera.activate(pokemon, side, state);

    // State mutations
    expect(pokemon.isTerastallized).toBe(true);
    expect(pokemon.teraType).toBe("water");
    expect(pokemon.types).toEqual(["water"]); // Single type defensively
    expect(side.gimmickUsed).toBe(true);

    // Event
    expect(events).toHaveLength(1);
    expect(events[0]).toEqual({
      type: "terastallize",
      side: 0,
      pokemon: "gyarados-1",
      teraType: "water",
    });
  });

  it("given a Fire/Flying Charizard with Grass teraType, when activate is called, then types become [grass]", () => {
    // Source: Showdown sim/pokemon.ts -- defensive typing becomes the single Tera type
    const pokemon = makeActive({ teraType: "grass", types: ["fire", "flying"] });
    const side = makeSide();
    const state = makeState();

    tera.activate(pokemon, side, state);

    expect(pokemon.isTerastallized).toBe(true);
    expect(pokemon.teraType).toBe("grass");
    expect(pokemon.types).toEqual(["grass"]);
  });

  it("given a Pokemon with Stellar teraType, when activate is called, then types are unchanged (retains original defensive types)", () => {
    // Source: Showdown sim/pokemon.ts -- Stellar Tera retains original defensive types
    // Source: specs/battle/10-gen9.md -- "Stellar retains original types defensively"
    const pokemon = makeActive({
      teraType: "stellar" as PokemonType,
      types: ["fire", "flying"],
    });
    const side = makeSide();
    const state = makeState();

    tera.activate(pokemon, side, state);

    expect(pokemon.isTerastallized).toBe(true);
    expect(pokemon.teraType).toBe("stellar");
    expect(pokemon.types).toEqual(["fire", "flying"]); // Unchanged
  });

  it("given activate is called, then persistence fields are set on PokemonInstance for switch survival", () => {
    // Source: Gen 9 game mechanic -- Tera persists through switches
    const pokemon = makeActive({ teraType: "water", types: ["water", "flying"] });
    const side = makeSide();
    const state = makeState();

    tera.activate(pokemon, side, state);

    expect(pokemon.pokemon.terastallized).toBe(true);
    expect(pokemon.pokemon.teraTypes).toEqual(["water"]); // Persisted defensive types
  });

  it("given activate is called on side 1, when emitting event, then event has correct side index", () => {
    // Source: BattleEvent spec -- side field identifies which side activated the gimmick
    const pokemon = makeActive({ teraType: "electric", types: ["electric"] });
    const side = makeSide(1);
    const state = makeState();

    const events = tera.activate(pokemon, side, state);

    expect(events[0]).toMatchObject({ side: 1 });
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// Gen9Terastallization — modifyMove() (Tera Blast)
// ═══════════════════════════════════════════════════════════════════════════

describe("Gen9Terastallization modifyMove()", () => {
  const tera = new Gen9Terastallization();

  it("given a non-terastallized Pokemon using Tera Blast, when modifyMove is called, then move is unchanged", () => {
    // Source: Showdown data/moves.ts:19919-19955 -- Tera Blast is Normal/Special when not Tera'd
    const pokemon = makeActive({ types: ["fire", "flying"] });
    const move = makeMove({ id: "tera-blast", type: "normal", category: "special", power: 80 });

    const result = tera.modifyMove(move, pokemon);

    expect(result.type).toBe("normal");
    expect(result.category).toBe("special");
    expect(result.power).toBe(80);
  });

  it("given a non-Tera Blast move, when modifyMove is called, then move is unchanged regardless of Tera state", () => {
    // Source: Showdown data/moves.ts -- only Tera Blast is modified by the gimmick
    const pokemon = makeActive({
      teraType: "fire",
      types: ["fire"],
      isTerastallized: true,
      activeTeraType: "fire",
    });
    const move = makeMove({ id: "flamethrower", type: "fire", category: "special", power: 90 });

    const result = tera.modifyMove(move, pokemon);

    expect(result).toBe(move); // Same reference, unchanged
  });

  it("given a Fire-Tera Pokemon with Atk > SpA using Tera Blast, when modifyMove is called, then type is fire and category is physical", () => {
    // Source: Showdown data/moves.ts:19930-19940 -- physical if Atk > SpA
    const pokemon = makeActive({
      teraType: "fire",
      types: ["fire"],
      isTerastallized: true,
      activeTeraType: "fire",
      calculatedStats: {
        hp: 200,
        attack: 120,
        defense: 100,
        spAttack: 80,
        spDefense: 100,
        speed: 100,
      },
    });
    const move = makeMove({ id: "tera-blast", type: "normal", category: "special", power: 80 });

    const result = tera.modifyMove(move, pokemon);

    expect(result.type).toBe("fire");
    expect(result.category).toBe("physical");
  });

  it("given a Water-Tera Pokemon with SpA > Atk using Tera Blast, when modifyMove is called, then type is water and category is special", () => {
    // Source: Showdown data/moves.ts:19930-19940 -- special if SpA >= Atk
    const pokemon = makeActive({
      teraType: "water",
      types: ["water"],
      isTerastallized: true,
      activeTeraType: "water",
      calculatedStats: {
        hp: 200,
        attack: 80,
        defense: 100,
        spAttack: 120,
        spDefense: 100,
        speed: 100,
      },
    });
    const move = makeMove({ id: "tera-blast", type: "normal", category: "special", power: 80 });

    const result = tera.modifyMove(move, pokemon);

    expect(result.type).toBe("water");
    expect(result.category).toBe("special");
  });

  it("given a Stellar-Tera Pokemon using Tera Blast, when modifyMove is called, then base power is 100", () => {
    // Source: Showdown data/moves.ts:19919-19955 -- Stellar Tera Blast has 100 BP
    const pokemon = makeActive({
      teraType: "stellar" as PokemonType,
      types: ["fire", "flying"],
      isTerastallized: true,
      activeTeraType: "stellar" as PokemonType,
    });
    const move = makeMove({ id: "tera-blast", type: "normal", category: "special", power: 80 });

    const result = tera.modifyMove(move, pokemon);

    expect(result.power).toBe(100);
  });

  it("given a Tera'd Pokemon with equal Atk and SpA using Tera Blast, when modifyMove is called, then category remains special", () => {
    // Source: Showdown data/moves.ts -- physical only if atk > spa (strict greater than)
    const pokemon = makeActive({
      teraType: "ice",
      types: ["ice"],
      isTerastallized: true,
      activeTeraType: "ice",
      calculatedStats: {
        hp: 200,
        attack: 100,
        defense: 100,
        spAttack: 100,
        spDefense: 100,
        speed: 100,
      },
    });
    const move = makeMove({ id: "tera-blast", type: "normal", category: "special", power: 80 });

    const result = tera.modifyMove(move, pokemon);

    expect(result.category).toBe("special");
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// Gen9Terastallization — Persistence through switches
// ═══════════════════════════════════════════════════════════════════════════

describe("Gen9Terastallization persistence through switches", () => {
  const tera = new Gen9Terastallization();

  it("given a Terastallized Water-Tera Gyarados, when switched out and back in via createActivePokemon, then isTerastallized and teraType are restored", () => {
    // Source: Gen 9 game mechanic -- Terastallization persists through switches
    // Source: Showdown sim/pokemon.ts -- forme/tera state restored on sendOut
    const pokemon = createTestPokemon(130, 50, {
      ability: "intimidate",
      teraType: "water",
    });

    // Simulate switch-in
    const active1 = createActivePokemon(pokemon, 0, ["water", "flying"]);
    expect(active1.isTerastallized).toBe(false);

    // Terastallize
    const side = makeSide();
    const state = makeState();
    tera.activate(active1, side, state);
    expect(active1.isTerastallized).toBe(true);
    expect(active1.teraType).toBe("water");
    expect(active1.types).toEqual(["water"]);

    // Simulate switch-out and switch back in
    const active2 = createActivePokemon(pokemon, 0, ["water", "flying"]);

    // Tera state should be restored
    expect(active2.isTerastallized).toBe(true);
    expect(active2.teraType).toBe("water");
    expect(active2.types).toEqual(["water"]); // Tera types restored, not original
  });

  it("given a Stellar-Tera Pokemon with consumed boosts, when switched out and back in, then stellarBoostedTypes are preserved", () => {
    // Source: Showdown sim/battle-actions.ts -- stellarBoostedTypes tracking
    const pokemon = createTestPokemon(6, 50, {
      ability: "blaze",
      teraType: "stellar" as PokemonType,
    });

    const active1 = createActivePokemon(pokemon, 0, ["fire", "flying"]);
    const side = makeSide();
    const state = makeState();
    tera.activate(active1, side, state);

    // Simulate using a Fire move (consumes the Fire stellar boost)
    calculateTeraStab(active1, "fire", ["fire", "flying"], false);
    expect(active1.stellarBoostedTypes).toContain("fire");

    // Switch out and back in
    const active2 = createActivePokemon(pokemon, 0, ["fire", "flying"]);

    // Stellar boost tracking should be preserved
    expect(active2.stellarBoostedTypes).toContain("fire");
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// calculateTeraStab — Standard STAB (non-Tera)
// ═══════════════════════════════════════════════════════════════════════════

describe("calculateTeraStab non-Tera (standard STAB)", () => {
  it("given a non-Tera Fire/Flying Pokemon using Flamethrower (Fire), when calculating STAB, then returns 1.5", () => {
    // Source: Showdown sim/battle-actions.ts:1756-1760 -- standard 1.5x STAB for type match
    const pokemon = makeActive({ types: ["fire", "flying"] });
    expect(calculateTeraStab(pokemon, "fire", ["fire", "flying"], false)).toBe(1.5);
  });

  it("given a non-Tera Fire/Flying Pokemon using Shadow Ball (Ghost), when calculating STAB, then returns 1.0", () => {
    // Source: Showdown sim/battle-actions.ts -- no STAB for non-matching type
    const pokemon = makeActive({ types: ["fire", "flying"] });
    expect(calculateTeraStab(pokemon, "ghost", ["fire", "flying"], false)).toBe(1.0);
  });

  it("given a non-Tera Pokemon with Adaptability using a STAB move, when calculating STAB, then returns 2.0", () => {
    // Source: Showdown data/abilities.ts:43-56 -- Adaptability: 1.5x -> 2.0x
    const pokemon = makeActive({ types: ["fire", "flying"], ability: "adaptability" });
    expect(calculateTeraStab(pokemon, "fire", ["fire", "flying"], true)).toBe(2.0);
  });

  it("given a non-Tera Pokemon with Adaptability using a non-STAB move, when calculating STAB, then returns 1.0", () => {
    // Source: Showdown data/abilities.ts -- Adaptability only modifies existing STAB
    const pokemon = makeActive({ types: ["fire", "flying"], ability: "adaptability" });
    expect(calculateTeraStab(pokemon, "ghost", ["fire", "flying"], true)).toBe(1.0);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// calculateTeraStab — Standard Tera (non-Stellar)
// ═══════════════════════════════════════════════════════════════════════════

describe("calculateTeraStab standard Tera", () => {
  it("given Charizard (Fire/Flying) with Fire Tera using Flamethrower (Fire), when calculating STAB, then returns 2.0 (Tera matches original + move)", () => {
    // Source: specs/battle/10-gen9.md STAB scenario matrix -- row 1
    // Source: Showdown sim/battle-actions.ts:1788-1791 -- Tera type matches original type AND move type
    const pokemon = makeActive({
      types: ["fire"], // After Tera, defensive type is just Fire
      isTerastallized: true,
      activeTeraType: "fire",
    });
    expect(calculateTeraStab(pokemon, "fire", ["fire", "flying"], false)).toBe(2.0);
  });

  it("given Charizard (Fire/Flying) with Fire Tera using Air Slash (Flying), when calculating STAB, then returns 1.5 (original type match only)", () => {
    // Source: specs/battle/10-gen9.md STAB scenario matrix -- row 2
    // Source: Showdown sim/battle-actions.ts -- Flying is in getTypes(false, true) but not hasType()
    const pokemon = makeActive({
      types: ["fire"],
      isTerastallized: true,
      activeTeraType: "fire",
    });
    expect(calculateTeraStab(pokemon, "flying", ["fire", "flying"], false)).toBe(1.5);
  });

  it("given Charizard (Fire/Flying) with Grass Tera using Flamethrower (Fire), when calculating STAB, then returns 1.5 (original type only, not Tera)", () => {
    // Source: specs/battle/10-gen9.md STAB scenario matrix -- row 3
    // Source: Showdown sim/battle-actions.ts -- Fire is original but not Tera type
    const pokemon = makeActive({
      types: ["grass"],
      isTerastallized: true,
      activeTeraType: "grass",
    });
    expect(calculateTeraStab(pokemon, "fire", ["fire", "flying"], false)).toBe(1.5);
  });

  it("given Charizard (Fire/Flying) with Grass Tera using Energy Ball (Grass), when calculating STAB, then returns 1.5 (Tera type match only, not original)", () => {
    // Source: specs/battle/10-gen9.md STAB scenario matrix -- row 4
    // Source: Showdown sim/battle-actions.ts -- Grass is hasType() but not in getTypes(false,true)
    const pokemon = makeActive({
      types: ["grass"],
      isTerastallized: true,
      activeTeraType: "grass",
    });
    expect(calculateTeraStab(pokemon, "grass", ["fire", "flying"], false)).toBe(1.5);
  });

  it("given Gyarados (Water/Flying) with Water Tera using Waterfall (Water), when calculating STAB, then returns 2.0", () => {
    // Source: specs/battle/10-gen9.md STAB scenario matrix -- row 5
    // Source: Showdown sim/battle-actions.ts -- Water is Tera AND original
    const pokemon = makeActive({
      types: ["water"],
      isTerastallized: true,
      activeTeraType: "water",
    });
    expect(calculateTeraStab(pokemon, "water", ["water", "flying"], false)).toBe(2.0);
  });

  it("given Alakazam (Psychic) with Electric Tera using Shadow Ball (Ghost), when calculating STAB, then returns 1.0 (no STAB)", () => {
    // Source: specs/battle/10-gen9.md STAB scenario matrix -- row 8
    // Source: Showdown sim/battle-actions.ts -- Ghost not in original or Tera
    const pokemon = makeActive({
      types: ["electric"],
      isTerastallized: true,
      activeTeraType: "electric",
    });
    expect(calculateTeraStab(pokemon, "ghost", ["psychic"], false)).toBe(1.0);
  });

  it("given Alakazam (Psychic) with Electric Tera using Psychic (Psychic), when calculating STAB, then returns 1.5", () => {
    // Source: specs/battle/10-gen9.md STAB scenario matrix -- row 9
    // Source: Showdown sim/battle-actions.ts -- Psychic is original but not Tera
    const pokemon = makeActive({
      types: ["electric"],
      isTerastallized: true,
      activeTeraType: "electric",
    });
    expect(calculateTeraStab(pokemon, "psychic", ["psychic"], false)).toBe(1.5);
  });

  it("given Alakazam (Psychic) with Electric Tera using Thunderbolt (Electric), when calculating STAB, then returns 1.5", () => {
    // Source: specs/battle/10-gen9.md STAB scenario matrix -- row 10
    // Source: Showdown sim/battle-actions.ts -- Electric is Tera but not original
    const pokemon = makeActive({
      types: ["electric"],
      isTerastallized: true,
      activeTeraType: "electric",
    });
    expect(calculateTeraStab(pokemon, "electric", ["psychic"], false)).toBe(1.5);
  });

  it("given Gyarados (Water/Flying) with Dark Tera using Crunch (Dark), when calculating STAB, then returns 1.5", () => {
    // Source: specs/battle/10-gen9.md STAB scenario matrix -- row 7
    // Source: Showdown sim/battle-actions.ts -- Dark is Tera type only, not original
    const pokemon = makeActive({
      types: ["dark"],
      isTerastallized: true,
      activeTeraType: "dark",
    });
    expect(calculateTeraStab(pokemon, "dark", ["water", "flying"], false)).toBe(1.5);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// calculateTeraStab — Adaptability interaction
// ═══════════════════════════════════════════════════════════════════════════

describe("calculateTeraStab Adaptability interaction", () => {
  it("given a Pokemon with Adaptability and Fire Tera (Fire is original type) using Fire move, when calculating STAB, then returns 2.25", () => {
    // Source: Showdown data/abilities.ts:43-56 -- if stab===2 return 2.25
    // Fire Tera + Fire original + Fire move = 2.0x base, Adaptability boosts to 2.25x
    const pokemon = makeActive({
      types: ["fire"],
      ability: "adaptability",
      isTerastallized: true,
      activeTeraType: "fire",
    });
    expect(calculateTeraStab(pokemon, "fire", ["fire", "flying"], true)).toBe(2.25);
  });

  it("given a Pokemon with Adaptability and Grass Tera using Grass move (Grass = Tera only, not original), when calculating STAB, then returns 2.0", () => {
    // Source: Showdown data/abilities.ts:47 -- onModifySTAB triggers when source.hasType(move.type)
    // Grass is the current Tera type (hasType = true), base STAB = 1.5x, Adaptability -> 2.0x
    const pokemon = makeActive({
      types: ["grass"],
      ability: "adaptability",
      isTerastallized: true,
      activeTeraType: "grass",
    });
    expect(calculateTeraStab(pokemon, "grass", ["fire", "flying"], true)).toBe(2.0);
  });

  it("given Charizard (Fire/Flying) with Adaptability and Grass Tera using Flamethrower (Fire = original type, not Tera), when calculating STAB, then returns 1.5 (Adaptability does NOT apply)", () => {
    // Source: Showdown data/abilities.ts:47 -- onModifySTAB only triggers when source.hasType(move.type)
    // Fire is original type only, hasType(fire) = false when Tera'd to Grass
    // So Adaptability does NOT boost this STAB
    const pokemon = makeActive({
      types: ["grass"],
      ability: "adaptability",
      isTerastallized: true,
      activeTeraType: "grass",
    });
    expect(calculateTeraStab(pokemon, "fire", ["fire", "flying"], true)).toBe(1.5);
  });

  it("given a Pokemon with Adaptability using a non-STAB move when Tera'd, when calculating STAB, then returns 1.0", () => {
    // Source: Showdown data/abilities.ts -- Adaptability only modifies existing STAB
    const pokemon = makeActive({
      types: ["grass"],
      ability: "adaptability",
      isTerastallized: true,
      activeTeraType: "grass",
    });
    expect(calculateTeraStab(pokemon, "ghost", ["fire", "flying"], true)).toBe(1.0);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// calculateTeraStab — Stellar Tera Type
// ═══════════════════════════════════════════════════════════════════════════

describe("calculateTeraStab Stellar Tera", () => {
  it("given a Stellar-Tera Charizard (Fire/Flying) using Flamethrower (Fire) for the first time, when calculating STAB, then returns 2.0", () => {
    // Source: Showdown sim/battle-actions.ts:1774-1779 -- first use of base type: 2x boost
    const pokemon = makeActive({
      types: ["fire", "flying"], // Stellar retains original types
      isTerastallized: true,
      activeTeraType: "stellar" as PokemonType,
      stellarBoostedTypes: [],
    });
    expect(calculateTeraStab(pokemon, "fire", ["fire", "flying"], false)).toBe(2.0);
    // Side effect: fire should now be in stellarBoostedTypes
    expect(pokemon.stellarBoostedTypes).toContain("fire");
  });

  it("given a Stellar-Tera Charizard using Flamethrower (Fire) for the second time, when calculating STAB, then returns 1.5", () => {
    // Source: Showdown sim/battle-actions.ts:1774-1779 -- already consumed Fire boost
    const pokemon = makeActive({
      types: ["fire", "flying"],
      isTerastallized: true,
      activeTeraType: "stellar" as PokemonType,
      stellarBoostedTypes: ["fire"], // Already consumed
    });
    expect(calculateTeraStab(pokemon, "fire", ["fire", "flying"], false)).toBe(1.5);
  });

  it("given a Stellar-Tera Charizard using Air Slash (Flying) for the first time, when calculating STAB, then returns 2.0", () => {
    // Source: Showdown sim/battle-actions.ts:1774-1779 -- Flying is a base type, first use = 2x
    const pokemon = makeActive({
      types: ["fire", "flying"],
      isTerastallized: true,
      activeTeraType: "stellar" as PokemonType,
      stellarBoostedTypes: ["fire"], // Fire already consumed, Flying not yet
    });
    expect(calculateTeraStab(pokemon, "flying", ["fire", "flying"], false)).toBe(2.0);
    expect(pokemon.stellarBoostedTypes).toContain("flying");
  });

  it("given a Stellar-Tera Charizard using Shadow Ball (Ghost, non-base type), when calculating STAB, then returns 4915/4096 (~1.2x)", () => {
    // Source: Showdown sim/battle-actions.ts:1781-1784 -- non-base type: 4915/4096
    const pokemon = makeActive({
      types: ["fire", "flying"],
      isTerastallized: true,
      activeTeraType: "stellar" as PokemonType,
      stellarBoostedTypes: [],
    });
    // Ghost is not a base type of Fire/Flying Charizard
    expect(calculateTeraStab(pokemon, "ghost", ["fire", "flying"], false)).toBeCloseTo(
      4915 / 4096,
      10,
    );
  });

  it("given a Stellar-Tera Pokemon with Adaptability using a move, when calculating STAB, then Adaptability has no effect", () => {
    // Source: Showdown sim/battle-actions.ts -- ModifySTAB event only called in non-Stellar branch
    // Source: specs/battle/10-gen9.md -- "Stellar exclusion: ModifySTAB event ... is only called in the non-Stellar branch"
    const pokemon = makeActive({
      types: ["fire", "flying"],
      ability: "adaptability",
      isTerastallized: true,
      activeTeraType: "stellar" as PokemonType,
      stellarBoostedTypes: [],
    });
    // Even with Adaptability, Stellar STAB is unmodified
    // First use of Fire: should be 2.0x (not 2.25x with Adaptability)
    expect(calculateTeraStab(pokemon, "fire", ["fire", "flying"], true)).toBe(2.0);
  });

  it("given a Stellar-Tera Pokemon using a non-base type move, when Adaptability is present, then returns 4915/4096 (Adaptability has no effect on Stellar)", () => {
    // Source: Showdown sim/battle-actions.ts -- Stellar branch does not call ModifySTAB
    const pokemon = makeActive({
      types: ["fire", "flying"],
      ability: "adaptability",
      isTerastallized: true,
      activeTeraType: "stellar" as PokemonType,
      stellarBoostedTypes: [],
    });
    expect(calculateTeraStab(pokemon, "ghost", ["fire", "flying"], true)).toBeCloseTo(
      4915 / 4096,
      10,
    );
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// Gen9Terastallization — Properties
// ═══════════════════════════════════════════════════════════════════════════

describe("Gen9Terastallization properties", () => {
  it("given Gen9Terastallization, when checking name, then returns 'Terastallization'", () => {
    const tera = new Gen9Terastallization();
    expect(tera.name).toBe("Terastallization");
  });

  it("given Gen9Terastallization, when checking generations, then returns [9]", () => {
    // Source: Terastallization is exclusive to Gen 9
    const tera = new Gen9Terastallization();
    expect(tera.generations).toEqual([9]);
  });
});
