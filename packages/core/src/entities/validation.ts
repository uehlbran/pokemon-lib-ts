/**
 * Generic validation failure for bounded domain inputs and higher-level validators.
 *
 * Use this for reusable runtime validation surfaces (stat inputs, Pokemon builders,
 * move validators, etc.). Data-import validation keeps its dedicated shapes below.
 */
export interface ValidationFailure {
  /** Domain field that failed validation */
  readonly field: string;
  /** Rejected value */
  readonly value: unknown;
  /** Human-readable failure message */
  readonly message: string;
}

/**
 * Generic validation result for reusable runtime validation surfaces.
 */
export interface ValidationResult {
  /** `true` if no validation failures were found */
  readonly valid: boolean;
  /** Detailed validation failures */
  readonly failures: readonly ValidationFailure[];
}

/**
 * The top-level result of a data validation pass over a generation's imported JSON.
 * Returned by the `data-importer` validation step and by `DataManager` integrity checks.
 *
 * `valid` is `true` only when `errors` is empty. Warnings may be present alongside a valid result.
 */
export interface DataValidationResult {
  /** `true` if no hard errors were found; the data is safe to use in battle */
  readonly valid: boolean;
  /** Hard errors that render the data unusable (e.g., missing required fields, impossible values) */
  readonly errors: readonly DataValidationError[];
  /** Soft warnings that do not prevent usage but indicate data quality issues */
  readonly warnings: readonly DataValidationWarning[];
}

/**
 * A hard data error that makes an entity invalid for use in battle.
 * Examples: a Pokémon species missing its `baseStats`, a move with a `power` value
 * outside the valid range, or a move in a Pokémon's learnset that does not exist
 * in the moves dataset.
 */
export interface DataValidationError {
  /** Entity category: `"pokemon"`, `"move"`, `"ability"`, `"item"`, `"nature"`, `"type-chart"` */
  readonly entity: string; // "pokemon", "move", "ability", etc.
  /** The entity's identifier (Pokédex number for species, ID string for everything else) */
  readonly id: string | number;
  /** The specific field on the entity that is invalid (e.g., `"baseStats.hp"`, `"accuracy"`) */
  readonly field: string;
  /** Human-readable description of what is wrong */
  readonly message: string;
}

/**
 * A soft data warning that does not prevent battle usage but indicates a potential
 * data quality issue. Examples: a Pokémon with a non-optimal EV total, a move with
 * an unusually high base power that may indicate an import error, or a missing
 * optional field that has a safe default.
 */
export interface DataValidationWarning {
  /** Entity category: `"pokemon"`, `"move"`, `"ability"`, `"item"`, `"nature"`, `"type-chart"` */
  readonly entity: string;
  /** The entity's identifier */
  readonly id: string | number;
  /** The specific field that triggered the warning */
  readonly field: string;
  /** Human-readable description of the potential issue */
  readonly message: string;
}
