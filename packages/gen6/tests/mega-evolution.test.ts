import type { ActivePokemon, BattleSide, BattleState } from "@pokemon-lib-ts/battle";
import type { PokemonType } from "@pokemon-lib-ts/core";
import { describe, expect, it } from "vitest";
import { Gen6MegaEvolution, getMegaEvolutionData, MEGA_STONE_DATA } from "../src/Gen6MegaEvolution";
import { Gen6Ruleset } from "../src/Gen6Ruleset";

// ---------------------------------------------------------------------------
// Helper factories
// ---------------------------------------------------------------------------

function makeActivePokemon(overrides: {
  uid?: string;
  heldItem?: string | null;
  types?: PokemonType[];
  ability?: string;
  isMega?: boolean;
  calculatedStats?: {
    hp?: number;
    attack?: number;
    defense?: number;
    spAttack?: number;
    spDefense?: number;
    speed?: number;
  };
}): ActivePokemon {
  const cs = overrides.calculatedStats ?? {};
  return {
    pokemon: {
      uid: overrides.uid ?? "test-uid",
      speciesId: 6,
      nickname: null,
      level: 50,
      experience: 0,
      nature: "hardy",
      ivs: { hp: 31, attack: 31, defense: 31, spAttack: 31, spDefense: 31, speed: 31 },
      evs: { hp: 0, attack: 0, defense: 0, spAttack: 0, spDefense: 0, speed: 0 },
      currentHp: 200,
      moves: [],
      ability: overrides.ability ?? "blaze",
      abilitySlot: "normal1" as const,
      heldItem: overrides.heldItem ?? null,
      status: null,
      friendship: 0,
      gender: "male" as any,
      isShiny: false,
      metLocation: "",
      metLevel: 1,
      originalTrainer: "",
      originalTrainerId: 0,
      pokeball: "pokeball",
      calculatedStats: {
        hp: cs.hp ?? 200,
        attack: cs.attack ?? 100,
        defense: cs.defense ?? 100,
        spAttack: cs.spAttack ?? 100,
        spDefense: cs.spDefense ?? 100,
        speed: cs.speed ?? 100,
      },
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
    volatileStatuses: new Map(),
    types: overrides.types ?? ["fire", "flying"],
    ability: overrides.ability ?? "blaze",
    suppressedAbility: null,
    lastMoveUsed: null,
    lastDamageTaken: 0,
    lastDamageType: null,
    lastDamageCategory: null,
    turnsOnField: 1,
    movedThisTurn: false,
    consecutiveProtects: 0,
    substituteHp: 0,
    itemKnockedOff: false,
    transformed: false,
    transformedSpecies: null,
    isMega: overrides.isMega ?? false,
    isDynamaxed: false,
    dynamaxTurnsLeft: 0,
    isTerastallized: false,
    teraType: null,
    forcedMove: null,
  } as ActivePokemon;
}

function makeSide(overrides: { gimmickUsed?: boolean; index?: 0 | 1 } = {}): BattleSide {
  return {
    index: overrides.index ?? 0,
    trainer: null,
    team: [],
    active: [],
    hazards: [],
    screens: [],
    tailwind: { active: false, turnsLeft: 0 },
    luckyChant: { active: false, turnsLeft: 0 },
    wish: null,
    futureAttack: null,
    faintCount: 0,
    gimmickUsed: overrides.gimmickUsed ?? false,
  } as BattleSide;
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

// ---------------------------------------------------------------------------
// MEGA_STONE_DATA table coverage
// ---------------------------------------------------------------------------

describe("MEGA_STONE_DATA -- mega stone lookup table", () => {
  it("given MEGA_STONE_DATA, when checking entry count, then at least 40 mega stones are registered", () => {
    // Source: Bulbapedia "Mega Evolution" -- 46 species can Mega Evolve in Gen 6 ORAS
    // (excluding Rayquaza which needs Dragon Ascent, and Primal Kyogre/Groudon)
    expect(Object.keys(MEGA_STONE_DATA).length).toBeGreaterThanOrEqual(40);
  });

  it("given charizardite-x, when looking up in MEGA_STONE_DATA, then returns Charizard Mega X data", () => {
    // Source: Bulbapedia "Charizardite X" — Fire/Dragon type, Tough Claws ability, 130 Attack
    const data = MEGA_STONE_DATA["charizardite-x"];
    expect(data).toBeDefined();
    expect(data.form).toBe("mega-charizard-x");
    expect(data.types).toEqual(["fire", "dragon"]);
    expect(data.ability).toBe("tough-claws");
    expect(data.baseStats.attack).toBe(130);
  });

  it("given charizardite-y, when looking up in MEGA_STONE_DATA, then returns Charizard Mega Y data", () => {
    // Source: Bulbapedia "Charizardite Y" — Fire/Flying type, Drought ability, 159 Sp. Attack
    const data = MEGA_STONE_DATA["charizardite-y"];
    expect(data).toBeDefined();
    expect(data.form).toBe("mega-charizard-y");
    expect(data.types).toEqual(["fire", "flying"]);
    expect(data.ability).toBe("drought");
    expect(data.baseStats.spAttack).toBe(159);
  });

  it("given venusaurite, when looking up in MEGA_STONE_DATA, then returns Mega Venusaur data", () => {
    // Source: Bulbapedia "Venusaurite" — Grass/Poison, Thick Fat, 123 Defense
    const data = MEGA_STONE_DATA.venusaurite;
    expect(data).toBeDefined();
    expect(data.form).toBe("mega-venusaur");
    expect(data.types).toEqual(["grass", "poison"]);
    expect(data.ability).toBe("thick-fat");
    expect(data.baseStats.defense).toBe(123);
  });

  it("given mewtwonite-x, when looking up in MEGA_STONE_DATA, then returns Mega Mewtwo X data", () => {
    // Source: Bulbapedia "Mewtwonite X" — Psychic/Fighting, Steadfast, 190 Attack
    const data = MEGA_STONE_DATA["mewtwonite-x"];
    expect(data).toBeDefined();
    expect(data.form).toBe("mega-mewtwo-x");
    expect(data.types).toEqual(["psychic", "fighting"]);
    expect(data.ability).toBe("steadfast");
    expect(data.baseStats.attack).toBe(190);
  });

  it("given mewtwonite-y, when looking up in MEGA_STONE_DATA, then returns Mega Mewtwo Y data", () => {
    // Source: Bulbapedia "Mewtwonite Y" — Psychic, Insomnia, 194 Sp. Attack
    const data = MEGA_STONE_DATA["mewtwonite-y"];
    expect(data).toBeDefined();
    expect(data.form).toBe("mega-mewtwo-y");
    expect(data.types).toEqual(["psychic"]);
    expect(data.ability).toBe("insomnia");
    expect(data.baseStats.spAttack).toBe(194);
  });

  it("given aggronite, when looking up in MEGA_STONE_DATA, then returns Mega Aggron data with pure Steel type", () => {
    // Source: Bulbapedia "Aggronite" — Steel (loses Rock), Filter ability, 230 Defense
    // Note: Mega Aggron is notable for being a pure Steel type (loses its Rock type)
    const data = MEGA_STONE_DATA.aggronite;
    expect(data).toBeDefined();
    expect(data.types).toEqual(["steel"]);
    expect(data.baseStats.defense).toBe(230);
    expect(data.ability).toBe("filter");
  });
});

// ---------------------------------------------------------------------------
// getMegaEvolutionData
// ---------------------------------------------------------------------------

describe("getMegaEvolutionData", () => {
  it("given a valid mega stone item ID, when calling getMegaEvolutionData, then returns MegaEvolutionData", () => {
    // Source: Showdown data/items.ts -- charizardite-x is a Mega Stone
    const result = getMegaEvolutionData("charizardite-x");
    expect(result).not.toBeNull();
    expect(result!.form).toBe("mega-charizard-x");
  });

  it("given null, when calling getMegaEvolutionData, then returns null", () => {
    // Source: defensive null check — no item means no mega evolution
    expect(getMegaEvolutionData(null)).toBeNull();
  });

  it("given undefined, when calling getMegaEvolutionData, then returns null", () => {
    expect(getMegaEvolutionData(undefined)).toBeNull();
  });

  it("given a non-mega-stone item (sitrus-berry), when calling getMegaEvolutionData, then returns null", () => {
    // Source: Bulbapedia -- Sitrus Berry is not a Mega Stone
    expect(getMegaEvolutionData("sitrus-berry")).toBeNull();
  });

  it("given eviolite (ends in -ite but is NOT a mega stone), when calling getMegaEvolutionData, then returns null", () => {
    // Source: isMegaStone() explicitly excludes eviolite -- it ends in -ite but is not a mega stone
    expect(getMegaEvolutionData("eviolite")).toBeNull();
  });

  it("given venusaurite, when calling getMegaEvolutionData, then returns correct form data", () => {
    const result = getMegaEvolutionData("venusaurite");
    expect(result).not.toBeNull();
    expect(result!.form).toBe("mega-venusaur");
    expect(result!.item).toBe("venusaurite");
  });
});

// ---------------------------------------------------------------------------
// Gen6MegaEvolution.canUse()
// ---------------------------------------------------------------------------

describe("Gen6MegaEvolution -- canUse()", () => {
  it("given a Pokemon holding charizardite-x with gimmick not used, when calling canUse, then returns true", () => {
    // Source: Bulbapedia "Mega Evolution" — can activate if holding correct Mega Stone
    // Source: Showdown sim/battle.ts — canMegaEvo check: holding mega stone + gimmick not used
    const gimmick = new Gen6MegaEvolution();
    const pokemon = makeActivePokemon({ heldItem: "charizardite-x", isMega: false });
    const side = makeSide({ gimmickUsed: false });
    const state = makeState();

    expect(gimmick.canUse(pokemon, side, state)).toBe(true);
  });

  it("given a Pokemon holding charizardite-x but gimmick already used, when calling canUse, then returns false", () => {
    // Source: Bulbapedia "Mega Evolution" — only one Mega Evolution per trainer per battle
    const gimmick = new Gen6MegaEvolution();
    const pokemon = makeActivePokemon({ heldItem: "charizardite-x", isMega: false });
    const side = makeSide({ gimmickUsed: true });
    const state = makeState();

    expect(gimmick.canUse(pokemon, side, state)).toBe(false);
  });

  it("given a Pokemon that has already mega evolved, when calling canUse, then returns false", () => {
    // Source: Showdown sim/battle.ts — pokemon.isMega blocks re-activation
    const gimmick = new Gen6MegaEvolution();
    const pokemon = makeActivePokemon({ heldItem: "charizardite-x", isMega: true });
    const side = makeSide({ gimmickUsed: false });
    const state = makeState();

    expect(gimmick.canUse(pokemon, side, state)).toBe(false);
  });

  it("given a Pokemon holding a non-mega-stone item, when calling canUse, then returns false", () => {
    // Source: Bulbapedia "Mega Evolution" — requires a Mega Stone to activate
    const gimmick = new Gen6MegaEvolution();
    const pokemon = makeActivePokemon({ heldItem: "leftovers", isMega: false });
    const side = makeSide({ gimmickUsed: false });
    const state = makeState();

    expect(gimmick.canUse(pokemon, side, state)).toBe(false);
  });

  it("given a Pokemon holding no item, when calling canUse, then returns false", () => {
    // Source: Bulbapedia "Mega Evolution" — requires holding a Mega Stone
    const gimmick = new Gen6MegaEvolution();
    const pokemon = makeActivePokemon({ heldItem: null, isMega: false });
    const side = makeSide({ gimmickUsed: false });
    const state = makeState();

    expect(gimmick.canUse(pokemon, side, state)).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Gen6MegaEvolution.activate()
// ---------------------------------------------------------------------------

describe("Gen6MegaEvolution -- activate()", () => {
  it("given Charizard holding charizardite-x, when activate is called, then emits mega-evolve event with correct form", () => {
    // Source: Bulbapedia "Charizardite X" — evolves into Mega Charizard X
    // Source: Showdown sim/battle.ts — mega-evolve event emitted with form key
    const gimmick = new Gen6MegaEvolution();
    const pokemon = makeActivePokemon({
      uid: "charizard-1",
      heldItem: "charizardite-x",
      types: ["fire", "flying"],
      ability: "blaze",
    });
    const side = makeSide({ gimmickUsed: false, index: 0 });
    const state = makeState();

    const events = gimmick.activate(pokemon, side, state);

    expect(events).toHaveLength(1);
    expect(events[0].type).toBe("mega-evolve");
    if (events[0].type === "mega-evolve") {
      expect(events[0].form).toBe("mega-charizard-x");
      expect(events[0].side).toBe(0);
      expect(events[0].pokemon).toBe("charizard-1");
    }
  });

  it("given Charizard holding charizardite-x, when activate is called, then types change to Fire/Dragon", () => {
    // Source: Bulbapedia "Charizardite X" — Mega Charizard X is Fire/Dragon type
    const gimmick = new Gen6MegaEvolution();
    const pokemon = makeActivePokemon({
      heldItem: "charizardite-x",
      types: ["fire", "flying"],
      ability: "blaze",
    });
    const side = makeSide({ gimmickUsed: false });
    const state = makeState();

    gimmick.activate(pokemon, side, state);

    expect(pokemon.types).toEqual(["fire", "dragon"]);
  });

  it("given Charizard holding charizardite-x, when activate is called, then ability changes to Tough Claws", () => {
    // Source: Bulbapedia "Charizardite X" — Mega Charizard X has Tough Claws
    const gimmick = new Gen6MegaEvolution();
    const pokemon = makeActivePokemon({
      heldItem: "charizardite-x",
      types: ["fire", "flying"],
      ability: "blaze",
    });
    const side = makeSide({ gimmickUsed: false });
    const state = makeState();

    gimmick.activate(pokemon, side, state);

    expect(pokemon.ability).toBe("tough-claws");
  });

  it("given Charizard holding charizardite-x, when activate is called, then calculatedStats are updated to mega form stats", () => {
    // Source: Bulbapedia "Charizardite X" — Mega Charizard X: 130 Atk, 111 Def, 130 SpA, 85 SpD, 100 Spe
    const gimmick = new Gen6MegaEvolution();
    const pokemon = makeActivePokemon({
      heldItem: "charizardite-x",
      calculatedStats: {
        hp: 200,
        attack: 84,
        defense: 78,
        spAttack: 109,
        spDefense: 85,
        speed: 100,
      },
    });
    const side = makeSide({ gimmickUsed: false });
    const state = makeState();

    gimmick.activate(pokemon, side, state);

    // Attack/Defense/SpAtk/SpDef/Speed update to mega base stats
    expect(pokemon.pokemon.calculatedStats!.attack).toBe(130);
    expect(pokemon.pokemon.calculatedStats!.defense).toBe(111);
    expect(pokemon.pokemon.calculatedStats!.spAttack).toBe(130);
    expect(pokemon.pokemon.calculatedStats!.spDefense).toBe(85);
    expect(pokemon.pokemon.calculatedStats!.speed).toBe(100);
    // HP does NOT change on mega evolution
    // Source: Bulbapedia "Mega Evolution" — "HP does not change"
    expect(pokemon.pokemon.calculatedStats!.hp).toBe(200);
  });

  it("given Charizard holding charizardite-x, when activate is called, then pokemon.isMega is set to true", () => {
    // Source: Showdown sim/battle.ts — pokemon.isMega = true after activation
    const gimmick = new Gen6MegaEvolution();
    const pokemon = makeActivePokemon({ heldItem: "charizardite-x", isMega: false });
    const side = makeSide({ gimmickUsed: false });
    const state = makeState();

    expect(pokemon.isMega).toBe(false);
    gimmick.activate(pokemon, side, state);
    expect(pokemon.isMega).toBe(true);
  });

  it("given Charizard holding charizardite-x, when activate is called, then side.gimmickUsed is set to true", () => {
    // Source: Bulbapedia "Mega Evolution" — one Mega Evolution per trainer per battle
    // Source: Showdown sim/battle.ts — side.gimmickUsed = true after activation
    const gimmick = new Gen6MegaEvolution();
    const pokemon = makeActivePokemon({ heldItem: "charizardite-x" });
    const side = makeSide({ gimmickUsed: false });
    const state = makeState();

    expect(side.gimmickUsed).toBe(false);
    gimmick.activate(pokemon, side, state);
    expect(side.gimmickUsed).toBe(true);
  });

  it("given Venusaur holding venusaurite, when activate is called, then emits mega-evolve event for mega-venusaur", () => {
    // Source: Bulbapedia "Venusaurite" — Venusaur mega evolves to Mega Venusaur (Grass/Poison, Thick Fat)
    const gimmick = new Gen6MegaEvolution();
    const pokemon = makeActivePokemon({
      uid: "venusaur-1",
      heldItem: "venusaurite",
      types: ["grass", "poison"],
      ability: "chlorophyll",
    });
    const side = makeSide({ gimmickUsed: false, index: 1 });
    const state = makeState();

    const events = gimmick.activate(pokemon, side, state);

    expect(events).toHaveLength(1);
    if (events[0].type === "mega-evolve") {
      expect(events[0].form).toBe("mega-venusaur");
      expect(events[0].side).toBe(1);
    }
    expect(pokemon.types).toEqual(["grass", "poison"]);
    expect(pokemon.ability).toBe("thick-fat");
  });

  it("given Aggron holding aggronite, when activate is called, then types change to pure Steel", () => {
    // Source: Bulbapedia "Aggronite" — Mega Aggron loses Rock type, becomes pure Steel
    const gimmick = new Gen6MegaEvolution();
    const pokemon = makeActivePokemon({
      heldItem: "aggronite",
      types: ["steel", "rock"],
      ability: "sturdy",
    });
    const side = makeSide({ gimmickUsed: false });
    const state = makeState();

    gimmick.activate(pokemon, side, state);

    expect(pokemon.types).toEqual(["steel"]);
  });

  it("given a Pokemon holding no item, when activate is called, then returns empty events array", () => {
    // Source: defensive — activate with no mega stone data returns []
    const gimmick = new Gen6MegaEvolution();
    const pokemon = makeActivePokemon({ heldItem: null });
    const side = makeSide({ gimmickUsed: false });
    const state = makeState();

    const events = gimmick.activate(pokemon, side, state);

    expect(events).toHaveLength(0);
    expect(pokemon.isMega).toBe(false);
    expect(side.gimmickUsed).toBe(false);
  });

  it("given Charizard-Y mega evolution, when activate is called, then types change to Fire/Flying and ability to Drought", () => {
    // Source: Bulbapedia "Charizardite Y" — Mega Charizard Y: Fire/Flying, Drought, 159 SpAtk
    const gimmick = new Gen6MegaEvolution();
    const pokemon = makeActivePokemon({
      heldItem: "charizardite-y",
      types: ["fire", "flying"],
      ability: "blaze",
    });
    const side = makeSide({ gimmickUsed: false });
    const state = makeState();

    const events = gimmick.activate(pokemon, side, state);

    expect(events).toHaveLength(1);
    if (events[0].type === "mega-evolve") {
      expect(events[0].form).toBe("mega-charizard-y");
    }
    expect(pokemon.types).toEqual(["fire", "flying"]);
    expect(pokemon.ability).toBe("drought");
    expect(pokemon.pokemon.calculatedStats!.spAttack).toBe(159);
  });
});

// ---------------------------------------------------------------------------
// Gen6MegaEvolution gimmick properties
// ---------------------------------------------------------------------------

describe("Gen6MegaEvolution -- gimmick properties", () => {
  it("given Gen6MegaEvolution, when checking name, then returns 'Mega Evolution'", () => {
    // Source: Bulbapedia "Mega Evolution" — official name
    const gimmick = new Gen6MegaEvolution();
    expect(gimmick.name).toBe("Mega Evolution");
  });

  it("given Gen6MegaEvolution, when checking generations, then contains only Gen 6", () => {
    // Source: Bulbapedia "Mega Evolution" — introduced in Gen 6, not Gen 5 or Gen 7
    const gimmick = new Gen6MegaEvolution();
    expect(gimmick.generations).toEqual([6]);
  });

  it("given Gen6MegaEvolution, when checking revert, then it is undefined (Mega Evolution is permanent)", () => {
    // Source: Bulbapedia "Mega Evolution" — reverts only at end of battle, not mid-battle
    const gimmick = new Gen6MegaEvolution();
    expect(gimmick.revert).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// Gen6Ruleset.getBattleGimmick() wiring
// ---------------------------------------------------------------------------

describe("Gen6Ruleset -- getBattleGimmick wiring", () => {
  it("given Gen6Ruleset, when calling getBattleGimmick, then returns a Gen6MegaEvolution instance", () => {
    // Source: Bulbapedia "Mega Evolution" — Gen 6 is the first gen with Mega Evolution
    const ruleset = new Gen6Ruleset();
    const gimmick = ruleset.getBattleGimmick();
    expect(gimmick).not.toBeNull();
    expect(gimmick).toBeInstanceOf(Gen6MegaEvolution);
  });

  it("given Gen6Ruleset, when calling getBattleGimmick, then returned gimmick has name 'Mega Evolution'", () => {
    const ruleset = new Gen6Ruleset();
    const gimmick = ruleset.getBattleGimmick();
    expect(gimmick!.name).toBe("Mega Evolution");
  });

  it("given two Gen6Ruleset instances, when calling getBattleGimmick, then each call returns a fresh instance", () => {
    // Ensures getBattleGimmick is not sharing state between invocations
    const ruleset = new Gen6Ruleset();
    const g1 = ruleset.getBattleGimmick();
    const g2 = ruleset.getBattleGimmick();
    expect(g1).not.toBe(g2);
  });
});
