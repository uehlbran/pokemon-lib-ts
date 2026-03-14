# Pokemon Fan Game — UI, Save/Load & Audio Systems

> Battle UI layout, menus, party screen, bag/inventory, save/load, and audio management.

---

## 9. UI Systems

### 9.1 Dialog / Text Box

- Bottom of screen, full-width text box (classic Pokemon style)
- Typewriter text effect: characters appear one at a time
- Speed configurable: slow (~30ms/char), mid (~15ms/char), fast (~5ms/char)
- Press action key to: advance to next page, complete current line instantly, or dismiss
- Supports `\n` for line breaks, auto-wrapping at box width
- Choice prompts: Yes/No, or up to 4 options in a separate choice box

### 9.2 Battle UI Layout

```
┌──────────────────────────────────────────────┐
│  [Opponent Pokemon Sprite]                   │
│                                              │
│  ┌─────────────────────┐                     │
│  │ CHARIZARD    Lv.36  │ ← Opponent info box │
│  │ HP: ████████░░ 75%  │    (top-left)       │
│  │ [BRN]               │                     │
│  └─────────────────────┘                     │
│                                              │
│                     ┌─────────────────────┐   │
│                     │ BLASTOISE    Lv.34  │ ← Player info box  │
│                     │ HP: ██████████ 100% │    (bottom-right)  │
│                     │ 142 / 142           │                     │
│                     └─────────────────────┘                     │
│                          [Player Pokemon Sprite (back)]         │
│                                                                 │
│ ┌─────────────────────────────────────────────────────────────┐ │
│ │ What will BLASTOISE do?                                     │ │
│ │                                                             │ │
│ │   FIGHT        BAG                                          │ │
│ │   POKEMON      RUN                                          │ │
│ └─────────────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────────┘
```

### 9.3 Move Selection Sub-Menu

When "FIGHT" is selected:

```
┌─────────────────────────────────────────────┐
│  SURF           BITE                        │
│  ICE BEAM       SKULL BASH                  │
├─────────────────────────────────────────────┤
│  PP: 12/15    TYPE: Water                   │
└─────────────────────────────────────────────┘
```

- 4 move slots displayed in 2×2 grid
- Highlighted move shows PP and Type at bottom
- Disabled (greyed out) if PP = 0
- If all PP = 0, force Struggle

### 9.4 Party Screen

- Shows all 6 Pokemon (or fewer) in a list
- Each entry: sprite icon, name, level, HP bar, status icon
- Can reorder via drag or select-swap
- Select a Pokemon to: view Summary, give/take item, switch to front (in battle)

### 9.5 Bag / Inventory

- Organized by pockets: Items, Medicine, Pokeballs, TMs, Berries, Key Items
- Scrollable list within each pocket
- Use/Give/Toss actions per item
- In battle: only shows battle-usable items

---

## 10. Save/Load System

### Save Data Schema

```typescript
interface SaveData {
  version: string;                // "1.0.0" — for migration support
  timestamp: number;              // Date.now()
  player: {
    name: string;
    gender: 'male' | 'female';
    position: {
      map: string;
      x: number;
      y: number;
      facing: Direction;
    };
    party: PokemonInstance[];
    pc: PokemonInstance[];        // PC storage boxes
    bag: Record<string, number>;  // itemId → quantity
    money: number;
    badges: string[];
    pokedex: {
      seen: number[];             // Species IDs
      caught: number[];           // Species IDs
    };
    flags: Record<string, boolean>;  // Story flags, defeated trainers, picked up items
    playTime: number;             // Seconds
    rngState: number;             // Current PRNG state for continuity
  };
  options: GameOptions;
}

interface GameOptions {
  textSpeed: 'slow' | 'mid' | 'fast';
  battleAnimations: boolean;
  musicVolume: number;            // 0-100
  sfxVolume: number;              // 0-100
}
```

### Storage

- **localStorage** for v1 (singleplayer)
- Key: `pokemon-fan-game-save-{slot}` (slots 0, 1, 2)
- JSON.stringify/parse for serialization
- Max save size: ~500KB (well within localStorage limits for 151 Pokemon)
- Future: IndexedDB or server-side for multiplayer

### Save/Load Flow

```typescript
class SaveManager {
  save(slot: number, player: Player): void;
  load(slot: number): SaveData | null;
  delete(slot: number): void;
  hasSave(slot: number): boolean;
  getSlotPreview(slot: number): { name: string; badges: number; playTime: number; timestamp: number } | null;
}
```

---

## 11. Audio System

```typescript
class AudioManager {
  private currentBgm: string | null;
  private bgmVolume: number;
  private sfxVolume: number;

  // BGM: only one plays at a time. Crossfade on map change.
  playBgm(key: string, loop?: boolean): void;
  stopBgm(fadeMs?: number): void;
  pauseBgm(): void;
  resumeBgm(): void;

  // SFX: fire-and-forget, multiple can play simultaneously
  playSfx(key: string): void;

  // Pokemon cries
  playCry(speciesId: number): void;

  setVolume(bgm: number, sfx: number): void;
}
```

---

