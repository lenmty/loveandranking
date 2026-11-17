import type { Language } from './types';

export const copy = {
  ru: {
    title: 'CardRank', subtitle: 'Love and Deepspace', export: 'Экспорт PNG',
    addTier: 'Добавить уровень', pool: 'Карты', search: 'Поиск по названию',
    sortDate: 'Дата → персонаж', sortCharacter: 'Персонаж → дата',
    oldest: 'Сначала старые', newest: 'Сначала новые', filters: 'Фильтры',
    character: 'Персонаж', rarity: 'Редкость', type: 'Тип', all: 'Все',
    solar: 'Solar', lunar: 'Lunar', stars4: '4 звезды', stars5: '5 звёзд',
    emptyPool: 'Нет карточек по выбранным условиям', emptyTier: 'Перетащите карту сюда',
    moveTier: 'Изменить порядок уровня', deleteTier: 'Удалить уровень',
    renameTier: 'Название уровня', changeColor: 'Цвет уровня',
    moveTo: 'Переместить в уровень', returnPool: 'Вернуть в стопку', close: 'Закрыть',
    noCards: 'В стопке нет карточек', themeLight: 'Светлая тема', themeDark: 'Тёмная тема',
    language: 'Язык интерфейса', exportError: 'Не удалось подготовить PNG. Проверьте доступность изображений.',
  },
  en: {
    title: 'CardRank', subtitle: 'Love and Deepspace', export: 'Export PNG',
    addTier: 'Add tier', pool: 'Cards', search: 'Search by card name',
    sortDate: 'Date → character', sortCharacter: 'Character → date',
    oldest: 'Oldest first', newest: 'Newest first', filters: 'Filters',
    character: 'Character', rarity: 'Rarity', type: 'Type', all: 'All',
    solar: 'Solar', lunar: 'Lunar', stars4: '4 stars', stars5: '5 stars',
    emptyPool: 'No cards match these filters', emptyTier: 'Drop a card here',
    moveTier: 'Reorder tier', deleteTier: 'Delete tier',
    renameTier: 'Tier name', changeColor: 'Tier color', moveTo: 'Move to tier',
    returnPool: 'Return to pool', close: 'Close', noCards: 'No cards in the pool',
    themeLight: 'Light theme', themeDark: 'Dark theme', language: 'Interface language',
    exportError: 'Could not prepare the PNG. Check that card images are available.',
  },
} satisfies Record<Language, Record<string, string>>;

export const characterNames = {
  Xavier: { ru: 'Ксавьер', en: 'Xavier' },
  Zayne: { ru: 'Зейн', en: 'Zayne' },
  Rafayel: { ru: 'Рафаэль', en: 'Rafayel' },
  Sylus: { ru: 'Сайлас', en: 'Sylus' },
  Caleb: { ru: 'Калеб', en: 'Caleb' },
} satisfies Record<string, Record<Language, string>>;
