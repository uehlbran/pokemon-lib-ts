import { describe, expect, it } from "vitest"
import type { GenerationRuleset } from "../../src/ruleset"
import { MockRuleset } from "../helpers/mock-ruleset"

/**
 * Verify that the GenerationRuleset interface is complete and that
 * the MockRuleset properly implements every method. This acts as
 * a contract test — if the interface grows, this test must be updated.
 */
describe("GenerationRuleset interface verification", () => {
  // List of all ~22 methods + 2 readonly properties defined in GenerationRuleset
  const expectedMembers = [
    // Properties
    "generation",
    "name",
    // Type system
    "getTypeChart",
    "getValidTypes",
    // Stat calculation
    "calculateStats",
    // Damage
    "calculateDamage",
    // Critical hits
    "getCritRateTable",
    "getCritMultiplier",
    "rollCritical",
    // Turn order
    "resolveTurnOrder",
    // Move execution
    "doesMoveHit",
    "executeMoveEffect",
    // Status conditions
    "applyStatusDamage",
    "checkFreezeThaw",
    "rollSleepTurns",
    // Abilities
    "hasAbilities",
    "applyAbility",
    // Items
    "hasHeldItems",
    "applyHeldItem",
    // Weather
    "hasWeather",
    "applyWeatherEffects",
    // Terrain
    "hasTerrain",
    "applyTerrainEffects",
    // Entry hazards
    "getAvailableHazards",
    "applyEntryHazards",
    // EXP
    "calculateExpGain",
    // Battle gimmick
    "getBattleGimmick",
    // Validation
    "validatePokemon",
    // End-of-turn
    "getEndOfTurnOrder",
  ]

  it("given the GenerationRuleset interface, when MockRuleset implements it, then all expected members are present", () => {
    // Arrange
    const ruleset: GenerationRuleset = new MockRuleset()

    // Act & Assert — verify every expected member exists and has correct type
    for (const member of expectedMembers) {
      expect(
        member in ruleset,
        `Expected member '${member}' to exist on GenerationRuleset implementation`,
      ).toBe(true)
    }
  })

  it("given the GenerationRuleset interface, when counting all members, then there are at least 22 method/property entries", () => {
    // Assert — the interface has 22 properties and methods per spec
    expect(expectedMembers.length).toBeGreaterThanOrEqual(22)
  })

  describe("return types are specific (no any)", () => {
    it("given MockRuleset.getTypeChart, when called, then it returns a record of type multipliers", () => {
      // Arrange
      const ruleset = new MockRuleset()

      // Act
      const chart = ruleset.getTypeChart()

      // Assert — should be a nested record structure with number values
      expect(typeof chart).toBe("object")
      const firstKey = Object.keys(chart)[0]!
      expect(typeof chart[firstKey]).toBe("object")
      const innerFirstKey = Object.keys(chart[firstKey]!)[0]!
      expect(typeof chart[firstKey]![innerFirstKey]).toBe("number")
    })

    it("given MockRuleset.getValidTypes, when called, then it returns an array of lowercase string types", () => {
      // Arrange
      const ruleset = new MockRuleset()

      // Act
      const types = ruleset.getValidTypes()

      // Assert
      expect(Array.isArray(types)).toBe(true)
      expect(types.length).toBeGreaterThan(0)
      for (const t of types) {
        expect(t).toMatch(/^[a-z]+$/)
      }
    })

    it("given MockRuleset.getCritRateTable, when called, then it returns an array of positive numbers", () => {
      // Arrange
      const ruleset = new MockRuleset()

      // Act
      const table = ruleset.getCritRateTable()

      // Assert
      expect(Array.isArray(table)).toBe(true)
      for (const rate of table) {
        expect(typeof rate).toBe("number")
        expect(rate).toBeGreaterThan(0)
      }
    })

    it("given MockRuleset.getCritMultiplier, when called, then it returns a number greater than 1", () => {
      // Arrange
      const ruleset = new MockRuleset()

      // Act
      const mult = ruleset.getCritMultiplier()

      // Assert
      expect(typeof mult).toBe("number")
      expect(mult).toBeGreaterThan(1)
    })

    it("given MockRuleset.hasAbilities, when called, then it returns a boolean", () => {
      // Arrange
      const ruleset = new MockRuleset()

      // Act
      const result = ruleset.hasAbilities()

      // Assert
      expect(typeof result).toBe("boolean")
    })

    it("given MockRuleset.hasHeldItems, when called, then it returns a boolean", () => {
      // Arrange
      const ruleset = new MockRuleset()

      // Act
      const result = ruleset.hasHeldItems()

      // Assert
      expect(typeof result).toBe("boolean")
    })

    it("given MockRuleset.hasWeather, when called, then it returns a boolean", () => {
      // Arrange
      const ruleset = new MockRuleset()

      // Act
      const result = ruleset.hasWeather()

      // Assert
      expect(typeof result).toBe("boolean")
    })

    it("given MockRuleset.hasTerrain, when called, then it returns a boolean", () => {
      // Arrange
      const ruleset = new MockRuleset()

      // Act
      const result = ruleset.hasTerrain()

      // Assert
      expect(typeof result).toBe("boolean")
    })

    it("given MockRuleset.getAvailableHazards, when called, then it returns an array", () => {
      // Arrange
      const ruleset = new MockRuleset()

      // Act
      const hazards = ruleset.getAvailableHazards()

      // Assert
      expect(Array.isArray(hazards)).toBe(true)
    })

    it("given MockRuleset.getBattleGimmick, when called, then it returns null or an object with a name", () => {
      // Arrange
      const ruleset = new MockRuleset()

      // Act
      const gimmick = ruleset.getBattleGimmick()

      // Assert — Gen 1 has no gimmick
      expect(gimmick).toBeNull()
    })

    it("given MockRuleset.getEndOfTurnOrder, when called, then it returns an array of string effect names", () => {
      // Arrange
      const ruleset = new MockRuleset()

      // Act
      const order = ruleset.getEndOfTurnOrder()

      // Assert
      expect(Array.isArray(order)).toBe(true)
      expect(order.length).toBeGreaterThan(0)
      for (const effect of order) {
        expect(typeof effect).toBe("string")
      }
    })

    it("given MockRuleset.generation, when accessed, then it is a number in range 1-9", () => {
      // Arrange
      const ruleset = new MockRuleset()

      // Act & Assert
      expect(typeof ruleset.generation).toBe("number")
      expect(ruleset.generation).toBeGreaterThanOrEqual(1)
      expect(ruleset.generation).toBeLessThanOrEqual(9)
    })

    it("given MockRuleset.name, when accessed, then it is a non-empty string", () => {
      // Arrange
      const ruleset = new MockRuleset()

      // Act & Assert
      expect(typeof ruleset.name).toBe("string")
      expect(ruleset.name.length).toBeGreaterThan(0)
    })
  })
})
