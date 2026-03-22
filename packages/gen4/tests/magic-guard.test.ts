import type {
  ActivePokemon,
  BattleSide,
  BattleState,
  MoveEffectContext,
} from "@pokemon-lib-ts/battle";
import type { MoveData, PokemonInstance, PokemonType, StatBlock } from "@pokemon-lib-ts/core";
import { describe, expect, it } from "vitest";
import { executeGen4MoveEffect } from "../src/Gen4MoveEffects";
import { Gen4Ruleset } from "../src/Gen4Ruleset";

/**
 * Magic Guard & Heatproof Ability Tests — Gen 4
 *
 * Magic Guard (introduced in Gen 4) prevents ALL indirect damage:
 *   - Status damage (burn, poison, toxic)
 *   - Leech Seed drain
 *   - Entry hazard damage (Stealth Rock, Spikes, Toxic Spikes status)
 *   - Recoil damage from moves (NOT Struggle)
 *   - Bind/Wrap trap damage
 *   - Curse (Ghost) damage
 *   - Nightmare damage
 *   - Weather chip damage (tested in weather tests)
 *
 * Heatproof (introduced in Gen 4) halves burn damage:
 *   - Normal burn: 1/8 max HP → Heatproof burn: 1/16 max HP
 *
 * Source: Bulbapedia — Magic Guard: "prevents all indirect damage"
 * Source: Showdown Gen 4 — Magic Guard implementation
 * Source: Bulbapedia — Heatproof: "Also halves the damage the holder takes from a burn."
 */

// ---------------------------------------------------------------------------
// Test helpers
// ---------------------------------------------------------------------------

function createMockRng() {
  return {
    next: () => 0,
    int: (_min: number, _max: number) => 1,
    chance: (_p: number) => false,
    pick: <T>(arr: readonly T[]) => arr[0] as T,
    shuffle: <T>(arr: readonly T[]) => [...arr],
    getState: () => 0,
    setState: () => {},
  };
}

function createActivePokemon(opts: {
  level?: number;
  hp?: number;
  currentHp?: number;
  types?: PokemonType[];
  ability?: string;
  heldItem?: string | null;
  status?: "burn" | "poison" | "badly-poisoned" | "paralysis" | "sleep" | "freeze" | null;
}): ActivePokemon {
  const level = opts.level ?? 50;
  const maxHp = opts.hp ?? 200;
  const stats: StatBlock = {
    hp: maxHp,
    attack: 100,
    defense: 100,
    spAttack: 100,
    spDefense: 100,
    speed: 100,
  };

  const pokemon = {
    uid: "test",
    speciesId: 1,
    nickname: null,
    level,
    experience: 0,
    nature: "hardy",
    ivs: { hp: 0, attack: 0, defense: 0, spAttack: 0, spDefense: 0, speed: 0 },
    evs: { hp: 0, attack: 0, defense: 0, spAttack: 0, spDefense: 0, speed: 0 },
    currentHp: opts.currentHp ?? maxHp,
    moves: [],
    ability: opts.ability ?? "",
    abilitySlot: "normal1" as const,
    heldItem: opts.heldItem ?? null,
    status: opts.status ?? null,
    friendship: 0,
    gender: "male" as const,
    isShiny: false,
    metLocation: "",
    metLevel: 1,
    originalTrainer: "",
    originalTrainerId: 0,
    pokeball: "pokeball",
    calculatedStats: stats,
  } as PokemonInstance;

  return {
    pokemon,
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
    types: opts.types ?? ["normal"],
    ability: opts.ability ?? "",
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
    isTerastallized: false,
    teraType: null,
    stellarBoostedTypes: [],
    forcedMove: null,
  } as ActivePokemon;
}

function createMove(opts: {
  id?: string;
  type?: PokemonType;
  power?: number;
  category?: "physical" | "special" | "status";
  effect?: MoveData["effect"];
}): MoveData {
  return {
    id: opts.id ?? "test-move",
    displayName: "Test Move",
    type: opts.type ?? "normal",
    category: opts.category ?? "physical",
    power: opts.power ?? 80,
    accuracy: 100,
    pp: 35,
    priority: 0,
    target: "adjacent-foe",
    flags: {
      contact: false,
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
    effect: opts.effect ?? null,
    description: "",
    generation: 4,
  } as MoveData;
}

function makeSide(index: 0 | 1): BattleSide {
  return {
    index,
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
  };
}

function makeBattleState(): BattleState {
  return {
    phase: "turn-end",
    generation: 4,
    format: "singles",
    turnNumber: 1,
    sides: [makeSide(0), makeSide(1)],
    weather: null,
    terrain: null,
    trickRoom: { active: false, turnsLeft: 0 },
    magicRoom: { active: false, turnsLeft: 0 },
    wonderRoom: { active: false, turnsLeft: 0 },
    gravity: { active: false, turnsLeft: 0 },
    turnHistory: [],
    rng: createMockRng(),
    ended: false,
    winner: null,
  } as unknown as BattleState;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("Magic Guard", () => {
  const ruleset = new Gen4Ruleset();

  describe("status damage prevention", () => {
    it("given Pokemon with Magic Guard and burn status, when applyStatusDamage called, then 0 damage", () => {
      // Source: Bulbapedia — Magic Guard: "prevents all indirect damage"
      // Source: Showdown Gen 4 — Magic Guard prevents burn chip
      const pokemon = createActivePokemon({ ability: "magic-guard", hp: 200, status: "burn" });
      const state = makeBattleState();
      const damage = ruleset.applyStatusDamage(pokemon, "burn", state);
      expect(damage).toBe(0);
    });

    it("given Pokemon with Magic Guard and poison status, when applyStatusDamage called, then 0 damage", () => {
      // Source: Bulbapedia — Magic Guard: "prevents all indirect damage"
      // Source: Showdown Gen 4 — Magic Guard prevents poison chip
      const pokemon = createActivePokemon({ ability: "magic-guard", hp: 200, status: "poison" });
      const state = makeBattleState();
      const damage = ruleset.applyStatusDamage(pokemon, "poison", state);
      expect(damage).toBe(0);
    });

    it("given Pokemon without Magic Guard and burn status, when applyStatusDamage called, then 1/8 max HP damage (Gen 4 burn rate)", () => {
      // Source: pret/pokeplatinum — burn damage = maxHP / 8
      // Triangulation: different HP value from above
      const pokemon = createActivePokemon({ hp: 160, status: "burn" });
      const state = makeBattleState();
      const damage = ruleset.applyStatusDamage(pokemon, "burn", state);
      // floor(160 / 8) = 20
      expect(damage).toBe(20);
    });
  });

  describe("leech seed drain prevention", () => {
    it("given Pokemon with Magic Guard and leech seed, when calculateLeechSeedDrain called, then 0 damage", () => {
      // Source: Bulbapedia — Magic Guard: "prevents all indirect damage"
      // Source: Showdown Gen 4 — Magic Guard prevents Leech Seed drain
      const pokemon = createActivePokemon({ ability: "magic-guard", hp: 200 });
      const damage = ruleset.calculateLeechSeedDrain(pokemon);
      expect(damage).toBe(0);
    });

    it("given Pokemon without Magic Guard, when calculateLeechSeedDrain called, then 1/8 max HP drain", () => {
      // Source: BaseRuleset — Leech Seed drains 1/8 max HP
      // Triangulation: second test with different HP
      const pokemon = createActivePokemon({ hp: 240 });
      const damage = ruleset.calculateLeechSeedDrain(pokemon);
      // floor(240 / 8) = 30
      expect(damage).toBe(30);
    });
  });

  describe("entry hazard damage prevention", () => {
    it("given Pokemon with Magic Guard, when entry hazards applied (Stealth Rock + Spikes), then 0 total damage", () => {
      // Source: Bulbapedia — Magic Guard: "prevents all indirect damage"
      // Source: Showdown Gen 4 — Magic Guard prevents entry hazard damage
      const pokemon = createActivePokemon({ ability: "magic-guard", types: ["fire"] });
      const side = makeSide(0);
      side.hazards = [
        { type: "stealth-rock", layers: 1 },
        { type: "spikes", layers: 3 },
      ];

      const result = ruleset.applyEntryHazards(pokemon, side);
      expect(result.damage).toBe(0);
      expect(result.statusInflicted).toBeNull();
    });

    it("given Pokemon without Magic Guard and Fire type, when Stealth Rock applied, then 1/4 max HP damage (2x weak to Rock)", () => {
      // Source: Bulbapedia — Stealth Rock: Fire type takes 1/4 max HP (2x SE)
      // Triangulation: a specific type weakness case
      const pokemon = createActivePokemon({ types: ["fire"], hp: 200 });
      const side = makeSide(0);
      side.hazards = [{ type: "stealth-rock", layers: 1 }];

      const result = ruleset.applyEntryHazards(pokemon, side);
      // floor(200 * 2 / 8) = 50
      expect(result.damage).toBe(50);
    });
  });

  describe("recoil damage prevention", () => {
    it("given attacker with Magic Guard using a recoil move, when executeGen4MoveEffect called, then 0 recoil damage", () => {
      // Source: Bulbapedia — Magic Guard: "prevents all indirect damage"
      // Source: Showdown Gen 4 — Magic Guard prevents move recoil
      const attacker = createActivePokemon({ ability: "magic-guard" });
      const defender = createActivePokemon({});
      const move = createMove({
        id: "brave-bird",
        type: "flying",
        power: 120,
        effect: { type: "recoil", amount: 1 / 3 },
      });
      const state = makeBattleState();
      state.sides[0].active = [attacker];
      state.sides[1].active = [defender];

      const context: MoveEffectContext = {
        attacker,
        defender,
        move,
        damage: 90,
        rng: createMockRng(),
        state,
      } as MoveEffectContext;

      const result = executeGen4MoveEffect(context);
      expect(result.recoilDamage).toBe(0);
    });

    it("given attacker without Magic Guard using a recoil move, when executeGen4MoveEffect called, then recoil damage is applied", () => {
      // Source: Showdown Gen 4 — normal recoil is 1/3 of damage dealt
      // Triangulation: attacker without Magic Guard takes recoil
      const attacker = createActivePokemon({});
      const defender = createActivePokemon({});
      const move = createMove({
        id: "brave-bird",
        type: "flying",
        power: 120,
        effect: { type: "recoil", amount: 1 / 3 },
      });
      const state = makeBattleState();
      state.sides[0].active = [attacker];
      state.sides[1].active = [defender];

      const context: MoveEffectContext = {
        attacker,
        defender,
        move,
        damage: 90,
        rng: createMockRng(),
        state,
      } as MoveEffectContext;

      const result = executeGen4MoveEffect(context);
      // floor(90 * 1/3) = 30
      expect(result.recoilDamage).toBe(30);
    });
  });

  describe("bind/trap damage prevention", () => {
    it("given Pokemon with Magic Guard while trapped, when calculateBindDamage called, then 0 damage", () => {
      // Source: Bulbapedia — Magic Guard: "prevents all indirect damage"
      // Source: Showdown Gen 4 — Magic Guard prevents bind/wrap/clamp damage
      const pokemon = createActivePokemon({ ability: "magic-guard", hp: 200 });
      const damage = ruleset.calculateBindDamage(pokemon);
      expect(damage).toBe(0);
    });

    it("given Pokemon without Magic Guard while trapped, when calculateBindDamage called, then 1/16 max HP (Gen 4 rate)", () => {
      // Source: Bulbapedia — Binding move damage is 1/16 in Gen 2-4
      // Triangulation: different HP value
      const pokemon = createActivePokemon({ hp: 320 });
      const damage = ruleset.calculateBindDamage(pokemon);
      // floor(320 / 16) = 20
      expect(damage).toBe(20);
    });
  });

  describe("curse damage prevention", () => {
    it("given Pokemon with Magic Guard and Curse volatile, when calculateCurseDamage called, then 0 damage", () => {
      // Source: Bulbapedia — Magic Guard: "prevents all indirect damage"
      // Source: Showdown Gen 4 — Magic Guard prevents Curse damage
      const pokemon = createActivePokemon({ ability: "magic-guard", hp: 200 });
      const damage = ruleset.calculateCurseDamage(pokemon);
      expect(damage).toBe(0);
    });

    it("given Pokemon without Magic Guard and Curse volatile, when calculateCurseDamage called, then 1/4 max HP damage", () => {
      // Source: BaseRuleset — Curse (Ghost) drains 1/4 max HP per turn
      // Triangulation: different HP
      const pokemon = createActivePokemon({ hp: 160 });
      const damage = ruleset.calculateCurseDamage(pokemon);
      // floor(160 / 4) = 40
      expect(damage).toBe(40);
    });
  });

  describe("nightmare damage prevention", () => {
    it("given Pokemon with Magic Guard and Nightmare, when calculateNightmareDamage called, then 0 damage", () => {
      // Source: Bulbapedia — Magic Guard: "prevents all indirect damage"
      // Source: Showdown Gen 4 — Magic Guard prevents Nightmare damage
      const pokemon = createActivePokemon({ ability: "magic-guard", hp: 200 });
      const damage = ruleset.calculateNightmareDamage(pokemon);
      expect(damage).toBe(0);
    });

    it("given Pokemon without Magic Guard and Nightmare, when calculateNightmareDamage called, then 1/4 max HP damage", () => {
      // Source: BaseRuleset — Nightmare drains 1/4 max HP per turn while asleep
      // Triangulation: different HP
      const pokemon = createActivePokemon({ hp: 240 });
      const damage = ruleset.calculateNightmareDamage(pokemon);
      // floor(240 / 4) = 60
      expect(damage).toBe(60);
    });
  });
});

describe("Heatproof", () => {
  const ruleset = new Gen4Ruleset();

  it("given Pokemon with Heatproof and burn, when applyStatusDamage called, then 1/16 max HP damage not 1/8", () => {
    // Source: Bulbapedia — Heatproof: "Also halves the damage the holder takes from a burn."
    // Source: Showdown Gen 4 — Heatproof halves burn damage
    // 200 HP: normal burn = floor(200/8) = 25; Heatproof burn = floor(200/16) = 12
    const pokemon = createActivePokemon({ ability: "heatproof", hp: 200, status: "burn" });
    const state = makeBattleState();
    const damage = ruleset.applyStatusDamage(pokemon, "burn", state);
    expect(damage).toBe(12);
  });

  it("given Pokemon with Heatproof and burn (different HP), when applyStatusDamage called, then floor(maxHp/16)", () => {
    // Source: Bulbapedia — Heatproof: burn damage = floor(maxHp / 16)
    // Triangulation: 300 HP → floor(300/16) = 18
    const pokemon = createActivePokemon({ ability: "heatproof", hp: 300, status: "burn" });
    const state = makeBattleState();
    const damage = ruleset.applyStatusDamage(pokemon, "burn", state);
    expect(damage).toBe(18);
  });
});
