/**
 * Tests for Gen 5 item theft mechanics: Thief, Covet, and Pickpocket.
 *
 * - Thief (40 BP Dark physical): steals target's item after damage if user has no item
 * - Covet (60 BP Normal physical): identical steal logic to Thief
 * - Pickpocket (ability): steals attacker's item on contact if holder has no item
 *
 * All three trigger Unburden on the victim if applicable.
 *
 * Source: Showdown data/moves.ts -- thief.onAfterHit / covet.onAfterHit
 * Source: Showdown data/abilities.ts -- Pickpocket: onAfterMoveSecondary
 * Source: Bulbapedia -- Thief, Covet, Pickpocket
 */

import type {
  AbilityContext,
  ActivePokemon,
  BattleState,
  MoveEffectContext,
} from "@pokemon-lib-ts/battle";
import type { MoveData, PokemonType } from "@pokemon-lib-ts/core";
import { SeededRandom } from "@pokemon-lib-ts/core";
import { describe, expect, it } from "vitest";
import { handleGen5SwitchAbility } from "../src/Gen5AbilitiesSwitch";
import { handleGen5BehaviorMove } from "../src/Gen5MoveEffectsBehavior";

// ---------------------------------------------------------------------------
// Test helpers
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
  speciesId?: number;
  nickname?: string | null;
  movedThisTurn?: boolean;
  lastMoveUsed?: string | null;
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
      speciesId: overrides.speciesId ?? 1,
      nickname: overrides.nickname ?? null,
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
    lastMoveUsed: overrides.lastMoveUsed ?? null,
    lastDamageTaken: 0,
    lastDamageType: null,
    lastDamageCategory: null,
    turnsOnField: 0,
    movedThisTurn: overrides.movedThisTurn ?? false,
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
  priority?: number;
  contact?: boolean;
}): MoveData {
  return {
    id: overrides.id ?? "tackle",
    displayName: overrides.id ?? "Tackle",
    type: overrides.type ?? "normal",
    category: overrides.category ?? "physical",
    power: overrides.power ?? 50,
    accuracy: 100,
    pp: 5,
    priority: overrides.priority ?? 0,
    target: "adjacent-foe",
    flags: {
      contact: overrides.contact ?? false,
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
    generation: 5,
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
    generation: 5,
    turnNumber: 1,
    sides: [
      {
        index: 0,
        trainer: null,
        team: [],
        active: [null],
        hazards: [],
        screens: [],
        tailwind: { active: false, turnsLeft: 0 },
        luckyChant: { active: false, turnsLeft: 0 },
        wish: null,
        futureAttack: null,
        faintCount: 0,
        gimmickUsed: false,
      },
      {
        index: 1,
        trainer: null,
        team: [],
        active: [null],
        hazards: [],
        screens: [],
        tailwind: { active: false, turnsLeft: 0 },
        luckyChant: { active: false, turnsLeft: 0 },
        wish: null,
        futureAttack: null,
        faintCount: 0,
        gimmickUsed: false,
      },
    ],
    turnHistory: [],
  } as unknown as BattleState;
}

function makeContext(overrides: {
  attacker?: ActivePokemon;
  defender?: ActivePokemon;
  move?: MoveData;
  damage?: number;
  state?: BattleState;
  brokeSubstitute?: boolean;
}): MoveEffectContext {
  return {
    attacker: overrides.attacker ?? makeActive({}),
    defender: overrides.defender ?? makeActive({}),
    move: overrides.move ?? makeMove({}),
    damage: overrides.damage ?? 0,
    state: overrides.state ?? makeState(),
    rng: new SeededRandom(42),
    brokeSubstitute: overrides.brokeSubstitute ?? false,
  };
}

function makeAbilityContext(opts: {
  ability: string;
  trigger: string;
  types?: PokemonType[];
  opponent?: ActivePokemon;
  heldItem?: string | null;
  move?: MoveData;
  volatiles?: Map<string, { turnsLeft: number; data?: Record<string, unknown> }>;
}): AbilityContext {
  const state = makeState();
  const pokemon = makeActive({
    ability: opts.ability,
    types: opts.types,
    heldItem: opts.heldItem,
    volatiles: opts.volatiles,
  });

  return {
    pokemon,
    opponent: opts.opponent,
    state,
    trigger: opts.trigger,
    move: opts.move,
    rng: {
      next: () => 0,
      int: () => 1,
      chance: (_p: number) => false,
      pick: <T>(arr: readonly T[]) => arr[0] as T,
      shuffle: <T>(arr: T[]) => arr,
      getState: () => 0,
      setState: () => {},
    },
  } as unknown as AbilityContext;
}

// ===========================================================================
// THIEF MOVE
// ===========================================================================

describe("Gen 5 Thief -- item theft after damage", () => {
  // Source: Showdown data/moves.ts -- thief.onAfterHit:
  //   steals target's item if user has no item and target has one
  it("given user with no item and target with leftovers, when Thief deals damage, then returns itemTransfer from defender to attacker", () => {
    const attacker = makeActive({ heldItem: null, nickname: "Sneasel" });
    const defender = makeActive({ heldItem: "leftovers", nickname: "Blissey" });
    const move = makeMove({ id: "thief", type: "dark", category: "physical", power: 40 });
    const ctx = makeContext({ attacker, defender, move, damage: 50 });

    const result = handleGen5BehaviorMove(ctx);

    expect(result).not.toBeNull();
    expect(result!.itemTransfer).toEqual({ from: "defender", to: "attacker" });
    expect(result!.messages).toContain("Sneasel stole Blissey's leftovers!");
  });

  // Source: Showdown data/moves.ts -- thief.onAfterHit:
  //   `if (source.item || source.volatiles['gem']) return;` -- user already holding item
  it("given user already holding an item, when Thief deals damage, then does not steal", () => {
    const attacker = makeActive({ heldItem: "choice-band", nickname: "Sneasel" });
    const defender = makeActive({ heldItem: "leftovers", nickname: "Blissey" });
    const move = makeMove({ id: "thief", type: "dark", category: "physical", power: 40 });
    const ctx = makeContext({ attacker, defender, move, damage: 50 });

    const result = handleGen5BehaviorMove(ctx);

    expect(result).not.toBeNull();
    expect(result!.itemTransfer).toBeUndefined();
    expect(result!.messages).toEqual([]);
  });

  // Source: Showdown data/moves.ts -- thief.onAfterHit:
  //   `let yourItem = target.takeItem(source); if (!yourItem) return;` -- target has no item
  it("given target with no item, when Thief deals damage, then does not steal", () => {
    const attacker = makeActive({ heldItem: null, nickname: "Sneasel" });
    const defender = makeActive({ heldItem: null, nickname: "Blissey" });
    const move = makeMove({ id: "thief", type: "dark", category: "physical", power: 40 });
    const ctx = makeContext({ attacker, defender, move, damage: 50 });

    const result = handleGen5BehaviorMove(ctx);

    expect(result).not.toBeNull();
    expect(result!.itemTransfer).toBeUndefined();
    expect(result!.messages).toEqual([]);
  });

  // Source: Showdown data/moves.ts -- thief uses onAfterHit (not onHit):
  //   onAfterHit only fires when damage > 0
  it("given damage is 0 (type immunity), when Thief is used, then does not steal", () => {
    const attacker = makeActive({ heldItem: null, nickname: "Sneasel" });
    const defender = makeActive({ heldItem: "leftovers", nickname: "Sableye" });
    const move = makeMove({ id: "thief", type: "dark", category: "physical", power: 40 });
    const ctx = makeContext({ attacker, defender, move, damage: 0 });

    const result = handleGen5BehaviorMove(ctx);

    expect(result).not.toBeNull();
    expect(result!.itemTransfer).toBeUndefined();
    expect(result!.messages).toEqual([]);
  });
});

// ===========================================================================
// COVET MOVE
// ===========================================================================

describe("Gen 5 Covet -- item theft after damage (same logic as Thief)", () => {
  // Source: Showdown data/moves.ts -- covet.onAfterHit: identical steal logic to thief
  it("given user with no item and target with berry, when Covet deals damage, then returns itemTransfer", () => {
    const attacker = makeActive({ heldItem: null, nickname: "Cinccino" });
    const defender = makeActive({ heldItem: "sitrus-berry", nickname: "Chansey" });
    const move = makeMove({ id: "covet", type: "normal", category: "physical", power: 60 });
    const ctx = makeContext({ attacker, defender, move, damage: 45 });

    const result = handleGen5BehaviorMove(ctx);

    expect(result).not.toBeNull();
    expect(result!.itemTransfer).toEqual({ from: "defender", to: "attacker" });
    expect(result!.messages).toContain("Cinccino stole Chansey's sitrus-berry!");
  });

  // Source: Showdown data/moves.ts -- covet.onAfterHit:
  //   same `if (source.item) return;` check as thief
  it("given user already holding an item, when Covet deals damage, then does not steal", () => {
    const attacker = makeActive({ heldItem: "life-orb", nickname: "Cinccino" });
    const defender = makeActive({ heldItem: "sitrus-berry", nickname: "Chansey" });
    const move = makeMove({ id: "covet", type: "normal", category: "physical", power: 60 });
    const ctx = makeContext({ attacker, defender, move, damage: 45 });

    const result = handleGen5BehaviorMove(ctx);

    expect(result).not.toBeNull();
    expect(result!.itemTransfer).toBeUndefined();
    expect(result!.messages).toEqual([]);
  });
});

// ===========================================================================
// UNBURDEN INTERACTION (Thief/Covet)
// ===========================================================================

describe("Gen 5 Thief/Covet -- Unburden interaction", () => {
  // Source: Showdown data/abilities.ts -- Unburden: activates when item is lost by any means
  // Source: Bulbapedia -- Unburden: "Doubles Speed when held item is used or lost."
  it("given target has Unburden ability, when Thief steals its item, then sets unburden volatile on target", () => {
    const attacker = makeActive({ heldItem: null, nickname: "Sneasel" });
    const defender = makeActive({
      heldItem: "leftovers",
      ability: "unburden",
      nickname: "Hitmonlee",
    });
    const move = makeMove({ id: "thief", type: "dark", category: "physical", power: 40 });
    const ctx = makeContext({ attacker, defender, move, damage: 50 });

    const result = handleGen5BehaviorMove(ctx);

    expect(result).not.toBeNull();
    expect(result!.itemTransfer).toEqual({ from: "defender", to: "attacker" });
    expect(defender.volatileStatuses.has("unburden")).toBe(true);
    expect(defender.volatileStatuses.get("unburden")!.turnsLeft).toBe(-1);
  });

  // Source: Showdown data/abilities.ts -- Unburden volatile is permanent once set
  it("given target already has unburden volatile, when Covet steals item, then does not duplicate the volatile", () => {
    const existingVolatiles = new Map([["unburden", { turnsLeft: -1 }]]);
    const attacker = makeActive({ heldItem: null, nickname: "Cinccino" });
    const defender = makeActive({
      heldItem: "focus-sash",
      ability: "unburden",
      nickname: "Hitmonlee",
      volatiles: existingVolatiles,
    });
    const move = makeMove({ id: "covet", type: "normal", category: "physical", power: 60 });
    const ctx = makeContext({ attacker, defender, move, damage: 45 });

    const result = handleGen5BehaviorMove(ctx);

    expect(result).not.toBeNull();
    expect(result!.itemTransfer).toEqual({ from: "defender", to: "attacker" });
    // Volatile should still be there with original value (not duplicated or reset)
    expect(defender.volatileStatuses.has("unburden")).toBe(true);
    expect(defender.volatileStatuses.get("unburden")!.turnsLeft).toBe(-1);
  });
});

// ===========================================================================
// PICKPOCKET ABILITY
// ===========================================================================

describe("Gen 5 Pickpocket -- item theft on contact", () => {
  // Source: Showdown data/abilities.ts -- Pickpocket:
  //   steals attacker's item on contact if holder has no item and attacker has one.
  //   ctx.pokemon = defender with Pickpocket, ctx.opponent = attacker
  // Source: Bulbapedia -- Pickpocket: "Steals an item from an attacker that made contact."
  it("given Pickpocket holder has no item and attacker has one, when contact move is used, then steals the item via direct mutation", () => {
    const attacker = makeActive({ heldItem: "life-orb", nickname: "Attacker" });
    const defender = makeActive({
      ability: "pickpocket",
      heldItem: null,
      nickname: "Pickpocket Mon",
    });
    const move = makeMove({ id: "tackle", contact: true });

    const ctx = makeAbilityContext({
      ability: "pickpocket",
      trigger: "on-contact",
      heldItem: null,
      opponent: attacker,
      move,
    });

    const result = handleGen5SwitchAbility("on-contact", ctx);

    expect(result.activated).toBe(true);
    // Direct mutation: item transferred from opponent to holder
    expect(ctx.pokemon.pokemon.heldItem).toBe("life-orb");
    expect(attacker.pokemon.heldItem).toBeNull();
    expect(result.messages[0]).toContain("Pickpocket");
    expect(result.messages[0]).toContain("life-orb");
  });

  // Source: Showdown data/abilities.ts -- Pickpocket:
  //   `if (pokemon.item) return;` -- holder already has an item
  it("given Pickpocket holder already has an item, when contact move is used, then does not steal", () => {
    const attacker = makeActive({ heldItem: "life-orb", nickname: "Attacker" });
    const ctx = makeAbilityContext({
      ability: "pickpocket",
      trigger: "on-contact",
      heldItem: "leftovers",
      opponent: attacker,
      move: makeMove({ id: "tackle", contact: true }),
    });

    const result = handleGen5SwitchAbility("on-contact", ctx);

    expect(result.activated).toBe(false);
    // No mutation should occur
    expect(attacker.pokemon.heldItem).toBe("life-orb");
  });

  // Source: Showdown data/abilities.ts -- Pickpocket:
  //   `let yourItem = source.takeItem(); if (!yourItem) return;` -- attacker has no item
  it("given attacker has no item, when contact move hits Pickpocket holder, then does not steal", () => {
    const attacker = makeActive({ heldItem: null, nickname: "Attacker" });
    const ctx = makeAbilityContext({
      ability: "pickpocket",
      trigger: "on-contact",
      heldItem: null,
      opponent: attacker,
      move: makeMove({ id: "tackle", contact: true }),
    });

    const result = handleGen5SwitchAbility("on-contact", ctx);

    expect(result.activated).toBe(false);
  });

  // Source: Showdown data/abilities.ts -- Unburden activates when item is lost by any means
  // Source: Bulbapedia -- Unburden: "Doubles Speed when held item is used or lost."
  it("given attacker has Unburden, when Pickpocket steals its item, then sets unburden volatile on attacker", () => {
    const attacker = makeActive({
      heldItem: "choice-scarf",
      ability: "unburden",
      nickname: "Hitmonlee",
    });
    const ctx = makeAbilityContext({
      ability: "pickpocket",
      trigger: "on-contact",
      heldItem: null,
      opponent: attacker,
      move: makeMove({ id: "tackle", contact: true }),
    });

    const result = handleGen5SwitchAbility("on-contact", ctx);

    expect(result.activated).toBe(true);
    // Direct mutation: item transferred
    expect(ctx.pokemon.pokemon.heldItem).toBe("choice-scarf");
    expect(attacker.pokemon.heldItem).toBeNull();
    // Unburden volatile set on victim (the attacker who lost the item)
    expect(attacker.volatileStatuses.has("unburden")).toBe(true);
    expect(attacker.volatileStatuses.get("unburden")!.turnsLeft).toBe(-1);
  });
});

// ===========================================================================
// THIEF/COVET -- SUBSTITUTE GUARD (Qodo Issue #3)
// ===========================================================================

describe("Gen 5 Thief/Covet -- cannot steal through Substitute", () => {
  // Source: Showdown sim/battle-actions.ts -- onAfterHit only fires when the target is hit directly.
  // When the move breaks a Substitute, the Pokemon itself was not hit -- no theft allowed.
  it("given defender has a Substitute that is broken, when Thief deals damage, then does not steal", () => {
    const attacker = makeActive({ heldItem: null, nickname: "Sneasel" });
    const defender = makeActive({ heldItem: "leftovers", nickname: "Blissey" });
    defender.volatileStatuses.set("substitute", { turnsLeft: -1 });
    const move = makeMove({ id: "thief", type: "dark", category: "physical", power: 40 });
    // brokeSubstitute: true -- the hit destroyed the sub
    const ctx = makeContext({ attacker, defender, move, damage: 50, brokeSubstitute: true });

    const result = handleGen5BehaviorMove(ctx);

    expect(result).not.toBeNull();
    expect(result!.itemTransfer).toBeUndefined();
    expect(result!.messages).toEqual([]);
  });

  // Source: Showdown sim/battle-actions.ts -- onAfterHit only fires on direct hits.
  // If the Substitute is still up (hit did not break it), theft is also blocked.
  it("given defender has an active Substitute (hit absorbed, sub survives), when Thief deals damage, then does not steal", () => {
    const attacker = makeActive({ heldItem: null, nickname: "Sneasel" });
    const defender = makeActive({ heldItem: "leftovers", nickname: "Blissey" });
    defender.volatileStatuses.set("substitute", { turnsLeft: -1 });
    // substituteHp > 0 simulated by the volatile still being present and brokeSubstitute: false
    const move = makeMove({ id: "thief", type: "dark", category: "physical", power: 40 });
    const ctx = makeContext({ attacker, defender, move, damage: 30, brokeSubstitute: false });

    const result = handleGen5BehaviorMove(ctx);

    expect(result).not.toBeNull();
    expect(result!.itemTransfer).toBeUndefined();
    expect(result!.messages).toEqual([]);
  });
});

// ===========================================================================
// THIEF/COVET -- GEM GUARD (Qodo Issue #2)
// ===========================================================================

describe("Gen 5 Thief/Covet -- cannot steal when user consumed a Gem this move", () => {
  // Source: Showdown data/moves.ts -- thief/covet onAfterHit:
  //   `if (source.item || source.volatiles['gem']) return;`
  // The gem-used volatile is set by Gen5DamageCalc when a gem item is consumed.
  it("given user consumed a gem (gem-used volatile present), when Thief deals damage, then does not steal", () => {
    const attacker = makeActive({ heldItem: null, nickname: "Sneasel" });
    // Simulate post-gem-consumption: heldItem is null but gem-used volatile is set
    attacker.volatileStatuses.set("gem-used", { turnsLeft: 1 });
    const defender = makeActive({ heldItem: "leftovers", nickname: "Blissey" });
    const move = makeMove({ id: "thief", type: "dark", category: "physical", power: 40 });
    const ctx = makeContext({ attacker, defender, move, damage: 50 });

    const result = handleGen5BehaviorMove(ctx);

    expect(result).not.toBeNull();
    expect(result!.itemTransfer).toBeUndefined();
    expect(result!.messages).toEqual([]);
  });

  // Triangulation: without the gem-used volatile, theft proceeds normally.
  it("given user has no item and no gem-used volatile, when Thief deals damage, then steals normally", () => {
    const attacker = makeActive({ heldItem: null, nickname: "Sneasel" });
    const defender = makeActive({ heldItem: "leftovers", nickname: "Blissey" });
    const move = makeMove({ id: "thief", type: "dark", category: "physical", power: 40 });
    const ctx = makeContext({ attacker, defender, move, damage: 50 });

    const result = handleGen5BehaviorMove(ctx);

    expect(result).not.toBeNull();
    expect(result!.itemTransfer).toEqual({ from: "defender", to: "attacker" });
    expect(result!.messages).toContain("Sneasel stole Blissey's leftovers!");
  });
});
