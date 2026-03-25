/**
 * Targeted coverage tests for Gen6AbilitiesSwitch.ts and Gen6AbilitiesDamage.ts
 * low-branch-coverage handlers.
 *
 * Covers contact abilities (Aftermath, Pickpocket, Cute Charm, Mummy, Effect Spore,
 * Poison Touch), switch-out (Natural Cure), on-damage-taken (Cursed Body, Rattled,
 * Illusion), on-status-inflicted (Synchronize), passive-immunity (Sweet Veil,
 * Overcoat, Flash Fire, Water Absorb), on-stat-change (Big Pecks, Flower Veil),
 * and damage-calc abilities (Analytic, Sand Force, Adaptability, Marvel Scale,
 * Reckless, Guts, pinch abilities, Multiscale, Solid Rock, Thick Fat, Fur Coat,
 * -ate abilities, Parental Bond).
 *
 * Source: Showdown data/abilities.ts, Bulbapedia ability articles
 */
import type { AbilityContext, BattleSide, BattleState } from "@pokemon-lib-ts/battle";
import type { MoveData, PokemonInstance, PokemonType } from "@pokemon-lib-ts/core";
import { describe, expect, it } from "vitest";
import {
  handleGen6DamageCalcAbility,
  handleGen6DamageImmunityAbility,
} from "../src/Gen6AbilitiesDamage";
import { handleGen6SwitchAbility } from "../src/Gen6AbilitiesSwitch";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

let nextTestUid = 0;
function makeTestUid() {
  return `test-${nextTestUid++}`;
}

function makePokemon(overrides: {
  ability?: string;
  types?: PokemonType[];
  nickname?: string | null;
  currentHp?: number;
  maxHp?: number;
  speciesId?: number;
  status?: string | null;
  heldItem?: string | null;
  gender?: "male" | "female" | "genderless";
  uid?: string;
}) {
  const maxHp = overrides.maxHp ?? 200;
  return {
    pokemon: {
      uid: overrides.uid ?? makeTestUid(),
      speciesId: overrides.speciesId ?? 1,
      nickname: overrides.nickname ?? null,
      level: 50,
      currentHp: overrides.currentHp ?? maxHp,
      status: (overrides.status ?? null) as PokemonInstance["status"],
      heldItem: overrides.heldItem ?? null,
      ability: overrides.ability ?? "",
      calculatedStats: {
        hp: maxHp,
        attack: 100,
        defense: 100,
        spAttack: 100,
        spDefense: 100,
        speed: 100,
      },
      moves: [],
      gender: overrides.gender ?? "male",
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
    types: overrides.types ?? ["normal"],
    ability: overrides.ability ?? "",
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
    isMega: false,
    isDynamaxed: false,
    dynamaxTurnsLeft: 0,
    isTerastallized: false,
    teraType: null,
    stellarBoostedTypes: [],
    forcedMove: null,
  };
}

function makeState(overrides?: {
  weather?: { type: string; turnsLeft: number } | null;
  format?: string;
  rngNext?: number;
}): BattleState {
  return {
    phase: "turn-end",
    generation: 6,
    format: overrides?.format ?? "singles",
    turnNumber: 1,
    sides: [
      {
        index: 0,
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
        gimmickUsed: false,
      } as unknown as BattleSide,
      {
        index: 1,
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
        gimmickUsed: false,
      } as unknown as BattleSide,
    ],
    weather: overrides?.weather ?? null,
    terrain: null,
    trickRoom: { active: false, turnsLeft: 0 },
    magicRoom: { active: false, turnsLeft: 0 },
    wonderRoom: { active: false, turnsLeft: 0 },
    gravity: { active: false, turnsLeft: 0 },
    turnHistory: [],
    rng: {
      next: () => overrides?.rngNext ?? 0,
      int: () => 0,
      chance: () => true,
      pick: <T>(arr: readonly T[]) => arr[0] as T,
      shuffle: <T>(arr: T[]) => arr,
      getState: () => 0,
      setState: () => {},
    },
    ended: false,
    winner: null,
  } as unknown as BattleState;
}

function makeMove(
  type: PokemonType,
  opts?: {
    id?: string;
    category?: "physical" | "special" | "status";
    power?: number | null;
    flags?: Record<string, boolean>;
    displayName?: string;
    effect?: { type: string; [key: string]: unknown } | null;
  },
): MoveData {
  return {
    id: opts?.id ?? "test-move",
    displayName: opts?.displayName ?? "Test Move",
    type,
    category: opts?.category ?? "physical",
    power: opts?.power ?? 80,
    accuracy: 100,
    pp: 10,
    maxPp: 10,
    priority: 0,
    target: "normal",
    flags: opts?.flags ?? {},
    effect: opts?.effect ?? null,
    critRate: 0,
    hasCrashDamage: false,
  } as MoveData;
}

function makeCtx(overrides: {
  ability: string;
  trigger: string;
  types?: PokemonType[];
  move?: MoveData;
  opponent?: ReturnType<typeof makePokemon>;
  state?: BattleState;
  nickname?: string | null;
  currentHp?: number;
  maxHp?: number;
  status?: string | null;
  heldItem?: string | null;
  speciesId?: number;
  gender?: "male" | "female" | "genderless";
  statChange?: { stages: number; source: string; stat?: string };
  isCrit?: boolean;
  typeEffectiveness?: number;
}): AbilityContext {
  const pokemon = makePokemon({
    ability: overrides.ability,
    types: overrides.types,
    nickname: overrides.nickname,
    currentHp: overrides.currentHp,
    maxHp: overrides.maxHp,
    status: overrides.status,
    heldItem: overrides.heldItem,
    speciesId: overrides.speciesId,
    gender: overrides.gender,
  });
  return {
    pokemon,
    opponent: overrides.opponent ?? undefined,
    state: overrides.state ?? makeState(),
    rng: (overrides.state ?? makeState()).rng,
    trigger: overrides.trigger,
    move: overrides.move,
    statChange: overrides.statChange,
    isCrit: overrides.isCrit,
    typeEffectiveness: overrides.typeEffectiveness,
  } as unknown as AbilityContext;
}

// ===========================================================================
// handleGen6SwitchAbility — on-contact abilities
// ===========================================================================

describe("handleGen6SwitchAbility — on-contact abilities", () => {
  it("given Aftermath + holder fainted (0 HP), when on-contact, then deals 1/4 chip damage", () => {
    // Source: Showdown data/abilities.ts -- Aftermath: 1/4 HP if holder fainted
    const foe = makePokemon({ maxHp: 200 });
    const ctx = makeCtx({
      ability: "aftermath",
      trigger: "on-contact",
      currentHp: 0,
      opponent: foe,
    });
    const result = handleGen6SwitchAbility("on-contact", ctx);
    expect(result.activated).toBe(true);
    // 1/4 of 200 = 50
    expect(result.effects[0]).toEqual(
      expect.objectContaining({ effectType: "chip-damage", value: 50 }),
    );
  });

  it("given Aftermath + holder alive, when on-contact, then does not activate", () => {
    // Source: Showdown -- Aftermath only fires when holder has fainted
    const foe = makePokemon({});
    const ctx = makeCtx({
      ability: "aftermath",
      trigger: "on-contact",
      currentHp: 100,
      opponent: foe,
    });
    const result = handleGen6SwitchAbility("on-contact", ctx);
    expect(result.activated).toBe(false);
  });

  it("given Mummy + attacker with suppressable ability, when on-contact, then changes to Mummy", () => {
    // Source: Showdown data/abilities.ts -- Mummy overwrites attacker ability
    const foe = makePokemon({ ability: "intimidate" });
    const ctx = makeCtx({
      ability: "mummy",
      trigger: "on-contact",
      opponent: foe,
    });
    const result = handleGen6SwitchAbility("on-contact", ctx);
    expect(result.activated).toBe(true);
    expect(result.effects[0]).toEqual(
      expect.objectContaining({ effectType: "ability-change", newAbility: "mummy" }),
    );
  });

  it("given Mummy + attacker with Stance Change, when on-contact, then does not overwrite", () => {
    // Source: Showdown -- Stance Change is unsuppressable
    const foe = makePokemon({ ability: "stance-change" });
    const ctx = makeCtx({
      ability: "mummy",
      trigger: "on-contact",
      opponent: foe,
    });
    const result = handleGen6SwitchAbility("on-contact", ctx);
    expect(result.activated).toBe(false);
  });

  it("given Mummy + attacker already has Mummy, when on-contact, then does not activate", () => {
    // Source: Showdown -- cannot Mummy an already-Mummy Pokemon
    const foe = makePokemon({ ability: "mummy" });
    const ctx = makeCtx({
      ability: "mummy",
      trigger: "on-contact",
      opponent: foe,
    });
    const result = handleGen6SwitchAbility("on-contact", ctx);
    expect(result.activated).toBe(false);
  });

  it("given Poison Touch + opponent has no status + RNG succeeds, when on-contact, then poisons", () => {
    // Source: Showdown data/abilities.ts -- Poison Touch: 30% poison on contact
    const foe = makePokemon({});
    const state = makeState({ rngNext: 0.1 }); // < 0.3
    const ctx = makeCtx({
      ability: "poison-touch",
      trigger: "on-contact",
      opponent: foe,
      state,
    });
    const result = handleGen6SwitchAbility("on-contact", ctx);
    expect(result.activated).toBe(true);
    expect(result.effects[0]).toEqual(
      expect.objectContaining({ effectType: "status-inflict", status: "poison" }),
    );
  });

  it("given Poison Touch + opponent already statused, when on-contact, then does not activate", () => {
    // Source: Showdown -- cannot inflict status if already statused
    const foe = makePokemon({ status: "burn" });
    const ctx = makeCtx({
      ability: "poison-touch",
      trigger: "on-contact",
      opponent: foe,
    });
    const result = handleGen6SwitchAbility("on-contact", ctx);
    expect(result.activated).toBe(false);
  });

  it("given Pickpocket + defender has no item + attacker has item, when on-contact, then steals", () => {
    // Source: Showdown data/abilities.ts -- Pickpocket steals attacker's item
    const foe = makePokemon({ heldItem: "life-orb" });
    const ctx = makeCtx({
      ability: "pickpocket",
      trigger: "on-contact",
      heldItem: null,
      opponent: foe,
    });
    const result = handleGen6SwitchAbility("on-contact", ctx);
    expect(result.activated).toBe(true);
    expect(result.messages[0]).toContain("life-orb");
  });

  it("given Pickpocket + defender already has item, when on-contact, then does not steal", () => {
    // Source: Showdown -- Pickpocket only works if holder has no item
    const foe = makePokemon({ heldItem: "life-orb" });
    const ctx = makeCtx({
      ability: "pickpocket",
      trigger: "on-contact",
      heldItem: "leftovers",
      opponent: foe,
    });
    const result = handleGen6SwitchAbility("on-contact", ctx);
    expect(result.activated).toBe(false);
  });

  it("given Cute Charm + opposite genders + RNG succeeds, when on-contact, then infatuates", () => {
    // Source: Showdown data/abilities.ts -- Cute Charm: 30% infatuation
    const foe = makePokemon({ gender: "male" });
    const state = makeState({ rngNext: 0.1 }); // < 0.3
    const ctx = makeCtx({
      ability: "cute-charm",
      trigger: "on-contact",
      gender: "female",
      opponent: foe,
      state,
    });
    const result = handleGen6SwitchAbility("on-contact", ctx);
    expect(result.activated).toBe(true);
    expect(result.effects[0]).toEqual(
      expect.objectContaining({ effectType: "volatile-inflict", volatile: "infatuation" }),
    );
  });

  it("given Cute Charm + same genders, when on-contact, then does not activate", () => {
    // Source: Showdown -- Cute Charm requires opposite genders
    const foe = makePokemon({ gender: "female" });
    const state = makeState({ rngNext: 0.1 });
    const ctx = makeCtx({
      ability: "cute-charm",
      trigger: "on-contact",
      gender: "female",
      opponent: foe,
      state,
    });
    const result = handleGen6SwitchAbility("on-contact", ctx);
    expect(result.activated).toBe(false);
  });

  it("given Cute Charm + genderless attacker, when on-contact, then does not activate", () => {
    // Source: Showdown -- Cute Charm fails vs genderless
    const foe = makePokemon({ gender: "genderless" });
    const state = makeState({ rngNext: 0.1 });
    const ctx = makeCtx({
      ability: "cute-charm",
      trigger: "on-contact",
      gender: "female",
      opponent: foe,
      state,
    });
    const result = handleGen6SwitchAbility("on-contact", ctx);
    expect(result.activated).toBe(false);
  });

  it("given Effect Spore + Grass-type attacker, when on-contact, then does not activate", () => {
    // Source: Showdown Gen 5+ -- Grass types immune to Effect Spore
    const foe = makePokemon({ types: ["grass"] });
    const state = makeState({ rngNext: 0 });
    const ctx = makeCtx({
      ability: "effect-spore",
      trigger: "on-contact",
      opponent: foe,
      state,
    });
    const result = handleGen6SwitchAbility("on-contact", ctx);
    expect(result.activated).toBe(false);
  });

  it("given Effect Spore + Overcoat attacker, when on-contact, then does not activate", () => {
    // Source: Showdown Gen 6 -- Overcoat blocks Effect Spore
    const foe = makePokemon({ ability: "overcoat" });
    const state = makeState({ rngNext: 0 });
    const ctx = makeCtx({
      ability: "effect-spore",
      trigger: "on-contact",
      opponent: foe,
      state,
    });
    const result = handleGen6SwitchAbility("on-contact", ctx);
    expect(result.activated).toBe(false);
  });

  it("given Effect Spore + roll 0-9, when on-contact, then causes sleep", () => {
    // Source: Showdown -- Effect Spore: 0-9 = sleep
    const foe = makePokemon({});
    // roll * 100 = 5 < 10 => sleep
    const state = makeState({ rngNext: 0.05 });
    const ctx = makeCtx({
      ability: "effect-spore",
      trigger: "on-contact",
      opponent: foe,
      state,
    });
    const result = handleGen6SwitchAbility("on-contact", ctx);
    expect(result.activated).toBe(true);
    expect(result.effects[0]).toEqual(expect.objectContaining({ status: "sleep" }));
  });

  it("given Effect Spore + roll 10-19, when on-contact, then causes paralysis", () => {
    // Source: Showdown -- Effect Spore: 10-19 = paralysis
    const foe = makePokemon({});
    const state = makeState({ rngNext: 0.15 }); // 15 < 20
    const ctx = makeCtx({
      ability: "effect-spore",
      trigger: "on-contact",
      opponent: foe,
      state,
    });
    const result = handleGen6SwitchAbility("on-contact", ctx);
    expect(result.activated).toBe(true);
    expect(result.effects[0]).toEqual(expect.objectContaining({ status: "paralysis" }));
  });

  it("given Effect Spore + roll 20-29, when on-contact, then causes poison", () => {
    // Source: Showdown -- Effect Spore: 20-29 = poison
    const foe = makePokemon({});
    const state = makeState({ rngNext: 0.25 }); // 25 < 30
    const ctx = makeCtx({
      ability: "effect-spore",
      trigger: "on-contact",
      opponent: foe,
      state,
    });
    const result = handleGen6SwitchAbility("on-contact", ctx);
    expect(result.activated).toBe(true);
    expect(result.effects[0]).toEqual(expect.objectContaining({ status: "poison" }));
  });

  it("given Effect Spore + roll 30+, when on-contact, then does not activate", () => {
    // Source: Showdown -- Effect Spore: 30-99 = nothing
    const foe = makePokemon({});
    const state = makeState({ rngNext: 0.5 }); // 50 >= 30
    const ctx = makeCtx({
      ability: "effect-spore",
      trigger: "on-contact",
      opponent: foe,
      state,
    });
    const result = handleGen6SwitchAbility("on-contact", ctx);
    expect(result.activated).toBe(false);
  });
});

// ===========================================================================
// handleGen6SwitchAbility — switch-out
// ===========================================================================

describe("handleGen6SwitchAbility — on-switch-out", () => {
  it("given Natural Cure + statused Pokemon, when on-switch-out, then cures status", () => {
    // Source: Showdown data/abilities.ts -- Natural Cure: cures status on switch-out
    const ctx = makeCtx({
      ability: "natural-cure",
      trigger: "on-switch-out",
      status: "paralysis",
    });
    const result = handleGen6SwitchAbility("on-switch-out", ctx);
    expect(result.activated).toBe(true);
    expect(result.effects[0]).toEqual(expect.objectContaining({ effectType: "status-cure" }));
  });

  it("given Natural Cure + no status, when on-switch-out, then does not activate", () => {
    // Source: Showdown -- no status to cure
    const ctx = makeCtx({
      ability: "natural-cure",
      trigger: "on-switch-out",
    });
    const result = handleGen6SwitchAbility("on-switch-out", ctx);
    expect(result.activated).toBe(false);
  });
});

// ===========================================================================
// handleGen6SwitchAbility — on-damage-taken
// ===========================================================================

describe("handleGen6SwitchAbility — on-damage-taken", () => {
  it("given Cursed Body + opponent + RNG succeeds, when on-damage-taken, then disables move", () => {
    // Source: Showdown data/abilities.ts -- Cursed Body: 30% disable
    const foe = makePokemon({});
    const state = makeState({ rngNext: 0.1 }); // < 0.3
    const ctx = makeCtx({
      ability: "cursed-body",
      trigger: "on-damage-taken",
      opponent: foe,
      state,
    });
    const result = handleGen6SwitchAbility("on-damage-taken", ctx);
    expect(result.activated).toBe(true);
    expect(result.effects[0]).toEqual(expect.objectContaining({ volatile: "disable" }));
  });

  it("given Cursed Body + opponent already disabled, when on-damage-taken, then does not activate", () => {
    // Source: Showdown -- cannot double-disable
    const foe = makePokemon({});
    foe.volatileStatuses.set("disable", { turnsLeft: 4 } as never);
    const state = makeState({ rngNext: 0 });
    const ctx = makeCtx({
      ability: "cursed-body",
      trigger: "on-damage-taken",
      opponent: foe,
      state,
    });
    const result = handleGen6SwitchAbility("on-damage-taken", ctx);
    expect(result.activated).toBe(false);
  });

  it("given Rattled + bug move, when on-damage-taken, then +1 Speed", () => {
    // Source: Showdown data/abilities.ts -- Rattled: +1 Speed on Bug/Dark/Ghost hit
    const ctx = makeCtx({
      ability: "rattled",
      trigger: "on-damage-taken",
      move: makeMove("bug"),
    });
    const result = handleGen6SwitchAbility("on-damage-taken", ctx);
    expect(result.activated).toBe(true);
    expect(result.effects[0]).toEqual(expect.objectContaining({ stat: "speed", stages: 1 }));
  });

  it("given Rattled + ghost move, when on-damage-taken, then +1 Speed", () => {
    // Source: Showdown -- Rattled fires for ghost type
    const ctx = makeCtx({
      ability: "rattled",
      trigger: "on-damage-taken",
      move: makeMove("ghost"),
    });
    const result = handleGen6SwitchAbility("on-damage-taken", ctx);
    expect(result.activated).toBe(true);
  });

  it("given Rattled + fire move, when on-damage-taken, then does not activate", () => {
    // Source: Showdown -- Rattled only for Bug/Dark/Ghost
    const ctx = makeCtx({
      ability: "rattled",
      trigger: "on-damage-taken",
      move: makeMove("fire"),
    });
    const result = handleGen6SwitchAbility("on-damage-taken", ctx);
    expect(result.activated).toBe(false);
  });

  it("given Illusion + has illusion volatile, when on-damage-taken, then breaks illusion", () => {
    // Source: Showdown data/abilities.ts -- Illusion breaks on damaging hit
    const pokemon = makePokemon({ ability: "illusion" });
    pokemon.volatileStatuses.set("illusion", { turnsLeft: -1 } as never);
    const ctx = {
      pokemon,
      state: makeState(),
      rng: makeState().rng,
      trigger: "on-damage-taken",
    } as unknown as AbilityContext;
    const result = handleGen6SwitchAbility("on-damage-taken", ctx);
    expect(result.activated).toBe(true);
    expect(result.messages[0]).toContain("Illusion was broken");
  });

  it("given Illusion + no illusion volatile, when on-damage-taken, then does not activate", () => {
    // Source: Showdown -- no illusion to break
    const ctx = makeCtx({
      ability: "illusion",
      trigger: "on-damage-taken",
    });
    const result = handleGen6SwitchAbility("on-damage-taken", ctx);
    expect(result.activated).toBe(false);
  });
});

// ===========================================================================
// handleGen6SwitchAbility — on-status-inflicted (Synchronize)
// ===========================================================================

describe("handleGen6SwitchAbility — on-status-inflicted", () => {
  it("given Synchronize + burn from opponent, when on-status-inflicted, then passes burn back", () => {
    // Source: Showdown data/abilities.ts -- Synchronize: passes burn/paralysis/poison
    const foe = makePokemon({});
    const ctx = makeCtx({
      ability: "synchronize",
      trigger: "on-status-inflicted",
      status: "burn",
      opponent: foe,
    });
    const result = handleGen6SwitchAbility("on-status-inflicted", ctx);
    expect(result.activated).toBe(true);
    expect(result.effects[0]).toEqual(
      expect.objectContaining({ effectType: "status-inflict", status: "burn" }),
    );
  });

  it("given Synchronize + sleep, when on-status-inflicted, then does not pass sleep", () => {
    // Source: Showdown -- Synchronize does not spread sleep or freeze
    const foe = makePokemon({});
    const ctx = makeCtx({
      ability: "synchronize",
      trigger: "on-status-inflicted",
      status: "sleep",
      opponent: foe,
    });
    const result = handleGen6SwitchAbility("on-status-inflicted", ctx);
    expect(result.activated).toBe(false);
  });
});

// ===========================================================================
// handleGen6SwitchAbility — passive-immunity
// ===========================================================================

describe("handleGen6SwitchAbility — passive-immunity", () => {
  it("given Sweet Veil + sleep move, when passive-immunity, then blocks sleep", () => {
    // Source: Showdown data/abilities.ts -- Sweet Veil: blocks sleep
    const ctx = makeCtx({
      ability: "sweet-veil",
      trigger: "passive-immunity",
      move: makeMove("normal", {
        id: "spore",
        category: "status",
        effect: { type: "status-guaranteed", status: "sleep" },
      }),
    });
    const result = handleGen6SwitchAbility("passive-immunity", ctx);
    expect(result.activated).toBe(true);
  });

  it("given Overcoat + powder move, when passive-immunity, then blocks powder", () => {
    // Source: Showdown data/mods/gen6/abilities.ts -- Overcoat blocks powder in Gen 6
    const ctx = makeCtx({
      ability: "overcoat",
      trigger: "passive-immunity",
      move: makeMove("grass", {
        id: "spore",
        flags: { powder: true },
        category: "status",
      }),
    });
    const result = handleGen6SwitchAbility("passive-immunity", ctx);
    expect(result.activated).toBe(true);
  });

  it("given on-accuracy-check trigger with Victory Star, when dispatching, then activates", () => {
    // Source: Showdown -- Victory Star: 1.1x accuracy for all allies
    const ctx = makeCtx({
      ability: "victory-star",
      trigger: "on-accuracy-check",
    });
    const result = handleGen6SwitchAbility("on-accuracy-check", ctx);
    expect(result.activated).toBe(true);
  });
});

// ===========================================================================
// handleGen6SwitchAbility — on-stat-change
// ===========================================================================

describe("handleGen6SwitchAbility — on-stat-change", () => {
  it("given Big Pecks + defense drop from opponent, when on-stat-change, then blocks it", () => {
    // Source: Showdown data/abilities.ts -- Big Pecks: prevents Defense drops
    const ctx = makeCtx({
      ability: "big-pecks",
      trigger: "on-stat-change",
      statChange: { stages: -1, source: "opponent", stat: "defense" },
    });
    const result = handleGen6SwitchAbility("on-stat-change", ctx);
    expect(result.activated).toBe(true);
  });
});

// ===========================================================================
// handleGen6SwitchAbility — switch-in abilities
// ===========================================================================

describe("handleGen6SwitchAbility — on-switch-in (additional abilities)", () => {
  it("given Imposter + opponent present, when on-switch-in, then transforms", () => {
    // Source: Showdown data/abilities.ts -- Imposter transforms on switch-in
    const foe = makePokemon({ nickname: "Pikachu" });
    const ctx = makeCtx({
      ability: "imposter",
      trigger: "on-switch-in",
      opponent: foe,
    });
    const result = handleGen6SwitchAbility("on-switch-in", ctx);
    expect(result.activated).toBe(true);
    expect(result.messages[0]).toContain("transformed");
  });

  it("given Illusion, when on-switch-in, then sets illusion volatile", () => {
    // Source: Showdown data/abilities.ts -- Illusion sets volatile on entry
    const ctx = makeCtx({
      ability: "illusion",
      trigger: "on-switch-in",
    });
    const result = handleGen6SwitchAbility("on-switch-in", ctx);
    expect(result.activated).toBe(true);
    expect(result.effects[0]).toEqual(expect.objectContaining({ volatile: "illusion" }));
  });

  it("given Stance Change + speciesId 681 (Aegislash), when on-switch-in, then activates", () => {
    // Source: Showdown data/abilities.ts -- Stance Change: Aegislash switch-in
    const ctx = makeCtx({
      ability: "stance-change",
      trigger: "on-switch-in",
      speciesId: 681,
    });
    const result = handleGen6SwitchAbility("on-switch-in", ctx);
    expect(result.activated).toBe(true);
  });

  it("given Stance Change + non-Aegislash, when on-switch-in, then does not activate", () => {
    // Source: Showdown -- Stance Change only for Aegislash
    const ctx = makeCtx({
      ability: "stance-change",
      trigger: "on-switch-in",
      speciesId: 25,
    });
    const result = handleGen6SwitchAbility("on-switch-in", ctx);
    expect(result.activated).toBe(false);
  });

  it("given Teravolt, when on-switch-in, then announces blazing aura", () => {
    // Source: Showdown data/abilities.ts -- Teravolt onStart
    const ctx = makeCtx({
      ability: "teravolt",
      trigger: "on-switch-in",
    });
    const result = handleGen6SwitchAbility("on-switch-in", ctx);
    expect(result.activated).toBe(true);
    expect(result.messages[0]).toContain("bursting aura");
  });

  it("given Turboblaze, when on-switch-in, then announces blazing aura", () => {
    // Source: Showdown data/abilities.ts -- Turboblaze onStart
    const ctx = makeCtx({
      ability: "turboblaze",
      trigger: "on-switch-in",
    });
    const result = handleGen6SwitchAbility("on-switch-in", ctx);
    expect(result.activated).toBe(true);
    expect(result.messages[0]).toContain("blazing aura");
  });

  it("given Download + opponent with lower Def than SpDef, when on-switch-in, then raises Attack", () => {
    // Source: Showdown data/abilities.ts -- Download: raise Atk if foe Def < SpDef
    const foe = makePokemon({});
    (foe.pokemon.calculatedStats as { defense: number }).defense = 80;
    (foe.pokemon.calculatedStats as { spDefense: number }).spDefense = 120;
    const ctx = makeCtx({
      ability: "download",
      trigger: "on-switch-in",
      opponent: foe,
    });
    const result = handleGen6SwitchAbility("on-switch-in", ctx);
    expect(result.activated).toBe(true);
    expect(result.effects[0]).toEqual(expect.objectContaining({ stat: "attack", stages: 1 }));
  });

  it("given Download + opponent with higher Def, when on-switch-in, then raises SpAtk", () => {
    // Source: Showdown -- Download: raise SpAtk if foe Def >= SpDef
    const foe = makePokemon({});
    (foe.pokemon.calculatedStats as { defense: number }).defense = 120;
    (foe.pokemon.calculatedStats as { spDefense: number }).spDefense = 80;
    const ctx = makeCtx({
      ability: "download",
      trigger: "on-switch-in",
      opponent: foe,
    });
    const result = handleGen6SwitchAbility("on-switch-in", ctx);
    expect(result.activated).toBe(true);
    expect(result.effects[0]).toEqual(expect.objectContaining({ stat: "spAttack", stages: 1 }));
  });

  it("given Trace + opponent with copyable ability, when on-switch-in, then copies ability", () => {
    // Source: Showdown data/abilities.ts -- Trace copies opponent's ability
    const foe = makePokemon({ ability: "intimidate" });
    const ctx = makeCtx({
      ability: "trace",
      trigger: "on-switch-in",
      opponent: foe,
    });
    const result = handleGen6SwitchAbility("on-switch-in", ctx);
    expect(result.activated).toBe(true);
    expect(result.effects[0]).toEqual(expect.objectContaining({ newAbility: "intimidate" }));
  });

  it("given Trace + opponent with uncopyable ability (Stance Change), when on-switch-in, then fails", () => {
    // Source: Showdown -- Trace cannot copy Stance Change
    const foe = makePokemon({ ability: "stance-change" });
    const ctx = makeCtx({
      ability: "trace",
      trigger: "on-switch-in",
      opponent: foe,
    });
    const result = handleGen6SwitchAbility("on-switch-in", ctx);
    expect(result.activated).toBe(false);
  });
});

// ===========================================================================
// handleGen6DamageCalcAbility — damage-calc abilities (remaining branches)
// ===========================================================================

describe("handleGen6DamageCalcAbility — remaining branches", () => {
  it("given Analytic + opponent already moved, when on-damage-calc, then activates", () => {
    // Source: Showdown data/abilities.ts -- Analytic: 1.3x if user moves last
    const foe = makePokemon({});
    foe.movedThisTurn = true;
    const ctx = makeCtx({
      ability: "analytic",
      trigger: "on-damage-calc",
      move: makeMove("normal"),
      opponent: foe,
    });
    const result = handleGen6DamageCalcAbility(ctx);
    expect(result.activated).toBe(true);
  });

  it("given Analytic + opponent has not moved, when on-damage-calc, then does not activate", () => {
    // Source: Showdown -- Analytic only fires if foe already moved
    const foe = makePokemon({});
    foe.movedThisTurn = false;
    const ctx = makeCtx({
      ability: "analytic",
      trigger: "on-damage-calc",
      move: makeMove("normal"),
      opponent: foe,
    });
    const result = handleGen6DamageCalcAbility(ctx);
    expect(result.activated).toBe(false);
  });

  it("given Sand Force + sandstorm + Rock move, when on-damage-calc, then activates", () => {
    // Source: Showdown data/abilities.ts -- Sand Force: 1.3x Rock/Ground/Steel in sand
    const state = makeState({ weather: { type: "sand", turnsLeft: 3 } });
    const ctx = makeCtx({
      ability: "sand-force",
      trigger: "on-damage-calc",
      move: makeMove("rock"),
      state,
    });
    const result = handleGen6DamageCalcAbility(ctx);
    expect(result.activated).toBe(true);
  });

  it("given Sand Force + sandstorm + Fire move, when on-damage-calc, then does not activate", () => {
    // Source: Showdown -- Sand Force only for Rock/Ground/Steel
    const state = makeState({ weather: { type: "sand", turnsLeft: 3 } });
    const ctx = makeCtx({
      ability: "sand-force",
      trigger: "on-damage-calc",
      move: makeMove("fire"),
      state,
    });
    const result = handleGen6DamageCalcAbility(ctx);
    expect(result.activated).toBe(false);
  });

  it("given Adaptability + STAB move, when on-damage-calc, then activates", () => {
    // Source: Showdown data/abilities.ts -- Adaptability: STAB 2x instead of 1.5x
    const ctx = makeCtx({
      ability: "adaptability",
      trigger: "on-damage-calc",
      types: ["fire"],
      move: makeMove("fire"),
    });
    const result = handleGen6DamageCalcAbility(ctx);
    expect(result.activated).toBe(true);
  });

  it("given Adaptability + non-STAB move, when on-damage-calc, then does not activate", () => {
    // Source: Showdown -- Adaptability only boosts STAB
    const ctx = makeCtx({
      ability: "adaptability",
      trigger: "on-damage-calc",
      types: ["water"],
      move: makeMove("fire"),
    });
    const result = handleGen6DamageCalcAbility(ctx);
    expect(result.activated).toBe(false);
  });

  it("given Reckless + recoil move, when on-damage-calc, then activates", () => {
    // Source: Showdown data/abilities.ts -- Reckless: 1.2x for recoil moves
    const ctx = makeCtx({
      ability: "reckless",
      trigger: "on-damage-calc",
      move: makeMove("fighting", {
        effect: { type: "recoil", fraction: 0.33 },
      }),
    });
    const result = handleGen6DamageCalcAbility(ctx);
    expect(result.activated).toBe(true);
  });

  it("given Reckless + crash damage move, when on-damage-calc, then activates", () => {
    // Source: Showdown -- Reckless also boosts crash-damage moves
    const move = makeMove("fighting");
    (move as { hasCrashDamage: boolean }).hasCrashDamage = true;
    const ctx = makeCtx({
      ability: "reckless",
      trigger: "on-damage-calc",
      move,
    });
    const result = handleGen6DamageCalcAbility(ctx);
    expect(result.activated).toBe(true);
  });

  it("given Guts + physical move + status, when on-damage-calc, then activates", () => {
    // Source: Showdown data/abilities.ts -- Guts: 1.5x Atk when statused
    const ctx = makeCtx({
      ability: "guts",
      trigger: "on-damage-calc",
      status: "burn",
      move: makeMove("normal", { category: "physical" }),
    });
    const result = handleGen6DamageCalcAbility(ctx);
    expect(result.activated).toBe(true);
  });

  it("given Guts + physical move + no status, when on-damage-calc, then does not activate", () => {
    // Source: Showdown -- Guts requires status condition
    const ctx = makeCtx({
      ability: "guts",
      trigger: "on-damage-calc",
      move: makeMove("normal", { category: "physical" }),
    });
    const result = handleGen6DamageCalcAbility(ctx);
    expect(result.activated).toBe(false);
  });

  it("given Blaze + fire move + HP below 1/3, when on-damage-calc, then activates", () => {
    // Source: Showdown data/abilities.ts -- Blaze pinch: 1.5x at <= 1/3 HP
    const ctx = makeCtx({
      ability: "blaze",
      trigger: "on-damage-calc",
      move: makeMove("fire"),
      currentHp: 50,
      maxHp: 200,
    });
    // HP 50 <= floor(200/3)=66
    const result = handleGen6DamageCalcAbility(ctx);
    expect(result.activated).toBe(true);
  });

  it("given Blaze + fire move + HP above 1/3, when on-damage-calc, then does not activate", () => {
    // Source: Showdown -- pinch abilities only fire at or below 1/3 HP
    const ctx = makeCtx({
      ability: "blaze",
      trigger: "on-damage-calc",
      move: makeMove("fire"),
      currentHp: 150,
      maxHp: 200,
    });
    const result = handleGen6DamageCalcAbility(ctx);
    expect(result.activated).toBe(false);
  });

  it("given Blaze + water move, when on-damage-calc, then does not activate", () => {
    // Source: Showdown -- Blaze only boosts Fire moves
    const ctx = makeCtx({
      ability: "blaze",
      trigger: "on-damage-calc",
      move: makeMove("water"),
      currentHp: 50,
      maxHp: 200,
    });
    const result = handleGen6DamageCalcAbility(ctx);
    expect(result.activated).toBe(false);
  });

  it("given Multiscale + full HP, when on-damage-calc, then activates", () => {
    // Source: Showdown data/abilities.ts -- Multiscale: 0.5x at full HP
    const ctx = makeCtx({
      ability: "multiscale",
      trigger: "on-damage-calc",
      currentHp: 200,
      maxHp: 200,
    });
    const result = handleGen6DamageCalcAbility(ctx);
    expect(result.activated).toBe(true);
  });

  it("given Multiscale + not full HP, when on-damage-calc, then does not activate", () => {
    // Source: Showdown -- Multiscale only at full HP
    const ctx = makeCtx({
      ability: "multiscale",
      trigger: "on-damage-calc",
      currentHp: 150,
      maxHp: 200,
    });
    const result = handleGen6DamageCalcAbility(ctx);
    expect(result.activated).toBe(false);
  });

  it("given Thick Fat + fire move, when on-damage-calc, then activates", () => {
    // Source: Showdown data/abilities.ts -- Thick Fat: 0.5x Fire/Ice damage
    const ctx = makeCtx({
      ability: "thick-fat",
      trigger: "on-damage-calc",
      move: makeMove("fire"),
    });
    const result = handleGen6DamageCalcAbility(ctx);
    expect(result.activated).toBe(true);
  });

  it("given Thick Fat + ice move, when on-damage-calc, then activates", () => {
    // Source: Showdown -- Thick Fat covers both Fire and Ice
    const ctx = makeCtx({
      ability: "thick-fat",
      trigger: "on-damage-calc",
      move: makeMove("ice"),
    });
    const result = handleGen6DamageCalcAbility(ctx);
    expect(result.activated).toBe(true);
  });

  it("given Thick Fat + water move, when on-damage-calc, then does not activate", () => {
    // Source: Showdown -- Thick Fat only for Fire/Ice
    const ctx = makeCtx({
      ability: "thick-fat",
      trigger: "on-damage-calc",
      move: makeMove("water"),
    });
    const result = handleGen6DamageCalcAbility(ctx);
    expect(result.activated).toBe(false);
  });

  it("given Marvel Scale + status, when on-damage-calc, then activates", () => {
    // Source: Showdown data/abilities.ts -- Marvel Scale: 1.5x Def when statused
    const ctx = makeCtx({
      ability: "marvel-scale",
      trigger: "on-damage-calc",
      status: "paralysis",
    });
    const result = handleGen6DamageCalcAbility(ctx);
    expect(result.activated).toBe(true);
  });

  it("given Marvel Scale + no status, when on-damage-calc, then does not activate", () => {
    // Source: Showdown -- Marvel Scale requires status
    const ctx = makeCtx({
      ability: "marvel-scale",
      trigger: "on-damage-calc",
    });
    const result = handleGen6DamageCalcAbility(ctx);
    expect(result.activated).toBe(false);
  });

  it("given Fur Coat + physical move, when on-damage-calc, then activates", () => {
    // Source: Showdown data/abilities.ts -- Fur Coat: 2x Def vs physical
    const ctx = makeCtx({
      ability: "fur-coat",
      trigger: "on-damage-calc",
      move: makeMove("normal", { category: "physical" }),
    });
    const result = handleGen6DamageCalcAbility(ctx);
    expect(result.activated).toBe(true);
  });

  it("given Fur Coat + special move, when on-damage-calc, then does not activate", () => {
    // Source: Showdown -- Fur Coat only for physical
    const ctx = makeCtx({
      ability: "fur-coat",
      trigger: "on-damage-calc",
      move: makeMove("fire", { category: "special" }),
    });
    const result = handleGen6DamageCalcAbility(ctx);
    expect(result.activated).toBe(false);
  });

  it("given Aerilate + normal move, when on-damage-calc, then converts to Flying", () => {
    // Source: Showdown data/abilities.ts -- Aerilate: Normal -> Flying
    const ctx = makeCtx({
      ability: "aerilate",
      trigger: "on-damage-calc",
      move: makeMove("normal"),
    });
    const result = handleGen6DamageCalcAbility(ctx);
    expect(result.activated).toBe(true);
    expect(result.effects[0]).toEqual(expect.objectContaining({ types: ["flying"] }));
  });

  it("given Refrigerate + normal move, when on-damage-calc, then converts to Ice", () => {
    // Source: Showdown data/abilities.ts -- Refrigerate: Normal -> Ice
    const ctx = makeCtx({
      ability: "refrigerate",
      trigger: "on-damage-calc",
      move: makeMove("normal"),
    });
    const result = handleGen6DamageCalcAbility(ctx);
    expect(result.activated).toBe(true);
    expect(result.effects[0]).toEqual(expect.objectContaining({ types: ["ice"] }));
  });

  it("given Parental Bond + status move, when on-damage-calc, then does not activate", () => {
    // Source: Showdown -- Parental Bond doesn't apply to status moves
    const ctx = makeCtx({
      ability: "parental-bond",
      trigger: "on-damage-calc",
      move: makeMove("normal", { category: "status", power: 0 }),
    });
    const result = handleGen6DamageCalcAbility(ctx);
    expect(result.activated).toBe(false);
  });

  it("given Parental Bond + multi-hit move, when on-damage-calc, then does not activate", () => {
    // Source: Showdown -- Parental Bond skips multi-hit moves
    const ctx = makeCtx({
      ability: "parental-bond",
      trigger: "on-damage-calc",
      move: makeMove("normal", {
        power: 80,
        effect: { type: "multi-hit", minHits: 2, maxHits: 5 },
      }),
    });
    const result = handleGen6DamageCalcAbility(ctx);
    expect(result.activated).toBe(false);
  });

  it("given Sniper on a crit, when on-damage-calc, then activates", () => {
    // Source: Showdown data/abilities.ts -- Sniper: if crit, chainModify(1.5)
    const ctx = makeCtx({
      ability: "sniper",
      trigger: "on-damage-calc",
      isCrit: true,
    });
    const result = handleGen6DamageCalcAbility(ctx);
    expect(result.activated).toBe(true);
  });

  it("given Sniper on a non-crit, when on-damage-calc, then does not activate", () => {
    // Source: Showdown -- Sniper only fires on crits
    const ctx = makeCtx({
      ability: "sniper",
      trigger: "on-damage-calc",
      isCrit: false,
    });
    const result = handleGen6DamageCalcAbility(ctx);
    expect(result.activated).toBe(false);
  });

  it("given Tinted Lens with NVE move, when on-damage-calc, then activates", () => {
    // Source: Showdown data/abilities.ts -- Tinted Lens: if typeMod < 0, chainModify(2)
    const ctx = makeCtx({
      ability: "tinted-lens",
      trigger: "on-damage-calc",
      typeEffectiveness: 0.5,
    });
    const result = handleGen6DamageCalcAbility(ctx);
    expect(result.activated).toBe(true);
  });

  it("given Tinted Lens with neutral move, when on-damage-calc, then does not activate", () => {
    // Source: Showdown -- Tinted Lens only fires for NVE (typeMod < 0)
    const ctx = makeCtx({
      ability: "tinted-lens",
      trigger: "on-damage-calc",
      typeEffectiveness: 1,
    });
    const result = handleGen6DamageCalcAbility(ctx);
    expect(result.activated).toBe(false);
  });

  it("given Hustle + special move, when on-damage-calc, then does not activate", () => {
    // Source: Showdown -- Hustle only boosts physical moves
    const ctx = makeCtx({
      ability: "hustle",
      trigger: "on-damage-calc",
      move: makeMove("fire", { category: "special" }),
    });
    const result = handleGen6DamageCalcAbility(ctx);
    expect(result.activated).toBe(false);
  });
});

// ===========================================================================
// Solid Rock / Filter gating tests
// ===========================================================================

describe("Solid Rock / Filter gating", () => {
  it("given Solid Rock + SE move, when on-damage-calc, then activates", () => {
    // Source: Showdown data/abilities.ts -- solidrock: chainModify(0.75) when typeMod > 0
    const ctx = makeCtx({
      ability: "solid-rock",
      trigger: "on-damage-calc",
      typeEffectiveness: 2,
    });
    const result = handleGen6DamageCalcAbility(ctx);
    expect(result.activated).toBe(true);
    expect(result.effects[0].effectType).toBe("damage-reduction");
  });

  it("given Filter + 4x SE move, when on-damage-calc, then activates", () => {
    // Source: Showdown data/abilities.ts -- filter is identical to solidrock
    const ctx = makeCtx({
      ability: "filter",
      trigger: "on-damage-calc",
      typeEffectiveness: 4,
    });
    const result = handleGen6DamageCalcAbility(ctx);
    expect(result.activated).toBe(true);
    expect(result.effects[0].effectType).toBe("damage-reduction");
  });

  it("given Solid Rock + neutral move, when on-damage-calc, then does not activate", () => {
    // Source: Showdown -- Solid Rock only activates for SE (typeMod > 0)
    const ctx = makeCtx({
      ability: "solid-rock",
      trigger: "on-damage-calc",
      typeEffectiveness: 1,
    });
    const result = handleGen6DamageCalcAbility(ctx);
    expect(result.activated).toBe(false);
  });

  it("given Filter + NVE move, when on-damage-calc, then does not activate", () => {
    // Source: Showdown -- Filter only activates for SE
    const ctx = makeCtx({
      ability: "filter",
      trigger: "on-damage-calc",
      typeEffectiveness: 0.5,
    });
    const result = handleGen6DamageCalcAbility(ctx);
    expect(result.activated).toBe(false);
  });
});

// ===========================================================================
// handleGen6DamageImmunityAbility — Sturdy OHKO block
// ===========================================================================

describe("handleGen6DamageImmunityAbility — Sturdy", () => {
  it("given Sturdy + OHKO move, when on-damage-taken, then blocks the move", () => {
    // Source: Showdown data/abilities.ts -- Sturdy blocks OHKO moves
    const ctx = makeCtx({
      ability: "sturdy",
      trigger: "on-damage-taken",
      move: makeMove("ground", {
        id: "fissure",
        effect: { type: "ohko" },
      }),
    });
    const result = handleGen6DamageImmunityAbility(ctx);
    expect(result.activated).toBe(true);
    expect(result.movePrevented).toBe(true);
  });

  it("given Sturdy + non-OHKO move, when on-damage-taken, then does not activate", () => {
    // Source: Showdown -- Sturdy only blocks OHKO
    const ctx = makeCtx({
      ability: "sturdy",
      trigger: "on-damage-taken",
      move: makeMove("fire"),
    });
    const result = handleGen6DamageImmunityAbility(ctx);
    expect(result.activated).toBe(false);
  });

  it("given non-Sturdy ability, when on-damage-taken, then does not activate", () => {
    // Source: Showdown -- only Sturdy handles damage immunity
    const ctx = makeCtx({
      ability: "intimidate",
      trigger: "on-damage-taken",
    });
    const result = handleGen6DamageImmunityAbility(ctx);
    expect(result.activated).toBe(false);
  });
});
