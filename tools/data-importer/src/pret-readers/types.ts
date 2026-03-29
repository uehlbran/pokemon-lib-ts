// Parsed data from a pret source file.

/** A move entry parsed directly from a pret assembly source file. */
export interface PretMoveData {
  /** kebab-case move ID (e.g., "quick-attack") */
  id: string;
  /** undefined if pret has no priority field for this gen (Gen 1 — priority is engine-hardcoded) */
  priority?: number;
  /** null = variable power (counter, seismic toss, etc.) */
  power?: number | null;
  /** null = always hits */
  accuracy?: number | null;
  pp?: number;
  /** lowercase type name (e.g., "normal", "fire") */
  type?: string;
  /** Only Gen 4+ has explicit per-move categories in the data files */
  category?: "physical" | "special" | "status";
  /** Precise citation, e.g. "pret/pokered data/moves/moves.asm — move QUICK_ATTACK line 111" */
  source: string;
}

/** Base stats parsed from a pret species file. */
export interface PretBaseStats {
  hp: number;
  attack: number;
  defense: number;
  speed: number;
  /** Equals the "special" stat in Gen 1 (SpAtk == SpDef). */
  specialAttack: number;
  /** Equals the "special" stat in Gen 1 (SpAtk == SpDef). */
  specialDefense: number;
}

/** A species entry parsed from a pret base-stats file. */
export interface PretPokemonData {
  /** lowercase species name (e.g., "bulbasaur") */
  name: string;
  baseStats: PretBaseStats;
  /** lowercase type names, deduplicated */
  types: string[];
  /** Precise citation pointing to the .asm file and relevant line. */
  source: string;
}

/** A single non-neutral type matchup entry. */
export interface PretTypeChartEntry {
  /** lowercase attacking type (e.g., "fire") */
  attacker: string;
  /** lowercase defending type */
  defender: string;
  /** Only non-neutral entries are listed; 0 = no effect, 0.5 = not very effective, 2 = super effective */
  multiplier: 0 | 0.5 | 2;
  /** Precise citation pointing to the .asm file and relevant line. */
  source: string;
}

/** Full set of data parsed from one generation's pret source. */
export interface PretGenData {
  gen: number;
  moves: PretMoveData[];
  pokemon: PretPokemonData[];
  typeChart: PretTypeChartEntry[];
}
