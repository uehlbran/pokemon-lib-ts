/**
 * Gen 5 Move Power/Accuracy Data Verification + Behavioral Override Tests
 *
 * Part 1: Snapshot tests verifying that moves.json contains correct Gen 5 values
 *   for base power and accuracy. These values changed in Gen 6 for many moves.
 *
 * Part 2: Behavioral override tests verifying Gen 5-specific move behaviors
 *   that differ from Gen 6+ (Defog, Scald, Toxic, Growth, powder moves, Knock Off).
 *
 * Source: references/pokemon-showdown/data/mods/gen5/moves.ts
 */

import type { ActivePokemon, BattleState, MoveEffectContext } from "@pokemon-lib-ts/battle";
import {
  CORE_STATUS_IDS,
  CORE_TYPE_IDS,
  CORE_VOLATILE_IDS,
  CORE_WEATHER_IDS,
  type PokemonType,
  type PrimaryStatus,
  SeededRandom,
  type WeatherType,
} from "@pokemon-lib-ts/core";
import { describe, expect, it } from "vitest";
import {
  createGen5DataManager,
  GEN5_ABILITY_IDS,
  GEN5_ITEM_IDS,
  GEN5_MOVE_IDS,
  GEN5_SPECIES_IDS,
} from "../src";
import {
  handleGen5BehaviorMove,
  isGen5PowderMoveBlocked,
  isToxicGuaranteedAccuracy,
} from "../src/Gen5MoveEffectsBehavior";

// ---------------------------------------------------------------------------
// Test Helpers
// ---------------------------------------------------------------------------

const dataManager = createGen5DataManager();
const A = GEN5_ABILITY_IDS;
const I = GEN5_ITEM_IDS;
const M = GEN5_MOVE_IDS;
const P = GEN5_SPECIES_IDS;
const S = CORE_STATUS_IDS;
const T = CORE_TYPE_IDS;
const V = CORE_VOLATILE_IDS;
const W = CORE_WEATHER_IDS;

/**
 * Creates a minimal ActivePokemon mock for behavioral override tests.
 */
function makeActive(overrides: {
  nickname?: string;
  status?: PrimaryStatus | null;
  types?: PokemonType[];
  heldItem?: string | null;
  itemKnockedOff?: boolean;
  currentHp?: number;
  ability?: string;
}): ActivePokemon {
  return {
    pokemon: {
      nickname: overrides.nickname ?? "TestMon",
      status: overrides.status ?? null,
      heldItem: overrides.heldItem ?? null,
      currentHp: overrides.currentHp ?? 200,
      speciesId: P.charizard,
      calculatedStats: {
        hp: 200,
        attack: 100,
        defense: 100,
        spAttack: 100,
        spDefense: 100,
        speed: 100,
      },
      moves: [],
    },
    ability: overrides.ability ?? A.blaze,
    types: overrides.types ?? [T.fire, T.flying],
    volatileStatuses: new Map(),
    statStages: {
      attack: 0,
      defense: 0,
      spAttack: 0,
      spDefense: 0,
      speed: 0,
      accuracy: 0,
      evasion: 0,
    },
    teamSlot: 0,
    lastMoveUsed: null,
    lastDamageTaken: 0,
    lastDamageType: null,
    lastDamageCategory: null,
    turnsOnField: 1,
    movedThisTurn: false,
    consecutiveProtects: 0,
    substituteHp: 0,
    itemKnockedOff: overrides.itemKnockedOff ?? false,
    transformed: false,
    transformedSpecies: null,
    isMega: false,
    isDynamaxed: false,
    suppressedAbility: null,
  } as unknown as ActivePokemon;
}

/**
 * Creates a minimal MoveEffectContext mock.
 */
function makeCtx(overrides: {
  moveId: string;
  attacker?: Partial<Parameters<typeof makeActive>[0]>;
  defender?: Partial<Parameters<typeof makeActive>[0]>;
  weather?: { type: WeatherType; turnsLeft: number; source: string } | null;
  damage?: number;
}): MoveEffectContext {
  return {
    attacker: makeActive(overrides.attacker ?? {}),
    defender: makeActive(overrides.defender ?? {}),
    move: dataManager.getMove(overrides.moveId),
    damage: overrides.damage ?? 0,
    state: {
      weather: overrides.weather ?? null,
      sides: [
        {
          index: 0,
          active: [null],
          hazards: [],
          screens: [],
          tailwind: { active: false, turnsLeft: 0 },
        },
        {
          index: 1,
          active: [null],
          hazards: [],
          screens: [],
          tailwind: { active: false, turnsLeft: 0 },
        },
      ],
      trickRoom: { active: false, turnsLeft: 0 },
      gravity: { active: false, turnsLeft: 0 },
    } as unknown as BattleState,
    rng: new SeededRandom(42),
  } as unknown as MoveEffectContext;
}

// ===========================================================================
// Part 1: Data Snapshot Tests — Move Base Power and Accuracy
// ===========================================================================

describe("Gen 5 move data verification (snapshot)", () => {
  function findMove(id: string) {
    return dataManager.getMove(id);
  }

  // --- Base Power Verification ---

  it("given Thunderbolt in Gen 5 data, when checking base power, then returns 95 (Gen 6+ reduced to 90)", () => {
    // Source: references/pokemon-showdown/data/mods/gen5/moves.ts — thunderbolt: basePower: 95
    const move = findMove(M.thunderbolt);
    expect(move.power).toBe(95);
  });

  it("given Ice Beam in Gen 5 data, when checking base power, then returns 95 (Gen 6+ reduced to 90)", () => {
    // Source: references/pokemon-showdown/data/mods/gen5/moves.ts — icebeam: basePower: 95
    const move = findMove(M.iceBeam);
    expect(move.power).toBe(95);
  });

  it("given Flamethrower in Gen 5 data, when checking base power, then returns 95 (Gen 6+ reduced to 90)", () => {
    // Source: references/pokemon-showdown/data/mods/gen5/moves.ts — flamethrower: basePower: 95
    const move = findMove(M.flamethrower);
    expect(move.power).toBe(95);
  });

  it("given Surf in Gen 5 data, when checking base power, then returns 95 (Gen 6+ reduced to 90)", () => {
    // Source: references/pokemon-showdown/data/mods/gen5/moves.ts — surf: basePower: 95
    const move = findMove(M.surf);
    expect(move.power).toBe(95);
  });

  it("given Thunder in Gen 5 data, when checking base power, then returns 120 (Gen 6+ reduced to 110)", () => {
    // Source: references/pokemon-showdown/data/mods/gen5/moves.ts — thunder: basePower: 120
    const move = findMove(M.thunder);
    expect(move.power).toBe(120);
  });

  it("given Blizzard in Gen 5 data, when checking base power, then returns 120 (Gen 6+ reduced to 110)", () => {
    // Source: references/pokemon-showdown/data/mods/gen5/moves.ts — blizzard: basePower: 120
    const move = findMove(M.blizzard);
    expect(move.power).toBe(120);
  });

  it("given Fire Blast in Gen 5 data, when checking base power, then returns 120 (Gen 6+ reduced to 110)", () => {
    // Source: references/pokemon-showdown/data/mods/gen5/moves.ts — fireblast: basePower: 120
    const move = findMove(M.fireBlast);
    expect(move.power).toBe(120);
  });

  it("given Hydro Pump in Gen 5 data, when checking base power, then returns 120 (Gen 6+ reduced to 110)", () => {
    // Source: references/pokemon-showdown/data/mods/gen5/moves.ts — hydropump: basePower: 120
    const move = findMove(M.hydroPump);
    expect(move.power).toBe(120);
  });

  it("given Draco Meteor in Gen 5 data, when checking base power, then returns 140 (Gen 6+ reduced to 130)", () => {
    // Source: references/pokemon-showdown/data/mods/gen5/moves.ts — dracometeor: basePower: 140
    const move = findMove(M.dracoMeteor);
    expect(move.power).toBe(140);
  });

  it("given Overheat in Gen 5 data, when checking base power, then returns 140 (Gen 6+ reduced to 130)", () => {
    // Source: references/pokemon-showdown/data/mods/gen5/moves.ts — overheat: basePower: 140
    const move = findMove(M.overheat);
    expect(move.power).toBe(140);
  });

  it("given Leaf Storm in Gen 5 data, when checking base power, then returns 140 (Gen 6+ reduced to 130)", () => {
    // Source: references/pokemon-showdown/data/mods/gen5/moves.ts — leafstorm: basePower: 140
    const move = findMove(M.leafStorm);
    expect(move.power).toBe(140);
  });

  it("given Knock Off in Gen 5 data, when checking base power, then returns 20 (Gen 6+ increased to 65)", () => {
    // Source: references/pokemon-showdown/data/mods/gen5/moves.ts — knockoff: basePower: 20
    const move = findMove(M.knockOff);
    expect(move.power).toBe(20);
  });

  // --- Accuracy Verification ---

  it("given Will-O-Wisp in Gen 5 data, when checking accuracy, then returns 75 (Gen 6+ increased to 85)", () => {
    // Source: references/pokemon-showdown/data/mods/gen5/moves.ts — willowisp: accuracy: 75
    const move = findMove(M.willOWisp);
    expect(move.accuracy).toBe(75);
  });

  it("given Gunk Shot in Gen 5 data, when checking accuracy, then returns 70 (Gen 6+ increased to 80)", () => {
    // Source: references/pokemon-showdown/data/mods/gen5/moves.ts — gunkshot: accuracy: 70
    const move = findMove(M.gunkShot);
    expect(move.accuracy).toBe(70);
  });

  // --- String Shot / Sweet Scent Stat Changes ---

  it("given String Shot in Gen 5 data, when checking effect, then lowers Speed by 1 stage (Gen 7+ is -2)", () => {
    // Source: references/pokemon-showdown/data/mods/gen5/moves.ts — stringshot: boosts: { spe: -1 }
    const move = findMove(M.stringShot);
    expect(move.effect.type).toBe("stat-change");
    expect(move.effect.changes).toEqual([{ stat: "speed", stages: -1 }]);
  });

  it("given Sweet Scent in Gen 5 data, when checking effect, then lowers Evasion by 1 stage (Gen 6+ is -2)", () => {
    // Source: references/pokemon-showdown/data/mods/gen5/moves.ts — sweetscent: boosts: { evasion: -1 }
    const move = findMove(M.sweetScent);
    expect(move.effect.type).toBe("stat-change");
    expect(move.effect.changes).toEqual([{ stat: "evasion", stages: -1 }]);
  });

  // --- Powder Move Flags ---

  it("given Sleep Powder in Gen 5 data, when checking flags, then has powder flag set", () => {
    // Source: Showdown data — powder flag is set on powder moves for engine powder-immunity checks
    const move = findMove(M.sleepPowder);
    expect(move.flags.powder).toBe(true);
  });

  it("given Spore in Gen 5 data, when checking flags, then has powder flag set", () => {
    // Source: Showdown data — powder flag is set on Spore
    const move = findMove(M.spore);
    expect(move.flags.powder).toBe(true);
  });
});

// ===========================================================================
// Part 2: Behavioral Override Tests
// ===========================================================================

// --- Defog ---

describe("Gen 5 Defog behavioral override", () => {
  it("given Defog used in Gen 5, when executed, then clears only the TARGET side hazards and screens", () => {
    // Source: references/pokemon-showdown/data/mods/gen5/moves.ts -- defog.onHit:
    //   removes from `pokemon.side` (the TARGET), not the user's side.
    //   Gen 6+ Defog also clears the user's side.
    const ctx = makeCtx({ moveId: M.defog });
    const result = handleGen5BehaviorMove(ctx);

    expect(result).not.toBeNull();
    expect(result!.clearSideHazards).toBe("defender");
    expect(result!.screensCleared).toBe("defender");
  });

  it("given Defog used in Gen 5, when executed, then lowers target evasion by 1 stage", () => {
    // Source: references/pokemon-showdown/data/mods/gen5/moves.ts -- defog.onHit:
    //   `this.boost({evasion: -1})` on target
    const ctx = makeCtx({ moveId: M.defog });
    const result = handleGen5BehaviorMove(ctx);

    expect(result).not.toBeNull();
    expect(result!.statChanges).toEqual([{ target: "defender", stat: "evasion", stages: -1 }]);
  });
});

// --- Scald ---

describe("Gen 5 Scald behavioral override", () => {
  it("given frozen user using Scald in Gen 5, when executed, then thaws the user", () => {
    // Source: references/pokemon-showdown/data/mods/gen5/moves.ts -- scald:
    //   The defrost flag is set in data (flags.defrost: true), causing user thaw.
    //   Additionally, `thawsTarget: false` prevents target thawing (Gen 6+ behavior).
    const ctx = makeCtx({
      moveId: M.scald,
      attacker: { status: S.freeze, nickname: "Milotic" },
    });
    const result = handleGen5BehaviorMove(ctx);

    expect(result).not.toBeNull();
    expect(result!.statusCuredOnly).toEqual({ target: "attacker" });
    expect(result!.messages.length).toBeGreaterThan(0);
    expect(result!.messages[0]).toContain("thawed out");
  });

  it("given non-frozen user using Scald in Gen 5, when executed, then does NOT produce a thaw cure", () => {
    // Source: references/pokemon-showdown/data/mods/gen5/moves.ts -- scald:
    //   Only thaws user if user is actually frozen. No target thawing in Gen 5.
    const ctx = makeCtx({
      moveId: M.scald,
      attacker: { status: null, nickname: "Milotic" },
    });
    const result = handleGen5BehaviorMove(ctx);

    expect(result).not.toBeNull();
    expect(result!.statusCuredOnly).toBeNull();
    expect(result!.messages).toEqual([]);
  });
});

// --- Toxic ---

describe("Gen 5 Toxic accuracy (no Poison-type guarantee)", () => {
  it("given Poison-type using Toxic in Gen 5, when checking guaranteed accuracy, then returns false", () => {
    // Source: references/pokemon-showdown/data/mods/gen5/moves.ts -- toxic:
    //   `onPrepareHit() {}` — empty override removes Gen 6+ Poison-type guarantee.
    //   In Gen 6+, `onPrepareHit(target, source) { if (source.hasType('Poison')) return true; }`
    const result = isToxicGuaranteedAccuracy([T.poison]);
    expect(result).toBe(false);
  });

  it("given Poison/Flying-type using Toxic in Gen 5, when checking guaranteed accuracy, then returns false", () => {
    // Source: references/pokemon-showdown/data/mods/gen5/moves.ts -- toxic:
    //   Dual-typed Poison Pokemon (e.g., Crobat) also get no accuracy bypass in Gen 5.
    const result = isToxicGuaranteedAccuracy([T.poison, T.flying]);
    expect(result).toBe(false);
  });

  it("given non-Poison-type using Toxic in Gen 5, when checking guaranteed accuracy, then returns false", () => {
    // Source: Gen 5 has no type-based Toxic accuracy guarantee for any type.
    const result = isToxicGuaranteedAccuracy([T.normal]);
    expect(result).toBe(false);
  });
});

// --- Growth ---

describe("Gen 5 Growth behavioral override", () => {
  it("given Growth used in sun in Gen 5, when executed, then boosts Attack and SpAttack by 2 stages each", () => {
    // Source: Bulbapedia -- Growth: "In intense sunlight, the stat increases are doubled,
    //   raising both Attack and Special Attack by two stages."
    // Source: Showdown -- Growth sun boost applies starting Gen 5
    const ctx = makeCtx({
      moveId: M.growth,
      weather: { type: W.sun, turnsLeft: 5, source: A.drought },
    });
    const result = handleGen5BehaviorMove(ctx);

    expect(result).not.toBeNull();
    expect(result!.statChanges).toEqual([
      { target: "attacker", stat: "attack", stages: 2 },
      { target: "attacker", stat: "spAttack", stages: 2 },
    ]);
  });

  it("given Growth used without sun in Gen 5, when executed, then boosts Attack and SpAttack by 1 stage each", () => {
    // Source: Bulbapedia -- Growth: "+1 Attack and +1 Special Attack" (base effect)
    const ctx = makeCtx({
      moveId: M.growth,
      weather: null,
    });
    const result = handleGen5BehaviorMove(ctx);

    expect(result).not.toBeNull();
    expect(result!.statChanges).toEqual([
      { target: "attacker", stat: "attack", stages: 1 },
      { target: "attacker", stat: "spAttack", stages: 1 },
    ]);
  });

  it("given Growth used in rain in Gen 5, when executed, then boosts Attack and SpAttack by 1 stage each (no rain bonus)", () => {
    // Source: Bulbapedia -- Growth only gets a boost in sun, not rain or other weather
    const ctx = makeCtx({
      moveId: M.growth,
      weather: { type: W.rain, turnsLeft: 5, source: A.drizzle },
    });
    const result = handleGen5BehaviorMove(ctx);

    expect(result).not.toBeNull();
    expect(result!.statChanges).toEqual([
      { target: "attacker", stat: "attack", stages: 1 },
      { target: "attacker", stat: "spAttack", stages: 1 },
    ]);
  });
});

// --- Powder Moves ---

describe("Gen 5 powder move Grass-type immunity (none)", () => {
  it("given Spore targeting a Grass-type in Gen 5, when checking powder block, then returns false (not blocked)", () => {
    // Source: references/pokemon-showdown/data/mods/gen5/moves.ts -- spore:
    //   `onTryHit() {}` — empty override removes Gen 6+ Grass immunity.
    //   In Gen 5, Breloom's Spore hits Grass types.
    const blocked = isGen5PowderMoveBlocked(M.spore, [T.grass]);
    expect(blocked).toBe(false);
  });

  it("given Sleep Powder targeting a Grass-type in Gen 5, when checking powder block, then returns false (not blocked)", () => {
    // Source: references/pokemon-showdown/data/mods/gen5/moves.ts -- sleeppowder:
    //   `onTryHit() {}` — empty override removes Gen 6+ Grass immunity.
    const blocked = isGen5PowderMoveBlocked(M.sleepPowder, [T.grass]);
    expect(blocked).toBe(false);
  });

  it("given Stun Spore targeting a Grass/Poison-type in Gen 5, when checking powder block, then returns false (not blocked)", () => {
    // Source: references/pokemon-showdown/data/mods/gen5/moves.ts -- stunspore:
    //   `onTryHit() {}` — empty override. Even dual-typed Grass Pokemon are hit.
    const blocked = isGen5PowderMoveBlocked(M.stunSpore, [T.grass, T.poison]);
    expect(blocked).toBe(false);
  });

  it("given Poison Powder targeting a Grass-type in Gen 5, when checking powder block, then returns false (not blocked)", () => {
    // Source: references/pokemon-showdown/data/mods/gen5/moves.ts -- poisonpowder:
    //   `onTryHit() {}` — empty override removes Gen 6+ Grass immunity.
    const blocked = isGen5PowderMoveBlocked(M.poisonPowder, [T.grass]);
    expect(blocked).toBe(false);
  });

  it("given Cotton Spore targeting a Grass-type in Gen 5, when checking powder block, then returns false (not blocked)", () => {
    // Source: references/pokemon-showdown/data/mods/gen5/moves.ts -- cottonspore:
    //   `onTryHit() {}` — empty override removes Gen 6+ Grass immunity.
    const blocked = isGen5PowderMoveBlocked(M.cottonSpore, [T.grass]);
    expect(blocked).toBe(false);
  });

  it("given Spore targeting a Normal-type in Gen 5, when checking powder block, then returns false (Normal not immune either)", () => {
    // Source: references/pokemon-showdown/data/mods/gen5/moves.ts --
    //   No type has powder immunity in Gen 5.
    const blocked = isGen5PowderMoveBlocked(M.spore, [T.normal]);
    expect(blocked).toBe(false);
  });

  it("given non-powder move Thunderbolt targeting a Grass-type in Gen 5, when checking powder block, then returns false", () => {
    // Source: isGen5PowderMoveBlocked only considers powder moves; Thunderbolt is not one.
    const blocked = isGen5PowderMoveBlocked(M.thunderbolt, [T.grass]);
    expect(blocked).toBe(false);
  });
});

// --- Knock Off ---

describe("Gen 5 Knock Off behavioral override", () => {
  it("given Knock Off against a target with a held item in Gen 5, when executed, then removes the item with no BP bonus", () => {
    // Source: references/pokemon-showdown/data/mods/gen5/moves.ts -- knockoff:
    //   `basePower: 20, onBasePower() {}` — empty onBasePower removes the
    //   Gen 6+ 1.5x damage bonus for hitting an item-holding target.
    //   Knock Off directly removes the item via ctx mutation (same pattern as Gen 4).
    const ctx = makeCtx({
      moveId: M.knockOff,
      defender: { heldItem: I.leftovers, nickname: "Ferrothorn" },
    });
    const result = handleGen5BehaviorMove(ctx);

    expect(result).not.toBeNull();
    // Item removal is done by direct mutation of ctx.defender, not via itemTransfer.
    // Source: handleKnockOff direct mutation pattern, consistent with Gen4MoveEffects.ts.
    expect(ctx.defender.pokemon.heldItem).toBe(null);
    expect(ctx.defender.itemKnockedOff).toBe(true);
    expect(result!.messages[0]).toContain(I.leftovers);
  });

  it("given Knock Off against a target with no held item in Gen 5, when executed, then produces empty message list", () => {
    // Source: references/pokemon-showdown/data/mods/gen5/moves.ts --
    //   Nothing to knock off if the target has no item.
    const ctx = makeCtx({
      moveId: M.knockOff,
      defender: { heldItem: null, nickname: "Conkeldurr" },
    });
    const result = handleGen5BehaviorMove(ctx);

    expect(result).not.toBeNull();
    expect(ctx.defender.pokemon.heldItem).toBe(null);
    expect(result!.messages).toEqual([]);
  });

  it("given Knock Off against a target whose item was already knocked off in Gen 5, when executed, then does not remove the item again", () => {
    // Source: Bulbapedia -- Knock Off cannot remove an item that was already knocked off.
    const ctx = makeCtx({
      moveId: M.knockOff,
      defender: { heldItem: I.leftovers, itemKnockedOff: true, nickname: "Ferrothorn" },
    });
    const result = handleGen5BehaviorMove(ctx);

    expect(result).not.toBeNull();
    // Item remains; flag was already set before call
    expect(ctx.defender.pokemon.heldItem).toBe(I.leftovers);
    expect(result!.messages).toEqual([]);
  });

  it("given Knock Off against a target with Unburden holding an item, when executed, then sets unburden volatile", () => {
    // Source: Showdown data/abilities.ts -- Unburden onAfterUseItem + onUpdate:
    //   activates when the Pokemon loses its item by any means (consumed, stolen, knocked off).
    // Source: Bulbapedia -- Unburden: "Doubles Speed when held item is used or lost."
    const ctx = makeCtx({
      moveId: M.knockOff,
      defender: { heldItem: I.leftovers, nickname: "Hitmonlee", ability: A.unburden },
    });
    const result = handleGen5BehaviorMove(ctx);

    expect(result).not.toBeNull();
    expect(ctx.defender.pokemon.heldItem).toBe(null);
    expect(ctx.defender.volatileStatuses.has(V.unburden)).toBe(true);
  });

  it("given Knock Off against a target without Unburden holding an item, when executed, then does NOT set unburden volatile", () => {
    // Source: Showdown data/abilities.ts -- Unburden only activates for holders of the ability
    const ctx = makeCtx({
      moveId: M.knockOff,
      defender: { heldItem: I.leftovers, nickname: "Ferrothorn", ability: A.ironBarbs },
    });
    const result = handleGen5BehaviorMove(ctx);

    expect(result).not.toBeNull();
    expect(ctx.defender.pokemon.heldItem).toBe(null);
    expect(ctx.defender.volatileStatuses.has(V.unburden)).toBe(false);
  });

  it("given Knock Off against a target with Unburden that already has the unburden volatile, when executed, then does not double-set", () => {
    // Source: Showdown data/abilities.ts -- Unburden volatile is only set once;
    //   checking !volatileStatuses.has('unburden') prevents duplicate setting.
    const ctx = makeCtx({
      moveId: M.knockOff,
      defender: { heldItem: I.leftovers, nickname: "Hitmonlee", ability: A.unburden },
    });
    // Pre-set the volatile to simulate it was already activated
    ctx.defender.volatileStatuses.set(V.unburden, { turnsLeft: -1 });
    const result = handleGen5BehaviorMove(ctx);

    expect(result).not.toBeNull();
    expect(ctx.defender.pokemon.heldItem).toBe(null);
    // Still has the volatile (was already set), no error
    expect(ctx.defender.volatileStatuses.has(V.unburden)).toBe(true);
  });
});

// --- Fallthrough ---

describe("Gen 5 behavioral override fallthrough", () => {
  it("given a move with no Gen 5 behavioral override (Thunderbolt), when checking, then returns null", () => {
    // Source: handleGen5BehaviorMove returns null for moves without overrides,
    //   letting the standard data-driven handler process them.
    const ctx = makeCtx({ moveId: M.thunderbolt });
    const result = handleGen5BehaviorMove(ctx);
    expect(result).toBeNull();
  });

  it("given a move with no Gen 5 behavioral override (Earthquake), when checking, then returns null", () => {
    // Source: handleGen5BehaviorMove returns null for standard moves.
    const ctx = makeCtx({ moveId: M.earthquake });
    const result = handleGen5BehaviorMove(ctx);
    expect(result).toBeNull();
  });
});
