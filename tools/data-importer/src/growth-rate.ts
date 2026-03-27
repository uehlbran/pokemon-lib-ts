import type { ExperienceGroup } from "@pokemon-lib-ts/core";
import { normalizeExperienceGroup } from "@pokemon-lib-ts/core";

/**
 * Normalize PokeAPI growth-rate names to the canonical runtime identifiers emitted in the
 * generated species JSON.
 */
export function normalizeImportedGrowthRate(name: string): ExperienceGroup {
  return normalizeExperienceGroup(name);
}
