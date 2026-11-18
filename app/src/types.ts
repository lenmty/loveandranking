export type Character = 'Xavier' | 'Zayne' | 'Rafayel' | 'Sylus' | 'Caleb';
export type CardType = 'solar' | 'lunar';

export interface Myth {
  id: string;
  name: string;
  part?: 1 | 2;
}

export interface Card {
  id: string;
  name: string;
  character: Character;
  rarity: 3 | 4 | 5;
  type: CardType;
  image: string;
  releaseDate: string;
  myth?: Myth;
}

export interface Tier {
  id: string;
  name: string;
  color: string;
  cards: string[];
}

export type SortMode = 'date-character' | 'character-date';
export type Language = 'ru' | 'en';
