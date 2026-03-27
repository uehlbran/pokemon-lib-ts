import type { PokemonType } from "@pokemon-lib-ts/core";
import { CORE_ABILITY_IDS, CORE_GENDERS, CORE_MOVE_IDS, CORE_TYPE_IDS } from "@pokemon-lib-ts/core";
import { describe, expect, it } from "vitest";
import {
  clonePokemonInstance,
  createBattleSide,
  createBattleState,
  createDefaultStatStages,
  createOnFieldPokemon,
  createPokemonSnapshot,
  createTestPokemon,
  getPokemonName,
} from "../../../src/utils";

describe("BattleHelpers", () => {
  const fireFlyingTypes: PokemonType[] = [CORE_TYPE_IDS.fire, CORE_TYPE_IDS.flying];
  const fireMonotype: PokemonType[] = [CORE_TYPE_IDS.fire];

  describe("createDefaultStatStages", () => {
    it("given no arguments, when createDefaultStatStages is called, then all stages are 0", () => {
      // Act
      const stages = createDefaultStatStages();

      // Assert
      expect(stages.hp).toBe(0);
      expect(stages.attack).toBe(0);
      expect(stages.defense).toBe(0);
      expect(stages.spAttack).toBe(0);
      expect(stages.spDefense).toBe(0);
      expect(stages.speed).toBe(0);
      expect(stages.accuracy).toBe(0);
      expect(stages.evasion).toBe(0);
    });
  });

  describe("createTestPokemon", () => {
    it("given speciesId and level, when createTestPokemon is called, then a valid PokemonInstance is returned", () => {
      // Act
      // Source: Battle helper default fixture coverage uses a Charizard-style species/level pair.
      const speciesId = 6;
      const level = 50;
      const expectedCurrentHp = 200;
      const pokemon = createTestPokemon(speciesId, level);

      // Assert
      expect(pokemon.speciesId).toBe(speciesId);
      expect(pokemon.level).toBe(level);
      expect(pokemon.currentHp).toBe(expectedCurrentHp);
      expect(pokemon.moves).toHaveLength(1);
      expect(pokemon.moves[0]?.moveId).toBe(CORE_MOVE_IDS.tackle);
    });

    it("given repeated calls with the same species and level, when createTestPokemon is called, then each Pokemon has a unique uid", () => {
      // Act
      const firstPokemon = createTestPokemon(6, 50);
      const secondPokemon = createTestPokemon(6, 50);

      // Assert
      expect(firstPokemon.uid).not.toBe(secondPokemon.uid);
      expect(firstPokemon.uid).toMatch(/^test-6-50-\d+$/);
      expect(secondPokemon.uid).toMatch(/^test-6-50-\d+$/);
    });

    it("given overrides, when createTestPokemon is called, then overrides are applied", () => {
      // Act
      // Source: the override fixture intentionally uses a level-30 Pokemon to verify replacement values.
      const overriddenSpeciesId = 25;
      const overriddenLevel = 30;
      const overriddenCurrentHp = 100;
      const pokemon = createTestPokemon(overriddenSpeciesId, overriddenLevel, {
        nickname: "Sparky",
        currentHp: overriddenCurrentHp,
      });

      // Assert
      expect(pokemon.nickname).toBe("Sparky");
      expect(pokemon.currentHp).toBe(overriddenCurrentHp);
      expect(pokemon.level).toBe(overriddenLevel);
    });
  });

  describe("createOnFieldPokemon", () => {
    it("given a PokemonInstance, when createOnFieldPokemon is called, then an ActivePokemon wrapper is returned", () => {
      // Arrange
      const pokemon = createTestPokemon(6, 50);

      // Act
      const active = createOnFieldPokemon(pokemon, 0, fireFlyingTypes);

      // Assert
      expect(active.pokemon).toBe(pokemon);
      expect(active.teamSlot).toBe(0);
      expect(active.types).toEqual(fireFlyingTypes);
      expect(active.statStages.attack).toBe(0);
      expect(active.volatileStatuses.size).toBe(0);
      expect(active.turnsOnField).toBe(0);
      expect(active.isMega).toBe(false);
      expect(active.isDynamaxed).toBe(false);
      expect(active.isTerastallized).toBe(false);
      expect(active.stellarBoostedTypes).toEqual([]);
    });

    it("given invalid team slot or invalid base types, when createOnFieldPokemon is called, then it rejects the malformed active wrapper", () => {
      const pokemon = createTestPokemon(6, 50);

      expect(() => createOnFieldPokemon(pokemon, -1, fireFlyingTypes)).toThrow(
        "teamSlot must be >= 0",
      );
      expect(() => createOnFieldPokemon(pokemon, 0, [])).toThrow(
        "baseTypes must contain 1 or 2 types",
      );
      expect(() =>
        createOnFieldPokemon(pokemon, 0, [CORE_TYPE_IDS.fire, CORE_TYPE_IDS.fire]),
      ).toThrow("baseTypes cannot contain duplicate types");
    });

    it("given invalid persisted Mega or Tera type lists, when createOnFieldPokemon is called, then the error points at the persisted source field", () => {
      expect(() =>
        createOnFieldPokemon(
          createTestPokemon(6, 50, {
            megaAbility: CORE_ABILITY_IDS.solarPower,
            megaTypes: [CORE_TYPE_IDS.fire, CORE_TYPE_IDS.fire],
          }),
          0,
          fireFlyingTypes,
        ),
      ).toThrow("megaTypes cannot contain duplicate types");

      expect(() =>
        createOnFieldPokemon(
          createTestPokemon(6, 50, {
            terastallized: true,
            teraType: CORE_TYPE_IDS.grass,
            teraTypes: [CORE_TYPE_IDS.grass, CORE_TYPE_IDS.grass],
          }),
          0,
          fireFlyingTypes,
        ),
      ).toThrow("teraTypes cannot contain duplicate types");
    });

    it("given a caller-owned base types array, when createOnFieldPokemon is called, then the ActivePokemon gets its own copy", () => {
      const pokemon = createTestPokemon(6, 50);
      const types: PokemonType[] = [...fireFlyingTypes];

      const active = createOnFieldPokemon(pokemon, 0, types);

      expect(active.types).toEqual(fireFlyingTypes);
      expect(active.types).not.toBe(types);

      active.types[0] = CORE_TYPE_IDS.water;

      expect(types).toEqual(fireFlyingTypes);
      expect(active.types).toEqual([CORE_TYPE_IDS.water, CORE_TYPE_IDS.flying]);
    });

    it("given a pokemon that already Mega Evolved, when createOnFieldPokemon is called, then Mega identity is restored from the instance", () => {
      const pokemon = createTestPokemon(6, 50, {
        ability: CORE_ABILITY_IDS.blaze,
        megaAbility: CORE_ABILITY_IDS.solarPower,
        megaTypes: [CORE_TYPE_IDS.fire, CORE_TYPE_IDS.dragon],
      });

      const active = createOnFieldPokemon(pokemon, 0, fireFlyingTypes);

      expect(active.isMega).toBe(true);
      expect(active.ability).toBe(CORE_ABILITY_IDS.solarPower);
      expect(active.types).toEqual([CORE_TYPE_IDS.fire, CORE_TYPE_IDS.dragon]);
    });

    it("given a pokemon that already Terastallized, when createOnFieldPokemon is called, then Tera identity is restored from the instance", () => {
      const pokemon = createTestPokemon(6, 50, {
        terastallized: true,
        teraType: CORE_TYPE_IDS.grass,
        teraTypes: [CORE_TYPE_IDS.grass],
        stellarBoostedTypes: [CORE_TYPE_IDS.fire],
      });

      const active = createOnFieldPokemon(pokemon, 0, fireFlyingTypes);

      expect(active.isTerastallized).toBe(true);
      expect(active.teraType).toBe(CORE_TYPE_IDS.grass);
      expect(active.types).toEqual([CORE_TYPE_IDS.grass]);
      expect(active.stellarBoostedTypes).toEqual([CORE_TYPE_IDS.fire]);
    });

    it("given inconsistent persisted form state, when createOnFieldPokemon is called, then it rejects the malformed active wrapper", () => {
      expect(() =>
        createOnFieldPokemon(
          createTestPokemon(6, 50, {
            megaTypes: [CORE_TYPE_IDS.fire, CORE_TYPE_IDS.dragon],
          }),
          0,
          fireFlyingTypes,
        ),
      ).toThrow("mega-evolved Pokemon must provide both megaTypes and megaAbility");

      expect(() =>
        createOnFieldPokemon(
          createTestPokemon(6, 50, {
            terastallized: true,
          }),
          0,
          fireFlyingTypes,
        ),
      ).toThrow("terastallized Pokemon must provide teraType");
    });

    it("given a terastallized pokemon with only teraType persisted, when createOnFieldPokemon is called, then the active defensive typing falls back to that teraType", () => {
      const pokemon = createTestPokemon(6, 50, {
        terastallized: true,
        teraType: CORE_TYPE_IDS.grass,
      });

      const active = createOnFieldPokemon(pokemon, 0, fireFlyingTypes);

      expect(active.isTerastallized).toBe(true);
      expect(active.teraType).toBe(CORE_TYPE_IDS.grass);
      expect(active.types).toEqual([CORE_TYPE_IDS.grass]);
    });
  });

  describe("createBattleSide", () => {
    it("given team and matching active wrapper, when createBattleSide is called, then the side is created", () => {
      const pokemon = createTestPokemon(6, 50);
      const active = createOnFieldPokemon(pokemon, 0, fireFlyingTypes);

      const side = createBattleSide({
        index: 0,
        team: [pokemon],
        active: [active],
      });

      expect(side.index).toBe(0);
      expect(side.team).toEqual([pokemon]);
      expect(side.active).toEqual([active]);
    });

    it("given an active wrapper that does not match the provided team slot, when createBattleSide is called, then it rejects the inconsistent side", () => {
      const teamPokemon = createTestPokemon(6, 50, { uid: "team-mon" });
      const activePokemon = createTestPokemon(9, 50, { uid: "active-mon" });
      const active = createOnFieldPokemon(activePokemon, 0, [CORE_TYPE_IDS.water]);

      expect(() =>
        createBattleSide({
          index: 0,
          team: [teamPokemon],
          active: [active],
        }),
      ).toThrow("active[0] must reference the Pokemon at team slot 0");
    });

    it("given missing or duplicated active team slots, when createBattleSide is called, then it rejects the inconsistent side", () => {
      const pokemon = createTestPokemon(6, 50);
      const active = createOnFieldPokemon(pokemon, 0, fireFlyingTypes);

      expect(() =>
        createBattleSide({
          index: 0,
          team: [pokemon],
          active: [active, createOnFieldPokemon(pokemon, 0, fireFlyingTypes)],
        }),
      ).toThrow("team slot 0 cannot be active more than once");

      expect(() =>
        createBattleSide({
          index: 0,
          team: [pokemon],
          faintCount: 2,
        }),
      ).toThrow("faintCount 2 cannot exceed team size 1");
    });
  });

  describe("createBattleState", () => {
    it("given default inputs, when createBattleState is called, then a valid singles battle state is returned", () => {
      const state = createBattleState();

      expect(state.format).toBe("singles");
      expect(state.sides).toHaveLength(2);
      expect(state.sides[0].index).toBe(0);
      expect(state.sides[1].index).toBe(1);
      expect(state.turnNumber).toBe(1);
    });

    it("given malformed sides or counters, when createBattleState is called, then it rejects the invalid state", () => {
      expect(() =>
        createBattleState({
          sides: [createBattleSide({ index: 1 }), createBattleSide({ index: 0 })],
        }),
      ).toThrow("sides must be a [side0, side1] pair with indices 0 and 1");

      expect(() => createBattleState({ turnNumber: 0 })).toThrow("turnNumber must be >= 1");
      expect(() => createBattleState({ fleeAttempts: -1 })).toThrow("fleeAttempts must be >= 0");
      expect(() => createBattleState({ winner: 0 })).toThrow(
        "winner cannot be set before the battle has ended",
      );
    });

    it("given a singles state with multiple active slots on one side, when createBattleState is called, then it rejects the unsupported active layout", () => {
      const first = createOnFieldPokemon(createTestPokemon(6, 50), 0, fireFlyingTypes);
      const second = createOnFieldPokemon(createTestPokemon(9, 50), 1, [CORE_TYPE_IDS.water]);

      expect(() =>
        createBattleState({
          sides: [
            createBattleSide({
              index: 0,
              team: [first.pokemon, second.pokemon],
              active: [first, second],
            }),
            createBattleSide({ index: 1 }),
          ],
        }),
      ).toThrow("singles battle state cannot have more than one active Pokemon per side");
    });
  });

  describe("clonePokemonInstance", () => {
    it("given a pokemon instance with nested mutable fields, when clonePokemonInstance is called, then nested state is copied instead of aliased", () => {
      const original = createTestPokemon(6, 50, {
        ivs: {
          hp: 31,
          attack: 30,
          defense: 29,
          spAttack: 28,
          spDefense: 27,
          speed: 26,
        },
        evs: {
          hp: 4,
          attack: 252,
          defense: 0,
          spAttack: 0,
          spDefense: 0,
          speed: 252,
        },
        megaTypes: [CORE_TYPE_IDS.fire, CORE_TYPE_IDS.dragon],
        teraTypes: [CORE_TYPE_IDS.grass],
        teraOriginalTypes: [CORE_TYPE_IDS.fire, CORE_TYPE_IDS.flying],
        stellarBoostedTypes: [CORE_TYPE_IDS.fire],
        rageFistLastHitTurns: { foe0: 3 },
      });

      const cloned = clonePokemonInstance(original);

      expect(cloned).toEqual(original);
      expect(cloned).not.toBe(original);
      expect(cloned.moves).not.toBe(original.moves);
      expect(cloned.ivs).not.toBe(original.ivs);
      expect(cloned.evs).not.toBe(original.evs);
      expect(cloned.calculatedStats).not.toBe(original.calculatedStats);
      expect(cloned.megaTypes).not.toBe(original.megaTypes);
      expect(cloned.teraTypes).not.toBe(original.teraTypes);
      expect(cloned.teraOriginalTypes).not.toBe(original.teraOriginalTypes);
      expect(cloned.stellarBoostedTypes).not.toBe(original.stellarBoostedTypes);
      expect(cloned.rageFistLastHitTurns).not.toBe(original.rageFistLastHitTurns);

      cloned.moves[0]!.currentPP = 1;
      cloned.evs.hp = 200;
      cloned.teraTypes![0] = CORE_TYPE_IDS.water;
      cloned.rageFistLastHitTurns!.foe0 = 1;

      expect(original.moves[0]!.currentPP).toBe(35);
      expect(original.evs.hp).toBe(4);
      expect(original.teraTypes).toEqual([CORE_TYPE_IDS.grass]);
      expect(original.rageFistLastHitTurns).toEqual({ foe0: 3 });
    });
  });

  describe("createPokemonSnapshot", () => {
    it("given an ActivePokemon, when createPokemonSnapshot is called, then public info is extracted", () => {
      // Arrange
      // Source: the snapshot fixture mirrors the same level-50 Charizard-style test Pokemon used elsewhere.
      const speciesId = 6;
      const level = 50;
      const currentHp = 150;
      const maxHp = 200;
      const pokemon = createTestPokemon(speciesId, level, {
        nickname: "Char",
        currentHp,
        calculatedStats: {
          hp: maxHp,
          attack: 100,
          defense: 100,
          spAttack: 100,
          spDefense: 100,
          speed: 100,
        },
      });
      const active = createOnFieldPokemon(pokemon, 0, fireFlyingTypes);

      // Act
      const snapshot = createPokemonSnapshot(active);

      // Assert
      expect(snapshot.speciesId).toBe(speciesId);
      expect(snapshot.nickname).toBe("Char");
      expect(snapshot.level).toBe(level);
      expect(snapshot.currentHp).toBe(currentHp);
      expect(snapshot.maxHp).toBe(maxHp);
      expect(snapshot.status).toBeNull();
      expect(snapshot.gender).toBe(CORE_GENDERS.male);
      expect(snapshot.isShiny).toBe(false);
    });
  });

  describe("getPokemonName", () => {
    it("given a pokemon with a nickname, when getPokemonName is called, then nickname is returned", () => {
      // Arrange
      const pokemon = createTestPokemon(6, 50, { nickname: "Char" });
      const active = createOnFieldPokemon(pokemon, 0, fireMonotype);

      // Act
      const name = getPokemonName(active);

      // Assert
      expect(name).toBe("Char");
    });

    it("given a pokemon without a nickname, when getPokemonName is called, then species-based fallback is returned", () => {
      // Arrange
      const pokemon = createTestPokemon(6, 50, { nickname: null });
      const active = createOnFieldPokemon(pokemon, 0, fireMonotype);

      // Act
      const name = getPokemonName(active);

      // Assert
      expect(name).toBe("Pokemon #6");
    });
  });
});
