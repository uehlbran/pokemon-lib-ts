import type { ExperienceGroup } from "../entities/experience";

/**
 * Calculate the total experience needed to reach a given level.
 *
 * All formulas are from Bulbapedia:
 * https://bulbapedia.bulbagarden.net/wiki/Experience
 *
 * @param group - Experience growth rate group
 * @param level - Target level (1-100)
 * @returns Total cumulative EXP needed to reach this level
 */
export function getExpForLevel(group: ExperienceGroup, level: number): number {
  if (level <= 1) return 0;
  const n = level;

  switch (group) {
    case "erratic":
      if (n <= 50) return Math.floor((n ** 3 * (100 - n)) / 50);
      if (n <= 68) return Math.floor((n ** 3 * (150 - n)) / 100);
      if (n <= 98) return Math.floor((n ** 3 * Math.floor((1911 - 10 * n) / 3)) / 500);
      return Math.floor((n ** 3 * (160 - n)) / 100);

    case "fast":
      return Math.floor((4 * n ** 3) / 5);

    case "medium-fast":
      return n ** 3;

    case "medium-slow":
      return Math.floor((6 / 5) * n ** 3 - 15 * n ** 2 + 100 * n - 140);

    case "slow":
      return Math.floor((5 * n ** 3) / 4);

    case "fluctuating":
      if (n <= 15) return Math.floor(n ** 3 * ((Math.floor((n + 1) / 3) + 24) / 50));
      if (n <= 36) return Math.floor(n ** 3 * ((n + 14) / 50));
      return Math.floor(n ** 3 * ((Math.floor(n / 2) + 32) / 50));
  }
}

/**
 * Get the EXP needed to advance from one level to the next.
 */
export function getExpToNextLevel(group: ExperienceGroup, currentLevel: number): number {
  if (currentLevel >= 100) return 0;
  return getExpForLevel(group, currentLevel + 1) - getExpForLevel(group, currentLevel);
}

/**
 * Calculate experience gained from defeating a Pokemon.
 *
 * Gen 5+ "Scaled" formula:
 *   EXP = (b * L_d / 5) * (1 / s) * ((2 * L_d + 10)^2.5 / (L_d + L_p + 10)^2.5) + 1) * t * e
 *
 * @param baseExpYield - Defeated species' base EXP yield
 * @param defeatedLevel - Level of the defeated Pokemon
 * @param participantLevel - Level of the Pokemon gaining EXP
 * @param isTrainerBattle - Whether this is a trainer battle
 * @param participantCount - Number of Pokemon that participated
 * @param hasLuckyEgg - Whether the gaining Pokemon holds Lucky Egg
 * @returns EXP gained (always at least 1)
 */
export function calculateExpGain(
  baseExpYield: number,
  defeatedLevel: number,
  participantLevel: number,
  isTrainerBattle: boolean,
  participantCount = 1,
  hasLuckyEgg = false,
): number {
  const b = baseExpYield;
  const Ld = defeatedLevel;
  const Lp = participantLevel;
  const s = participantCount;
  const t = isTrainerBattle ? 1.5 : 1.0;
  const e = hasLuckyEgg ? 1.5 : 1.0;

  const scaledBase = (b * Ld) / 5 / s;
  const levelFactor = (2 * Ld + 10) ** 2.5 / (Ld + Lp + 10) ** 2.5 + 1;
  const exp = Math.floor(scaledBase * levelFactor * t * e);

  return Math.max(1, exp);
}

/**
 * Classic (Gen 1-4) EXP formula -- provided for gen plugins.
 *
 *   EXP = (b * L_d / 7) * (1 / s) * t
 *
 * Simpler -- no level scaling, stronger Pokemon don't get reduced EXP.
 */
export function calculateExpGainClassic(
  baseExpYield: number,
  defeatedLevel: number,
  isTrainerBattle: boolean,
  participantCount = 1,
): number {
  const t = isTrainerBattle ? 1.5 : 1.0;
  return Math.max(1, Math.floor(((baseExpYield * defeatedLevel) / 7 / participantCount) * t));
}
