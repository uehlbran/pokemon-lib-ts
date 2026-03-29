import * as path from "node:path";
import * as url from "node:url";
import { describe, expect, it } from "vitest";
import { readGen1Data } from "../src/pret-readers/gen1-reader";
import { readGen2Data } from "../src/pret-readers/gen2-reader";
import { readGen3Data } from "../src/pret-readers/gen3-reader";
import { readGen4Data } from "../src/pret-readers/gen4-reader";

// Resolve repository root from this test file's location:
// tests/ → tools/data-importer/ → tools/ → repo root
const __dirname = path.dirname(url.fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, "..", "..", "..");

// ---------------------------------------------------------------------------
// Gen 1 — pokered source
// Source: pret/pokered engine/battle/core.asm (priority checks) and
//         pret/pokered data/moves/moves.asm (move data)
// ---------------------------------------------------------------------------

describe("Gen 1 pret reader — move priority (pokered engine/battle/core.asm)", () => {
  it("given pokered moves.asm, when parsing Quick Attack, then priority is 1", () => {
    // Source: pret/pokered engine/battle/core.asm — QUICK_ATTACK cp at line 371
    // Player moves first when using Quick Attack (hardcoded before speed compare)
    const data = readGen1Data(REPO_ROOT);
    const quickAttack = data.moves.find((m) => m.id === "quick-attack");
    expect(quickAttack).toBeDefined();
    expect(quickAttack!.priority).toBe(1);
  });

  it("given pokered moves.asm, when parsing Counter, then priority is -1", () => {
    // Source: pret/pokered engine/battle/core.asm — COUNTER cp at line 382
    // Counter user always moves last (hardcoded as opposite of Quick Attack)
    const data = readGen1Data(REPO_ROOT);
    const counter = data.moves.find((m) => m.id === "counter");
    expect(counter).toBeDefined();
    expect(counter!.priority).toBe(-1);
  });

  it("given pokered moves.asm, when parsing Tackle, then priority is 0", () => {
    // Source: pret/pokered engine/battle/core.asm — no special case for Tackle
    // Falls through to speed comparison → priority 0 (normal)
    const data = readGen1Data(REPO_ROOT);
    const tackle = data.moves.find((m) => m.id === "tackle");
    expect(tackle).toBeDefined();
    expect(tackle!.priority).toBe(0);
  });

  it("given pokered moves.asm, when parsing Pound, then power is 40, accuracy is 100, pp is 35", () => {
    // Source: pret/pokered data/moves/moves.asm — move POUND, NO_ADDITIONAL_EFFECT, 40, NORMAL, 100, 35
    const data = readGen1Data(REPO_ROOT);
    const pound = data.moves.find((m) => m.id === "pound");
    expect(pound).toBeDefined();
    expect(pound!.power).toBe(40);
    expect(pound!.accuracy).toBe(100);
    expect(pound!.pp).toBe(35);
  });

  it("given pokered moves.asm, when parsing Hyper Beam, then power is 150, accuracy is 90, pp is 5", () => {
    // Source: pret/pokered data/moves/moves.asm — move HYPER_BEAM, HYPER_BEAM_EFFECT, 150, NORMAL, 90, 5
    const data = readGen1Data(REPO_ROOT);
    const hyperBeam = data.moves.find((m) => m.id === "hyper-beam");
    expect(hyperBeam).toBeDefined();
    expect(hyperBeam!.power).toBe(150);
    expect(hyperBeam!.accuracy).toBe(90);
    expect(hyperBeam!.pp).toBe(5);
  });

  it("given pokered moves.asm, when parsing Fire Punch, then type is fire", () => {
    // Source: pret/pokered data/moves/moves.asm — move FIRE_PUNCH, BURN_SIDE_EFFECT1, 75, FIRE, 100, 15
    const data = readGen1Data(REPO_ROOT);
    const firePunch = data.moves.find((m) => m.id === "fire-punch");
    expect(firePunch).toBeDefined();
    expect(firePunch!.type).toBe("fire");
  });
});

describe("Gen 1 pret reader — base stats (pokered data/pokemon/base_stats/)", () => {
  it("given pokered base_stats, when parsing Bulbasaur, then hp is 45, atk is 49, def is 49, spd is 45, spAtk is 65, spDef is 65", () => {
    // Source: pret/pokered data/pokemon/base_stats/bulbasaur.asm
    // db 45, 49, 49, 45, 65  ; hp atk def spd spc (Gen 1: SpAtk == SpDef == spc)
    const data = readGen1Data(REPO_ROOT);
    const bulbasaur = data.pokemon.find((p) => p.name === "bulbasaur");
    expect(bulbasaur).toBeDefined();
    expect(bulbasaur!.baseStats.hp).toBe(45);
    expect(bulbasaur!.baseStats.attack).toBe(49);
    expect(bulbasaur!.baseStats.defense).toBe(49);
    expect(bulbasaur!.baseStats.speed).toBe(45);
    expect(bulbasaur!.baseStats.specialAttack).toBe(65);
    expect(bulbasaur!.baseStats.specialDefense).toBe(65);
  });

  it("given pokered base_stats, when parsing Bulbasaur, then types are grass and poison", () => {
    // Source: pret/pokered data/pokemon/base_stats/bulbasaur.asm — db GRASS, POISON ; type
    const data = readGen1Data(REPO_ROOT);
    const bulbasaur = data.pokemon.find((p) => p.name === "bulbasaur");
    expect(bulbasaur).toBeDefined();
    expect(bulbasaur!.types).toContain("grass");
    expect(bulbasaur!.types).toContain("poison");
  });

  it("given pokered base_stats, when parsing Charmander, then types are fire only", () => {
    // Source: pret/pokered data/pokemon/base_stats/charmander.asm — db FIRE, FIRE ; type
    const data = readGen1Data(REPO_ROOT);
    const charmander = data.pokemon.find((p) => p.name === "charmander");
    expect(charmander).toBeDefined();
    expect(charmander!.types).toEqual(["fire"]);
  });
});

describe("Gen 1 pret reader — type chart (pokered data/types/type_matchups.asm)", () => {
  it("given pokered type_matchups, when checking fire vs grass, then multiplier is 2", () => {
    // Source: pret/pokered data/types/type_matchups.asm — db FIRE, GRASS, SUPER_EFFECTIVE
    const data = readGen1Data(REPO_ROOT);
    const entry = data.typeChart.find((e) => e.attacker === "fire" && e.defender === "grass");
    expect(entry).toBeDefined();
    expect(entry!.multiplier).toBe(2);
  });

  it("given pokered type_matchups, when checking water vs fire, then multiplier is 2", () => {
    // Source: pret/pokered data/types/type_matchups.asm — db WATER, FIRE, SUPER_EFFECTIVE
    const data = readGen1Data(REPO_ROOT);
    const entry = data.typeChart.find((e) => e.attacker === "water" && e.defender === "fire");
    expect(entry).toBeDefined();
    expect(entry!.multiplier).toBe(2);
  });

  it("given pokered type_matchups, when checking normal vs ghost, then multiplier is 0", () => {
    // Source: pret/pokered data/types/type_matchups.asm — db NORMAL, GHOST, NO_EFFECT
    const data = readGen1Data(REPO_ROOT);
    const entry = data.typeChart.find((e) => e.attacker === "normal" && e.defender === "ghost");
    expect(entry).toBeDefined();
    expect(entry!.multiplier).toBe(0);
  });

  it("given pokered type_matchups, when checking ghost vs psychic, then multiplier is 0 (Gen 1 bug)", () => {
    // Source: pret/pokered data/types/type_matchups.asm — db GHOST, PSYCHIC_TYPE, NO_EFFECT
    // Gen 1 bug: Ghost has no effect on Psychic (intended 2x, programmed 0x)
    const data = readGen1Data(REPO_ROOT);
    const entry = data.typeChart.find((e) => e.attacker === "ghost" && e.defender === "psychic");
    expect(entry).toBeDefined();
    expect(entry!.multiplier).toBe(0);
  });

  it("given pokered type_matchups, when checking electric vs ground, then multiplier is 0", () => {
    // Source: pret/pokered data/types/type_matchups.asm — db ELECTRIC, GROUND, NO_EFFECT
    const data = readGen1Data(REPO_ROOT);
    const entry = data.typeChart.find((e) => e.attacker === "electric" && e.defender === "ground");
    expect(entry).toBeDefined();
    expect(entry!.multiplier).toBe(0);
  });

  it("given pokered type_matchups, when checking fire vs water, then multiplier is 0.5", () => {
    // Source: pret/pokered data/types/type_matchups.asm — db FIRE, WATER, NOT_VERY_EFFECTIVE
    const data = readGen1Data(REPO_ROOT);
    const entry = data.typeChart.find((e) => e.attacker === "fire" && e.defender === "water");
    expect(entry).toBeDefined();
    expect(entry!.multiplier).toBe(0.5);
  });

  it("given pokered type_matchups, gen 1 type chart has no steel type", () => {
    // Source: pret/pokered data/types/type_matchups.asm — no Steel entries
    const data = readGen1Data(REPO_ROOT);
    const steelEntry = data.typeChart.find((e) => e.attacker === "steel" || e.defender === "steel");
    expect(steelEntry).toBeUndefined();
  });

  it("given pokered type_matchups, gen 1 type chart has no dark type", () => {
    // Source: pret/pokered data/types/type_matchups.asm — no Dark entries
    const data = readGen1Data(REPO_ROOT);
    const darkEntry = data.typeChart.find((e) => e.attacker === "dark" || e.defender === "dark");
    expect(darkEntry).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// Gen 2 — pokecrystal source
// Source: pret/pokecrystal data/moves/effects_priorities.asm (priority table)
//         pret/pokecrystal engine/battle/core.asm GetMovePriority (Vital Throw)
//         pret/pokecrystal constants/battle_constants.asm (BASE_PRIORITY = 1)
// ---------------------------------------------------------------------------

describe("Gen 2 pret reader — move priority (pokecrystal data/moves/effects_priorities.asm)", () => {
  it("given pokecrystal effects_priorities, when parsing Protect, then priority is 3", () => {
    // Source: pret/pokecrystal data/moves/effects_priorities.asm — EFFECT_PROTECT, 3
    const data = readGen2Data(REPO_ROOT);
    const protect = data.moves.find((m) => m.id === "protect");
    expect(protect).toBeDefined();
    expect(protect!.priority).toBe(3);
  });

  it("given pokecrystal effects_priorities, when parsing Detect, then priority is 3", () => {
    // Source: pret/pokecrystal data/moves/effects_priorities.asm — EFFECT_PROTECT, 3 (Detect shares effect)
    const data = readGen2Data(REPO_ROOT);
    const detect = data.moves.find((m) => m.id === "detect");
    expect(detect).toBeDefined();
    expect(detect!.priority).toBe(3);
  });

  it("given pokecrystal effects_priorities, when parsing Endure, then priority is 3", () => {
    // Source: pret/pokecrystal data/moves/effects_priorities.asm — EFFECT_ENDURE, 3
    const data = readGen2Data(REPO_ROOT);
    const endure = data.moves.find((m) => m.id === "endure");
    expect(endure).toBeDefined();
    expect(endure!.priority).toBe(3);
  });

  it("given pokecrystal effects_priorities, when parsing Quick Attack, then priority is 2", () => {
    // Source: pret/pokecrystal data/moves/effects_priorities.asm — EFFECT_PRIORITY_HIT, 2
    // pokecrystal data/moves/moves.asm — QUICK_ATTACK, EFFECT_PRIORITY_HIT
    const data = readGen2Data(REPO_ROOT);
    const quickAttack = data.moves.find((m) => m.id === "quick-attack");
    expect(quickAttack).toBeDefined();
    expect(quickAttack!.priority).toBe(2);
  });

  it("given pokecrystal effects_priorities, when parsing Mach Punch, then priority is 2", () => {
    // Source: pret/pokecrystal data/moves/effects_priorities.asm — EFFECT_PRIORITY_HIT, 2
    // pokecrystal data/moves/moves.asm — MACH_PUNCH, EFFECT_PRIORITY_HIT
    const data = readGen2Data(REPO_ROOT);
    const machPunch = data.moves.find((m) => m.id === "mach-punch");
    expect(machPunch).toBeDefined();
    expect(machPunch!.priority).toBe(2);
  });

  it("given pokecrystal effects_priorities, when parsing Tackle, then priority is 1 (BASE_PRIORITY)", () => {
    // Source: pret/pokecrystal constants/battle_constants.asm — BASE_PRIORITY EQU 1
    // Moves not in MoveEffectPriorities table use BASE_PRIORITY = 1
    const data = readGen2Data(REPO_ROOT);
    const tackle = data.moves.find((m) => m.id === "tackle");
    expect(tackle).toBeDefined();
    expect(tackle!.priority).toBe(1);
  });

  it("given pokecrystal effects_priorities, when parsing Pound, then priority is 1 (BASE_PRIORITY)", () => {
    // Source: pret/pokecrystal constants/battle_constants.asm — BASE_PRIORITY EQU 1
    const data = readGen2Data(REPO_ROOT);
    const pound = data.moves.find((m) => m.id === "pound");
    expect(pound).toBeDefined();
    expect(pound!.priority).toBe(1);
  });

  it("given pokecrystal effects_priorities, when parsing Roar, then priority is 0", () => {
    // Source: pret/pokecrystal data/moves/effects_priorities.asm — EFFECT_FORCE_SWITCH, 0
    // pokecrystal data/moves/moves.asm — ROAR, EFFECT_FORCE_SWITCH
    const data = readGen2Data(REPO_ROOT);
    const roar = data.moves.find((m) => m.id === "roar");
    expect(roar).toBeDefined();
    expect(roar!.priority).toBe(0);
  });

  it("given pokecrystal effects_priorities, when parsing Counter, then priority is 0", () => {
    // Source: pret/pokecrystal data/moves/effects_priorities.asm — EFFECT_COUNTER, 0
    const data = readGen2Data(REPO_ROOT);
    const counter = data.moves.find((m) => m.id === "counter");
    expect(counter).toBeDefined();
    expect(counter!.priority).toBe(0);
  });

  it("given pokecrystal effects_priorities, when parsing Mirror Coat, then priority is 0", () => {
    // Source: pret/pokecrystal data/moves/effects_priorities.asm — EFFECT_MIRROR_COAT, 0
    const data = readGen2Data(REPO_ROOT);
    const mirrorCoat = data.moves.find((m) => m.id === "mirror-coat");
    expect(mirrorCoat).toBeDefined();
    expect(mirrorCoat!.priority).toBe(0);
  });

  it("given pokecrystal engine, when parsing Vital Throw, then priority is 0 (hardcoded in engine)", () => {
    // Source: pret/pokecrystal engine/battle/core.asm GetMovePriority — cp VITAL_THROW; ld a, 0; ret z
    // Vital Throw is hardcoded before the table lookup; returns 0 (not BASE_PRIORITY)
    const data = readGen2Data(REPO_ROOT);
    const vitalThrow = data.moves.find((m) => m.id === "vital-throw");
    expect(vitalThrow).toBeDefined();
    expect(vitalThrow!.priority).toBe(0);
  });
});

describe("Gen 2 pret reader — move data (pokecrystal data/moves/moves.asm)", () => {
  it("given pokecrystal moves.asm, when parsing Pound, then power is 40, accuracy is 100, pp is 35", () => {
    // Source: pret/pokecrystal data/moves/moves.asm — move POUND, EFFECT_NORMAL_HIT, 40, NORMAL, 100, 35, 0
    const data = readGen2Data(REPO_ROOT);
    const pound = data.moves.find((m) => m.id === "pound");
    expect(pound).toBeDefined();
    expect(pound!.power).toBe(40);
    expect(pound!.accuracy).toBe(100);
    expect(pound!.pp).toBe(35);
  });
});

describe("Gen 2 pret reader — base stats (pokecrystal data/pokemon/base_stats/)", () => {
  it("given pokecrystal base_stats, when parsing Bulbasaur, then hp is 45", () => {
    // Source: pret/pokecrystal data/pokemon/base_stats/bulbasaur.asm
    // db 45, 49, 49, 45, 65, 65  ; hp atk def spd sat sdf
    const data = readGen2Data(REPO_ROOT);
    const bulbasaur = data.pokemon.find((p) => p.name === "bulbasaur");
    expect(bulbasaur).toBeDefined();
    expect(bulbasaur!.baseStats.hp).toBe(45);
    expect(bulbasaur!.baseStats.attack).toBe(49);
    expect(bulbasaur!.baseStats.defense).toBe(49);
    expect(bulbasaur!.baseStats.speed).toBe(45);
    expect(bulbasaur!.baseStats.specialAttack).toBe(65);
    expect(bulbasaur!.baseStats.specialDefense).toBe(65);
  });

  it("given pokecrystal base_stats, when parsing Bulbasaur, then types are grass and poison", () => {
    // Source: pret/pokecrystal data/pokemon/base_stats/bulbasaur.asm — db GRASS, POISON ; type
    const data = readGen2Data(REPO_ROOT);
    const bulbasaur = data.pokemon.find((p) => p.name === "bulbasaur");
    expect(bulbasaur).toBeDefined();
    expect(bulbasaur!.types).toContain("grass");
    expect(bulbasaur!.types).toContain("poison");
  });

  it("given pokecrystal base_stats, when parsing Cyndaquil, then types are fire only", () => {
    // Source: pret/pokecrystal data/pokemon/base_stats/cyndaquil.asm — db FIRE, FIRE ; type
    const data = readGen2Data(REPO_ROOT);
    const cyndaquil = data.pokemon.find((p) => p.name === "cyndaquil");
    expect(cyndaquil).toBeDefined();
    expect(cyndaquil!.types).toEqual(["fire"]);
  });
});

describe("Gen 2 pret reader — type chart (pokecrystal data/types/type_matchups.asm)", () => {
  it("given pokecrystal type_matchups, when checking fire vs grass, then multiplier is 2", () => {
    // Source: pret/pokecrystal data/types/type_matchups.asm — db FIRE, GRASS, SUPER_EFFECTIVE
    const data = readGen2Data(REPO_ROOT);
    const entry = data.typeChart.find((e) => e.attacker === "fire" && e.defender === "grass");
    expect(entry).toBeDefined();
    expect(entry!.multiplier).toBe(2);
  });

  it("given pokecrystal type_matchups, when checking ghost vs psychic, then multiplier is 2 (Gen 2 fix)", () => {
    // Source: pret/pokecrystal data/types/type_matchups.asm — db GHOST, PSYCHIC_TYPE, SUPER_EFFECTIVE
    // Gen 2 fixes the Gen 1 bug where Ghost had no effect on Psychic
    const data = readGen2Data(REPO_ROOT);
    const entry = data.typeChart.find((e) => e.attacker === "ghost" && e.defender === "psychic");
    expect(entry).toBeDefined();
    expect(entry!.multiplier).toBe(2);
  });

  it("given pokecrystal type_matchups, when checking steel vs fire, then multiplier is 0.5 (Steel type added in Gen 2)", () => {
    // Source: pret/pokecrystal data/types/type_matchups.asm — db STEEL, FIRE, NOT_VERY_EFFECTIVE
    const data = readGen2Data(REPO_ROOT);
    const entry = data.typeChart.find((e) => e.attacker === "steel" && e.defender === "fire");
    expect(entry).toBeDefined();
    expect(entry!.multiplier).toBe(0.5);
  });

  it("given pokecrystal type_matchups, when checking psychic vs dark, then multiplier is 0 (Dark type added in Gen 2)", () => {
    // Source: pret/pokecrystal data/types/type_matchups.asm — db PSYCHIC_TYPE, DARK, NO_EFFECT
    const data = readGen2Data(REPO_ROOT);
    const entry = data.typeChart.find((e) => e.attacker === "psychic" && e.defender === "dark");
    expect(entry).toBeDefined();
    expect(entry!.multiplier).toBe(0);
  });

  it("given pokecrystal type_matchups, Foresight entries (after -2 sentinel) are excluded from main type chart", () => {
    // Source: pret/pokecrystal data/types/type_matchups.asm — entries after db -2 are Foresight-specific
    // The reader stops at the -2 sentinel for the main chart
    const data = readGen2Data(REPO_ROOT);
    // Normal vs Ghost appears after -2; should NOT be in main type chart
    // (Normal is normally immune to Ghost — those Foresight entries show the override, not the default)
    const normalGhost = data.typeChart.find(
      (e) => e.attacker === "normal" && e.defender === "ghost",
    );
    // There is no Normal vs Ghost entry in the main chart at all (Ghost doesn't affect Normal,
    // but Normal doesn't affect Ghost is not in the main table pre-Foresight)
    // The Foresight section records what would happen if Foresight was active —
    // so it should NOT appear in the main typeChart output.
    expect(normalGhost).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// Gen 3 — pokeemerald source
// Source: pret/pokeemerald src/data/battle_moves.h (move data + priority)
//         pret/pokeemerald src/data/pokemon/species_info.h (base stats + types)
//         pret/pokeemerald src/battle_main.c gTypeEffectiveness[] (type chart)
// ---------------------------------------------------------------------------

describe("Gen 3 pret reader — move priority (pokeemerald src/data/battle_moves.h)", () => {
  it("given pokeemerald battle_moves.h, when parsing Quick Attack, then priority is 1", () => {
    // Source: pret/pokeemerald src/data/battle_moves.h — [MOVE_QUICK_ATTACK].priority = 1
    const data = readGen3Data(REPO_ROOT);
    const quickAttack = data.moves.find((m) => m.id === "quick-attack");
    expect(quickAttack).toBeDefined();
    expect(quickAttack!.priority).toBe(1);
  });

  it("given pokeemerald battle_moves.h, when parsing Protect, then priority is 3", () => {
    // Source: pret/pokeemerald src/data/battle_moves.h — [MOVE_PROTECT].priority = 3
    const data = readGen3Data(REPO_ROOT);
    const protect = data.moves.find((m) => m.id === "protect");
    expect(protect).toBeDefined();
    expect(protect!.priority).toBe(3);
  });

  it("given pokeemerald battle_moves.h, when parsing Endure, then priority is 3 (not 4)", () => {
    // Source: pret/pokeemerald src/data/battle_moves.h — [MOVE_ENDURE].priority = 3
    // Endure shares priority 3 with Protect in Gen 3 (NOT priority 4)
    const data = readGen3Data(REPO_ROOT);
    const endure = data.moves.find((m) => m.id === "endure");
    expect(endure).toBeDefined();
    expect(endure!.priority).toBe(3);
  });

  it("given pokeemerald battle_moves.h, when parsing Roar, then priority is -6", () => {
    // Source: pret/pokeemerald src/data/battle_moves.h — [MOVE_ROAR].priority = -6
    const data = readGen3Data(REPO_ROOT);
    const roar = data.moves.find((m) => m.id === "roar");
    expect(roar).toBeDefined();
    expect(roar!.priority).toBe(-6);
  });

  it("given pokeemerald battle_moves.h, when parsing Whirlwind, then priority is -6", () => {
    // Source: pret/pokeemerald src/data/battle_moves.h — [MOVE_WHIRLWIND].priority = -6
    const data = readGen3Data(REPO_ROOT);
    const whirlwind = data.moves.find((m) => m.id === "whirlwind");
    expect(whirlwind).toBeDefined();
    expect(whirlwind!.priority).toBe(-6);
  });

  it("given pokeemerald battle_moves.h, when parsing Counter, then priority is -5", () => {
    // Source: pret/pokeemerald src/data/battle_moves.h — [MOVE_COUNTER].priority = -5
    const data = readGen3Data(REPO_ROOT);
    const counter = data.moves.find((m) => m.id === "counter");
    expect(counter).toBeDefined();
    expect(counter!.priority).toBe(-5);
  });

  it("given pokeemerald battle_moves.h, when parsing ExtremeSpeed, then priority is 1", () => {
    // Source: pret/pokeemerald src/data/battle_moves.h — [MOVE_EXTREME_SPEED].priority = 1
    const data = readGen3Data(REPO_ROOT);
    const extremeSpeed = data.moves.find((m) => m.id === "extreme-speed");
    expect(extremeSpeed).toBeDefined();
    expect(extremeSpeed!.priority).toBe(1);
  });

  it("given pokeemerald battle_moves.h, when parsing FocusPunch, then priority is -3", () => {
    // Source: pret/pokeemerald src/data/battle_moves.h — [MOVE_FOCUS_PUNCH].priority = -3
    const data = readGen3Data(REPO_ROOT);
    const focusPunch = data.moves.find((m) => m.id === "focus-punch");
    expect(focusPunch).toBeDefined();
    expect(focusPunch!.priority).toBe(-3);
  });

  it("given pokeemerald battle_moves.h, when parsing HelpingHand, then priority is 5", () => {
    // Source: pret/pokeemerald src/data/battle_moves.h — [MOVE_HELPING_HAND].priority = 5
    const data = readGen3Data(REPO_ROOT);
    const helpingHand = data.moves.find((m) => m.id === "helping-hand");
    expect(helpingHand).toBeDefined();
    expect(helpingHand!.priority).toBe(5);
  });
});

describe("Gen 3 pret reader — move data (pokeemerald src/data/battle_moves.h)", () => {
  it("given pokeemerald battle_moves.h, when parsing Quick Attack, then power is 40, accuracy is 100, pp is 30, type is normal", () => {
    // Source: pret/pokeemerald src/data/battle_moves.h — [MOVE_QUICK_ATTACK]
    // .power = 40, .accuracy = 100, .pp = 30, .type = TYPE_NORMAL
    const data = readGen3Data(REPO_ROOT);
    const quickAttack = data.moves.find((m) => m.id === "quick-attack");
    expect(quickAttack).toBeDefined();
    expect(quickAttack!.power).toBe(40);
    expect(quickAttack!.accuracy).toBe(100);
    expect(quickAttack!.pp).toBe(30);
    expect(quickAttack!.type).toBe("normal");
  });

  it("given pokeemerald battle_moves.h, when parsing Protect (power=0), then power is null", () => {
    // Source: pret/pokeemerald src/data/battle_moves.h — [MOVE_PROTECT].power = 0 => null in output
    const data = readGen3Data(REPO_ROOT);
    const protect = data.moves.find((m) => m.id === "protect");
    expect(protect).toBeDefined();
    expect(protect!.power).toBeNull();
  });

  it("given pokeemerald battle_moves.h, when parsing Protect (accuracy=0), then accuracy is null (always hits)", () => {
    // Source: pret/pokeemerald src/data/battle_moves.h — [MOVE_PROTECT].accuracy = 0 => null in output
    const data = readGen3Data(REPO_ROOT);
    const protect = data.moves.find((m) => m.id === "protect");
    expect(protect).toBeDefined();
    expect(protect!.accuracy).toBeNull();
  });

  it("given pokeemerald battle_moves.h, when parsing Tackle, then priority is 0 (normal move)", () => {
    // Source: pret/pokeemerald src/data/battle_moves.h — [MOVE_TACKLE].priority = 0
    const data = readGen3Data(REPO_ROOT);
    const tackle = data.moves.find((m) => m.id === "tackle");
    expect(tackle).toBeDefined();
    expect(tackle!.priority).toBe(0);
  });
});

describe("Gen 3 pret reader — base stats (pokeemerald src/data/pokemon/species_info.h)", () => {
  it("given pokeemerald species_info.h, when parsing Bulbasaur, then hp is 45, atk is 49, def is 49, spd is 45, spAtk is 65, spDef is 65", () => {
    // Source: pret/pokeemerald src/data/pokemon/species_info.h — [SPECIES_BULBASAUR]
    // .baseHP = 45, .baseAttack = 49, .baseDefense = 49, .baseSpeed = 45,
    // .baseSpAttack = 65, .baseSpDefense = 65
    const data = readGen3Data(REPO_ROOT);
    const bulbasaur = data.pokemon.find((p) => p.name === "bulbasaur");
    expect(bulbasaur).toBeDefined();
    expect(bulbasaur!.baseStats.hp).toBe(45);
    expect(bulbasaur!.baseStats.attack).toBe(49);
    expect(bulbasaur!.baseStats.defense).toBe(49);
    expect(bulbasaur!.baseStats.speed).toBe(45);
    expect(bulbasaur!.baseStats.specialAttack).toBe(65);
    expect(bulbasaur!.baseStats.specialDefense).toBe(65);
  });

  it("given pokeemerald species_info.h, when parsing Bulbasaur, then types are grass and poison", () => {
    // Source: pret/pokeemerald src/data/pokemon/species_info.h — [SPECIES_BULBASAUR]
    // .types = { TYPE_GRASS, TYPE_POISON }
    const data = readGen3Data(REPO_ROOT);
    const bulbasaur = data.pokemon.find((p) => p.name === "bulbasaur");
    expect(bulbasaur).toBeDefined();
    expect(bulbasaur!.types).toContain("grass");
    expect(bulbasaur!.types).toContain("poison");
  });
});

describe("Gen 3 pret reader — type chart (pokeemerald src/battle_main.c gTypeEffectiveness)", () => {
  it("given pokeemerald gTypeEffectiveness, when checking fire vs grass, then multiplier is 2", () => {
    // Source: pret/pokeemerald src/battle_main.c gTypeEffectiveness[] — TYPE_FIRE, TYPE_GRASS, TYPE_MUL_SUPER_EFFECTIVE
    const data = readGen3Data(REPO_ROOT);
    const entry = data.typeChart.find((e) => e.attacker === "fire" && e.defender === "grass");
    expect(entry).toBeDefined();
    expect(entry!.multiplier).toBe(2);
  });

  it("given pokeemerald gTypeEffectiveness, when checking electric vs ground, then multiplier is 0", () => {
    // Source: pret/pokeemerald src/battle_main.c gTypeEffectiveness[] — TYPE_ELECTRIC, TYPE_GROUND, TYPE_MUL_NO_EFFECT
    const data = readGen3Data(REPO_ROOT);
    const entry = data.typeChart.find((e) => e.attacker === "electric" && e.defender === "ground");
    expect(entry).toBeDefined();
    expect(entry!.multiplier).toBe(0);
  });

  it("given pokeemerald gTypeEffectiveness, when checking normal vs rock, then multiplier is 0.5", () => {
    // Source: pret/pokeemerald src/battle_main.c gTypeEffectiveness[] — TYPE_NORMAL, TYPE_ROCK, TYPE_MUL_NOT_EFFECTIVE
    const data = readGen3Data(REPO_ROOT);
    const entry = data.typeChart.find((e) => e.attacker === "normal" && e.defender === "rock");
    expect(entry).toBeDefined();
    expect(entry!.multiplier).toBe(0.5);
  });

  it("given pokeemerald gTypeEffectiveness, when checking psychic vs dark, then multiplier is 0 (Psychic moves have no effect on Dark)", () => {
    // Source: pret/pokeemerald src/battle_main.c gTypeEffectiveness[] — TYPE_PSYCHIC, TYPE_DARK, TYPE_MUL_NO_EFFECT
    const data = readGen3Data(REPO_ROOT);
    const entry = data.typeChart.find((e) => e.attacker === "psychic" && e.defender === "dark");
    expect(entry).toBeDefined();
    expect(entry!.multiplier).toBe(0);
  });

  it("given pokeemerald gTypeEffectiveness, when checking ghost vs psychic, then multiplier is 2 (Gen 3 fix)", () => {
    // Source: pret/pokeemerald src/battle_main.c gTypeEffectiveness[] — TYPE_GHOST, TYPE_PSYCHIC, TYPE_MUL_SUPER_EFFECTIVE
    // Gen 3 carries over the Gen 2 fix for ghost vs psychic (was 0 in Gen 1)
    const data = readGen3Data(REPO_ROOT);
    const entry = data.typeChart.find((e) => e.attacker === "ghost" && e.defender === "psychic");
    expect(entry).toBeDefined();
    expect(entry!.multiplier).toBe(2);
  });

  it("given pokeemerald gTypeEffectiveness, Foresight entries (TYPE_FORESIGHT) are excluded from main type chart", () => {
    // Source: pret/pokeemerald src/battle_main.c gTypeEffectiveness[] — TYPE_FORESIGHT entries at end
    // The reader stops at TYPE_FORESIGHT sentinel (0xFE), not including those special entries
    const data = readGen3Data(REPO_ROOT);
    const foresightEntries = data.typeChart.filter(
      (e) => e.attacker === "foresight" || e.defender === "foresight",
    );
    expect(foresightEntries).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// Gen 4 — pokeplatinum source
// Source: pret/pokeplatinum res/battle/moves/*/data.json (move data)
//         pret/pokeplatinum res/pokemon/*/data.json (base stats + types)
// ---------------------------------------------------------------------------

describe("Gen 4 pret reader — move priority (pokeplatinum res/battle/moves/*/data.json)", () => {
  it("given pokeplatinum move data.json, when parsing ExtremeSpeed, then priority is 1", () => {
    // Source: pret/pokeplatinum res/battle/moves/extreme_speed/data.json — priority: 1
    const data = readGen4Data(REPO_ROOT);
    const extremeSpeed = data.moves.find((m) => m.id === "extreme-speed");
    expect(extremeSpeed).toBeDefined();
    expect(extremeSpeed!.priority).toBe(1);
  });

  it("given pokeplatinum move data.json, when parsing TrickRoom, then priority is -7", () => {
    // Source: pret/pokeplatinum res/battle/moves/trick_room/data.json — priority: -7
    const data = readGen4Data(REPO_ROOT);
    const trickRoom = data.moves.find((m) => m.id === "trick-room");
    expect(trickRoom).toBeDefined();
    expect(trickRoom!.priority).toBe(-7);
  });

  it("given pokeplatinum move data.json, when parsing Feint, then priority is 2", () => {
    // Source: pret/pokeplatinum res/battle/moves/feint/data.json — priority: 2
    const data = readGen4Data(REPO_ROOT);
    const feint = data.moves.find((m) => m.id === "feint");
    expect(feint).toBeDefined();
    expect(feint!.priority).toBe(2);
  });

  it("given pokeplatinum move data.json, when parsing Endure, then priority is 3 (not 4)", () => {
    // Source: pret/pokeplatinum res/battle/moves/endure/data.json — priority: 3
    const data = readGen4Data(REPO_ROOT);
    const endure = data.moves.find((m) => m.id === "endure");
    expect(endure).toBeDefined();
    expect(endure!.priority).toBe(3);
  });

  it("given pokeplatinum move data.json, when parsing Roar, then priority is -6", () => {
    // Source: pret/pokeplatinum res/battle/moves/roar/data.json — priority: -6
    const data = readGen4Data(REPO_ROOT);
    const roar = data.moves.find((m) => m.id === "roar");
    expect(roar).toBeDefined();
    expect(roar!.priority).toBe(-6);
  });

  it("given pokeplatinum move data.json, when parsing BulletPunch, then priority is 1", () => {
    // Source: pret/pokeplatinum res/battle/moves/bullet_punch/data.json — priority: 1
    const data = readGen4Data(REPO_ROOT);
    const bulletPunch = data.moves.find((m) => m.id === "bullet-punch");
    expect(bulletPunch).toBeDefined();
    expect(bulletPunch!.priority).toBe(1);
  });

  it("given pokeplatinum move data.json, when parsing AquaJet, then priority is 1", () => {
    // Source: pret/pokeplatinum res/battle/moves/aqua_jet/data.json — priority: 1
    const data = readGen4Data(REPO_ROOT);
    const aquaJet = data.moves.find((m) => m.id === "aqua-jet");
    expect(aquaJet).toBeDefined();
    expect(aquaJet!.priority).toBe(1);
  });

  it("given pokeplatinum move data.json, when parsing MachPunch, then priority is 1", () => {
    // Source: pret/pokeplatinum res/battle/moves/mach_punch/data.json — priority: 1
    const data = readGen4Data(REPO_ROOT);
    const machPunch = data.moves.find((m) => m.id === "mach-punch");
    expect(machPunch).toBeDefined();
    expect(machPunch!.priority).toBe(1);
  });

  it("given pokeplatinum move data.json, when parsing VacuumWave, then priority is 1", () => {
    // Source: pret/pokeplatinum res/battle/moves/vacuum_wave/data.json — priority: 1
    const data = readGen4Data(REPO_ROOT);
    const vacuumWave = data.moves.find((m) => m.id === "vacuum-wave");
    expect(vacuumWave).toBeDefined();
    expect(vacuumWave!.priority).toBe(1);
  });
});

describe("Gen 4 pret reader — move category (pokeplatinum res/battle/moves/*/data.json)", () => {
  it("given pokeplatinum move data.json, when parsing AquaJet (CLASS_PHYSICAL), then category is physical", () => {
    // Source: pret/pokeplatinum res/battle/moves/aqua_jet/data.json — class: CLASS_PHYSICAL
    const data = readGen4Data(REPO_ROOT);
    const aquaJet = data.moves.find((m) => m.id === "aqua-jet");
    expect(aquaJet).toBeDefined();
    expect(aquaJet!.category).toBe("physical");
  });

  it("given pokeplatinum move data.json, when parsing VacuumWave (CLASS_SPECIAL), then category is special", () => {
    // Source: pret/pokeplatinum res/battle/moves/vacuum_wave/data.json — class: CLASS_SPECIAL
    const data = readGen4Data(REPO_ROOT);
    const vacuumWave = data.moves.find((m) => m.id === "vacuum-wave");
    expect(vacuumWave).toBeDefined();
    expect(vacuumWave!.category).toBe("special");
  });

  it("given pokeplatinum move data.json, when parsing TrickRoom (CLASS_STATUS), then category is status", () => {
    // Source: pret/pokeplatinum res/battle/moves/trick_room/data.json — class: CLASS_STATUS
    const data = readGen4Data(REPO_ROOT);
    const trickRoom = data.moves.find((m) => m.id === "trick-room");
    expect(trickRoom).toBeDefined();
    expect(trickRoom!.category).toBe("status");
  });
});

describe("Gen 4 pret reader — move data (pokeplatinum res/battle/moves/*/data.json)", () => {
  it("given pokeplatinum move data.json, when parsing AquaJet, then power is 40, accuracy is 100, pp is 20, type is water", () => {
    // Source: pret/pokeplatinum res/battle/moves/aqua_jet/data.json
    // power: 40, accuracy: 100, pp: 20, type: TYPE_WATER
    const data = readGen4Data(REPO_ROOT);
    const aquaJet = data.moves.find((m) => m.id === "aqua-jet");
    expect(aquaJet).toBeDefined();
    expect(aquaJet!.power).toBe(40);
    expect(aquaJet!.accuracy).toBe(100);
    expect(aquaJet!.pp).toBe(20);
    expect(aquaJet!.type).toBe("water");
  });

  it("given pokeplatinum move data.json, when parsing TrickRoom (accuracy=0), then accuracy is null (always hits)", () => {
    // Source: pret/pokeplatinum res/battle/moves/trick_room/data.json — accuracy: 0 => null
    const data = readGen4Data(REPO_ROOT);
    const trickRoom = data.moves.find((m) => m.id === "trick-room");
    expect(trickRoom).toBeDefined();
    expect(trickRoom!.accuracy).toBeNull();
  });

  it("given pokeplatinum move data.json, when parsing Endure (power=0), then power is null", () => {
    // Source: pret/pokeplatinum res/battle/moves/endure/data.json — power: 0 => null for status moves
    const data = readGen4Data(REPO_ROOT);
    const endure = data.moves.find((m) => m.id === "endure");
    expect(endure).toBeDefined();
    expect(endure!.power).toBeNull();
  });

  it("given pokeplatinum move data, when parsing all moves, then the 0000 placeholder is excluded", () => {
    // Source: pret/pokeplatinum res/battle/moves/0000/data.json — numeric dirs are placeholder entries
    const data = readGen4Data(REPO_ROOT);
    // The placeholder has name "-" and should not appear with a valid kebab-case id
    const placeholder = data.moves.find((m) => m.id === "-");
    expect(placeholder).toBeUndefined();
  });
});

describe("Gen 4 pret reader — base stats (pokeplatinum res/pokemon/*/data.json)", () => {
  it("given pokeplatinum pokemon data.json, when parsing Empoleon, then hp=84, atk=86, def=88, spd=60, spAtk=111, spDef=101", () => {
    // Source: pret/pokeplatinum res/pokemon/empoleon/data.json
    // base_stats: { hp: 84, attack: 86, defense: 88, speed: 60, special_attack: 111, special_defense: 101 }
    const data = readGen4Data(REPO_ROOT);
    const empoleon = data.pokemon.find((p) => p.name === "empoleon");
    expect(empoleon).toBeDefined();
    expect(empoleon!.baseStats.hp).toBe(84);
    expect(empoleon!.baseStats.attack).toBe(86);
    expect(empoleon!.baseStats.defense).toBe(88);
    expect(empoleon!.baseStats.speed).toBe(60);
    expect(empoleon!.baseStats.specialAttack).toBe(111);
    expect(empoleon!.baseStats.specialDefense).toBe(101);
  });

  it("given pokeplatinum pokemon data.json, when parsing Empoleon, then types are water and steel", () => {
    // Source: pret/pokeplatinum res/pokemon/empoleon/data.json — types: ["TYPE_WATER", "TYPE_STEEL"]
    const data = readGen4Data(REPO_ROOT);
    const empoleon = data.pokemon.find((p) => p.name === "empoleon");
    expect(empoleon).toBeDefined();
    expect(empoleon!.types).toContain("water");
    expect(empoleon!.types).toContain("steel");
    expect(empoleon!.types).toHaveLength(2);
  });

  it("given pokeplatinum pokemon data.json, when parsing Bulbasaur, then hp is 45, types are grass and poison", () => {
    // Source: pret/pokeplatinum res/pokemon/bulbasaur/data.json
    const data = readGen4Data(REPO_ROOT);
    const bulbasaur = data.pokemon.find((p) => p.name === "bulbasaur");
    expect(bulbasaur).toBeDefined();
    expect(bulbasaur!.baseStats.hp).toBe(45);
    expect(bulbasaur!.types).toContain("grass");
    expect(bulbasaur!.types).toContain("poison");
  });
});
