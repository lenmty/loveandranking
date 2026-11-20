import { Fragment, useEffect, useLayoutEffect, useMemo, useReducer, useRef, useState } from 'react';
import type { CSSProperties, ReactNode } from 'react';
import { cards, cardImageUrl } from './catalog';
import { characterNames, copy } from './i18n';
import { reducer, sortCards, tierPalette } from './state';
import { loadAppState, persistAppState } from './persistence';
import { decodeSharedRanking, encodeSharedRanking, getShareFragment, hasCustomizedRanking, sameRanking } from './sharing';
import { cardDisplayUnits } from './myths';
import type { AppState } from './state';
import type { Card, Language, Tier } from './types';
import type { SharedRanking } from './sharing';

const characters = ['Xavier', 'Zayne', 'Rafayel', 'Sylus', 'Caleb'] as const;
type Confirmation = { type: 'delete-tier'; id: string } | { type: 'return-all' } | { type: 'full-reset' };
const tierLabelUsesLightText = (color: string) => ['#44474c', '#45484d'].includes(color.toLowerCase());
const exportFont = '700 14px Inter, -apple-system, BlinkMacSystemFont, sans-serif';
const exportLineHeight = 16.8;

function wrapCanvasText(context: CanvasRenderingContext2D, text: string, maxWidth: number) {
  const words = (text.trim() || ' ').split(/\s+/u);
  const lines: string[] = [];
  let line = '';
  for (const word of words) {
    const segments: string[] = [];
    let segment = '';
    for (const character of Array.from(word)) {
      const candidate = segment + character;
      if (segment && context.measureText(candidate).width > maxWidth) {
        segments.push(segment);
        segment = character;
      } else segment = candidate;
    }
    if (segment) segments.push(segment);
    for (const part of segments) {
      const candidate = line ? `${line} ${part}` : part;
      if (line && context.measureText(candidate).width > maxWidth) {
        lines.push(line);
        line = part;
      } else line = candidate;
    }
  }
  if (line) lines.push(line);
  return lines.length ? lines : [' '];
}

function Icon({ name, size = 18 }: { name: string; size?: number }) {
  const common = { width: size, height: size, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 1.8, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const, 'aria-hidden': true as const };
  const shapes: Record<string, ReactNode> = {
    download: <><path d="M12 3v12"/><path d="m7 10 5 5 5-5"/><path d="M5 20h14"/></>,
    share: <><circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><path d="m8.7 10.7 6.6-4.4m-6.6 7.1 6.6 4.4"/></>,
    plus: <><path d="M12 5v14M5 12h14"/></>,
    search: <><circle cx="10.8" cy="10.8" r="6.8"/><path d="m16 16 4 4"/></>,
    sun: <><circle cx="12" cy="12" r="4"/><path d="M12 2v2m0 16v2M4.93 4.93l1.42 1.42m11.3 11.3 1.42 1.42M2 12h2m16 0h2M4.93 19.07l1.42-1.42m11.3-11.3 1.42-1.42"/></>,
    moon: <path d="M20.8 14.1A8.7 8.7 0 0 1 9.9 3.2 8.8 8.8 0 1 0 20.8 14.1Z"/>,
    grip: <><circle cx="9" cy="6" r=".7" fill="currentColor"/><circle cx="15" cy="6" r=".7" fill="currentColor"/><circle cx="9" cy="12" r=".7" fill="currentColor"/><circle cx="15" cy="12" r=".7" fill="currentColor"/><circle cx="9" cy="18" r=".7" fill="currentColor"/><circle cx="15" cy="18" r=".7" fill="currentColor"/></>,
    trash: <><path d="M4 7h16M10 11v6m4-6v6M6 7l1 14h10l1-14M9 7V4h6v3"/></>,
    close: <><path d="m6 6 12 12M18 6 6 18"/></>,
    chevron: <path d="m9 18 6-6-6-6"/>,
    filter: <><path d="M4 5h16M7 12h10m-7 7h4"/><circle cx="8" cy="5" r="1.5" fill="var(--surface)"/><circle cx="15" cy="12" r="1.5" fill="var(--surface)"/><circle cx="11" cy="19" r="1.5" fill="var(--surface)"/></>,
    check: <path d="m5 12 4 4L19 6"/>,
    copy: <><rect x="8" y="8" width="12" height="12" rx="2"/><path d="M16 8V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h2"/></>,
    loader: <circle cx="12" cy="12" r="9" strokeDasharray="42 16"/>,
    arrow: <><path d="M7 7h10v10"/><path d="m17 7-10 10"/></>,
    myth: <><rect x="8" y="8" width="12" height="12"/><path d="M16 8V6H6v10h2"/></>,
    swap: <><path d="m16 3 4 4-4 4M4 7h16M8 21l-4-4 4-4m12 4H4"/></>,
  };
  return <svg {...common}>{shapes[name] ?? null}</svg>;
}

function labelForCharacter(card: Card, language: Language) {
  return characterNames[card.character][language];
}

function clearSharedRankFragment() {
  if (getShareFragment(window.location.hash) === null) return;
  window.history.replaceState(window.history.state, '', `${window.location.pathname}${window.location.search}`);
}

function sharedRankingNotice(shared: SharedRanking, t: Record<string, string>): string | null {
  return shared.skippedMemories ? t.shareSkipped.replace('{count}', String(shared.skippedMemories)) : null;
}

interface CardDropPosition {
  index: number;
  anchorId: string | null;
  after: boolean;
}

function cardDropPosition(container: HTMLElement, clientX: number, clientY: number): CardDropPosition {
  const items = [...container.querySelectorAll<HTMLElement>('[data-card-id]')]
    .filter((item) => item.getClientRects().length > 0);
  if (!items.length) {
    return { index: Number(container.dataset.dropCount ?? 0), anchorId: null, after: true };
  }

  const rows: HTMLElement[][] = [];
  for (const item of items) {
    const top = item.getBoundingClientRect().top;
    const row = rows[rows.length - 1];
    if (!row || Math.abs(row[0].getBoundingClientRect().top - top) > 3) rows.push([item]);
    else row.push(item);
  }

  const first = rows[0][0];
  if (clientY < first.getBoundingClientRect().top) {
    return { index: Number(first.dataset.cardIndex), anchorId: first.dataset.cardId ?? null, after: false };
  }

  let activeRow = rows[rows.length - 1];
  for (let rowIndex = 0; rowIndex < rows.length; rowIndex += 1) {
    const row = rows[rowIndex];
    const rowBottom = Math.max(...row.map((item) => item.getBoundingClientRect().bottom));
    const nextRowTop = rows[rowIndex + 1]
      ? Math.min(...rows[rowIndex + 1].map((item) => item.getBoundingClientRect().top))
      : Number.POSITIVE_INFINITY;
    if (clientY <= rowBottom) {
      activeRow = row;
      break;
    }
    if (clientY < nextRowTop) {
      const last = row[row.length - 1];
      return { index: Number(last.dataset.cardIndex) + Number(last.dataset.cardSpan ?? 1), anchorId: last.dataset.cardId ?? null, after: true };
    }
  }

  for (const item of activeRow) {
    const bounds = item.getBoundingClientRect();
    if (clientX < bounds.left + bounds.width / 2) {
      return { index: Number(item.dataset.cardIndex), anchorId: item.dataset.cardId ?? null, after: false };
    }
  }
  const last = activeRow[activeRow.length - 1];
  return { index: Number(last.dataset.cardIndex) + Number(last.dataset.cardSpan ?? 1), anchorId: last.dataset.cardId ?? null, after: true };
}

function TierRow({ tier, index, total, cardsById, groupMyths, reorderId, dropTarget, draggingId, dragSourceRemoved, t, language, onRename, onColor, onDelete, onTierPointerDown, onMove, onOpen, onDragStart }: {
  tier: Tier; index: number; total: number; cardsById: Map<string, Card>; reorderId: string | null;
  groupMyths: boolean;
  dropTarget: AppState['dropTarget']; draggingId: string | null; dragSourceRemoved: boolean;
  t: Record<string, string>; language: Language; onRename: (id: string, name: string) => void;
  onColor: (id: string, color: string) => void; onDelete: (id: string) => void;
  onTierPointerDown: (id: string, event: PointerEvent, handle: HTMLButtonElement) => void;
  onMove: (id: string, zone: string, index: number) => void; onOpen: (id: string) => void;
  onDragStart: (id: string, event: PointerEvent) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [draft, setDraft] = useState(tier.name);
  useEffect(() => { setDraft(tier.name); }, [tier.name]);
  const tierCards = cardDisplayUnits(tier.cards, cardsById, groupMyths);
  const darkLabel = tierLabelUsesLightText(tier.color);
  return <section className={`tier-row ${reorderId === tier.id ? 'tier-row--moving' : ''}`} data-tier-index={index}>
    <div className={`tier-label ${darkLabel ? 'tier-label--dark' : ''}`} style={{ '--tier-color': tier.color } as CSSProperties}>
      {editing ? <textarea autoFocus className="tier-name-input" aria-label={t.renameTier} maxLength={70} rows={1} value={draft}
        onChange={(event) => { setDraft(event.target.value); event.currentTarget.style.height = 'auto'; event.currentTarget.style.height = `${event.currentTarget.scrollHeight}px`; }}
        onFocus={(event) => { event.currentTarget.style.height = 'auto'; event.currentTarget.style.height = `${event.currentTarget.scrollHeight}px`; const end = event.currentTarget.value.length; event.currentTarget.setSelectionRange(end, end); }}
        onBlur={() => { onRename(tier.id, draft.trim() || tier.name); setEditing(false); }}
        onKeyDown={(event) => { if (event.key === 'Enter' && !event.shiftKey) { event.preventDefault(); event.currentTarget.blur(); } if (event.key === 'Escape') { setDraft(tier.name); event.currentTarget.blur(); } }} />
        : <button className="tier-name" type="button" onClick={() => setEditing(true)} aria-label={t.renameTier}>{tier.name}</button>}
    </div>
    <div className={`tier-content drop-zone ${dropTarget?.zone === tier.id ? 'is-drop-target' : ''}`} data-drop-zone={tier.id} data-drop-count={tier.cards.length}>
      {tierCards.map(({ card, members, index: cardIndex, span }) => <Fragment key={card.id}>
        {dropTarget?.zone === tier.id && dropTarget.anchorId === card.id && !dropTarget.after && <CardInsertionSlot tier/>}
        <CardTile card={card} pairCount={members.length} displaySpan={span} language={language} index={cardIndex} zone={tier.id} isDragging={draggingId === card.id} dragSourceRemoved={dragSourceRemoved && draggingId === card.id} onOpen={onOpen} onDragStart={onDragStart}/>
        {dropTarget?.zone === tier.id && dropTarget.anchorId === card.id && dropTarget.after && <CardInsertionSlot tier/>}
      </Fragment>)}
      {dropTarget?.zone === tier.id && dropTarget.anchorId === null && <CardInsertionSlot tier/>}
    </div>
    <div className="tier-actions" style={{ '--tier-color': tier.color } as CSSProperties}>
        <button className="icon-button tier-grip-rail" type="button" aria-label={t.moveTier} title={t.moveTier}
          aria-pressed={reorderId === tier.id}
          onPointerDown={(event) => { event.preventDefault(); onTierPointerDown(tier.id, event.nativeEvent, event.currentTarget); }}
          onKeyDown={(event) => {
            if (event.key !== 'ArrowUp' && event.key !== 'ArrowDown') return;
            event.preventDefault();
            onMove(tier.id, 'tier-order', Math.max(0, Math.min(total - 1, index + (event.key === 'ArrowUp' ? -1 : 1))));
          }}><Icon name="grip" size={17}/></button>
        <button className="icon-button tier-menu-trigger" type="button" aria-label={t.changeColor} title={t.changeColor} onClick={() => setMenuOpen(!menuOpen)}><span className="color-dot"/></button>
        {total > 1 && <button className="icon-button tier-delete" type="button" aria-label={t.deleteTier} title={t.deleteTier} onClick={() => onDelete(tier.id)}><Icon name="trash" size={15}/></button>}
      {menuOpen && <div className="palette-popover" role="group" aria-label={t.changeColor}>{tierPalette.map((color) => <button key={color} type="button" className={`palette-swatch ${color === tier.color ? 'is-selected' : ''}`} style={{ background: color }} aria-label={color} onClick={() => { onColor(tier.id, color); setMenuOpen(false); }}/>)}</div>}
    </div>
  </section>;
}

function CardInsertionSlot({ tier = false }: { tier?: boolean }) {
  return <span className={`card-insertion-slot ${tier ? 'card-insertion-slot--tier' : ''}`} aria-hidden="true"/>;
}

function CardTile({ card, pairCount = 1, displaySpan = 1, language, index, zone, isDragging, dragSourceRemoved, onOpen, onDragStart }: {
  pairCount?: number; displaySpan?: number;
  card: Card; language: Language; index: number; zone: string; isDragging: boolean; dragSourceRemoved: boolean;
  onOpen: (id: string) => void; onDragStart: (id: string, event: PointerEvent) => void;
}) {
  return <article className={`card-tile ${zone === 'pool' ? 'card-tile--pool' : 'card-tile--tier'} ${pairCount > 1 ? 'card-tile--myth-stack' : ''} ${isDragging ? 'card-tile--dragging' : ''} ${dragSourceRemoved ? 'card-tile--dragging-away' : ''}`} data-card-id={card.id} data-card-index={index} data-card-span={displaySpan} data-card-zone={zone}>
    {pairCount > 1 && <span className="myth-stack-layers" aria-hidden="true"><i/><i/></span>}
    <button className="card-image-button" type="button" onClick={() => onOpen(card.id)} aria-label={`${labelForCharacter(card, language)} — ${card.name}`}>
            <img className="card-image" src={cardImageUrl(card.image)} alt={`${labelForCharacter(card, language)} — ${card.name}`} loading="lazy" draggable={false} onContextMenu={(event) => event.preventDefault()}/>
    </button>
    <button className="card-drag-handle" type="button" aria-label={language === 'ru' ? 'Перетащить карточку' : 'Drag memory'} title={language === 'ru' ? 'Перетащить' : 'Drag'}
      onPointerDown={(event) => { event.preventDefault(); onDragStart(card.id, event.nativeEvent); }}><Icon name="grip" size={14}/></button>
  </article>;
}

export function App() {
  const [state, dispatchBase] = useReducer((current: AppState, action: Parameters<typeof reducer>[1]) => reducer(current, action, cards), undefined, () => loadAppState(cards));
  const [exporting, setExporting] = useState(false);
  const [confirmation, setConfirmation] = useState<Confirmation | null>(null);
  const [incomingRanking, setIncomingRanking] = useState<SharedRanking | null>(null);
  const [shareLink, setShareLink] = useState<string | null>(null);
  const [shareCopied, setShareCopied] = useState(false);
  const [shareCopyFailed, setShareCopyFailed] = useState(false);
  const [poolDockVisible, setPoolDockVisible] = useState(false);
  const [poolDockExpanded, setPoolDockExpanded] = useState(false);
  const [poolGridReserveHeight, setPoolGridReserveHeight] = useState(0);
  const [poolGridHeight, setPoolGridHeight] = useState<number | null>(null);
  const [dragPreview, setDragPreview] = useState<{ card: Card; pairCount: number; width: number; height: number; offsetX: number; offsetY: number; x: number; y: number } | null>(null);
  const dragPreviewElementRef = useRef<HTMLElement | null>(null);
  const dragPreviewOffsetRef = useRef<{ x: number; y: number } | null>(null);
  const dragOriginBoundsRef = useRef<DOMRect | null>(null);
  const dragSourceRemovedRef = useRef(false);
  const cardPointerIdRef = useRef<number | null>(null);
  const [dragSourceRemoved, setDragSourceRemoved] = useState(false);
  const cardDragStateKeyRef = useRef<string | null>(null);
  const poolGridRef = useRef<HTMLDivElement | null>(null);
  const poolGridAnchorRef = useRef<HTMLDivElement | null>(null);
  const poolGridViewportRef = useRef<HTMLDivElement | null>(null);
  const poolDockVisibleRef = useRef(false);
  const shareCopyButtonRef = useRef<HTMLButtonElement | null>(null);
  const shareCopyTimerRef = useRef<number | null>(null);
  const pendingPoolGridAnimationRef = useRef(false);
  const [tierInsertionBoundary, setTierInsertionBoundary] = useState<number | null>(null);
  const pointerRef = useRef<string | null>(null);
  const tierPressRef = useRef<{ id: string; pointerId: number } | null>(null);
  const tierInsertionRef = useRef<number | null>(null);
  const tiersRef = useRef(state.tiers);
  tiersRef.current = state.tiers;
  const stateRef = useRef(state);
  stateRef.current = state;
  const shareLinkInputRef = useRef<HTMLInputElement | null>(null);
  const dispatch = dispatchBase;
  const t = copy[state.language];
  const cardsById = useMemo(() => new Map(cards.map((card) => [card.id, card])), []);
  const poolUnits = useMemo(() => cardDisplayUnits(state.pool, cardsById, state.mythGrouping), [state.pool, cardsById, state.mythGrouping]);
  const visiblePool = useMemo(() => {
    const query = state.search.trim().toLocaleLowerCase();
    return poolUnits.filter((unit) => unit.members.some((card) =>
      state.characters.includes(card.character) && state.rarities.includes(card.rarity) && state.types.includes(card.type)
      && (card.name.toLocaleLowerCase().includes(query) || card.myth?.name.toLocaleLowerCase().includes(query)),
    ));
  }, [poolUnits, state.characters, state.rarities, state.types, state.search]);
  const hasMythPairs = useMemo(() => {
    const counts = new Map<string, number>();
    cards.forEach((card) => { if (card.myth) counts.set(card.myth.id, (counts.get(card.myth.id) ?? 0) + 1); });
    return [...counts.values()].some((count) => count > 1);
  }, []);
  const selected = state.selectedCard ? cardsById.get(state.selectedCard) : undefined;
  const selectedTier = state.selectedCard ? state.tiers.find((tier) => tier.cards.includes(state.selectedCard!)) : undefined;
  const selectedPack = selected && state.mythGrouping && selected.myth
    ? (selectedTier?.cards ?? state.pool).filter((id) => cardsById.get(id)?.myth?.id === selected.myth?.id).map((id) => cardsById.get(id)!)
    : selected ? [selected] : [];
  const pendingDeleteTier = confirmation?.type === 'delete-tier'
    ? state.tiers.find((tier) => tier.id === confirmation.id)
    : undefined;
  const confirmationTitle = confirmation?.type === 'delete-tier'
    ? t.deleteTierQuestion.replace('{name}', pendingDeleteTier?.name ?? '')
    : confirmation?.type === 'return-all' ? t.returnAllQuestion : confirmation?.type === 'full-reset' ? t.fullResetQuestion : '';
  const confirmationDescription = confirmation?.type === 'delete-tier'
    ? pendingDeleteTier?.cards.length ? t.deleteTierHasCards : null
    : confirmation?.type === 'return-all' ? t.returnAllMessage : confirmation?.type === 'full-reset' ? t.fullResetMessage : null;

  useEffect(() => {
    document.documentElement.dataset.theme = state.theme;
    document.documentElement.lang = state.language;
    document.querySelector('meta[name="theme-color"]')?.setAttribute('content', state.theme === 'dark' ? '#17191d' : '#f5f5f2');
  }, [state.theme, state.language]);
  useEffect(() => {
    let active = true;
    const loadFromCurrentHash = () => {
      const hash = window.location.hash;
      if (getShareFragment(hash) === null) {
        setIncomingRanking(null);
        return;
      }
      void decodeSharedRanking(hash, cards).then((shared) => {
        if (!active || window.location.hash !== hash) return;
        const current = stateRef.current;
        if (!hasCustomizedRanking(current.tiers) || sameRanking(current.tiers, shared.tiers)) {
          if (!sameRanking(current.tiers, shared.tiers)) dispatch({ type: 'load-shared-ranking', tiers: shared.tiers });
          else if (current.mythGrouping) dispatch({ type: 'toggle-myth-grouping' });
          const notice = sharedRankingNotice(shared, copy[current.language]);
          if (notice) dispatch({ type: 'notice', value: notice });
          clearSharedRankFragment();
        } else setIncomingRanking(shared);
      }).catch(() => {
        if (!active || window.location.hash !== hash) return;
        clearSharedRankFragment();
        dispatch({ type: 'notice', value: copy[stateRef.current.language].shareInvalid });
      });
    };
    loadFromCurrentHash();
    window.addEventListener('hashchange', loadFromCurrentHash);
    return () => {
      active = false;
      window.removeEventListener('hashchange', loadFromCurrentHash);
    };
  }, []);
  useEffect(() => {
    persistAppState(state);
  }, [state.tiers, state.pool, state.poolManuallyOrdered, state.mythGrouping, state.sortMode, state.dateDirection, state.characters, state.rarities, state.types, state.search, state.themePreference, state.languagePreference]);
  useEffect(() => {
    if (!state.notice) return;
    const timer = window.setTimeout(() => dispatch({ type: 'notice', value: null }), 5000);
    return () => window.clearTimeout(timer);
  }, [state.notice]);
  useEffect(() => {
    if (!incomingRanking) return;
    const previousFocus = document.activeElement as HTMLElement | null;
    document.querySelector<HTMLElement>('.share-dialog-secondary')?.focus();
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setIncomingRanking(null);
        clearSharedRankFragment();
      }
    };
    document.addEventListener('keydown', closeOnEscape);
    return () => {
      document.removeEventListener('keydown', closeOnEscape);
      previousFocus?.focus();
    };
  }, [incomingRanking]);
  useEffect(() => {
    if (!shareLink) return;
    shareCopyButtonRef.current?.focus();
  }, [shareLink]);
  useLayoutEffect(() => {
    if (!pendingPoolGridAnimationRef.current) return;
    pendingPoolGridAnimationRef.current = false;
    const grid = poolGridRef.current;
    if (!grid) return;
    const targetHeight = grid.scrollHeight;
    const frame = window.requestAnimationFrame(() => setPoolGridHeight(targetHeight));
    const timer = window.setTimeout(() => setPoolGridHeight(null), 320);
    return () => {
      window.cancelAnimationFrame(frame);
      window.clearTimeout(timer);
    };
  }, [state.characters, state.rarities, state.types]);
  useEffect(() => {
    if (!selected) return;
    const previousFocus = document.activeElement as HTMLElement | null;
    const body = document.body;
    const scrollY = window.scrollY;
    const previousBodyStyles = {
      position: body.style.position,
      top: body.style.top,
      left: body.style.left,
      right: body.style.right,
      width: body.style.width,
      overflow: body.style.overflow,
      paddingRight: body.style.paddingRight,
    };
    const scrollbarWidth = window.innerWidth - document.documentElement.clientWidth;
    body.style.position = 'fixed';
    body.style.top = `-${scrollY}px`;
    body.style.left = '0';
    body.style.right = '0';
    body.style.width = '100%';
    body.style.overflow = 'hidden';
    if (scrollbarWidth > 0) body.style.paddingRight = `${scrollbarWidth}px`;
    const closeButton = document.querySelector<HTMLElement>('.modal-close');
    closeButton?.focus();
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') dispatch({ type: 'open-card', id: null });
    };
    const preventBackgroundScroll = (event: TouchEvent) => {
      const target = event.target;
      if (!(target instanceof Element) || !target.closest('.card-modal')) event.preventDefault();
    };
    document.addEventListener('keydown', closeOnEscape);
    document.addEventListener('touchmove', preventBackgroundScroll, { passive: false });
    return () => {
      document.removeEventListener('keydown', closeOnEscape);
      document.removeEventListener('touchmove', preventBackgroundScroll);
      body.style.position = previousBodyStyles.position;
      body.style.top = previousBodyStyles.top;
      body.style.left = previousBodyStyles.left;
      body.style.right = previousBodyStyles.right;
      body.style.width = previousBodyStyles.width;
      body.style.overflow = previousBodyStyles.overflow;
      body.style.paddingRight = previousBodyStyles.paddingRight;
      window.scrollTo(0, scrollY);
      previousFocus?.focus();
    };
  }, [selected?.id]);
  useEffect(() => {
    if (!confirmation) return;
    const previousFocus = document.activeElement as HTMLElement | null;
    document.querySelector<HTMLElement>('.confirm-secondary')?.focus();
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setConfirmation(null);
    };
    document.addEventListener('keydown', closeOnEscape);
    return () => {
      document.removeEventListener('keydown', closeOnEscape);
      previousFocus?.focus();
    };
  }, [confirmation?.type, confirmation?.type === 'delete-tier' ? confirmation.id : null]);
  useEffect(() => {
    const findTierBoundary = (clientY: number): number | null => {
      const list = document.querySelector<HTMLElement>('.tier-list');
      if (!list) return null;
      const bounds = list.getBoundingClientRect();
      if (clientY < bounds.top - 12 || clientY > bounds.bottom + 12) return null;
      const rows = [...list.querySelectorAll<HTMLElement>('[data-tier-index]')];
      for (const row of rows) {
        const rowBounds = row.getBoundingClientRect();
        if (clientY < rowBounds.top + rowBounds.height / 2) return Number(row.dataset.tierIndex);
      }
      return rows.length;
    };
    const clearTierPress = (event?: PointerEvent, commit = false) => {
      const press = tierPressRef.current;
      if (!press || (event && event.pointerId !== press.pointerId)) return;
      const boundary = event ? findTierBoundary(event.clientY) : tierInsertionRef.current;
      if (commit && boundary !== null) {
        const from = tiersRef.current.findIndex((tier) => tier.id === press.id);
        const to = boundary > from ? boundary - 1 : boundary;
        if (from >= 0 && to >= 0) dispatch({ type: 'move-tier', from, to });
      }
      tierPressRef.current = null;
      tierInsertionRef.current = null;
      setTierInsertionBoundary(null);
      dispatch({ type: 'start-tier-reorder', id: null });
    };
    const setCardDragState = (draggedId: string, target?: { zone: string; index: number; anchorId: string | null; after: boolean }) => {
      const key = target
        ? `${draggedId}|${target.zone}|${target.index}|${target.anchorId ?? ''}|${target.after ? 1 : 0}`
        : `${draggedId}|none`;
      if (cardDragStateKeyRef.current === key) return;
      cardDragStateKeyRef.current = key;
      dispatch(target ? { type: 'drag-state', id: draggedId, ...target } : { type: 'drag-state', id: draggedId });
    };
    const updateCardDropTarget = (clientX: number, clientY: number, movePreview: boolean, allowSourceRemoval: boolean) => {
      const draggedId = pointerRef.current;
      if (!draggedId) return;
      const origin = dragOriginBoundsRef.current;
      const previewOffset = dragPreviewOffsetRef.current;
      const dropX = origin && previewOffset ? clientX - previewOffset.x + origin.width / 2 : clientX;
      const dropY = origin && previewOffset ? clientY - previewOffset.y + origin.height / 2 : clientY;
      const draggedCard = [...document.querySelectorAll<HTMLElement>('[data-card-id]')]
        .find((item) => item.dataset.cardId === draggedId);
      const sourceBounds = !dragSourceRemovedRef.current
        ? draggedCard?.getBoundingClientRect() ?? origin
        : origin;
      if (allowSourceRemoval && sourceBounds && !dragSourceRemovedRef.current && (dropX < sourceBounds.left || dropX > sourceBounds.right || dropY < sourceBounds.top || dropY > sourceBounds.bottom)) {
        dragSourceRemovedRef.current = true;
        setDragSourceRemoved(true);
      }
      if (movePreview && previewOffset && dragPreviewElementRef.current) {
        dragPreviewElementRef.current.style.transform = `translate3d(${clientX - previewOffset.x}px, ${clientY - previewOffset.y}px, 0)`;
      }
      if (!dragSourceRemovedRef.current) {
        setCardDragState(draggedId);
        return;
      }
      const target = document.elementFromPoint(dropX, dropY)?.closest<HTMLElement>('[data-drop-zone]');
      if (target) {
        const targetId = target.dataset.dropZone!;
        const position = cardDropPosition(target, dropX, dropY);
        const sourceZone = draggedCard?.dataset.cardZone;
        const sourceIndex = Number(draggedCard?.dataset.cardIndex ?? -1);
        const finalIndex = sourceZone === targetId && sourceIndex >= 0 && sourceIndex < position.index
          ? position.index - 1
          : position.index;
        const normalizedPosition = { ...position, zone: targetId };
        if (sourceZone === targetId && sourceIndex === finalIndex && !dragSourceRemovedRef.current) setCardDragState(draggedId);
        else setCardDragState(draggedId, normalizedPosition);
      } else setCardDragState(draggedId);
    };
    const updateTierInsertion = (clientY: number) => {
      const press = tierPressRef.current;
      if (!press) return;
      const boundary = findTierBoundary(clientY);
      tierInsertionRef.current = boundary;
      const from = tiersRef.current.findIndex((tier) => tier.id === press.id);
      const destination = boundary === null ? null : boundary > from ? boundary - 1 : boundary;
      const visibleBoundary = destination === from ? null : boundary;
      setTierInsertionBoundary((current) => current === visibleBoundary ? current : visibleBoundary);
    };
    const handlePointerMove = (event: PointerEvent) => {
      const tierPress = tierPressRef.current;
      if (tierPress && tierPress.pointerId === event.pointerId) {
        updateTierInsertion(event.clientY);
      }
      if (!pointerRef.current || event.pointerId !== cardPointerIdRef.current) return;
      updateCardDropTarget(event.clientX, event.clientY, true, true);
    };
    const handlePointerUp = (event: PointerEvent) => {
      if (tierPressRef.current?.pointerId === event.pointerId) clearTierPress(event, true);
      const draggedId = pointerRef.current;
      if (!draggedId || event.pointerId !== cardPointerIdRef.current) return;
      updateCardDropTarget(event.clientX, event.clientY, false, false);
      if (dragSourceRemovedRef.current) {
        const origin = dragOriginBoundsRef.current;
        const offset = dragPreviewOffsetRef.current;
        const dropX = origin && offset ? event.clientX - offset.x + origin.width / 2 : event.clientX;
        const dropY = origin && offset ? event.clientY - offset.y + origin.height / 2 : event.clientY;
        const target = document.elementFromPoint(dropX, dropY)?.closest<HTMLElement>('[data-drop-zone]');
        if (target) {
          const position = cardDropPosition(target, dropX, dropY);
          dispatch({ type: 'move-card', id: draggedId, zone: target.dataset.dropZone!, index: position.index });
        } else dispatch({ type: 'drag-state', id: null });
      } else dispatch({ type: 'drag-state', id: null });
      pointerRef.current = null;
      cardPointerIdRef.current = null;
      cardDragStateKeyRef.current = null;
      setDragPreview(null);
      dragPreviewElementRef.current = null;
      dragPreviewOffsetRef.current = null;
      dragOriginBoundsRef.current = null;
      dragSourceRemovedRef.current = false;
      setDragSourceRemoved(false);
      document.body.classList.remove('is-dragging-card');
    };
    const handlePointerCancel = (event: PointerEvent) => {
      if (tierPressRef.current?.pointerId === event.pointerId) clearTierPress(event);
      if (!pointerRef.current || event.pointerId !== cardPointerIdRef.current) return;
      pointerRef.current = null;
      cardPointerIdRef.current = null;
      cardDragStateKeyRef.current = null;
      setDragPreview(null);
      dragPreviewElementRef.current = null;
      dragPreviewOffsetRef.current = null;
      dragOriginBoundsRef.current = null;
      dragSourceRemovedRef.current = false;
      setDragSourceRemoved(false);
      document.body.classList.remove('is-dragging-card');
      dispatch({ type: 'drag-state', id: null });
    };
    window.addEventListener('pointermove', handlePointerMove);
    window.addEventListener('pointerup', handlePointerUp);
    window.addEventListener('pointercancel', handlePointerCancel);
    return () => {
      window.removeEventListener('pointermove', handlePointerMove);
      window.removeEventListener('pointerup', handlePointerUp);
      window.removeEventListener('pointercancel', handlePointerCancel);
      document.body.classList.remove('is-dragging-card');
    };
  }, []);

  useEffect(() => {
    const grid = poolGridRef.current;
    const anchor = poolGridAnchorRef.current;
    if (!grid || !anchor) return;
    const mobile = window.matchMedia('(max-width: 640px)');
    const updateDockVisibility = () => {
      if (!mobile.matches) {
        if (poolDockVisibleRef.current && poolGridViewportRef.current) poolGridViewportRef.current.scrollTop = 0;
        poolDockVisibleRef.current = false;
        setPoolDockVisible(false);
        setPoolGridReserveHeight(0);
        return;
      }
      const shouldDock = anchor.getBoundingClientRect().top >= window.innerHeight;
      const naturalHeight = grid.scrollHeight;
      setPoolGridReserveHeight((current) => shouldDock && Math.abs(current - naturalHeight) > 1 ? naturalHeight : shouldDock ? current : 0);
      if (poolDockVisibleRef.current && !shouldDock && poolGridViewportRef.current) poolGridViewportRef.current.scrollTop = 0;
      poolDockVisibleRef.current = shouldDock;
      setPoolDockVisible(shouldDock);
    };
    updateDockVisibility();
    window.addEventListener('scroll', updateDockVisibility, { passive: true });
    window.addEventListener('resize', updateDockVisibility);
    const observer = new ResizeObserver(updateDockVisibility);
    observer.observe(grid);
    return () => {
      window.removeEventListener('scroll', updateDockVisibility);
      window.removeEventListener('resize', updateDockVisibility);
      observer.disconnect();
    };
  }, []);

  const handleCardDrop = (id: string, zone: string, index: number) => dispatch({ type: 'move-card', id, zone, index });
  const beginCardDrag = (id: string, event: PointerEvent) => {
    if (cardPointerIdRef.current !== null || tierPressRef.current !== null) return;
    pointerRef.current = id;
    cardPointerIdRef.current = event.pointerId;
    cardDragStateKeyRef.current = `${id}|none`;
    const tile = event.target instanceof Element ? event.target.closest<HTMLElement>('.card-tile') : null;
    const bounds = tile?.getBoundingClientRect();
    const card = cardsById.get(id);
    dragOriginBoundsRef.current = bounds ?? null;
    dragSourceRemovedRef.current = false;
    setDragSourceRemoved(false);
    if (bounds && card) {
      const offsetX = event.clientX - bounds.left;
      const offsetY = event.clientY - bounds.top;
      dragPreviewOffsetRef.current = { x: offsetX, y: offsetY };
      const sourceIds = state.pool.includes(id) ? state.pool : state.tiers.find((tier) => tier.cards.includes(id))?.cards ?? [];
      const pairCount = state.mythGrouping && card.myth
        ? sourceIds.filter((memberId) => cardsById.get(memberId)?.myth?.id === card.myth?.id).length
        : 1;
      setDragPreview({ card, pairCount, width: bounds.width, height: bounds.height, offsetX, offsetY, x: bounds.left, y: bounds.top });
      document.body.classList.add('is-dragging-card');
    }
    dispatch({ type: 'drag-state', id });
  };
  const beginTierPointer = (id: string, event: PointerEvent, handle: HTMLButtonElement) => {
    if (cardPointerIdRef.current !== null || tierPressRef.current !== null) return;
    tierPressRef.current = { id, pointerId: event.pointerId };
    tierInsertionRef.current = null;
    setTierInsertionBoundary(null);
    handle.setPointerCapture(event.pointerId);
    dispatch({ type: 'start-tier-reorder', id });
  };

  const renderTierCard = (tier: Tier, index: number, total: number) => (
    <TierRow key={tier.id} tier={tier} index={index} total={total} cardsById={cardsById} groupMyths={state.mythGrouping} reorderId={state.tierReorderId}
      dropTarget={state.dropTarget} draggingId={state.dragging} dragSourceRemoved={dragSourceRemoved} t={t} language={state.language}
      onRename={(id, name) => dispatch({ type: 'rename-tier', id, name })}
      onColor={(id, color) => dispatch({ type: 'color-tier', id, color })}
      onDelete={(id) => setConfirmation({ type: 'delete-tier', id })}
      onTierPointerDown={beginTierPointer}
      onMove={(id, zone, targetIndex) => zone === 'tier-order'
        ? dispatch({ type: 'move-tier', from: state.tiers.findIndex((item) => item.id === id), to: targetIndex })
        : handleCardDrop(id, zone, targetIndex)}
      onOpen={(id) => dispatch({ type: 'open-card', id })}
      onDragStart={beginCardDrag}
    />
  );

  const exportPng = async () => {
    setExporting(true);
    try {
      const width = 1140;
      const padding = 24;
      const labelWidth = 157;
      const labelTextWidth = labelWidth - 22;
      const cardSize = 80;
      const gap = 4;
      const contentInset = 3;
      const contentWidth = width - padding * 2 - labelWidth - contentInset;
      const columns = Math.max(1, Math.floor((contentWidth + gap) / (cardSize + gap)));
      const unitsByTier = new Map(state.tiers.map((tier) => [tier.id, cardDisplayUnits(tier.cards, cardsById, state.mythGrouping)]));
      const measureCanvas = document.createElement('canvas');
      const measureContext = measureCanvas.getContext('2d');
      if (!measureContext) throw new Error('Canvas unavailable');
      measureContext.font = exportFont;
      const tierLines = new Map(state.tiers.map((tier) => [tier.id, wrapCanvasText(measureContext, tier.name, labelTextWidth)]));
      const tierHeightOf = (tier: Tier) => {
        const cardRows = Math.max(1, Math.ceil((unitsByTier.get(tier.id)?.length ?? 0) / columns));
        const cardHeight = cardRows * cardSize + (cardRows - 1) * gap;
        const lines = tierLines.get(tier.id) ?? [' '];
        const nameBoxHeight = Math.max(34, lines.length * exportLineHeight + 12);
        return Math.max(cardSize, cardHeight, nameBoxHeight + 16);
      };
      const rowGap = 10;
      const height = padding * 2 + state.tiers.reduce((sum, tier) => sum + tierHeightOf(tier), 0) + Math.max(0, state.tiers.length - 1) * rowGap;
      const exportSiteUrl = new URL(window.location.href);
      exportSiteUrl.search = '';
      exportSiteUrl.hash = '';
      if (exportSiteUrl.pathname.endsWith('/index.html')) {
        exportSiteUrl.pathname = exportSiteUrl.pathname.slice(0, -'index.html'.length);
      }
      if (!exportSiteUrl.pathname.endsWith('/')) exportSiteUrl.pathname += '/';
      const exportCredit = `${state.language === 'ru' ? 'Рейтинг воспоминаний Love and Deepspace · LoveAndRanking' : 'Love and Deepspace memory ranking · LoveAndRanking'} · ${exportSiteUrl.host}${exportSiteUrl.pathname}`;
      const canvas = document.createElement('canvas');
      canvas.width = width; canvas.height = height;
      const context = canvas.getContext('2d');
      if (!context) throw new Error('Canvas unavailable');
      const dark = state.theme === 'dark';
      const rowFill = dark ? 'rgba(37,40,45,.8)' : 'rgba(255,255,255,.76)';
      const rowLine = dark ? 'rgba(233,237,233,.09)' : 'rgba(39,42,45,.1)';
      context.fillStyle = dark ? '#17191d' : '#f5f5f2';
      context.fillRect(0, 0, width, height);
      const loadedImages = new Map<string, HTMLImageElement>();
      const exportIds = new Set([...unitsByTier.values()].flatMap((units) => units.map((unit) => unit.card.id)));
      await Promise.all(cards.filter((card) => exportIds.has(card.id)).map((card) => new Promise<void>((resolve, reject) => {
        const image = new Image(); image.crossOrigin = 'anonymous'; image.onload = () => { loadedImages.set(card.id, image); resolve(); }; image.onerror = reject; image.src = cardImageUrl(card.image);
      })));
      let y = padding;
      state.tiers.forEach((tier) => {
        const tierHeight = tierHeightOf(tier);
        const rowX = padding;
        const rowWidth = width - padding * 2;
        context.fillStyle = rowFill;
        context.beginPath(); context.roundRect(rowX, y, rowWidth, tierHeight, 12); context.fill();
        context.strokeStyle = rowLine;
        context.lineWidth = 1;
        context.beginPath(); context.roundRect(rowX + .5, y + .5, rowWidth - 1, tierHeight - 1, 11.5); context.stroke();
        context.save();
        context.beginPath();
        context.moveTo(rowX + 12, y);
        context.lineTo(rowX + labelWidth, y);
        context.lineTo(rowX + labelWidth, y + tierHeight);
        context.lineTo(rowX + 12, y + tierHeight);
        context.quadraticCurveTo(rowX, y + tierHeight, rowX, y + tierHeight - 12);
        context.lineTo(rowX, y + 12);
        context.quadraticCurveTo(rowX, y, rowX + 12, y);
        context.closePath();
        context.clip();
        context.globalAlpha = .84;
        context.fillStyle = tier.color;
        context.fillRect(rowX, y, labelWidth, tierHeight);
        context.restore();

        const lines = tierLines.get(tier.id) ?? [' '];
        const nameBoxHeight = Math.max(34, lines.length * exportLineHeight + 12);
        const textX = rowX + 11;
        const textY = y + (tierHeight - nameBoxHeight) / 2 + 6;
        context.fillStyle = tierLabelUsesLightText(tier.color) ? '#fff' : dark ? '#eeefec' : '#25272a';
        context.font = exportFont;
        context.textBaseline = 'top';
        lines.forEach((line, lineIndex) => context.fillText(line, textX, textY + lineIndex * exportLineHeight));
        (unitsByTier.get(tier.id) ?? []).forEach((unit, index) => {
          const image = loadedImages.get(unit.card.id); if (!image) return;
          const x = padding + labelWidth + contentInset + (index % columns) * (cardSize + gap);
          const imageY = y + Math.floor(index / columns) * (cardSize + gap);
          if (unit.members.length > 1) {
            context.fillStyle = dark ? '#34373d' : '#dfe1dc';
            context.fillRect(x + 3, imageY + 3, cardSize, cardSize);
            context.strokeStyle = dark ? 'rgba(255,255,255,.35)' : 'rgba(28,32,29,.2)';
            context.strokeRect(x + 3.5, imageY + 3.5, cardSize - 1, cardSize - 1);
          }
          context.save();
          context.beginPath();
          context.rect(x, imageY, cardSize, cardSize);
          context.clip();
          const scaledCardSize = cardSize * 1.06;
          const scaleOffset = (scaledCardSize - cardSize) / 2;
          context.drawImage(image, x - scaleOffset, imageY - scaleOffset + .5, scaledCardSize, scaledCardSize);
          context.restore();
        });
        y += tierHeight + rowGap;
      });
      context.save();
      context.globalAlpha = .76;
      context.fillStyle = dark ? '#a0a49f' : '#858982';
      context.font = '12px Inter, -apple-system, BlinkMacSystemFont, sans-serif';
      context.textAlign = 'right';
      context.textBaseline = 'middle';
      context.fillText(exportCredit, width - padding, height - padding / 2);
      context.restore();
      const png = await new Promise<Blob>((resolve, reject) => canvas.toBlob((blob) => blob ? resolve(blob) : reject(new Error('PNG export failed')), 'image/png'));
      const file = new File([png], 'loveandranking.png', { type: 'image/png' });
      const isIOS = /iPad|iPhone|iPod/u.test(navigator.userAgent)
        || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
      if (isIOS && navigator.share && navigator.canShare?.({ files: [file] })) {
        try {
          await navigator.share({ files: [file], title: 'LoveAndRanking' });
          return;
        } catch (error) {
          if (error instanceof Error && error.name === 'AbortError') return;
        }
      }
      const fileUrl = URL.createObjectURL(png);
      const link = document.createElement('a');
      link.download = 'loveandranking.png';
      link.href = fileUrl;
      document.body.append(link);
      link.click();
      link.remove();
      window.setTimeout(() => URL.revokeObjectURL(fileUrl), 60_000);
    } catch {
      dispatch({ type: 'notice', value: t.exportError });
    } finally { setExporting(false); }
  };

  const shareRanking = async () => {
    let url: string;
    try {
      const hash = await encodeSharedRanking(state.tiers);
      const target = new URL(window.location.href);
      target.hash = hash;
      url = target.href;
    } catch (error) {
      dispatch({ type: 'notice', value: error instanceof Error && error.message === 'Share link is too long' ? t.shareTooLong : t.shareCreateError });
      return;
    }
    setShareCopied(false);
    setShareCopyFailed(false);
    setShareLink(url);
  };

  const acceptIncomingRanking = () => {
    if (!incomingRanking) return;
    dispatch({ type: 'load-shared-ranking', tiers: incomingRanking.tiers });
    const notice = sharedRankingNotice(incomingRanking, t);
    setIncomingRanking(null);
    clearSharedRankFragment();
    if (notice) dispatch({ type: 'notice', value: notice });
  };

  const keepCurrentRanking = () => {
    setIncomingRanking(null);
    clearSharedRankFragment();
  };

  const copyShareLink = async () => {
    if (!shareLink) return;
    try {
      await navigator.clipboard.writeText(shareLink);
    } catch {
      const input = shareLinkInputRef.current;
      input?.focus();
      input?.select();
      if (!document.execCommand('copy')) {
        setShareCopyFailed(true);
        return;
      }
    }
    setShareCopyFailed(false);
    setShareCopied(true);
    if (shareCopyTimerRef.current !== null) window.clearTimeout(shareCopyTimerRef.current);
    shareCopyTimerRef.current = window.setTimeout(() => setShareCopied(false), 1600);
  };

  const preparePoolGridFilterAnimation = () => {
    const grid = poolGridRef.current;
    const nearPageBottom = window.scrollY + window.innerHeight >= document.documentElement.scrollHeight - 3;
    if (!grid || !nearPageBottom) return;
    pendingPoolGridAnimationRef.current = true;
    setPoolGridHeight(grid.getBoundingClientRect().height);
  };

  const toggleFilter = (action: 'toggle-character' | 'toggle-rarity' | 'toggle-card-type', value: string | number) => {
    preparePoolGridFilterAnimation();
    if (action === 'toggle-character') dispatch({ type: action, value: String(value) });
    else if (action === 'toggle-rarity') dispatch({ type: action, value: Number(value) });
    else dispatch({ type: action, value: String(value) });
  };

  const renderPoolCards = () => <>
    {visiblePool.map(({ card, members, index, span }) => <Fragment key={card.id}>
      {state.dropTarget?.zone === 'pool' && state.dropTarget.anchorId === card.id && !state.dropTarget.after && <CardInsertionSlot/>}
      <CardTile card={card} pairCount={members.length} displaySpan={span} language={state.language} index={index} zone="pool" isDragging={state.dragging === card.id} dragSourceRemoved={dragSourceRemoved && state.dragging === card.id} onOpen={(cardId) => dispatch({ type: 'open-card', id: cardId })} onDragStart={beginCardDrag}/>
      {state.dropTarget?.zone === 'pool' && state.dropTarget.anchorId === card.id && state.dropTarget.after && <CardInsertionSlot/>}
    </Fragment>)}
    {state.dropTarget?.zone === 'pool' && state.dropTarget.anchorId === null && <CardInsertionSlot/>}
    {!visiblePool.length && state.dropTarget?.zone !== 'pool' && <div className="empty-state"><span className="empty-icon"><Icon name="search" size={21}/></span><span>{state.pool.length ? t.emptyPool : t.noCards}</span></div>}
  </>;

  return <main className="app-shell">
    <header className="topbar">
      <a className="brand" href={`${window.location.pathname}${window.location.search}`} aria-label="LoveAndRanking"><span><strong>{t.title}</strong><small>{t.subtitle}</small></span></a>
      <div className="top-actions">
        <button className="icon-button language-toggle" type="button" aria-label={t.language} title={t.language} onClick={() => dispatch({ type: 'toggle-language' })}>{state.language === 'ru' ? 'EN' : 'RU'}</button>
        <button className="icon-button" type="button" aria-label={state.theme === 'light' ? t.themeDark : t.themeLight} title={state.theme === 'light' ? t.themeDark : t.themeLight} onClick={() => dispatch({ type: 'toggle-theme' })}><Icon name={state.theme === 'light' ? 'moon' : 'sun'}/></button>
      </div>
    </header>

    <section className="ranking-section" aria-label={state.language === 'ru' ? 'Рейтинговые уровни' : 'Ranking tiers'}>
      <div className="section-head">
        <div className="section-primary-actions">
          <button className="primary-button export-button" type="button" onClick={exportPng} disabled={exporting} aria-label={exporting ? t.exporting : t.export}>{exporting ? <span className="export-spinner"><Icon name="loader" size={16}/></span> : <Icon name="download" size={16}/>}<span>{t.export}</span></button>
          <button className="icon-button share-button" type="button" onClick={shareRanking} aria-label={t.share} title={t.share}><Icon name="share" size={17}/></button>
        </div>
        <div className="section-management-actions">
          <button className="tier-reset-button" type="button" onClick={() => setConfirmation({ type: 'return-all' })}>{t.returnAllButton}</button>
          <button className="tier-reset-button" type="button" onClick={() => setConfirmation({ type: 'full-reset' })}>{t.fullResetButton}</button>
        </div>
      </div>
      <div className="tier-list">{state.tiers.map((tier, index) => <Fragment key={tier.id}>
        {state.tierReorderId && tierInsertionBoundary === index && <div className="tier-insertion-slot" aria-hidden="true"/>}
        {renderTierCard(tier, index, state.tiers.length)}
      </Fragment>)}
        {state.tierReorderId && tierInsertionBoundary === state.tiers.length && <div className="tier-insertion-slot" aria-hidden="true"/>}
      </div>
      <button className="add-tier-button" type="button" disabled={state.tiers.length >= 10} onClick={() => dispatch({ type: 'add-tier' })}><Icon name="plus" size={16}/>{t.addTier}<span>{state.tiers.length}/10</span></button>
    </section>

    <section className="pool-section" aria-label={t.pool}>
      <div className="pool-heading"><h1>{t.pool}<span className="pool-count">{visiblePool.length}<small> / {poolUnits.length}</small></span></h1></div>
      <div className="filter-toolbar"><div className="filter-panel">
        <div className="filter-group"><span className="filter-label">{t.character}</span>{characters.map((character) => <label className="filter-chip" key={character}><input type="checkbox" checked={state.characters.includes(character)} onChange={() => toggleFilter('toggle-character', character)}/><span>{characterNames[character][state.language]}</span></label>)}</div>
        <div className="filter-group"><span className="filter-label">{t.rarity}</span>{[5, 4, 3].map((rarity) => <label className="filter-chip" key={rarity}><input type="checkbox" checked={state.rarities.includes(rarity)} onChange={() => toggleFilter('toggle-rarity', rarity)}/><span>{rarity === 5 ? t.stars5 : rarity === 4 ? t.stars4 : t.stars3}</span></label>)}</div>
        <div className="filter-group"><span className="filter-label">{t.type}</span>{(['solar', 'lunar'] as const).map((type) => <label className="filter-chip" key={type}><input type="checkbox" checked={state.types.includes(type)} onChange={() => toggleFilter('toggle-card-type', type)}/><span>{t[type]}</span></label>)}</div>
      </div><div className="pool-tools">
        <button className={`myth-toggle ${state.mythGrouping ? 'is-active' : ''}`} type="button" aria-pressed={state.mythGrouping} aria-label={t.groupMyths} title={t.groupMyths} disabled={!hasMythPairs} onClick={() => dispatch({ type: 'toggle-myth-grouping' })}>
          <Icon name="myth" size={16}/><span>{t.groupMyths}</span><i aria-hidden="true"><b/></i>
        </button>
        <label className="search-field"><Icon name="search" size={16}/><input value={state.search} onChange={(event) => dispatch({ type: 'search', value: event.target.value })} placeholder={t.search} aria-label={t.search}/>{state.search && <button type="button" aria-label={t.close} onClick={() => dispatch({ type: 'search', value: '' })}><Icon name="close" size={14}/></button>}</label>
      </div></div>
      <div className="sort-controls">
        <div className="segmented-control" role="group" aria-label={state.language === 'ru' ? 'Сортировка' : 'Sorting'}>
          <button type="button" className={state.sortMode === 'date-character' ? 'is-selected' : ''} onClick={() => dispatch({ type: 'sort', mode: 'date-character', direction: state.dateDirection })}>{t.sortDate}</button>
          <button type="button" className={state.sortMode === 'rarity-date' ? 'is-selected' : ''} disabled={state.rarities.length === 1} onClick={() => dispatch({ type: 'sort', mode: 'rarity-date', direction: state.dateDirection })}>{t.sortRarity}</button>
          <button type="button" className={state.sortMode === 'character-date' ? 'is-selected' : ''} disabled={state.characters.length === 1} onClick={() => dispatch({ type: 'sort', mode: 'character-date', direction: state.dateDirection })}>{t.sortCharacter}</button>
        </div>
        <button type="button" className="date-direction" onClick={() => dispatch({ type: 'sort', mode: state.sortMode, direction: state.dateDirection === 'asc' ? 'desc' : 'asc' })} aria-label={state.dateDirection === 'asc' ? t.newest : t.oldest} title={state.dateDirection === 'asc' ? t.newest : t.oldest}><span className={state.dateDirection === 'desc' ? 'direction-up' : ''}>↓</span>{state.dateDirection === 'asc' ? t.oldest : t.newest}</button>
      </div>
      <div ref={poolGridAnchorRef} className="pool-grid-anchor" aria-hidden="true" style={poolDockVisible ? { height: `${poolGridReserveHeight}px` } : undefined}/>
      <aside className={`mobile-pool-dock ${poolDockVisible ? 'mobile-pool-dock--docked' : ''} ${poolDockExpanded ? 'mobile-pool-dock--expanded' : ''}`} aria-label={t.pool}>
        <button className="mobile-pool-dock-toggle" type="button" aria-expanded={poolDockExpanded}
          aria-label={poolDockExpanded ? (state.language === 'ru' ? 'Свернуть общую стопку' : 'Collapse memory pool') : (state.language === 'ru' ? 'Развернуть общую стопку' : 'Expand memory pool')}
          onClick={() => setPoolDockExpanded((expanded) => !expanded)}>
          <span className="mobile-pool-dock-count">{visiblePool.length}</span>
          <svg className="mobile-pool-dock-chevron" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            {poolDockExpanded ? <path d="m6 9 6 6 6-6"/> : <path d="m6 15 6-6 6 6"/>}
          </svg>
        </button>
        <div ref={poolGridViewportRef} className="mobile-pool-dock-scroll" aria-label={t.pool}>
          <div ref={poolGridRef} style={poolGridHeight === null ? undefined : { height: `${poolGridHeight}px` }} onTransitionEnd={(event) => { if (event.propertyName === 'height') setPoolGridHeight(null); }} className={`pool-grid ${poolDockVisible ? 'mobile-pool-dock-grid' : ''} drop-zone ${poolGridHeight !== null ? 'pool-grid--animating' : ''} ${visiblePool.length ? '' : 'pool-grid--empty'} ${state.dropTarget?.zone === 'pool' ? 'is-drop-target' : ''}`} data-drop-zone="pool" data-drop-count={state.pool.length}>
            {renderPoolCards()}
          </div>
        </div>
      </aside>
    </section>

    <footer className="site-footer">
      <p>Made by <a href="https://t.me/catdoge" target="_blank" rel="noreferrer">@CatDoge</a> — feel free to message me!</p>
      <p>More from me: <a href="https://catdoge.notion.site/LaDs-2b9f93ac8a10803f985be67ab9a9c4a9" target="_blank" rel="noreferrer">LaDS Content Timeline</a> <span aria-hidden="true">↗</span></p>
    </footer>

    {dragPreview && <article ref={(element) => { dragPreviewElementRef.current = element; }} className={`card-tile card-drag-preview ${dragPreview.pairCount > 1 ? 'card-tile--myth-stack' : ''}`} aria-hidden="true"
      style={{ width: dragPreview.width, height: dragPreview.height, transform: `translate3d(${dragPreview.x}px, ${dragPreview.y}px, 0)` }}>
      {dragPreview.pairCount > 1 && <span className="myth-stack-layers" aria-hidden="true"><i/><i/></span>}
      <img className="card-image" src={cardImageUrl(dragPreview.card.image)} alt="" draggable={false} loading="eager" style={{ width: '100%', height: '100%' }}/>
    </article>}

    {selected && <div className="modal-backdrop" role="presentation" onClick={(event) => {
      event.stopPropagation();
      if (event.target === event.currentTarget) {
        event.preventDefault();
        dispatch({ type: 'open-card', id: null });
      }
    }}>
        <section className={`card-modal ${selectedPack.length > 1 ? 'card-modal--myth-pair' : ''}`} role="dialog" aria-modal="true" aria-label={`${labelForCharacter(selected, state.language)} — ${selected.name}`} onKeyDown={(event) => {
          if (event.key !== 'Tab') return;
          const focusable = [...event.currentTarget.querySelectorAll<HTMLElement>('button:not(:disabled), input:not(:disabled)')];
          if (!focusable.length) return;
          const first = focusable[0]; const last = focusable[focusable.length - 1];
          if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
          else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
        }}>
        <button className="modal-close icon-button" type="button" aria-label={t.close} onClick={() => dispatch({ type: 'open-card', id: null })}><Icon name="close"/></button>
        <div className={`modal-memory-previews ${selectedPack.length > 1 ? 'modal-memory-previews--pair' : ''}`}>
          {selectedPack.length > 1 && <div className="modal-myth-title"><strong>{selected.myth?.name}</strong></div>}
          {selectedPack.map((memory) => <div className="modal-card-preview" key={memory.id}>
            <img src={cardImageUrl(memory.image)} alt={`${labelForCharacter(memory, state.language)} — ${memory.name}`} draggable={false} onContextMenu={(event) => event.preventDefault()}/>
            <div className="modal-card-meta"><span>{labelForCharacter(memory, state.language)}</span><strong>{memory.name}</strong><small>{memory.rarity}★ <span>·</span> {t[memory.type]}</small>
              {selectedPack.length === 1 && memory.myth && <div className="modal-myth-link modal-myth-link--mobile"><span>{memory.myth.name}</span></div>}
            </div>
            {selectedPack.length === 1 && memory.myth && <div className="modal-myth-link modal-myth-link--desktop"><span>{memory.myth.name}</span></div>}
          </div>)}
          {selectedPack.length > 1 && <button className="myth-order-button" type="button" title={t.swapMythOrder} aria-label={t.swapMythOrder} onClick={() => dispatch({ type: 'swap-myth-order', id: selected.id })}><Icon name="swap" size={16}/></button>}
        </div>
        <div className="modal-destinations"><span className="filter-label">{t.moveTo}</span>{state.tiers.map((tier) => <button key={tier.id} type="button" className={`destination-button ${selectedTier?.id === tier.id ? 'is-current' : ''}`} onClick={() => handleCardDrop(selected.id, tier.id, tier.cards.length)}><span className="destination-color" style={{ background: tier.color }}/><span>{tier.name}</span>{selectedTier?.id === tier.id && <Icon name="check" size={15}/>}</button>)}
          {selectedTier && <button className="return-button" type="button" onClick={() => handleCardDrop(selected.id, 'pool', state.poolManuallyOrdered ? 0 : sortCards([...state.pool, selected.id], cards, state.sortMode, state.dateDirection).indexOf(selected.id))}><Icon name="arrow" size={15}/>{t.returnPool}</button>}
        </div>
      </section>
    </div>}
    {confirmation && (confirmation.type !== 'delete-tier' || pendingDeleteTier) && <div className="confirm-backdrop" role="presentation" onClick={(event) => {
      event.stopPropagation();
      if (event.target === event.currentTarget) setConfirmation(null);
    }}>
      <section className="confirm-dialog" role="alertdialog" aria-modal="true" aria-labelledby="confirmation-title" aria-describedby={confirmationDescription ? 'confirmation-description' : undefined} onKeyDown={(event) => {
        if (event.key !== 'Tab') return;
        const focusable = [...event.currentTarget.querySelectorAll<HTMLElement>('button:not(:disabled)')];
        if (!focusable.length) return;
        const first = focusable[0]; const last = focusable[focusable.length - 1];
        if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
        else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
      }}>
        <h2 id="confirmation-title">{confirmationTitle}</h2>
        {confirmationDescription && <p id="confirmation-description">{confirmationDescription}</p>}
        <div className="confirm-actions">
          <button className="confirm-keep confirm-secondary" type="button" onClick={() => setConfirmation(null)}>{t.keepTier}</button>
          <button className="confirm-delete" type="button" onClick={() => {
            if (confirmation.type === 'delete-tier' && pendingDeleteTier) dispatch({ type: 'delete-tier', id: pendingDeleteTier.id });
            else if (confirmation.type === 'return-all') dispatch({ type: 'return-all-cards' });
            else if (confirmation.type === 'full-reset') dispatch({ type: 'reset-ranking' });
            setConfirmation(null);
          }}>{confirmation.type === 'delete-tier' ? t.confirmDelete : confirmation.type === 'return-all' ? t.returnAllButton : t.fullResetConfirm}</button>
        </div>
      </section>
    </div>}
    {incomingRanking && <div className="confirm-backdrop" role="presentation" onClick={(event) => {
      if (event.target === event.currentTarget) keepCurrentRanking();
    }}>
      <section className="confirm-dialog share-conflict-dialog" role="alertdialog" aria-modal="true" aria-labelledby="share-conflict-title" aria-describedby="share-conflict-message" onKeyDown={(event) => {
        if (event.key !== 'Tab') return;
        const focusable = [...event.currentTarget.querySelectorAll<HTMLElement>('button:not(:disabled)')];
        if (!focusable.length) return;
        const first = focusable[0]; const last = focusable[focusable.length - 1];
        if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
        else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
      }}>
        <h2 id="share-conflict-title">{t.shareConflictTitle}</h2>
        <p id="share-conflict-message">{t.shareConflictMessage}</p>
        <div className="confirm-actions">
          <button className="confirm-keep confirm-secondary share-dialog-secondary" type="button" onClick={keepCurrentRanking}>{t.shareOpenMine}</button>
          <button className="confirm-share" type="button" onClick={acceptIncomingRanking}>{t.shareOpenLinked}</button>
        </div>
      </section>
    </div>}
    {shareLink && <div className="confirm-backdrop" role="presentation" onClick={(event) => {
      if (event.target === event.currentTarget) setShareLink(null);
    }}>
      <section className="confirm-dialog share-link-dialog" role="dialog" aria-modal="true" aria-labelledby="share-link-title">
        <h2 id="share-link-title">{t.shareLink}</h2>
        <div className="share-link-row">
          <input ref={shareLinkInputRef} className="share-link-input" type="url" readOnly value={shareLink} onFocus={(event) => event.currentTarget.select()} aria-label={t.shareLink}/>
          <button ref={shareCopyButtonRef} className="share-copy-button" type="button" onClick={copyShareLink} aria-label={shareCopied ? t.shareCopied : t.copyLink} title={shareCopied ? undefined : t.copyLink}>
            <Icon name={shareCopied ? 'check' : 'copy'} size={18}/>
          </button>
        </div>
        {shareCopyFailed && <p className="share-copy-error" role="status">{t.shareCopyFailed}</p>}
        <div className="confirm-actions">
          <button className="confirm-keep" type="button" onClick={() => setShareLink(null)}>{t.close}</button>
        </div>
      </section>
    </div>}
    {state.notice && <div className="toast" role="status"><span>{state.notice}</span><button type="button" aria-label={t.close} onClick={() => dispatch({ type: 'notice', value: null })}><Icon name="close" size={15}/></button></div>}
  </main>;
}
