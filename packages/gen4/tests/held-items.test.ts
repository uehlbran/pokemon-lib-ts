import type { ActivePokemon, BattleState, ItemContext } from "@pokemon-lib-ts/battle";
import { createOnFieldPokemon } from "@pokemon-lib-ts/battle/utils";
import type { MoveData, PokemonInstance, PokemonType, PrimaryStatus, VolatileStatus } from "@pokemon-lib-ts/core";
import {
  CORE_ABILITY_IDS,
  CORE_ABILITY_SLOTS,
  CORE_GENDERS,
  CORE_ITEM_TRIGGER_IDS,
  CORE_MOVE_IDS,
  CORE_STATUS_IDS,
  CORE_TYPE_IDS,
  CORE_VOLATILE_IDS,
  createEvs,
  createIvs,
  createPokemonInstance,
  SeededRandom,
} from "@pokemon-lib-ts/core";
import { describe, expect, it } from "vitest";
import { createGen4DataManager, GEN4_ITEM_IDS, GEN4_MOVE_IDS, GEN4_NATURE_IDS, GEN4_SPECIES_IDS } from "../src";
import { applyGen4HeldItem } from "../src/Gen4Items";
import { Gen4Ruleset } from "../src/Gen4Ruleset";

const dataManager = createGen4DataManager();
const I = GEN4_ITEM_IDS;
const M = GEN4_MOVE_IDS;
const A = CORE_ABILITY_IDS;
const AS = CORE_ABILITY_SLOTS;
const G = CORE_GENDERS;
const TRIGGERS = CORE_ITEM_TRIGGER_IDS;
const T = CORE_TYPE_IDS;
const S = CORE_STATUS_IDS;
const V = CORE_VOLATILE_IDS;

/**
 * Gen 4 Held Item Tests
 *
 * Focus on Gen 4 changes and new items:
 *   - Sitrus Berry: 1/4 max HP (was flat 30 in Gen 3) — KEY CHANGE
 *   - Black Sludge: heals Poison-types 1/16, damages others 1/8 (NEW)
 *   - Toxic Orb / Flame Orb: badly poisons / burns holder at EoT (NEW)
 *   - Focus Sash: survive at 1 HP if full HP, single-use consumed (NEW)
 *   - Life Orb: recoil floor(maxHP/10) per hit (1.3x boost in damage calc) (NEW)
 *   - Razor Fang: 10% flinch on contact (NEW, same as King's Rock)
 *
 * Source: Showdown sim/battle.ts Gen 4 mod — ItemBattleEffects
 * Source: Bulbapedia — individual Gen 4 item mechanics
 */

// ---------------------------------------------------------------------------
// Test helpers
// ---------------------------------------------------------------------------

function createSyntheticPokemonInstance(overrides: {
  speciesId?: number;
  nickname?: string | null;
  heldItem?: string | null;
  status?: PrimaryStatus | null;
  currentHp?: number;
  maxHp?: number;
  types?: PokemonType[];
}): PokemonInstance {
  const maxHp = overrides.maxHp ?? 160;
  const species = dataManager.getSpecies(overrides.speciesId ?? GEN4_SPECIES_IDS.bulbasaur);
  const pokemon = createPokemonInstance(species, 50, new SeededRandom(0), {
    nature: GEN4_NATURE_IDS.hardy,
    ivs: createIvs(),
    evs: createEvs(),
    abilitySlot: AS.normal1,
    gender: G.male,
    heldItem: overrides.heldItem ?? null,
    status: overrides.status ?? null,
    friendship: species.baseFriendship,
    isShiny: false,
    nickname: overrides.nickname ?? null,
    moves: [M.tackle],
    metLocation: "test",
    originalTrainer: "Test",
    originalTrainerId: 0,
    pokeball: I.pokeBall,
  });
  pokemon.status = overrides.status ?? null;
  pokemon.currentHp = overrides.currentHp ?? maxHp;
  pokemon.calculatedStats = {
    hp: maxHp,
    attack: 100,
    defense: 100,
    spAttack: 100,
    spDefense: 100,
    speed: 100,
  };
  return pokemon;
}

function createHeldItemContext(opts: {
  heldItem?: string | null;
  types?: PokemonType[];
  status?: PrimaryStatus | null;
  currentHp?: number;
  maxHp?: number;
  damage?: number;
  rngChance?: boolean;
  hasConfusion?: boolean;
  hasInfatuation?: boolean;
}): ItemContext {
  const volatileStatuses = new Map<VolatileStatus, unknown>();
  if (opts.hasConfusion) volatileStatuses.set(V.confusion, true);
  if (opts.hasInfatuation) volatileStatuses.set(V.infatuation, true);
  const pokemon = createSyntheticPokemonInstance({
    heldItem: opts.heldItem ?? null,
    status: opts.status,
    currentHp: opts.currentHp,
    maxHp: opts.maxHp ?? 160,
  });
  const active = createOnFieldPokemon(pokemon, 0, opts.types ?? [T.normal]);

  return {
    pokemon: {
      ...active,
      volatileStatuses,
      ability: A.none,
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
    rng: {
      next: () => 0,
      int: () => 1,
      chance: (_p: number) => opts.rngChance ?? false,
      pick: <T>(arr: readonly T[]) => arr[0] as T,
      shuffle: <T>(arr: T[]) => arr,
      getState: () => 0,
      setState: () => {},
    },
    damage: opts.damage,
  } as unknown as ItemContext;
}

// ---------------------------------------------------------------------------
// end of turn: Leftovers
// ---------------------------------------------------------------------------

describe("applyGen4HeldItem end of turn - Leftovers", () => {
  it("given Leftovers and 160 max HP, when end of turn triggers, then heals 10 HP (floor(160/16))", () => {
    // Source: Showdown Gen 4 mod — Leftovers heals floor(maxHP/16) each turn
    // Derivation: floor(160 / 16) = 10
    const ctx = createHeldItemContext({ heldItem: I.leftovers, maxHp: 160 });
    const result = applyGen4HeldItem(TRIGGERS.endOfTurn, ctx);

    expect(result.activated).toBe(true);
    expect(result.effects[0]).toMatchObject({ type: "heal", value: 10 });
    expect(result.messages[0]).toContain(dataManager.getItem(I.leftovers).displayName);
  });

  it("given Leftovers and 200 max HP, when end of turn triggers, then heals 12 HP (floor(200/16))", () => {
    // Source: Showdown Gen 4 mod — Leftovers heals floor(maxHP/16)
    // Derivation: floor(200 / 16) = 12
    const ctx = createHeldItemContext({ heldItem: I.leftovers, maxHp: 200 });
    const result = applyGen4HeldItem(TRIGGERS.endOfTurn, ctx);

    expect(result.effects[0]).toMatchObject({ type: "heal", value: 12 });
  });
});

// ---------------------------------------------------------------------------
// end of turn: Black Sludge (NEW in Gen 4)
// ---------------------------------------------------------------------------

describe("applyGen4HeldItem end of turn - Black Sludge (NEW in Gen 4)", () => {
  it("given Black Sludge and a Poison-type holder with 160 max HP, when end of turn triggers, then heals 10 HP (floor(160/16))", () => {
    // Source: Bulbapedia — Black Sludge: Poison-types heal floor(maxHP/16) each turn
    // Derivation: floor(160 / 16) = 10
    const ctx = createHeldItemContext({ heldItem: I.blackSludge, types: [T.poison], maxHp: 160 });
    const result = applyGen4HeldItem(TRIGGERS.endOfTurn, ctx);

    expect(result.activated).toBe(true);
    expect(result.effects[0]).toMatchObject({ type: "heal", value: 10 });
    expect(result.messages[0]).toContain(dataManager.getItem(I.blackSludge).displayName);
  });

  it("given Black Sludge and a non-Poison-type holder with 160 max HP, when end of turn triggers, then damages 20 HP (floor(160/8))", () => {
    // Source: Bulbapedia — Black Sludge: non-Poison-types take floor(maxHP/8) damage each turn
    // Derivation: floor(160 / 8) = 20
    const ctx = createHeldItemContext({ heldItem: I.blackSludge, types: [T.normal], maxHp: 160 });
    const result = applyGen4HeldItem(TRIGGERS.endOfTurn, ctx);

    expect(result.activated).toBe(true);
    expect(result.effects[0]).toMatchObject({ type: "chip-damage", value: 20 });
    expect(result.messages[0]).toContain(dataManager.getItem(I.blackSludge).displayName);
  });

  it("given Black Sludge and a dual Poison/Normal-type holder, when end of turn triggers, then heals (Poison takes priority)", () => {
    // Source: Bulbapedia — Black Sludge: any Poison typing grants healing
    const ctx = createHeldItemContext({ heldItem: I.blackSludge, types: [T.poison, T.normal], maxHp: 160 });
    const result = applyGen4HeldItem(TRIGGERS.endOfTurn, ctx);

    expect(result.effects[0]?.type).toBe("heal");
  });
});

// ---------------------------------------------------------------------------
// end of turn: Toxic Orb (NEW in Gen 4)
// ---------------------------------------------------------------------------

describe("applyGen4HeldItem end of turn — Toxic Orb (NEW in Gen 4)", () => {
  it("given Toxic Orb and no current status, when end of turn triggers, then activates and inflicts badly-poisoned", () => {
    // Source: Bulbapedia — Toxic Orb: badly poisons holder at end of turn if no status
    // Source: Showdown Gen 4 mod — Toxic Orb trigger
    const ctx = createHeldItemContext({ heldItem: I.toxicOrb, status: null });
    const result = applyGen4HeldItem(TRIGGERS.endOfTurn, ctx);

    expect(result.activated).toBe(true);
    expect(result.effects[0]).toMatchObject({ type: "inflict-status", status: S.badlyPoisoned });
    expect(result.messages[0]).toContain(dataManager.getItem(I.toxicOrb).displayName);
  });

  it("given Toxic Orb and existing status (burn), when end of turn triggers, then does not activate (status already present)", () => {
    // Source: Bulbapedia — Toxic Orb only activates if holder has no status
    const ctx = createHeldItemContext({ heldItem: I.toxicOrb, status: S.burn });
    const result = applyGen4HeldItem(TRIGGERS.endOfTurn, ctx);

    expect(result.activated).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// end of turn: Flame Orb (NEW in Gen 4)
// ---------------------------------------------------------------------------

describe("applyGen4HeldItem end of turn — Flame Orb (NEW in Gen 4)", () => {
  it("given Flame Orb and no current status, when end of turn triggers, then activates and inflicts burn", () => {
    // Source: Bulbapedia — Flame Orb: burns holder at end of turn if no status
    // Source: Showdown Gen 4 mod — Flame Orb trigger
    const ctx = createHeldItemContext({ heldItem: I.flameOrb, status: null });
    const result = applyGen4HeldItem(TRIGGERS.endOfTurn, ctx);

    expect(result.activated).toBe(true);
    expect(result.effects[0]).toMatchObject({ type: "inflict-status", status: S.burn });
    expect(result.messages[0]).toContain(dataManager.getItem(I.flameOrb).displayName);
  });

  it("given Flame Orb and existing status (poison), when end of turn triggers, then does not activate", () => {
    // Source: Bulbapedia — Flame Orb only activates if holder has no status
    const ctx = createHeldItemContext({ heldItem: I.flameOrb, status: S.poison });
    const result = applyGen4HeldItem(TRIGGERS.endOfTurn, ctx);

    expect(result.activated).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// end of turn: Sitrus Berry (GEN 4 CHANGE: 1/4 max HP, not flat 30)
// ---------------------------------------------------------------------------

describe("applyGen4HeldItem end of turn — Sitrus Berry (Gen 4 CHANGE: 1/4 max HP)", () => {
  it("given Sitrus Berry and HP at 50% (exactly), when end of turn triggers, then heals floor(maxHP/4)", () => {
    // CHANGED vs Gen 3: Gen 4 Sitrus Berry heals 1/4 max HP (not flat 30)
    // Source: Bulbapedia — Sitrus Berry: Gen 4+ heals floor(maxHP/4) when HP <= 50%
    // Derivation: maxHp=160, currentHp=80 (50%), floor(160/4) = 40
    const ctx = createHeldItemContext({ heldItem: I.sitrusBerry, maxHp: 160, currentHp: 80 });
    const result = applyGen4HeldItem(TRIGGERS.endOfTurn, ctx);

    expect(result.activated).toBe(true);
    expect(result.effects[0]).toMatchObject({ type: "heal", value: 40 });
    expect(result.effects[1]).toMatchObject({ type: "consume", value: I.sitrusBerry });
  });

  it("given Sitrus Berry and HP above 50%, when end of turn triggers, then does not activate", () => {
    // Source: Bulbapedia — Sitrus Berry: only triggers when HP <= floor(maxHP/2)
    const ctx = createHeldItemContext({ heldItem: I.sitrusBerry, maxHp: 160, currentHp: 120 });
    const result = applyGen4HeldItem(TRIGGERS.endOfTurn, ctx);

    expect(result.activated).toBe(false);
  });

  it("given Sitrus Berry and 200 max HP at 80 HP (40%), when end of turn triggers, then heals floor(200/4) = 50", () => {
    // Source: Bulbapedia — Sitrus Berry: heals floor(maxHP/4)
    // Derivation: maxHp=200, currentHp=80, floor(200/4) = 50
    const ctx = createHeldItemContext({ heldItem: I.sitrusBerry, maxHp: 200, currentHp: 80 });
    const result = applyGen4HeldItem(TRIGGERS.endOfTurn, ctx);

    expect(result.effects[0]).toMatchObject({ type: "heal", value: 50 });
  });
});

// ---------------------------------------------------------------------------
// damage taken: Focus Sash (NEW in Gen 4)
// ---------------------------------------------------------------------------

describe("applyGen4HeldItem damage taken — Focus Sash (NEW in Gen 4)", () => {
  it("given Focus Sash, full HP, and a would-be KO hit, when damage is taken, then survives at 1 HP and Focus Sash is consumed", () => {
    // Source: Bulbapedia — Focus Sash: survive at 1 HP if at full HP and damage would KO; consumed
    // Derivation: maxHp=160, currentHp=160 (full), damage=200 (KO) → survive at 1 HP, consume
    const ctx = createHeldItemContext({ heldItem: I.focusSash, maxHp: 160, currentHp: 160, damage: 200 });
    const result = applyGen4HeldItem(TRIGGERS.onDamageTaken, ctx);

    expect(result.activated).toBe(true);
    expect(result.effects[0]).toMatchObject({ type: "survive", value: 1 });
    expect(result.effects[1]).toMatchObject({ type: "consume", value: I.focusSash });
    expect(result.messages[0]).toContain(dataManager.getItem(I.focusSash).displayName);
  });

  it("given Focus Sash and HP not at full, when a KO hit is taken, then does not activate (must be full HP)", () => {
    // Source: Bulbapedia — Focus Sash: MUST be at full HP to activate
    const ctx = createHeldItemContext({ heldItem: I.focusSash, maxHp: 160, currentHp: 100, damage: 200 });
    const result = applyGen4HeldItem(TRIGGERS.onDamageTaken, ctx);

    expect(result.activated).toBe(false);
  });

  it("given Focus Sash and full HP, when a non-KO hit is taken, then does not activate (damage does not KO)", () => {
    // Source: Bulbapedia — Focus Sash: only activates when hit would KO
    const ctx = createHeldItemContext({ heldItem: I.focusSash, maxHp: 160, currentHp: 160, damage: 50 });
    const result = applyGen4HeldItem(TRIGGERS.onDamageTaken, ctx);

    expect(result.activated).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// damage taken: Sitrus Berry post-damage (Gen 4: 1/4 max HP)
// ---------------------------------------------------------------------------

describe("applyGen4HeldItem damage taken — Sitrus Berry (Gen 4 CHANGE)", () => {
  it("given Sitrus Berry and HP drops to 50% after damage, when damage is taken, then heals floor(maxHP/4)", () => {
    // CHANGED vs Gen 3: Gen 4 Sitrus Berry heals 1/4 max HP (not flat 30)
    // Source: Bulbapedia — Sitrus Berry: post-damage check in Gen 4 heals floor(maxHP/4)
    // Derivation: maxHp=160, currentHp=120, damage=40 → hpAfterDamage=80 (50%), heal floor(160/4)=40
    const ctx = createHeldItemContext({
      heldItem: I.sitrusBerry,
      maxHp: 160,
      currentHp: 120,
      damage: 40,
    });
    const result = applyGen4HeldItem(TRIGGERS.onDamageTaken, ctx);

    expect(result.activated).toBe(true);
    expect(result.effects[0]).toMatchObject({ type: "heal", value: 40 });
    expect(result.effects[1]).toMatchObject({ type: "consume", value: I.sitrusBerry });
  });

  it("given Sitrus Berry and HP stays above 50% after damage, when damage is taken, then does not activate", () => {
    // Source: Bulbapedia — Sitrus Berry only triggers when HP <= floor(maxHP/2) after damage
    const ctx = createHeldItemContext({
      heldItem: I.sitrusBerry,
      maxHp: 160,
      currentHp: 160,
      damage: 20,
    });
    const result = applyGen4HeldItem(TRIGGERS.onDamageTaken, ctx);

    expect(result.activated).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// on hit: Razor Fang (NEW in Gen 4)
// ---------------------------------------------------------------------------

describe("applyGen4HeldItem on hit — Razor Fang (NEW in Gen 4)", () => {
  it("given Razor Fang with eligible move and RNG succeeds, when on hit triggers, then causes flinch on opponent", () => {
    // Source: Bulbapedia — Razor Fang: 10% flinch chance, only on eligible moves (no secondary effects)
    // Source: Showdown Gen 4 mod — Razor Fang trigger with KINGS_ROCK_ELIGIBLE_MOVES whitelist
    const ctx = createHeldItemContext({ heldItem: I.razorFang, damage: 50, rngChance: true });
    // Need to add move with eligible ID to context
    (ctx as any).move = dataManager.getMove(M.aerialAce);
    const result = applyGen4HeldItem(TRIGGERS.onHit, ctx);

    expect(result.activated).toBe(true);
    expect(result.effects[0]).toMatchObject({ type: "flinch", target: "opponent" });
    expect(result.messages[0]).toContain(dataManager.getItem(I.razorFang).displayName);
  });

  it("given Razor Fang and RNG fails, when on hit triggers, then does not cause flinch", () => {
    // Source: Bulbapedia — Razor Fang: 10% chance (RNG fail = no flinch)
    const ctx = createHeldItemContext({ heldItem: I.razorFang, damage: 50, rngChance: false });
    (ctx as any).move = dataManager.getMove(M.aerialAce);
    const result = applyGen4HeldItem(TRIGGERS.onHit, ctx);

    expect(result.activated).toBe(false);
  });

  it("given Razor Fang with ineligible move (has secondary effect), when on hit triggers, then does NOT flinch", () => {
    // Source: Showdown Gen 4 mod — King's Rock/Razor Fang only work on ~200 whitelisted moves
    // "thunderbolt" is NOT in the whitelist (it has a 10% paralysis secondary effect)
    const ctx = createHeldItemContext({ heldItem: I.razorFang, damage: 50, rngChance: true });
    (ctx as any).move = dataManager.getMove(CORE_MOVE_IDS.thunderbolt);
    const result = applyGen4HeldItem(TRIGGERS.onHit, ctx);

    expect(result.activated).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// on hit: Life Orb (NEW in Gen 4)
// ---------------------------------------------------------------------------

describe("applyGen4HeldItem on hit — Life Orb (NEW in Gen 4)", () => {
  it("given Life Orb with 160 max HP, when on hit triggers with damage dealt, then recoil = floor(160/10) = 16", () => {
    // Source: Bulbapedia — Life Orb: floor(maxHP/10) recoil per hit (1.3x boost in damage calc)
    // Derivation: floor(160/10) = 16
    const ctx = createHeldItemContext({ heldItem: I.lifeOrb, maxHp: 160, damage: 80 });
    const result = applyGen4HeldItem(TRIGGERS.onHit, ctx);

    expect(result.activated).toBe(true);
    expect(result.effects[0]).toMatchObject({ type: "chip-damage", value: 16 });
    expect(result.messages[0]).toContain(dataManager.getItem(I.lifeOrb).displayName);
  });

  it("given Life Orb with 200 max HP, when on hit triggers with damage dealt, then recoil = floor(200/10) = 20", () => {
    // Source: Bulbapedia — Life Orb recoil = floor(maxHP/10)
    // Derivation: floor(200/10) = 20
    const ctx = createHeldItemContext({ heldItem: I.lifeOrb, maxHp: 200, damage: 100 });
    const result = applyGen4HeldItem(TRIGGERS.onHit, ctx);

    expect(result.effects[0]).toMatchObject({ type: "chip-damage", value: 20 });
  });

  it("given Life Orb and 0 damage dealt, when on hit triggers, then does not activate (status moves)", () => {
    // Source: Showdown Gen 4 mod — Life Orb does not trigger on 0-damage moves
    const ctx = createHeldItemContext({ heldItem: I.lifeOrb, maxHp: 160, damage: 0 });
    const result = applyGen4HeldItem(TRIGGERS.onHit, ctx);

    expect(result.activated).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// on hit: King's Rock (same as Gen 3)
// ---------------------------------------------------------------------------

describe("applyGen4HeldItem on hit — King's Rock", () => {
  it("given King's Rock with eligible move and RNG succeeds, when on hit triggers, then causes flinch", () => {
    // Source: Showdown Gen 4 mod — King's Rock 10% flinch, only on eligible moves (whitelist)
    // "tackle" is in the KINGS_ROCK_ELIGIBLE_MOVES whitelist
    const ctx = createHeldItemContext({ heldItem: I.kingsRock, damage: 50, rngChance: true });
    (ctx as any).move = dataManager.getMove(CORE_MOVE_IDS.tackle);
    const result = applyGen4HeldItem(TRIGGERS.onHit, ctx);

    expect(result.activated).toBe(true);
    expect(result.effects[0]).toMatchObject({ type: "flinch", target: "opponent" });
  });

  it("given King's Rock with ineligible move, when on hit triggers, then does NOT flinch", () => {
    // Source: Showdown Gen 4 mod — King's Rock only works on ~200 whitelisted moves
    // "ice-beam" is NOT in the whitelist (it has a 10% freeze secondary effect)
    const ctx = createHeldItemContext({ heldItem: I.kingsRock, damage: 50, rngChance: true });
    (ctx as any).move = dataManager.getMove(M.iceBeam);
    const result = applyGen4HeldItem(TRIGGERS.onHit, ctx);

    expect(result.activated).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// on hit: Shell Bell (same as Gen 3)
// ---------------------------------------------------------------------------

describe("applyGen4HeldItem on hit — Shell Bell", () => {
  it("given Shell Bell and 80 damage dealt, when on hit triggers, then heals 10 HP (floor(80/8))", () => {
    // Source: Showdown Gen 4 mod — Shell Bell heals floor(damageDealt/8) (unchanged from Gen 3)
    // Derivation: floor(80/8) = 10
    const ctx = createHeldItemContext({ heldItem: I.shellBell, damage: 80 });
    const result = applyGen4HeldItem(TRIGGERS.onHit, ctx);

    expect(result.activated).toBe(true);
    expect(result.effects[0]).toMatchObject({ type: "heal", value: 10 });
  });

  it("given Shell Bell and 0 damage dealt, when on hit triggers, then does not activate", () => {
    // Source: Showdown Gen 4 mod — Shell Bell requires damage > 0
    const ctx = createHeldItemContext({ heldItem: I.shellBell, damage: 0 });
    const result = applyGen4HeldItem(TRIGGERS.onHit, ctx);

    expect(result.activated).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// damage taken: Oran Berry
// ---------------------------------------------------------------------------

describe("applyGen4HeldItem damage taken — Oran Berry", () => {
  it("given Oran Berry and HP drops to 50% after damage, when damage is taken, then heals 10 HP", () => {
    // Source: Showdown Gen 4 mod — Oran Berry heals 10 HP flat (unchanged from Gen 3)
    // Derivation: maxHp=160, currentHp=120, damage=40 → hpAfterDamage=80 (50%), heal 10
    const ctx = createHeldItemContext({ heldItem: I.oranBerry, maxHp: 160, currentHp: 120, damage: 40 });
    const result = applyGen4HeldItem(TRIGGERS.onDamageTaken, ctx);

    expect(result.activated).toBe(true);
    expect(result.effects[0]).toMatchObject({ type: "heal", value: 10 });
    expect(result.effects[1]).toMatchObject({ type: "consume", value: I.oranBerry });
  });
});

// ---------------------------------------------------------------------------
// end of turn: remaining status-curing berries (coverage)
// ---------------------------------------------------------------------------

describe("applyGen4HeldItem end of turn — Chesto Berry", () => {
  it("given Chesto Berry and sleep status, when end of turn triggers, then wakes up and consumes berry", () => {
    // Source: Showdown Gen 4 mod — Chesto Berry cures sleep (same as Gen 3)
    const ctx = createHeldItemContext({ heldItem: I.chestoBerry, status: S.sleep });
    const result = applyGen4HeldItem(TRIGGERS.endOfTurn, ctx);

    expect(result.activated).toBe(true);
    expect(result.effects[0]).toMatchObject({ type: "status-cure" });
    expect(result.effects[1]).toMatchObject({ type: "consume", value: I.chestoBerry });
  });

  it("given Chesto Berry but no sleep status, when end of turn triggers, then does not activate", () => {
    const ctx = createHeldItemContext({ heldItem: I.chestoBerry, status: null });
    const result = applyGen4HeldItem(TRIGGERS.endOfTurn, ctx);

    expect(result.activated).toBe(false);
  });
});

describe("applyGen4HeldItem end of turn — Rawst Berry", () => {
  it("given Rawst Berry and burn status, when end of turn triggers, then cures burn and consumes berry", () => {
    // Source: Showdown Gen 4 mod — Rawst Berry cures burn (same as Gen 3)
    const ctx = createHeldItemContext({ heldItem: I.rawstBerry, status: S.burn });
    const result = applyGen4HeldItem(TRIGGERS.endOfTurn, ctx);

    expect(result.activated).toBe(true);
    expect(result.effects[0]).toMatchObject({ type: "status-cure" });
    expect(result.effects[1]).toMatchObject({ type: "consume", value: I.rawstBerry });
  });
});

describe("applyGen4HeldItem end of turn — Aspear Berry", () => {
  it("given Aspear Berry and freeze status, when end of turn triggers, then thaws out and consumes berry", () => {
    // Source: Showdown Gen 4 mod — Aspear Berry cures freeze (same as Gen 3)
    const ctx = createHeldItemContext({ heldItem: I.aspearBerry, status: S.freeze });
    const result = applyGen4HeldItem(TRIGGERS.endOfTurn, ctx);

    expect(result.activated).toBe(true);
    expect(result.effects[0]).toMatchObject({ type: "status-cure" });
    expect(result.effects[1]).toMatchObject({ type: "consume", value: I.aspearBerry });
  });
});

describe("applyGen4HeldItem end of turn — Persim Berry", () => {
  it("given Persim Berry and confusion, when end of turn triggers, then cures confusion and consumes berry", () => {
    // Source: Showdown Gen 4 mod — Persim Berry cures confusion (same as Gen 3)
    const ctx = createHeldItemContext({ heldItem: I.persimBerry, hasConfusion: true });
    const result = applyGen4HeldItem(TRIGGERS.endOfTurn, ctx);

    expect(result.activated).toBe(true);
    expect(result.effects[0]).toMatchObject({ type: "volatile-cure", value: V.confusion });
    expect(result.effects[1]).toMatchObject({ type: "consume", value: I.persimBerry });
  });

  it("given Persim Berry and no confusion, when end of turn triggers, then does not activate", () => {
    const ctx = createHeldItemContext({ heldItem: I.persimBerry });
    const result = applyGen4HeldItem(TRIGGERS.endOfTurn, ctx);

    expect(result.activated).toBe(false);
  });
});

describe("applyGen4HeldItem end of turn — Mental Herb", () => {
  it("given Mental Herb and infatuation, when end of turn triggers, then cures infatuation and consumes herb", () => {
    // Source: Showdown Gen 4 mod — Mental Herb cures infatuation (same as Gen 3)
    const ctx = createHeldItemContext({ heldItem: I.mentalHerb, hasInfatuation: true });
    const result = applyGen4HeldItem(TRIGGERS.endOfTurn, ctx);

    expect(result.activated).toBe(true);
    expect(result.effects[0]).toMatchObject({ type: "volatile-cure", value: V.infatuation });
    expect(result.effects[1]).toMatchObject({ type: "consume", value: I.mentalHerb });
  });

  it("given Mental Herb and no infatuation, when end of turn triggers, then does not activate", () => {
    const ctx = createHeldItemContext({ heldItem: I.mentalHerb });
    const result = applyGen4HeldItem(TRIGGERS.endOfTurn, ctx);

    expect(result.activated).toBe(false);
  });
});

describe("applyGen4HeldItem end of turn — Oran Berry", () => {
  it("given Oran Berry and HP at 50%, when end of turn triggers, then heals 10 HP and consumes", () => {
    // Source: Showdown Gen 4 mod — Oran Berry heals 10 HP flat (same as Gen 3)
    const ctx = createHeldItemContext({ heldItem: I.oranBerry, maxHp: 160, currentHp: 80 });
    const result = applyGen4HeldItem(TRIGGERS.endOfTurn, ctx);

    expect(result.activated).toBe(true);
    expect(result.effects[0]).toMatchObject({ type: "heal", value: 10 });
  });

  it("given Oran Berry and HP above 50%, when end of turn triggers, then does not activate", () => {
    const ctx = createHeldItemContext({ heldItem: I.oranBerry, maxHp: 160, currentHp: 120 });
    const result = applyGen4HeldItem(TRIGGERS.endOfTurn, ctx);

    expect(result.activated).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// No item / unknown item
// ---------------------------------------------------------------------------

describe("applyGen4HeldItem — no item or unknown trigger", () => {
  it("given no held item, when any trigger fires, then does not activate", () => {
    const ctx = createHeldItemContext({ heldItem: null });
    const endResult = applyGen4HeldItem(TRIGGERS.endOfTurn, ctx);
    const hitResult = applyGen4HeldItem(TRIGGERS.onHit, ctx);
    const damageResult = applyGen4HeldItem(TRIGGERS.onDamageTaken, ctx);

    expect(endResult.activated).toBe(false);
    expect(hitResult.activated).toBe(false);
    expect(damageResult.activated).toBe(false);
  });

  it("given an item and unknown trigger, when trigger fires, then does not activate", () => {
    const ctx = createHeldItemContext({ heldItem: I.leftovers });
    const result = applyGen4HeldItem("on-something-weird", ctx);

    expect(result.activated).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Status-curing berries (same as Gen 3, spot-check for Gen 4)
// ---------------------------------------------------------------------------

describe("applyGen4HeldItem end of turn — status-curing berries", () => {
  it("given Cheri Berry and paralysis status, when end of turn triggers, then cures paralysis and consumes berry", () => {
    // Source: Showdown Gen 4 mod — Cheri Berry cures paralysis (same as Gen 3)
    const ctx = createHeldItemContext({ heldItem: I.cheriBerry, status: S.paralysis });
    const result = applyGen4HeldItem(TRIGGERS.endOfTurn, ctx);

    expect(result.activated).toBe(true);
    expect(result.effects[0]).toMatchObject({ type: "status-cure" });
    expect(result.effects[1]).toMatchObject({ type: "consume", value: I.cheriBerry });
  });

  it("given Pecha Berry and badly-poisoned status, when end of turn triggers, then cures badly-poisoned", () => {
    // Source: Showdown Gen 4 mod — Pecha Berry cures both poison and badly-poisoned
    const ctx = createHeldItemContext({ heldItem: I.pechaBerry, status: S.badlyPoisoned });
    const result = applyGen4HeldItem(TRIGGERS.endOfTurn, ctx);

    expect(result.activated).toBe(true);
    expect(result.effects[0]).toMatchObject({ type: "status-cure" });
  });

  it("given Lum Berry with both burn status and confusion, when end of turn triggers, then cures both and consumes", () => {
    // Source: Showdown Gen 4 mod — Lum Berry cures all statuses and confusion
    const ctx = createHeldItemContext({ heldItem: I.lumBerry, status: S.burn, hasConfusion: true });
    const result = applyGen4HeldItem(TRIGGERS.endOfTurn, ctx);

    expect(result.activated).toBe(true);
    const types = result.effects.map((e) => e.type);
    expect(types).toContain("status-cure");
    expect(types).toContain("volatile-cure");
    expect(types).toContain("consume");
  });
});

// ---------------------------------------------------------------------------
// damage taken: Focus Band
// Focus Band is handled by Gen4Ruleset.capLethalDamage (pre-damage hook), NOT here.
// This prevents double-rolling the 10% chance when a single lethal hit fires both hooks.
// Source: Showdown sim/battle-actions.ts -- Focus Band onDamage (pre-damage priority)
// ---------------------------------------------------------------------------

describe("applyGen4HeldItem damage taken -- Focus Band (not handled here)", () => {
  it("given Focus Band and lethal damage, when damage taken triggers, then does NOT activate (handled by capLethalDamage instead)", () => {
    // Focus Band was moved to capLethalDamage to prevent double-rolling.
    // damage taken must return NO_ACTIVATION for Focus Band.
    const ctx = createHeldItemContext({
      heldItem: I.focusBand,
      maxHp: 160,
      currentHp: 50,
      damage: 200,
      rngChance: true,
    });
    const result = applyGen4HeldItem(TRIGGERS.onDamageTaken, ctx);

    expect(result.activated).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// capLethalDamage: Focus Band (10% chance to survive — authoritative handler)
// ---------------------------------------------------------------------------

describe("Gen4Ruleset.capLethalDamage -- Focus Band", () => {
  function createCapContext(opts: {
    heldItem?: string | null;
    currentHp: number;
    maxHp: number;
    rngChance?: boolean;
  }): { defender: ActivePokemon; state: BattleState } {
    const instance = createSyntheticPokemonInstance({
      heldItem: opts.heldItem ?? null,
      currentHp: opts.currentHp,
      maxHp: opts.maxHp,
    });
    const defender = {
      pokemon: instance,
      types: [],
      ability: A.none,
      volatileStatuses: new Map(),
    } as unknown as ActivePokemon;
    const state = {
      rng: {
        chance: (_p: number) => opts.rngChance ?? false,
        int: () => 0,
        next: () => 0,
        pick: <T>(arr: readonly T[]) => arr[0],
        shuffle: <T>(arr: readonly T[]) => [...arr],
        getState: () => 0,
        setState: () => {},
      },
    } as unknown as BattleState;
    return { defender, state };
  }

  it("given Focus Band at reduced HP and RNG succeeds, when lethal damage is dealt, then survives with exactly 1 HP remaining (currentHp - 1 = damage capped)", () => {
    // Source: Showdown Gen 4 mod -- Focus Band 10% activation
    // Fix: damage should be currentHp - 1 to leave exactly 1 HP, not maxHp - 1
    // Verification: currentHp=50, maxHp=160, damage=200 -> capped damage = 49 (leaves 1 HP)
    const { defender, state } = createCapContext({
      heldItem: I.focusBand,
      currentHp: 50,
      maxHp: 160,
      rngChance: true,
    });
    const ruleset = new Gen4Ruleset();
    const result = ruleset.capLethalDamage(200, defender, defender, {} as MoveData, state);

    expect(result.survived).toBe(true);
    expect(result.damage).toBe(49); // currentHp - 1 = 50 - 1 = 49; HP after = 50 - 49 = 1
    expect(result.messages[0]).toContain("Focus Band");
  });

  it("given Focus Band and RNG fails, when lethal damage is dealt, then does not survive", () => {
    // Source: Showdown Gen 4 mod -- Focus Band 10% chance, fails when RNG says no
    const { defender, state } = createCapContext({
      heldItem: I.focusBand,
      currentHp: 100,
      maxHp: 100,
      rngChance: false,
    });
    const ruleset = new Gen4Ruleset();
    const result = ruleset.capLethalDamage(100, defender, defender, {} as MoveData, state);

    expect(result.survived).toBe(false);
    expect(result.damage).toBe(100); // Original lethal damage unchanged
  });
});

// ---------------------------------------------------------------------------
// damage taken: Unknown item (default branch)
// ---------------------------------------------------------------------------

describe("applyGen4HeldItem damage taken -- unknown item", () => {
  it("given an unrecognized item, when damage taken trigger fires, then does not activate", () => {
    // Source: Showdown Gen 4 mod -- items not in the damage taken switch have no effect
    // This covers the default case in handleOnDamageTaken (Gen4Items.ts line 388)
    const ctx = createHeldItemContext({
      heldItem: I.silkScarf,
      maxHp: 160,
      currentHp: 50,
      damage: 200,
    });
    const result = applyGen4HeldItem(TRIGGERS.onDamageTaken, ctx);

    expect(result.activated).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// on hit: Unknown item (default branch)
// ---------------------------------------------------------------------------

describe("applyGen4HeldItem on hit -- unknown item", () => {
  it("given an unrecognized item, when on hit trigger fires, then does not activate", () => {
    // Source: Showdown Gen 4 mod -- items not in the on hit switch have no effect
    // This covers the default case in handleOnHit (Gen4Items.ts line 467)
    const ctx = createHeldItemContext({
      heldItem: I.leftovers,
      maxHp: 160,
      currentHp: 100,
      damage: 60,
    });
    const result = applyGen4HeldItem(TRIGGERS.onHit, ctx);

    expect(result.activated).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// on hit: King's Rock RNG fails (no flinch)
// ---------------------------------------------------------------------------

describe("applyGen4HeldItem on hit -- King's Rock RNG fail", () => {
  it("given King's Rock and RNG fails (90% of the time), when on hit trigger fires, then does not activate", () => {
    // Source: Showdown Gen 4 mod -- King's Rock 10% flinch chance, fails when RNG says no
    // This covers the false-branch of the RNG check (Gen4Items.ts line 417)
    const ctx = createHeldItemContext({
      heldItem: I.kingsRock,
      maxHp: 160,
      currentHp: 100,
      damage: 60,
      rngChance: false,
    });
    const result = applyGen4HeldItem(TRIGGERS.onHit, ctx);

    expect(result.activated).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// end of turn: Lum Berry — additional branch coverage
// ---------------------------------------------------------------------------

describe("applyGen4HeldItem end of turn — Lum Berry (branch coverage)", () => {
  it("given Lum Berry and no status and no confusion, when end of turn triggers, then does not activate", () => {
    // Source: Showdown Gen 4 mod — Lum Berry only activates when there is a status to cure
    // Covers the !hasPrimaryStatus && !hasConfusion early return (Gen4Items.ts line 164-165)
    const ctx = createHeldItemContext({ heldItem: I.lumBerry, status: null, hasConfusion: false });
    const result = applyGen4HeldItem(TRIGGERS.endOfTurn, ctx);

    expect(result.activated).toBe(false);
  });

  it("given Lum Berry with confusion only (no primary status), when end of turn triggers, then cures confusion and consumes", () => {
    // Source: Showdown Gen 4 mod — Lum Berry cures confusion even without a primary status
    // Covers the hasPrimaryStatus=false, hasConfusion=true branch (Gen4Items.ts line 168/171)
    const ctx = createHeldItemContext({ heldItem: I.lumBerry, status: null, hasConfusion: true });
    const result = applyGen4HeldItem(TRIGGERS.endOfTurn, ctx);

    expect(result.activated).toBe(true);
    const types = result.effects.map((e) => e.type);
    // Should NOT have status-cure (no primary status), but SHOULD have volatile-cure
    expect(types).not.toContain("status-cure");
    expect(types).toContain("volatile-cure");
    expect(types).toContain("consume");
    expect(result.effects.find((e) => e.type === "volatile-cure")).toMatchObject({
      value: V.confusion,
    });
  });
});

// ---------------------------------------------------------------------------
// end of turn: status-curing berries — wrong-status no-activation cases
// ---------------------------------------------------------------------------

describe("applyGen4HeldItem end of turn — status-curing berry wrong-status cases", () => {
  it("given Cheri Berry and burn status (not paralysis), when end of turn triggers, then does not activate", () => {
    // Source: Showdown Gen 4 mod — Cheri Berry only cures paralysis, not burn
    // Covers the no-activation branch (Gen4Items.ts line 194) when status != paralysis
    const ctx = createHeldItemContext({ heldItem: I.cheriBerry, status: S.burn });
    const result = applyGen4HeldItem(TRIGGERS.endOfTurn, ctx);

    expect(result.activated).toBe(false);
  });

  it("given Chesto Berry and burn status (not sleep), when end of turn triggers, then does not activate", () => {
    // Source: Showdown Gen 4 mod — Chesto Berry only cures sleep, not burn
    // Covers the no-activation branch (Gen4Items.ts line 210) when status != sleep
    const ctx = createHeldItemContext({ heldItem: I.chestoBerry, status: S.burn });
    const result = applyGen4HeldItem(TRIGGERS.endOfTurn, ctx);

    expect(result.activated).toBe(false);
  });

  it("given Pecha Berry and paralysis status (not poison/badly-poisoned), when end of turn triggers, then does not activate", () => {
    // Source: Showdown Gen 4 mod — Pecha Berry only cures poison/badly-poisoned, not paralysis
    // Covers the no-activation branch (Gen4Items.ts line 226) when status is unrelated
    const ctx = createHeldItemContext({ heldItem: I.pechaBerry, status: S.paralysis });
    const result = applyGen4HeldItem(TRIGGERS.endOfTurn, ctx);

    expect(result.activated).toBe(false);
  });

  it("given Rawst Berry and paralysis status (not burn), when end of turn triggers, then does not activate", () => {
    // Source: Showdown Gen 4 mod — Rawst Berry only cures burn, not paralysis
    // Covers the no-activation branch (Gen4Items.ts line 242) when status != burn
    const ctx = createHeldItemContext({ heldItem: I.rawstBerry, status: S.paralysis });
    const result = applyGen4HeldItem(TRIGGERS.endOfTurn, ctx);

    expect(result.activated).toBe(false);
  });

  it("given Aspear Berry and paralysis status (not freeze), when end of turn triggers, then does not activate", () => {
    // Source: Showdown Gen 4 mod — Aspear Berry only cures freeze, not paralysis
    // Covers the no-activation branch (Gen4Items.ts line 258) when status != freeze
    const ctx = createHeldItemContext({ heldItem: I.aspearBerry, status: S.paralysis });
    const result = applyGen4HeldItem(TRIGGERS.endOfTurn, ctx);

    expect(result.activated).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// damage taken: Sitrus Berry — KO damage does not trigger
// ---------------------------------------------------------------------------

describe("applyGen4HeldItem damage taken — Sitrus Berry KO edge case", () => {
  it("given Sitrus Berry and damage that exactly KOs (hpAfterDamage = 0), when damage taken, then does not activate (berry needs HP > 0 to heal)", () => {
    // Source: Showdown Gen 4 mod — Sitrus Berry only activates if hpAfterDamage > 0
    // If the hit KOs the Pokemon, Sitrus Berry does not proc (no one to heal)
    // Covers the hpAfterDamage <= 0 branch (Gen4Items.ts lines 383-385)
    const ctx = createHeldItemContext({
      heldItem: I.sitrusBerry,
      maxHp: 160,
      currentHp: 160,
      damage: 160, // Exactly KOs: hpAfterDamage = 0
    });
    const result = applyGen4HeldItem(TRIGGERS.onDamageTaken, ctx);

    expect(result.activated).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// damage taken: Oran Berry — HP stays above 50% (no activation)
// ---------------------------------------------------------------------------

describe("applyGen4HeldItem damage taken — Oran Berry HP stays above 50%", () => {
  it("given Oran Berry and small damage (HP stays above 50%), when damage taken, then does not activate", () => {
    // Source: Showdown Gen 4 mod — Oran Berry only triggers when hpAfterDamage <= floor(maxHP/2)
    // Covers the no-activation branch (Gen4Items.ts lines 383-385) for Oran Berry
    // Derivation: maxHp=160, currentHp=160, damage=10 → hpAfterDamage=150 > 80 (50%) → no trigger
    const ctx = createHeldItemContext({
      heldItem: I.oranBerry,
      maxHp: 160,
      currentHp: 160,
      damage: 10, // HP after = 150, still above 80 (50% of 160)
    });
    const result = applyGen4HeldItem(TRIGGERS.onDamageTaken, ctx);

    expect(result.activated).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// handleEndOfTurn — calculatedStats fallback (maxHp from currentHp)
// ---------------------------------------------------------------------------

describe("applyGen4HeldItem end of turn — calculatedStats hp fallback", () => {
  it("given Leftovers and Pokemon with no calculatedStats, when end of turn triggers, then heals using currentHp as max", () => {
    // Source: Showdown Gen 4 mod — maxHp = calculatedStats?.hp ?? currentHp
    // Covers the null calculatedStats fallback (Gen4Items.ts line 60)
    // Derivation: without calculatedStats, maxHp = currentHp = 160; floor(160/16) = 10
    const ctx = createHeldItemContext({ heldItem: I.leftovers, maxHp: 160 });
    // Remove calculatedStats to trigger fallback
    (ctx.pokemon.pokemon as { calculatedStats: null }).calculatedStats = null;
    const result = applyGen4HeldItem(TRIGGERS.endOfTurn, ctx);

    // maxHp fallback = currentHp = 160; floor(160/16) = 10
    expect(result.activated).toBe(true);
    expect(result.effects[0]).toMatchObject({ type: "heal", value: 10 });
  });

  it("given Life Orb and Pokemon with no calculatedStats, when on hit triggers, then recoil uses currentHp as max", () => {
    // Source: Bulbapedia — Life Orb recoil = floor(maxHP/10); fallback to currentHp when no stats
    // Covers the null calculatedStats fallback (Gen4Items.ts line 403)
    // Derivation: maxHp fallback = currentHp = 160; floor(160/10) = 16
    const ctx = createHeldItemContext({ heldItem: I.lifeOrb, maxHp: 160, damage: 80 });
    (ctx.pokemon.pokemon as { calculatedStats: null }).calculatedStats = null;
    const result = applyGen4HeldItem(TRIGGERS.onHit, ctx);

    expect(result.activated).toBe(true);
    expect(result.effects[0]).toMatchObject({ type: "chip-damage", value: 16 });
  });
});

// ---------------------------------------------------------------------------
// handleOnHit — Shell Bell with undefined damage (fallback to 0)
// ---------------------------------------------------------------------------

describe("applyGen4HeldItem on hit — Shell Bell with undefined damage", () => {
  it("given Shell Bell and no damage context (undefined), when on hit triggers, then does not activate", () => {
    // Source: Showdown Gen 4 mod — Shell Bell uses context.damage ?? 0; 0 damage = no activation
    // Covers the `context.damage ?? 0` fallback (Gen4Items.ts line 437) when damage is undefined
    const ctx = createHeldItemContext({ heldItem: I.shellBell }); // damage is undefined in createHeldItemContext
    const result = applyGen4HeldItem(TRIGGERS.onHit, ctx);

    expect(result.activated).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// handleOnHit — Life Orb with undefined damage (fallback to 0)
// ---------------------------------------------------------------------------

describe("applyGen4HeldItem on hit — Life Orb with undefined damage", () => {
  it("given Life Orb and no damage context (undefined), when on hit triggers, then does not activate", () => {
    // Source: Showdown Gen 4 mod — Life Orb uses context.damage ?? 0; 0 damage = no activation
    // Covers the `context.damage ?? 0` fallback (Gen4Items.ts line 454) when damage is undefined
    const ctx = createHeldItemContext({ heldItem: I.lifeOrb }); // damage is undefined
    const result = applyGen4HeldItem(TRIGGERS.onHit, ctx);

    expect(result.activated).toBe(false);
  });
});
