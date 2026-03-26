import type { StatBlock } from "../entities/stats";
import type { ValidationFailure, ValidationResult } from "../entities/validation";

export interface Ivs extends StatBlock {}
export interface Evs extends StatBlock {}
export interface Dvs extends StatBlock {}
export interface StatExpValues extends StatBlock {}

export type IvOverrides = Partial<StatBlock>;
export type EvOverrides = Partial<StatBlock>;
export type DvOverrides = Partial<Omit<StatBlock, "hp">>;
export type StatExpOverrides = Partial<StatBlock>;

type StatField = keyof StatBlock;

const STAT_FIELDS: readonly StatField[] = [
  "hp",
  "attack",
  "defense",
  "spAttack",
  "spDefense",
  "speed",
] as const;

export const MIN_IV = 0;
export const MAX_IV = 31;
export const DEFAULT_IV = MAX_IV;

export const MIN_EV = 0;
export const MAX_EV = 252;
export const MAX_TOTAL_EVS = 510;
export const DEFAULT_EV = MIN_EV;

export const MIN_DV = 0;
export const MAX_DV = 15;
export const DEFAULT_DV = MAX_DV;

export const MIN_STAT_EXP = 0;
export const MAX_STAT_EXP = 65535;
export const DEFAULT_STAT_EXP = MIN_STAT_EXP;

function buildValidationResult(failures: ValidationFailure[]): ValidationResult {
  return {
    valid: failures.length === 0,
    failures,
  };
}

function validateNumericStatBlock(
  candidate: Partial<Record<StatField, unknown>>,
  options: {
    min: number;
    max: number;
    label: string;
    statFields?: readonly StatField[];
  },
): ValidationResult {
  const failures: ValidationFailure[] = [];
  for (const field of options.statFields ?? STAT_FIELDS) {
    const value = candidate[field];
    if (typeof value !== "number" || !Number.isFinite(value) || !Number.isInteger(value)) {
      failures.push({
        field,
        value,
        message: `${field} ${options.label} must be a finite integer`,
      });
      continue;
    }
    if (value < options.min || value > options.max) {
      failures.push({
        field,
        value,
        message: `${field} ${options.label} must be between ${options.min} and ${options.max}`,
      });
    }
  }
  return buildValidationResult(failures);
}

function assertValid(result: ValidationResult, label: string): void {
  if (result.valid) return;
  throw new Error(
    `${label} validation failed: ${result.failures.map((failure) => failure.message).join("; ")}`,
  );
}

function normalizeIvs(overrides: IvOverrides = {}): Ivs {
  return Object.freeze({
    hp: overrides.hp ?? DEFAULT_IV,
    attack: overrides.attack ?? DEFAULT_IV,
    defense: overrides.defense ?? DEFAULT_IV,
    spAttack: overrides.spAttack ?? DEFAULT_IV,
    spDefense: overrides.spDefense ?? DEFAULT_IV,
    speed: overrides.speed ?? DEFAULT_IV,
  });
}

function normalizeEvs(overrides: EvOverrides = {}): Evs {
  return Object.freeze({
    hp: overrides.hp ?? DEFAULT_EV,
    attack: overrides.attack ?? DEFAULT_EV,
    defense: overrides.defense ?? DEFAULT_EV,
    spAttack: overrides.spAttack ?? DEFAULT_EV,
    spDefense: overrides.spDefense ?? DEFAULT_EV,
    speed: overrides.speed ?? DEFAULT_EV,
  });
}

function deriveHpDv(dvs: Omit<Dvs, "hp">): number {
  return (
    ((dvs.attack & 1) << 3) | ((dvs.defense & 1) << 2) | ((dvs.speed & 1) << 1) | (dvs.spAttack & 1)
  );
}

function normalizeDvs(overrides: DvOverrides = {}): Dvs {
  const dvsWithoutHp = {
    attack: overrides.attack ?? DEFAULT_DV,
    defense: overrides.defense ?? DEFAULT_DV,
    spAttack: overrides.spAttack ?? DEFAULT_DV,
    spDefense: overrides.spDefense ?? DEFAULT_DV,
    speed: overrides.speed ?? DEFAULT_DV,
  };
  return Object.freeze({
    hp: deriveHpDv(dvsWithoutHp),
    ...dvsWithoutHp,
  });
}

function normalizeStatExp(overrides: StatExpOverrides = {}): StatExpValues {
  return Object.freeze({
    hp: overrides.hp ?? DEFAULT_STAT_EXP,
    attack: overrides.attack ?? DEFAULT_STAT_EXP,
    defense: overrides.defense ?? DEFAULT_STAT_EXP,
    spAttack: overrides.spAttack ?? DEFAULT_STAT_EXP,
    spDefense: overrides.spDefense ?? DEFAULT_STAT_EXP,
    speed: overrides.speed ?? DEFAULT_STAT_EXP,
  });
}

export function validateIvs(candidate: IvOverrides | Ivs): ValidationResult {
  return validateNumericStatBlock(normalizeIvs(candidate), {
    min: MIN_IV,
    max: MAX_IV,
    label: "IV",
  });
}

export function createIvs(overrides: IvOverrides = {}): Ivs {
  const ivs = normalizeIvs(overrides);
  assertValid(validateIvs(ivs), "IV");
  return ivs;
}

export function validateEvs(candidate: EvOverrides | Evs): ValidationResult {
  const normalized = normalizeEvs(candidate);
  const blockResult = validateNumericStatBlock(normalized, {
    min: MIN_EV,
    max: MAX_EV,
    label: "EV",
  });
  const failures = [...blockResult.failures];

  const total = STAT_FIELDS.reduce((sum, field) => sum + normalized[field], 0);

  if (total > MAX_TOTAL_EVS) {
    failures.push({
      field: "total",
      value: total,
      message: `total EVs must be <= ${MAX_TOTAL_EVS}`,
    });
  }

  return buildValidationResult(failures);
}

export function createEvs(overrides: EvOverrides = {}): Evs {
  const evs = normalizeEvs(overrides);
  assertValid(validateEvs(evs), "EV");
  return evs;
}

export function validateDvs(
  candidate: DvOverrides & Partial<Record<"hp", unknown>>,
): ValidationResult {
  const failures: ValidationFailure[] = [];
  if ("hp" in candidate && candidate.hp !== undefined) {
    failures.push({
      field: "hp",
      value: candidate.hp,
      message: "hp DV is derived from the other DVs and cannot be provided directly",
    });
  }

  const normalized = normalizeDvs(candidate);
  const blockResult = validateNumericStatBlock(normalized, {
    min: MIN_DV,
    max: MAX_DV,
    label: "DV",
    statFields: ["attack", "defense", "spAttack", "spDefense", "speed"],
  });
  failures.push(...blockResult.failures);

  return buildValidationResult(failures);
}

export function createDvs(overrides: DvOverrides = {}): Dvs {
  assertValid(validateDvs(overrides), "DV");
  return normalizeDvs(overrides);
}

export function validateStatExp(candidate: StatExpOverrides | StatExpValues): ValidationResult {
  return validateNumericStatBlock(normalizeStatExp(candidate), {
    min: MIN_STAT_EXP,
    max: MAX_STAT_EXP,
    label: "Stat Exp",
  });
}

export function createStatExp(overrides: StatExpOverrides = {}): StatExpValues {
  const statExp = normalizeStatExp(overrides);
  assertValid(validateStatExp(statExp), "Stat Exp");
  return statExp;
}
