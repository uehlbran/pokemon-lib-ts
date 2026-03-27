import type {
  AbilityContext,
  ActivePokemon,
  BattleSide,
  BattleState,
} from "@pokemon-lib-ts/battle";
import { BATTLE_ABILITY_EFFECT_TYPES } from "@pokemon-lib-ts/battle";
import type {
  EntryHazardType,
  MoveData,
  PokemonInstance,
  PokemonType,
  VolatileStatus,
} from "@pokemon-lib-ts/core";
import {
  type AbilityTrigger,
  CORE_ABILITY_IDS,
  CORE_ABILITY_SLOTS,
  CORE_ABILITY_TRIGGER_IDS,
  CORE_GENDERS,
  CORE_HAZARD_IDS,
  CORE_ITEM_IDS,
  CORE_MOVE_IDS,
  CORE_STAT_IDS,
  CORE_STATUS_IDS,
  CORE_TERRAIN_IDS,
  CORE_TYPE_IDS,
  CORE_VOLATILE_IDS,
  createEvs,
  createIvs,
  createMoveSlot,
} from "@pokemon-lib-ts/core";
import { describe, expect, it } from "vitest";
import {
  createGen8DataManager,
  GEN8_ABILITY_IDS,
  GEN8_ITEM_IDS,
  GEN8_MOVE_IDS,
  GEN8_NATURE_IDS,
  GEN8_SPECIES_IDS,
  getMaxMoveName,
} from "../../src";
import { handleGen8StatAbility } from "../../src/Gen8AbilitiesStat";
import {
  getGulpMissileResult,
  handleGen8SwitchAbility,
  shouldHungerSwitchToggle,
} from "../../src/Gen8AbilitiesSwitch";
import { DYNAMAX_TURNS, Gen8Dynamax, getUndynamaxedHp } from "../../src/Gen8Dynamax";
import {
  applyGen8EntryHazards,
  applyGen8ToxicSpikes,
  hasHeavyDutyBoots,
} from "../../src/Gen8EntryHazards";
import { getGMaxMoveDisplayName, getGMaxMoveId } from "../../src/Gen8GMaxMoves";
import { GEN8_TYPE_CHART } from "../../src/Gen8TypeChart";

/**
 * Gen 8 Wave 9 integration tests.
 *
 * Covers:
 *   1. Dynamax 3-turn lifecycle + G-Max move conversion
 *   2. Entry hazard edge cases (non-grounded Toxic Spikes, Misty Terrain blocks)
 *   3. Gen8AbilitiesSwitch: handleTurnEnd/Hunger Switch, handleGulpMissileOnHit via dispatch
 *   4. Gen8AbilitiesStat: formatStatName coverage via Beast Boost messages
 *   5. Gen8Dynamax edge case: getUndynamaxedHp(0)
 *   6. Heavy-Duty Boots blocking all hazards (combined scenario)
 */

// ---------------------------------------------------------------------------
// Test Helpers
// ---------------------------------------------------------------------------

const DATA_MANAGER = createGen8DataManager();
const ABILITIES = { ...CORE_ABILITY_IDS, ...GEN8_ABILITY_IDS } as const;
const ITEMS = { ...CORE_ITEM_IDS, ...GEN8_ITEM_IDS } as const;
const MOVES = { ...CORE_MOVE_IDS, ...GEN8_MOVE_IDS } as const;
const SPECIES = GEN8_SPECIES_IDS;
const TYPES = CORE_TYPE_IDS;
const STATUS = CORE_STATUS_IDS;
const TERRAIN = CORE_TERRAIN_IDS;
const TRIGGERS = CORE_ABILITY_TRIGGER_IDS;
const VOLATILES = CORE_VOLATILE_IDS;
const HAZARDS = CORE_HAZARD_IDS;
const DEFAULT_SPECIES = DATA_MANAGER.getSpecies(SPECIES.bulbasaur);
const DEFAULT_NATURE = DATA_MANAGER.getNature(GEN8_NATURE_IDS.hardy).id;

const GULP_MISSILE_GULPING = VOLATILES.gulpMissileGulping;
const GULP_MISSILE_GORGING = VOLATILES.gulpMissileGorging;
const GULPING_FORM = "gulping" as const;
const GORGING_FORM = "gorging" as const;
const GMAX_STEELSURGE_HAZARD = HAZARDS.gmaxSteelsurge;

let nextTestUid = 0;
function createTestUid() {
  return `test-${nextTestUid++}`;
}

function createPokemonInstance(overrides: {
  speciesId?: (typeof GEN8_SPECIES_IDS)[keyof typeof GEN8_SPECIES_IDS];
  nickname?: string | null;
  ability?: PokemonInstance["ability"];
  heldItem?: PokemonInstance["heldItem"];
  currentHp?: number;
  maxHp?: number;
  status?: PokemonInstance["status"];
  dynamaxLevel?: number;
}): PokemonInstance {
  const maxHp = overrides.maxHp ?? 200;
  const species = DATA_MANAGER.getSpecies(overrides.speciesId ?? DEFAULT_SPECIES.id);
  return {
    uid: createTestUid(),
    speciesId: species.id,
    nickname: overrides.nickname ?? null,
    level: 50,
    experience: 0,
    nature: DEFAULT_NATURE,
    ivs: createIvs(),
    evs: createEvs(),
    currentHp: overrides.currentHp ?? maxHp,
    moves: [createMoveSlot(MOVES.tackle)],
    ability: overrides.ability ?? ABILITIES.none,
    abilitySlot: CORE_ABILITY_SLOTS.normal1,
    heldItem: overrides.heldItem ?? null,
    status: (overrides.status as PokemonInstance["status"]) ?? null,
    friendship: 0,
    gender: CORE_GENDERS.male,
    isShiny: false,
    metLocation: "",
    metLevel: 1,
    originalTrainer: "",
    originalTrainerId: 0,
    pokeball: CORE_ITEM_IDS.pokeBall,
    calculatedStats: {
      hp: maxHp,
      attack: 120,
      defense: 100,
      spAttack: 90,
      spDefense: 100,
      speed: 110,
    },
    dynamaxLevel: overrides.dynamaxLevel ?? 10,
  } as PokemonInstance;
}

function createOnFieldPokemon(overrides: {
  ability?: PokemonInstance["ability"];
  types?: PokemonType[];
  nickname?: string | null;
  currentHp?: number;
  maxHp?: number;
  speciesId?: number;
  status?: PokemonInstance["status"];
  heldItem?: PokemonInstance["heldItem"];
  substituteHp?: number;
  volatiles?: Map<VolatileStatus, { turnsLeft: number }>;
  dynamaxLevel?: number;
  isDynamaxed?: boolean;
  dynamaxTurnsLeft?: number;
  transformedSpecies?: { name: string; gigantamaxForm?: unknown; canDynamax?: boolean } | null;
  turnsOnField?: number;
}): ActivePokemon {
  return {
    pokemon: createPokemonInstance({
      ability: overrides.ability,
      nickname: overrides.nickname,
      currentHp: overrides.currentHp,
      maxHp: overrides.maxHp,
      speciesId: overrides.speciesId,
      status: overrides.status,
      heldItem: overrides.heldItem,
      dynamaxLevel: overrides.dynamaxLevel,
    }),
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
    volatileStatuses:
      (overrides.volatiles as Map<VolatileStatus, { turnsLeft: number }>) ?? new Map(),
    types: overrides.types ?? [TYPES.normal],
    ability: overrides.ability ?? ABILITIES.none,
    suppressedAbility: null,
    lastMoveUsed: null,
    lastDamageTaken: 0,
    lastDamageType: null,
    lastDamageCategory: null,
    turnsOnField: overrides.turnsOnField ?? 0,
    movedThisTurn: false,
    consecutiveProtects: 0,
    substituteHp: overrides.substituteHp ?? 0,
    itemKnockedOff: false,
    transformed: false,
    transformedSpecies: overrides.transformedSpecies ?? null,
    isMega: false,
    isDynamaxed: overrides.isDynamaxed ?? false,
    dynamaxTurnsLeft: overrides.dynamaxTurnsLeft ?? 0,
    isTerastallized: false,
    teraType: null,
    forcedMove: null,
  } as ActivePokemon;
}

function createBattleSide(
  hazards: Array<{ type: EntryHazardType; layers: number }> = [],
  index: 0 | 1 = 0,
): BattleSide {
  return {
    index,
    trainer: null,
    team: [],
    active: [],
    hazards,
    screens: [],
    tailwind: { active: false, turnsLeft: 0 },
    luckyChant: { active: false, turnsLeft: 0 },
    wish: null,
    futureAttack: null,
    faintCount: 0,
    gimmickUsed: false,
  } as unknown as BattleSide;
}

function createBattleState(opts?: {
  gravityActive?: boolean;
  terrainType?: (typeof TERRAIN)[keyof typeof TERRAIN] | null;
}): BattleState {
  return {
    phase: "turn-end",
    generation: 8,
    format: "singles",
    turnNumber: 1,
    sides: [createBattleSide(), createBattleSide([], 1)],
    weather: null,
    terrain: opts?.terrainType ? { type: opts.terrainType, turnsLeft: 5 } : null,
    trickRoom: { active: false, turnsLeft: 0 },
    magicRoom: { active: false, turnsLeft: 0 },
    wonderRoom: { active: false, turnsLeft: 0 },
    gravity: {
      active: opts?.gravityActive ?? false,
      turnsLeft: opts?.gravityActive ? 5 : 0,
    },
    turnHistory: [],
    rng: {
      next: () => 0,
      int: () => 1,
      chance: () => false,
      pick: <T>(arr: readonly T[]) => arr[0] as T,
      shuffle: <T>(arr: T[]) => arr,
      getState: () => 0,
      setState: () => {},
    },
    ended: false,
    winner: null,
  } as unknown as BattleState;
}

function createMove(
  id: MoveData["id"],
  opts: {
    category?: "physical" | "special" | "status";
    power?: number | null;
    flags?: Record<string, boolean>;
  } = {},
): MoveData {
  const move = DATA_MANAGER.getMove(id);
  return {
    ...move,
    category: opts.category ?? move.category,
    power: opts.power !== undefined ? opts.power : move.power,
    flags: opts.flags ?? { contact: true },
    effectChance: null,
    secondaryEffects: [],
  } as unknown as MoveData;
}

function createAbilityContext(opts: {
  ability: PokemonInstance["ability"];
  trigger: AbilityTrigger;
  types?: PokemonType[];
  opponent?: ActivePokemon;
  move?: MoveData;
  nickname?: string;
  speciesId?: number;
  status?: string | null;
  currentHp?: number;
  maxHp?: number;
  volatiles?: Map<string, { turnsLeft: number }>;
  turnsOnField?: number;
}): AbilityContext {
  const state = createBattleState();
  const pokemon = createOnFieldPokemon({
    ability: opts.ability,
    types: opts.types,
    nickname: opts.nickname,
    speciesId: opts.speciesId,
    status: opts.status,
    currentHp: opts.currentHp,
    maxHp: opts.maxHp,
    volatiles: opts.volatiles,
    turnsOnField: opts.turnsOnField,
  });

  return {
    pokemon,
    opponent: opts.opponent,
    state,
    rng: state.rng as any,
    trigger: opts.trigger,
    move: opts.move,
  };
}

// ---------------------------------------------------------------------------
// 1. Dynamax 3-Turn Lifecycle + G-Max Move Conversion
// ---------------------------------------------------------------------------

describe("Dynamax 3-turn lifecycle integration", () => {
  it("given a normal Pokemon, when activating Dynamax then simulating 3 turns and reverting, then HP is proportionally restored", () => {
    // Source: Showdown data/conditions.ts -- Dynamax lasts 3 turns, HP scales on activate/revert
    // Source: Bulbapedia "Dynamax" -- "Dynamax lasts for three turns"
    const gimmick = new Gen8Dynamax();
    const pokemon = createOnFieldPokemon({ maxHp: 300, currentHp: 300, dynamaxLevel: 10 });
    const side = createBattleSide();
    const state = createBattleState();
    state.sides[0].active = [pokemon]; // revert() needs to find pokemon in active slot

    // Step 1: Verify canUse
    expect(gimmick.canUse(pokemon, side, state)).toBe(true);

    // Step 2: Activate -- HP should double (dynamaxLevel=10 -> 2.0x)
    // Source: Showdown data/conditions.ts line 771 -- dynamaxLevel 10: ratio = 2.0
    const activateEvents = gimmick.activate(pokemon, side, state);
    expect(activateEvents).toEqual([
      {
        type: "dynamax",
        side: 0,
        pokemon: pokemon.pokemon.uid,
      },
    ]);
    expect(pokemon.isDynamaxed).toBe(true);
    expect(pokemon.dynamaxTurnsLeft).toBe(DYNAMAX_TURNS);
    expect(pokemon.pokemon.calculatedStats!.hp).toBe(600);
    expect(pokemon.pokemon.currentHp).toBe(600);

    // Step 3: Cannot use again on the same side
    expect(gimmick.canUse(pokemon, side, state)).toBe(false);
    expect(side.gimmickUsed).toBe(true);

    // Step 4: Simulate taking 200 damage over 3 turns
    pokemon.pokemon.currentHp = 400;

    // Step 5: Simulate turn countdown (3 -> 2 -> 1 -> 0)
    pokemon.dynamaxTurnsLeft = 0; // Expired

    // Step 6: Revert -- HP should be proportionally restored
    // Source: Showdown data/conditions.ts lines 801-802 -- proportional HP restoration
    // round(400 * 300 / 600) = round(200) = 200
    const revertEvents = gimmick.revert(pokemon, state);
    expect(revertEvents).toEqual([
      {
        type: "dynamax-end",
        side: 0,
        pokemon: pokemon.pokemon.uid,
      },
    ]);
    expect(pokemon.isDynamaxed).toBe(false);
    expect(pokemon.dynamaxTurnsLeft).toBe(0);
    expect(pokemon.pokemon.calculatedStats!.hp).toBe(300);
    expect(pokemon.pokemon.currentHp).toBe(200);
  });

  it("given a Pokemon with dynamaxLevel=5 and partial HP, when going through full lifecycle, then HP calculations are correct", () => {
    // Source: Showdown data/conditions.ts line 771 -- dynamaxLevel 5: ratio = 1.75
    const gimmick = new Gen8Dynamax();
    const pokemon = createOnFieldPokemon({ maxHp: 200, currentHp: 150, dynamaxLevel: 5 });
    const side = createBattleSide();
    const state = createBattleState();
    state.sides[0].active = [pokemon]; // revert() needs to find pokemon in active slot

    gimmick.activate(pokemon, side, state);

    // Inline derivation: maxHp = floor(200 * 1.75) = 350, currentHp = floor(150 * 1.75) = 262
    expect(pokemon.pokemon.calculatedStats!.hp).toBe(350);
    expect(pokemon.pokemon.currentHp).toBe(262);

    // Take some damage
    pokemon.pokemon.currentHp = 175;

    // Revert: baseMaxHp = round(350 / 1.75) = round(200) = 200
    // restoredHp = round(175 * 200 / 350) = round(100) = 100
    gimmick.revert(pokemon, state);
    expect(pokemon.pokemon.calculatedStats!.hp).toBe(200);
    expect(pokemon.pokemon.currentHp).toBe(100);
  });

  it("given a Gigantamax Charizard with a fire move, when Dynamaxed and modifyMove called, then returns G-Max Wildfire", () => {
    // Source: Showdown data/moves.ts -- gmaxwildfire: Charizard, fire type
    // Source: Bulbapedia "G-Max Wildfire" -- Gigantamax Charizard's exclusive G-Max Move
    const gimmick = new Gen8Dynamax();
    const pokemon = createOnFieldPokemon({
      isDynamaxed: true,
      speciesId: SPECIES.charizard,
      transformedSpecies: {
        name: DATA_MANAGER.getSpecies(SPECIES.charizard).displayName,
        gigantamaxForm: true,
      },
    });

    const fireMove = createMove(MOVES.flamethrower);
    const result = gimmick.modifyMove(fireMove, pokemon);

    // G-Max Wildfire should be selected because Charizard has gigantamaxForm and fire type matches
    const charizardName = DATA_MANAGER.getSpecies(SPECIES.charizard).displayName;
    const gmaxMoveId = getGMaxMoveId(charizardName);
    expect(gmaxMoveId).not.toBeNull();
    expect(result.id).toBe(gmaxMoveId);
    expect(result.displayName).toBe(getGMaxMoveDisplayName(gmaxMoveId!));
    expect(result.accuracy).toBeNull();
  });

  it("given a Gigantamax Charizard with a flying move, when Dynamaxed and modifyMove called, then returns standard Max Airstream (type mismatch)", () => {
    // Source: Showdown sim/battle-actions.ts -- G-Max only if move type matches gmaxMove.moveType
    // Charizard's G-Max Move is fire-type; flying moves become standard Max Airstream
    const gimmick = new Gen8Dynamax();
    const pokemon = createOnFieldPokemon({
      isDynamaxed: true,
      speciesId: SPECIES.charizard,
      transformedSpecies: {
        name: DATA_MANAGER.getSpecies(SPECIES.charizard).displayName,
        gigantamaxForm: true,
      },
    });

    const flyingMove = createMove(MOVES.airSlash);
    const result = gimmick.modifyMove(flyingMove, pokemon);

    // Should be standard Max Airstream, not G-Max
    expect(result.id).toBe(`max-${TYPES.flying}`);
    expect(result.displayName).toBe(getMaxMoveName(TYPES.flying, false));
    expect(result.accuracy).toBeNull();
  });

  it("given a Gigantamax Rillaboom with a grass move, when Dynamaxed and modifyMove called, then returns G-Max Drum Solo with basePower 160", () => {
    // Source: Showdown data/moves.ts -- gmaxdrumsolo: Rillaboom, grass, basePower 160
    // Source: Bulbapedia "G-Max Drum Solo" -- overridden base power of 160
    const gimmick = new Gen8Dynamax();
    const pokemon = createOnFieldPokemon({
      isDynamaxed: true,
      speciesId: SPECIES.rillaboom,
      transformedSpecies: {
        name: DATA_MANAGER.getSpecies(SPECIES.rillaboom).displayName,
        gigantamaxForm: true,
      },
    });

    const grassMove = createMove(MOVES.grassyGlide);
    const result = gimmick.modifyMove(grassMove, pokemon);

    const rillaboomName = DATA_MANAGER.getSpecies(SPECIES.rillaboom).displayName;
    const gmaxMoveId = getGMaxMoveId(rillaboomName);
    expect(gmaxMoveId).not.toBeNull();
    expect(result.id).toBe(gmaxMoveId);
    expect(result.displayName).toBe(getGMaxMoveDisplayName(gmaxMoveId!));
    // G-Max Drum Solo has basePower override of 160
    expect(result.power).toBe(160);
    expect(result.accuracy).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// 2. Entry Hazard Edge Cases
// ---------------------------------------------------------------------------

describe("Entry hazard edge cases", () => {
  describe("Non-grounded Toxic Spikes immunity", () => {
    it("given Toxic Spikes with 1 layer and a Levitate Pokemon, when applying, then no status and not absorbed", () => {
      // Source: Showdown data/conditions.ts -- toxicspikes: grounded check
      // Source: Bulbapedia "Toxic Spikes" -- "does not affect non-grounded Pokemon"
      const mon = createOnFieldPokemon({
        types: [TYPES.normal],
        ability: ABILITIES.levitate,
        maxHp: 200,
      });
      const result = applyGen8ToxicSpikes(mon, 1, false);
      expect(result.status).toBeNull();
      expect(result.absorbed).toBe(false);
      expect(result.message).toBeNull();
    });

    it("given Toxic Spikes with 2 layers and Air Balloon holder, when applying, then no status and not absorbed", () => {
      // Source: Showdown data/items.ts -- airballoon: grants non-grounded
      // Source: Bulbapedia "Air Balloon" -- "makes the holder immune to Ground-type moves"
      const mon = createOnFieldPokemon({
        types: [TYPES.normal],
        heldItem: ITEMS.airBalloon,
        maxHp: 200,
      });
      const result = applyGen8ToxicSpikes(mon, 2, false);
      expect(result.status).toBeNull();
      expect(result.absorbed).toBe(false);
    });

    it("given Toxic Spikes with Gravity active and a Flying-type, when applying, then status IS inflicted (Gravity grounds)", () => {
      // Source: Bulbapedia "Gravity" -- grounds all Flying-types
      // Source: Showdown data/conditions.ts -- toxicspikes: isGrounded check
      const mon = createOnFieldPokemon({
        types: [TYPES.flying, TYPES.normal],
        maxHp: 200,
      });
      const result = applyGen8ToxicSpikes(mon, 1, true);
      expect(result.status).toBe(STATUS.poison);
      expect(result.absorbed).toBe(false);
    });
  });

  describe("Misty Terrain blocks Toxic Spikes status", () => {
    it("given Misty Terrain active and Toxic Spikes with 1 layer, when grounded non-Poison Pokemon switches in, then status is suppressed", () => {
      // Source: Showdown data/conditions.ts -- mistyterrain.onSetStatus blocks all status on grounded
      // Source: Bulbapedia "Misty Terrain" -- "prevents grounded Pokemon from being afflicted by status"
      const mon = createOnFieldPokemon({
        types: [TYPES.normal],
        maxHp: 200,
      });
      const side = createBattleSide([{ type: MOVES.toxicSpikes, layers: 1 }]);
      const state = createBattleState({ terrainType: TERRAIN.misty });

      const result = applyGen8EntryHazards(mon, side, state, GEN8_TYPE_CHART);
      expect(result.statusInflicted).toBeNull();
      expect(result.messages).toEqual([]);
    });

    it("given Misty Terrain active and Toxic Spikes with 2 layers, when grounded non-Poison Pokemon switches in, then badly-poisoned is suppressed", () => {
      // Source: Showdown data/conditions.ts -- mistyterrain blocks ALL status, including toxic
      const mon = createOnFieldPokemon({
        types: [TYPES.normal],
        maxHp: 200,
      });
      const side = createBattleSide([{ type: MOVES.toxicSpikes, layers: 2 }]);
      const state = createBattleState({ terrainType: TERRAIN.misty });

      const result = applyGen8EntryHazards(mon, side, state, GEN8_TYPE_CHART);
      expect(result.statusInflicted).toBe(null);
      expect(result.messages).toEqual([]);
    });

    it("given Misty Terrain active and Toxic Spikes, when grounded Poison-type switches in, then hazard is still absorbed (absorption message emitted)", () => {
      // Source: Showdown data/moves.ts -- toxicspikes: Poison-type absorption happens before status
      // Poison-type absorption is separate from status infliction; terrain doesn't block absorption
      const mon = createOnFieldPokemon({
        types: [TYPES.poison],
        maxHp: 200,
      });
      const side = createBattleSide([{ type: MOVES.toxicSpikes, layers: 1 }]);
      const state = createBattleState({ terrainType: TERRAIN.misty });

      const result = applyGen8EntryHazards(mon, side, state, GEN8_TYPE_CHART);
      // Poison-type absorbs regardless of terrain
      expect(result.hazardsToRemove).toEqual([MOVES.toxicSpikes]);
      expect(result.messages).toEqual([`${mon.pokemon.speciesId} absorbed the poison spikes!`]);
    });
  });
});

// ---------------------------------------------------------------------------
// 3. Gen8AbilitiesSwitch: handleTurnEnd (Hunger Switch) via dispatch
// ---------------------------------------------------------------------------

describe("Gen8AbilitiesSwitch handleTurnEnd dispatch", () => {
  it("given Morpeko (877) with hunger-switch, when on-turn-end triggers via handleGen8SwitchAbility, then activated is true with transform message", () => {
    // Source: Showdown data/abilities.ts -- Hunger Switch: Morpeko toggles form each turn
    // Source: Bulbapedia "Hunger Switch" -- Morpeko (species 877)
    const ctx = createAbilityContext({
      ability: ABILITIES.hungerSwitch,
      trigger: TRIGGERS.onTurnEnd,
      speciesId: SPECIES.morpeko,
      nickname: "Morpeko",
    });

    const result = handleGen8SwitchAbility(TRIGGERS.onTurnEnd as any, ctx);
    expect(result.activated).toBe(true);
    expect(result.messages).toEqual(["Morpeko transformed!"]);
  });

  it("given non-Morpeko (25) with hunger-switch, when on-turn-end triggers via handleGen8SwitchAbility, then not activated", () => {
    // Source: Showdown data/abilities.ts -- Hunger Switch only applies to Morpeko
    const ctx = createAbilityContext({
      ability: ABILITIES.hungerSwitch,
      trigger: TRIGGERS.onTurnEnd,
      speciesId: SPECIES.pikachu,
      nickname: "Pikachu",
    });

    const result = handleGen8SwitchAbility(TRIGGERS.onTurnEnd as any, ctx);
    expect(result.activated).toBe(false);
  });

  it("given Morpeko with a different ability, when on-turn-end triggers, then not activated", () => {
    // Source: Showdown data/abilities.ts -- only hunger-switch triggers toggle
    const ctx = createAbilityContext({
      ability: ABILITIES.static,
      trigger: TRIGGERS.onTurnEnd,
      speciesId: SPECIES.morpeko,
    });

    const result = handleGen8SwitchAbility(TRIGGERS.onTurnEnd as any, ctx);
    expect(result.activated).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// 3b. Gen8AbilitiesSwitch: Gulp Missile on-contact via dispatch
// ---------------------------------------------------------------------------

describe("Gen8AbilitiesSwitch Gulp Missile on-contact dispatch", () => {
  it("given Cramorant (845) with gulp-missile and gulp-missile-gulping volatile, when hit on contact, then returns chip damage and defense drop", () => {
    // Source: Showdown data/abilities.ts -- Gulp Missile onDamagingHit: Gulping form
    // Source: Bulbapedia "Gulp Missile" -- Arrokuda form: 1/4 max HP damage + Defense -1
    const volatiles = new Map<string, { turnsLeft: number }>();
    volatiles.set(GULP_MISSILE_GULPING as VolatileStatus, { turnsLeft: -1 });

    const opponent = createOnFieldPokemon({ maxHp: 200, currentHp: 200 });
    const ctx = createAbilityContext({
      ability: ABILITIES.gulpMissile,
      trigger: TRIGGERS.onContact,
      speciesId: SPECIES.cramorant,
      nickname: "Cramorant",
      opponent,
      volatiles,
      move: createMove(MOVES.waterfall),
    });

    const result = handleGen8SwitchAbility(TRIGGERS.onContact as any, ctx);
    expect(result.activated).toBe(true);
    expect(result.messages).toEqual(["Cramorant spat out its catch!"]);

    // Should have chip-damage effect: floor(200 / 4) = 50
    // Source: Showdown data/abilities.ts -- Gulp Missile: 1/4 max HP
    const chipEffect = result.effects.find(
      (e) => e.effectType === BATTLE_ABILITY_EFFECT_TYPES.chipDamage,
    );
    expect(chipEffect).toBeDefined();
    expect((chipEffect as any).value).toBe(50);

    // Should have defense drop
    const statEffect = result.effects.find(
      (e) =>
        e.effectType === BATTLE_ABILITY_EFFECT_TYPES.statChange &&
        (e as any).stat === CORE_STAT_IDS.defense,
    );
    expect(statEffect).toBeDefined();
    expect((statEffect as any).stages).toBe(-1);
  });

  it("given Cramorant (845) with gulp-missile and gulp-missile-gorging volatile, when hit on contact and opponent has no status, then returns chip damage and paralysis", () => {
    // Source: Showdown data/abilities.ts -- Gulp Missile onDamagingHit: Gorging form
    // Source: Bulbapedia "Gulp Missile" -- Pikachu form: 1/4 max HP damage + paralysis
    const volatiles = new Map<string, { turnsLeft: number }>();
    volatiles.set(GULP_MISSILE_GORGING as VolatileStatus, { turnsLeft: -1 });

    const opponent = createOnFieldPokemon({ maxHp: 160, currentHp: 160 });
    const ctx = createAbilityContext({
      ability: ABILITIES.gulpMissile,
      trigger: TRIGGERS.onContact,
      speciesId: SPECIES.cramorant,
      nickname: "Cramorant",
      opponent,
      volatiles,
      move: createMove(MOVES.waterfall),
    });

    const result = handleGen8SwitchAbility(TRIGGERS.onContact as any, ctx);
    expect(result.activated).toBe(true);

    // Should have chip-damage effect: floor(160 / 4) = 40
    const chipEffect = result.effects.find((e) => e.effectType === "chip-damage");
    expect(chipEffect).toBeDefined();
    expect((chipEffect as any).value).toBe(40);

    // Should have paralysis
    const statusEffect = result.effects.find((e) => e.effectType === "status-inflict");
    expect(statusEffect).toBeDefined();
    expect((statusEffect as any).status).toBe(STATUS.paralysis);
  });

  it("given Cramorant with gulp-missile-gorging volatile but opponent already has a status, when hit, then returns chip damage but no paralysis", () => {
    // Source: Showdown data/abilities.ts -- Gulp Missile: paralysis only if no existing status
    const volatiles = new Map<string, { turnsLeft: number }>();
    volatiles.set(GULP_MISSILE_GORGING as VolatileStatus, { turnsLeft: -1 });

    const opponent = createOnFieldPokemon({ maxHp: 200, currentHp: 200, status: STATUS.burn });
    const ctx = createAbilityContext({
      ability: ABILITIES.gulpMissile,
      trigger: TRIGGERS.onContact,
      speciesId: SPECIES.cramorant,
      nickname: "Cramorant",
      opponent,
      volatiles,
      move: createMove(MOVES.waterfall),
    });

    const result = handleGen8SwitchAbility(TRIGGERS.onContact as any, ctx);
    expect(result.activated).toBe(true);

    // Chip damage still applies
    const chipEffect = result.effects.find((e) => e.effectType === "chip-damage");
    expect(chipEffect).toBeDefined();

    // No paralysis because opponent already has burn
    const statusEffect = result.effects.find((e) => e.effectType === "status-inflict");
    expect(statusEffect).toBeUndefined();
  });

  it("given non-Cramorant (25) with gulp-missile, when hit on contact, then not activated", () => {
    // Source: Showdown data/abilities.ts -- Gulp Missile: species check (845 only)
    const volatiles = new Map<string, { turnsLeft: number }>();
    volatiles.set(GULP_MISSILE_GULPING as VolatileStatus, { turnsLeft: -1 });

    const opponent = createOnFieldPokemon({ maxHp: 200, currentHp: 200 });
    const ctx = createAbilityContext({
      ability: ABILITIES.gulpMissile,
      trigger: TRIGGERS.onContact,
      speciesId: SPECIES.pikachu,
      opponent,
      volatiles,
      move: createMove(MOVES.waterfall),
    });

    const result = handleGen8SwitchAbility(TRIGGERS.onContact as any, ctx);
    expect(result.activated).toBe(false);
  });

  it("given Cramorant without gulp missile volatiles, when hit on contact, then not activated", () => {
    // Source: Showdown data/abilities.ts -- Gulp Missile: requires gulping/gorging form
    const opponent = createOnFieldPokemon({ maxHp: 200, currentHp: 200 });
    const ctx = createAbilityContext({
      ability: ABILITIES.gulpMissile,
      trigger: TRIGGERS.onContact,
      speciesId: SPECIES.cramorant,
      opponent,
      move: createMove(MOVES.waterfall),
    });

    const result = handleGen8SwitchAbility(TRIGGERS.onContact as any, ctx);
    expect(result.activated).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// 4. Gen8AbilitiesStat: formatStatName coverage via Beast Boost
// ---------------------------------------------------------------------------

describe("Gen8AbilitiesStat formatStatName via Beast Boost", () => {
  it("given Beast Boost with highest stat being spAttack, when KO triggers, then message contains 'Special Attack'", () => {
    // Source: Showdown data/abilities.ts -- beastboost: raises highest stat
    // Source: Bulbapedia "Beast Boost" -- "raises the user's highest stat by one stage"
    // This test exercises formatStatName("spAttack") -> "Special Attack"
    const faintedOpponent = createOnFieldPokemon({ currentHp: 0 });
    const ctx: AbilityContext = {
      pokemon: {
        ...createOnFieldPokemon({
          ability: ABILITIES.beastBoost,
          nickname: "Mewtwo",
          maxHp: 200,
          currentHp: 200,
        }),
        pokemon: {
          ...createPokemonInstance({
            ability: ABILITIES.beastBoost,
            maxHp: 200,
            currentHp: 200,
            nickname: "Mewtwo",
          }),
          calculatedStats: {
            hp: 200,
            attack: 80,
            defense: 80,
            spAttack: 150, // highest
            spDefense: 80,
            speed: 80,
          },
        },
      } as unknown as ActivePokemon,
      opponent: faintedOpponent,
      state: createBattleState(),
      rng: createBattleState().rng as any,
      trigger: TRIGGERS.onAfterMoveUsed as any,
    };

    const result = handleGen8StatAbility(ctx);
    expect(result.activated).toBe(true);
    expect(result).toEqual({
      activated: true,
      effects: [
        {
          effectType: "stat-change",
          target: "self",
          stat: "spAttack",
          stages: 1,
        },
      ],
      messages: ["Mewtwo's Beast Boost raised its Special Attack!"],
    });
  });

  it("given Beast Boost with highest stat being spDefense, when KO triggers, then message contains 'Special Defense'", () => {
    // Source: Showdown data/abilities.ts -- beastboost: raises highest stat
    // This test exercises formatStatName("spDefense") -> "Special Defense"
    const faintedOpponent = createOnFieldPokemon({ currentHp: 0 });
    const ctx: AbilityContext = {
      pokemon: {
        ...createOnFieldPokemon({
          ability: ABILITIES.beastBoost,
          nickname: "Mewtwo",
          maxHp: 200,
          currentHp: 200,
        }),
        pokemon: {
          ...createPokemonInstance({
            ability: ABILITIES.beastBoost,
            maxHp: 200,
            currentHp: 200,
            nickname: "Mewtwo",
          }),
          calculatedStats: {
            hp: 200,
            attack: 80,
            defense: 80,
            spAttack: 80,
            spDefense: 150, // highest
            speed: 80,
          },
        },
      } as unknown as ActivePokemon,
      opponent: faintedOpponent,
      state: createBattleState(),
      rng: createBattleState().rng as any,
      trigger: TRIGGERS.onAfterMoveUsed as any,
    };

    const result = handleGen8StatAbility(ctx);
    expect(result.activated).toBe(true);
    expect(result).toEqual({
      activated: true,
      effects: [
        {
          effectType: "stat-change",
          target: "self",
          stat: "spDefense",
          stages: 1,
        },
      ],
      messages: ["Mewtwo's Beast Boost raised its Special Defense!"],
    });
  });

  it("given Beast Boost with highest stat being speed, when KO triggers, then message contains 'Speed'", () => {
    // Source: Showdown data/abilities.ts -- beastboost: raises highest stat
    // This test exercises formatStatName("speed") -> "Speed"
    const faintedOpponent = createOnFieldPokemon({ currentHp: 0 });
    const ctx: AbilityContext = {
      pokemon: {
        ...createOnFieldPokemon({
          ability: ABILITIES.beastBoost,
          nickname: "Mewtwo",
          maxHp: 200,
          currentHp: 200,
        }),
        pokemon: {
          ...createPokemonInstance({
            ability: ABILITIES.beastBoost,
            maxHp: 200,
            currentHp: 200,
            nickname: "Mewtwo",
          }),
          calculatedStats: {
            hp: 200,
            attack: 80,
            defense: 80,
            spAttack: 80,
            spDefense: 80,
            speed: 150, // highest
          },
        },
      } as unknown as ActivePokemon,
      opponent: faintedOpponent,
      state: createBattleState(),
      rng: createBattleState().rng as any,
      trigger: TRIGGERS.onAfterMoveUsed as any,
    };

    const result = handleGen8StatAbility(ctx);
    expect(result.activated).toBe(true);
    expect(result).toEqual({
      activated: true,
      effects: [
        {
          effectType: "stat-change",
          target: "self",
          stat: "speed",
          stages: 1,
        },
      ],
      messages: ["Mewtwo's Beast Boost raised its Speed!"],
    });
  });
});

// ---------------------------------------------------------------------------
// 5. Gen8Dynamax edge case: getUndynamaxedHp
// ---------------------------------------------------------------------------

describe("getUndynamaxedHp edge cases", () => {
  it("given maxHp=0 (degenerate input), when reverting, then returns 0 without division by zero", () => {
    // Source: Showdown data/conditions.ts line 801 -- getUndynamaxedHp: guard against division by zero
    // This is a defensive edge case not normally reachable in gameplay
    const result = getUndynamaxedHp(100, 0, 300);
    expect(result).toBe(0);
  });

  it("given all zero inputs, when reverting, then returns 0", () => {
    // Source: Defensive edge case -- all-zero inputs should not crash
    const result = getUndynamaxedHp(0, 0, 0);
    expect(result).toBe(0);
  });

  it("given currentHp=150, maxHp=300, baseMaxHp=200, when reverting, then returns round(150 * 200 / 300) = 100", () => {
    // Source: Showdown data/conditions.ts lines 801-802 -- proportional HP restoration
    // Inline derivation: round(150 * 200 / 300) = round(100) = 100
    const result = getUndynamaxedHp(150, 300, 200);
    expect(result).toBe(100);
  });

  it("given currentHp=1, maxHp=600, baseMaxHp=300, when reverting from near-death, then returns round(1 * 300 / 600) = 1", () => {
    // Source: Showdown data/conditions.ts -- proportional restoration at minimum HP
    // Inline derivation: round(1 * 300 / 600) = round(0.5) = 1
    const result = getUndynamaxedHp(1, 600, 300);
    expect(result).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// 6. Heavy-Duty Boots blocking all hazards (combined scenario)
// ---------------------------------------------------------------------------

describe("Heavy-Duty Boots blocking all hazards combined", () => {
  it("given Heavy-Duty Boots and all hazard types active, when switching in, then all effects are blocked", () => {
    // Source: Showdown data/items.ts -- heavydutyboots: blocks ALL entry hazard effects
    // Source: Bulbapedia "Heavy-Duty Boots" -- blocks Stealth Rock, Spikes, Toxic Spikes,
    //   Sticky Web, and G-Max Steelsurge
    const mon = createOnFieldPokemon({
      types: [TYPES.fire, TYPES.flying], // Would take 4x Stealth Rock and 2x G-Max Steelsurge normally
      maxHp: 300,
      heldItem: ITEMS.heavyDutyBoots,
    });
    const side = createBattleSide([
      { type: MOVES.stealthRock, layers: 1 },
      { type: MOVES.spikes, layers: 3 },
      { type: MOVES.toxicSpikes, layers: 2 },
      { type: MOVES.stickyWeb, layers: 1 },
      { type: GMAX_STEELSURGE_HAZARD, layers: 1 },
    ]);
    const state = createBattleState();

    const result = applyGen8EntryHazards(mon, side, state, GEN8_TYPE_CHART);

    // All effects should be blocked
    expect(result.damage).toBe(0);
    expect(result.statusInflicted).toBeNull();
    expect(result.statChanges).toHaveLength(0);
    expect(result.messages).toHaveLength(0);
  });

  it("given no Heavy-Duty Boots and same hazards on a Fire/Flying-type, when switching in, then massive damage is dealt", () => {
    // Source: Showdown data/moves.ts -- each hazard applies independently
    // This is the control case to prove Heavy-Duty Boots actually prevents damage
    //
    // Stealth Rock: Rock vs Fire = 2x, Rock vs Flying = 2x -> 4x
    //   floor(300 * 4 / 8) = 150
    // Spikes 3 layers: floor(300 * 6 / 24) = 75
    //   But Flying-type is NOT grounded -> Spikes doesn't apply!
    // G-Max Steelsurge: Steel vs Fire = 0.5x, Steel vs Flying = 1x -> 0.5x
    //   floor(300 * 0.5 / 8) = floor(18.75) = 18
    // Toxic Spikes: Flying-type not grounded -> no effect
    // Sticky Web: Flying-type not grounded -> no effect
    //
    // Total = 150 + 18 = 168
    const mon = createOnFieldPokemon({
      types: [TYPES.fire, TYPES.flying],
      maxHp: 300,
    });
    const side = createBattleSide([
      { type: MOVES.stealthRock, layers: 1 },
      { type: MOVES.spikes, layers: 3 },
      { type: MOVES.toxicSpikes, layers: 2 },
      { type: MOVES.stickyWeb, layers: 1 },
      { type: GMAX_STEELSURGE_HAZARD, layers: 1 },
    ]);
    const state = createBattleState();

    const result = applyGen8EntryHazards(mon, side, state, GEN8_TYPE_CHART);
    // Stealth Rock (150) + G-Max Steelsurge (18) = 168
    // Spikes, Toxic Spikes, Sticky Web don't apply (Flying not grounded)
    expect(result.damage).toBe(168);
    expect(result.statusInflicted).toBeNull(); // Not grounded for Toxic Spikes
  });

  it("given Heavy-Duty Boots holder, when hasHeavyDutyBoots is checked, then returns true", () => {
    // Source: Showdown data/items.ts -- heavydutyboots: item ID match
    const mon = createOnFieldPokemon({ heldItem: ITEMS.heavyDutyBoots });
    expect(hasHeavyDutyBoots(mon)).toBe(true);
  });

  it("given Leftovers holder, when hasHeavyDutyBoots is checked, then returns false", () => {
    // Source: Showdown data/items.ts -- only heavy-duty-boots has the hazard-blocking effect
    const mon = createOnFieldPokemon({ heldItem: ITEMS.leftovers });
    expect(hasHeavyDutyBoots(mon)).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Bonus: shouldHungerSwitchToggle exported function edge cases
// ---------------------------------------------------------------------------

describe("shouldHungerSwitchToggle edge cases", () => {
  it("given hunger-switch and speciesId 877, when checked, then returns true", () => {
    // Source: Showdown data/abilities.ts -- Hunger Switch onResidual, Morpeko = 877
    expect(shouldHungerSwitchToggle(ABILITIES.hungerSwitch, SPECIES.morpeko)).toBe(true);
  });

  it("given hunger-switch and speciesId 0, when checked, then returns false", () => {
    // Source: Showdown data/abilities.ts -- only speciesId 877 triggers
    expect(shouldHungerSwitchToggle(ABILITIES.hungerSwitch, 0)).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Bonus: getGulpMissileResult exported function edge cases
// ---------------------------------------------------------------------------

describe("getGulpMissileResult edge cases", () => {
  it("given gorging form and attackerMaxHp=100, when calculated, then returns 25 damage and paralysis", () => {
    // Source: Showdown data/abilities.ts -- Gulp Missile: 1/4 max HP
    // Inline derivation: floor(100 / 4) = 25
    const result = getGulpMissileResult(GORGING_FORM, 100);
    expect(result.damage).toBe(25);
    expect(result.secondaryEffect).toBe(STATUS.paralysis);
  });

  it("given gulping form and attackerMaxHp=100, when calculated, then returns 25 damage and defense-drop", () => {
    // Source: Showdown data/abilities.ts -- Gulp Missile: Gulping = defense-drop
    // Inline derivation: floor(100 / 4) = 25
    const result = getGulpMissileResult(GULPING_FORM, 100);
    expect(result.damage).toBe(25);
    expect(result.secondaryEffect).toBe("defense-drop");
  });

  it("given gorging form and attackerMaxHp=1, when calculated, then minimum damage is 1", () => {
    // Source: Showdown data/abilities.ts -- Math.max(1, ...) ensures minimum 1 damage
    // Inline derivation: Math.max(1, floor(1/4)) = Math.max(1, 0) = 1
    const result = getGulpMissileResult(GORGING_FORM, 1);
    expect(result.damage).toBe(1);
  });
});
