/**
 * The six core stats. This is the Gen 3+ model with separate
 * Special Attack and Special Defense.
 *
 * Gen 1-2 note: Gen 1 had a single "Special" stat. Gen 2 split it into
 * SpAtk/SpDef but with different base values. The battle library's
 * Gen 1/Gen 2 plugins handle this mapping.
 */
export interface StatBlock {
  readonly hp: number;
  readonly attack: number;
  readonly defense: number;
  readonly spAttack: number;
  readonly spDefense: number;
  readonly speed: number;
}

/** Mutable version of StatBlock — used for computed stats that change at runtime */
export interface MutableStatBlock {
  hp: number;
  attack: number;
  defense: number;
  spAttack: number;
  spDefense: number;
  speed: number;
}

/** Stat keys as a union type (excludes HP for certain formulas) */
export type StatName = keyof StatBlock;

/** Non-HP stats (used in nature modifiers — natures don't affect HP) */
export type NonHpStat = Exclude<StatName, "hp">;

/** Battle stat modifiers — includes accuracy and evasion which aren't core stats */
export type BattleStat = StatName | "accuracy" | "evasion";
