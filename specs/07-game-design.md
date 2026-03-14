# Pokemon Fan Game — Game Design

> Pallet Town layout, opening sequence (scripted beat-by-beat), cutscene system, NPC system,
> rival mechanics, starter selection, Tiled setup, and Route 1 design.

---

## 12. Game Design — Pallet Town & Opening Sequence

### 12.1 New Game Flow

The opening sequence plays out as follows. Each step is a **scripted event** driven by the cutscene/event system.

```
TITLE SCREEN
  → "New Game" / "Continue" / "Options"
  → New Game selected

INTRO SEQUENCE (Oak's Introduction)
  1. Black screen → fade in Professor Oak sprite (center screen)
  2. Oak: "Hello there! Welcome to the world of POKEMON!"
  3. Oak: "My name is OAK. People call me the POKEMON PROF!"
  4. Show a Pokemon sprite (e.g., Nidorino) beside Oak
  5. Oak: "This world is inhabited by creatures called POKEMON!"
  6. Oak: "For some people, POKEMON are pets. Others use them for fights."
  7. Oak: "Myself... I study POKEMON as a profession."
  8. Transition to player character sprite
  9. Oak: "First, what is your name?"
  10. → NAME ENTRY SCREEN (keyboard input, max 10 characters)
  11. Oak: "Right! So your name is <PLAYER>!"
  12. Show rival sprite
  13. Oak: "This is my grandson. He's been your rival since you were a baby."
  14. Oak: "...Erm, what is his name again?"
  15. → RIVAL NAME ENTRY SCREEN (keyboard input, or default: "Blue")
  16. Oak: "That's right! I remember now! His name is <RIVAL>!"
  17. Back to player sprite
  18. Oak: "<PLAYER>! Your very own POKEMON legend is about to unfold!"
  19. Oak: "A world of dreams and adventures with POKEMON awaits! Let's go!"
  20. Fade to black → Load Pallet Town → Player in bedroom

PLAYER'S HOUSE — BEDROOM (2F)
  1. Player starts facing down in small bedroom
  2. PC in corner (can access item storage — empty for now)
  3. Stairs down to 1F

PLAYER'S HOUSE — LIVING ROOM (1F)
  1. Mom is standing near the kitchen/table
  2. Mom: "<PLAYER>! Professor Oak was looking for you!"
  3. Mom: "He said he had something important to give you."
  4. Exit through front door → Pallet Town overworld

PALLET TOWN (overworld)
  1. Player can explore the small town:
     - Player's House (south-west area)
     - Rival's House (south-east area)
     - Professor Oak's Lab (south-center, large building)
     - Route 1 exit (north) — BLOCKED until player has a Pokemon
       NPC or sign: "It's dangerous to go out without a POKEMON!"
  2. Walking toward Route 1 triggers Oak cutscene (first time only):
     - Screen freeze → Oak runs in from off-screen
     - Oak: "Hey! Wait! Don't go out!"
     - Oak: "Wild POKEMON live in tall grass! You need your own POKEMON for protection!"
     - Oak: "Come with me to my lab!"
     - Oak walks south → player auto-follows → enter Oak's Lab

OAK'S LAB
  1. Interior map: bookshelves, machines, aides/NPCs
  2. Table in center-back with 3 Pokeballs on it
  3. Rival is already standing near the table
  4. Oak walks to his position behind the table
  5. Oak: "Here, <PLAYER>! There are 3 POKEMON here. Heh!"
  6. Oak: "They're all for you! Choose whichever you like!"
  7. Player approaches table → interact with a Pokeball:
     - Left ball: "Bulbasaur — the Grass-type. Will you choose Bulbasaur?"
       → Yes / No
     - Center ball: "Charmander — the Fire-type. Will you choose Charmander?"
       → Yes / No  
     - Right ball: "Squirtle — the Water-type. Will you choose Squirtle?"
       → Yes / No
  8. On selection:
     - Oak: "You chose <STARTER>! Excellent!"
     - "<PLAYER> received <STARTER>!" 
     - Pokemon cry plays
     - Add starter to party (Level 5, default moveset, random IVs/nature)
     - Pokedex registers as caught
  9. Rival picks the type-advantageous starter:
     - Player chose Bulbasaur → Rival gets Charmander
     - Player chose Charmander → Rival gets Squirtle
     - Player chose Squirtle → Rival gets Bulbasaur
  10. Rival: "<RIVAL>: I'll take this one then!"
  11. Rival: "My POKEMON looks a lot stronger than yours!"
  12. RIVAL BATTLE TRIGGER:
      - Rival: "<PLAYER>! Let's see how good your POKEMON is!"
      - → Trainer battle vs Rival (1 Pokemon each, Level 5)
      - Rival uses Tier 2 AI (prefers effective moves)
  13. After battle (win or lose — player cannot black out here):
      - If win: Rival: "Hmph! Not bad!" 
      - If lose: Rival: "Ha! That was close!"
      - Oak: "Magnificent! You two are something else!"
      - Oak: "Oh, right! I have something for you."
      - Oak gives player 5x Pokeball
      - Oak: "You should go explore Route 1! POKEMON are waiting!"
      - Route 1 north exit is now unblocked (set flag: has-starter = true)
  14. Player can now leave the lab and explore freely

POST-LAB (free play)
  - Route 1 is accessible (wild encounters: Pidgey, Rattata)
  - Can return to heal at home (Mom heals party on interaction)
  - Can return to Oak's Lab to talk to Oak/aides
  - Rival's house: Rival's sister gives you a Town Map (key item)
```

### 12.2 Pallet Town — Map Design Requirements

You will build this in **Tiled Map Editor**. Here are the requirements for what the map needs to contain.

**Town Layout** (approximately 20×20 to 25×25 tiles):

```
          ┌──────── Route 1 (North Exit) ────────┐
          │              (grass/path)              │
          │                                        │
          │    ┌──────────┐    ┌──────────┐       │
          │    │ NPC House │    │ Rival's  │       │
          │    │ (optional)│    │  House   │       │
          │    └──────────┘    └──────────┘       │
          │                                        │
          │         ┌────────────────┐             │
          │         │  Oak's Lab     │             │
          │         │  (large)       │             │
          │         └───────┬────────┘             │
          │                 │ door                  │
          │                                        │
          │    ┌──────────┐         ┌─────────┐   │
          │    │ Player's │         │  Pond/  │   │
          │    │  House   │         │  Trees  │   │
          │    └──────────┘         └─────────┘   │
          │                                        │
          │     (flowers, fences, sign)            │
          │                                        │
          └── Water/Cliffs (South, impassable) ────┘
```

**Required Tiled Objects (events layer):**

| Object | Type | Properties |
|--------|------|------------|
| Player spawn | `spawn` | `id: "player-start"`, position in bedroom |
| Player house door (exterior) | `warp` | `targetMap: "player-house-1f"`, `targetX`, `targetY` |
| Player house stairs (1F→2F) | `warp` | `targetMap: "player-house-2f"`, `targetX`, `targetY` |
| Player house stairs (2F→1F) | `warp` | `targetMap: "player-house-1f"`, `targetX`, `targetY` |
| Rival house door | `warp` | `targetMap: "rival-house"`, `targetX`, `targetY` |
| Oak's Lab door | `warp` | `targetMap: "oaks-lab"`, `targetX`, `targetY` |
| Route 1 exit | `warp` | `targetMap: "route-1"`, `targetX`, `targetY` |
| Route 1 blocker NPC | `npc` | `id: "route1-blocker"`, `condition: "!has-starter"` |
| Town sign | `sign` | `text: "PALLET TOWN\nShades of your journey await!"` |
| Mom (1F) | `npc` | `id: "mom"`, `dialog`, `healsParty: true` |
| Rival's sister | `npc` | `id: "rival-sister"`, gives Town Map |
| Oak (lab) | `npc` | `id: "oak"`, complex scripted behavior |
| Rival (lab) | `npc` | `id: "rival"`, scripted behavior |
| Starter Pokeball 1 | `interaction` | `id: "starter-bulbasaur"` |
| Starter Pokeball 2 | `interaction` | `id: "starter-charmander"` |
| Starter Pokeball 3 | `interaction` | `id: "starter-squirtle"` |
| Oak trigger zone | `trigger` | `id: "oak-route1-cutscene"`, `condition: "!has-starter"` |

**Maps to create:**

| Map File | Size (tiles) | Description |
|----------|-------------|-------------|
| `pallet-town.json` | ~25×25 | Town overworld |
| `player-house-1f.json` | ~8×8 | Living room + kitchen |
| `player-house-2f.json` | ~6×6 | Bedroom |
| `rival-house.json` | ~8×8 | Rival's home interior |
| `oaks-lab.json` | ~10×12 | Professor Oak's laboratory |
| `route-1.json` | ~20×40+ | First route, tall grass, trainers |

### 12.3 Cutscene / Scripted Event System

This is critical — the opening sequence is heavily scripted. The engine needs an event scripting system.

```typescript
// src/systems/CutsceneManager.ts

interface CutsceneStep {
  type: CutsceneAction['type'];
  // Each action type has its own params — see CutsceneAction union
}

type CutsceneAction =
  | { type: 'dialog'; speaker?: string; text: string }
  | { type: 'choice'; prompt: string; options: string[] }
  | { type: 'move-npc'; npcId: string; path: { x: number; y: number }[]; speed?: number }
  | { type: 'move-player'; path: { x: number; y: number }[]; speed?: number }
  | { type: 'face-direction'; entityId: string; direction: Direction }
  | { type: 'show-sprite'; spriteKey: string; x: number; y: number }
  | { type: 'hide-sprite'; spriteKey: string }
  | { type: 'fade-in'; durationMs: number }
  | { type: 'fade-out'; durationMs: number }
  | { type: 'wait'; durationMs: number }
  | { type: 'play-sfx'; key: string }
  | { type: 'play-bgm'; key: string }
  | { type: 'play-cry'; speciesId: number }
  | { type: 'set-flag'; flag: string; value: boolean }
  | { type: 'check-flag'; flag: string; ifTrue: CutsceneAction[]; ifFalse: CutsceneAction[] }
  | { type: 'give-pokemon'; speciesId: number; level: number; nickname?: string }
  | { type: 'give-item'; itemId: string; quantity: number }
  | { type: 'heal-party' }
  | { type: 'start-battle'; battleType: 'trainer'; trainerId: string }
  | { type: 'name-input'; label: string; maxLength: number; storeAs: string }
  | { type: 'hide-npc'; npcId: string }
  | { type: 'show-npc'; npcId: string }
  | { type: 'camera-pan'; x: number; y: number; durationMs: number }
  | { type: 'camera-follow-player' }
  | { type: 'freeze-player'; freeze: boolean }
  | { type: 'emote'; entityId: string; emote: 'exclamation' | 'question' | 'heart' | 'sweat' }
  | { type: 'remove-object'; objectId: string }
  | { type: 'teleport-entity'; entityId: string; x: number; y: number };

class CutsceneManager {
  private queue: CutsceneAction[];
  private isRunning: boolean;

  async play(steps: CutsceneAction[]): Promise<void>;
  private async executeStep(step: CutsceneAction): Promise<void>;
  skip(): void;
  get active(): boolean;
}
```

### 12.4 Conditional NPC System

NPCs need to behave differently based on game state flags.

```typescript
interface NPCData {
  id: string;
  spriteKey: string;
  position: { x: number; y: number };
  facing: Direction;
  movement?: NPCMovementPattern;

  // Dialog changes based on flags
  dialog: ConditionalDialog[];

  // Special behaviors
  healsParty?: boolean;
  givesItem?: { itemId: string; quantity: number; flag: string };
  trainerData?: {
    trainerId: string;
    defeatFlag: string;
    lineOfSight: number;
  };

  // Visibility conditions
  showCondition?: string;         // Flag expression: "has-starter" or "!has-starter"
  hideCondition?: string;
}

interface ConditionalDialog {
  condition?: string;             // Flag expression. null = default/fallback
  lines: string[];
  cutscene?: CutsceneAction[];    // Optional cutscene triggered after/instead of dialog
}

type NPCMovementPattern =
  | { type: 'stationary' }
  | { type: 'look-around'; interval: number }      // Randomly changes facing
  | { type: 'pace'; axis: 'x' | 'y'; distance: number; speed?: number }  // Walk back and forth
  | { type: 'wander'; radius: number };             // Random walk within radius
```

### 12.5 Rival System

```typescript
// Rival's starter is determined by player's choice
const RIVAL_COUNTER: Record<string, string> = {
  'bulbasaur': 'charmander',    // Player Grass → Rival Fire
  'charmander': 'squirtle',     // Player Fire → Rival Water
  'squirtle': 'bulbasaur',      // Player Water → Rival Grass
};

// Rival name stored in player flags: flag "rival-name" = <string>
// Rival starter stored in player flags: flag "rival-starter" = <species name>

// Trainer data for rival battles (trainers.json):
// "rival-pallet-town": { party based on rival-starter flag, level 5, tier 2 AI }
```

### 12.6 Starter Pokemon Details

All three starters at Level 5 with their default movesets:

| Starter | Type | Ability | Moves at Lv5 |
|---------|------|---------|---------------|
| Bulbasaur (#1) | Grass/Poison | Overgrow | Tackle, Growl |
| Charmander (#4) | Fire | Blaze | Scratch, Growl |
| Squirtle (#7) | Water | Torrent | Tackle, Tail Whip |

Generated with random IVs (0-31 each), random nature, and ability slot = normal1.

### 12.7 Tiled Map Editor Setup

**Tiled version**: 1.10+ (latest stable, free at mapeditor.org)

**Tileset requirements**:
- FRLG or HGSS style tilesets from Spriters Resource
- Import as image-based tileset in Tiled
- Tile size: 16×16 pixels
- Organize tilesets by theme: `outdoor.png`, `indoor.png`, `lab.png`

**Custom Types to define in Tiled** (Edit → Custom Types):

| Type Name | Properties |
|-----------|-----------|
| `warp` | `targetMap: string`, `targetX: int`, `targetY: int` |
| `npc` | `id: string`, `spriteKey: string`, `facing: string` |
| `sign` | `text: string` |
| `interaction` | `id: string` |
| `trigger` | `id: string`, `condition: string`, `cutsceneId: string` |
| `spawn` | `id: string` |

**Required tile layers per map** (in order, bottom to top):
1. `ground` — base terrain
2. `ground2` — paths, secondary ground
3. `buildings` — structures rendered below player
4. `above-player` — rooftops, tree canopy (rendered above player sprite)
5. `collision` — invisible collision markers (any tile = blocked)
6. `encounters` — invisible encounter zone markers

**Object layer**: `events` — contains all warps, NPCs, signs, triggers, spawns

**Export settings**: File → Export As → JSON Map Files (`.json`). Check "Embed Tilesets" for simpler loading.

### 12.8 Route 1

A simple vertical route connecting Pallet Town (south) to a dead end or future Viridian City (north).

**Wild encounters (Route 1)**:

| Pokemon | Level Range | Weight |
|---------|------------|--------|
| Pidgey | 2-5 | 50 |
| Rattata | 2-5 | 50 |

**Route features**:
- Tall grass patches (3-4 patches along the route)
- Ledges (one-way jumps going south)
- 1-2 NPC trainers (Youngster, Bug Catcher)
- 1 item on ground (Potion, one-time pickup)
- Sign at north end: "VIRIDIAN CITY — Coming Soon!" (or path loops back)

---

