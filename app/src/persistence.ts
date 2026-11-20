import type { Card } from './types';
import { characterOrder, createInitialState, reconcileMythPairPlacement, sortCards, tierPalette } from './state';
import type { AppState } from './state';
import type { SortMode } from './types';

const STORAGE_KEY = 'cardrank-state-v1';
const validCharacters = new Set(characterOrder);
const validCardTypes = new Set(['solar', 'lunar']);
const hexColorPattern = /^#(?:[\da-f]{3}|[\da-f]{4}|[\da-f]{6}|[\da-f]{8})$/i;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function validIds(value: unknown, cardIds: Set<string>): string[] | undefined {
  if (!Array.isArray(value)) return undefined;
  return value.filter((id): id is string => typeof id === 'string' && cardIds.has(id));
}

export function loadAppState(catalog: Card[]): AppState {
  const initial = createInitialState(catalog);
  try {
    const serialized = window.localStorage.getItem(STORAGE_KEY);
    if (!serialized) return initial;
    const saved: unknown = JSON.parse(serialized);
    if (!isRecord(saved) || saved.version !== 1) return initial;

    const cardIds = new Set(catalog.map((card) => card.id));
    const mode: SortMode = saved.sortMode === 'character-date'
      ? 'character-date'
      : saved.sortMode === 'rarity-date' ? 'rarity-date' : 'date-character';
    const direction = saved.dateDirection === 'desc' ? 'desc' : 'asc';
    const rawTiers = Array.isArray(saved.tiers) ? saved.tiers : initial.tiers;
    const tierRecords = rawTiers.filter((tier): tier is Record<string, unknown> =>
      isRecord(tier) && typeof tier.id === 'string' && typeof tier.name === 'string',
    ).slice(0, 10);
    const tierSeeds = tierRecords.length ? tierRecords : initial.tiers;
    const claimed = new Set<string>();
    const tiers = tierSeeds.map((tier, index) => {
      const tierCards = Array.isArray(tier.cards) ? [...new Set(tier.cards.filter((id): id is string =>
        typeof id === 'string' && cardIds.has(id),
      ))].filter((id) => !claimed.has(id)) : [];
      tierCards.forEach((id) => claimed.add(id));
      const name = String(tier.name).trim().slice(0, 70) || `Tier ${index + 1}`;
      const savedColor = typeof tier.color === 'string' && hexColorPattern.test(tier.color) ? tier.color : undefined;
      const defaultColor = initial.tiers.find((defaultTier) => defaultTier.id === tier.id)?.color;
      const color = savedColor ?? defaultColor ?? tierPalette[index % tierPalette.length];
      return { id: String(tier.id), name, color, cards: tierCards };
    });
    const poolFromStorage = [...new Set(validIds(saved.pool, cardIds) ?? initial.pool)];
    const pool = poolFromStorage.filter((id) => !claimed.has(id));
    const inPool = new Set(pool);
    const missing = catalog.map((card) => card.id).filter((id) => !claimed.has(id) && !inPool.has(id));
    const characters = Array.isArray(saved.characters)
      ? saved.characters.filter((value): value is string => typeof value === 'string' && validCharacters.has(value))
      : initial.characters;
    const rarities = Array.isArray(saved.rarities)
      ? saved.rarities.filter((value): value is number => value === 3 || value === 4 || value === 5)
      : initial.rarities;
    const normalizedSortMode = characters.length === 1 && mode === 'character-date'
      || rarities.length === 1 && mode === 'rarity-date'
      ? 'date-character'
      : mode;
    const poolManuallyOrdered = saved.poolManuallyOrdered === true && normalizedSortMode === mode;
    const completePool = poolManuallyOrdered
      ? [...pool, ...missing]
      : sortCards([...pool, ...missing], catalog, normalizedSortMode, direction);
    const mythGrouping = saved.mythGrouping === true;
    const reconciled = mythGrouping
      ? reconcileMythPairPlacement(completePool, tiers, catalog)
      : { pool: completePool, tiers };
    const types = Array.isArray(saved.types)
      ? saved.types.filter((value): value is string => typeof value === 'string' && validCardTypes.has(value))
      : initial.types;
    const themePreference = saved.themePreference === 'light' || saved.themePreference === 'dark' ? saved.themePreference : 'system';
    const languagePreference = saved.languagePreference === 'ru' || saved.languagePreference === 'en' ? saved.languagePreference : 'system';
    const resolvedTheme = themePreference === 'system' ? initial.theme : themePreference;
    const resolvedLanguage = languagePreference === 'system' ? initial.language : languagePreference;

    return {
      ...initial,
      tiers: reconciled.tiers,
      pool: reconciled.pool,
      poolManuallyOrdered,
      mythGrouping,
      sortMode: normalizedSortMode,
      dateDirection: direction,
      characters,
      rarities,
      types,
      search: typeof saved.search === 'string' ? saved.search.slice(0, 160) : '',
      theme: resolvedTheme,
      language: resolvedLanguage,
      themePreference,
      languagePreference,
    };
  } catch {
    return initial;
  }
}

export function persistAppState(state: AppState): void {
  const data = {
    version: 1,
    tiers: state.tiers,
    pool: state.pool,
    poolManuallyOrdered: state.poolManuallyOrdered,
    mythGrouping: state.mythGrouping,
    sortMode: state.sortMode,
    dateDirection: state.dateDirection,
    characters: state.characters,
    rarities: state.rarities,
    types: state.types,
    search: state.search,
    themePreference: state.themePreference,
    languagePreference: state.languagePreference,
  };
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
  } catch {
    // Keep the editor usable when storage is disabled or unavailable.
  }
}

