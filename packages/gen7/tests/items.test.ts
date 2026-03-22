import type { ActivePokemon, BattleState, ItemContext } from "@pokemon-lib-ts/battle";
import type { MoveData, PokemonType } from "@pokemon-lib-ts/core";
import { SeededRandom } from "@pokemon-lib-ts/core";
import { describe, expect, it } from "vitest";
import {
  applyGen7HeldItem,
  getPinchBerryThreshold,
  getSpeciesZMoves,
  getTypedZMoves,
  getZCrystalType,
  hasTerrainExtender,
  isMegaStone,
  isSpeciesZCrystal,
  isZCrystal,
  TERRAIN_EXTENDER_ITEM_ID,
} from "../src/Gen7Items";

// ---------------------------------------------------------------------------
// Helper factories (mirrors Gen6 items.test.ts pattern)
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
  volatiles?: Map<string, { turnsLeft: number; data?: Record<string, unknown> }>;
}): ActivePokemon {
  const hp = overrides.hp ?? 200;
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
      calculatedStats: {
        hp,
        attack: overrides.attack ?? 100,
        defense: overrides.defense ?? 100,
        spAttack: overrides.spAttack ?? 100,
        spDefense: overrides.spDefense ?? 100,
        speed: overrides.speed ?? 100,
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
    volatileStatuses: overrides.volatiles ?? new Map(),
    types: overrides.types ?? ["normal"],
    ability: overrides.ability ?? "none",
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
    isDynamaxed: false,
    dynamaxTurnsLeft: 0,
    isTerastallized: false,
    teraType: null,
    stellarBoostedTypes: [],
    suppressedAbility: null,
    forcedMove: null,
  } as ActivePokemon;
}

function makeMove(overrides?: {
  id?: string;
  type?: PokemonType;
  category?: "physical" | "special" | "status";
  power?: number | null;
  flags?: Partial<MoveData["flags"]>;
  effect?: MoveData["effect"];
}): MoveData {
  return {
    id: overrides?.id ?? "tackle",
    displayName: overrides?.id ?? "Tackle",
    type: overrides?.type ?? "normal",
    category: overrides?.category ?? "physical",
    power: overrides?.power ?? 50,
    accuracy: 100,
    pp: 35,
    priority: 0,
    target: "adjacent-foe",
    flags: {
      contact: true,
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
      ...overrides?.flags,
    },
    effect: overrides?.effect ?? null,
    description: "",
    generation: 7,
    critRatio: 0,
  } as MoveData;
}

function makeState(overrides?: { sides?: [any, any] }): BattleState {
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
    sides: overrides?.sides ?? [{}, {}],
  } as unknown as BattleState;
}

function makeItemContext(overrides: {
  pokemon?: ActivePokemon;
  state?: BattleState;
  move?: MoveData;
  damage?: number;
  seed?: number;
}): ItemContext {
  return {
    pokemon: overrides.pokemon ?? makeActive({}),
    state: overrides.state ?? makeState(),
    rng: new SeededRandom(overrides.seed ?? 42),
    move: overrides.move,
    damage: overrides.damage,
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// Z-Crystal Identification
// ═══════════════════════════════════════════════════════════════════════════

describe("Z-Crystal Identification", () => {
  describe("isZCrystal", () => {
    it("given a type-specific Z-Crystal, when checking isZCrystal, then returns true", () => {
      // Source: Showdown data/items.ts -- normaliumz has zMove property
      expect(isZCrystal("normalium-z")).toBe(true);
    });

    it("given a second type-specific Z-Crystal, when checking isZCrystal, then returns true", () => {
      // Source: Showdown data/items.ts -- firiumz has zMove property
      expect(isZCrystal("firium-z")).toBe(true);
    });

    it("given a species-specific Z-Crystal, when checking isZCrystal, then returns true", () => {
      // Source: Showdown data/items.ts -- pikaniumz has zMove with zMoveFrom
      expect(isZCrystal("pikanium-z")).toBe(true);
    });

    it("given a non-Z-Crystal item, when checking isZCrystal, then returns false", () => {
      // Source: Showdown data/items.ts -- leftovers does not have zMove
      expect(isZCrystal("leftovers")).toBe(false);
    });

    it("given another non-Z-Crystal item, when checking isZCrystal, then returns false", () => {
      // Source: Showdown data/items.ts -- choice-band does not have zMove
      expect(isZCrystal("choice-band")).toBe(false);
    });
  });

  describe("getZCrystalType", () => {
    it("given firium-z, when getting Z-Crystal type, then returns fire", () => {
      // Source: Showdown data/items.ts -- firiumz.zMoveType = 'Fire'
      expect(getZCrystalType("firium-z")).toBe("fire");
    });

    it("given electrium-z, when getting Z-Crystal type, then returns electric", () => {
      // Source: Showdown data/items.ts -- electriumz.zMoveType = 'Electric'
      expect(getZCrystalType("electrium-z")).toBe("electric");
    });

    it("given a species-specific Z-Crystal, when getting type, then returns null", () => {
      // Source: Showdown data/items.ts -- species Z-Crystals don't have zMoveType
      expect(getZCrystalType("pikanium-z")).toBeNull();
    });

    it("given a non-Z-Crystal item, when getting type, then returns null", () => {
      // Source: Showdown data/items.ts -- non-Z items have no zMoveType property
      expect(getZCrystalType("leftovers")).toBeNull();
    });
  });

  describe("isSpeciesZCrystal", () => {
    it("given pikanium-z, when checking isSpeciesZCrystal, then returns true", () => {
      // Source: Showdown data/items.ts -- pikaniumz.zMoveFrom = 'Volt Tackle'
      expect(isSpeciesZCrystal("pikanium-z")).toBe(true);
    });

    it("given marshadium-z, when checking isSpeciesZCrystal, then returns true", () => {
      // Source: Showdown data/items.ts -- marshadiumz.zMoveFrom = 'Spectral Thief'
      expect(isSpeciesZCrystal("marshadium-z")).toBe(true);
    });

    it("given a type-specific Z-Crystal, when checking isSpeciesZCrystal, then returns false", () => {
      // Source: Showdown data/items.ts -- normaliumz has zMoveType, not zMoveFrom
      expect(isSpeciesZCrystal("normalium-z")).toBe(false);
    });

    it("given a non-Z-Crystal item, when checking isSpeciesZCrystal, then returns false", () => {
      expect(isSpeciesZCrystal("life-orb")).toBe(false);
    });
  });

  describe("getTypedZMoves", () => {
    it("given the typed Z-Move map, when counting entries, then has exactly 18 entries", () => {
      // Source: Showdown data/items.ts -- 18 typed Z-Crystals (one per type)
      const map = getTypedZMoves();
      expect(Object.keys(map).length).toBe(18);
    });

    it("given the typed Z-Move map, when checking fairium-z, then maps to fairy", () => {
      // Source: Showdown data/items.ts -- fairiumz.zMoveType = 'Fairy'
      const map = getTypedZMoves();
      expect(map["fairium-z"]).toBe("fairy");
    });
  });

  describe("getSpeciesZMoves", () => {
    it("given the species Z-Move map, when counting entries, then has 17 entries", () => {
      // Source: Showdown data/items.ts -- 17 species-specific Z-Crystals in Gen 7
      const map = getSpeciesZMoves();
      expect(Object.keys(map).length).toBe(17);
    });

    it("given the species Z-Move map, when checking pikanium-z, then maps to catastropika", () => {
      // Source: Showdown data/items.ts -- pikaniumz.zMove = 'Catastropika'
      const map = getSpeciesZMoves();
      expect(map["pikanium-z"]).toBe("catastropika");
    });

    it("given the species Z-Move map, when checking ultranecrozium-z, then maps to light-that-burns-the-sky", () => {
      // Source: Showdown data/items.ts -- ultranecroziumz.zMove = 'Light That Burns the Sky'
      const map = getSpeciesZMoves();
      expect(map["ultranecrozium-z"]).toBe("light-that-burns-the-sky");
    });
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// Terrain Extender
// ═══════════════════════════════════════════════════════════════════════════

describe("Terrain Extender", () => {
  it("given a Pokemon holding terrain-extender, when checking hasTerrainExtender, then returns true", () => {
    // Source: Showdown data/items.ts -- terrainextender: extends terrain from 5 to 8 turns
    const pokemon = makeActive({ heldItem: "terrain-extender" });
    expect(hasTerrainExtender(pokemon)).toBe(true);
  });

  it("given a Pokemon holding leftovers, when checking hasTerrainExtender, then returns false", () => {
    const pokemon = makeActive({ heldItem: "leftovers" });
    expect(hasTerrainExtender(pokemon)).toBe(false);
  });

  it("given the terrain extender item ID constant, when checked, then equals 'terrain-extender'", () => {
    // Source: Showdown data/items.ts -- item ID is 'terrainextender' (mapped to 'terrain-extender')
    expect(TERRAIN_EXTENDER_ITEM_ID).toBe("terrain-extender");
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// Mega Stone check
// ═══════════════════════════════════════════════════════════════════════════

describe("isMegaStone", () => {
  it("given venusaurite, when checking isMegaStone, then returns true", () => {
    // Source: Showdown data/items.ts -- mega stones end in 'ite'
    expect(isMegaStone("venusaurite")).toBe(true);
  });

  it("given eviolite, when checking isMegaStone, then returns false", () => {
    // Source: Bulbapedia "Eviolite" -- boosts defenses of unevolved Pokemon, not a Mega Stone
    expect(isMegaStone("eviolite")).toBe(false);
  });

  it("given empty string, when checking isMegaStone, then returns false", () => {
    expect(isMegaStone("")).toBe(false);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// Suppression: Klutz and Embargo
// ═══════════════════════════════════════════════════════════════════════════

describe("Item Suppression", () => {
  it("given a Pokemon with Klutz holding Leftovers, when end-of-turn fires, then item does not activate", () => {
    // Source: Bulbapedia -- Klutz: "The Pokemon can't use any held items"
    const pokemon = makeActive({ heldItem: "leftovers", ability: "klutz", currentHp: 100 });
    const ctx = makeItemContext({ pokemon });
    const result = applyGen7HeldItem("end-of-turn", ctx);
    expect(result.activated).toBe(false);
  });

  it("given a Pokemon under Embargo holding Leftovers, when end-of-turn fires, then item does not activate", () => {
    // Source: Bulbapedia -- Embargo: "prevents the target from using its held item"
    const volatiles = new Map([["embargo", { turnsLeft: 3 }]]);
    const pokemon = makeActive({ heldItem: "leftovers", currentHp: 100, volatiles });
    const ctx = makeItemContext({ pokemon });
    const result = applyGen7HeldItem("end-of-turn", ctx);
    expect(result.activated).toBe(false);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// End-of-Turn Items
// ═══════════════════════════════════════════════════════════════════════════

describe("End-of-Turn Items", () => {
  describe("Leftovers", () => {
    it("given a Pokemon with 400 max HP holding Leftovers, when end-of-turn fires, then heals 25 HP (floor(400/16))", () => {
      // Source: Showdown data/items.ts -- Leftovers: floor(maxHP / 16)
      // 400 / 16 = 25
      const pokemon = makeActive({ heldItem: "leftovers", hp: 400, currentHp: 300 });
      const ctx = makeItemContext({ pokemon });
      const result = applyGen7HeldItem("end-of-turn", ctx);
      expect(result.activated).toBe(true);
      expect(result.effects).toEqual([{ type: "heal", target: "self", value: 25 }]);
    });

    it("given a Pokemon with 100 max HP holding Leftovers, when end-of-turn fires, then heals 6 HP (floor(100/16))", () => {
      // Source: Showdown data/items.ts -- Leftovers: floor(maxHP / 16)
      // 100 / 16 = 6.25, floor = 6
      const pokemon = makeActive({ heldItem: "leftovers", hp: 100, currentHp: 50 });
      const ctx = makeItemContext({ pokemon });
      const result = applyGen7HeldItem("end-of-turn", ctx);
      expect(result.activated).toBe(true);
      expect(result.effects).toEqual([{ type: "heal", target: "self", value: 6 }]);
    });
  });

  describe("Black Sludge", () => {
    it("given a Poison-type Pokemon with 400 HP holding Black Sludge, when end-of-turn fires, then heals 25 HP", () => {
      // Source: Showdown data/items.ts -- Black Sludge: Poison types heal 1/16 max HP
      // 400 / 16 = 25
      const pokemon = makeActive({
        heldItem: "black-sludge",
        hp: 400,
        currentHp: 300,
        types: ["poison"],
      });
      const ctx = makeItemContext({ pokemon });
      const result = applyGen7HeldItem("end-of-turn", ctx);
      expect(result.activated).toBe(true);
      expect(result.effects).toEqual([{ type: "heal", target: "self", value: 25 }]);
    });

    it("given a non-Poison-type Pokemon with 400 HP holding Black Sludge, when end-of-turn fires, then takes 50 damage (floor(400/8))", () => {
      // Source: Showdown data/items.ts -- Black Sludge: non-Poison types take 1/8 max HP
      // 400 / 8 = 50
      const pokemon = makeActive({
        heldItem: "black-sludge",
        hp: 400,
        currentHp: 300,
        types: ["normal"],
      });
      const ctx = makeItemContext({ pokemon });
      const result = applyGen7HeldItem("end-of-turn", ctx);
      expect(result.activated).toBe(true);
      expect(result.effects).toEqual([{ type: "chip-damage", target: "self", value: 50 }]);
    });
  });

  describe("Toxic Orb", () => {
    it("given a healthy Pokemon holding Toxic Orb, when end-of-turn fires, then inflicts badly-poisoned", () => {
      // Source: Showdown data/items.ts -- Toxic Orb: inflicts badly-poisoned at end of turn
      const pokemon = makeActive({ heldItem: "toxic-orb", types: ["normal"] });
      const ctx = makeItemContext({ pokemon });
      const result = applyGen7HeldItem("end-of-turn", ctx);
      expect(result.activated).toBe(true);
      expect(result.effects).toEqual([
        { type: "inflict-status", target: "self", status: "badly-poisoned" },
      ]);
    });

    it("given a Poison-type holding Toxic Orb, when end-of-turn fires, then does not activate (type immunity)", () => {
      // Source: Showdown -- type immunity prevents Orb activation
      const pokemon = makeActive({ heldItem: "toxic-orb", types: ["poison"] });
      const ctx = makeItemContext({ pokemon });
      const result = applyGen7HeldItem("end-of-turn", ctx);
      expect(result.activated).toBe(false);
    });
  });

  describe("Flame Orb", () => {
    it("given a healthy Pokemon holding Flame Orb, when end-of-turn fires, then inflicts burn", () => {
      // Source: Showdown data/items.ts -- Flame Orb: inflicts burn at end of turn
      const pokemon = makeActive({ heldItem: "flame-orb", types: ["normal"] });
      const ctx = makeItemContext({ pokemon });
      const result = applyGen7HeldItem("end-of-turn", ctx);
      expect(result.activated).toBe(true);
      expect(result.effects).toEqual([{ type: "inflict-status", target: "self", status: "burn" }]);
    });

    it("given a Fire-type holding Flame Orb, when end-of-turn fires, then does not activate (type immunity)", () => {
      // Source: Showdown -- type immunity prevents Orb activation
      const pokemon = makeActive({ heldItem: "flame-orb", types: ["fire"] });
      const ctx = makeItemContext({ pokemon });
      const result = applyGen7HeldItem("end-of-turn", ctx);
      expect(result.activated).toBe(false);
    });
  });

  describe("Sitrus Berry (end-of-turn)", () => {
    it("given a Pokemon at 50% HP holding Sitrus Berry, when end-of-turn fires, then heals 25% max HP and is consumed", () => {
      // Source: Showdown data/items.ts -- Sitrus Berry: heals 1/4 max HP at <= 50%
      // 400 / 4 = 100
      const pokemon = makeActive({ heldItem: "sitrus-berry", hp: 400, currentHp: 200 });
      const ctx = makeItemContext({ pokemon });
      const result = applyGen7HeldItem("end-of-turn", ctx);
      expect(result.activated).toBe(true);
      expect(result.effects[0]).toEqual({ type: "heal", target: "self", value: 100 });
      expect(result.effects[1]).toEqual({
        type: "consume",
        target: "self",
        value: "sitrus-berry",
      });
    });

    it("given a Pokemon above 50% HP holding Sitrus Berry, when end-of-turn fires, then does not activate", () => {
      // Source: Showdown data/items.ts -- Sitrus Berry threshold: <= 50%
      const pokemon = makeActive({ heldItem: "sitrus-berry", hp: 400, currentHp: 201 });
      const ctx = makeItemContext({ pokemon });
      const result = applyGen7HeldItem("end-of-turn", ctx);
      expect(result.activated).toBe(false);
    });
  });

  describe("Lum Berry", () => {
    it("given a paralyzed Pokemon holding Lum Berry, when end-of-turn fires, then cures status and is consumed", () => {
      // Source: Showdown data/items.ts -- Lum Berry: cures any status + confusion
      const pokemon = makeActive({ heldItem: "lum-berry", status: "paralysis" });
      const ctx = makeItemContext({ pokemon });
      const result = applyGen7HeldItem("end-of-turn", ctx);
      expect(result.activated).toBe(true);
      expect(result.effects.some((e) => e.type === "status-cure")).toBe(true);
      expect(result.effects.some((e) => e.type === "consume")).toBe(true);
    });

    it("given a healthy Pokemon holding Lum Berry, when end-of-turn fires, then does not activate", () => {
      const pokemon = makeActive({ heldItem: "lum-berry" });
      const ctx = makeItemContext({ pokemon });
      const result = applyGen7HeldItem("end-of-turn", ctx);
      expect(result.activated).toBe(false);
    });
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// On-Damage-Taken Items
// ═══════════════════════════════════════════════════════════════════════════

describe("On-Damage-Taken Items", () => {
  describe("Focus Sash", () => {
    it("given a full-HP Pokemon holding Focus Sash taking a KO hit, when on-damage-taken fires, then survives at 1 HP and item is consumed", () => {
      // Source: Showdown data/items.ts -- Focus Sash: survive at 1 HP from full HP
      const pokemon = makeActive({ heldItem: "focus-sash", hp: 200, currentHp: 200 });
      const ctx = makeItemContext({ pokemon, damage: 300 });
      const result = applyGen7HeldItem("on-damage-taken", ctx);
      expect(result.activated).toBe(true);
      expect(result.effects[0]).toEqual({ type: "survive", target: "self", value: 1 });
      expect(result.effects[1]).toEqual({
        type: "consume",
        target: "self",
        value: "focus-sash",
      });
    });

    it("given a non-full-HP Pokemon holding Focus Sash taking a KO hit, when on-damage-taken fires, then does not activate", () => {
      // Source: Showdown data/items.ts -- Focus Sash only works at full HP
      const pokemon = makeActive({ heldItem: "focus-sash", hp: 200, currentHp: 199 });
      const ctx = makeItemContext({ pokemon, damage: 300 });
      const result = applyGen7HeldItem("on-damage-taken", ctx);
      expect(result.activated).toBe(false);
    });
  });

  describe("Assault Vest (status move block)", () => {
    it("given Assault Vest behavior, when checking for status block, then the item is handled in the damage calc (not here)", () => {
      // Source: Showdown data/items.ts -- Assault Vest: +50% SpDef is in damage calc;
      // status move block is in move validation, not item trigger. No on-damage-taken effect.
      // This test just confirms the item handler does not crash for Assault Vest.
      const pokemon = makeActive({ heldItem: "assault-vest", hp: 200, currentHp: 100 });
      const ctx = makeItemContext({ pokemon, damage: 50 });
      const result = applyGen7HeldItem("on-damage-taken", ctx);
      // Assault Vest does not have an on-damage-taken trigger
      expect(result.activated).toBe(false);
    });
  });

  describe("Pinch Berries", () => {
    it("given a Pokemon at 25% HP holding Liechi Berry, when on-damage-taken fires, then boosts Attack and is consumed", () => {
      // Source: Showdown data/items.ts -- Liechi Berry: +1 Atk at <= 25% HP
      // 400 * 0.25 = 100, currentHp 100 <= 100 triggers
      const pokemon = makeActive({ heldItem: "liechi-berry", hp: 400, currentHp: 100 });
      const ctx = makeItemContext({ pokemon, damage: 100 });
      const result = applyGen7HeldItem("on-damage-taken", ctx);
      expect(result.activated).toBe(true);
      expect(result.effects[0]).toEqual({
        type: "stat-boost",
        target: "self",
        value: "attack",
      });
      expect(result.effects[1]).toEqual({
        type: "consume",
        target: "self",
        value: "liechi-berry",
      });
    });

    it("given a Pokemon at 26% HP holding Liechi Berry, when on-damage-taken fires, then does not activate", () => {
      // 400 * 0.25 = 100, currentHp 101 > 100, no trigger
      const pokemon = makeActive({ heldItem: "liechi-berry", hp: 400, currentHp: 101 });
      const ctx = makeItemContext({ pokemon, damage: 50 });
      const result = applyGen7HeldItem("on-damage-taken", ctx);
      expect(result.activated).toBe(false);
    });
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// On-Contact Items
// ═══════════════════════════════════════════════════════════════════════════

describe("On-Contact Items", () => {
  describe("Rocky Helmet", () => {
    it("given a defender holding Rocky Helmet hit by a contact move, when on-contact fires, then deals 1/6 attacker's max HP", () => {
      // Source: Showdown data/items.ts -- Rocky Helmet: floor(attacker.baseMaxhp / 6)
      // Attacker max HP = 300, 300 / 6 = 50
      const defender = makeActive({ heldItem: "rocky-helmet", hp: 200, currentHp: 200 });
      const attacker = makeActive({ hp: 300, currentHp: 300 });
      const state = makeState({
        sides: [
          { active: [defender], team: [defender.pokemon] },
          { active: [attacker], team: [attacker.pokemon] },
        ],
      });
      const move = makeMove({ flags: { contact: true } });
      const ctx = makeItemContext({ pokemon: defender, state, move, damage: 50 });
      const result = applyGen7HeldItem("on-contact", ctx);
      expect(result.activated).toBe(true);
      expect(result.effects[0]).toEqual({ type: "chip-damage", target: "opponent", value: 50 });
    });

    it("given a defender holding Rocky Helmet hit by a non-contact move, when on-contact fires, then does not activate", () => {
      // Source: Showdown data/items.ts -- Rocky Helmet only triggers on contact
      const defender = makeActive({ heldItem: "rocky-helmet" });
      const move = makeMove({ flags: { contact: false } });
      const ctx = makeItemContext({ pokemon: defender, move, damage: 50 });
      const result = applyGen7HeldItem("on-contact", ctx);
      expect(result.activated).toBe(false);
    });
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// On-Hit Items (attacker perspective)
// ═══════════════════════════════════════════════════════════════════════════

describe("On-Hit Items", () => {
  describe("Life Orb", () => {
    it("given a Pokemon with 200 max HP holding Life Orb dealing damage, when on-hit fires, then takes 20 HP recoil (floor(200/10))", () => {
      // Source: Showdown data/items.ts -- Life Orb: floor(maxHP / 10) recoil
      // 200 / 10 = 20
      const pokemon = makeActive({ heldItem: "life-orb", hp: 200, currentHp: 200 });
      const ctx = makeItemContext({ pokemon, damage: 80, move: makeMove() });
      const result = applyGen7HeldItem("on-hit", ctx);
      expect(result.activated).toBe(true);
      expect(result.effects[0]).toEqual({ type: "chip-damage", target: "self", value: 20 });
    });

    it("given a Pokemon with 150 max HP holding Life Orb dealing damage, when on-hit fires, then takes 15 HP recoil (floor(150/10))", () => {
      // Source: Showdown data/items.ts -- Life Orb: floor(maxHP / 10) recoil
      // 150 / 10 = 15
      const pokemon = makeActive({ heldItem: "life-orb", hp: 150, currentHp: 150 });
      const ctx = makeItemContext({ pokemon, damage: 60, move: makeMove() });
      const result = applyGen7HeldItem("on-hit", ctx);
      expect(result.activated).toBe(true);
      expect(result.effects[0]).toEqual({ type: "chip-damage", target: "self", value: 15 });
    });

    it("given a Pokemon with Sheer Force using a move with secondary effect, when on-hit fires with Life Orb, then no recoil", () => {
      // Source: Showdown scripts.ts -- Sheer Force suppresses Life Orb recoil
      const pokemon = makeActive({ heldItem: "life-orb", hp: 200, ability: "sheer-force" });
      const move = makeMove({
        effect: { type: "status-chance", status: "burn", chance: 10 } as any,
      });
      const ctx = makeItemContext({ pokemon, damage: 80, move });
      const result = applyGen7HeldItem("on-hit", ctx);
      expect(result.activated).toBe(false);
    });
  });

  describe("Shell Bell", () => {
    it("given a Pokemon holding Shell Bell dealing 80 damage, when on-hit fires, then heals 10 HP (floor(80/8))", () => {
      // Source: Showdown data/items.ts -- Shell Bell: heals floor(damageDealt / 8)
      // 80 / 8 = 10
      const pokemon = makeActive({ heldItem: "shell-bell", hp: 200, currentHp: 150 });
      const ctx = makeItemContext({ pokemon, damage: 80, move: makeMove() });
      const result = applyGen7HeldItem("on-hit", ctx);
      expect(result.activated).toBe(true);
      expect(result.effects[0]).toEqual({ type: "heal", target: "self", value: 10 });
    });

    it("given a Pokemon holding Shell Bell dealing 160 damage, when on-hit fires, then heals 20 HP (floor(160/8))", () => {
      // Source: Showdown data/items.ts -- Shell Bell: floor(damageDealt / 8)
      // 160 / 8 = 20
      const pokemon = makeActive({ heldItem: "shell-bell", hp: 200, currentHp: 100 });
      const ctx = makeItemContext({ pokemon, damage: 160, move: makeMove() });
      const result = applyGen7HeldItem("on-hit", ctx);
      expect(result.activated).toBe(true);
      expect(result.effects[0]).toEqual({ type: "heal", target: "self", value: 20 });
    });
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// Gluttony / Pinch Berry Threshold
// ═══════════════════════════════════════════════════════════════════════════

describe("getPinchBerryThreshold", () => {
  it("given a Pokemon with Gluttony, when checking pinch berry threshold at 0.25, then returns 0.5", () => {
    // Source: Bulbapedia -- Gluttony changes pinch berry threshold from 25% to 50%
    expect(getPinchBerryThreshold({ ability: "gluttony" }, 0.25)).toBe(0.5);
  });

  it("given a Pokemon without Gluttony, when checking pinch berry threshold at 0.25, then returns 0.25", () => {
    expect(getPinchBerryThreshold({ ability: "none" }, 0.25)).toBe(0.25);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// Type Resist Berry (on-damage-taken via damage calc)
// ═══════════════════════════════════════════════════════════════════════════

describe("Type Resist Berry (Occa Berry)", () => {
  it("given a Pokemon with Occa Berry, when applyGen7HeldItem is called on-damage-taken, then NO_ACTIVATION is returned (handled in damage calc)", () => {
    // Type-resist berries (Occa, Passho, Wacan, Rindo, Yache, Chople, Kebia, Shuca, Coba,
    // Payapa, Tanga, Charti, Kasib, Haban, Colbur, Babiri, Chilan, Roseli) activate at the
    // pre-damage modifier stage inside Gen7DamageCalc.ts -- NOT in applyGen7HeldItem.
    // Source: Showdown data/items.ts -- Occa Berry: onSourceModifyDamage halves SE Fire damage
    // Source: Showdown sim/battle-actions.ts -- item modifiers run before final damage is applied
    // This test verifies the design: applyGen7HeldItem does NOT activate Occa Berry on-damage-taken.
    const pokemon = makeActive({ heldItem: "occa-berry", hp: 200, currentHp: 100 });
    const ctx = makeItemContext({ pokemon, damage: 50 });
    const result = applyGen7HeldItem("on-damage-taken", ctx);
    expect(result.activated).toBe(false);
  });

  it("given a non-fire move hitting an Occa Berry holder, when applyGen7HeldItem is called on-damage-taken, then NO_ACTIVATION is returned", () => {
    // Occa Berry should not activate even for non-fire hits (handled in damage calc only).
    // Source: Showdown data/items.ts -- Occa Berry only activates for Fire moves in damage calc
    const pokemon = makeActive({ heldItem: "occa-berry", hp: 200, currentHp: 50 });
    const ctx = makeItemContext({ pokemon, damage: 30 });
    const result = applyGen7HeldItem("on-damage-taken", ctx);
    expect(result.activated).toBe(false);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// Unburden volatile integration
// ═══════════════════════════════════════════════════════════════════════════

describe("Unburden integration", () => {
  it("given a Pokemon with Unburden consuming a Sitrus Berry, when end-of-turn fires, then unburden volatile is set", () => {
    // Source: Bulbapedia -- Unburden: doubles Speed when held item is consumed
    // Source: Showdown data/abilities.ts -- Unburden onAfterUseItem
    const pokemon = makeActive({
      heldItem: "sitrus-berry",
      hp: 200,
      currentHp: 100,
      ability: "unburden",
    });
    const ctx = makeItemContext({ pokemon });
    applyGen7HeldItem("end-of-turn", ctx);
    expect(pokemon.volatileStatuses.has("unburden")).toBe(true);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// Status Cure Berries
// ═══════════════════════════════════════════════════════════════════════════

describe("Status Cure Berries", () => {
  it("given a paralyzed Pokemon holding Cheri Berry, when end-of-turn fires, then cures paralysis and is consumed", () => {
    // Source: Showdown data/items.ts -- Cheri Berry cures paralysis
    const pokemon = makeActive({
      heldItem: "cheri-berry",
      status: "paralysis",
    });
    const ctx = makeItemContext({ pokemon });
    const result = applyGen7HeldItem("end-of-turn", ctx);
    expect(result.activated).toBe(true);
    expect(result.effects[0]).toEqual({ type: "status-cure", target: "self" });
    expect(result.effects[1]).toEqual({
      type: "consume",
      target: "self",
      value: "cheri-berry",
    });
  });

  it("given a sleeping Pokemon holding Chesto Berry, when end-of-turn fires, then cures sleep and is consumed", () => {
    // Source: Showdown data/items.ts -- Chesto Berry cures sleep
    const pokemon = makeActive({
      heldItem: "chesto-berry",
      status: "sleep",
    });
    const ctx = makeItemContext({ pokemon });
    const result = applyGen7HeldItem("end-of-turn", ctx);
    expect(result.activated).toBe(true);
    expect(result.effects[0]).toEqual({ type: "status-cure", target: "self" });
  });

  it("given a poisoned Pokemon holding Pecha Berry, when end-of-turn fires, then cures poison and is consumed", () => {
    // Source: Showdown data/items.ts -- Pecha Berry cures poison
    const pokemon = makeActive({
      heldItem: "pecha-berry",
      status: "poison",
    });
    const ctx = makeItemContext({ pokemon });
    const result = applyGen7HeldItem("end-of-turn", ctx);
    expect(result.activated).toBe(true);
    expect(result.effects[0]).toEqual({ type: "status-cure", target: "self" });
  });

  it("given a burned Pokemon holding Rawst Berry, when end-of-turn fires, then cures burn and is consumed", () => {
    // Source: Showdown data/items.ts -- Rawst Berry cures burn
    const pokemon = makeActive({
      heldItem: "rawst-berry",
      status: "burn",
    });
    const ctx = makeItemContext({ pokemon });
    const result = applyGen7HeldItem("end-of-turn", ctx);
    expect(result.activated).toBe(true);
    expect(result.effects[0]).toEqual({ type: "status-cure", target: "self" });
  });

  it("given a frozen Pokemon holding Aspear Berry, when end-of-turn fires, then cures freeze and is consumed", () => {
    // Source: Showdown data/items.ts -- Aspear Berry cures freeze
    const pokemon = makeActive({
      heldItem: "aspear-berry",
      status: "freeze",
    });
    const ctx = makeItemContext({ pokemon });
    const result = applyGen7HeldItem("end-of-turn", ctx);
    expect(result.activated).toBe(true);
    expect(result.effects[0]).toEqual({ type: "status-cure", target: "self" });
  });

  it("given a confused Pokemon holding Persim Berry, when end-of-turn fires, then cures confusion and is consumed", () => {
    // Source: Showdown data/items.ts -- Persim Berry cures confusion
    const volatiles = new Map([["confusion", { turnsLeft: 3 }]]);
    const pokemon = makeActive({ heldItem: "persim-berry", volatiles });
    const ctx = makeItemContext({ pokemon });
    const result = applyGen7HeldItem("end-of-turn", ctx);
    expect(result.activated).toBe(true);
    expect(result.effects[0]).toEqual({
      type: "volatile-cure",
      target: "self",
      value: "confusion",
    });
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// No-item guard
// ═══════════════════════════════════════════════════════════════════════════

describe("No-item guard", () => {
  it("given a Pokemon with no held item, when any trigger fires, then returns no activation", () => {
    const pokemon = makeActive({ heldItem: null });
    const ctx = makeItemContext({ pokemon });
    const result = applyGen7HeldItem("end-of-turn", ctx);
    expect(result.activated).toBe(false);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// Weakness Policy
// ═══════════════════════════════════════════════════════════════════════════

describe("Weakness Policy", () => {
  it("given a Grass-type Pokemon hit by a super-effective Fire move holding Weakness Policy, when on-damage-taken fires, then boosts Atk and SpAtk by 2 and consumes", () => {
    // Source: Showdown data/items.ts -- Weakness Policy: +2 Atk/SpAtk on SE hit
    // Source: Bulbapedia "Weakness Policy" -- triggered by super-effective damage
    const pokemon = makeActive({
      heldItem: "weakness-policy",
      types: ["grass"],
      hp: 200,
      currentHp: 100,
    });
    const move = makeMove({ type: "fire" });
    const ctx = makeItemContext({ pokemon, move, damage: 80 });
    const result = applyGen7HeldItem("on-damage-taken", ctx);
    expect(result.activated).toBe(true);
    expect(result.effects[0]).toEqual({
      type: "stat-boost",
      target: "self",
      value: "attack",
      stages: 2,
    });
    expect(result.effects[1]).toEqual({
      type: "stat-boost",
      target: "self",
      value: "spAttack",
      stages: 2,
    });
    expect(result.effects[2]).toEqual({
      type: "consume",
      target: "self",
      value: "weakness-policy",
    });
  });

  it("given a Normal-type Pokemon hit by a neutral Fire move holding Weakness Policy, when on-damage-taken fires, then does not activate", () => {
    // Normal takes 1x from Fire -- not super effective, no trigger
    const pokemon = makeActive({
      heldItem: "weakness-policy",
      types: ["normal"],
      hp: 200,
      currentHp: 100,
    });
    const move = makeMove({ type: "fire" });
    const ctx = makeItemContext({ pokemon, move, damage: 80 });
    const result = applyGen7HeldItem("on-damage-taken", ctx);
    expect(result.activated).toBe(false);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// Air Balloon
// ═══════════════════════════════════════════════════════════════════════════

describe("Air Balloon", () => {
  it("given a Pokemon holding Air Balloon hit by any damaging move, when on-damage-taken fires, then balloon pops (consumed)", () => {
    // Source: Showdown data/items.ts -- Air Balloon: pops on any damaging hit
    const pokemon = makeActive({ heldItem: "air-balloon", hp: 200, currentHp: 150 });
    const ctx = makeItemContext({ pokemon, damage: 50 });
    const result = applyGen7HeldItem("on-damage-taken", ctx);
    expect(result.activated).toBe(true);
    expect(result.effects[0]).toEqual({
      type: "consume",
      target: "self",
      value: "air-balloon",
    });
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// Oran Berry
// ═══════════════════════════════════════════════════════════════════════════

describe("Oran Berry", () => {
  it("given a Pokemon at 50% HP holding Oran Berry, when end-of-turn fires, then heals exactly 10 HP", () => {
    // Source: Showdown data/items.ts -- Oran Berry: restores 10 HP (fixed, not %)
    const pokemon = makeActive({ heldItem: "oran-berry", hp: 200, currentHp: 100 });
    const ctx = makeItemContext({ pokemon });
    const result = applyGen7HeldItem("end-of-turn", ctx);
    expect(result.activated).toBe(true);
    expect(result.effects[0]).toEqual({ type: "heal", target: "self", value: 10 });
  });

  it("given a Pokemon at 51% HP holding Oran Berry, when end-of-turn fires, then does not activate", () => {
    // 200 / 2 = 100, currentHp 101 > 100
    const pokemon = makeActive({ heldItem: "oran-berry", hp: 200, currentHp: 101 });
    const ctx = makeItemContext({ pokemon });
    const result = applyGen7HeldItem("end-of-turn", ctx);
    expect(result.activated).toBe(false);
  });
});
