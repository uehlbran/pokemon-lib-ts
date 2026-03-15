import { describe, expect, it } from "vitest";
import type { TypeChart } from "../../src/entities/type-chart";
import type { PokemonType } from "../../src/entities/types";
import {
  classifyEffectiveness,
  getTypeEffectiveness,
  getTypeMultiplier,
} from "../../src/logic/type-effectiveness";

// Full Gen 6+ type chart (18x18)
// Only stores non-1.0 values; getTypeMultiplier defaults missing entries to 1.
const ALL_TYPES: PokemonType[] = [
  "normal",
  "fire",
  "water",
  "electric",
  "grass",
  "ice",
  "fighting",
  "poison",
  "ground",
  "flying",
  "psychic",
  "bug",
  "rock",
  "ghost",
  "dragon",
  "dark",
  "steel",
  "fairy",
];

function buildDefaultTypeChart(): TypeChart {
  // Initialize all matchups to 1.0
  const chart = {} as Record<PokemonType, Record<PokemonType, number>>;
  for (const atk of ALL_TYPES) {
    chart[atk] = {} as Record<PokemonType, number>;
    for (const def of ALL_TYPES) {
      chart[atk][def] = 1.0;
    }
  }

  // Super effective (2x)
  const superEffective: [PokemonType, PokemonType][] = [
    ["fire", "grass"],
    ["fire", "ice"],
    ["fire", "bug"],
    ["fire", "steel"],
    ["water", "fire"],
    ["water", "ground"],
    ["water", "rock"],
    ["electric", "water"],
    ["electric", "flying"],
    ["grass", "water"],
    ["grass", "ground"],
    ["grass", "rock"],
    ["ice", "grass"],
    ["ice", "ground"],
    ["ice", "flying"],
    ["ice", "dragon"],
    ["fighting", "normal"],
    ["fighting", "ice"],
    ["fighting", "rock"],
    ["fighting", "dark"],
    ["fighting", "steel"],
    ["poison", "grass"],
    ["poison", "fairy"],
    ["ground", "fire"],
    ["ground", "electric"],
    ["ground", "poison"],
    ["ground", "rock"],
    ["ground", "steel"],
    ["flying", "grass"],
    ["flying", "fighting"],
    ["flying", "bug"],
    ["psychic", "fighting"],
    ["psychic", "poison"],
    ["bug", "grass"],
    ["bug", "psychic"],
    ["bug", "dark"],
    ["rock", "fire"],
    ["rock", "ice"],
    ["rock", "flying"],
    ["rock", "bug"],
    ["ghost", "psychic"],
    ["ghost", "ghost"],
    ["dragon", "dragon"],
    ["dark", "psychic"],
    ["dark", "ghost"],
    ["steel", "ice"],
    ["steel", "rock"],
    ["steel", "fairy"],
    ["fairy", "fighting"],
    ["fairy", "dragon"],
    ["fairy", "dark"],
  ];

  // Not very effective (0.5x)
  const notVeryEffective: [PokemonType, PokemonType][] = [
    ["normal", "rock"],
    ["normal", "steel"],
    ["fire", "fire"],
    ["fire", "water"],
    ["fire", "rock"],
    ["fire", "dragon"],
    ["water", "water"],
    ["water", "grass"],
    ["water", "dragon"],
    ["electric", "electric"],
    ["electric", "grass"],
    ["electric", "dragon"],
    ["grass", "fire"],
    ["grass", "grass"],
    ["grass", "poison"],
    ["grass", "flying"],
    ["grass", "bug"],
    ["grass", "dragon"],
    ["grass", "steel"],
    ["ice", "fire"],
    ["ice", "water"],
    ["ice", "ice"],
    ["ice", "steel"],
    ["fighting", "poison"],
    ["fighting", "flying"],
    ["fighting", "psychic"],
    ["fighting", "bug"],
    ["fighting", "fairy"],
    ["poison", "poison"],
    ["poison", "ground"],
    ["poison", "rock"],
    ["poison", "ghost"],
    ["ground", "grass"],
    ["ground", "bug"],
    ["flying", "electric"],
    ["flying", "rock"],
    ["flying", "steel"],
    ["psychic", "psychic"],
    ["psychic", "steel"],
    ["bug", "fire"],
    ["bug", "fighting"],
    ["bug", "poison"],
    ["bug", "flying"],
    ["bug", "ghost"],
    ["bug", "steel"],
    ["bug", "fairy"],
    ["rock", "fighting"],
    ["rock", "ground"],
    ["rock", "steel"],
    ["ghost", "dark"],
    ["dragon", "steel"],
    ["dark", "fighting"],
    ["dark", "dark"],
    ["dark", "fairy"],
    ["steel", "fire"],
    ["steel", "water"],
    ["steel", "electric"],
    ["steel", "steel"],
    ["fairy", "fire"],
    ["fairy", "poison"],
    ["fairy", "steel"],
  ];

  // Immune (0x)
  const immune: [PokemonType, PokemonType][] = [
    ["normal", "ghost"],
    ["electric", "ground"],
    ["fighting", "ghost"],
    ["poison", "steel"],
    ["ground", "flying"],
    ["psychic", "dark"],
    ["ghost", "normal"],
    ["dragon", "fairy"],
  ];

  for (const [atk, def] of superEffective) {
    chart[atk][def] = 2.0;
  }
  for (const [atk, def] of notVeryEffective) {
    chart[atk][def] = 0.5;
  }
  for (const [atk, def] of immune) {
    chart[atk][def] = 0.0;
  }

  return chart as TypeChart;
}

const TYPE_CHART = buildDefaultTypeChart();

describe("getTypeMultiplier", () => {
  it("should return 2.0 for Fire > Grass", () => {
    expect(getTypeMultiplier("fire", "grass", TYPE_CHART)).toBe(2.0);
  });

  it("should return 0.5 for Fire > Water", () => {
    expect(getTypeMultiplier("fire", "water", TYPE_CHART)).toBe(0.5);
  });

  it("should return 0 for Normal > Ghost", () => {
    expect(getTypeMultiplier("normal", "ghost", TYPE_CHART)).toBe(0);
  });

  it("should return 1.0 for Normal > Normal", () => {
    expect(getTypeMultiplier("normal", "normal", TYPE_CHART)).toBe(1.0);
  });

  it("should return 2.0 for Ghost > Psychic", () => {
    expect(getTypeMultiplier("ghost", "psychic", TYPE_CHART)).toBe(2.0);
  });

  it("should return 0 for Dragon > Fairy", () => {
    expect(getTypeMultiplier("dragon", "fairy", TYPE_CHART)).toBe(0);
  });

  it("should return 2.0 for Fairy > Dragon", () => {
    expect(getTypeMultiplier("fairy", "dragon", TYPE_CHART)).toBe(2.0);
  });
});

describe("getTypeEffectiveness", () => {
  it("should return 2.0 for Fire vs single-type Grass", () => {
    expect(getTypeEffectiveness("fire", ["grass"], TYPE_CHART)).toBe(2.0);
  });

  it("should return 4.0 for Ice vs Dragon/Flying (double super effective)", () => {
    expect(getTypeEffectiveness("ice", ["dragon", "flying"], TYPE_CHART)).toBe(4.0);
  });

  it("should return 0 for Normal vs Ghost (any dual type with Ghost)", () => {
    expect(getTypeEffectiveness("normal", ["ghost"], TYPE_CHART)).toBe(0);
    expect(getTypeEffectiveness("normal", ["ghost", "poison"], TYPE_CHART)).toBe(0);
  });

  it("should return 0.25 for Fire vs Water/Dragon (double resisted)", () => {
    expect(getTypeEffectiveness("fire", ["water", "dragon"], TYPE_CHART)).toBe(0.25);
  });

  it("should return 1.0 for neutral matchups", () => {
    expect(getTypeEffectiveness("normal", ["normal"], TYPE_CHART)).toBe(1.0);
  });

  it("should return 1.0 for a super-effective and resisted combination", () => {
    // Fire vs Grass/Water: 2.0 * 0.5 = 1.0
    expect(getTypeEffectiveness("fire", ["grass", "water"], TYPE_CHART)).toBe(1.0);
  });

  it("should handle single-type defenders", () => {
    expect(getTypeEffectiveness("water", ["fire"], TYPE_CHART)).toBe(2.0);
  });

  it("should return valid effectiveness values", () => {
    const validValues = new Set([0, 0.25, 0.5, 1, 2, 4]);
    for (const atkType of ALL_TYPES) {
      for (const def1 of ALL_TYPES) {
        // Single type
        const single = getTypeEffectiveness(atkType, [def1], TYPE_CHART);
        expect(validValues.has(single)).toBe(true);

        // Dual type
        for (const def2 of ALL_TYPES) {
          if (def1 === def2) continue;
          const dual = getTypeEffectiveness(atkType, [def1, def2], TYPE_CHART);
          expect(validValues.has(dual)).toBe(true);
        }
      }
    }
  });
});

describe("classifyEffectiveness", () => {
  it("should classify 0 as immune", () => {
    expect(classifyEffectiveness(0)).toBe("immune");
  });

  it("should classify 0.25 as double-resisted", () => {
    expect(classifyEffectiveness(0.25)).toBe("double-resisted");
  });

  it("should classify 0.5 as resisted", () => {
    expect(classifyEffectiveness(0.5)).toBe("resisted");
  });

  it("should classify 1 as neutral", () => {
    expect(classifyEffectiveness(1)).toBe("neutral");
  });

  it("should classify 2 as super-effective", () => {
    expect(classifyEffectiveness(2)).toBe("super-effective");
  });

  it("should classify 4 as double-super", () => {
    expect(classifyEffectiveness(4)).toBe("double-super");
  });
});
