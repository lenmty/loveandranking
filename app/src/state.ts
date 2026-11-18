import type { Card, SortMode, Tier } from './types';

export const characterOrder = ['Xavier', 'Zayne', 'Rafayel', 'Sylus', 'Caleb'];
export const tierPalette = [
  '#f3a2a8', '#f3c38f', '#f4dc8b', '#a8cba9', '#a7c7e7', '#c8b3de',
  '#e9a7c5', '#c5d7a4', '#d7d7d2', '#b9bec5', '#45484d', '#80b8b1',
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
  mythGrouping: boolean;
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
  dropTarget: { zone: string; index: number; anchorId: string | null; after: boolean } | null;
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
    const rarity = right.rarity - left.rarity;
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
    mythGrouping: false,
    sortMode: 'date-character', dateDirection: 'asc',
    characters: [...characterOrder], rarities: [4, 5], types: ['solar'], search: '',
    theme, language, themePreference: 'system', languagePreference: 'system', selectedCard: null, dragging: null,
    dropTarget: null, tierReorderId: null, notice: null,
  };
}

export function reconcileMythPairPlacement(poolIds: string[], tiers: Tier[], catalog: Card[]) {
  const pool = [...poolIds];
  const nextTiers = tiers.map((tier) => ({ ...tier, cards: [...tier.cards] }));
  const groups = new Map<string, Set<string>>();
  for (const card of catalog) {
    if (!card.myth) continue;
    const group = groups.get(card.myth.id) ?? new Set<string>();
    group.add(card.id);
    groups.set(card.myth.id, group);
  }

  for (const groupIds of groups.values()) {
    const presentIds = [...groupIds].filter((id) => pool.includes(id) || nextTiers.some((tier) => tier.cards.includes(id)));
    if (presentIds.length < 2) continue;
    const occupiedTiers = nextTiers
      .map((tier, index) => ({ tier, index, members: tier.cards.filter((id) => groupIds.has(id)) }))
      .filter((entry) => entry.members.length > 0);

    if (occupiedTiers.length) {
      const winner = occupiedTiers[0];
      const firstId = winner.members[0];
      const orderedIds = [firstId, ...presentIds.filter((id) => id !== firstId)];
      const firstIndex = winner.tier.cards.indexOf(firstId);
      const insertionIndex = winner.tier.cards.slice(0, firstIndex).filter((id) => !groupIds.has(id)).length;
      for (const id of groupIds) {
        const poolIndex = pool.indexOf(id);
        if (poolIndex >= 0) pool.splice(poolIndex, 1);
      }
      for (const tier of nextTiers) tier.cards = tier.cards.filter((id) => !groupIds.has(id));
      nextTiers[winner.index].cards.splice(insertionIndex, 0, ...orderedIds);
      continue;
    }

    const orderedIds = pool.filter((id) => groupIds.has(id));
    const firstIndex = pool.findIndex((id) => groupIds.has(id));
    const insertionIndex = pool.slice(0, firstIndex).filter((id) => !groupIds.has(id)).length;
    for (const id of groupIds) {
      const poolIndex = pool.indexOf(id);
      if (poolIndex >= 0) pool.splice(poolIndex, 1);
    }
    pool.splice(insertionIndex, 0, ...orderedIds);
  }
  return { pool, tiers: nextTiers };
}

export type Action =
  | { type: 'toggle-character'; value: string }
  | { type: 'toggle-rarity'; value: number }
  | { type: 'toggle-card-type'; value: string }
  | { type: 'toggle-myth-grouping' }
  | { type: 'search'; value: string }
  | { type: 'sort'; mode: SortMode; direction: 'asc' | 'desc' }
  | { type: 'toggle-theme' }
  | { type: 'toggle-language' }
  | { type: 'open-card'; id: string | null }
  | { type: 'rename-tier'; id: string; name: string }
  | { type: 'color-tier'; id: string; color: string }
  | { type: 'add-tier' }
  | { type: 'delete-tier'; id: string }
  | { type: 'return-all-cards' }
  | { type: 'reset-ranking' }
  | { type: 'load-shared-ranking'; tiers: Tier[] }
  | { type: 'swap-myth-order'; id: string }
  | { type: 'start-tier-reorder'; id: string | null }
  | { type: 'move-tier'; from: number; to: number }
  | { type: 'move-card'; id: string; zone: string; index: number; source?: string }
  | { type: 'drag-state'; id: string | null; zone?: string; index?: number; anchorId?: string | null; after?: boolean }
  | { type: 'notice'; value: string | null };

export function reducer(state: AppState, action: Action, catalog: Card[]): AppState {
  switch (action.type) {
    case 'toggle-character': {
      const active = state.characters.includes(action.value);
      const characters = active ? state.characters.filter((value) => value !== action.value) : [...state.characters, action.value];
      if (characters.length === 1 && state.sortMode === 'character-date') {
        return {
          ...state,
          characters,
          sortMode: 'date-character',
          pool: sortCards(state.pool, catalog, 'date-character', state.dateDirection),
          poolManuallyOrdered: false,
        };
      }
      return { ...state, characters };
    }
    case 'toggle-rarity': {
      const active = state.rarities.includes(action.value);
      return { ...state, rarities: active ? state.rarities.filter((value) => value !== action.value) : [...state.rarities, action.value] };
    }
    case 'toggle-card-type': {
      const active = state.types.includes(action.value);
      return { ...state, types: active ? state.types.filter((value) => value !== action.value) : [...state.types, action.value] };
    }
    case 'toggle-myth-grouping': {
      const mythGrouping = !state.mythGrouping;
      if (!mythGrouping) return { ...state, mythGrouping };
      return { ...state, ...reconcileMythPairPlacement(state.pool, state.tiers, catalog), mythGrouping };
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
    case 'return-all-cards': return {
      ...state,
      tiers: state.tiers.map((tier) => ({ ...tier, cards: [] })),
      pool: sortCards(catalog.map((card) => card.id), catalog, state.sortMode, state.dateDirection),
      poolManuallyOrdered: false,
      selectedCard: null, dragging: null, dropTarget: null, tierReorderId: null,
    };
    case 'reset-ranking': return {
      ...state,
      tiers: initialTiers.map((tier) => ({ ...tier, cards: [] })),
      pool: sortCards(catalog.map((card) => card.id), catalog, state.sortMode, state.dateDirection),
      poolManuallyOrdered: false,
      selectedCard: null, dragging: null, dropTarget: null, tierReorderId: null,
    };
    case 'load-shared-ranking': {
      const tiers = action.tiers.map((tier) => ({ ...tier, cards: [...tier.cards] }));
      const assigned = new Set(tiers.flatMap((tier) => tier.cards));
      return {
        ...state,
        tiers,
        pool: sortCards(catalog.map((card) => card.id).filter((id) => !assigned.has(id)), catalog, state.sortMode, state.dateDirection),
        poolManuallyOrdered: false,
        mythGrouping: false,
        selectedCard: null, dragging: null, dropTarget: null, tierReorderId: null,
      };
    }
    case 'swap-myth-order': {
      const card = catalog.find((item) => item.id === action.id);
      if (!state.mythGrouping || !card?.myth) return state;
      const memberIds = new Set(catalog.filter((item) => item.myth?.id === card.myth?.id).map((item) => item.id));
      const poolMembers = state.pool.filter((id) => memberIds.has(id));
      if (poolMembers.length > 1) {
        const firstIndex = state.pool.findIndex((id) => memberIds.has(id));
        const nextPool = state.pool.filter((id) => !memberIds.has(id));
        nextPool.splice(firstIndex, 0, ...poolMembers.reverse());
        return { ...state, pool: nextPool, poolManuallyOrdered: true };
      }
      const owner = state.tiers.find((tier) => tier.cards.some((id) => memberIds.has(id)));
      if (!owner) return state;
      const tierMembers = owner.cards.filter((id) => memberIds.has(id));
      if (tierMembers.length < 2) return state;
      const firstIndex = owner.cards.findIndex((id) => memberIds.has(id));
      const tiers = state.tiers.map((tier) => tier.id === owner.id
        ? { ...tier, cards: tier.cards.filter((id) => !memberIds.has(id)) }
        : tier);
      tiers.find((tier) => tier.id === owner.id)!.cards.splice(firstIndex, 0, ...tierMembers.reverse());
      return { ...state, tiers };
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
      const card = catalog.find((item) => item.id === action.id);
      const movingIds = state.mythGrouping && card?.myth
        ? (source === 'pool' ? state.pool : state.tiers.find((tier) => tier.id === source)?.cards ?? [])
          .filter((id) => catalog.find((item) => item.id === id)?.myth?.id === card.myth?.id)
        : [action.id];
      const sourceCards = source === 'pool' ? state.pool : state.tiers.find((tier) => tier.id === source)?.cards ?? [];
      const sourceIndex = sourceCards.indexOf(action.id);
      const removedBeforeTarget = source === action.zone
        ? sourceCards.slice(0, Math.max(0, action.index)).filter((id) => movingIds.includes(id)).length
        : 0;
      const pool = state.pool.filter((id) => !movingIds.includes(id));
      const tiers = state.tiers.map((tier) => ({ ...tier, cards: tier.cards.filter((id) => !movingIds.includes(id)) }));
      if (action.zone === 'pool' && source !== 'pool' && !state.poolManuallyOrdered) {
        return {
          ...state, pool: sortCards([...pool, ...movingIds], catalog, state.sortMode, state.dateDirection),
          tiers, selectedCard: null, dragging: null, dropTarget: null,
        };
      }
      const destination = action.zone === 'pool'
        ? pool
        : tiers.find((tier) => tier.id === action.zone)?.cards;
      if (!destination) return state;
      const adjustedIndex = source === action.zone && sourceIndex >= 0
        ? action.index - removedBeforeTarget
        : action.index;
      const index = Math.max(0, Math.min(adjustedIndex, destination.length));
      destination.splice(index, 0, ...movingIds);
      return {
        ...state, pool, tiers,
        poolManuallyOrdered: action.zone === 'pool' ? (state.poolManuallyOrdered || source === 'pool') : state.poolManuallyOrdered,
        selectedCard: null, dragging: null, dropTarget: null,
      };
    }
    case 'drag-state': return {
      ...state,
      dragging: action.id,
      dropTarget: action.zone ? {
        zone: action.zone,
        index: action.index ?? 0,
        anchorId: action.anchorId ?? null,
        after: action.after ?? true,
      } : null,
    };
    case 'notice': return { ...state, notice: action.value };
  }
}
