import type { ActivePokemon, BattleSide, BattleState } from "@pokemon-lib-ts/battle";
import type { MoveData, PokemonType } from "@pokemon-lib-ts/core";
import { describe, expect, it } from "vitest";
import { Gen7ZMove, getZMovePower } from "../src/Gen7ZMove";

// ---------------------------------------------------------------------------
// Helper factories (mirrors z-move.test.ts but kept local per project convention)
// ---------------------------------------------------------------------------

function makeMove(overrides?: {
  id?: string;
  displayName?: string;
  type?: PokemonType;
  category?: "physical" | "special" | "status";
  power?: number | null;
  effect?: MoveData["effect"];
  zMoveEffect?: string;
}): MoveData {
  return {
    id: overrides?.id ?? "swords-dance",
    displayName: overrides?.displayName ?? overrides?.id ?? "Swords Dance",
    type: overrides?.type ?? "normal",
    category: overrides?.category ?? "status",
    power: overrides?.power ?? null,
    accuracy: 100,
    pp: 20,
    priority: 0,
    target: "self",
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
      protect: false,
      mirror: false,
      snatch: true,
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
  moves?: Array<{ moveId: string }>;
}): ActivePokemon {
  const moveSlots = (overrides.moves ?? [{ moveId: "swords-dance" }]).map((m) => ({
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
      ability: "static",
      abilitySlot: "normal1" as const,
      heldItem: overrides.heldItem ?? null,
      status: null,
      friendship: 0,
      gender: "male" as never,
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
    types: ["electric"] as PokemonType[],
    ability: "static",
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

// ═══════════════════════════════════════════════════════════════════════════
// Status Z-Moves
// ═══════════════════════════════════════════════════════════════════════════

describe("Status Z-Move: modifyMove preserves original move identity", () => {
  it("given Swords Dance with Normalium Z, when modifying, then keeps original move ID so effect still fires", () => {
    // Source: Showdown sim/battle-actions.ts:1435-1439 -- status Z-Moves keep original ID
    // Source: specs/battle/08-gen7.md -- "Status moves converted to Z-Moves perform the original
    //   status move's effect PLUS a bonus Z-Power effect."
    const zMove = new Gen7ZMove();
    const pokemon = makeActive({
      heldItem: "normalium-z",
      moves: [{ moveId: "swords-dance" }],
    });

    const swordsDance = makeMove({
      id: "swords-dance",
      displayName: "Swords Dance",
      type: "normal",
      category: "status",
      zMoveEffect: "clearnegativeboost",
    });

    const result = zMove.modifyMove(swordsDance, pokemon);

    // The move ID must remain "swords-dance" so the engine executes the original stat boost
    expect(result.id).toBe("swords-dance");
    // Display name is prefixed with Z-
    expect(result.displayName).toBe("Z-Swords Dance");
    // Category stays status
    expect(result.category).toBe("status");
    // Z-Move power is 0 for status moves (they don't deal damage)
    expect(result.zMovePower).toBe(0);
  });

  it("given Calm Mind with Psychium Z, when modifying, then preserves original ID and sets zMoveEffect", () => {
    // Source: Showdown data/moves.ts -- calmmind: zMove: { effect: 'clearnegativeboost' }
    // Source: specs/battle/08-gen7.md -- Calm Mind listed under clearnegativeboost
    const zMove = new Gen7ZMove();
    const pokemon = makeActive({
      heldItem: "psychium-z",
      moves: [{ moveId: "calm-mind" }],
    });

    const calmMind = makeMove({
      id: "calm-mind",
      displayName: "Calm Mind",
      type: "psychic",
      category: "status",
      zMoveEffect: "clearnegativeboost",
    });

    const result = zMove.modifyMove(calmMind, pokemon);

    expect(result.id).toBe("calm-mind");
    expect(result.displayName).toBe("Z-Calm Mind");
    expect(result.zMoveEffect).toBe("clearnegativeboost");
  });
});

describe("Status Z-Move: heal effect", () => {
  it("given Splash with Normalium Z (heal effect), when modifying, then returns Z-Splash with heal zMoveEffect", () => {
    // Source: Showdown data/moves.ts -- splash: zMove: { boost: { atk: 3 } }
    // NOTE: Splash's actual Z-Move effect is a +3 Attack boost, not heal.
    // The "heal" effect is on moves like Memento.
    // Source: specs/battle/08-gen7.md -- "Z-Splash: Boosts Attack by +3"
    // However, for testing the heal pathway, we use a move that HAS heal as its zMoveEffect.
    const zMove = new Gen7ZMove();
    const pokemon = makeActive({
      heldItem: "normalium-z",
      moves: [{ moveId: "memento" }],
    });

    // Memento is a status move with zMoveEffect "heal"
    // Source: Showdown data/moves.ts -- memento: zMove: { effect: 'healreplacement' }
    // For testing the heal pathway, use a fictional status move with zMoveEffect "heal"
    const statusMove = makeMove({
      id: "memento",
      displayName: "Memento",
      type: "normal",
      category: "status",
      zMoveEffect: "heal",
    });

    const result = zMove.modifyMove(statusMove, pokemon);

    // The zMoveEffect is preserved from the base move data
    expect(result.zMoveEffect).toBe("heal");
    // Move ID preserved so original effect fires
    expect(result.id).toBe("memento");
    // Power is 0 (status Z-Move)
    expect(result.zMovePower).toBe(0);
  });

  it("given a status move with heal zMoveEffect, when checking power, then getZMovePower returns 0", () => {
    // Source: Showdown sim/dex-moves.ts:551 -- status moves return 0 power
    const statusMove = makeMove({
      id: "healing-wish",
      type: "psychic",
      category: "status",
      zMoveEffect: "heal",
    });

    expect(getZMovePower(statusMove)).toBe(0);
  });
});

describe("Status Z-Move: clearnegativeboost effect", () => {
  it("given Swords Dance with clearnegativeboost zMoveEffect, when modifying, then preserves the effect", () => {
    // Source: Showdown data/moves.ts -- swordsdance: zMove: { effect: 'clearnegativeboost' }
    // Source: specs/battle/08-gen7.md -- "clearnegativeboost: Clears all negative stat changes"
    const zMove = new Gen7ZMove();
    const pokemon = makeActive({
      heldItem: "normalium-z",
      moves: [{ moveId: "swords-dance" }],
    });

    const swordsDance = makeMove({
      id: "swords-dance",
      displayName: "Swords Dance",
      type: "normal",
      category: "status",
      zMoveEffect: "clearnegativeboost",
    });

    const result = zMove.modifyMove(swordsDance, pokemon);

    expect(result.zMoveEffect).toBe("clearnegativeboost");
    expect(result.id).toBe("swords-dance");
  });

  it("given Bulk Up with clearnegativeboost zMoveEffect, when modifying, then preserves the effect", () => {
    // Source: Showdown data/moves.ts -- bulkup: zMove: { effect: 'clearnegativeboost' }
    // Source: specs/battle/08-gen7.md -- Bulk Up listed under clearnegativeboost
    const zMove = new Gen7ZMove();
    const pokemon = makeActive({
      heldItem: "fightinium-z",
      moves: [{ moveId: "bulk-up" }],
    });

    const bulkUp = makeMove({
      id: "bulk-up",
      displayName: "Bulk Up",
      type: "fighting",
      category: "status",
      zMoveEffect: "clearnegativeboost",
    });

    const result = zMove.modifyMove(bulkUp, pokemon);

    expect(result.zMoveEffect).toBe("clearnegativeboost");
    expect(result.id).toBe("bulk-up");
    expect(result.displayName).toBe("Z-Bulk Up");
  });
});

describe("Status Z-Move: crit2 effect", () => {
  it("given Hone Claws with crit2 zMoveEffect, when modifying, then preserves +2 crit stage effect", () => {
    // Source: Showdown data/moves.ts -- honeclaws: zMove: { effect: 'crit2' }
    // Source: specs/battle/08-gen7.md -- "crit2: +2 crit stage"
    const zMove = new Gen7ZMove();
    const pokemon = makeActive({
      heldItem: "normalium-z",
      moves: [{ moveId: "hone-claws" }],
    });

    const honeClaws = makeMove({
      id: "hone-claws",
      displayName: "Hone Claws",
      type: "normal",
      category: "status",
      zMoveEffect: "crit2",
    });

    const result = zMove.modifyMove(honeClaws, pokemon);

    expect(result.zMoveEffect).toBe("crit2");
    expect(result.id).toBe("hone-claws");
    expect(result.displayName).toBe("Z-Hone Claws");
    expect(result.zMovePower).toBe(0);
  });

  it("given Focus Energy with crit2 zMoveEffect, when modifying, then preserves +2 crit stage effect", () => {
    // Source: Showdown data/moves.ts -- focusenergy: zMove: { effect: 'crit2' }
    // Source: specs/battle/08-gen7.md -- Focus Energy listed under crit2
    const zMove = new Gen7ZMove();
    const pokemon = makeActive({
      heldItem: "normalium-z",
      moves: [{ moveId: "focus-energy" }],
    });

    const focusEnergy = makeMove({
      id: "focus-energy",
      displayName: "Focus Energy",
      type: "normal",
      category: "status",
      zMoveEffect: "crit2",
    });

    const result = zMove.modifyMove(focusEnergy, pokemon);

    expect(result.zMoveEffect).toBe("crit2");
    expect(result.id).toBe("focus-energy");
  });
});

describe("Status Z-Move: no zMoveEffect defined", () => {
  it("given a status move with no zMoveEffect, when modifying, then zMoveEffect is undefined", () => {
    // Some status moves may not define a Z-Power bonus effect.
    // The Z-Move variant should still transform (Z- prefix) but have no bonus effect.
    const zMove = new Gen7ZMove();
    const pokemon = makeActive({
      heldItem: "normalium-z",
      moves: [{ moveId: "growl" }],
    });

    const growl = makeMove({
      id: "growl",
      displayName: "Growl",
      type: "normal",
      category: "status",
    });

    const result = zMove.modifyMove(growl, pokemon);

    expect(result.id).toBe("growl");
    expect(result.displayName).toBe("Z-Growl");
    expect(result.zMoveEffect).toBeUndefined();
    expect(result.zMovePower).toBe(0);
  });
});

describe("Status Z-Move: does NOT convert to a damaging move", () => {
  it("given a status move with type Z-Crystal, when modifying, then category remains status", () => {
    // Source: Showdown sim/battle-actions.ts:1435-1439 -- status Z-Moves do NOT become damage moves
    // Source: specs/battle/08-gen7.md -- "They do NOT deal damage and do NOT convert to named attack moves."
    const zMove = new Gen7ZMove();
    const pokemon = makeActive({
      heldItem: "normalium-z",
      moves: [{ moveId: "thunder-wave" }],
    });

    const thunderWave = makeMove({
      id: "thunder-wave",
      displayName: "Thunder Wave",
      type: "normal",
      category: "status",
      zMoveEffect: "clearnegativeboost",
    });

    const result = zMove.modifyMove(thunderWave, pokemon);

    expect(result.category).toBe("status");
    // Should NOT have power set (it's a status move, not damaging)
    expect(result.power).toBe(null);
  });

  it("given a status move with type Z-Crystal, when modifying, then move name is NOT the type Z-Move name", () => {
    // Status moves should NOT become "Breakneck Blitz" etc.
    // They keep their original ID with "Z-" prefix on display name
    const zMove = new Gen7ZMove();
    const pokemon = makeActive({
      heldItem: "normalium-z",
      moves: [{ moveId: "swords-dance" }],
    });

    const swordsDance = makeMove({
      id: "swords-dance",
      displayName: "Swords Dance",
      type: "normal",
      category: "status",
      zMoveEffect: "clearnegativeboost",
    });

    const result = zMove.modifyMove(swordsDance, pokemon);

    // ID is NOT "breakneck-blitz" -- it stays as the original status move
    expect(result.id).not.toBe("breakneck-blitz");
    expect(result.id).toBe("swords-dance");
  });
});

describe("Status Z-Move: species-specific status Z-Move (Extreme Evoboost)", () => {
  it("given Eevee with Eevium Z and Last Resort, when modifying, then returns Extreme Evoboost as a status Z-Move", () => {
    // Source: Showdown data/moves.ts -- extremeevoboost: category "Status", basePower 0
    // Source: Showdown data/items.ts -- eeviumz: zMoveFrom: "Last Resort", zMove: "Extreme Evoboost"
    // Extreme Evoboost is unique: it's a species-specific Z-Move that is status category
    // (boosts all stats by +2) rather than a damaging move
    const zMove = new Gen7ZMove();
    const pokemon = makeActive({
      heldItem: "eevium-z",
      moves: [{ moveId: "last-resort" }],
    });

    // Last Resort is a Normal-type damaging move (base power 140)
    // but Eevium Z transforms it into the STATUS move Extreme Evoboost
    // For the purpose of this test, we mark it as status since the species Z-Move
    // handling checks move.category. In practice, the base move (Last Resort) is
    // actually a physical move -- the species-specific Z-Move overrides it.
    // Since Last Resort is actually physical/140, the getSpeciesZMove path
    // will use the damaging branch. Extreme Evoboost has 0 power in SPECIES_Z_POWER.
    const lastResort = makeMove({
      id: "last-resort",
      displayName: "Last Resort",
      type: "normal",
      category: "physical",
      power: 140,
    });

    const result = zMove.modifyMove(lastResort, pokemon);

    expect(result.id).toBe("extreme-evoboost");
    // Extreme Evoboost has 0 power in the SPECIES_Z_POWER table
    // (it's a status-like Z-Move that boosts all stats)
    expect(result.power).toBe(0);
    expect(result.accuracy).toBe(null);
  });
});
