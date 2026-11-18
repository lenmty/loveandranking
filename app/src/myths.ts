import type { Card } from './types';

export interface CardDisplayUnit {
  card: Card;
  members: Card[];
  index: number;
  span: number;
}

export function cardDisplayUnits(ids: string[], cardsById: Map<string, Card>, groupMyths: boolean): CardDisplayUnit[] {
  const units: CardDisplayUnit[] = [];
  const seenMyths = new Set<string>();
  const seenCards = new Set<string>();

  ids.forEach((id, index) => {
    if (seenCards.has(id)) return;
    const card = cardsById.get(id);
    if (!card) return;
    if (!groupMyths || !card.myth) {
      seenCards.add(id);
    units.push({ card, members: [card], index, span: 1 });
      return;
    }

    const mythId = card.myth.id;
    if (seenMyths.has(mythId)) return;
    const members = ids
      .map((memberId) => cardsById.get(memberId))
      .filter((member): member is Card => member?.myth?.id === mythId);
    members.forEach((member) => seenCards.add(member.id));
    seenMyths.add(mythId);
    units.push({ card: members[0] ?? card, members: members.length ? members : [card], index, span: 1 });
  });

  return units.map((unit, unitIndex) => ({
    ...unit,
    span: (units[unitIndex + 1]?.index ?? ids.length) - unit.index,
  }));
}
