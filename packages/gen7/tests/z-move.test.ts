import type { ActivePokemon, BattleSide, BattleState } from "@pokemon-lib-ts/battle";
import type { MoveData, PokemonType } from "@pokemon-lib-ts/core";
import { describe, expect, it } from "vitest";
import { Gen7ZMove, getSpeciesZBaseMove, getZMoveName, getZMovePower } from "../src/Gen7ZMove";

// ---------------------------------------------------------------------------
// Helper factories
// ---------------------------------------------------------------------------

function makeMove(overrides?: {
  id?: string;
  type?: PokemonType;
  category?: "physical" | "special" | "status";
  power?: number | null;
  effect?: MoveData["effect"];
  zMoveEffect?: string;
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
    },
    effect: overrides?.effect ?? null,
    description: "",
    generation: 7,
    critRatio: 0,
    zMoveEffect: overrides?.zMoveEffect,
  } as MoveData;
}

function makeActive(overrides: {
  heldItem?: string | null;
  moves?: Array<{ moveId: string; type?: PokemonType }>;
  types?: PokemonType[];
  ability?: string;
  transformed?: boolean;
  isMega?: boolean;
}): ActivePokemon {
  const moveSlots = (overrides.moves ?? [{ moveId: "tackle" }]).map((m) => ({
    moveId: m.moveId,
    currentPP: 10,
    maxPP: 15,
    ppUps: 0,
  }));

  return {
    pokemon: {
      uid: "test-pokemon",
      speciesId: 25,
      nickname: null,
      level: 50,
      experience: 0,
      nature: "hardy",
      ivs: { hp: 31, attack: 31, defense: 31, spAttack: 31, spDefense: 31, speed: 31 },
      evs: { hp: 0, attack: 0, defense: 0, spAttack: 0, spDefense: 0, speed: 0 },
      currentHp: 100,
      moves: moveSlots,
      ability: overrides.ability ?? "static",
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
      pokeball: "pokeball",
      calculatedStats: {
        hp: 100,
        attack: 100,
        defense: 100,
        spAttack: 100,
        spDefense: 100,
        speed: 100,
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
    types: overrides.types ?? ["electric"],
    ability: overrides.ability ?? "static",
    lastMoveUsed: null,
    lastDamageTaken: 0,
    lastDamageType: null,
    lastDamageCategory: null,
    turnsOnField: 0,
    movedThisTurn: false,
    consecutiveProtects: 0,
    substituteHp: 0,
    itemKnockedOff: false,
    transformed: overrides.transformed ?? false,
    transformedSpecies: null,
    isMega: overrides.isMega ?? false,
    isDynamaxed: false,
    dynamaxTurnsLeft: 0,
    isTerastallized: false,
    teraType: null,
    stellarBoostedTypes: [],
    suppressedAbility: null,
    forcedMove: null,
  } as ActivePokemon;
}

function makeSide(index: 0 | 1 = 0): BattleSide {
  return {
    index,
    gimmickUsed: false,
    trainer: { id: "ash", displayName: "Ash", trainerClass: "Trainer" },
    team: [],
    active: [],
    screens: {},
    hazards: {},
    wish: null,
    futureAttack: null,
    faintCount: 0,
  } as unknown as BattleSide;
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

// ═══════════════════════════════════════════════════════════════════════════
// Z-Move Power Table
// ═══════════════════════════════════════════════════════════════════════════

describe("Z-Move Power Table", () => {
  it("given a 50 BP move, when calculating Z-Move power, then returns 100", () => {
    // Source: Showdown sim/dex-moves.ts:576 -- basePower < 60 -> 100
    const move = makeMove({ power: 50 });
    expect(getZMovePower(move)).toBe(100);
  });

  it("given a 55 BP move, when calculating Z-Move power, then returns 100", () => {
    // Source: Showdown sim/dex-moves.ts:576 -- basePower < 60 -> 100
    const move = makeMove({ power: 55 });
    expect(getZMovePower(move)).toBe(100);
  });

  it("given a 60 BP move, when calculating Z-Move power, then returns 120", () => {
    // Source: Showdown sim/dex-moves.ts:574 -- basePower >= 60 -> 120
    const move = makeMove({ power: 60 });
    expect(getZMovePower(move)).toBe(120);
  });

  it("given a 65 BP move, when calculating Z-Move power, then returns 120", () => {
    // Source: Showdown sim/dex-moves.ts:574 -- basePower >= 60 -> 120
    const move = makeMove({ power: 65 });
    expect(getZMovePower(move)).toBe(120);
  });

  it("given a 70 BP move, when calculating Z-Move power, then returns 140", () => {
    // Source: Showdown sim/dex-moves.ts:572 -- basePower >= 70 -> 140
    const move = makeMove({ power: 70 });
    expect(getZMovePower(move)).toBe(140);
  });

  it("given an 80 BP move (Dragon Claw), when calculating Z-Move power, then returns 160", () => {
    // Source: Showdown sim/dex-moves.ts:570 -- basePower >= 80 -> 160
    // Source: Bulbapedia "Dragon Claw" -- 80 BP
    const move = makeMove({ id: "dragon-claw", type: "dragon", power: 80 });
    expect(getZMovePower(move)).toBe(160);
  });

  it("given a 90 BP move (Thunderbolt), when calculating Z-Move power, then returns 175", () => {
    // Source: Showdown sim/dex-moves.ts:568 -- basePower >= 90 -> 175
    // Source: Bulbapedia "Thunderbolt" -- 90 BP
    // Source: specs/battle/08-gen7.md -- "Thunderbolt (90 power) -> Gigavolt Havoc (175 power)"
    const move = makeMove({ id: "thunderbolt", type: "electric", power: 90 });
    expect(getZMovePower(move)).toBe(175);
  });

  it("given a 100 BP move, when calculating Z-Move power, then returns 180", () => {
    // Source: Showdown sim/dex-moves.ts:566 -- basePower >= 100 -> 180
    const move = makeMove({ power: 100 });
    expect(getZMovePower(move)).toBe(180);
  });

  it("given a 110 BP move, when calculating Z-Move power, then returns 185", () => {
    // Source: Showdown sim/dex-moves.ts:564 -- basePower >= 110 -> 185
    const move = makeMove({ power: 110 });
    expect(getZMovePower(move)).toBe(185);
  });

  it("given a 120 BP move (Close Combat), when calculating Z-Move power, then returns 190", () => {
    // Source: Showdown sim/dex-moves.ts:562 -- basePower >= 120 -> 190
    // Source: specs/battle/08-gen7.md -- "Close Combat (120 power) -> All-Out Pummeling (190 power, NOT 180)"
    const move = makeMove({ id: "close-combat", type: "fighting", power: 120 });
    expect(getZMovePower(move)).toBe(190);
  });

  it("given a 130 BP move, when calculating Z-Move power, then returns 195", () => {
    // Source: Showdown sim/dex-moves.ts:560 -- basePower >= 130 -> 195
    const move = makeMove({ power: 130 });
    expect(getZMovePower(move)).toBe(195);
  });

  it("given a 131 BP move, when calculating Z-Move power, then returns 195", () => {
    // Source: Showdown sim/dex-moves.ts:560 -- basePower >= 130 -> 195
    const move = makeMove({ power: 131 });
    expect(getZMovePower(move)).toBe(195);
  });

  it("given a 140 BP move, when calculating Z-Move power, then returns 200", () => {
    // Source: Showdown sim/dex-moves.ts:558 -- basePower >= 140 -> 200
    const move = makeMove({ power: 140 });
    expect(getZMovePower(move)).toBe(200);
  });

  it("given a 180 BP move (V-Create), when calculating Z-Move power, then returns 200", () => {
    // Source: Showdown sim/dex-moves.ts:558 -- basePower >= 140 -> 200
    // Source: specs/battle/08-gen7.md -- "V-Create (180 power) -> Z-V-Create (200 power)"
    const move = makeMove({ id: "v-create", type: "fire", power: 180 });
    expect(getZMovePower(move)).toBe(200);
  });

  it("given a 0 BP move (no base power), when calculating Z-Move power, then returns 100", () => {
    // Source: Showdown sim/dex-moves.ts:556 -- `if (!basePower)` -> 100
    const move = makeMove({ power: 0 });
    expect(getZMovePower(move)).toBe(100);
  });

  it("given a null BP move, when calculating Z-Move power, then returns 100", () => {
    // Source: Showdown sim/dex-moves.ts:556 -- `if (!basePower)` -> 100
    const move = makeMove({ power: null });
    expect(getZMovePower(move)).toBe(100);
  });

  it("given a status move, when calculating Z-Move power, then returns 0", () => {
    // Source: Showdown sim/dex-moves.ts:551 -- status moves skipped entirely
    const move = makeMove({ category: "status", power: null });
    expect(getZMovePower(move)).toBe(0);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// Multi-Hit Z-Move Power
// ═══════════════════════════════════════════════════════════════════════════

describe("Multi-Hit Z-Move Power", () => {
  it("given a 25 BP multi-hit move (Bullet Seed), when calculating Z-Move power, then uses 75 BP -> 140", () => {
    // Source: Showdown sim/dex-moves.ts:554 -- multi-hit: basePower *= 3
    // Source: specs/battle/08-gen7.md -- "Bullet Seed 25 BP x 3 = 75 -> 140 Z-power"
    // 25 * 3 = 75, 75 >= 70 -> 140
    const move = makeMove({
      id: "bullet-seed",
      type: "grass",
      power: 25,
      effect: { type: "multi-hit", min: 2, max: 5 },
    });
    expect(getZMovePower(move)).toBe(140);
  });

  it("given a 20 BP multi-hit move, when calculating Z-Move power, then uses 60 BP -> 120", () => {
    // Source: Showdown sim/dex-moves.ts:554 -- multi-hit: basePower *= 3
    // 20 * 3 = 60, 60 >= 60 -> 120
    const move = makeMove({
      id: "fury-attack",
      type: "normal",
      power: 20,
      effect: { type: "multi-hit", min: 2, max: 5 },
    });
    expect(getZMovePower(move)).toBe(120);
  });

  it("given a 15 BP multi-hit move, when calculating Z-Move power, then uses 45 BP -> 100", () => {
    // Source: Showdown sim/dex-moves.ts:554 -- multi-hit: basePower *= 3
    // 15 * 3 = 45, 45 < 60 -> 100
    const move = makeMove({
      id: "fury-swipes",
      type: "normal",
      power: 15,
      effect: { type: "multi-hit", min: 2, max: 5 },
    });
    expect(getZMovePower(move)).toBe(100);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// Z-Move Names
// ═══════════════════════════════════════════════════════════════════════════

describe("Z-Move Names", () => {
  it("given electric type, when getting Z-Move name, then returns gigavolt-havoc", () => {
    // Source: Showdown sim/battle-actions.ts:40 -- Electric: "Gigavolt Havoc"
    expect(getZMoveName("electric")).toBe("gigavolt-havoc");
  });

  it("given fire type, when getting Z-Move name, then returns inferno-overdrive", () => {
    // Source: Showdown sim/battle-actions.ts:42 -- Fire: "Inferno Overdrive"
    expect(getZMoveName("fire")).toBe("inferno-overdrive");
  });

  it("given dragon type, when getting Z-Move name, then returns devastating-drake", () => {
    // Source: Showdown sim/battle-actions.ts:39 -- Dragon: "Devastating Drake"
    expect(getZMoveName("dragon")).toBe("devastating-drake");
  });

  it("given fighting type, when getting Z-Move name, then returns all-out-pummeling", () => {
    // Source: Showdown sim/battle-actions.ts:33 -- Fighting: "All-Out Pummeling"
    expect(getZMoveName("fighting")).toBe("all-out-pummeling");
  });

  it("given fairy type, when getting Z-Move name, then returns twinkle-tackle", () => {
    // Source: Showdown sim/battle-actions.ts:49 -- Fairy: "Twinkle Tackle"
    expect(getZMoveName("fairy")).toBe("twinkle-tackle");
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// Species-Specific Z-Move Base Moves
// ═══════════════════════════════════════════════════════════════════════════

describe("Species-Specific Z-Move Data", () => {
  it("given Pikanium Z, when getting base move, then returns volt-tackle", () => {
    // Source: Showdown data/items.ts -- pikaniumz: zMoveFrom: "Volt Tackle"
    expect(getSpeciesZBaseMove("pikanium-z")).toBe("volt-tackle");
  });

  it("given Decidium Z, when getting base move, then returns spirit-shackle", () => {
    // Source: Showdown data/items.ts -- decidiumz: zMoveFrom: "Spirit Shackle"
    expect(getSpeciesZBaseMove("decidium-z")).toBe("spirit-shackle");
  });

  it("given a non-species Z-Crystal, when getting base move, then returns null", () => {
    expect(getSpeciesZBaseMove("electrium-z")).toBe(null);
  });

  it("given a non-Z-Crystal item, when getting base move, then returns null", () => {
    expect(getSpeciesZBaseMove("leftovers")).toBe(null);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// Gen7ZMove.canUse
// ═══════════════════════════════════════════════════════════════════════════

describe("Gen7ZMove.canUse", () => {
  it("given a Pokemon holding a type-specific Z-Crystal, when checking canUse, then returns true", () => {
    // Source: Showdown sim/battle-actions.ts:1450-1456 -- canZMove checks
    const zMove = new Gen7ZMove();
    const pokemon = makeActive({
      heldItem: "electrium-z",
      moves: [{ moveId: "thunderbolt" }],
    });
    const side = makeSide(0);
    const state = makeState();

    expect(zMove.canUse(pokemon, side, state)).toBe(true);
  });

  it("given a Pokemon holding no item, when checking canUse, then returns false", () => {
    // Source: Showdown sim/battle-actions.ts:1405 -- item check
    const zMove = new Gen7ZMove();
    const pokemon = makeActive({
      heldItem: null,
      moves: [{ moveId: "thunderbolt" }],
    });
    const side = makeSide(0);
    const state = makeState();

    expect(zMove.canUse(pokemon, side, state)).toBe(false);
  });

  it("given a Pokemon holding a non-Z-Crystal item, when checking canUse, then returns false", () => {
    // Source: Showdown sim/battle-actions.ts:1456 -- `if (!item.zMove) return;`
    const zMove = new Gen7ZMove();
    const pokemon = makeActive({
      heldItem: "leftovers",
      moves: [{ moveId: "thunderbolt" }],
    });
    const side = makeSide(0);
    const state = makeState();

    expect(zMove.canUse(pokemon, side, state)).toBe(false);
  });

  it("given a species Z-Crystal with the required signature move, when checking canUse, then returns true", () => {
    // Source: Showdown data/items.ts -- pikaniumz: zMoveFrom: "Volt Tackle"
    const zMove = new Gen7ZMove();
    const pokemon = makeActive({
      heldItem: "pikanium-z",
      moves: [{ moveId: "volt-tackle" }, { moveId: "thunderbolt" }],
    });
    const side = makeSide(0);
    const state = makeState();

    expect(zMove.canUse(pokemon, side, state)).toBe(true);
  });

  it("given a species Z-Crystal WITHOUT the required signature move, when checking canUse, then returns false", () => {
    // Source: Showdown data/items.ts -- pikaniumz: zMoveFrom: "Volt Tackle"
    // Pokemon has Thunderbolt but NOT Volt Tackle
    const zMove = new Gen7ZMove();
    const pokemon = makeActive({
      heldItem: "pikanium-z",
      moves: [{ moveId: "thunderbolt" }],
    });
    const side = makeSide(0);
    const state = makeState();

    expect(zMove.canUse(pokemon, side, state)).toBe(false);
  });

  it("given the side has already used a Z-Move, when checking canUse, then returns false", () => {
    // Source: Showdown sim/battle-actions.ts:1404,1451 -- zMoveUsed check
    const zMove = new Gen7ZMove();
    const pokemon = makeActive({
      heldItem: "electrium-z",
      moves: [{ moveId: "thunderbolt" }],
    });
    const side = makeSide(0);
    const state = makeState();

    // First use should succeed
    expect(zMove.canUse(pokemon, side, state)).toBe(true);

    // Activate to mark as used
    zMove.activate(pokemon, side, state);

    // Second attempt should fail
    expect(zMove.canUse(pokemon, side, state)).toBe(false);
  });

  it("given a transformed Mega Pokemon, when checking canUse, then returns false", () => {
    // Source: Showdown sim/battle-actions.ts:1452-1454 -- transformed mega block
    const zMove = new Gen7ZMove();
    const pokemon = makeActive({
      heldItem: "electrium-z",
      moves: [{ moveId: "thunderbolt" }],
      transformed: true,
      isMega: true,
    });
    const side = makeSide(0);
    const state = makeState();

    expect(zMove.canUse(pokemon, side, state)).toBe(false);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// Gen7ZMove.activate
// ═══════════════════════════════════════════════════════════════════════════

describe("Gen7ZMove.activate", () => {
  it("given a valid Z-Move activation with type Z-Crystal, when activating, then marks side as used", () => {
    // Source: Showdown sim/side.ts:170 -- zMoveUsed set to true
    const zMove = new Gen7ZMove();
    const pokemon = makeActive({
      heldItem: "electrium-z",
      moves: [{ moveId: "thunderbolt" }],
    });
    const side = makeSide(0);
    const state = makeState();

    expect(zMove.hasUsedZMove(0)).toBe(false);
    zMove.activate(pokemon, side, state);
    expect(zMove.hasUsedZMove(0)).toBe(true);
  });

  it("given a valid Z-Move activation, when activating, then emits a ZMoveEvent", () => {
    // Source: Showdown sim/battle.ts:2626-2631 -- Z-Move activation emits event
    const zMove = new Gen7ZMove();
    const pokemon = makeActive({
      heldItem: "electrium-z",
      moves: [{ moveId: "thunderbolt" }],
    });
    const side = makeSide(0);
    const state = makeState();

    const events = zMove.activate(pokemon, side, state);

    expect(events).toHaveLength(1);
    expect(events[0].type).toBe("z-move");
    const zmEvent = events[0] as { type: "z-move"; side: 0 | 1; pokemon: string; move: string };
    expect(zmEvent.side).toBe(0);
    expect(zmEvent.pokemon).toBe("test-pokemon");
    expect(zmEvent.move).toBe("gigavolt-havoc");
  });

  it("given a species Z-Crystal activation, when activating, then emits event with species Z-Move name", () => {
    // Source: Showdown data/items.ts -- pikaniumz: zMove: "Catastropika"
    const zMove = new Gen7ZMove();
    const pokemon = makeActive({
      heldItem: "pikanium-z",
      moves: [{ moveId: "volt-tackle" }],
    });
    const side = makeSide(0);
    const state = makeState();

    const events = zMove.activate(pokemon, side, state);
    const zmEvent = events[0] as { type: "z-move"; move: string };
    expect(zmEvent.move).toBe("catastropika");
  });

  it("given side 0 uses Z-Move, when side 1 checks canUse, then returns true (independent tracking)", () => {
    // Source: Showdown sim/side.ts -- zMoveUsed is per-side
    const zMove = new Gen7ZMove();

    const pokemon0 = makeActive({
      heldItem: "electrium-z",
      moves: [{ moveId: "thunderbolt" }],
    });
    const side0 = makeSide(0);

    const pokemon1 = makeActive({
      heldItem: "firium-z",
      moves: [{ moveId: "flamethrower" }],
    });
    const side1 = makeSide(1);
    const state = makeState();

    zMove.activate(pokemon0, side0, state);

    // Side 0 used Z-Move, side 1 should still be able to use theirs
    expect(zMove.canUse(pokemon1, side1, state)).toBe(true);
  });

  it("given Z-Move activation, when checking side.gimmickUsed, then it is NOT set (separate tracking)", () => {
    // Source: Showdown sim/side.ts:170 -- zMoveUsed is separate from megaUsed
    // Gen 7 allows both Mega + Z-Move in same battle (different Pokemon)
    const zMove = new Gen7ZMove();
    const pokemon = makeActive({
      heldItem: "electrium-z",
      moves: [{ moveId: "thunderbolt" }],
    });
    const side = makeSide(0);
    const state = makeState();

    zMove.activate(pokemon, side, state);

    // side.gimmickUsed should NOT be set by Z-Move activation
    // (it's reserved for Mega Evolution)
    expect(side.gimmickUsed).toBe(false);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// Gen7ZMove.modifyMove -- Damaging Moves
// ═══════════════════════════════════════════════════════════════════════════

describe("Gen7ZMove.modifyMove (damaging)", () => {
  it("given a 90 BP Electric move with Electrium Z, when modifying, then returns Gigavolt Havoc with 175 BP", () => {
    // Source: Showdown sim/battle-actions.ts:1441-1447 -- getActiveZMove
    // Source: specs/battle/08-gen7.md -- "Thunderbolt (90 power) -> Gigavolt Havoc (175 power)"
    const zMove = new Gen7ZMove();
    const pokemon = makeActive({
      heldItem: "electrium-z",
      moves: [{ moveId: "thunderbolt" }],
    });

    const thunderbolt = makeMove({ id: "thunderbolt", type: "electric", power: 90 });
    const result = zMove.modifyMove(thunderbolt, pokemon);

    expect(result.id).toBe("gigavolt-havoc");
    expect(result.power).toBe(175);
    expect(result.accuracy).toBe(null); // Z-Moves never miss
    expect(result.zMovePower).toBe(175);
  });

  it("given a 120 BP Fighting move with Fightinium Z, when modifying, then returns All-Out Pummeling with 190 BP", () => {
    // Source: specs/battle/08-gen7.md -- "Close Combat (120 power) -> All-Out Pummeling (190 power)"
    const zMove = new Gen7ZMove();
    const pokemon = makeActive({
      heldItem: "fightinium-z",
      moves: [{ moveId: "close-combat" }],
    });

    const closeCombat = makeMove({
      id: "close-combat",
      type: "fighting",
      power: 120,
    });
    const result = zMove.modifyMove(closeCombat, pokemon);

    expect(result.id).toBe("all-out-pummeling");
    expect(result.power).toBe(190);
  });

  it("given a move that doesn't match the Z-Crystal type, when modifying, then returns unchanged move", () => {
    // Source: Showdown sim/battle-actions.ts:1415 -- type check: `move.type === item.zMoveType`
    const zMove = new Gen7ZMove();
    const pokemon = makeActive({
      heldItem: "electrium-z",
      moves: [{ moveId: "flamethrower" }],
    });

    const flamethrower = makeMove({ id: "flamethrower", type: "fire", power: 90 });
    const result = zMove.modifyMove(flamethrower, pokemon);

    // Should return unchanged because Fire doesn't match Electrium Z (Electric)
    expect(result.id).toBe("flamethrower");
    expect(result.power).toBe(90);
  });

  it("given a damaging move converted to Z-Move, when checking category, then preserves original category", () => {
    // Source: Showdown sim/battle-actions.ts:1443 -- `zMove.category = move.category;`
    const zMove = new Gen7ZMove();
    const pokemon = makeActive({
      heldItem: "electrium-z",
      moves: [{ moveId: "thunderbolt" }],
    });

    const thunderbolt = makeMove({
      id: "thunderbolt",
      type: "electric",
      power: 90,
      category: "special",
    });
    const result = zMove.modifyMove(thunderbolt, pokemon);

    expect(result.category).toBe("special");
  });

  it("given a physical move converted to Z-Move, when checking category, then preserves physical", () => {
    // Source: Showdown sim/battle-actions.ts:1443 -- category preserved
    const zMove = new Gen7ZMove();
    const pokemon = makeActive({
      heldItem: "electrium-z",
      moves: [{ moveId: "wild-charge" }],
    });

    const wildCharge = makeMove({
      id: "wild-charge",
      type: "electric",
      power: 90,
      category: "physical",
    });
    const result = zMove.modifyMove(wildCharge, pokemon);

    expect(result.category).toBe("physical");
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// Gen7ZMove.modifyMove -- Species-Specific Z-Moves
// ═══════════════════════════════════════════════════════════════════════════

describe("Gen7ZMove.modifyMove (species-specific)", () => {
  it("given Pikachu with Pikanium Z and Volt Tackle, when modifying, then returns Catastropika with 210 BP", () => {
    // Source: Showdown data/moves.ts -- catastropika: basePower 210
    // Source: Showdown data/items.ts -- pikaniumz: zMoveFrom: "Volt Tackle", zMove: "Catastropika"
    const zMove = new Gen7ZMove();
    const pokemon = makeActive({
      heldItem: "pikanium-z",
      moves: [{ moveId: "volt-tackle" }],
    });

    const voltTackle = makeMove({
      id: "volt-tackle",
      type: "electric",
      power: 120,
      category: "physical",
    });
    const result = zMove.modifyMove(voltTackle, pokemon);

    expect(result.id).toBe("catastropika");
    expect(result.power).toBe(210);
    expect(result.accuracy).toBe(null);
  });

  it("given Snorlax with Snorlium Z and Giga Impact, when modifying, then returns Pulverizing Pancake with 210 BP", () => {
    // Source: Showdown data/moves.ts -- pulverizingpancake: basePower 210
    const zMove = new Gen7ZMove();
    const pokemon = makeActive({
      heldItem: "snorlium-z",
      moves: [{ moveId: "giga-impact" }],
    });

    const gigaImpact = makeMove({
      id: "giga-impact",
      type: "normal",
      power: 150,
      category: "physical",
    });
    const result = zMove.modifyMove(gigaImpact, pokemon);

    expect(result.id).toBe("pulverizing-pancake");
    expect(result.power).toBe(210);
  });

  it("given species Z-Crystal but wrong move, when modifying, then returns unchanged move", () => {
    // Source: Showdown sim/battle-actions.ts:1413 -- only transforms if move.name === item.zMoveFrom
    const zMove = new Gen7ZMove();
    const pokemon = makeActive({
      heldItem: "pikanium-z",
      moves: [{ moveId: "thunderbolt" }],
    });

    // Thunderbolt is NOT Volt Tackle, so Pikanium Z doesn't trigger
    const thunderbolt = makeMove({
      id: "thunderbolt",
      type: "electric",
      power: 90,
    });
    const result = zMove.modifyMove(thunderbolt, pokemon);

    expect(result.id).toBe("thunderbolt");
    expect(result.power).toBe(90);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// One Per Battle
// ═══════════════════════════════════════════════════════════════════════════

describe("One Z-Move Per Battle", () => {
  it("given first Z-Move attempt, when checking canUse, then returns true", () => {
    // Source: Showdown sim/battle-actions.ts:1404 -- zMoveUsed check
    const zMove = new Gen7ZMove();
    const pokemon = makeActive({
      heldItem: "electrium-z",
      moves: [{ moveId: "thunderbolt" }],
    });
    const side = makeSide(0);
    const state = makeState();

    expect(zMove.canUse(pokemon, side, state)).toBe(true);
  });

  it("given Z-Move already used, when second Pokemon attempts Z-Move, then canUse returns false", () => {
    // Source: Showdown sim/battle-actions.ts:1404,1451 -- zMoveUsed check per side
    const zMove = new Gen7ZMove();

    const pokemon1 = makeActive({
      heldItem: "electrium-z",
      moves: [{ moveId: "thunderbolt" }],
    });
    const pokemon2 = makeActive({
      heldItem: "firium-z",
      moves: [{ moveId: "flamethrower" }],
    });
    const side = makeSide(0);
    const state = makeState();

    // First Pokemon uses Z-Move
    zMove.activate(pokemon1, side, state);

    // Second Pokemon on same side tries Z-Move
    expect(zMove.canUse(pokemon2, side, state)).toBe(false);
  });

  it("given Z-Move used, when reset() is called, then canUse returns true again", () => {
    const zMove = new Gen7ZMove();
    const pokemon = makeActive({
      heldItem: "electrium-z",
      moves: [{ moveId: "thunderbolt" }],
    });
    const side = makeSide(0);
    const state = makeState();

    zMove.activate(pokemon, side, state);
    expect(zMove.canUse(pokemon, side, state)).toBe(false);

    zMove.reset();
    expect(zMove.canUse(pokemon, side, state)).toBe(true);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// Gen7ZMove class properties
// ═══════════════════════════════════════════════════════════════════════════

describe("Gen7ZMove class properties", () => {
  it("has name 'Z-Move'", () => {
    const zMove = new Gen7ZMove();
    expect(zMove.name).toBe("Z-Move");
  });

  it("has generations [7]", () => {
    const zMove = new Gen7ZMove();
    expect(zMove.generations).toEqual([7]);
  });
});
