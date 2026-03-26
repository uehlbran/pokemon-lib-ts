import type { AbilityContext, ActivePokemon, BattleState } from "@pokemon-lib-ts/battle";
import type { MoveData, MoveEffect, PokemonType } from "@pokemon-lib-ts/core";
import {
  CORE_ABILITY_IDS,
  CORE_ABILITY_SLOTS,
  CORE_ABILITY_TRIGGER_IDS,
  CORE_GENDERS,
  CORE_MOVE_IDS,
  CORE_STATUS_IDS,
  CORE_TYPE_IDS,
  createEvs,
  createIvs,
  createPokemonInstance,
  SeededRandom,
} from "@pokemon-lib-ts/core";
import { describe, expect, it } from "vitest";
import {
  createGen6DataManager,
  GEN6_ABILITY_IDS,
  GEN6_ITEM_IDS,
  GEN6_MOVE_IDS,
  GEN6_NATURE_IDS,
  GEN6_SPECIES_IDS,
} from "../src";
import {
  getAteAbilityOverride,
  getFurCoatMultiplier,
  getMegaLauncherMultiplier,
  getMultiscaleMultiplier,
  getSheerForceMultiplier,
  getStrongJawMultiplier,
  getSturdyDamageCap,
  getToughClawsMultiplier,
  handleGen6DamageCalcAbility,
  handleGen6DamageImmunityAbility,
  isParentalBondEligible,
  isSheerForceEligibleMove,
  isSheerForceWhitelistedMove,
  PARENTAL_BOND_SECOND_HIT_MULTIPLIER,
  sturdyBlocksOHKO,
} from "../src/Gen6AbilitiesDamage";

// ---------------------------------------------------------------------------
// Helper factories
// ---------------------------------------------------------------------------

const dataManager = createGen6DataManager();
const DEFAULT_MOVE = dataManager.getMove(CORE_MOVE_IDS.tackle);
const DEFAULT_SPECIES_ID = GEN6_SPECIES_IDS.bulbasaur;
const DEFAULT_NATURE_ID = GEN6_NATURE_IDS.hardy;

function createOnFieldPokemonFixture(
  overrides: {
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
  } = {},
): ActivePokemon {
  const species = dataManager.getSpecies(overrides.speciesId ?? DEFAULT_SPECIES_ID);
  const hp = overrides.hp ?? 200;
  const attack = overrides.attack ?? 100;
  const defense = overrides.defense ?? 100;
  const spAttack = overrides.spAttack ?? 100;
  const spDefense = overrides.spDefense ?? 100;
  const speed = overrides.speed ?? 100;
  const pokemon = createPokemonInstance(
    species,
    overrides.level ?? 50,
    new SeededRandom(species.id),
    {
      nature: DEFAULT_NATURE_ID,
      ivs: createIvs(),
      evs: createEvs(),
      abilitySlot: CORE_ABILITY_SLOTS.normal1,
      gender: species.genderRatio === -1 ? CORE_GENDERS.genderless : CORE_GENDERS.male,
      heldItem: overrides.heldItem ?? null,
      friendship: species.baseFriendship,
      metLocation: "test",
      originalTrainer: "Test",
      originalTrainerId: 0,
      pokeball: GEN6_ITEM_IDS.pokeBall,
      moves: [],
      nickname: overrides.nickname ?? null,
    },
  );

  pokemon.currentHp = overrides.currentHp ?? hp;
  pokemon.ability = overrides.ability ?? CORE_ABILITY_IDS.none;
  pokemon.status = (overrides.status ?? null) as any;
  pokemon.heldItem = overrides.heldItem ?? null;
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
    types: overrides.types ?? [CORE_TYPE_IDS.normal],
    ability: overrides.ability ?? CORE_ABILITY_IDS.none,
    lastMoveUsed: null,
    lastDamageTaken: 0,
    lastDamageType: null,
    lastDamageCategory: null,
    turnsOnField: 0,
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

function createMoveFixture(moveId = DEFAULT_MOVE.id, overrides: Partial<MoveData> = {}): MoveData {
  const baseMove = dataManager.getMove(moveId);
  return {
    ...baseMove,
    ...overrides,
    flags: {
      ...baseMove.flags,
      ...overrides.flags,
    },
  } as MoveData;
}

function createBattleStateFixture(overrides?: {
  weather?: { type: string; turnsLeft: number; source: string } | null;
}): BattleState {
  return {
    weather: overrides?.weather ?? null,
    terrain: null,
    trickRoom: { active: false, turnsLeft: 0 },
    magicRoom: { active: false, turnsLeft: 0 },
    wonderRoom: { active: false, turnsLeft: 0 },
    gravity: { active: false, turnsLeft: 0 },
    format: "singles",
    generation: 6,
    turnNumber: 1,
    sides: [{}, {}],
  } as unknown as BattleState;
}

function createAbilityContextFixture(overrides: {
  pokemon?: ActivePokemon;
  opponent?: ActivePokemon;
  move?: MoveData;
  state?: BattleState;
  damage?: number;
}): AbilityContext {
  return {
    pokemon: overrides.pokemon ?? createOnFieldPokemonFixture({}),
    opponent: overrides.opponent ?? createOnFieldPokemonFixture({}),
    state: overrides.state ?? createBattleStateFixture(),
    rng: new SeededRandom(42),
    trigger: CORE_ABILITY_TRIGGER_IDS.onDamageCalc,
    move: overrides.move ?? createMoveFixture(),
    damage: overrides.damage,
  };
}

// ===========================================================================
// Tough Claws (NEW Gen 6)
// ===========================================================================

describe("Tough Claws", () => {
  it("given Tough Claws + contact move (Tackle), when checking damage-calc, then activates with boost", () => {
    // Source: Bulbapedia "Tough Claws" Gen 6 -- 1.3x contact moves
    // Source: Showdown data/abilities.ts -- toughclaws: move.flags['contact'], chainModify([5325, 4096])
    const ctx = createAbilityContextFixture({
      pokemon: createOnFieldPokemonFixture({ ability: GEN6_ABILITY_IDS.toughClaws }),
      move: createMoveFixture(CORE_MOVE_IDS.tackle),
    });
    const result = handleGen6DamageCalcAbility(ctx);
    expect(result.activated).toBe(true);
  });

  it("given Tough Claws + non-contact move (Flamethrower), when checking damage-calc, then does not activate", () => {
    // Source: Bulbapedia "Tough Claws" Gen 6 -- only contact moves
    const ctx = createAbilityContextFixture({
      pokemon: createOnFieldPokemonFixture({ ability: GEN6_ABILITY_IDS.toughClaws }),
      move: createMoveFixture(CORE_MOVE_IDS.flamethrower),
    });
    const result = handleGen6DamageCalcAbility(ctx);
    expect(result.activated).toBe(false);
  });

  it("given Tough Claws utility, when computing multiplier for contact move, then returns 5325/4096", () => {
    // Source: Showdown data/abilities.ts -- toughclaws: chainModify([5325, 4096]) = ~1.3x
    expect(getToughClawsMultiplier(GEN6_ABILITY_IDS.toughClaws, true)).toBeCloseTo(5325 / 4096, 10);
  });

  it("given Tough Claws utility, when computing multiplier for non-contact move, then returns 1", () => {
    // Source: Showdown data/abilities.ts -- only contact moves are boosted
    expect(getToughClawsMultiplier(GEN6_ABILITY_IDS.toughClaws, false)).toBe(1);
  });
});

// ===========================================================================
// Strong Jaw (NEW Gen 6)
// ===========================================================================

describe("Strong Jaw", () => {
  it("given Strong Jaw + Crunch (bite move), when checking damage-calc, then activates", () => {
    // Source: Bulbapedia "Strong Jaw" Gen 6 -- boosts bite moves by 50%
    // Source: Showdown data/abilities.ts -- strongjaw: move.flags['bite']
    const ctx = createAbilityContextFixture({
      pokemon: createOnFieldPokemonFixture({ ability: GEN6_ABILITY_IDS.strongJaw }),
      move: createMoveFixture(GEN6_MOVE_IDS.crunch),
    });
    const result = handleGen6DamageCalcAbility(ctx);
    expect(result.activated).toBe(true);
  });

  it("given Strong Jaw + non-bite move (Tackle), when checking damage-calc, then does not activate", () => {
    // Source: Bulbapedia "Strong Jaw" -- only bite moves are boosted
    const ctx = createAbilityContextFixture({
      pokemon: createOnFieldPokemonFixture({ ability: GEN6_ABILITY_IDS.strongJaw }),
      move: createMoveFixture(CORE_MOVE_IDS.tackle),
    });
    const result = handleGen6DamageCalcAbility(ctx);
    expect(result.activated).toBe(false);
  });

  it("given Strong Jaw utility, when computing multiplier for bite move, then returns 1.5", () => {
    // Source: Showdown data/abilities.ts -- strongjaw: chainModify(1.5)
    expect(getStrongJawMultiplier(GEN6_ABILITY_IDS.strongJaw, true)).toBe(1.5);
  });

  it("given Strong Jaw utility, when computing multiplier for non-bite move, then returns 1", () => {
    // Source: Showdown -- only bite moves are affected
    expect(getStrongJawMultiplier(GEN6_ABILITY_IDS.strongJaw, false)).toBe(1);
  });
});

// ===========================================================================
// Mega Launcher (NEW Gen 6)
// ===========================================================================

describe("Mega Launcher", () => {
  it("given Mega Launcher + Aura Sphere (pulse move), when checking damage-calc, then activates", () => {
    // Source: Bulbapedia "Mega Launcher" Gen 6 -- boosts pulse/aura moves by 50%
    // Source: Showdown data/abilities.ts -- megalauncher: move.flags['pulse']
    const ctx = createAbilityContextFixture({
      pokemon: createOnFieldPokemonFixture({ ability: GEN6_ABILITY_IDS.megaLauncher }),
      move: createMoveFixture(GEN6_MOVE_IDS.auraSphere),
    });
    const result = handleGen6DamageCalcAbility(ctx);
    expect(result.activated).toBe(true);
  });

  it("given Mega Launcher + non-pulse move (Tackle), when checking damage-calc, then does not activate", () => {
    // Source: Bulbapedia "Mega Launcher" -- only pulse/aura moves
    const ctx = createAbilityContextFixture({
      pokemon: createOnFieldPokemonFixture({ ability: GEN6_ABILITY_IDS.megaLauncher }),
      move: createMoveFixture(CORE_MOVE_IDS.tackle),
    });
    const result = handleGen6DamageCalcAbility(ctx);
    expect(result.activated).toBe(false);
  });

  it("given Mega Launcher utility, when computing multiplier for pulse move, then returns 1.5", () => {
    // Source: Showdown data/abilities.ts -- megalauncher: chainModify(1.5)
    expect(getMegaLauncherMultiplier(GEN6_ABILITY_IDS.megaLauncher, true)).toBe(1.5);
  });

  it("given Mega Launcher utility, when computing multiplier for non-pulse move, then returns 1", () => {
    // Source: Showdown -- only pulse moves affected
    expect(getMegaLauncherMultiplier(GEN6_ABILITY_IDS.megaLauncher, false)).toBe(1);
  });
});

// ===========================================================================
// Fur Coat (NEW Gen 6 -- Defender)
// ===========================================================================

describe("Fur Coat", () => {
  it("given Fur Coat defender + physical move, when checking damage-calc, then activates", () => {
    // Source: Bulbapedia "Fur Coat" Gen 6 -- doubles Defense against physical attacks
    // Source: Showdown data/abilities.ts -- furcoat: onModifyDef, chainModify(2)
    const ctx = createAbilityContextFixture({
      pokemon: createOnFieldPokemonFixture({ ability: GEN6_ABILITY_IDS.furCoat }),
      move: createMoveFixture(CORE_MOVE_IDS.tackle),
    });
    const result = handleGen6DamageCalcAbility(ctx);
    expect(result.activated).toBe(true);
    expect(result.effects[0]!.effectType).toBe("damage-reduction");
  });

  it("given Fur Coat defender + special move, when checking damage-calc, then does not activate", () => {
    // Source: Bulbapedia "Fur Coat" -- only physical attacks trigger defense doubling
    const ctx = createAbilityContextFixture({
      pokemon: createOnFieldPokemonFixture({ ability: GEN6_ABILITY_IDS.furCoat }),
      move: createMoveFixture(CORE_MOVE_IDS.flamethrower),
    });
    const result = handleGen6DamageCalcAbility(ctx);
    expect(result.activated).toBe(false);
  });

  it("given Fur Coat utility, when computing defense multiplier for physical, then returns 2", () => {
    // Source: Showdown data/abilities.ts -- furcoat: chainModify(2)
    expect(getFurCoatMultiplier(GEN6_ABILITY_IDS.furCoat, true)).toBe(2);
  });

  it("given Fur Coat utility, when computing defense multiplier for special, then returns 1", () => {
    // Source: Showdown -- Fur Coat only affects physical Defense
    expect(getFurCoatMultiplier(GEN6_ABILITY_IDS.furCoat, false)).toBe(1);
  });
});

// ===========================================================================
// Pixilate (NEW Gen 6 -- -ate ability)
// ===========================================================================

describe("Pixilate", () => {
  it("given Pixilate + Normal move, when checking damage-calc, then activates with type-change to Fairy", () => {
    // Source: Bulbapedia "Pixilate" Gen 6 -- Normal moves become Fairy, 1.3x boost
    // Source: Showdown data/abilities.ts -- pixilate: onModifyType + onBasePower([5325, 4096])
    const ctx = createAbilityContextFixture({
      pokemon: createOnFieldPokemonFixture({
        ability: GEN6_ABILITY_IDS.pixilate,
        types: [CORE_TYPE_IDS.fairy],
      }),
      move: createMoveFixture(CORE_MOVE_IDS.tackle),
    });
    const result = handleGen6DamageCalcAbility(ctx);
    expect(result.activated).toBe(true);
    expect(result.effects).toEqual([
      { effectType: "type-change", target: "self", types: [CORE_TYPE_IDS.fairy] },
    ]);
  });

  it("given Pixilate + Fire move, when checking damage-calc, then does not activate", () => {
    // Source: Bulbapedia "Pixilate" -- only Normal-type moves are converted
    const ctx = createAbilityContextFixture({
      pokemon: createOnFieldPokemonFixture({ ability: GEN6_ABILITY_IDS.pixilate }),
      move: createMoveFixture(CORE_MOVE_IDS.flamethrower),
    });
    const result = handleGen6DamageCalcAbility(ctx);
    expect(result.activated).toBe(false);
  });

  it("given Pixilate utility, when computing type override for Normal move, then returns fairy + 1.3x", () => {
    // Source: Showdown data/abilities.ts -- pixilate: type -> fairy, basePower * 5325/4096
    const override = getAteAbilityOverride(GEN6_ABILITY_IDS.pixilate, CORE_TYPE_IDS.normal);
    expect(override).not.toBeNull();
    expect(override!.type).toBe(CORE_TYPE_IDS.fairy);
    expect(override!.multiplier).toBeCloseTo(5325 / 4096, 10);
  });

  it("given Pixilate utility, when computing type override for Fire move, then returns null", () => {
    // Source: Showdown -- only Normal moves are converted
    expect(getAteAbilityOverride(GEN6_ABILITY_IDS.pixilate, CORE_TYPE_IDS.fire)).toBeNull();
  });
});

// ===========================================================================
// Aerilate (NEW Gen 6 -- -ate ability)
// ===========================================================================

describe("Aerilate", () => {
  it("given Aerilate + Normal move, when checking damage-calc, then activates with type-change to Flying", () => {
    // Source: Bulbapedia "Aerilate" Gen 6 -- Normal moves become Flying, 1.3x boost
    // Source: Showdown data/abilities.ts -- aerilate: onModifyType + onBasePower
    const ctx = createAbilityContextFixture({
      pokemon: createOnFieldPokemonFixture({
        ability: GEN6_ABILITY_IDS.aerilate,
        types: [CORE_TYPE_IDS.normal, CORE_TYPE_IDS.flying],
      }),
      move: createMoveFixture(CORE_MOVE_IDS.tackle),
    });
    const result = handleGen6DamageCalcAbility(ctx);
    expect(result.activated).toBe(true);
    expect(result.effects).toEqual([
      { effectType: "type-change", target: "self", types: [CORE_TYPE_IDS.flying] },
    ]);
  });

  it("given Aerilate + Ice move, when checking damage-calc, then does not activate", () => {
    // Source: Bulbapedia "Aerilate" -- only Normal-type moves
    const ctx = createAbilityContextFixture({
      pokemon: createOnFieldPokemonFixture({ ability: GEN6_ABILITY_IDS.aerilate }),
      move: createMoveFixture(GEN6_MOVE_IDS.iceBeam),
    });
    const result = handleGen6DamageCalcAbility(ctx);
    expect(result.activated).toBe(false);
  });

  it("given Aerilate utility, when computing type override, then returns flying + 1.3x", () => {
    // Source: Showdown data/abilities.ts -- aerilate: type -> flying, basePower * 5325/4096
    const override = getAteAbilityOverride(GEN6_ABILITY_IDS.aerilate, CORE_TYPE_IDS.normal);
    expect(override).not.toBeNull();
    expect(override!.type).toBe(CORE_TYPE_IDS.flying);
    expect(override!.multiplier).toBeCloseTo(5325 / 4096, 10);
  });

  it("given Aerilate utility, when move is already Flying type, then returns null (no override)", () => {
    // Source: Showdown data/abilities.ts -- aerilate only overrides Normal-type moves
    const override = getAteAbilityOverride(GEN6_ABILITY_IDS.aerilate, CORE_TYPE_IDS.flying);
    expect(override).toBeNull();
  });
});

// ===========================================================================
// Refrigerate (NEW Gen 6 -- -ate ability)
// ===========================================================================

describe("Refrigerate", () => {
  it("given Refrigerate + Normal move, when checking damage-calc, then activates with type-change to Ice", () => {
    // Source: Bulbapedia "Refrigerate" Gen 6 -- Normal moves become Ice, 1.3x boost
    // Source: Showdown data/abilities.ts -- refrigerate: onModifyType + onBasePower
    const ctx = createAbilityContextFixture({
      pokemon: createOnFieldPokemonFixture({
        ability: GEN6_ABILITY_IDS.refrigerate,
        types: [CORE_TYPE_IDS.ice],
      }),
      move: createMoveFixture(CORE_MOVE_IDS.tackle),
    });
    const result = handleGen6DamageCalcAbility(ctx);
    expect(result.activated).toBe(true);
    expect(result.effects).toEqual([
      { effectType: "type-change", target: "self", types: [CORE_TYPE_IDS.ice] },
    ]);
  });

  it("given Refrigerate + Grass move, when checking damage-calc, then does not activate", () => {
    // Source: Bulbapedia "Refrigerate" -- only Normal-type moves
    const ctx = createAbilityContextFixture({
      pokemon: createOnFieldPokemonFixture({ ability: GEN6_ABILITY_IDS.refrigerate }),
      move: createMoveFixture(GEN6_MOVE_IDS.energyBall),
    });
    const result = handleGen6DamageCalcAbility(ctx);
    expect(result.activated).toBe(false);
  });

  it("given Refrigerate utility, when computing type override, then returns ice + 1.3x", () => {
    // Source: Showdown data/abilities.ts -- refrigerate: type -> ice, basePower * 5325/4096
    const override = getAteAbilityOverride(GEN6_ABILITY_IDS.refrigerate, CORE_TYPE_IDS.normal);
    expect(override).not.toBeNull();
    expect(override!.type).toBe(CORE_TYPE_IDS.ice);
    expect(override!.multiplier).toBeCloseTo(5325 / 4096, 10);
  });

  it("given Refrigerate utility, when move is Fire type, then returns null (no override)", () => {
    // Source: Showdown data/abilities.ts -- refrigerate only overrides Normal-type moves
    const override = getAteAbilityOverride(GEN6_ABILITY_IDS.refrigerate, CORE_TYPE_IDS.fire);
    expect(override).toBeNull();
  });
});

// ===========================================================================
// Parental Bond (NEW Gen 6)
// ===========================================================================

describe("Parental Bond", () => {
  it("given Parental Bond + single-hit move, when checking damage-calc, then activates", () => {
    // Source: Bulbapedia "Parental Bond" Gen 6 -- moves hit twice, second at 50%
    // Source: Showdown data/abilities.ts -- parentalbond: onModifyMove adds multihit
    const ctx = createAbilityContextFixture({
      pokemon: createOnFieldPokemonFixture({ ability: GEN6_ABILITY_IDS.parentalBond }),
      move: createMoveFixture(GEN6_MOVE_IDS.strength),
    });
    const result = handleGen6DamageCalcAbility(ctx);
    expect(result.activated).toBe(true);
  });

  it("given Parental Bond + multi-hit move (Double Slap), when checking damage-calc, then does not activate", () => {
    // Source: Bulbapedia "Parental Bond" -- does not apply to multi-hit moves
    const multiHitEffect: MoveEffect = { type: "multi-hit", min: 2, max: 5 };
    const ctx = createAbilityContextFixture({
      pokemon: createOnFieldPokemonFixture({ ability: GEN6_ABILITY_IDS.parentalBond }),
      move: createMoveFixture(GEN6_MOVE_IDS.doubleSlap, { effect: multiHitEffect }),
    });
    const result = handleGen6DamageCalcAbility(ctx);
    expect(result.activated).toBe(false);
  });

  it("given Parental Bond + status move, when checking damage-calc, then does not activate", () => {
    // Source: Bulbapedia "Parental Bond" -- only damaging moves
    const ctx = createAbilityContextFixture({
      pokemon: createOnFieldPokemonFixture({ ability: GEN6_ABILITY_IDS.parentalBond }),
      move: createMoveFixture(GEN6_MOVE_IDS.growl),
    });
    const result = handleGen6DamageCalcAbility(ctx);
    expect(result.activated).toBe(false);
  });

  it("given Gen 6 Parental Bond second-hit multiplier, then it equals 0.5", () => {
    // Source: Bulbapedia "Parental Bond" -- Gen 6: 50% second hit, Gen 7+: 25%
    // Source: Showdown data/abilities.ts -- secondHit 0.5 in Gen 6
    expect(PARENTAL_BOND_SECOND_HIT_MULTIPLIER).toBe(0.5);
  });

  it("given Parental Bond second-hit multiplier applied to 100 base power, then second hit is 50 power", () => {
    // Source: Bulbapedia "Parental Bond" -- second hit deals 50% of first hit damage in Gen 6
    // Formula: second hit power = floor(firstHitPower * PARENTAL_BOND_SECOND_HIT_MULTIPLIER)
    const firstHitPower = 100;
    const secondHitPower = Math.floor(firstHitPower * PARENTAL_BOND_SECOND_HIT_MULTIPLIER);
    expect(secondHitPower).toBe(50);
  });

  it("given Parental Bond utility function, when checking single-hit damaging move, then returns true", () => {
    // Source: Showdown data/abilities.ts -- parentalbond activates for single-target damaging moves
    expect(isParentalBondEligible(GEN6_ABILITY_IDS.parentalBond, 80, null)).toBe(true);
  });

  it("given Parental Bond utility function, when checking multi-hit move, then returns false", () => {
    // Source: Showdown data/abilities.ts -- parentalbond doesn't stack with multi-hit
    expect(isParentalBondEligible(GEN6_ABILITY_IDS.parentalBond, 25, "multi-hit")).toBe(false);
  });
});

// ===========================================================================
// Carry-forward: Technician (Gen 4+)
// ===========================================================================

describe("Technician (carry-forward)", () => {
  it("given Technician + move with BP 60, when checking damage-calc, then activates", () => {
    // Source: Showdown data/abilities.ts -- technician: basePower <= 60, chainModify(1.5)
    const ctx = createAbilityContextFixture({
      pokemon: createOnFieldPokemonFixture({ ability: GEN6_ABILITY_IDS.technician }),
      move: createMoveFixture(GEN6_MOVE_IDS.swift),
    });
    const result = handleGen6DamageCalcAbility(ctx);
    expect(result.activated).toBe(true);
  });

  it("given Technician + move with BP 80, when checking damage-calc, then does not activate", () => {
    // Source: Showdown data/abilities.ts -- technician only for basePower <= 60
    const ctx = createAbilityContextFixture({
      pokemon: createOnFieldPokemonFixture({ ability: GEN6_ABILITY_IDS.technician }),
      move: createMoveFixture(GEN6_MOVE_IDS.strength),
    });
    const result = handleGen6DamageCalcAbility(ctx);
    expect(result.activated).toBe(false);
  });
});

// ===========================================================================
// Carry-forward: Multiscale (Gen 5+)
// ===========================================================================

describe("Multiscale (carry-forward)", () => {
  it("given Multiscale at full HP, when checking damage-calc, then activates", () => {
    // Source: Showdown data/abilities.ts -- multiscale: target.hp >= target.maxhp, chainModify(0.5)
    const ctx = createAbilityContextFixture({
      pokemon: createOnFieldPokemonFixture({
        ability: GEN6_ABILITY_IDS.multiscale,
        hp: 200,
        currentHp: 200,
      }),
    });
    const result = handleGen6DamageCalcAbility(ctx);
    expect(result.activated).toBe(true);
    expect(result.effects[0]!.effectType).toBe("damage-reduction");
  });

  it("given Multiscale at less than full HP, when checking damage-calc, then does not activate", () => {
    // Source: Showdown data/abilities.ts -- multiscale only at full HP
    const ctx = createAbilityContextFixture({
      pokemon: createOnFieldPokemonFixture({
        ability: GEN6_ABILITY_IDS.multiscale,
        hp: 200,
        currentHp: 150,
      }),
    });
    const result = handleGen6DamageCalcAbility(ctx);
    expect(result.activated).toBe(false);
  });

  it("given Multiscale utility, when at full HP, then returns 0.5", () => {
    // Source: Showdown data/abilities.ts -- multiscale: chainModify(0.5) at full HP
    expect(getMultiscaleMultiplier(GEN6_ABILITY_IDS.multiscale, 200, 200)).toBe(0.5);
  });

  it("given Multiscale utility, when not at full HP, then returns 1", () => {
    // Source: Showdown -- only active at full HP
    expect(getMultiscaleMultiplier(GEN6_ABILITY_IDS.multiscale, 150, 200)).toBe(1);
  });
});

// ===========================================================================
// Carry-forward: Sturdy (Gen 5+)
// ===========================================================================

describe("Sturdy (carry-forward)", () => {
  it("given Sturdy + OHKO move, when checking damage immunity, then blocks the move", () => {
    // Source: Showdown data/abilities.ts -- sturdy onTryHit: if move.ohko, return null
    const ohkoEffect: MoveEffect = { type: "ohko" };
    const ctx = createAbilityContextFixture({
      pokemon: createOnFieldPokemonFixture({ ability: CORE_ABILITY_IDS.sturdy }),
      move: createMoveFixture(GEN6_MOVE_IDS.fissure, { effect: ohkoEffect }),
    });
    const result = handleGen6DamageImmunityAbility(ctx);
    expect(result.activated).toBe(true);
    expect(result.movePrevented).toBe(true);
  });

  it("given Sturdy + normal move, when checking damage immunity, then does not activate", () => {
    // Source: Showdown -- OHKO-block only; survival is in capLethalDamage
    const ctx = createAbilityContextFixture({
      pokemon: createOnFieldPokemonFixture({ ability: CORE_ABILITY_IDS.sturdy }),
      move: createMoveFixture(),
    });
    const result = handleGen6DamageImmunityAbility(ctx);
    expect(result.activated).toBe(false);
  });

  it("given Sturdy utility at full HP with lethal damage, then caps to maxHp - 1", () => {
    // Source: Showdown data/abilities.ts -- sturdy onDamage: target.hp === target.maxhp && damage >= target.hp
    expect(getSturdyDamageCap(CORE_ABILITY_IDS.sturdy, 300, 200, 200)).toBe(199);
  });

  it("given Sturdy utility at partial HP, then does not cap", () => {
    // Source: Showdown -- Sturdy only triggers from full HP
    expect(getSturdyDamageCap(CORE_ABILITY_IDS.sturdy, 300, 150, 200)).toBe(300);
  });

  it("given sturdyBlocksOHKO + OHKO effect, then returns true", () => {
    // Source: Showdown data/abilities.ts -- sturdy onTryHit: move.ohko
    const ohkoEffect: MoveEffect = { type: "ohko" };
    expect(sturdyBlocksOHKO(CORE_ABILITY_IDS.sturdy, ohkoEffect)).toBe(true);
  });

  it("given sturdyBlocksOHKO + non-OHKO effect, then returns false", () => {
    // Source: Showdown -- only OHKO moves blocked
    const healEffect: MoveEffect = { type: "heal", amount: 50, target: "self" };
    expect(sturdyBlocksOHKO(CORE_ABILITY_IDS.sturdy, healEffect)).toBe(false);
  });
});

// ===========================================================================
// Carry-forward: Sheer Force
// ===========================================================================

describe("Sheer Force (carry-forward)", () => {
  it("given Sheer Force + move with status-chance effect, when checking, then activates", () => {
    // Source: Showdown data/abilities.ts -- sheerforce: move with secondaries
    const effect: MoveEffect = { type: "status-chance", status: CORE_STATUS_IDS.burn, chance: 10 };
    const ctx = createAbilityContextFixture({
      pokemon: createOnFieldPokemonFixture({ ability: GEN6_ABILITY_IDS.sheerForce }),
      move: createMoveFixture(CORE_MOVE_IDS.flamethrower, { effect }),
    });
    const result = handleGen6DamageCalcAbility(ctx);
    expect(result.activated).toBe(true);
  });

  it("given Sheer Force + move without secondary, when checking, then does not activate", () => {
    // Source: Showdown -- Sheer Force only for moves with secondary effects
    const ctx = createAbilityContextFixture({
      pokemon: createOnFieldPokemonFixture({ ability: GEN6_ABILITY_IDS.sheerForce }),
      move: createMoveFixture(CORE_MOVE_IDS.tackle, { effect: null }),
    });
    const result = handleGen6DamageCalcAbility(ctx);
    expect(result.activated).toBe(false);
  });

  it("given Sheer Force utility, when computing multiplier for eligible move, then returns ~1.3x", () => {
    // Source: Showdown data/abilities.ts -- sheerforce: chainModify([5325, 4096])
    const effect: MoveEffect = { type: "status-chance", status: CORE_STATUS_IDS.burn, chance: 10 };
    expect(getSheerForceMultiplier(GEN6_ABILITY_IDS.sheerForce, effect)).toBeCloseTo(
      5325 / 4096,
      10,
    );
  });

  it("given Sheer Force utility, when move has no secondary effect, then returns 1 (no boost)", () => {
    // Source: Showdown data/abilities.ts -- sheerforce: only activates for moves with secondaries
    expect(getSheerForceMultiplier(GEN6_ABILITY_IDS.sheerForce, null)).toBe(1);
  });

  it("given Sheer Force + Tri Attack (effect=null, whitelisted), when checking activation, then activates", () => {
    // Source: Showdown data/moves.ts -- triattack has secondary.onHit with chance: 20
    //   Our data stores effect=null because the onHit function is not serializable
    const ctx = createAbilityContextFixture({
      pokemon: createOnFieldPokemonFixture({ ability: GEN6_ABILITY_IDS.sheerForce }),
      move: createMoveFixture(CORE_MOVE_IDS.triAttack, { effect: null }),
    });
    const result = handleGen6DamageCalcAbility(ctx);
    expect(result.activated).toBe(true);
  });

  it("given Sheer Force + Secret Power (whitelisted), when checking activation, then activates", () => {
    // Source: Showdown data/moves.ts -- secretpower has secondary effect (30% chance)
    //   In Gen 6 data, effect is status-chance (paralysis 30%), so it would also be caught
    //   by hasSheerForceEligibleEffect. The whitelist provides defense-in-depth.
    const ctx = createAbilityContextFixture({
      pokemon: createOnFieldPokemonFixture({ ability: GEN6_ABILITY_IDS.sheerForce }),
      move: createMoveFixture(GEN6_MOVE_IDS.secretPower, { effect: null }),
    });
    const result = handleGen6DamageCalcAbility(ctx);
    expect(result.activated).toBe(true);
  });

  it("given Sheer Force + Relic Song (whitelisted), when checking activation, then activates", () => {
    // Source: Showdown data/moves.ts -- relicsong has secondary (10% sleep)
    //   In Gen 6 data, effect is status-chance (sleep 10%), so it would also be caught
    //   by hasSheerForceEligibleEffect. The whitelist provides defense-in-depth.
    const ctx = createAbilityContextFixture({
      pokemon: createOnFieldPokemonFixture({ ability: GEN6_ABILITY_IDS.sheerForce }),
      move: createMoveFixture(GEN6_MOVE_IDS.relicSong, { effect: null }),
    });
    const result = handleGen6DamageCalcAbility(ctx);
    expect(result.activated).toBe(true);
  });
});

// ===========================================================================
// Sheer Force whitelist consistency
// ===========================================================================

describe("Sheer Force whitelist consistency (Gen 6)", () => {
  it("given tri-attack, when checking whitelist, then returns true", () => {
    // Source: Showdown data/moves.ts -- triattack has secondary.onHit
    //   effect=null in our data, whitelist is essential
    expect(isSheerForceWhitelistedMove(CORE_MOVE_IDS.triAttack)).toBe(true);
  });

  it("given secret-power, when checking whitelist, then returns true", () => {
    // Source: Showdown data/moves.ts -- secretpower has secondary effect
    //   Whitelisted for consistency with Gen6DamageCalc.ts and Gen6Items.ts
    expect(isSheerForceWhitelistedMove(GEN6_MOVE_IDS.secretPower)).toBe(true);
  });

  it("given relic-song, when checking whitelist, then returns true", () => {
    // Source: Showdown data/moves.ts -- relicsong has secondary (10% sleep)
    //   Whitelisted for consistency with Gen6DamageCalc.ts and Gen6Items.ts
    expect(isSheerForceWhitelistedMove(GEN6_MOVE_IDS.relicSong)).toBe(true);
  });

  it("given earthquake (no secondary), when checking whitelist, then returns false", () => {
    // Source: Showdown data/moves.ts -- earthquake has no secondary field
    expect(isSheerForceWhitelistedMove(GEN6_MOVE_IDS.earthquake)).toBe(false);
  });

  it("given tri-attack with effect=null, when checking isSheerForceEligibleMove, then returns true via whitelist", () => {
    // Source: Showdown data/abilities.ts -- sheerforce triggers for triattack
    //   Our data has effect=null so the whitelist is the only path
    expect(isSheerForceEligibleMove(null, CORE_MOVE_IDS.triAttack)).toBe(true);
  });

  it("given secret-power with effect=null, when checking isSheerForceEligibleMove, then returns true via whitelist", () => {
    // Source: Showdown data/moves.ts -- secretpower secondary
    //   Even if data import changed effect to null, whitelist ensures Sheer Force still triggers
    expect(isSheerForceEligibleMove(null, GEN6_MOVE_IDS.secretPower)).toBe(true);
  });

  it("given relic-song with effect=null, when checking isSheerForceEligibleMove, then returns true via whitelist", () => {
    // Source: Showdown data/moves.ts -- relicsong secondary (10% sleep)
    //   Even if data import changed effect to null, whitelist ensures Sheer Force still triggers
    expect(isSheerForceEligibleMove(null, GEN6_MOVE_IDS.relicSong)).toBe(true);
  });
});
