export type EntryHazardType =
  | "stealth-rock" // Gen 4+
  | "spikes" // Gen 2+
  | "toxic-spikes" // Gen 4+
  | "sticky-web"; // Gen 6+

export type ScreenType = "reflect" | "light-screen" | "aurora-veil"; // Gen 7+

/** Max number of layers for stacking hazards */
export const HAZARD_MAX_LAYERS: Record<EntryHazardType, number> = {
  "stealth-rock": 1,
  spikes: 3,
  "toxic-spikes": 2,
  "sticky-web": 1,
} as const;
