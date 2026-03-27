import type { AbilityContext, ActivePokemon, BattleState } from "@pokemon-lib-ts/battle";
import { BATTLE_ABILITY_EFFECT_TYPES } from "@pokemon-lib-ts/battle";
import {
  CORE_ABILITY_IDS,
  CORE_ABILITY_SLOTS,
  CORE_ABILITY_TRIGGER_IDS,
  CORE_FIXED_POINT,
  CORE_GENDERS,
  CORE_MOVE_EFFECT_TYPES,
  CORE_STAT_IDS,
  CORE_TYPE_IDS,
  createEvs,
  createIvs,
  createMoveSlot,
  createPokemonInstance,
  type MoveCategory,
  type MoveData,
  type PokemonType,
  SeededRandom,
} from "@pokemon-lib-ts/core";
import { describe, expect, it } from "vitest";
import {
  createGen7DataManager,
  GEN7_ABILITY_IDS,
  GEN7_ITEM_IDS,
  GEN7_MOVE_IDS,
  GEN7_NATURE_IDS,
  GEN7_SPECIES_IDS,
  getAteAbilityOverride,
  getTriagePriorityBonus,
  handleGen7DamageCalcAbility,
  handleGen7StatAbility,
  isGaleWingsActive,
  isPranksterBlockedByDarkType,
  PARENTAL_BOND_SECOND_HIT_MULTIPLIER,
} from "../src";

// ---------------------------------------------------------------------------
// Helper factories (same pattern as abilities-damage.test.ts)
// ---------------------------------------------------------------------------

const dataManager = createGen7DataManager();
const abilityIds = { ...CORE_ABILITY_IDS, ...GEN7_ABILITY_IDS } as const;
const itemIds = GEN7_ITEM_IDS;
const moveIds = GEN7_MOVE_IDS;
const natureIds = GEN7_NATURE_IDS;
const speciesIds = GEN7_SPECIES_IDS;
const typeIds = CORE_TYPE_IDS;
const statIds = CORE_STAT_IDS;
const abilityEffectTypeIds = BATTLE_ABILITY_EFFECT_TYPES;
const moveEffectTypeIds = CORE_MOVE_EFFECT_TYPES;
const abilityTriggers = CORE_ABILITY_TRIGGER_IDS;
const NONE_ABILITY = CORE_ABILITY_IDS.none;
const tackle = dataManager.getMove(moveIds.tackle);
const growl = dataManager.getMove(moveIds.growl);
const flamethrower = dataManager.getMove(moveIds.flamethrower);
const drainPunch = dataManager.getMove(moveIds.drainPunch);
const acrobatics = dataManager.getMove(moveIds.acrobatics);
const ATE_ABILITY_MULTIPLIER = CORE_FIXED_POINT.boost12 / CORE_FIXED_POINT.identity;
const ATE_ABILITY_PREVIOUS_GEN_MULTIPLIER = CORE_FIXED_POINT.boost13 / CORE_FIXED_POINT.identity;
const moveCategories = {
  physical: tackle.category,
  special: flamethrower.category,
  status: growl.category,
} as const satisfies Record<MoveCategory, MoveCategory>;
const DEFAULT_NATURE = natureIds.hardy;
const DEFAULT_SPECIES = dataManager.getSpecies(speciesIds.bulbasaur);
const DEFAULT_HP = 200;
const DEFAULT_LEVEL = 50;
const DEFAULT_NICKNAME = null;

function createSyntheticOnFieldPokemon(overrides: {
  level?: number;
  attack?: number;
  defense?: number;
  spAttack?: number;
  spDefense?: number;
  speed?: number;
  hp?: number;
  currentHp?: number;
  types?: PokemonType[];
  ability?: string;
  heldItem?: string | null;
  status?: string | null;
  speciesId?: number;
  nickname?: string | null;
  movedThisTurn?: boolean;
  turnsOnField?: number;
}): ActivePokemon {
  const hp = overrides.hp ?? DEFAULT_HP;
  const attack = overrides.attack ?? 100;
  const defense = overrides.defense ?? 100;
  const spAttack = overrides.spAttack ?? 100;
  const spDefense = overrides.spDefense ?? 100;
  const speed = overrides.speed ?? 100;
  const species = dataManager.getSpecies(overrides.speciesId ?? DEFAULT_SPECIES.id);
  const pokemon = createPokemonInstance(
    species,
    overrides.level ?? DEFAULT_LEVEL,
    new SeededRandom(7),
    {
      nature: DEFAULT_NATURE,
      ivs: createIvs(),
      evs: createEvs(),
      abilitySlot: CORE_ABILITY_SLOTS.normal1,
      gender: CORE_GENDERS.male,
      heldItem: overrides.heldItem ?? null,
      isShiny: false,
      metLocation: "test",
      originalTrainer: "test",
      originalTrainerId: 0,
      pokeball: itemIds.pokeBall,
    },
  );
  pokemon.moves = [createMoveSlot(tackle.id, tackle.pp)];
  pokemon.currentHp = overrides.currentHp ?? hp;
  pokemon.ability = overrides.ability ?? NONE_ABILITY;
  pokemon.heldItem = overrides.heldItem ?? null;
  pokemon.status = (overrides.status ?? null) as any;
  pokemon.nickname = overrides.nickname ?? DEFAULT_NICKNAME;
  pokemon.calculatedStats = { hp, attack, defense, spAttack, spDefense, speed };

  return {
    pokemon,
    teamSlot: 0,
    statStages: {
      attack: 0,
      defense: 0,
      spAttack: 0,
      spDefense: 0,
      speed: 0,
      accuracy: 0,
      evasion: 0,
    },
    volatileStatuses: new Map(),
    types: overrides.types ?? [...species.types],
    ability: overrides.ability ?? NONE_ABILITY,
    lastMoveUsed: null,
    lastDamageTaken: 0,
    lastDamageType: null,
    lastDamageCategory: null,
    turnsOnField: overrides.turnsOnField ?? 0,
    movedThisTurn: overrides.movedThisTurn ?? false,
    consecutiveProtects: 0,
    substituteHp: 0,
    itemKnockedOff: false,
    transformed: false,
    transformedSpecies: null,
    isMega: false,
    isDynamaxed: false,
    dynamaxTurnsLeft: 0,
    isTerastallized: false,
    teraType: null,
    stellarBoostedTypes: [],
    suppressedAbility: null,
    forcedMove: null,
  } as ActivePokemon;
}

function createSyntheticBattleState(): BattleState {
  return {
    weather: null,
    terrain: null,
    trickRoom: { active: false, turnsLeft: 0 },
    magicRoom: { active: false, turnsLeft: 0 },
    wonderRoom: { active: false, turnsLeft: 0 },
    gravity: { active: false, turnsLeft: 0 },
    format: "singles",
    generation: 7,
    turnNumber: 1,
    sides: [{}, {}],
  } as unknown as BattleState;
}

function createSyntheticAbilityContext(overrides: {
  ability: string;
  trigger:
    | typeof abilityTriggers.onDamageCalc
    | abilityTriggers.onPriorityCheck
    | abilityTriggers.onAfterMoveUsed
    | abilityTriggers.onDamageTaken
    | abilityTriggers.onTurnEnd
    | abilityTriggers.onFlinch
    | abilityTriggers.onStatChange;
  move?: MoveData;
  currentHp?: number;
  maxHp?: number;
  types?: PokemonType[];
  nickname?: string | null;
  opponent?: ActivePokemon;
  attack?: number;
  defense?: number;
  spAttack?: number;
  spDefense?: number;
  speed?: number;
  turnsOnField?: number;
}): AbilityContext {
  const hp = overrides.maxHp ?? DEFAULT_HP;
  return {
    pokemon: createSyntheticOnFieldPokemon({
      ability: overrides.ability,
      currentHp: overrides.currentHp ?? hp,
      hp: hp,
      types: overrides.types ?? [typeIds.normal],
      nickname: overrides.nickname ?? DEFAULT_NICKNAME,
      attack: overrides.attack,
      defense: overrides.defense,
      spAttack: overrides.spAttack,
      spDefense: overrides.spDefense,
      speed: overrides.speed,
      turnsOnField: overrides.turnsOnField,
    }),
    opponent: overrides.opponent ?? createSyntheticOnFieldPokemon({}),
    state: createSyntheticBattleState(),
    rng: new SeededRandom(42),
    trigger: overrides.trigger,
    move: overrides.move,
  };
}

// ===========================================================================
// Gen 7 Ability Nerfs -- tests that verify Gen 7-specific changes from Gen 6
// ===========================================================================

describe("Gen 7 Ability Nerfs", () => {
  // -----------------------------------------------------------------------
  // Pixilate / -ate nerf: 1.2x (was 1.3x in Gen 6)
  // -----------------------------------------------------------------------

  describe("-ate Abilities: 1.2x nerf (was 1.3x in Gen 6)", () => {
    it("given Pixilate in Gen 7, when converting Normal move, then multiplier matches the Gen 7 owned boost and not the Gen 6 one", () => {
      // Source: Showdown data/abilities.ts -- Gen 7 pixilate: chainModify([CORE_FIXED_POINT.boost12, CORE_FIXED_POINT.identity])
      // Source: Showdown data/mods/gen6/abilities.ts -- Gen 6 pixilate: chainModify([CORE_FIXED_POINT.boost13, CORE_FIXED_POINT.identity])
      // Source: Bulbapedia "Pixilate" -- "From Generation VII onward, the power bonus was reduced from 1.3x to 1.2x."
      const override = getAteAbilityOverride(abilityIds.pixilate, typeIds.normal);
      expect(override).not.toBeNull();
      expect(override!.multiplier).toBe(ATE_ABILITY_MULTIPLIER);
      // Verify it is NOT the Gen 6 value
      expect(override!.multiplier).not.toBe(ATE_ABILITY_PREVIOUS_GEN_MULTIPLIER);
    });

    it("given Aerilate in Gen 7, when converting Normal move, then multiplier matches the Gen 7 owned boost", () => {
      // Source: Showdown data/abilities.ts -- Gen 7 aerilate: same as pixilate
      const override = getAteAbilityOverride(abilityIds.aerilate, typeIds.normal);
      expect(override).not.toBeNull();
      expect(override!.multiplier).toBe(ATE_ABILITY_MULTIPLIER);
    });

    it("given Refrigerate in Gen 7, when converting Normal move, then multiplier matches the Gen 7 owned boost", () => {
      // Source: Showdown data/abilities.ts -- Gen 7 refrigerate: same as pixilate
      const override = getAteAbilityOverride(abilityIds.refrigerate, typeIds.normal);
      expect(override).not.toBeNull();
      expect(override!.multiplier).toBe(ATE_ABILITY_MULTIPLIER);
    });

    it("given Galvanize (new Gen 7), when converting Normal move, then multiplier matches the Gen 7 owned boost", () => {
      // Source: Showdown data/abilities.ts -- galvanize: Normal -> Electric, chainModify([CORE_FIXED_POINT.boost12, CORE_FIXED_POINT.identity])
      // Source: Bulbapedia "Galvanize" -- "introduced in Gen 7, 1.2x power bonus"
      const override = getAteAbilityOverride(abilityIds.galvanize, typeIds.normal);
      expect(override).not.toBeNull();
      expect(override!.type).toBe(typeIds.electric);
      expect(override!.multiplier).toBe(ATE_ABILITY_MULTIPLIER);
    });

    it("given Pixilate handler with Normal move, when on-damage-calc triggers, then activated:true with type-change to fairy", () => {
      // Source: Showdown data/abilities.ts -- pixilate: Normal -> Fairy
      const ctx = createSyntheticAbilityContext({
        ability: abilityIds.pixilate,
        trigger: abilityTriggers.onDamageCalc,
        move: tackle,
      });
      const result = handleGen7DamageCalcAbility(ctx);
      expect(result.activated).toBe(true);
      expect(result.effects[0].effectType).toBe(abilityEffectTypeIds.typeChange);
      if (result.effects[0].effectType === abilityEffectTypeIds.typeChange) {
        expect(result.effects[0].types).toEqual([typeIds.fairy]);
      }
    });
  });

  // -----------------------------------------------------------------------
  // Parental Bond nerf: 0.25x second hit (was 0.5x in Gen 6)
  // -----------------------------------------------------------------------

  describe("Parental Bond: 0.25x second hit (was 0.5x in Gen 6)", () => {
    it("given Gen 7 Parental Bond, then second-hit multiplier constant is 0.25", () => {
      // Source: Showdown data/abilities.ts -- Gen 7 parentalbond: secondHit 0.25
      // Source: Bulbapedia "Parental Bond" -- "nerfed from 50% to 25% in Generation VII"
      expect(PARENTAL_BOND_SECOND_HIT_MULTIPLIER).toBe(0.25);
    });

    it("given Gen 7 Parental Bond, then second-hit multiplier is NOT 0.5 (Gen 6 value)", () => {
      // Source: Showdown data/mods/gen6/abilities.ts -- Gen 6 parentalbond: secondHit 0.5
      expect(PARENTAL_BOND_SECOND_HIT_MULTIPLIER).not.toBe(0.5);
    });

    it("given Gen 7 Parental Bond, then second hit deals exactly 25% of the first hit", () => {
      // Source: Showdown data/abilities.ts -- Gen 7 parentalbond
      // For a first hit dealing 100 damage, the second hit is 25.
      const firstHitDamage = 100;
      const secondHitDamage = Math.floor(firstHitDamage * PARENTAL_BOND_SECOND_HIT_MULTIPLIER);
      expect(secondHitDamage).toBe(25);
    });
  });

  // -----------------------------------------------------------------------
  // Prankster: fails vs Dark-type (NEW in Gen 7)
  // -----------------------------------------------------------------------

  describe("Prankster: status moves fail vs Dark-type target (new in Gen 7)", () => {
    it("given Prankster user using a status move vs Dark-type, then isPranksterBlockedByDarkType returns true", () => {
      // Source: Showdown data/abilities.ts -- Prankster Gen 7: dark targets immune to boosted status
      // Source: Bulbapedia "Prankster" Gen 7 -- "status moves fail against Dark-type targets"
      expect(
        isPranksterBlockedByDarkType(
          abilityIds.prankster,
          moveCategories.status,
          [typeIds.dark],
          growl.target,
        ),
      ).toBe(true);
    });

    it("given Prankster user using a status move vs Dark/Fairy-type, then blocked (partial Dark typing)", () => {
      // Source: Showdown data/abilities.ts -- checks if target has Dark type
      expect(
        isPranksterBlockedByDarkType(
          abilityIds.prankster,
          moveCategories.status,
          [typeIds.dark, typeIds.fairy],
          growl.target,
        ),
      ).toBe(true);
    });

    it("given Prankster user using a physical move vs Dark-type, then NOT blocked (non-status)", () => {
      // Source: Showdown data/abilities.ts -- only status moves are blocked
      expect(
        isPranksterBlockedByDarkType(
          abilityIds.prankster,
          moveCategories.physical,
          [typeIds.dark],
          tackle.target,
        ),
      ).toBe(false);
    });

    it("given Prankster user using a special move vs Dark-type, then NOT blocked (non-status)", () => {
      // Source: Showdown data/abilities.ts -- only status moves are blocked
      expect(
        isPranksterBlockedByDarkType(
          abilityIds.prankster,
          moveCategories.special,
          [typeIds.dark],
          flamethrower.target,
        ),
      ).toBe(false);
    });

    it("given Prankster user using a status move vs Normal-type, then NOT blocked (non-Dark)", () => {
      // Source: Showdown data/abilities.ts -- only Dark-type targets
      expect(
        isPranksterBlockedByDarkType(
          abilityIds.prankster,
          moveCategories.status,
          [typeIds.normal],
          growl.target,
        ),
      ).toBe(false);
    });

    it("given non-Prankster ability using status move vs Dark-type, then NOT blocked", () => {
      // Only Prankster triggers this check
      expect(
        isPranksterBlockedByDarkType(
          abilityIds.keenEye,
          moveCategories.status,
          [typeIds.dark],
          growl.target,
        ),
      ).toBe(false);
    });

    it("given Prankster user using a self-targeting status move vs Dark-type, then NOT blocked", () => {
      // Source: Showdown data/abilities.ts -- Dark-type immunity only applies to opposing-Pokemon targets.
      const agility = dataManager.getMove(moveIds.agility);
      expect(
        isPranksterBlockedByDarkType(
          abilityIds.prankster,
          agility.category,
          [typeIds.dark],
          agility.target,
        ),
      ).toBe(false);
    });

    it("given Prankster handler on-priority-check with status move, then returns activated:true (priority still granted)", () => {
      // Source: Showdown data/abilities.ts -- Prankster DOES grant priority; the immunity
      // is a separate check during move execution. The move gains priority but then fails.
      const ctx = createSyntheticAbilityContext({
        ability: abilityIds.prankster,
        trigger: abilityTriggers.onPriorityCheck,
        move: growl,
      });
      const result = handleGen7StatAbility(ctx);
      expect(result.activated).toBe(true);
      expect(result.messages[0]).toContain("Prankster");
    });
  });

  // -----------------------------------------------------------------------
  // Gale Wings: only at full HP (was unconditional in Gen 6)
  // -----------------------------------------------------------------------

  describe("Gale Wings: no priority below full HP (new nerf in Gen 7)", () => {
    it("given Gale Wings at full HP with Flying move, then isGaleWingsActive returns true", () => {
      // Source: Showdown data/abilities.ts -- galeWings Gen 7: hp === maxhp
      // Source: Bulbapedia "Gale Wings" Gen 7 -- "only activates when at full HP"
      expect(isGaleWingsActive(abilityIds.galeWings, typeIds.flying, DEFAULT_HP, DEFAULT_HP)).toBe(
        true,
      );
    });

    it("given Gale Wings at 199/200 HP with Flying move, then isGaleWingsActive returns false", () => {
      // Source: Showdown data/abilities.ts -- galeWings: strictly requires full HP
      // This is the key Gen 7 nerf: even 1 HP of damage disables Gale Wings.
      expect(isGaleWingsActive(abilityIds.galeWings, typeIds.flying, 199, DEFAULT_HP)).toBe(false);
    });

    it("given Gale Wings at 1/200 HP with Flying move, then isGaleWingsActive returns false", () => {
      // Source: Showdown data/abilities.ts -- galeWings: hp < maxhp -> no boost
      expect(isGaleWingsActive(abilityIds.galeWings, typeIds.flying, 1, DEFAULT_HP)).toBe(false);
    });

    it("given Gale Wings at full HP with non-Flying move, then isGaleWingsActive returns false", () => {
      // Source: Showdown data/abilities.ts -- galeWings: only Flying-type moves
      expect(isGaleWingsActive(abilityIds.galeWings, typeIds.fire, DEFAULT_HP, DEFAULT_HP)).toBe(
        false,
      );
    });

    it("given Gale Wings handler at full HP with Flying move on-priority-check, then activated:true", () => {
      // Source: Showdown data/abilities.ts -- galeWings: onModifyPriority +1
      const ctx = createSyntheticAbilityContext({
        ability: abilityIds.galeWings,
        trigger: abilityTriggers.onPriorityCheck,
        move: acrobatics,
        currentHp: DEFAULT_HP,
        maxHp: DEFAULT_HP,
      });
      const result = handleGen7StatAbility(ctx);
      expect(result.activated).toBe(true);
      expect(result.messages[0]).toContain("Gale Wings");
    });

    it("given Gale Wings handler below full HP with Flying move on-priority-check, then activated:false", () => {
      // Source: Showdown data/abilities.ts -- galeWings: Gen 7 hp check
      // The Gen 7 nerf: priority is NOT granted when below full HP.
      const ctx = createSyntheticAbilityContext({
        ability: abilityIds.galeWings,
        trigger: abilityTriggers.onPriorityCheck,
        move: acrobatics,
        currentHp: 150,
        maxHp: DEFAULT_HP,
      });
      const result = handleGen7StatAbility(ctx);
      expect(result.activated).toBe(false);
    });
  });

  // -----------------------------------------------------------------------
  // Beast Boost: triggers on KO, raises highest stat (NEW in Gen 7)
  // -----------------------------------------------------------------------

  describe("Beast Boost: +1 highest stat on KO (new in Gen 7)", () => {
    it("given Beast Boost user KOs opponent with Attack as highest stat, then raises Attack by 1", () => {
      // Source: Showdown data/abilities.ts -- beastboost: onSourceAfterFaint
      // Source: Bulbapedia "Beast Boost" -- "raises the user's highest stat by one stage"
      const ctx = createSyntheticAbilityContext({
        ability: abilityIds.beastBoost,
        trigger: abilityTriggers.onAfterMoveUsed,
        attack: 150,
        defense: 100,
        spAttack: 100,
        spDefense: 100,
        speed: 100,
        opponent: createSyntheticOnFieldPokemon({ currentHp: 0, hp: DEFAULT_HP }),
      });
      const result = handleGen7StatAbility(ctx);
      expect(result.activated).toBe(true);
      expect(result.effects).toHaveLength(1);
      expect(result.effects[0].effectType).toBe(abilityEffectTypeIds.statChange);
      if (result.effects[0].effectType === abilityEffectTypeIds.statChange) {
        expect(result.effects[0].stat).toBe(statIds.attack);
        expect(result.effects[0].stages).toBe(1);
      }
    });

    it("given Beast Boost user KOs opponent with Speed as highest stat, then raises Speed by 1", () => {
      // Source: Showdown data/abilities.ts -- beastboost: picks highest stat
      const ctx = createSyntheticAbilityContext({
        ability: abilityIds.beastBoost,
        trigger: abilityTriggers.onAfterMoveUsed,
        attack: 100,
        defense: 100,
        spAttack: 100,
        spDefense: 100,
        speed: 180,
        opponent: createSyntheticOnFieldPokemon({ currentHp: 0, hp: DEFAULT_HP }),
      });
      const result = handleGen7StatAbility(ctx);
      expect(result.activated).toBe(true);
      if (result.effects[0].effectType === abilityEffectTypeIds.statChange) {
        expect(result.effects[0].stat).toBe(statIds.speed);
        expect(result.effects[0].stages).toBe(1);
      }
    });

    it("given Beast Boost user KOs opponent with SpAtk as highest stat, then raises SpAtk by 1", () => {
      // Source: Showdown data/abilities.ts -- beastboost: checks spa
      const ctx = createSyntheticAbilityContext({
        ability: abilityIds.beastBoost,
        trigger: abilityTriggers.onAfterMoveUsed,
        attack: 90,
        defense: 90,
        spAttack: 200,
        spDefense: 90,
        speed: 90,
        opponent: createSyntheticOnFieldPokemon({ currentHp: 0, hp: DEFAULT_HP }),
      });
      const result = handleGen7StatAbility(ctx);
      expect(result.activated).toBe(true);
      if (result.effects[0].effectType === abilityEffectTypeIds.statChange) {
        expect(result.effects[0].stat).toBe(statIds.spAttack);
        expect(result.effects[0].stages).toBe(1);
      }
    });

    it("given Beast Boost user with all stats equal, then raises Attack (tie-break priority: Atk first)", () => {
      // Source: Showdown data/abilities.ts -- beastboost: iteration order is atk, def, spa, spd, spe
      // When all stats are equal, Attack wins because it is checked first and no subsequent
      // stat is strictly greater.
      const ctx = createSyntheticAbilityContext({
        ability: abilityIds.beastBoost,
        trigger: abilityTriggers.onAfterMoveUsed,
        attack: 100,
        defense: 100,
        spAttack: 100,
        spDefense: 100,
        speed: 100,
        opponent: createSyntheticOnFieldPokemon({ currentHp: 0, hp: DEFAULT_HP }),
      });
      const result = handleGen7StatAbility(ctx);
      expect(result.activated).toBe(true);
      if (result.effects[0].effectType === abilityEffectTypeIds.statChange) {
        expect(result.effects[0].stat).toBe(statIds.attack);
      }
    });

    it("given Beast Boost user when opponent is NOT fainted, then activated:false", () => {
      // Source: Showdown data/abilities.ts -- beastboost: only on faint
      const ctx = createSyntheticAbilityContext({
        ability: abilityIds.beastBoost,
        trigger: abilityTriggers.onAfterMoveUsed,
        attack: 150,
        opponent: createSyntheticOnFieldPokemon({ currentHp: 100, hp: DEFAULT_HP }),
      });
      const result = handleGen7StatAbility(ctx);
      expect(result.activated).toBe(false);
    });

    it("given Beast Boost, then message includes the stat name", () => {
      // Source: Showdown battle-actions.ts -- boost messages
      const ctx = createSyntheticAbilityContext({
        ability: abilityIds.beastBoost,
        trigger: abilityTriggers.onAfterMoveUsed,
        nickname: "Pheromosa",
        attack: 100,
        defense: 100,
        spAttack: 100,
        spDefense: 100,
        speed: 200,
        opponent: createSyntheticOnFieldPokemon({ currentHp: 0, hp: DEFAULT_HP }),
      });
      const result = handleGen7StatAbility(ctx);
      expect(result.messages[0]).toContain("Beast Boost");
      expect(result.messages[0]).toContain("Speed");
    });
  });

  // -----------------------------------------------------------------------
  // Stamina: +1 Def on each hit (NEW in Gen 7)
  // -----------------------------------------------------------------------

  describe("Stamina: +1 Def on each damaging hit (new in Gen 7)", () => {
    it("given Stamina user hit by a physical move, then raises Defense by 1", () => {
      // Source: Showdown data/abilities.ts -- Stamina onDamagingHit
      // Source: Bulbapedia "Stamina" -- "+1 Defense when hit by a damage-dealing move"
      const ctx = createSyntheticAbilityContext({
        ability: abilityIds.stamina,
        trigger: abilityTriggers.onDamageTaken,
        move: tackle,
      });
      const result = handleGen7StatAbility(ctx);
      expect(result.activated).toBe(true);
      expect(result.effects).toHaveLength(1);
      expect(result.effects[0].effectType).toBe(abilityEffectTypeIds.statChange);
      if (result.effects[0].effectType === abilityEffectTypeIds.statChange) {
        expect(result.effects[0].stat).toBe(statIds.defense);
        expect(result.effects[0].stages).toBe(1);
      }
    });

    it("given Stamina user hit by a special move, then raises Defense by 1 (triggers on all damaging moves)", () => {
      // Source: Showdown data/abilities.ts -- Stamina: triggers on both physical and special
      const ctx = createSyntheticAbilityContext({
        ability: abilityIds.stamina,
        trigger: abilityTriggers.onDamageTaken,
        move: flamethrower,
      });
      const result = handleGen7StatAbility(ctx);
      expect(result.activated).toBe(true);
      if (result.effects[0].effectType === abilityEffectTypeIds.statChange) {
        expect(result.effects[0].stat).toBe(statIds.defense);
        expect(result.effects[0].stages).toBe(1);
      }
    });

    it("given Stamina user hit by a status move, then activated:false (status moves don't trigger)", () => {
      // Source: Showdown data/abilities.ts -- Stamina: only damaging moves
      const ctx = createSyntheticAbilityContext({
        ability: abilityIds.stamina,
        trigger: abilityTriggers.onDamageTaken,
        move: growl,
      });
      const result = handleGen7StatAbility(ctx);
      expect(result.activated).toBe(false);
    });

    it("given Stamina, then message mentions Stamina and Defense", () => {
      // Source: Showdown battle-actions.ts -- ability activation messages
      const ctx = createSyntheticAbilityContext({
        ability: abilityIds.stamina,
        trigger: abilityTriggers.onDamageTaken,
        nickname: "Mudsdale",
        move: tackle,
      });
      const result = handleGen7StatAbility(ctx);
      expect(result.messages[0]).toContain("Stamina");
      expect(result.messages[0]).toContain("Defense");
    });
  });

  // -----------------------------------------------------------------------
  // Weak Armor: +2 Speed in Gen 7 (was +1 in Gen 5-6)
  // -----------------------------------------------------------------------

  describe("Weak Armor: +2 Speed in Gen 7 (was +1 in Gen 5-6)", () => {
    it("given Weak Armor user hit by physical move in Gen 7, then -1 Def and +2 Speed", () => {
      // Source: Showdown data/abilities.ts -- Weak Armor Gen 7: spe +2
      // Source: Showdown data/mods/gen6/abilities.ts -- Weak Armor Gen 5-6: spe +1
      // Source: Bulbapedia "Weak Armor" -- "From Generation VII onwards, Speed is raised by 2"
      const ctx = createSyntheticAbilityContext({
        ability: abilityIds.weakArmor,
        trigger: abilityTriggers.onDamageTaken,
        move: tackle,
      });
      const result = handleGen7StatAbility(ctx);
      expect(result.activated).toBe(true);
      expect(result.effects).toHaveLength(2);

      // First effect: -1 Defense
      expect(result.effects[0].effectType).toBe(abilityEffectTypeIds.statChange);
      if (result.effects[0].effectType === abilityEffectTypeIds.statChange) {
        expect(result.effects[0].stat).toBe(statIds.defense);
        expect(result.effects[0].stages).toBe(-1);
      }

      // Second effect: +2 Speed (NOT +1 like Gen 5-6)
      expect(result.effects[1].effectType).toBe(abilityEffectTypeIds.statChange);
      if (result.effects[1].effectType === abilityEffectTypeIds.statChange) {
        expect(result.effects[1].stat).toBe(statIds.speed);
        expect(result.effects[1].stages).toBe(2);
      }
    });

    it("given Weak Armor user hit by special move, then activated:false (physical only)", () => {
      // Source: Showdown data/abilities.ts -- Weak Armor: only physical moves
      const ctx = createSyntheticAbilityContext({
        ability: abilityIds.weakArmor,
        trigger: abilityTriggers.onDamageTaken,
        move: flamethrower,
      });
      const result = handleGen7StatAbility(ctx);
      expect(result.activated).toBe(false);
    });
  });

  // -----------------------------------------------------------------------
  // Triage: +3 priority to healing moves (NEW in Gen 7)
  // -----------------------------------------------------------------------

  describe("Triage: +3 priority to healing moves (new in Gen 7)", () => {
    it("given Triage with Drain Punch, then priority bonus is +3", () => {
      // Source: Showdown data/abilities.ts -- triage: onModifyPriority +3
      // Source: Bulbapedia "Triage" -- "+3 priority to healing moves"
      expect(
        getTriagePriorityBonus(abilityIds.triage, moveIds.drainPunch, moveEffectTypeIds.drain),
      ).toBe(3);
    });

    it("given Triage with Roost (recovery move), then priority bonus is +3", () => {
      // Source: Showdown data/abilities.ts -- triage: includes recovery moves
      expect(getTriagePriorityBonus(abilityIds.triage, moveIds.roost, null)).toBe(3);
    });

    it("given Triage with Giga Drain, then priority bonus is +3", () => {
      // Source: Showdown data/abilities.ts -- triage: drain moves
      expect(
        getTriagePriorityBonus(abilityIds.triage, moveIds.gigaDrain, moveEffectTypeIds.drain),
      ).toBe(3);
    });

    it("given Triage with Floral Healing (Gen 7 move), then priority bonus is +3", () => {
      // Source: Showdown data/abilities.ts -- triage: includes Floral Healing
      expect(getTriagePriorityBonus(abilityIds.triage, moveIds.floralHealing, null)).toBe(3);
    });

    it("given Triage with Tackle (non-healing move), then priority bonus is 0", () => {
      // Source: Showdown data/abilities.ts -- triage: only healing moves get bonus
      expect(getTriagePriorityBonus(abilityIds.triage, moveIds.tackle, null)).toBe(0);
    });

    it("given non-Triage ability with healing move, then priority bonus is 0", () => {
      // Only Triage provides this bonus
      expect(
        getTriagePriorityBonus(
          abilityIds.adaptability,
          moveIds.drainPunch,
          moveEffectTypeIds.drain,
        ),
      ).toBe(0);
    });

    it("given Triage handler on-priority-check with healing move, then activated:true", () => {
      // Source: Showdown data/abilities.ts -- triage: onModifyPriority
      const ctx = createSyntheticAbilityContext({
        ability: abilityIds.triage,
        trigger: abilityTriggers.onPriorityCheck,
        move: drainPunch,
      });
      const result = handleGen7StatAbility(ctx);
      expect(result.activated).toBe(true);
      expect(result.messages[0]).toContain("Triage");
    });
  });
});
