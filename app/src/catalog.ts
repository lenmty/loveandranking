import cardsJson from '../cards.json';
import type { Card } from './types';

export const cards = cardsJson as Card[];
const defaultBase = import.meta.env.BASE_URL;
const assetBase = import.meta.env.VITE_ASSET_BASE_URL || defaultBase;

export function cardImageUrl(image: string): string {
  return `${assetBase.replace(/\/$/, '')}/${encodeURIComponent(image)}`;
}
