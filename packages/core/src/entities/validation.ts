export interface DataValidationResult {
  readonly valid: boolean;
  readonly errors: readonly DataValidationError[];
  readonly warnings: readonly DataValidationWarning[];
}

export interface DataValidationError {
  readonly entity: string; // "pokemon", "move", "ability", etc.
  readonly id: string | number;
  readonly field: string;
  readonly message: string;
}

export interface DataValidationWarning {
  readonly entity: string;
  readonly id: string | number;
  readonly field: string;
  readonly message: string;
}
