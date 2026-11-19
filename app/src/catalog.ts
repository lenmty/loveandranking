import cardsJson from '../cards.json';
import type { Card, Myth } from './types';

type ImportedCard = Omit<Card, 'myth'> & {
  myth?: Myth;
  mythName?: string;
  mythOrder?: number;
};

function normalizeMyth(card: ImportedCard): Myth | undefined {
  if (card.myth && typeof card.myth.id === 'string' && typeof card.myth.name === 'string') {
    return {
      id: card.myth.id,
      name: card.myth.name,
      ...(card.myth.part === 1 || card.myth.part === 2 ? { part: card.myth.part } : {}),
    };
  }
  if (!card.mythName?.trim()) return undefined;
  const name = card.mythName.trim();
  const id = `${card.character.toLocaleLowerCase('en')}:${name.normalize('NFKC').toLocaleLowerCase('en')}`;
  return {
    id,
    name,
    ...(card.mythOrder === 1 || card.mythOrder === 2 ? { part: card.mythOrder } : {}),
  };
}

export const cards: Card[] = (cardsJson as ImportedCard[]).map(({ mythName: _mythName, mythOrder: _mythOrder, ...card }) => ({
  ...card,
  myth: card.rarity === 5 && card.type === 'solar'
    ? normalizeMyth({ ...card, mythName: _mythName, mythOrder: _mythOrder })
    : undefined,
}));
const defaultBase = import.meta.env.BASE_URL;
const assetBase = import.meta.env.VITE_ASSET_BASE_URL || defaultBase;

export function cardImageUrl(image: string): string {
  return `${assetBase.replace(/\/$/, '')}/${encodeURIComponent(image)}`;
}
