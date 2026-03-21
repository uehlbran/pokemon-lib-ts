import type { BattleConfig } from "@pokemon-lib-ts/battle";
import { BattleEngine, RandomAI } from "@pokemon-lib-ts/battle";
import type { PokemonInstance } from "@pokemon-lib-ts/core";
import { SeededRandom } from "@pokemon-lib-ts/core";
import { describe, expect, it } from "vitest";
import { createGen1DataManager, Gen1Ruleset } from "../../src";

describe("Gen 1 Full Battle Integration", () => {
  const dataManager = createGen1DataManager();
  const ruleset = new Gen1Ruleset();
  let uidCounter = 0;

  /**
   * Helper to create a Gen 1 PokemonInstance with specific moves.
   * Uses sane defaults for IVs, EVs, and other fields.
   */
  function createGen1Pokemon(
    speciesId: number,
    level: number,
    moveIds: string[],
    nickname?: string,
  ): PokemonInstance {
    return {
      uid: `gen1-${speciesId}-${level}-${++uidCounter}`,
      speciesId,
      nickname: nickname ?? null,
      level,
      experience: 0,
      nature: "adamant",
      // In Gen 1, IVs are DVs (0-15) and EVs are StatExp (0-65535)
      ivs: { hp: 15, attack: 15, defense: 15, spAttack: 15, spDefense: 15, speed: 15 },
      evs: { hp: 0, attack: 0, defense: 0, spAttack: 0, spDefense: 0, speed: 0 },
      currentHp: 200,
      moves: moveIds.map((id) => {
        const moveData = dataManager.getMove(id);
        return {
          moveId: id,
          currentPP: moveData.pp,
          maxPP: moveData.pp,
          ppUps: 0,
        };
      }),
      ability: "",
      abilitySlot: "normal1" as const,
      heldItem: null,
      status: null,
      friendship: 70,
      gender: "male" as const,
      isShiny: false,
      metLocation: "pallet-town",
      metLevel: level,
      originalTrainer: "Red",
      originalTrainerId: 12345,
      pokeball: "poke-ball",
    };
  }

  /**
   * Helper to create a BattleEngine with two teams and a seed.
   */
  function createBattle(
    team1: PokemonInstance[],
    team2: PokemonInstance[],
    seed: number,
  ): BattleEngine {
    const config: BattleConfig = {
      generation: 1,
      format: "singles",
      teams: [team1, team2],
      seed,
    };
    return new BattleEngine(config, ruleset, dataManager);
  }

  /**
   * Helper to run a full battle with RandomAI until it ends or hits a turn limit.
   * Returns the engine after the battle concludes.
   */
  function runFullBattle(engine: BattleEngine, seed: number, maxTurns = 500): BattleEngine {
    const ai = new RandomAI();
    const aiRng = new SeededRandom(seed + 999);

    engine.start();

    let turns = 0;
    while (!engine.isEnded() && turns < maxTurns) {
      const phase = engine.getPhase();

      if (phase === "action-select") {
        const action0 = ai.chooseAction(0, engine.getState(), ruleset, aiRng);
        const action1 = ai.chooseAction(1, engine.getState(), ruleset, aiRng);
        engine.submitAction(0, action0);
        engine.submitAction(1, action1);
        turns++;
      } else if (phase === "switch-prompt") {
        // Handle fainted Pokemon replacements
        for (const sideIdx of [0, 1] as const) {
          const active = engine.getActive(sideIdx);
          if (active && active.pokemon.currentHp <= 0) {
            const switchTarget = ai.chooseSwitchIn(sideIdx, engine.getState(), ruleset, aiRng);
            engine.submitSwitch(sideIdx, switchTarget);
          }
        }
      } else {
        // Unexpected phase — break to avoid infinite loop
        break;
      }
    }

    return engine;
  }

  /** Create the standard team 1: Charizard, Blastoise, Venusaur */
  function createTeam1(): PokemonInstance[] {
    return [
      createGen1Pokemon(6, 50, ["flamethrower", "slash", "ember", "scratch"], "Charizard"),
      createGen1Pokemon(9, 50, ["hydro-pump", "surf", "water-gun", "tackle"], "Blastoise"),
      createGen1Pokemon(3, 50, ["razor-leaf", "vine-whip", "tackle", "growl"], "Venusaur"),
    ];
  }

  /** Create the standard team 2: Alakazam, Gengar, Snorlax */
  function createTeam2(): PokemonInstance[] {
    return [
      createGen1Pokemon(65, 50, ["psychic", "confusion", "recover", "reflect"], "Alakazam"),
      createGen1Pokemon(94, 50, ["night-shade", "lick", "confuse-ray", "hypnosis"], "Gengar"),
      createGen1Pokemon(143, 50, ["body-slam", "headbutt", "rest", "hyper-beam"], "Snorlax"),
    ];
  }

  // --- Full Battle Tests ---

  it("given two teams of Gen 1 Pokemon, when a full battle runs with RandomAI, then a winner is declared", () => {
    // Arrange
    const team1 = createTeam1();
    const team2 = createTeam2();
    const engine = createBattle(team1, team2, 42);

    // Act
    runFullBattle(engine, 42);

    // Assert
    expect(engine.isEnded()).toBe(true);
    const winner = engine.getWinner();
    expect(winner === 0 || winner === 1).toBe(true);
  });

  it("given same seed, when running the same battle twice, then events are identical (determinism)", () => {
    // Arrange
    const seed = 42;

    // Act: Run battle 1
    const team1a = createTeam1();
    const team2a = createTeam2();
    const engine1 = createBattle(team1a, team2a, seed);
    runFullBattle(engine1, seed);
    const events1 = engine1.getEventLog();

    // Act: Run battle 2 with identical setup
    const team1b = createTeam1();
    const team2b = createTeam2();
    const engine2 = createBattle(team1b, team2b, seed);
    runFullBattle(engine2, seed);
    const events2 = engine2.getEventLog();

    // Assert: Event logs must be identical
    expect(events1.length).toBe(events2.length);
    expect(events1.length).toBeGreaterThan(0);

    for (let i = 0; i < events1.length; i++) {
      expect(events1[i]?.type).toBe(events2[i]?.type);
    }

    // Additionally verify the winners match
    expect(engine1.getWinner()).toBe(engine2.getWinner());
  });

  it("given different seeds, when running the same battle, then events differ (randomness matters)", () => {
    // Arrange
    const team1a = createTeam1();
    const team2a = createTeam2();
    const engine1 = createBattle(team1a, team2a, 42);

    const team1b = createTeam1();
    const team2b = createTeam2();
    const engine2 = createBattle(team1b, team2b, 99999);

    // Act
    runFullBattle(engine1, 42);
    runFullBattle(engine2, 99999);

    // Assert: With different seeds, the event count or types should differ
    const events1 = engine1.getEventLog();
    const events2 = engine2.getEventLog();
    // At minimum, the total event counts are very unlikely to match
    // (if they do by chance, the detailed events themselves will differ)
    const eventsMatch =
      events1.length === events2.length && events1.every((e, i) => e.type === events2[i]?.type);
    expect(eventsMatch).toBe(false);
  });

  it("given a battle, when damage is dealt, then damage events are emitted with correct fields", () => {
    // Arrange: 1v1 battle for simplicity
    const attacker = createGen1Pokemon(
      6,
      50,
      ["flamethrower", "scratch", "ember", "slash"],
      "Charizard",
    );
    const defender = createGen1Pokemon(
      9,
      50,
      ["water-gun", "tackle", "bubble", "withdraw"],
      "Blastoise",
    );
    const engine = createBattle([attacker], [defender], 42);

    // Act: Run one turn
    engine.start();
    engine.submitAction(0, { type: "move", side: 0, moveIndex: 0 });
    engine.submitAction(1, { type: "move", side: 1, moveIndex: 0 });

    // Assert: Check for damage events
    const events = engine.getEventLog();
    const damageEvents = events.filter((e) => e.type === "damage");
    expect(damageEvents.length).toBeGreaterThanOrEqual(1);

    for (const evt of damageEvents) {
      if (evt.type === "damage") {
        expect(evt.side === 0 || evt.side === 1).toBe(true);
        expect(typeof evt.pokemon).toBe("string");
        expect(typeof evt.source).toBe("string");
        expect(evt.currentHp).toBeGreaterThanOrEqual(0);
        // Source: pret/pokered — damage formula with Gen 1 roll range 217-255.
        // Charizard L50 (spAttack=129) uses Flamethrower (Fire BP=95, special) vs
        // Blastoise L50 (spDefense=105). Fire is Special in Gen 1.
        // Charizard is Fire type → STAB. Fire vs Water = 0.5x.
        //   levelFactor=22; inner=floor(22*95*129)/105=floor(269940)/105=floor(2571)=2571
        //   baseDamage=floor(2571/50)+2=51+2=53; STAB: floor(53*1.5)=79
        //   0.5x resist: floor(79*5/10)=39
        //   min(roll=217): floor(39*217/255)=floor(33.16)=33
        //   max(roll=255): floor(39*255/255)=39
        // Blastoise L50 (spAttack=105) uses Water Gun (Water BP=40, special) vs
        // Charizard L50 (spDefense=129). Water is Special. Blastoise is Water → STAB.
        // Water vs Fire = 2x, Water vs Flying = 1x → combined 2x.
        //   levelFactor=22; inner=floor(22*40*105)/129=floor(92400)/129=floor(716.27)=716
        //   baseDamage=floor(716/50)+2=14+2=16; STAB: floor(16*1.5)=24
        //   2x (Water vs Fire): floor(24*20/10)=48; 1x (Water vs Flying): 48
        //   min(roll=217): floor(48*217/255)=floor(40.84)=40
        //   max(roll=255): floor(48*255/255)=48
        // Seed 42 actual: Flamethrower deals 34, Water Gun deals 47 (within computed ranges).
        // Assert damage is in the valid Gen 1 range for these specific Pokemon/moves:
        if (evt.source === "flamethrower") {
          expect(evt.amount).toBeGreaterThanOrEqual(33); // min roll=217
          expect(evt.amount).toBeLessThanOrEqual(39); // max roll=255
          expect(evt.maxHp).toBe(154); // Blastoise L50 max DVs: floor(((79+15)*2)*50/100)+60 = 154
        } else if (evt.source === "water-gun") {
          expect(evt.amount).toBeGreaterThanOrEqual(40); // min roll=217
          expect(evt.amount).toBeLessThanOrEqual(48); // max roll=255
          expect(evt.maxHp).toBe(153); // Charizard L50 max DVs: floor(((78+15)*2)*50/100)+60 = 153
        }
      }
    }
  });

  it("given a Gen 1 battle, when a super-effective move hits, then effectiveness event shows 2x", () => {
    // Arrange: Water move (Surf) against Fire type (Charizard) -> 2x (or 4x since Charizard is Fire/Flying and water is 2x vs Fire, 1x vs Flying)
    const waterAttacker = createGen1Pokemon(
      9,
      50,
      ["surf", "water-gun", "tackle", "withdraw"],
      "Blastoise",
    );
    const fireDefender = createGen1Pokemon(
      6,
      50,
      ["flamethrower", "scratch", "ember", "slash"],
      "Charizard",
    );
    const engine = createBattle([waterAttacker], [fireDefender], 100);

    // Act
    engine.start();
    // Blastoise uses Surf (water) against Charizard (fire/flying)
    engine.submitAction(0, { type: "move", side: 0, moveIndex: 0 });
    engine.submitAction(1, { type: "move", side: 1, moveIndex: 1 }); // Scratch (normal)

    // Assert
    const events = engine.getEventLog();
    const effectivenessEvents = events.filter((e) => e.type === "effectiveness");
    expect(effectivenessEvents.length).toBeGreaterThanOrEqual(1);

    // At least one effectiveness event should show super-effective (2x or more)
    const superEffective = effectivenessEvents.find(
      (e) => e.type === "effectiveness" && e.multiplier >= 2,
    );
    expect(superEffective).toBeDefined();
  });

  it("given a Gen 1 battle, when a not-very-effective move hits, then effectiveness event shows 0.5x", () => {
    // Arrange: Fire move against Water type -> 0.5x
    const fireAttacker = createGen1Pokemon(
      6,
      50,
      ["flamethrower", "scratch", "ember", "slash"],
      "Charizard",
    );
    const waterDefender = createGen1Pokemon(
      9,
      50,
      ["tackle", "water-gun", "withdraw", "bubble"],
      "Blastoise",
    );
    const engine = createBattle([fireAttacker], [waterDefender], 100);

    // Act
    engine.start();
    // Charizard uses Flamethrower (fire) against Blastoise (water)
    engine.submitAction(0, { type: "move", side: 0, moveIndex: 0 });
    engine.submitAction(1, { type: "move", side: 1, moveIndex: 0 }); // Tackle

    // Assert
    const events = engine.getEventLog();
    const effectivenessEvents = events.filter((e) => e.type === "effectiveness");
    // Flamethrower vs Water should produce a not-very-effective event
    const notVeryEffective = effectivenessEvents.find(
      (e) => e.type === "effectiveness" && e.multiplier < 1,
    );
    expect(notVeryEffective).toBeDefined();
  });

  it("given a Gen 1 battle, when a Pokemon faints, then a faint event is emitted", () => {
    // Arrange: Use a level 100 Pokemon with strong move vs a level 5 Pokemon to guarantee a KO
    const strongAttacker = createGen1Pokemon(
      150,
      100,
      ["psychic", "confusion", "recover", "reflect"],
      "Mewtwo",
    );
    const weakDefender = createGen1Pokemon(
      129,
      5,
      ["tackle", "tackle", "tackle", "tackle"],
      "Magikarp",
    );
    const engine = createBattle([strongAttacker], [weakDefender], 42);

    // Act
    engine.start();
    engine.submitAction(0, { type: "move", side: 0, moveIndex: 0 }); // Psychic
    engine.submitAction(1, { type: "move", side: 1, moveIndex: 0 }); // Tackle

    // Assert
    const events = engine.getEventLog();
    const faintEvents = events.filter((e) => e.type === "faint");
    expect(faintEvents.length).toBeGreaterThanOrEqual(1);

    // The weak Pokemon should have fainted
    const magikarpFaint = faintEvents.find((e) => e.type === "faint" && e.side === 1);
    expect(magikarpFaint).toBeDefined();
  });

  it("given a Gen 1 battle, when the battle ends, then a battle-end event is emitted", () => {
    // Arrange: 1v1 to ensure quick resolution
    const strongAttacker = createGen1Pokemon(
      150,
      100,
      ["psychic", "confusion", "recover", "reflect"],
      "Mewtwo",
    );
    const weakDefender = createGen1Pokemon(
      129,
      5,
      ["tackle", "tackle", "tackle", "tackle"],
      "Magikarp",
    );
    const engine = createBattle([strongAttacker], [weakDefender], 42);

    // Act
    runFullBattle(engine, 42);

    // Assert
    const events = engine.getEventLog();
    const endEvents = events.filter((e) => e.type === "battle-end");
    expect(endEvents.length).toBe(1);
    if (endEvents[0]?.type === "battle-end") {
      expect(endEvents[0]?.winner === 0 || endEvents[0]?.winner === 1).toBe(true);
    }
  });

  it("given a Gen 1 battle, when it starts, then switch-in events are emitted for both sides", () => {
    // Arrange
    const team1 = createTeam1();
    const team2 = createTeam2();
    const engine = createBattle(team1, team2, 42);

    // Act
    engine.start();

    // Assert
    const events = engine.getEventLog();
    const switchInEvents = events.filter((e) => e.type === "switch-in");
    expect(switchInEvents.length).toBe(2); // One per side

    const sides = switchInEvents.map((e) => (e.type === "switch-in" ? e.side : -1));
    expect(sides).toContain(0);
    expect(sides).toContain(1);
  });

  it("given a Gen 1 battle, when it starts, then a battle-start event is the first event", () => {
    // Arrange
    const team1 = createTeam1();
    const team2 = createTeam2();
    const engine = createBattle(team1, team2, 42);

    // Act
    engine.start();

    // Assert
    const events = engine.getEventLog();
    expect(events.length).toBeGreaterThan(0);
    expect(events[0]?.type).toBe("battle-start");
    if (events[0]?.type === "battle-start") {
      expect(events[0]?.generation).toBe(1);
      expect(events[0]?.format).toBe("singles");
    }
  });

  it("given a Gen 1 battle, when moves execute, then move-start events are emitted", () => {
    // Arrange
    const team1 = [
      createGen1Pokemon(6, 50, ["flamethrower", "scratch", "ember", "slash"], "Charizard"),
    ];
    const team2 = [
      createGen1Pokemon(9, 50, ["surf", "water-gun", "tackle", "withdraw"], "Blastoise"),
    ];
    const engine = createBattle(team1, team2, 42);

    // Act
    engine.start();
    engine.submitAction(0, { type: "move", side: 0, moveIndex: 0 });
    engine.submitAction(1, { type: "move", side: 1, moveIndex: 0 });

    // Assert
    const events = engine.getEventLog();
    const moveStartEvents = events.filter((e) => e.type === "move-start");
    // Both Pokemon should have attempted moves (barring status/flinch)
    expect(moveStartEvents.length).toBeGreaterThanOrEqual(1);
  });

  it("given a Gen 1 battle, when a Pokemon's HP reaches 0, then its currentHp is 0", () => {
    // Arrange
    const strong = createGen1Pokemon(
      150,
      100,
      ["psychic", "confusion", "recover", "reflect"],
      "Mewtwo",
    );
    const weak = createGen1Pokemon(129, 5, ["tackle", "tackle", "tackle", "tackle"], "Magikarp");
    const engine = createBattle([strong], [weak], 42);

    // Act
    runFullBattle(engine, 42);

    // Assert
    const defenderTeam = engine.getTeam(1);
    const magikarp = defenderTeam[0];
    expect(magikarp).toBeDefined();
    expect(magikarp?.currentHp).toBe(0);
  });

  it("given a full 3v3 battle, when it completes, then all Pokemon on losing side have 0 HP", () => {
    // Arrange
    const team1 = createTeam1();
    const team2 = createTeam2();
    const engine = createBattle(team1, team2, 42);

    // Act
    runFullBattle(engine, 42);

    // Assert
    expect(engine.isEnded()).toBe(true);
    const winner = engine.getWinner();
    expect(winner).not.toBeNull();
    const loserSide = winner === 0 ? 1 : 0;
    const loserTeam = engine.getTeam(loserSide as 0 | 1);

    for (const pokemon of loserTeam) {
      expect(pokemon.currentHp).toBe(0);
    }
  });

  it("given a full 3v3 battle, when it completes, then at least one Pokemon on winning side has HP > 0", () => {
    // Arrange
    const team1 = createTeam1();
    const team2 = createTeam2();
    const engine = createBattle(team1, team2, 42);

    // Act
    runFullBattle(engine, 42);

    // Assert
    expect(engine.isEnded()).toBe(true);
    const winner = engine.getWinner();
    expect(winner).not.toBeNull();
    const winnerTeam = engine.getTeam(winner as 0 | 1);
    const anyAlive = winnerTeam.some((p) => p.currentHp > 0);
    expect(anyAlive).toBe(true);
  });

  it("given a battle, when stats are calculated at start, then all Pokemon have calculatedStats with exact known values", () => {
    // Arrange
    const team1 = createTeam1();
    const team2 = createTeam2();
    const engine = createBattle(team1, team2, 42);

    // Act: Engine constructor calculates stats
    engine.start();

    // Assert — exact stat values for team1/team2 Pokemon at L50, max DVs (15), zero StatExp.
    // Source: pret/pokered stat formula: floor(((base+dv)*2)*50/100)+5 for non-HP;
    //         floor(((base+dv)*2)*50/100)+60 for HP.
    // In Gen 1 the Special stat is unified: spAttack and spDefense use the same base value.
    // Data is sourced from packages/gen1/data/pokemon.json (Gen 1 data from Showdown).
    // Charizard (speciesId=6): base HP=78, Atk=84, Def=78, Spc=109, Spe=100, DV=15
    //   hp: floor((78+15)*2*50/100)+60=93+60=153, atk: floor((84+15)*2*50/100)+5=99+5=104
    //   def: floor((78+15)*2*50/100)+5=93+5=98, spc: floor((109+15)*2*50/100)+5=124+5=129
    //   spe: floor((100+15)*2*50/100)+5=115+5=120
    // Blastoise (speciesId=9): base HP=79, Atk=83, Def=100, Spc=85, Spe=78, DV=15
    //   hp: floor((79+15)*2*50/100)+60=94+60=154, atk: floor((83+15)*2*50/100)+5=98+5=103
    //   def: floor((100+15)*2*50/100)+5=115+5=120, spc: floor((85+15)*2*50/100)+5=100+5=105
    //   spe: floor((78+15)*2*50/100)+5=93+5=98
    // Venusaur (speciesId=3): base HP=80, Atk=82, Def=83, Spc=100, Spe=80, DV=15
    //   hp=155, atk=102, def=103, spc=120, spe=100
    // Alakazam (speciesId=65): base HP=55, Atk=50, Def=45, Spc=135, Spe=120, DV=15
    //   hp=130, atk=70, def=65, spc=155, spe=140
    // Gengar (speciesId=94): base HP=60, Atk=65, Def=60, Spc=130, Spe=110, DV=15
    //   hp=135, atk=85, def=80, spc=150, spe=130
    // Snorlax (speciesId=143): base HP=160, Atk=110, Def=65, Spc=65, Spe=30, DV=15
    //   hp=235, atk=130, def=85, spc=85, spe=50
    const expectedStats: Record<string, Record<string, number>> = {
      Charizard: { hp: 153, attack: 104, defense: 98, spAttack: 129, spDefense: 129, speed: 120 },
      Blastoise: { hp: 154, attack: 103, defense: 120, spAttack: 105, spDefense: 105, speed: 98 },
      Venusaur: { hp: 155, attack: 102, defense: 103, spAttack: 120, spDefense: 120, speed: 100 },
      Alakazam: { hp: 130, attack: 70, defense: 65, spAttack: 155, spDefense: 155, speed: 140 },
      Gengar: { hp: 135, attack: 85, defense: 80, spAttack: 150, spDefense: 150, speed: 130 },
      Snorlax: { hp: 235, attack: 130, defense: 85, spAttack: 85, spDefense: 85, speed: 50 },
    };

    for (const sideIdx of [0, 1] as const) {
      const team = engine.getTeam(sideIdx);
      for (const pokemon of team) {
        expect(pokemon.calculatedStats).toBeDefined();
        const nickname = pokemon.nickname;
        if (nickname && expectedStats[nickname]) {
          const expected = expectedStats[nickname];
          // biome-ignore lint/style/noNonNullAssertion: expected is always defined in this block
          expect(pokemon.calculatedStats!.hp).toBe(expected.hp);
          // biome-ignore lint/style/noNonNullAssertion: expected is always defined in this block
          expect(pokemon.calculatedStats!.attack).toBe(expected.attack);
          // biome-ignore lint/style/noNonNullAssertion: expected is always defined in this block
          expect(pokemon.calculatedStats!.defense).toBe(expected.defense);
          // biome-ignore lint/style/noNonNullAssertion: expected is always defined in this block
          expect(pokemon.calculatedStats!.spAttack).toBe(expected.spAttack);
          // biome-ignore lint/style/noNonNullAssertion: expected is always defined in this block
          expect(pokemon.calculatedStats!.spDefense).toBe(expected.spDefense);
          // biome-ignore lint/style/noNonNullAssertion: expected is always defined in this block
          expect(pokemon.calculatedStats!.speed).toBe(expected.speed);
        }
      }
    }
  });

  it("given a battle, when turn-start events are emitted, then turn numbers increment sequentially", () => {
    // Arrange
    const team1 = createTeam1();
    const team2 = createTeam2();
    const engine = createBattle(team1, team2, 42);

    // Act
    runFullBattle(engine, 42);

    // Assert
    const events = engine.getEventLog();
    const turnStartEvents = events.filter((e) => e.type === "turn-start");
    expect(turnStartEvents.length).toBeGreaterThan(0);

    for (let i = 0; i < turnStartEvents.length; i++) {
      const evt = turnStartEvents[i];
      if (evt.type === "turn-start") {
        expect(evt.turnNumber).toBe(i + 1);
      }
    }
  });

  it("given a battle with multiple Pokemon, when a Pokemon faints, then a switch is required", () => {
    // Arrange: Use very strong attacker vs a team of 2 weak Pokemon
    const strong = createGen1Pokemon(
      150,
      100,
      ["psychic", "confusion", "recover", "reflect"],
      "Mewtwo",
    );
    const weak1 = createGen1Pokemon(129, 5, ["tackle", "tackle", "tackle", "tackle"], "Magikarp1");
    const weak2 = createGen1Pokemon(129, 5, ["tackle", "tackle", "tackle", "tackle"], "Magikarp2");
    const engine = createBattle([strong], [weak1, weak2], 42);

    // Act
    runFullBattle(engine, 42);

    // Assert: Both magikarp should have fainted
    const events = engine.getEventLog();
    const faintEvents = events.filter((e) => e.type === "faint");
    expect(faintEvents.length).toBeGreaterThanOrEqual(2);

    // There should be switch-in events for the replacement
    const switchInEvents = events.filter((e) => e.type === "switch-in");
    // Initial send-out (2) + at least one replacement switch
    expect(switchInEvents.length).toBeGreaterThanOrEqual(3);
  });

  it("given a battle, when getAvailableMoves is called, then returns valid move data", () => {
    // Arrange
    const team1 = [
      createGen1Pokemon(6, 50, ["flamethrower", "scratch", "ember", "slash"], "Charizard"),
    ];
    const team2 = [
      createGen1Pokemon(9, 50, ["surf", "water-gun", "tackle", "withdraw"], "Blastoise"),
    ];
    const engine = createBattle(team1, team2, 42);
    engine.start();

    // Act
    const moves = engine.getAvailableMoves(0);

    // Assert
    expect(moves.length).toBe(4);
    expect(moves[0]?.moveId).toBe("flamethrower");
    expect(moves[0]?.type).toBe("fire");
    expect(moves[0]?.disabled).toBe(false);
    expect(moves[0]?.pp).toBeGreaterThan(0);
  });

  it("given a battle with 3v3 teams, when getAvailableSwitches is called, then returns correct indices", () => {
    // Arrange
    const team1 = createTeam1();
    const team2 = createTeam2();
    const engine = createBattle(team1, team2, 42);
    engine.start();

    // Act
    const switches = engine.getAvailableSwitches(0);

    // Assert: Active is slot 0, so slots 1 and 2 should be available
    expect(switches.length).toBe(2);
    expect(switches).toContain(1);
    expect(switches).toContain(2);
  });
});
