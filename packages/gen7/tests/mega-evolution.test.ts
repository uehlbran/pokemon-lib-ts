import type { ActivePokemon, BattleSide, BattleState } from "@pokemon-lib-ts/battle";
import type { PokemonType } from "@pokemon-lib-ts/core";
import {
  CORE_ABILITY_IDS,
  MEGA_STONE_DATA as CORE_MEGA_STONE_DATA,
  CORE_ITEM_IDS,
  CORE_TYPE_IDS,
  CORE_GIMMICK_IDS,
  NEUTRAL_NATURES,
  type NatureId,
} from "@pokemon-lib-ts/core";
import { BATTLE_GIMMICK_IDS } from "@pokemon-lib-ts/battle";
import { describe, expect, it } from "vitest";
import {
  GEN7_ABILITY_IDS,
  GEN7_ITEM_IDS,
  GEN7_NATURE_IDS,
  GEN7_SPECIES_IDS,
  Gen7MegaEvolution,
  getMegaEvolutionData,
  MEGA_STONE_DATA,
} from "../src";
import { Gen7Ruleset } from "../src/Gen7Ruleset";

const ABILITIES = { ...CORE_ABILITY_IDS, ...GEN7_ABILITY_IDS };
const ITEMS = { ...CORE_ITEM_IDS, ...GEN7_ITEM_IDS };
const TYPES = CORE_TYPE_IDS;
const SPECIES = GEN7_SPECIES_IDS;
const NATURES = { ...Object.fromEntries(NEUTRAL_NATURES.map((nature) => [nature, nature])), ...GEN7_NATURE_IDS };
const GIMMICKS = { ...CORE_GIMMICK_IDS, ...BATTLE_GIMMICK_IDS };
const DEFAULT_NATURE: NatureId = NATURES.hardy;
const CHARIZARDITE_X = ITEMS.charizarditeX;
const CHARIZARDITE_Y = ITEMS.charizarditeY;
const VENUSAURITE = ITEMS.venusaurite;
const BLASTOISINITE = ITEMS.blastoisinite;
const LUCARIONITE = ITEMS.lucarionite;
const AGGRONITE = ITEMS.aggronite;
const LEFTOVERS = ITEMS.leftovers;
const SITRUS_BERRY = ITEMS.sitrusBerry;

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
      nature: DEFAULT_NATURE,
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
    generation: 7,
    turnNumber: 1,
    sides: [{}, {}],
  } as unknown as BattleState;
}

// ---------------------------------------------------------------------------
// MEGA_STONE_DATA table coverage
// ---------------------------------------------------------------------------

describe("MEGA_STONE_DATA -- Gen 7 mega stone lookup table", () => {
  it("given MEGA_STONE_DATA, when checking entry count, then exactly 47 mega stones are registered", () => {
    // Source: Bulbapedia "Mega Evolution" -- no new Mega Evolutions in Gen 7;
    // same 47 as Gen 6 (44 single-suffix + charizardite-x/y + mewtwonite-x/y = 47 total)
    expect(Object.keys(MEGA_STONE_DATA).length).toBe(47);
  });

  it("given the Gen 7 export, then it is the shared core mega stone table", () => {
    expect(MEGA_STONE_DATA).toBe(CORE_MEGA_STONE_DATA);
  });

  it("given venusaurite, when looking up in MEGA_STONE_DATA, then returns Mega Venusaur data", () => {
    // Source: Bulbapedia "Venusaurite" -- Grass/Poison, Thick Fat, 123 Defense
    const data = MEGA_STONE_DATA[VENUSAURITE];
    expect(data).toBeDefined();
    expect(data.form).toBe("mega-venusaur");
    expect(data.types).toEqual([TYPES.grass, TYPES.poison]);
    expect(data.ability).toBe(ABILITIES.thickFat);
    expect(data.baseStats.defense).toBe(123);
  });

  it("given charizardite-x, when looking up in MEGA_STONE_DATA, then returns Charizard Mega X data", () => {
    // Source: Bulbapedia "Charizardite X" -- Fire/Dragon type, Tough Claws ability, 130 Attack
    const data = MEGA_STONE_DATA[CHARIZARDITE_X];
    expect(data).toBeDefined();
    expect(data.form).toBe("mega-charizard-x");
    expect(data.types).toEqual([TYPES.fire, TYPES.dragon]);
    expect(data.ability).toBe(ABILITIES.toughClaws);
    expect(data.baseStats.attack).toBe(130);
  });

  it("given charizardite-y, when looking up in MEGA_STONE_DATA, then returns Charizard Mega Y data", () => {
    // Source: Bulbapedia "Charizardite Y" -- Fire/Flying type, Drought ability, 159 Sp. Attack
    const data = MEGA_STONE_DATA[CHARIZARDITE_Y];
    expect(data).toBeDefined();
    expect(data.form).toBe("mega-charizard-y");
    expect(data.types).toEqual([TYPES.fire, TYPES.flying]);
    expect(data.ability).toBe(ABILITIES.drought);
    expect(data.baseStats.spAttack).toBe(159);
  });

  it("given blastoisinite, when looking up in MEGA_STONE_DATA, then returns Mega Blastoise data", () => {
    // Source: Bulbapedia "Blastoisinite" -- Water, Mega Launcher ability, 135 Sp. Attack
    const data = MEGA_STONE_DATA[BLASTOISINITE];
    expect(data).toBeDefined();
    expect(data.form).toBe("mega-blastoise");
    expect(data.types).toEqual([TYPES.water]);
    expect(data.ability).toBe(ABILITIES.megaLauncher);
    expect(data.baseStats.spAttack).toBe(135);
  });

  it("given lucarionite, when looking up in MEGA_STONE_DATA, then returns Mega Lucario data", () => {
    // Source: Bulbapedia "Lucarionite" -- Fighting/Steel, Adaptability ability, 145 Attack
    const data = MEGA_STONE_DATA[LUCARIONITE];
    expect(data).toBeDefined();
    expect(data.form).toBe("mega-lucario");
    expect(data.types).toEqual([TYPES.fighting, TYPES.steel]);
    expect(data.ability).toBe(ABILITIES.adaptability);
    expect(data.baseStats.attack).toBe(145);
  });
});

// ---------------------------------------------------------------------------
// getMegaEvolutionData
// ---------------------------------------------------------------------------

describe("getMegaEvolutionData -- Gen 7", () => {
  it("given a valid mega stone item ID, when calling getMegaEvolutionData, then returns MegaEvolutionData", () => {
    // Source: Showdown data/items.ts -- charizardite-x is a Mega Stone
    const result = getMegaEvolutionData(CHARIZARDITE_X);
    expect(result).not.toBeNull();
    expect(result!.form).toBe("mega-charizard-x");
  });

  it("given null, when calling getMegaEvolutionData, then returns null", () => {
    // Source: defensive null check -- no item means no mega evolution
    expect(getMegaEvolutionData(null)).toBeNull();
  });

  it("given undefined, when calling getMegaEvolutionData, then returns null", () => {
    expect(getMegaEvolutionData(undefined)).toBeNull();
  });

  it("given a non-mega-stone item (sitrus-berry), when calling getMegaEvolutionData, then returns null", () => {
    // Source: Bulbapedia -- Sitrus Berry is not a Mega Stone
    expect(getMegaEvolutionData(SITRUS_BERRY)).toBeNull();
  });

  it("given eviolite (ends in -ite but is NOT a mega stone), when calling getMegaEvolutionData, then returns null", () => {
    // Source: isMegaStone() explicitly excludes eviolite
    expect(getMegaEvolutionData(ITEMS.eviolite)).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Gen7MegaEvolution.canUse()
// ---------------------------------------------------------------------------

describe("Gen7MegaEvolution -- canUse()", () => {
  it("given a Charizard holding charizardite-x with mega not used, when calling canUse, then returns true", () => {
    // Source: Bulbapedia "Mega Evolution" -- can activate if holding correct Mega Stone
    // Source: Showdown sim/battle.ts -- canMegaEvo check: holding mega stone + mega not used
    const gimmick = new Gen7MegaEvolution();
    const pokemon = makeActivePokemon({ heldItem: CHARIZARDITE_X, isMega: false });
    const side = makeSide({ gimmickUsed: false });
    const state = makeState();

    expect(gimmick.canUse(pokemon, side, state)).toBe(true);
  });

  it("given a Charizard holding charizardite-x but mega already used on this side, when calling canUse, then returns false", () => {
    // Source: Bulbapedia "Mega Evolution" -- only one Mega Evolution per trainer per battle
    const gimmick = new Gen7MegaEvolution();
    const firstPokemon = makeActivePokemon({ heldItem: CHARIZARDITE_X, isMega: false });
    const secondPokemon = makeActivePokemon({
      uid: "second",
      heldItem: CHARIZARDITE_Y,
      isMega: false,
    });
    const side = makeSide({ gimmickUsed: false });
    const state = makeState();

    // First Pokemon uses mega
    gimmick.activate(firstPokemon, side, state);

    // Second Pokemon on the same side should be blocked
    expect(gimmick.canUse(secondPokemon, side, state)).toBe(false);
  });

  it("given a Pokemon that has already mega evolved, when calling canUse, then returns false", () => {
    // Source: Showdown sim/battle.ts -- pokemon.isMega blocks re-activation
    const gimmick = new Gen7MegaEvolution();
    const pokemon = makeActivePokemon({ heldItem: CHARIZARDITE_X, isMega: true });
    const side = makeSide({ gimmickUsed: false });
    const state = makeState();

    expect(gimmick.canUse(pokemon, side, state)).toBe(false);
  });

  it("given a Pokemon holding a non-mega-stone item, when calling canUse, then returns false", () => {
    // Source: Bulbapedia "Mega Evolution" -- requires a Mega Stone to activate
    const gimmick = new Gen7MegaEvolution();
    const pokemon = makeActivePokemon({ heldItem: LEFTOVERS, isMega: false });
    const side = makeSide({ gimmickUsed: false });
    const state = makeState();

    expect(gimmick.canUse(pokemon, side, state)).toBe(false);
  });

  it("given a Pokemon holding no item, when calling canUse, then returns false", () => {
    // Source: Bulbapedia "Mega Evolution" -- requires holding a Mega Stone
    const gimmick = new Gen7MegaEvolution();
    const pokemon = makeActivePokemon({ heldItem: null, isMega: false });
    const side = makeSide({ gimmickUsed: false });
    const state = makeState();

    expect(gimmick.canUse(pokemon, side, state)).toBe(false);
  });

  it("given Charizard holding Venusaurite (wrong species), when calling canUse, then returns false", () => {
    // Source: Game mechanic -- Mega Stones only work for their specific species.
    // Venusaurite belongs to Venusaur (species #003); Charizard is species #006.
    // Source: Showdown sim/battle.ts -- formeChange only permitted when species matches stone
    const gimmick = new Gen7MegaEvolution();
    // makeActivePokemon defaults speciesId: SPECIES.charizard; venusaurite.baseSpeciesId = SPECIES.venusaur
    const pokemon = makeActivePokemon({ heldItem: VENUSAURITE, isMega: false });
    const side = makeSide({ gimmickUsed: false });
    const state = makeState();

    expect(gimmick.canUse(pokemon, side, state)).toBe(false);
  });

  it("given side.gimmickUsed is true but mega not internally used, when calling canUse, then returns true (Gen 7 difference)", () => {
    // Source: Showdown sim/side.ts Gen 7 -- megaUsed and zMoveUsed are separate booleans.
    // In Gen 7, side.gimmickUsed being true (from Z-Move) does NOT block Mega Evolution.
    // This is THE key difference from Gen 6.
    const gimmick = new Gen7MegaEvolution();
    const pokemon = makeActivePokemon({ heldItem: CHARIZARDITE_X, isMega: false });
    const side = makeSide({ gimmickUsed: true }); // Z-Move may have set this
    const state = makeState();

    // Gen 7 mega does NOT check side.gimmickUsed -- it uses internal tracking
    expect(gimmick.canUse(pokemon, side, state)).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Gen7MegaEvolution.activate()
// ---------------------------------------------------------------------------

describe("Gen7MegaEvolution -- activate()", () => {
  it("given Charizard holding charizardite-x, when activate is called, then emits mega-evolve event with correct form", () => {
    // Source: Bulbapedia "Charizardite X" -- evolves into Mega Charizard X
    // Source: Showdown sim/battle.ts -- mega-evolve event emitted with form key
    const gimmick = new Gen7MegaEvolution();
    const pokemon = makeActivePokemon({
      uid: "charizard-1",
      heldItem: CHARIZARDITE_X,
      types: [TYPES.fire, TYPES.flying],
      ability: ABILITIES.blaze,
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
    // Source: Bulbapedia "Charizardite X" -- Mega Charizard X is Fire/Dragon type
    const gimmick = new Gen7MegaEvolution();
    const pokemon = makeActivePokemon({
      heldItem: CHARIZARDITE_X,
      types: [TYPES.fire, TYPES.flying],
      ability: ABILITIES.blaze,
    });
    const side = makeSide({ gimmickUsed: false });
    const state = makeState();

    gimmick.activate(pokemon, side, state);

    expect(pokemon.types).toEqual([TYPES.fire, TYPES.dragon]);
  });

  it("given Charizard holding charizardite-x, when activate is called, then ability changes to Tough Claws", () => {
    // Source: Bulbapedia "Charizardite X" -- Mega Charizard X has Tough Claws
    const gimmick = new Gen7MegaEvolution();
    const pokemon = makeActivePokemon({
      heldItem: CHARIZARDITE_X,
      types: [TYPES.fire, TYPES.flying],
      ability: ABILITIES.blaze,
    });
    const side = makeSide({ gimmickUsed: false });
    const state = makeState();

    gimmick.activate(pokemon, side, state);

    expect(pokemon.ability).toBe(ABILITIES.toughClaws);
  });

  it("given Charizard holding charizardite-x, when activate is called, then calculatedStats are updated to level-scaled mega form stats", () => {
    // Source: Bulbapedia "Charizardite X" -- Mega Charizard X base stats: 130 Atk, 111 Def, 130 SpA, 85 SpD, 100 Spe
    // Source: pret/pokeemerald src/pokemon.c:2814 CALC_STAT -- Gen 3+ stat formula
    //   Stat = floor((floor((2*Base + IV + floor(EV/4)) * Level / 100) + 5) * NatureMod)
    //
    // For factory defaults (L50, 31 IVs, 0 EVs, Hardy nature -> natureMod = 1.0):
    //   atk:   floor((floor((260+31+0)*50/100)+5)*1.0) = floor(145+5) = 150
    //   def:   floor((floor((222+31+0)*50/100)+5)*1.0) = floor(126+5) = 131
    //   spatk: floor((floor((260+31+0)*50/100)+5)*1.0) = 150
    //   spdef: floor((floor((170+31+0)*50/100)+5)*1.0) = floor(100+5) = 105
    //   spe:   floor((floor((200+31+0)*50/100)+5)*1.0) = floor(115+5) = 120
    const gimmick = new Gen7MegaEvolution();
    const pokemon = makeActivePokemon({
      heldItem: CHARIZARDITE_X,
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

    expect(pokemon.pokemon.calculatedStats!.attack).toBe(150);
    expect(pokemon.pokemon.calculatedStats!.defense).toBe(131);
    expect(pokemon.pokemon.calculatedStats!.spAttack).toBe(150);
    expect(pokemon.pokemon.calculatedStats!.spDefense).toBe(105);
    expect(pokemon.pokemon.calculatedStats!.speed).toBe(120);
    // HP does NOT change on mega evolution
    // Source: Bulbapedia "Mega Evolution" -- "HP does not change when Mega Evolving"
    expect(pokemon.pokemon.calculatedStats!.hp).toBe(200);
  });

  it("given Charizard holding charizardite-x, when activate is called, then pokemon.isMega is set to true", () => {
    // Source: Showdown sim/battle.ts -- pokemon.isMega = true after activation
    const gimmick = new Gen7MegaEvolution();
    const pokemon = makeActivePokemon({ heldItem: CHARIZARDITE_X, isMega: false });
    const side = makeSide({ gimmickUsed: false });
    const state = makeState();

    expect(pokemon.isMega).toBe(false);
    gimmick.activate(pokemon, side, state);
    expect(pokemon.isMega).toBe(true);
  });

  it("given Charizard holding charizardite-x, when activate is called, then side.gimmickUsed remains false (Gen 7 difference)", () => {
    // Source: Showdown sim/side.ts Gen 7 -- megaUsed is separate from gimmickUsed.
    // Gen 7 does NOT set side.gimmickUsed on mega evolution because Z-Moves
    // also need to be usable in the same battle.
    // This is THE key behavioral difference from Gen 6's activate().
    const gimmick = new Gen7MegaEvolution();
    const pokemon = makeActivePokemon({ heldItem: CHARIZARDITE_X });
    const side = makeSide({ gimmickUsed: false });
    const state = makeState();

    expect(side.gimmickUsed).toBe(false);
    gimmick.activate(pokemon, side, state);
    // In Gen 6, this would be true. In Gen 7, it remains false.
    expect(side.gimmickUsed).toBe(false);
  });

  it("given Charizard holding charizardite-x, when activate is called, then internal mega tracking marks the side as used", () => {
    // Source: Showdown sim/side.ts:170 -- megaUsed per-side tracking
    const gimmick = new Gen7MegaEvolution();
    const pokemon = makeActivePokemon({ heldItem: CHARIZARDITE_X });
    const side = makeSide({ gimmickUsed: false, index: 0 });
    const state = makeState();

    expect(gimmick.hasUsedMega(0)).toBe(false);
    gimmick.activate(pokemon, side, state);
    expect(gimmick.hasUsedMega(0)).toBe(true);
    // Other side unaffected
    expect(gimmick.hasUsedMega(1)).toBe(false);
  });

  it("given Aggron holding aggronite, when activate is called, then types change to pure Steel", () => {
    // Source: Bulbapedia "Aggronite" -- Mega Aggron loses Rock type, becomes pure Steel
    const gimmick = new Gen7MegaEvolution();
    const pokemon = makeActivePokemon({
      speciesId: SPECIES.aggron,
      heldItem: AGGRONITE,
      types: [TYPES.steel, TYPES.rock],
      ability: ABILITIES.sturdy,
    });
    const side = makeSide({ gimmickUsed: false });
    const state = makeState();

    gimmick.activate(pokemon, side, state);

    expect(pokemon.types).toEqual([TYPES.steel]);
  });

  it("given a Pokemon holding no item, when activate is called, then returns empty events array", () => {
    // Source: defensive -- activate with no mega stone data returns []
    const gimmick = new Gen7MegaEvolution();
    const pokemon = makeActivePokemon({ heldItem: null });
    const side = makeSide({ gimmickUsed: false });
    const state = makeState();

    const events = gimmick.activate(pokemon, side, state);

    expect(events).toHaveLength(0);
    expect(pokemon.isMega).toBe(false);
    expect(side.gimmickUsed).toBe(false);
  });

  it("given Charizard-Y mega evolution, when activate is called, then types stay Fire/Flying and ability becomes Drought", () => {
    // Source: Bulbapedia "Charizardite Y" -- Mega Charizard Y: Fire/Flying, Drought, base SpAtk=159
    // Source: pret/pokeemerald CALC_STAT -- L50, 31 IVs, 0 EVs, Hardy (1.0):
    //   spatk: floor((floor((318+31+0)*50/100)+5)*1.0) = floor(174+5) = 179
    const gimmick = new Gen7MegaEvolution();
    const pokemon = makeActivePokemon({
      heldItem: CHARIZARDITE_Y,
      types: [TYPES.fire, TYPES.flying],
      ability: ABILITIES.blaze,
    });
    const side = makeSide({ gimmickUsed: false });
    const state = makeState();

    const events = gimmick.activate(pokemon, side, state);

    expect(events).toHaveLength(1);
    if (events[0].type === "mega-evolve") {
      expect(events[0].form).toBe("mega-charizard-y");
    }
    expect(pokemon.types).toEqual([TYPES.fire, TYPES.flying]);
    expect(pokemon.ability).toBe(ABILITIES.drought);
    // Properly scaled: calculateStat(159, 31, 0, 50, 1.0) = 179
    expect(pokemon.pokemon.calculatedStats!.spAttack).toBe(179);
  });
});

// ---------------------------------------------------------------------------
// Gen7MegaEvolution gimmick properties
// ---------------------------------------------------------------------------

describe("Gen7MegaEvolution -- gimmick properties", () => {
  it("given Gen7MegaEvolution, when checking name, then returns 'Mega Evolution'", () => {
    // Source: Bulbapedia "Mega Evolution" -- official name
    const gimmick = new Gen7MegaEvolution();
    expect(gimmick.name).toBe("Mega Evolution");
  });

  it("given Gen7MegaEvolution, when checking generations, then contains only Gen 7", () => {
    // Source: Bulbapedia "Mega Evolution" -- available in Gen 7 (Sun/Moon/USUM)
    const gimmick = new Gen7MegaEvolution();
    expect(gimmick.generations).toEqual([7]);
  });

  it("given Gen7MegaEvolution, when checking revert, then it is undefined (Mega Evolution is permanent)", () => {
    // Source: Bulbapedia "Mega Evolution" -- reverts only at end of battle, not mid-battle
    const gimmick = new Gen7MegaEvolution();
    expect(gimmick.revert).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// Gen7MegaEvolution.reset()
// ---------------------------------------------------------------------------

describe("Gen7MegaEvolution -- reset()", () => {
  it("given a used mega gimmick, when reset is called, then internal tracking is cleared", () => {
    // Source: Showdown sim behavior -- new battle resets all gimmick tracking
    const gimmick = new Gen7MegaEvolution();
    const pokemon = makeActivePokemon({ heldItem: CHARIZARDITE_X });
    const side = makeSide({ index: 0 });
    const state = makeState();

    gimmick.activate(pokemon, side, state);
    expect(gimmick.hasUsedMega(0)).toBe(true);

    gimmick.reset();
    expect(gimmick.hasUsedMega(0)).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Gen7Ruleset.getBattleGimmick(GIMMICKS.mega) wiring
// ---------------------------------------------------------------------------

describe(`Gen7Ruleset -- getBattleGimmick(${GIMMICKS.mega}) wiring`, () => {
  it(`given Gen7Ruleset, when calling getBattleGimmick(${GIMMICKS.mega}), then returns a Gen7MegaEvolution instance`, () => {
    // Source: Bulbapedia "Mega Evolution" -- Mega Evolution is available in Gen 7
    const ruleset = new Gen7Ruleset();
    const gimmick = ruleset.getBattleGimmick(GIMMICKS.mega);
    expect(gimmick).not.toBeNull();
    expect(gimmick).toBeInstanceOf(Gen7MegaEvolution);
  });

  it(`given Gen7Ruleset, when calling getBattleGimmick(${GIMMICKS.mega}), then returned gimmick has name 'Mega Evolution'`, () => {
    const ruleset = new Gen7Ruleset();
    const gimmick = ruleset.getBattleGimmick(GIMMICKS.mega);
    expect(gimmick!.name).toBe("Mega Evolution");
  });

  it(`given Gen7Ruleset, when calling getBattleGimmick(${GIMMICKS.mega}) twice, then returns the same shared instance`, () => {
    // Source: Gen7Ruleset uses a shared instance for internal per-side tracking
    // (unlike Gen 6 which creates new instances each call).
    const ruleset = new Gen7Ruleset();
    const g1 = ruleset.getBattleGimmick(GIMMICKS.mega);
    const g2 = ruleset.getBattleGimmick(GIMMICKS.mega);
    expect(g1).toBe(g2);
  });

  it(`given Gen7Ruleset, when calling getBattleGimmick(${BATTLE_GIMMICK_IDS.zMove}), then returns the Z-Move gimmick (not mega)`, () => {
    // Source: Showdown sim/battle.ts -- Gen 7 has both mega and Z-Move gimmicks
    const ruleset = new Gen7Ruleset();
    const zmove = ruleset.getBattleGimmick(BATTLE_GIMMICK_IDS.zMove);
    expect(zmove).not.toBeNull();
    expect(zmove!.name).toBe("Z-Move");
  });

  it(`given Gen7Ruleset, when calling getBattleGimmick(${BATTLE_GIMMICK_IDS.dynamax}), then returns null`, () => {
    // Source: Dynamax is Gen 8 only
    const ruleset = new Gen7Ruleset();
    expect(ruleset.getBattleGimmick(BATTLE_GIMMICK_IDS.dynamax)).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// activate() defensive guards
// ---------------------------------------------------------------------------

describe("Gen7MegaEvolution.activate() -- defensive guards", () => {
  it("given a Pokemon already mega-evolved, when calling activate() directly, then returns empty events and does not double-mutate", () => {
    // Source: CodeRabbit review PR #699 -- activate() should guard against callers that skip canUse()
    const mega = new Gen7MegaEvolution();
    const side = makeSide();
    const state = makeState();
    const charizard = makeActivePokemon({
      speciesId: SPECIES.charizard,
      heldItem: CHARIZARDITE_X,
      isMega: true, // already mega evolved
    });

    const events = mega.activate(charizard, side, state);
    expect(events).toHaveLength(0);
    // usedBySide should NOT be updated since the guard short-circuited
    expect(mega.hasUsedMega(0)).toBe(false);
  });

  it("given mega already used on a side, when calling activate() directly for another Pokemon, then returns empty events", () => {
    // Source: CodeRabbit review PR #699 -- activate() guards prevent reuse on same side
    const mega = new Gen7MegaEvolution();
    const side = makeSide();
    const state = makeState();

    const charizard = makeActivePokemon({ speciesId: SPECIES.charizard, heldItem: CHARIZARDITE_X });
    const lucario = makeActivePokemon({
      speciesId: SPECIES.lucario,
      heldItem: LUCARIONITE,
      types: [TYPES.fighting, TYPES.steel],
      ability: ABILITIES.steadfast,
    });

    // First activation succeeds
    const events1 = mega.activate(charizard, side, state);
    expect(events1).toHaveLength(1);

    // Second activation blocked by guard
    const events2 = mega.activate(lucario, side, state);
    expect(events2).toHaveLength(0);
  });

  it("given wrong species for held Mega Stone, when calling activate() directly, then returns empty events", () => {
    // Source: CodeRabbit review PR #699 -- wrong-species guard prevents form change
    const mega = new Gen7MegaEvolution();
    const side = makeSide();
    const state = makeState();

    // Venusaur holds Charizardite X (wrong stone for species)
    const venusaur = makeActivePokemon({
      speciesId: SPECIES.venusaur, // Venusaur
      heldItem: CHARIZARDITE_X, // Charizard's stone
      types: [TYPES.grass, TYPES.poison],
      ability: ABILITIES.overgrow,
    });

    const events = mega.activate(venusaur, side, state);
    expect(events).toHaveLength(0);
    expect(venusaur.isMega).toBe(false);
    expect(mega.hasUsedMega(0)).toBe(false);
  });
});
