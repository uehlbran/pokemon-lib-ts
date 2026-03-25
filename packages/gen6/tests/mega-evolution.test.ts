import type { ActivePokemon, BattleSide, BattleState } from "@pokemon-lib-ts/battle";
import type { PokemonType } from "@pokemon-lib-ts/core";
import {
  CORE_ABILITY_IDS,
  CORE_ITEM_IDS,
  CORE_TYPE_IDS,
  CORE_WEATHER_IDS,
  MEGA_STONE_DATA as CORE_MEGA_STONE_DATA,
} from "@pokemon-lib-ts/core";
import { describe, expect, it } from "vitest";
import {
  GEN6_ABILITY_IDS,
  GEN6_ITEM_IDS,
  GEN6_NATURE_IDS,
  GEN6_SPECIES_IDS,
} from "../src";
import { Gen6MegaEvolution, getMegaEvolutionData, MEGA_STONE_DATA } from "../src/Gen6MegaEvolution";
import { Gen6Ruleset } from "../src/Gen6Ruleset";

const ABILITIES = { ...CORE_ABILITY_IDS, ...GEN6_ABILITY_IDS } as const;
const ITEMS = { ...CORE_ITEM_IDS, ...GEN6_ITEM_IDS } as const;
const SPECIES = GEN6_SPECIES_IDS;
const TYPES = CORE_TYPE_IDS;
const CHARIZARDITE_X_DATA = MEGA_STONE_DATA[ITEMS.charizarditeX];
const CHARIZARDITE_Y_DATA = MEGA_STONE_DATA[ITEMS.charizarditeY];
const VENUSAURITE_DATA = MEGA_STONE_DATA[ITEMS.venusaurite];
const MEWTWONITE_X_DATA = MEGA_STONE_DATA[ITEMS.mewtwoniteX];
const MEWTWONITE_Y_DATA = MEGA_STONE_DATA[ITEMS.mewtwoniteY];
const AGGRONITE_DATA = MEGA_STONE_DATA[ITEMS.aggronite];

// ---------------------------------------------------------------------------
// Helper factories
// ---------------------------------------------------------------------------

function makeActivePokemon(overrides: {
  uid?: string;
  speciesId?: number;
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
      speciesId: overrides.speciesId ?? SPECIES.charizard,
      nickname: null,
      level: 50,
      experience: 0,
      nature: GEN6_NATURE_IDS.hardy,
      ivs: { hp: 31, attack: 31, defense: 31, spAttack: 31, spDefense: 31, speed: 31 },
      evs: { hp: 0, attack: 0, defense: 0, spAttack: 0, spDefense: 0, speed: 0 },
      currentHp: 200,
      moves: [],
      ability: overrides.ability ?? ABILITIES.blaze,
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
      pokeball: ITEMS.pokeBall,
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
    types: overrides.types ?? [TYPES.fire, TYPES.flying],
    ability: overrides.ability ?? ABILITIES.blaze,
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
    stellarBoostedTypes: [],
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
  it("given MEGA_STONE_DATA, when checking entry count, then exactly 47 mega stones are registered", () => {
    // Source: packages/gen6/data/items.json — lists all 47 canonical Gen 6 mega stone items
    // (44 single-suffix ending in 'ite' + charizardite-x/y + mewtwonite-x/y = 47 total)
    // This covers all XY and ORAS mega stones. Excludes: Rayquaza (Dragon Ascent, not a stone),
    // Blue Orb (Primal Kyogre), Red Orb (Primal Groudon).
    expect(Object.keys(MEGA_STONE_DATA).length).toBe(47);
  });

  it("given the Gen 6 export, then it is the shared core mega stone table", () => {
    expect(MEGA_STONE_DATA).toBe(CORE_MEGA_STONE_DATA);
  });

  it("given charizardite-x, when looking up in MEGA_STONE_DATA, then returns Charizard Mega X data", () => {
    // Source: Bulbapedia "Charizardite X" — Fire/Dragon type, Tough Claws ability, 130 Attack
    const data = MEGA_STONE_DATA[ITEMS.charizarditeX];
    expect(data).toBeDefined();
    expect(data.types).toEqual([TYPES.fire, TYPES.dragon]);
    expect(data.ability).toBe(GEN6_ABILITY_IDS.toughClaws);
    expect(data.baseStats.attack).toBe(130);
  });

  it("given charizardite-y, when looking up in MEGA_STONE_DATA, then returns Charizard Mega Y data", () => {
    // Source: Bulbapedia "Charizardite Y" — Fire/Flying type, Drought ability, 159 Sp. Attack
    const data = MEGA_STONE_DATA[ITEMS.charizarditeY];
    expect(data).toBeDefined();
    expect(data.types).toEqual([TYPES.fire, TYPES.flying]);
    expect(data.ability).toBe(GEN6_ABILITY_IDS.drought);
    expect(data.baseStats.spAttack).toBe(159);
  });

  it("given venusaurite, when looking up in MEGA_STONE_DATA, then returns Mega Venusaur data", () => {
    // Source: Bulbapedia "Venusaurite" — Grass/Poison, Thick Fat, 123 Defense
    const data = MEGA_STONE_DATA.venusaurite;
    expect(data).toBeDefined();
    expect(data.types).toEqual([TYPES.grass, TYPES.poison]);
    expect(data.ability).toBe(GEN6_ABILITY_IDS.thickFat);
    expect(data.baseStats.defense).toBe(123);
  });

  it("given mewtwonite-x, when looking up in MEGA_STONE_DATA, then returns Mega Mewtwo X data", () => {
    // Source: Bulbapedia "Mewtwonite X" — Psychic/Fighting, Steadfast, 190 Attack
    const data = MEGA_STONE_DATA[ITEMS.mewtwoniteX];
    expect(data).toBeDefined();
    expect(data.types).toEqual([TYPES.psychic, TYPES.fighting]);
    expect(data.ability).toBe(ABILITIES.steadfast);
    expect(data.baseStats.attack).toBe(190);
  });

  it("given mewtwonite-y, when looking up in MEGA_STONE_DATA, then returns Mega Mewtwo Y data", () => {
    // Source: Bulbapedia "Mewtwonite Y" — Psychic, Insomnia, 194 Sp. Attack
    const data = MEGA_STONE_DATA[ITEMS.mewtwoniteY];
    expect(data).toBeDefined();
    expect(data.types).toEqual([TYPES.psychic]);
    expect(data.ability).toBe(ABILITIES.insomnia);
    expect(data.baseStats.spAttack).toBe(194);
  });

  it("given aggronite, when looking up in MEGA_STONE_DATA, then returns Mega Aggron data with pure Steel type", () => {
    // Source: Bulbapedia "Aggronite" — Steel (loses Rock), Filter ability, 230 Defense
    // Note: Mega Aggron is notable for being a pure Steel type (loses its Rock type)
    const data = MEGA_STONE_DATA.aggronite;
    expect(data).toBeDefined();
    expect(data.types).toEqual([TYPES.steel]);
    expect(data.baseStats.defense).toBe(230);
    expect(data.ability).toBe(GEN6_ABILITY_IDS.filter);
  });
});

// ---------------------------------------------------------------------------
// getMegaEvolutionData
// ---------------------------------------------------------------------------

describe("getMegaEvolutionData", () => {
  it("given a valid mega stone item ID, when calling getMegaEvolutionData, then returns MegaEvolutionData", () => {
    // Source: Showdown data/items.ts -- charizardite-x is a Mega Stone
    const result = getMegaEvolutionData(ITEMS.charizarditeX);
    expect(result).not.toBeNull();
    expect(result).toBe(CHARIZARDITE_X_DATA);
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
    expect(getMegaEvolutionData(ITEMS.sitrusBerry)).toBeNull();
  });

  it("given eviolite (ends in -ite but is NOT a mega stone), when calling getMegaEvolutionData, then returns null", () => {
    // Source: isMegaStone() explicitly excludes eviolite -- it ends in -ite but is not a mega stone
    expect(getMegaEvolutionData(ITEMS.eviolite)).toBeNull();
  });

  it("given venusaurite, when calling getMegaEvolutionData, then returns correct form data", () => {
    // Source: Bulbapedia — Mega Venusaur uses Venusaurite; mega form name "mega-venusaur"
    // https://bulbapedia.bulbagarden.net/wiki/Mega_Evolution
    const result = getMegaEvolutionData(ITEMS.venusaurite);
    expect(result).not.toBeNull();
    expect(result).toBe(VENUSAURITE_DATA);
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
    const pokemon = makeActivePokemon({ heldItem: ITEMS.charizarditeX, isMega: false });
    const side = makeSide({ gimmickUsed: false });
    const state = makeState();

    expect(gimmick.canUse(pokemon, side, state)).toBe(true);
  });

  it("given a Pokemon holding charizardite-x but gimmick already used, when calling canUse, then returns false", () => {
    // Source: Bulbapedia "Mega Evolution" — only one Mega Evolution per trainer per battle
    const gimmick = new Gen6MegaEvolution();
    const pokemon = makeActivePokemon({ heldItem: ITEMS.charizarditeX, isMega: false });
    const side = makeSide({ gimmickUsed: true });
    const state = makeState();

    expect(gimmick.canUse(pokemon, side, state)).toBe(false);
  });

  it("given a Pokemon that has already mega evolved, when calling canUse, then returns false", () => {
    // Source: Showdown sim/battle.ts — pokemon.isMega blocks re-activation
    const gimmick = new Gen6MegaEvolution();
    const pokemon = makeActivePokemon({ heldItem: ITEMS.charizarditeX, isMega: true });
    const side = makeSide({ gimmickUsed: false });
    const state = makeState();

    expect(gimmick.canUse(pokemon, side, state)).toBe(false);
  });

  it("given a Pokemon holding a non-mega-stone item, when calling canUse, then returns false", () => {
    // Source: Bulbapedia "Mega Evolution" — requires a Mega Stone to activate
    const gimmick = new Gen6MegaEvolution();
    const pokemon = makeActivePokemon({ heldItem: ITEMS.leftovers, isMega: false });
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

  it("given Charizard holding Venusaurite, when calling canUse, then returns false", () => {
    // Source: Game mechanic — Mega Stones only work for their specific species.
    // Venusaurite belongs to Venusaur (species #003); Charizard is species #006.
    // A Charizard cannot use Venusaurite.
    // Source: Showdown sim/battle.ts — formeChange only permitted when species matches stone
    const gimmick = new Gen6MegaEvolution();
    // makeActivePokemon defaults speciesId: 6 (Charizard); venusaurite.baseSpeciesId = 3 (Venusaur)
    const pokemon = makeActivePokemon({ heldItem: ITEMS.venusaurite, isMega: false });
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
      heldItem: ITEMS.charizarditeX,
      types: [TYPES.fire, TYPES.flying],
      ability: ABILITIES.blaze,
    });
    const side = makeSide({ gimmickUsed: false, index: 0 });
    const state = makeState();

    const events = gimmick.activate(pokemon, side, state);

    expect(events).toHaveLength(1);
    expect(events[0].type).toBe("mega-evolve");
    if (events[0].type === "mega-evolve") {
      expect(events[0].form).toBe(CHARIZARDITE_X_DATA.form);
      expect(events[0].side).toBe(0);
      expect(events[0].pokemon).toBe("charizard-1");
    }
  });

  it("given Charizard holding charizardite-x, when activate is called, then types change to Fire/Dragon", () => {
    // Source: Bulbapedia "Charizardite X" — Mega Charizard X is Fire/Dragon type
    const gimmick = new Gen6MegaEvolution();
    const pokemon = makeActivePokemon({
      heldItem: ITEMS.charizarditeX,
      types: [TYPES.fire, TYPES.flying],
      ability: ABILITIES.blaze,
    });
    const side = makeSide({ gimmickUsed: false });
    const state = makeState();

    gimmick.activate(pokemon, side, state);

    expect(pokemon.types).toEqual(CHARIZARDITE_X_DATA.types);
  });

  it("given Charizard holding charizardite-x, when activate is called, then ability changes to Tough Claws", () => {
    // Source: Bulbapedia "Charizardite X" — Mega Charizard X has Tough Claws
    const gimmick = new Gen6MegaEvolution();
    const pokemon = makeActivePokemon({
      heldItem: ITEMS.charizarditeX,
      types: [TYPES.fire, TYPES.flying],
      ability: ABILITIES.blaze,
    });
    const side = makeSide({ gimmickUsed: false });
    const state = makeState();

    gimmick.activate(pokemon, side, state);

    expect(pokemon.ability).toBe(CHARIZARDITE_X_DATA.ability);
  });

  it("given Charizard holding charizardite-x, when activate is called, then calculatedStats are updated to level-scaled mega form stats", () => {
    // Source: Bulbapedia "Charizardite X" — Mega Charizard X base stats: 130 Atk, 111 Def, 130 SpA, 85 SpD, 100 Spe
    // Source: pret/pokeemerald src/pokemon.c:2814 CALC_STAT — Gen 3+ stat formula
    //   Stat = floor((floor((2*Base + IV + floor(EV/4)) * Level / 100) + 5) * NatureMod)
    //
    // For factory defaults (L50, 31 IVs, 0 EVs, Hardy nature → natureMod = 1.0):
    //   atk:   floor((floor((260+31+0)*50/100)+5)*1.0) = floor((floor(14550/100)+5)) = floor(145+5) = 150
    //   def:   floor((floor((222+31+0)*50/100)+5)*1.0) = floor((floor(12650/100)+5)) = floor(126+5) = 131
    //   spatk: floor((floor((260+31+0)*50/100)+5)*1.0) = 150
    //   spdef: floor((floor((170+31+0)*50/100)+5)*1.0) = floor((floor(10050/100)+5)) = floor(100+5) = 105
    //   spe:   floor((floor((200+31+0)*50/100)+5)*1.0) = floor((floor(11550/100)+5)) = floor(115+5) = 120
    const gimmick = new Gen6MegaEvolution();
    const pokemon = makeActivePokemon({
      heldItem: ITEMS.charizarditeX,
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

    // Attack/Defense/SpAtk/SpDef/Speed update to properly scaled mega form stats
    expect(pokemon.pokemon.calculatedStats!.attack).toBe(150);
    expect(pokemon.pokemon.calculatedStats!.defense).toBe(131);
    expect(pokemon.pokemon.calculatedStats!.spAttack).toBe(150);
    expect(pokemon.pokemon.calculatedStats!.spDefense).toBe(105);
    expect(pokemon.pokemon.calculatedStats!.speed).toBe(120);
    // HP does NOT change on mega evolution
    // Source: Bulbapedia "Mega Evolution" — "HP does not change when Mega Evolving"
    expect(pokemon.pokemon.calculatedStats!.hp).toBe(200);
  });

  it("given Charizard holding charizardite-x, when activate is called, then pokemon.isMega is set to true", () => {
    // Source: Showdown sim/battle.ts — pokemon.isMega = true after activation
    const gimmick = new Gen6MegaEvolution();
    const pokemon = makeActivePokemon({ heldItem: ITEMS.charizarditeX, isMega: false });
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
    const pokemon = makeActivePokemon({ heldItem: ITEMS.charizarditeX });
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
      speciesId: SPECIES.venusaur,
      heldItem: ITEMS.venusaurite,
      types: [TYPES.grass, TYPES.poison],
      ability: GEN6_ABILITY_IDS.chlorophyll,
    });
    const side = makeSide({ gimmickUsed: false, index: 1 });
    const state = makeState();

    const events = gimmick.activate(pokemon, side, state);

    expect(events).toHaveLength(1);
    if (events[0].type === "mega-evolve") {
      expect(events[0].form).toBe(VENUSAURITE_DATA.form);
      expect(events[0].side).toBe(1);
    }
    expect(pokemon.types).toEqual(VENUSAURITE_DATA.types);
    expect(pokemon.ability).toBe(VENUSAURITE_DATA.ability);
  });

  it("given Aggron holding aggronite, when activate is called, then types change to pure Steel", () => {
    // Source: Bulbapedia "Aggronite" — Mega Aggron loses Rock type, becomes pure Steel
    const gimmick = new Gen6MegaEvolution();
    const pokemon = makeActivePokemon({
      speciesId: SPECIES.aggron,
      heldItem: ITEMS.aggronite,
      types: [TYPES.steel, TYPES.rock],
      ability: ABILITIES.sturdy,
    });
    const side = makeSide({ gimmickUsed: false });
    const state = makeState();

    gimmick.activate(pokemon, side, state);

    expect(pokemon.types).toEqual(AGGRONITE_DATA.types);
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
    // Source: Bulbapedia "Charizardite Y" — Mega Charizard Y: Fire/Flying, Drought, base SpAtk=159
    // Source: pret/pokeemerald CALC_STAT — L50, 31 IVs, 0 EVs, Hardy (1.0):
    //   spatk: floor((floor((318+31+0)*50/100)+5)*1.0) = floor((floor(17450/100)+5)) = floor(174+5) = 179
    const gimmick = new Gen6MegaEvolution();
    const pokemon = makeActivePokemon({
      heldItem: ITEMS.charizarditeY,
      types: [TYPES.fire, TYPES.flying],
      ability: ABILITIES.blaze,
    });
    const side = makeSide({ gimmickUsed: false });
    const state = makeState();

    const events = gimmick.activate(pokemon, side, state);

    expect(events).toHaveLength(1);
    if (events[0].type === "mega-evolve") {
      expect(events[0].form).toBe(CHARIZARDITE_Y_DATA.form);
    }
    expect(pokemon.types).toEqual(CHARIZARDITE_Y_DATA.types);
    expect(pokemon.ability).toBe(CHARIZARDITE_Y_DATA.ability);
    // Properly scaled: calculateStat(159, 31, 0, 50, 1.0) = 179
    expect(pokemon.pokemon.calculatedStats!.spAttack).toBe(179);
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

// ---------------------------------------------------------------------------
// Mega ability entry effects
// ---------------------------------------------------------------------------

describe("Gen6MegaEvolution -- mega ability on-switch-in trigger", () => {
  it("given Charizard-Y mega-evolving, when activate is called, then isMega is true enabling engine ability hook", () => {
    // Source: Bulbapedia "Mega Evolution" — "If the Mega Evolved Pokémon's Ability has
    //   an on-entry effect, it activates after Mega Evolution."
    // Source: Showdown sim/battle-actions.ts — runMegaEvo calls pokemon.setAbility() which
    //   triggers ability on-start effects for entry abilities like Drought.
    // After mega evolution, actor.isMega === true. The BattleEngine checks `actor.isMega`
    // after gimmick activation to decide whether to invoke applyAbility("on-switch-in").
    // This test verifies the isMega flag is correctly set, which is the engine's gate condition.
    const gimmick = new Gen6MegaEvolution();
    const pokemon = makeActivePokemon({
      heldItem: ITEMS.charizarditeY,
      types: [TYPES.fire, TYPES.flying],
      ability: ABILITIES.blaze,
      isMega: false,
    });
    const side = makeSide({ gimmickUsed: false });
    const state = makeState();

    expect(pokemon.isMega).toBe(false);
    gimmick.activate(pokemon, side, state);

    // isMega is set — the engine will invoke applyAbility("on-switch-in") after gimmick
    // activation, which triggers Drought to set 5-turn sun weather.
    expect(pokemon.isMega).toBe(true);
    // Ability updated to drought — on-switch-in will set 5-turn sun (Gen 6 weather duration)
    expect(pokemon.ability).toBe(CHARIZARDITE_Y_DATA.ability);
  });

  it("given Charizard-Y mega-evolving, when ruleset applyAbility is called with on-switch-in, then sun weather is set", () => {
    // Source: Bulbapedia "Drought" Gen VI — "Summons sunlight for 5 turns on entry."
    // Source: Showdown data/mods/gen6/abilities.ts — drought weatherTurns: 5
    // This test verifies the full chain: mega evolve → ability changes to Drought →
    // engine calls applyAbility("on-switch-in") → sun is set for 5 turns.
    const ruleset = new Gen6Ruleset();
    const gimmick = new Gen6MegaEvolution();
    const pokemon = makeActivePokemon({
      heldItem: ITEMS.charizarditeY,
      types: [TYPES.fire, TYPES.flying],
      ability: ABILITIES.blaze,
      isMega: false,
    });
    const opponent = makeActivePokemon({ heldItem: null });
    const side = makeSide({ gimmickUsed: false });
    const state = makeState();

    // Step 1: Mega evolve — ability changes to Drought, isMega set to true
    gimmick.activate(pokemon, side, state);
    expect(pokemon.ability).toBe(CHARIZARDITE_Y_DATA.ability);

    // Step 2: Engine's ability hook fires on-switch-in with the new mega ability
    const abilityResult = ruleset.applyAbility("on-switch-in", {
      pokemon,
      opponent,
      state,
      rng: {
        next: () => 0,
        int: () => 0,
        chance: () => false,
        pick: <T>(arr: readonly T[]) => arr[0] as T,
        shuffle: <T>(arr: T[]) => arr,
        getState: () => 0,
        setState: () => {},
      } as unknown as import("@pokemon-lib-ts/core").SeededRandom,
      trigger: "on-switch-in",
    });

    // Drought ability fires → activated = true, weather-set effect in effects array
    expect(abilityResult.activated).toBe(true);
    const weatherEffect = abilityResult.effects.find((e) => e.effectType === "weather-set");
    expect(weatherEffect?.weather).toBe(CORE_WEATHER_IDS.sun);
    expect(weatherEffect?.weatherTurns).toBe(5);
  });
});
