export interface Appearance {
  armor: number;
  accent: number;
  visor: number;
  headgear: 'none' | 'crest' | 'antenna';
  backpack: 'none' | 'jetpack' | 'cape';
}

export const DEFAULT_APPEARANCE: Appearance = Object.freeze({
  armor: 0xdde7df,
  accent: 0x4599ff,
  visor: 0x6ae6df,
  headgear: 'none',
  backpack: 'jetpack',
});

export const COLOR_SWATCHES = [
  { name: 'Cloud', value: 0xe4eef5 },
  { name: 'Graphite', value: 0x344b60 },
  { name: 'Lagoon', value: 0x49cec3 },
  { name: 'Sky', value: 0x4599ff },
  { name: 'Coral', value: 0xf77867 },
  { name: 'Tangerine', value: 0xffad48 },
  { name: 'Lime', value: 0xc5e56c },
  { name: 'Orchid', value: 0xba8be8 },
  { name: 'Rose', value: 0xf5a9ce },
  { name: 'Ice', value: 0xa4f6ff },
] as const;

/** A new, known-shape value suitable for saved settings and multiplayer packets. */
export function sanitizeAppearance(value: unknown): Appearance {
  const input = value !== null && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
  const color = (key: 'armor' | 'accent' | 'visor'): number => {
    const candidate = input[key];
    return typeof candidate === 'number' && Number.isInteger(candidate) && candidate >= 0 && candidate <= 0xffffff
      ? candidate
      : DEFAULT_APPEARANCE[key];
  };
  return {
    armor: color('armor'),
    accent: color('accent'),
    visor: color('visor'),
    headgear: input.headgear === 'none' || input.headgear === 'crest' || input.headgear === 'antenna'
      ? input.headgear : DEFAULT_APPEARANCE.headgear,
    backpack: input.backpack === 'none' || input.backpack === 'jetpack' || input.backpack === 'cape'
      ? input.backpack : DEFAULT_APPEARANCE.backpack,
  };
}
