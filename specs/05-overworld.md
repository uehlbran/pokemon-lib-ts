# Pokemon Fan Game — Overworld System

> Map system (Tiled integration), grid-based movement, wild encounters, NPC trainer line-of-sight.

---

## 8. Overworld System

### 8.1 Map System

Maps are created in **Tiled Map Editor** and exported as JSON.

**Tile Grid**: 16×16 pixels per tile.

**Required Tiled Layers** (by name, in order):

| Layer | Type | Purpose |
|-------|------|---------|
| `ground` | Tile | Base terrain |
| `ground2` | Tile | Paths, roads, secondary ground |
| `buildings` | Tile | Structures (rendered below player) |
| `above-player` | Tile | Tree canopy, rooftops (rendered above player) |
| `collision` | Tile | Invisible collision tiles (any non-empty tile = blocked) |
| `encounters` | Tile | Invisible encounter zone markers |
| `events` | Object | NPCs, warps, signs, items, triggers |

**Event Object Properties** (in Tiled Object Layer):

```typescript
// NPC
{ type: "npc", name: "trainer-1", x, y, properties: { trainerId: "bug-catcher-1", direction: "down", dialog: "I love bugs!" } }

// Warp
{ type: "warp", name: "door-1", x, y, width, height, properties: { targetMap: "house-1", targetX: 5, targetY: 8 } }

// Sign
{ type: "sign", name: "sign-1", x, y, properties: { text: "Welcome to Pallet Town!" } }

// Item pickup
{ type: "item", name: "item-1", x, y, properties: { itemId: "potion", quantity: 1, flag: "pallet-town-item-1" } }
```

### 8.2 Player Movement

- **Grid-based**: Player snaps to 16×16 tile grid
- **Smooth interpolation**: Lerp between tiles over ~180ms for walking, ~90ms for running
- **Input**: WASD or Arrow Keys. Hold Shift to run (or toggle)
- **Collision check**: Before moving, check target tile against collision layer + NPC positions
- **Facing**: Player faces direction of last input, even if movement is blocked

```typescript
class PlayerController {
  gridX: number;                 // Current tile X
  gridY: number;                 // Current tile Y
  facing: Direction;             // 'up' | 'down' | 'left' | 'right'
  isMoving: boolean;             // Currently interpolating between tiles
  isRunning: boolean;

  update(delta: number): void;   // Called every frame
  canMoveTo(x: number, y: number): boolean;
  startMove(direction: Direction): void;
}
```

### 8.3 Wild Encounters

```typescript
interface EncounterTable {
  routeId: string;
  method: 'walk' | 'surf' | 'fish-old' | 'fish-good' | 'fish-super';
  rate: number;                  // Encounter rate (0-255, checked each step in encounter zone)
  entries: EncounterEntry[];
}

interface EncounterEntry {
  speciesId: number;
  minLevel: number;
  maxLevel: number;
  weight: number;                // Relative probability weight
}

// On each step in an encounter zone:
// 1. Generate random 0-255
// 2. If < encounterTable.rate, trigger encounter
// 3. Select species based on weights
// 4. Generate level in [minLevel, maxLevel]
// 5. Create PokemonInstance with random IVs, nature, gender, ability
// 6. Transition to BattleScene
```

### 8.4 NPC Trainer Line-of-Sight

```typescript
// When player enters a tile, check all NPCs on the current map:
// 1. Is this NPC a trainer?
// 2. Has this trainer been defeated? (check player flags)
// 3. Is the player in this NPC's line of sight?
//    - Raycast in NPC's facing direction, up to N tiles (typically 3-5)
//    - Blocked by collision tiles
// 4. If spotted: NPC walks toward player → exclamation mark animation → dialog → battle
```

---

