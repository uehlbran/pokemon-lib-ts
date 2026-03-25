import type { ValidationFailure, ValidationResult } from "../entities/validation";

export const MIN_FRIENDSHIP = 0;
export const MAX_FRIENDSHIP = 255;

function buildValidationResult(failures: ValidationFailure[]): ValidationResult {
  return {
    valid: failures.length === 0,
    failures,
  };
}

export function validateFriendship(candidate: unknown): ValidationResult {
  const failures: ValidationFailure[] = [];

  if (typeof candidate !== "number" || !Number.isFinite(candidate) || !Number.isInteger(candidate)) {
    failures.push({
      field: "friendship",
      value: candidate,
      message: "friendship must be a finite integer",
    });
    return buildValidationResult(failures);
  }

  if (candidate < MIN_FRIENDSHIP || candidate > MAX_FRIENDSHIP) {
    failures.push({
      field: "friendship",
      value: candidate,
      message: `friendship must be between ${MIN_FRIENDSHIP} and ${MAX_FRIENDSHIP}`,
    });
  }

  return buildValidationResult(failures);
}

export function createFriendship(value: number): number {
  const validation = validateFriendship(value);
  if (validation.valid) return value;

  throw new Error(
    `Friendship validation failed: ${validation.failures.map((failure) => failure.message).join("; ")}`,
  );
}
