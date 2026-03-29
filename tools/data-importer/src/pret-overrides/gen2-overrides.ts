/**
 * Gen 2 pret overrides.
 *
 * Source authority: pret/pokecrystal disassembly
 * Reference: references/pokecrystal-master/pokecrystal-master/
 *
 * Gen 2 uses a 1-based priority scale (BASE_PRIORITY=1 in pokecrystal).
 * Normal moves have priority 1, not 0. High-priority moves (Quick Attack
 * family) have priority 2. Force-switch, Counter, Mirror Coat have priority 0.
 * Protect/Detect/Endure have priority 3.
 *
 * Source: pret/pokecrystal data/moves/effects_priorities.asm
 */

import type { PretOverride } from "./types";

export const gen2Overrides: readonly PretOverride[] = [
  // ── Priority scale corrections ─────────────────────────────────────────────
  // All normal moves (priority 0 from @pkmn/data) become priority 1 (BASE_PRIORITY).
  // This is handled in bulk in apply-overrides.ts rather than listing all 256 moves.

  // High-priority moves: EFFECT_QUICK_ATTACK priority 2
  {
    target: "move",
    moveId: "quick-attack",
    field: "priority",
    value: 2,
    showdownValue: 1,
    source: "pret/pokecrystal data/moves/effects_priorities.asm — EFFECT_QUICK_ATTACK priority 2",
  },
  {
    target: "move",
    moveId: "mach-punch",
    field: "priority",
    value: 2,
    showdownValue: 1,
    source:
      "pret/pokecrystal data/moves/effects_priorities.asm — EFFECT_QUICK_ATTACK priority 2; data/moves/moves.asm — Mach Punch uses EFFECT_QUICK_ATTACK",
  },
  {
    target: "move",
    moveId: "extreme-speed",
    field: "priority",
    value: 2,
    showdownValue: 1,
    source:
      "pret/pokecrystal data/moves/effects_priorities.asm — EFFECT_QUICK_ATTACK priority 2; data/moves/moves.asm — Extreme Speed uses EFFECT_QUICK_ATTACK",
  },

  // Low-priority moves: priority 0 (below BASE_PRIORITY=1)
  {
    target: "move",
    moveId: "roar",
    field: "priority",
    value: 0,
    showdownValue: -1,
    source:
      "pret/pokecrystal data/moves/effects_priorities.asm — EFFECT_FORCE_SWITCH priority 0 (1-based scale)",
  },
  {
    target: "move",
    moveId: "whirlwind",
    field: "priority",
    value: 0,
    showdownValue: -1,
    source:
      "pret/pokecrystal data/moves/effects_priorities.asm — EFFECT_FORCE_SWITCH priority 0 (1-based scale)",
  },
  {
    target: "move",
    moveId: "counter",
    field: "priority",
    value: 0,
    showdownValue: -1,
    source:
      "pret/pokecrystal data/moves/effects_priorities.asm — EFFECT_COUNTER priority 0 (1-based scale)",
  },
  {
    target: "move",
    moveId: "mirror-coat",
    field: "priority",
    value: 0,
    showdownValue: -1,
    source:
      "pret/pokecrystal data/moves/effects_priorities.asm — EFFECT_MIRROR_COAT priority 0 (1-based scale)",
  },
  {
    target: "move",
    moveId: "vital-throw",
    field: "priority",
    value: 0,
    showdownValue: -1,
    source:
      "pret/pokecrystal data/moves/effects_priorities.asm — EFFECT_VITAL_THROW priority 0 (1-based scale)",
  },

  // ── Curse type correction ──────────────────────────────────────────────────
  {
    target: "move",
    moveId: "curse",
    field: "type",
    value: "unknown",
    showdownValue: "ghost",
    source:
      "pret/pokecrystal constants/type_constants.asm — CURSE_TYPE EQU 19; data/moves/moves.asm — Curse uses CURSE_TYPE not TYPE_GHOST",
  },
];
