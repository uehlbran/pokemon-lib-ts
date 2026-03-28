/**
 * Tests for Gen 7 Ultra Burst gimmick.
 *
 * Ultra Burst transforms Necrozma-Dusk-Mane or Necrozma-Dawn-Wings into Ultra Necrozma
 * by consuming the Ultranecrozium Z. Only these two Necrozma fused forms are eligible.
 *
 * Source: Bulbapedia "Ultra Burst" -- https://bulbapedia.bulbagarden.net/wiki/Ultra_Burst
 * Source: Pokémon Showdown data/pokedex.ts + data/moves.ts for stat and move values
 */

import type { ActivePokemon, BattleSide, BattleState } from "@pokemon-lib-ts/battle";
import { BATTLE_GIMMICK_IDS } from "@pokemon-lib-ts/battle";
import type { MoveData, PokemonType } from "@pokemon-lib-ts/core";
import {
  ALL_NATURES,
  CORE_ABILITY_IDS,
  CORE_ABILITY_SLOTS,
  CORE_GENDERS,
  CORE_ITEM_IDS,
  CORE_MOVE_CATEGORIES,
  CORE_TYPE_IDS,
  calculateStat,
  createEvs,
  createIvs,
  createMoveSlot,
  getNatureModifier,
  SeededRandom,
} from "@pokemon-lib-ts/core";
import { describe, expect, it } from "vitest";
import {
  createGen7DataManager,
  GEN7_ABILITY_IDS,
  GEN7_ITEM_IDS,
  GEN7_MOVE_IDS,
  GEN7_NATURE_IDS,
  GEN7_SPECIES_IDS,
  Gen7UltraBurst,
  Gen7ZMove,
} from "../src";
import { calculateGen7Damage } from "../src/Gen7DamageCalc";
import { Gen7Ruleset } from "../src/Gen7Ruleset";
import { GEN7_TYPE_CHART } from "../src/Gen7TypeChart";

// ─── Constants ───────────────────────────────────────────────────────────────

const ABILITY_IDS = { ...CORE_ABILITY_IDS, ...GEN7_ABILITY_IDS } as const;
const ITEM_IDS = { ...CORE_ITEM_IDS, ...GEN7_ITEM_IDS } as const;
const MOVE_IDS = { ...GEN7_MOVE_IDS } as const;
const TYPE_IDS = CORE_TYPE_IDS;
const SPECIES_IDS = GEN7_SPECIES_IDS;
const DATA_MANAGER = createGen7DataManager();

const ULTRANECROZIUM_Z = ITEM_IDS.ultranecroziumZ;
const PHOTON_GEYSER_MOVE = MOVE_IDS.photonGeyser;

const TEST_TRAINER = Object.freeze({
  id: "dawn",
  displayName: "Dawn",
  trainerClass: "Trainer",
});

// ─── Helpers ─────────────────────────────────────────────────────────────────

function createNecrozmaOnField(overrides: {
  speciesId?: number;
  heldItem?: string | null;
  moves?: Array<{ moveId: string }>;
  ability?: string;
  isUltraBurst?: boolean;
  level?: number;
}): ActivePokemon {
  const speciesId = overrides.speciesId ?? SPECIES_IDS.necrozmaDuskMane;
  const level = overrides.level ?? 50;
  const moveSlots = (overrides.moves ?? [{ moveId: PHOTON_GEYSER_MOVE }]).map((m) =>
    createMoveSlot(m.moveId, DATA_MANAGER.getMove(m.moveId).pp),
  );

  return {
    pokemon: {
      uid: "test-necrozma",
      speciesId,
      nickname: null,
      level,
      experience: 0,
      nature: GEN7_NATURE_IDS.hardy,
      ivs: createIvs(),
      evs: createEvs(),
      currentHp: 250,
      moves: moveSlots,
      ability: overrides.ability ?? ABILITY_IDS.prismArmor,
      abilitySlot: CORE_ABILITY_SLOTS.normal1,
      heldItem: overrides.heldItem ?? ULTRANECROZIUM_Z,
      status: null,
      friendship: 0,
      gender: CORE_GENDERS.unknown as any,
      isShiny: false,
      metLocation: "",
      metLevel: 1,
      originalTrainer: "",
      originalTrainerId: 0,
      pokeball: ITEM_IDS.pokeBall,
      calculatedStats: {
        hp: 250,
        attack: 150,
        defense: 120,
        spAttack: 110,
        spDefense: 105,
        speed: 75,
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
    types: [TYPE_IDS.psychic, TYPE_IDS.steel],
    ability: overrides.ability ?? ABILITY_IDS.prismArmor,
    suppressedAbility: null,
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
    isUltraBurst: overrides.isUltraBurst ?? false,
    isDynamaxed: false,
    dynamaxTurnsLeft: 0,
    isTerastallized: false,
    teraType: null,
    stellarBoostedTypes: [],
    forcedMove: null,
  } as ActivePokemon;
}

function createSyntheticBattleSide(index: 0 | 1 = 0): BattleSide {
  return {
    index,
    gimmickUsed: false,
    trainer: TEST_TRAINER,
    team: [],
    active: [],
    hazards: [],
    screens: [],
    tailwind: { active: false, turnsLeft: 0 },
    luckyChant: { active: false, turnsLeft: 0 },
    wish: null,
    futureAttack: null,
    faintCount: 0,
  } as unknown as BattleSide;
}

function createSyntheticBattleState(): BattleState {
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

function createSyntheticDamageMove(overrides: {
  id?: string;
  type?: PokemonType;
  power?: number | null;
  accuracy?: number | null;
  category?: (typeof CORE_MOVE_CATEGORIES)[keyof typeof CORE_MOVE_CATEGORIES];
}): MoveData {
  const tackle = DATA_MANAGER.getMove("tackle");
  return {
    ...tackle,
    id: overrides.id ?? "synthetic-move",
    displayName: overrides.id ?? "Synthetic Move",
    type: overrides.type ?? TYPE_IDS.normal,
    power: overrides.power ?? 80,
    accuracy: overrides.accuracy ?? 100,
    category: overrides.category ?? CORE_MOVE_CATEGORIES.physical,
    effect: null,
    flags: { ...tackle.flags },
  } as MoveData;
}

function createSyntheticOnFieldPokemon(overrides: {
  types?: PokemonType[];
  ability?: string;
  attack?: number;
  spAttack?: number;
  defense?: number;
  spDefense?: number;
  hp?: number;
  speciesId?: number;
  heldItem?: string | null;
  isUltraBurst?: boolean;
}): ActivePokemon {
  return {
    pokemon: {
      uid: "test-opponent",
      speciesId: overrides.speciesId ?? SPECIES_IDS.blissey,
      nickname: null,
      level: 50,
      experience: 0,
      nature: GEN7_NATURE_IDS.hardy,
      ivs: createIvs(),
      evs: createEvs(),
      currentHp: overrides.hp ?? 200,
      moves: [createMoveSlot("tackle", DATA_MANAGER.getMove("tackle").pp)],
      ability: overrides.ability ?? ABILITY_IDS.sereneGrace,
      abilitySlot: CORE_ABILITY_SLOTS.normal1,
      heldItem: overrides.heldItem ?? null,
      status: null,
      friendship: 0,
      gender: CORE_GENDERS.female as any,
      isShiny: false,
      metLocation: "",
      metLevel: 1,
      originalTrainer: "",
      originalTrainerId: 0,
      pokeball: ITEM_IDS.pokeBall,
      calculatedStats: {
        hp: overrides.hp ?? 200,
        attack: overrides.attack ?? 100,
        defense: overrides.defense ?? 100,
        spAttack: overrides.spAttack ?? 100,
        spDefense: overrides.spDefense ?? 100,
        speed: 100,
      },
    },
    teamSlot: 1,
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
    types: overrides.types ?? [TYPE_IDS.normal],
    ability: overrides.ability ?? ABILITY_IDS.sereneGrace,
    suppressedAbility: null,
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
    isUltraBurst: overrides.isUltraBurst ?? false,
    isDynamaxed: false,
    dynamaxTurnsLeft: 0,
    isTerastallized: false,
    teraType: null,
    stellarBoostedTypes: [],
    forcedMove: null,
  } as ActivePokemon;
}

// ─── Tests ───────────────────────────────────────────────────────────────────

describe("Gen7UltraBurst -- canUse()", () => {
  it("given Necrozma-Dusk-Mane holding Ultranecrozium Z, when checking canUse, then returns true", () => {
    // Source: Bulbapedia "Ultra Burst" -- Necrozma-Dusk-Mane is eligible
    const zMove = new Gen7ZMove();
    const ultraBurst = new Gen7UltraBurst(zMove);
    const pokemon = createNecrozmaOnField({
      speciesId: SPECIES_IDS.necrozmaDuskMane,
      heldItem: ULTRANECROZIUM_Z,
    });
    const side = createSyntheticBattleSide(0);
    const state = createSyntheticBattleState();

    expect(ultraBurst.canUse(pokemon, side, state)).toBe(true);
  });

  it("given Necrozma-Dawn-Wings holding Ultranecrozium Z, when checking canUse, then returns true", () => {
    // Source: Bulbapedia "Ultra Burst" -- Necrozma-Dawn-Wings is eligible
    const zMove = new Gen7ZMove();
    const ultraBurst = new Gen7UltraBurst(zMove);
    const pokemon = createNecrozmaOnField({
      speciesId: SPECIES_IDS.necrozmaDawnWings,
      heldItem: ULTRANECROZIUM_Z,
    });
    const side = createSyntheticBattleSide(0);
    const state = createSyntheticBattleState();

    expect(ultraBurst.canUse(pokemon, side, state)).toBe(true);
  });

  it("given regular Necrozma (800) holding Ultranecrozium Z, when checking canUse, then returns false", () => {
    // Source: Bulbapedia "Ultra Burst" -- only fused forms can Ultra Burst; base Necrozma cannot
    const zMove = new Gen7ZMove();
    const ultraBurst = new Gen7UltraBurst(zMove);
    const pokemon = createNecrozmaOnField({
      speciesId: SPECIES_IDS.necrozma,
      heldItem: ULTRANECROZIUM_Z,
    });
    const side = createSyntheticBattleSide(0);
    const state = createSyntheticBattleState();

    expect(ultraBurst.canUse(pokemon, side, state)).toBe(false);
  });

  it("given Necrozma-Dusk-Mane holding a different item, when checking canUse, then returns false", () => {
    // Source: Bulbapedia "Ultra Burst" -- must hold Ultranecrozium Z specifically
    const zMove = new Gen7ZMove();
    const ultraBurst = new Gen7UltraBurst(zMove);
    const pokemon = createNecrozmaOnField({
      speciesId: SPECIES_IDS.necrozmaDuskMane,
      heldItem: ITEM_IDS.leftovers,
    });
    const side = createSyntheticBattleSide(0);
    const state = createSyntheticBattleState();

    expect(ultraBurst.canUse(pokemon, side, state)).toBe(false);
  });

  it("given Z-Move already used for this side, when checking canUse, then returns false", () => {
    // Source: Showdown sim/battle-actions.ts -- canUltraBurst: zMoveUsed blocks Ultra Burst
    // because the Z-Crystal (Ultranecrozium Z) is already consumed
    const zMove = new Gen7ZMove();
    const ultraBurst = new Gen7UltraBurst(zMove);
    const pokemon = createNecrozmaOnField({
      speciesId: SPECIES_IDS.necrozmaDuskMane,
      heldItem: ULTRANECROZIUM_Z,
    });
    const side = createSyntheticBattleSide(0);
    const state = createSyntheticBattleState();

    // Simulate Z-Move already used
    zMove.markUsed(0);

    expect(ultraBurst.canUse(pokemon, side, state)).toBe(false);
  });
});

describe("Gen7UltraBurst -- activate()", () => {
  it("given eligible Necrozma-Dusk-Mane, when activating, then types become [psychic, dragon]", () => {
    // Source: Bulbapedia "Necrozma" -- Ultra Necrozma is Psychic/Dragon type
    const zMove = new Gen7ZMove();
    const ultraBurst = new Gen7UltraBurst(zMove);
    const pokemon = createNecrozmaOnField({
      speciesId: SPECIES_IDS.necrozmaDuskMane,
      heldItem: ULTRANECROZIUM_Z,
    });
    const side = createSyntheticBattleSide(0);
    const state = createSyntheticBattleState();

    ultraBurst.activate(pokemon, side, state);

    expect(pokemon.types).toEqual([TYPE_IDS.psychic, TYPE_IDS.dragon]);
  });

  it("given eligible Necrozma-Dawn-Wings, when activating, then types become [psychic, dragon]", () => {
    // Source: Bulbapedia "Necrozma" -- Ultra Necrozma is Psychic/Dragon regardless of form
    const zMove = new Gen7ZMove();
    const ultraBurst = new Gen7UltraBurst(zMove);
    const pokemon = createNecrozmaOnField({
      speciesId: SPECIES_IDS.necrozmaDawnWings,
      heldItem: ULTRANECROZIUM_Z,
    });
    const side = createSyntheticBattleSide(0);
    const state = createSyntheticBattleState();

    ultraBurst.activate(pokemon, side, state);

    expect(pokemon.types).toEqual([TYPE_IDS.psychic, TYPE_IDS.dragon]);
  });

  it("given eligible Necrozma-Dusk-Mane, when activating, then ability becomes neuroforce", () => {
    // Source: Bulbapedia "Necrozma" -- Ultra Necrozma's ability is Neuroforce
    const zMove = new Gen7ZMove();
    const ultraBurst = new Gen7UltraBurst(zMove);
    const pokemon = createNecrozmaOnField({
      speciesId: SPECIES_IDS.necrozmaDuskMane,
      heldItem: ULTRANECROZIUM_Z,
    });
    const side = createSyntheticBattleSide(0);
    const state = createSyntheticBattleState();

    ultraBurst.activate(pokemon, side, state);

    expect(pokemon.ability).toBe(ABILITY_IDS.neuroforce);
  });

  it("given eligible Necrozma-Dusk-Mane at level 50, when activating, then stats match Ultra Necrozma values", () => {
    // Source: Bulbapedia "Necrozma" -- Ultra Necrozma base stats: 97/167/97/167/97/129
    // Using level 50, 31 IVs, 0 EVs, Hardy nature (no modifier)
    // Attack: floor((2 * 167 + 31 + 0) / 100 * 50) + 5 = floor(182.5) + 5 = 186
    // Defense: floor((2 * 97 + 31 + 0) / 100 * 50) + 5 = floor(112.5) + 5 = 117
    // SpAtk: floor((2 * 167 + 31 + 0) / 100 * 50) + 5 = 186 (same as attack)
    // SpDef: floor((2 * 97 + 31 + 0) / 100 * 50) + 5 = 117 (same as defense)
    // Speed: floor((2 * 129 + 31 + 0) / 100 * 50) + 5 = floor(144.5) + 5 = 149
    // Source: Bulbapedia "Stat" -- Gen III+ stat formula
    const zMove = new Gen7ZMove();
    const ultraBurst = new Gen7UltraBurst(zMove);
    const hardyNature = ALL_NATURES.find((n) => n.id === "hardy")!;
    const ivs = createIvs(); // 31 all
    const evs = createEvs(); // 0 all
    const level = 50;

    const expectedAttack = calculateStat(
      167,
      ivs.attack,
      evs.attack,
      level,
      getNatureModifier(hardyNature, "attack"),
    );
    const expectedDefense = calculateStat(
      97,
      ivs.defense,
      evs.defense,
      level,
      getNatureModifier(hardyNature, "defense"),
    );
    const expectedSpAttack = calculateStat(
      167,
      ivs.spAttack,
      evs.spAttack,
      level,
      getNatureModifier(hardyNature, "spAttack"),
    );
    const expectedSpDefense = calculateStat(
      97,
      ivs.spDefense,
      evs.spDefense,
      level,
      getNatureModifier(hardyNature, "spDefense"),
    );
    const expectedSpeed = calculateStat(
      129,
      ivs.speed,
      evs.speed,
      level,
      getNatureModifier(hardyNature, "speed"),
    );

    const pokemon = createNecrozmaOnField({
      speciesId: SPECIES_IDS.necrozmaDuskMane,
      heldItem: ULTRANECROZIUM_Z,
      level,
    });
    const side = createSyntheticBattleSide(0);
    const state = createSyntheticBattleState();

    const originalHp = pokemon.pokemon.calculatedStats!.hp;
    ultraBurst.activate(pokemon, side, state);

    expect(pokemon.pokemon.calculatedStats!.attack).toBe(expectedAttack);
    expect(pokemon.pokemon.calculatedStats!.defense).toBe(expectedDefense);
    expect(pokemon.pokemon.calculatedStats!.spAttack).toBe(expectedSpAttack);
    expect(pokemon.pokemon.calculatedStats!.spDefense).toBe(expectedSpDefense);
    expect(pokemon.pokemon.calculatedStats!.speed).toBe(expectedSpeed);
    // HP is not recalculated by Ultra Burst (same as Mega Evolution)
    expect(pokemon.pokemon.calculatedStats!.hp).toBe(originalHp);
  });

  it("given activated Ultra Necrozma, when checking canUse again on same side, then returns false", () => {
    // Source: Bulbapedia "Ultra Burst" -- one Ultra Burst per trainer per battle
    const zMove = new Gen7ZMove();
    const ultraBurst = new Gen7UltraBurst(zMove);
    const pokemon = createNecrozmaOnField({
      speciesId: SPECIES_IDS.necrozmaDuskMane,
      heldItem: ULTRANECROZIUM_Z,
    });
    const side = createSyntheticBattleSide(0);
    const state = createSyntheticBattleState();

    ultraBurst.activate(pokemon, side, state);

    // canUse should now be false (side already used Ultra Burst)
    expect(ultraBurst.canUse(pokemon, side, state)).toBe(false);
  });

  it("given Necrozma-Dusk-Mane activating Ultra Burst, when activating, then emits ultra-burst event", () => {
    // Source: BattleEvent.ts -- UltraBurstEvent shape
    const zMove = new Gen7ZMove();
    const ultraBurst = new Gen7UltraBurst(zMove);
    const pokemon = createNecrozmaOnField({
      speciesId: SPECIES_IDS.necrozmaDuskMane,
      heldItem: ULTRANECROZIUM_Z,
    });
    const side = createSyntheticBattleSide(0);
    const state = createSyntheticBattleState();

    const events = ultraBurst.activate(pokemon, side, state);

    expect(events).toHaveLength(1);
    expect(events[0].type).toBe("ultra-burst");
    expect((events[0] as any).side).toBe(0);
    expect((events[0] as any).pokemon).toBe("test-necrozma");
  });

  it("given Ultra Burst activates, when checking Z-Move usage, then Z-Move is marked as used", () => {
    // Source: Showdown sim/battle-actions.ts -- Ultra Burst consumes Ultranecrozium Z (Z-Move slot)
    const zMove = new Gen7ZMove();
    const ultraBurst = new Gen7UltraBurst(zMove);
    const pokemon = createNecrozmaOnField({
      speciesId: SPECIES_IDS.necrozmaDuskMane,
      heldItem: ULTRANECROZIUM_Z,
    });
    const side = createSyntheticBattleSide(0);
    const state = createSyntheticBattleState();

    expect(zMove.hasUsedZMove(0)).toBe(false);
    ultraBurst.activate(pokemon, side, state);
    expect(zMove.hasUsedZMove(0)).toBe(true);
  });
});

describe("Gen7UltraBurst -- modifyMove()", () => {
  it("given Ultra Necrozma with photon-geyser, when modifyMove, then becomes Light That Burns the Sky with 200 BP", () => {
    // Source: Pokémon Showdown data/moves.ts -- "light-that-burns-the-sky" basePower 200
    // Source: Bulbapedia "Light That Burns the Sky" -- 200 BP
    const zMove = new Gen7ZMove();
    const ultraBurst = new Gen7UltraBurst(zMove);
    const pokemon = createNecrozmaOnField({
      speciesId: SPECIES_IDS.necrozmaDuskMane,
      heldItem: ULTRANECROZIUM_Z,
      isUltraBurst: true,
    });
    const photonGeyser = DATA_MANAGER.getMove(PHOTON_GEYSER_MOVE);

    const modified = ultraBurst.modifyMove(photonGeyser, pokemon);

    expect(modified.id).toBe("light-that-burns-the-sky");
    expect(modified.power).toBe(200);
    expect(modified.accuracy).toBeNull();
    expect(modified.type).toBe(TYPE_IDS.psychic);
  });

  it("given Ultra Necrozma with non-photon-geyser, when modifyMove, then move is unchanged", () => {
    // Source: Showdown data/items.ts -- ultranecroziumz only upgrades photon-geyser
    const zMove = new Gen7ZMove();
    const ultraBurst = new Gen7UltraBurst(zMove);
    const pokemon = createNecrozmaOnField({
      speciesId: SPECIES_IDS.necrozmaDuskMane,
      heldItem: ULTRANECROZIUM_Z,
      isUltraBurst: true,
    });
    const tackle = DATA_MANAGER.getMove("tackle");

    const modified = ultraBurst.modifyMove(tackle, pokemon);

    expect(modified.id).toBe(tackle.id);
    expect(modified.power).toBe(tackle.power);
  });

  it("given Pokemon that has NOT Ultra Bursted with photon-geyser, when modifyMove, then move is unchanged", () => {
    // Ultra Burst must have activated before modifyMove converts the move
    const zMove = new Gen7ZMove();
    const ultraBurst = new Gen7UltraBurst(zMove);
    const pokemon = createNecrozmaOnField({
      speciesId: SPECIES_IDS.necrozmaDuskMane,
      heldItem: ULTRANECROZIUM_Z,
      isUltraBurst: false,
    });
    const photonGeyser = DATA_MANAGER.getMove(PHOTON_GEYSER_MOVE);

    const modified = ultraBurst.modifyMove(photonGeyser, pokemon);

    expect(modified.id).toBe(photonGeyser.id);
  });
});

describe("Gen7UltraBurst -- state serialization", () => {
  it("given Ultra Burst used on side 0, when serializing and restoring, then canUse still returns false", () => {
    // State serialization ensures deterministic replay of battles
    const zMove = new Gen7ZMove();
    const ultraBurst = new Gen7UltraBurst(zMove);
    const pokemon = createNecrozmaOnField({
      speciesId: SPECIES_IDS.necrozmaDuskMane,
      heldItem: ULTRANECROZIUM_Z,
    });
    const side = createSyntheticBattleSide(0);
    const state = createSyntheticBattleState();

    ultraBurst.activate(pokemon, side, state);

    const serialized = ultraBurst.serializeState();

    // Create fresh instance and restore state
    const zMove2 = new Gen7ZMove();
    const ultraBurst2 = new Gen7UltraBurst(zMove2);
    ultraBurst2.restoreState(serialized);

    const pokemon2 = createNecrozmaOnField({
      speciesId: SPECIES_IDS.necrozmaDuskMane,
      heldItem: ULTRANECROZIUM_Z,
    });
    expect(ultraBurst2.canUse(pokemon2, side, state)).toBe(false);
  });

  it("given no Ultra Burst used, when calling reset, then side 0 can Ultra Burst again", () => {
    // reset() is called at battle start to clear tracking
    const zMove = new Gen7ZMove();
    const ultraBurst = new Gen7UltraBurst(zMove);
    const pokemon = createNecrozmaOnField({
      speciesId: SPECIES_IDS.necrozmaDuskMane,
      heldItem: ULTRANECROZIUM_Z,
    });
    const side = createSyntheticBattleSide(0);
    const state = createSyntheticBattleState();

    ultraBurst.activate(pokemon, side, state);
    expect(ultraBurst.hasUsedUltraBurst(0)).toBe(true);

    // Reset a new instance (simulating a new battle)
    const zMove2 = new Gen7ZMove();
    const ultraBurst2 = new Gen7UltraBurst(zMove2);
    ultraBurst2.reset();
    expect(ultraBurst2.hasUsedUltraBurst(0)).toBe(false);
  });
});

describe("Gen7DamageCalc -- Neuroforce ability", () => {
  it("given Neuroforce ability + super-effective hit, when calculating damage, then 1.25x modifier applied", () => {
    // Source: Showdown data/abilities.ts -- neuroforce: onSourceModifyDamage chainModify([5120, 4096])
    // Source: Bulbapedia "Neuroforce" -- "increases super-effective moves by 25%"
    // Test: Ultra Necrozma (Psychic/Dragon) with Neuroforce attacks Blissey (Normal) with Psychic
    // Psychic is super-effective against... Poison and Fighting. Use Psychic vs Poison type.
    const attacker = createSyntheticOnFieldPokemon({
      types: [TYPE_IDS.psychic, TYPE_IDS.dragon],
      ability: ABILITY_IDS.neuroforce,
      spAttack: 200,
      isUltraBurst: true,
    });
    const defender = createSyntheticOnFieldPokemon({
      types: [TYPE_IDS.poison],
      ability: ABILITY_IDS.none,
      spDefense: 100,
    });

    const move = createSyntheticDamageMove({
      id: "psychic",
      type: TYPE_IDS.psychic,
      power: 90,
      category: CORE_MOVE_CATEGORIES.special,
    });

    const context = {
      attacker,
      defender,
      move,
      state: { weather: null, terrain: null, sides: [] } as any,
      isCrit: false,
      rng: new SeededRandom(42),
    };

    const withNeuroforce = calculateGen7Damage(context, GEN7_TYPE_CHART);

    // Now calculate without Neuroforce to compare (same calculation with different ability)
    const attackerNoNeuroforce = createSyntheticOnFieldPokemon({
      types: [TYPE_IDS.psychic, TYPE_IDS.dragon],
      ability: ABILITY_IDS.none,
      spAttack: 200,
    });
    const contextNoNeuroforce = {
      attacker: attackerNoNeuroforce,
      defender,
      move,
      state: { weather: null, terrain: null, sides: [] } as any,
      isCrit: false,
      rng: new SeededRandom(42),
    };
    const withoutNeuroforce = calculateGen7Damage(contextNoNeuroforce, GEN7_TYPE_CHART);

    // Neuroforce gives 1.25x (5120/4096) on super-effective hits
    // pokeRound(x, 5120) = floor(x * 5120 / 4096 + 0.5) = floor(x * 1.25 + 0.5)
    // The ratio should be approximately 1.25
    expect(withNeuroforce.damage).toBeGreaterThan(withoutNeuroforce.damage);
    // Verify the exact 1.25x boost by computing the ratio
    const ratio = withNeuroforce.damage / withoutNeuroforce.damage;
    expect(ratio).toBeCloseTo(1.25, 1);
  });

  it("given Neuroforce ability + neutral hit, when calculating damage, then no Neuroforce modifier", () => {
    // Source: Showdown data/abilities.ts -- Neuroforce only triggers on super-effective hits
    const attacker = createSyntheticOnFieldPokemon({
      types: [TYPE_IDS.psychic, TYPE_IDS.dragon],
      ability: ABILITY_IDS.neuroforce,
      spAttack: 200,
    });
    const defender = createSyntheticOnFieldPokemon({
      types: [TYPE_IDS.normal],
      ability: ABILITY_IDS.none,
      spDefense: 100,
    });

    const move = createSyntheticDamageMove({
      id: "psychic",
      type: TYPE_IDS.psychic,
      power: 90,
      category: CORE_MOVE_CATEGORIES.special,
    });

    const context = {
      attacker,
      defender,
      move,
      state: { weather: null, terrain: null, sides: [] } as any,
      isCrit: false,
      rng: new SeededRandom(42),
    };

    const withNeuroforce = calculateGen7Damage(context, GEN7_TYPE_CHART);

    // Compare against a non-Neuroforce attacker with the same stats
    const attackerNoNeuroforce = createSyntheticOnFieldPokemon({
      types: [TYPE_IDS.psychic, TYPE_IDS.dragon],
      ability: ABILITY_IDS.none,
      spAttack: 200,
    });
    const contextNoNeuroforce = {
      attacker: attackerNoNeuroforce,
      defender,
      move,
      state: { weather: null, terrain: null, sides: [] } as any,
      isCrit: false,
      rng: new SeededRandom(42),
    };
    const withoutNeuroforce = calculateGen7Damage(contextNoNeuroforce, GEN7_TYPE_CHART);

    // Neutral hit: no Neuroforce boost; damage should be identical
    expect(withNeuroforce.damage).toBe(withoutNeuroforce.damage);
  });
});

describe("Gen7Ruleset -- getBattleGimmick", () => {
  it("given getBattleGimmick('ultraburst'), then returns a Gen7UltraBurst instance", () => {
    // Verifies the ruleset properly exposes Ultra Burst to the engine
    const ruleset = new Gen7Ruleset(DATA_MANAGER);
    const gimmick = ruleset.getBattleGimmick(BATTLE_GIMMICK_IDS.ultraBurst as any);

    expect(gimmick).not.toBeNull();
    expect(gimmick).toBeInstanceOf(Gen7UltraBurst);
  });

  it("given getBattleGimmick('zmove'), then still returns a Z-Move instance (coexistence)", () => {
    // Z-Moves and Ultra Burst coexist in Gen 7
    const ruleset = new Gen7Ruleset(DATA_MANAGER);
    const gimmick = ruleset.getBattleGimmick(BATTLE_GIMMICK_IDS.zMove as any);

    expect(gimmick).not.toBeNull();
  });
});
