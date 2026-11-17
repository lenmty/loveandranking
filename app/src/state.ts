import type { Card, SortMode, Tier } from './types';

export const characterOrder = ['Xavier', 'Zayne', 'Rafayel', 'Sylus', 'Caleb'];
export const tierPalette = [
  '#f3a2a8', '#f3c38f', '#f4dc8b', '#a8cba9', '#a7c7e7', '#c8b3de',
  '#d7d7d2', '#b9bec5', '#45484d', '#80b8b1',
];

export const initialTiers: Tier[] = [
  { id: 'tier-ssr', name: 'SSR', color: '#f3a2a8', cards: [] },
  { id: 'tier-sr', name: 'SR', color: '#f3c38f', cards: [] },
  { id: 'tier-r', name: 'R', color: '#f4dc8b', cards: [] },
  { id: 'tier-n', name: 'N', color: '#a8cba9', cards: [] },
  { id: 'tier-not-read', name: 'Not readed', color: '#c8c9cb', cards: [] },
  { id: 'tier-not-owned', name: 'Not owned', color: '#44474c', cards: [] },
];

export interface AppState {
  tiers: Tier[];
  pool: string[];
  poolManuallyOrdered: boolean;
  sortMode: SortMode;
  dateDirection: 'asc' | 'desc';
  characters: string[];
  rarities: number[];
  types: string[];
  search: string;
  theme: 'light' | 'dark';
  language: 'ru' | 'en';
  themePreference: 'system' | 'light' | 'dark';
  languagePreference: 'system' | 'ru' | 'en';
  selectedCard: string | null;
  dragging: string | null;
  dropTarget: { zone: string; index: number } | null;
  tierReorderId: string | null;
  notice: string | null;
}

export function sortCards(ids: string[], catalog: Card[], mode: SortMode, direction: 'asc' | 'desc'): string[] {
  const byId = new Map(catalog.map((card) => [card.id, card]));
  return [...ids].sort((leftId, rightId) => {
    const left = byId.get(leftId)!;
    const right = byId.get(rightId)!;
    const date = (left.releaseDate.localeCompare(right.releaseDate)) * (direction === 'asc' ? 1 : -1);
    const character = characterOrder.indexOf(left.character) - characterOrder.indexOf(right.character);
    const rarity = left.rarity - right.rarity;
    const type = (left.type === 'solar' ? 0 : 1) - (right.type === 'solar' ? 0 : 1);
    const name = left.name.localeCompare(right.name, undefined, { sensitivity: 'base' });
    return mode === 'date-character' ? (date || character || rarity || type || name) : (character || date || rarity || type || name);
  });
}

export function createInitialState(catalog: Card[]): AppState {
  const theme = typeof window !== 'undefined' && window.matchMedia?.('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  const language = typeof navigator !== 'undefined' && navigator.language.toLowerCase().startsWith('ru') ? 'ru' : 'en';
  return {
    tiers: initialTiers.map((tier) => ({ ...tier, cards: [...tier.cards] })),
    pool: sortCards(catalog.map((card) => card.id), catalog, 'date-character', 'asc'),
    poolManuallyOrdered: false,
    sortMode: 'date-character', dateDirection: 'asc',
    characters: [...characterOrder], rarities: [4, 5], types: ['solar'], search: '',
    theme, language, themePreference: 'system', languagePreference: 'system', selectedCard: null, dragging: null,
    dropTarget: null, tierReorderId: null, notice: null,
  };
}

export type Action =
  | { type: 'toggle-character'; value: string }
  | { type: 'toggle-rarity'; value: number }
  | { type: 'toggle-card-type'; value: string }
  | { type: 'search'; value: string }
  | { type: 'sort'; mode: SortMode; direction: 'asc' | 'desc' }
  | { type: 'toggle-theme' }
  | { type: 'toggle-language' }
  | { type: 'open-card'; id: string | null }
  | { type: 'rename-tier'; id: string; name: string }
  | { type: 'color-tier'; id: string; color: string }
  | { type: 'add-tier' }
  | { type: 'delete-tier'; id: string }
  | { type: 'start-tier-reorder'; id: string | null }
  | { type: 'move-tier'; from: number; to: number }
  | { type: 'move-card'; id: string; zone: string; index: number; source?: string }
  | { type: 'drag-state'; id: string | null; zone?: string; index?: number }
  | { type: 'notice'; value: string | null };

export function reducer(state: AppState, action: Action, catalog: Card[]): AppState {
  switch (action.type) {
    case 'toggle-character': {
      const active = state.characters.includes(action.value);
      return { ...state, characters: active ? state.characters.filter((value) => value !== action.value) : [...state.characters, action.value] };
    }
    case 'toggle-rarity': {
      const active = state.rarities.includes(action.value);
      return { ...state, rarities: active ? state.rarities.filter((value) => value !== action.value) : [...state.rarities, action.value] };
    }
    case 'toggle-card-type': {
      const active = state.types.includes(action.value);
      return { ...state, types: active ? state.types.filter((value) => value !== action.value) : [...state.types, action.value] };
    }
    case 'search': return { ...state, search: action.value };
    case 'sort': return {
      ...state,
      sortMode: action.mode,
      dateDirection: action.direction,
      pool: sortCards(state.pool, catalog, action.mode, action.direction),
      poolManuallyOrdered: false,
    };
    case 'toggle-theme': {
      const theme = state.theme === 'light' ? 'dark' : 'light';
      return { ...state, theme, themePreference: theme };
    }
    case 'toggle-language': {
      const language = state.language === 'ru' ? 'en' : 'ru';
      return { ...state, language, languagePreference: language };
    }
    case 'open-card': return { ...state, selectedCard: action.id };
    case 'rename-tier': return { ...state, tiers: state.tiers.map((tier) => tier.id === action.id ? { ...tier, name: action.name } : tier) };
    case 'color-tier': return { ...state, tiers: state.tiers.map((tier) => tier.id === action.id ? { ...tier, color: action.color } : tier) };
    case 'add-tier': {
      if (state.tiers.length >= 10) return state;
      const index = state.tiers.length;
      return { ...state, tiers: [...state.tiers, { id: `tier-${Date.now()}`, name: `Tier ${index + 1}`, color: tierPalette[index % tierPalette.length], cards: [] }] };
    }
    case 'delete-tier': {
      if (state.tiers.length <= 1) return state;
      const removed = state.tiers.find((tier) => tier.id === action.id);
      if (!removed) return state;
      const pool = state.poolManuallyOrdered
        ? [...removed.cards, ...state.pool]
        : sortCards([...state.pool, ...removed.cards], catalog, state.sortMode, state.dateDirection);
      return { ...state, pool, tiers: state.tiers.filter((tier) => tier.id !== action.id) };
    }
    case 'start-tier-reorder': return { ...state, tierReorderId: action.id };
    case 'move-tier': {
      if (action.from === action.to || action.to < 0 || action.to >= state.tiers.length) return state;
      const tiers = [...state.tiers];
      const [tier] = tiers.splice(action.from, 1);
      tiers.splice(action.to, 0, tier);
      return { ...state, tiers };
    }
    case 'move-card': {
      const source = action.source ?? (state.pool.includes(action.id) ? 'pool' : state.tiers.find((tier) => tier.cards.includes(action.id))?.id);
      if (!source || source === action.zone) {
        if (!source) return state;
      }
      const pool = state.pool.filter((id) => id !== action.id);
      const tiers = state.tiers.map((tier) => ({ ...tier, cards: tier.cards.filter((id) => id !== action.id) }));
      if (action.zone === 'pool' && source !== 'pool' && !state.poolManuallyOrdered) {
        return {
          ...state, pool: sortCards([...pool, action.id], catalog, state.sortMode, state.dateDirection),
          tiers, selectedCard: null, dragging: null, dropTarget: null,
        };
      }
      const destination = action.zone === 'pool'
        ? pool
        : tiers.find((tier) => tier.id === action.zone)?.cards;
      if (!destination) return state;
      const index = Math.max(0, Math.min(action.index, destination.length));
      destination.splice(index, 0, action.id);
      return {
        ...state, pool, tiers,
        poolManuallyOrdered: action.zone === 'pool' ? (state.poolManuallyOrdered || source === 'pool') : state.poolManuallyOrdered,
        selectedCard: null, dragging: null, dropTarget: null,
      };
    }
    case 'drag-state': return {
      ...state,
      dragging: action.id,
      dropTarget: action.zone ? { zone: action.zone, index: action.index ?? 0 } : null,
    };
    case 'notice': return { ...state, notice: action.value };
  }
}
