import type { ExperienceGroup, ExperienceGroupIdentifier } from "../entities/experience";

/**
 * Normalize imported growth-rate identifiers to the 6 canonical runtime groups.
 *
 * Source: PokeAPI growth-rate formulas/totals — `slow-then-very-fast` matches the erratic
 * curve and `fast-then-very-slow` matches the fluctuating curve.
 */
export function normalizeExperienceGroup(group: string): ExperienceGroup {
  switch (group) {
    case "medium":
      return "medium-fast";
    case "slow-then-very-fast":
      return "erratic";
    case "fast-then-very-slow":
      return "fluctuating";
    case "erratic":
    case "fast":
    case "medium-fast":
    case "medium-slow":
    case "slow":
    case "fluctuating":
      return group;
    default:
      throw new Error(`Unsupported experience growth group "${group}"`);
  }
}

/**
 * Calculate the total experience needed to reach a given level.
 *
 * Source: Bulbapedia — Experience (https://bulbapedia.bulbagarden.net/wiki/Experience)
 * Source: pret/pokeemerald src/data/pokemon/experience_tables.h — precomputed lookup tables
 *   (the formulas below produce the same values as the decomp's gExperienceTables)
 *
 * @param group - Experience growth rate group
 * @param level - Target level (1-100)
 * @returns Total cumulative EXP needed to reach this level
 */
export function getExpForLevel(group: ExperienceGroupIdentifier | string, level: number): number {
  if (level <= 1) return 0;
  const n = level;
  const normalizedGroup = normalizeExperienceGroup(group);

  switch (normalizedGroup) {
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
 * Source: Bulbapedia — Experience (https://bulbapedia.bulbagarden.net/wiki/Experience#Gain_formula)
 * Source: Showdown sim/battle-actions.ts — Gen 5+ scaled EXP calculation
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
 * Source: pret/pokeemerald src/battle_script_commands.c — Cmd_getexp
 *   Integer truncation is applied at each step independently,
 *   matching the decomp's sequential divide-then-multiply pattern.
 * Source: Bulbapedia — Experience (https://bulbapedia.bulbagarden.net/wiki/Experience#Gain_formula)
 *
 *   EXP = floor(floor(floor(b * L_d / 7) / s) * t) * e
 *
 * Simpler -- no level scaling, stronger Pokemon don't get reduced EXP.
 *
 * @param baseExpYield - Defeated species' base EXP yield
 * @param defeatedLevel - Level of the defeated Pokemon
 * @param isTrainerBattle - Whether this is a trainer battle (1.5x multiplier)
 * @param participantCount - Number of Pokemon that participated
 * @param hasLuckyEgg - Whether the gaining Pokemon holds Lucky Egg (1.5x multiplier, Gen 2+)
 * @param isTradedPokemon - Whether the gaining Pokemon was obtained via trade (1.5x or 1.7x bonus)
 * @param isInternationalTrade - Whether the trade was international/different language (1.7x instead of 1.5x)
 *   Note: Gen 1-2 have no language metadata; pass false here for those gens (only 1.5x applies).
 * @returns EXP gained (always at least 1)
 */
export function calculateExpGainClassic(
  baseExpYield: number,
  defeatedLevel: number,
  isTrainerBattle: boolean,
  participantCount = 1,
  hasLuckyEgg = false,
  isTradedPokemon = false,
  isInternationalTrade = false,
): number {
  // Source: pret/pokeemerald src/battle_script_commands.c — each step independently truncated
  const t = isTrainerBattle ? 1.5 : 1.0;
  let exp = Math.floor((baseExpYield * defeatedLevel) / 7);
  exp = Math.floor(exp / participantCount);
  exp = Math.floor(exp * t);
  // Source: pret/pokeemerald — Lucky Egg 1.5x multiplier applied after trainer bonus
  if (hasLuckyEgg) {
    exp = Math.floor(exp * 1.5);
  }
  // Source: pret/pokeplatinum src/battle/battle_script.c lines 9980-9984
  //   BattleSystem_PokemonIsOT == FALSE → traded Pokemon receive boosted EXP:
  //   MON_DATA_LANGUAGE != gGameLanguage → 1.7x (international), else 1.5x (same language)
  if (isTradedPokemon) {
    const tradedMultiplier = isInternationalTrade ? 1.7 : 1.5;
    exp = Math.floor(exp * tradedMultiplier);
  }
  return Math.max(1, exp);
}
