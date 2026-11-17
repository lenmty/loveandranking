import { Fragment, useEffect, useMemo, useReducer, useRef, useState } from 'react';
import type { CSSProperties, ReactNode } from 'react';
import { cards, cardImageUrl } from './catalog';
import { characterNames, copy } from './i18n';
import { reducer, sortCards, tierPalette } from './state';
import { loadAppState, persistAppState } from './persistence';
import type { AppState } from './state';
import type { Card, Language, Tier } from './types';

const characters = ['Xavier', 'Zayne', 'Rafayel', 'Sylus', 'Caleb'] as const;
type Confirmation = { type: 'delete-tier'; id: string } | { type: 'return-all' } | { type: 'full-reset' };

function Icon({ name, size = 18 }: { name: string; size?: number }) {
  const common = { width: size, height: size, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 1.8, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const, 'aria-hidden': true as const };
  const shapes: Record<string, ReactNode> = {
    download: <><path d="M12 3v12"/><path d="m7 10 5 5 5-5"/><path d="M5 20h14"/></>,
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
    arrow: <><path d="M7 7h10v10"/><path d="m17 7-10 10"/></>,
  };
  return <svg {...common}>{shapes[name] ?? null}</svg>;
}

function labelForCharacter(card: Card, language: Language) {
  return characterNames[card.character][language];
}

interface CardDropPosition {
  index: number;
  anchorId: string | null;
  after: boolean;
}

function cardDropPosition(container: HTMLElement, clientX: number, clientY: number): CardDropPosition {
  const items = [...container.querySelectorAll<HTMLElement>('[data-card-id]')];
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
      return { index: Number(last.dataset.cardIndex) + 1, anchorId: last.dataset.cardId ?? null, after: true };
    }
  }

  for (const item of activeRow) {
    const bounds = item.getBoundingClientRect();
    if (clientX < bounds.left + bounds.width / 2) {
      return { index: Number(item.dataset.cardIndex), anchorId: item.dataset.cardId ?? null, after: false };
    }
  }
  const last = activeRow[activeRow.length - 1];
  return { index: Number(last.dataset.cardIndex) + 1, anchorId: last.dataset.cardId ?? null, after: true };
}

function TierRow({ tier, index, total, cardsById, reorderId, dropTarget, draggingId, t, language, onRename, onColor, onDelete, onTierPointerDown, onMove, onOpen, onDragStart }: {
  tier: Tier; index: number; total: number; cardsById: Map<string, Card>; reorderId: string | null;
  dropTarget: AppState['dropTarget']; draggingId: string | null;
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
  const tierCards = tier.cards.map((id) => cardsById.get(id)).filter((card): card is Card => Boolean(card));
  const darkLabel = ['#44474c', '#45484d'].includes(tier.color.toLowerCase());
  return <section className={`tier-row ${reorderId === tier.id ? 'tier-row--moving' : ''}`} data-tier-index={index}>
    <div className={`tier-label ${darkLabel ? 'tier-label--dark' : ''}`} style={{ '--tier-color': tier.color } as CSSProperties}>
      {editing ? <textarea autoFocus className="tier-name-input" aria-label={t.renameTier} maxLength={70} rows={1} value={draft}
        onChange={(event) => { setDraft(event.target.value); event.currentTarget.style.height = 'auto'; event.currentTarget.style.height = `${event.currentTarget.scrollHeight}px`; }}
        onFocus={(event) => { event.currentTarget.style.height = 'auto'; event.currentTarget.style.height = `${event.currentTarget.scrollHeight}px`; }}
        onBlur={() => { onRename(tier.id, draft.trim() || tier.name); setEditing(false); }}
        onKeyDown={(event) => { if (event.key === 'Enter' && !event.shiftKey) { event.preventDefault(); event.currentTarget.blur(); } if (event.key === 'Escape') { setDraft(tier.name); event.currentTarget.blur(); } }} />
        : <button className="tier-name" type="button" onClick={() => setEditing(true)} aria-label={t.renameTier}>{tier.name}</button>}
    </div>
    <div className={`tier-content drop-zone ${dropTarget?.zone === tier.id ? 'is-drop-target' : ''}`} data-drop-zone={tier.id} data-drop-count={tierCards.length}>
      {tierCards.map((card, cardIndex) => <Fragment key={card.id}>
        {dropTarget?.zone === tier.id && dropTarget.anchorId === card.id && !dropTarget.after && <CardInsertionSlot tier/>}
        <CardTile card={card} language={language} index={cardIndex} zone={tier.id} isDragging={draggingId === card.id} onOpen={onOpen} onDragStart={onDragStart}/>
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

function CardTile({ card, language, index, zone, isDragging, onOpen, onDragStart }: {
  card: Card; language: Language; index: number; zone: string; isDragging: boolean;
  onOpen: (id: string) => void; onDragStart: (id: string, event: PointerEvent) => void;
}) {
  return <article className={`card-tile ${zone === 'pool' ? 'card-tile--pool' : 'card-tile--tier'} ${isDragging ? 'card-tile--dragging' : ''}`} data-card-id={card.id} data-card-index={index} data-card-zone={zone}>
    <button className="card-image-button" type="button" onClick={() => onOpen(card.id)} aria-label={`${labelForCharacter(card, language)} — ${card.name}`}>
      <img className="card-image" src={cardImageUrl(card.image)} alt={`${labelForCharacter(card, language)} — ${card.name}`} loading="lazy" draggable={false}/>
      <span className="card-rarity" aria-label={`${card.rarity}★`}>{card.rarity}★</span>
    </button>
    <button className="card-drag-handle" type="button" aria-label={language === 'ru' ? 'Перетащить карточку' : 'Drag memory'} title={language === 'ru' ? 'Перетащить' : 'Drag'}
      onPointerDown={(event) => { event.preventDefault(); onDragStart(card.id, event.nativeEvent); }}><Icon name="grip" size={14}/></button>
  </article>;
}

export function App() {
  const [state, dispatchBase] = useReducer((current: AppState, action: Parameters<typeof reducer>[1]) => reducer(current, action, cards), undefined, () => loadAppState(cards));
  const [exporting, setExporting] = useState(false);
  const [confirmation, setConfirmation] = useState<Confirmation | null>(null);
  const [poolDockVisible, setPoolDockVisible] = useState(false);
  const [poolDockExpanded, setPoolDockExpanded] = useState(false);
  const [dragPreview, setDragPreview] = useState<{ card: Card; width: number; height: number; offsetX: number; offsetY: number; x: number; y: number } | null>(null);
  const dragPreviewElementRef = useRef<HTMLElement | null>(null);
  const dragPreviewOffsetRef = useRef<{ x: number; y: number } | null>(null);
  const poolGridRef = useRef<HTMLDivElement | null>(null);
  const [tierInsertionBoundary, setTierInsertionBoundary] = useState<number | null>(null);
  const pointerRef = useRef<string | null>(null);
  const tierPressRef = useRef<{ id: string; pointerId: number } | null>(null);
  const tierInsertionRef = useRef<number | null>(null);
  const tiersRef = useRef(state.tiers);
  tiersRef.current = state.tiers;
  const dispatch = dispatchBase;
  const t = copy[state.language];
  const cardsById = useMemo(() => new Map(cards.map((card) => [card.id, card])), []);
  const visiblePool = useMemo(() => state.pool.filter((id) => {
    const card = cardsById.get(id)!;
    return state.characters.includes(card.character) && state.rarities.includes(card.rarity)
      && state.types.includes(card.type) && card.name.toLocaleLowerCase().includes(state.search.trim().toLocaleLowerCase());
  }), [state.pool, state.characters, state.rarities, state.types, state.search, cardsById]);
  const selected = state.selectedCard ? cardsById.get(state.selectedCard) : undefined;
  const selectedTier = state.selectedCard ? state.tiers.find((tier) => tier.cards.includes(state.selectedCard!)) : undefined;
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
    persistAppState(state);
  }, [state.tiers, state.pool, state.poolManuallyOrdered, state.sortMode, state.dateDirection, state.characters, state.rarities, state.types, state.search, state.themePreference, state.languagePreference]);
  useEffect(() => {
    if (!state.notice) return;
    const timer = window.setTimeout(() => dispatch({ type: 'notice', value: null }), 3800);
    return () => window.clearTimeout(timer);
  }, [state.notice]);
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
    };
    body.style.position = 'fixed';
    body.style.top = `-${scrollY}px`;
    body.style.left = '0';
    body.style.right = '0';
    body.style.width = '100%';
    body.style.overflow = 'hidden';
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
    const handlePointerMove = (event: PointerEvent) => {
      const tierPress = tierPressRef.current;
      if (tierPress && tierPress.pointerId === event.pointerId) {
        const boundary = findTierBoundary(event.clientY);
        tierInsertionRef.current = boundary;
        const from = tiersRef.current.findIndex((tier) => tier.id === tierPress.id);
        const destination = boundary === null ? null : boundary > from ? boundary - 1 : boundary;
        const visibleBoundary = destination === from ? null : boundary;
        setTierInsertionBoundary((current) => current === visibleBoundary ? current : visibleBoundary);
      }
      if (!pointerRef.current) return;
      const previewOffset = dragPreviewOffsetRef.current;
      if (previewOffset && dragPreviewElementRef.current) {
        dragPreviewElementRef.current.style.transform = `translate3d(${event.clientX - previewOffset.x}px, ${event.clientY - previewOffset.y}px, 0)`;
      }
      const target = document.elementFromPoint(event.clientX, event.clientY)?.closest<HTMLElement>('[data-drop-zone]');
      if (target) {
        const targetId = target.dataset.dropZone!;
        const position = cardDropPosition(target, event.clientX, event.clientY);
        const draggedCard = [...document.querySelectorAll<HTMLElement>('[data-card-id]')]
          .find((item) => item.dataset.cardId === pointerRef.current);
        const sourceZone = draggedCard?.dataset.cardZone;
        const sourceIndex = Number(draggedCard?.dataset.cardIndex ?? -1);
        const finalIndex = sourceZone === targetId && sourceIndex >= 0 && sourceIndex < position.index
          ? position.index - 1
          : position.index;
        if (sourceZone === targetId && sourceIndex === finalIndex) {
          dispatch({ type: 'drag-state', id: pointerRef.current });
        } else {
          dispatch({ type: 'drag-state', id: pointerRef.current, zone: targetId, ...position });
        }
      } else dispatch({ type: 'drag-state', id: pointerRef.current });
    };
    const handlePointerUp = (event: PointerEvent) => {
      clearTierPress(event, true);
      const draggedId = pointerRef.current;
      if (draggedId) {
        const target = document.elementFromPoint(event.clientX, event.clientY)?.closest<HTMLElement>('[data-drop-zone]');
        if (target) {
          const position = cardDropPosition(target, event.clientX, event.clientY);
          dispatch({ type: 'move-card', id: draggedId, zone: target.dataset.dropZone!, index: position.index });
        } else dispatch({ type: 'drag-state', id: null });
      }
      pointerRef.current = null;
      setDragPreview(null);
      dragPreviewElementRef.current = null;
      dragPreviewOffsetRef.current = null;
      document.body.classList.remove('is-dragging-card');
    };
    const handlePointerCancel = (event: PointerEvent) => {
      clearTierPress(event);
      pointerRef.current = null;
      setDragPreview(null);
      dragPreviewElementRef.current = null;
      dragPreviewOffsetRef.current = null;
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
    if (!grid) return;
    const mobile = window.matchMedia('(max-width: 640px)');
    const updateDockVisibility = () => {
      if (!mobile.matches) {
        setPoolDockVisible(false);
        return;
      }
      const bounds = grid.getBoundingClientRect();
      setPoolDockVisible(bounds.top >= window.innerHeight);
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
    pointerRef.current = id;
    const tile = event.target instanceof Element ? event.target.closest<HTMLElement>('.card-tile') : null;
    const bounds = tile?.getBoundingClientRect();
    const card = cardsById.get(id);
    if (bounds && card) {
      const offsetX = event.clientX - bounds.left;
      const offsetY = event.clientY - bounds.top;
      dragPreviewOffsetRef.current = { x: offsetX, y: offsetY };
      setDragPreview({ card, width: bounds.width, height: bounds.height, offsetX, offsetY, x: bounds.left, y: bounds.top });
      document.body.classList.add('is-dragging-card');
    }
    dispatch({ type: 'drag-state', id });
  };
  const beginTierPointer = (id: string, event: PointerEvent, handle: HTMLButtonElement) => {
    tierPressRef.current = { id, pointerId: event.pointerId };
    tierInsertionRef.current = null;
    setTierInsertionBoundary(null);
    handle.setPointerCapture(event.pointerId);
    dispatch({ type: 'start-tier-reorder', id });
  };

  const renderTierCard = (tier: Tier, index: number, total: number) => (
    <TierRow key={tier.id} tier={tier} index={index} total={total} cardsById={cardsById} reorderId={state.tierReorderId}
      dropTarget={state.dropTarget} draggingId={state.dragging} t={t} language={state.language}
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
      const labelWidth = 140;
      const cardSize = 80;
      const gap = 8;
      const contentWidth = width - padding * 2 - labelWidth - 12;
      const columns = Math.max(1, Math.floor((contentWidth + gap) / (cardSize + gap)));
      const heightOf = (tier: Tier) => Math.max(cardSize, Math.ceil(tier.cards.length / columns) * cardSize + Math.max(0, Math.ceil(tier.cards.length / columns) - 1) * gap);
      const rowGap = 10;
      const height = padding * 2 + state.tiers.reduce((sum, tier) => sum + heightOf(tier), 0) + Math.max(0, state.tiers.length - 1) * rowGap;
      const canvas = document.createElement('canvas');
      canvas.width = width; canvas.height = height;
      const context = canvas.getContext('2d');
      if (!context) throw new Error('Canvas unavailable');
      const dark = state.theme === 'dark';
      context.fillStyle = dark ? '#17191d' : '#f5f5f2';
      context.fillRect(0, 0, width, height);
      const loadedImages = new Map<string, HTMLImageElement>();
      await Promise.all(cards.filter((card) => state.tiers.some((tier) => tier.cards.includes(card.id))).map((card) => new Promise<void>((resolve, reject) => {
        const image = new Image(); image.crossOrigin = 'anonymous'; image.onload = () => { loadedImages.set(card.id, image); resolve(); }; image.onerror = reject; image.src = cardImageUrl(card.image);
      })));
      let y = padding;
      state.tiers.forEach((tier) => {
        const tierHeight = heightOf(tier);
        context.fillStyle = tier.color;
        context.beginPath(); context.roundRect(padding, y, width - padding * 2, tierHeight, 12); context.fill();
        context.fillStyle = ['#44474c', '#45484d', '#33373d'].includes(tier.color.toLowerCase()) ? '#fff' : '#282a2e';
        context.font = '600 17px Inter, -apple-system, BlinkMacSystemFont, sans-serif';
        context.textBaseline = 'middle';
        context.fillText(tier.name || ' ', padding + 18, y + tierHeight / 2, labelWidth - 25);
        tier.cards.forEach((id, index) => {
          const image = loadedImages.get(id); if (!image) return;
          const x = padding + labelWidth + 12 + (index % columns) * (cardSize + gap);
          const imageY = y + Math.floor(index / columns) * (cardSize + gap);
          context.drawImage(image, x, imageY, cardSize, cardSize);
        });
        y += tierHeight + rowGap;
      });
      const link = document.createElement('a'); link.download = 'cardrank.png'; link.href = canvas.toDataURL('image/png'); link.click();
    } catch {
      dispatch({ type: 'notice', value: t.exportError });
    } finally { setExporting(false); }
  };

  const toggleFilter = (action: 'toggle-character' | 'toggle-rarity' | 'toggle-card-type', value: string | number) => {
    if (action === 'toggle-character') dispatch({ type: action, value: String(value) });
    else if (action === 'toggle-rarity') dispatch({ type: action, value: Number(value) });
    else dispatch({ type: action, value: String(value) });
  };

  const renderPoolCards = () => <>
    {visiblePool.map((id) => { const card = cardsById.get(id)!; return <Fragment key={id}>
      {state.dropTarget?.zone === 'pool' && state.dropTarget.anchorId === id && !state.dropTarget.after && <CardInsertionSlot/>}
      <CardTile card={card} language={state.language} index={state.pool.indexOf(id)} zone="pool" isDragging={state.dragging === id} onOpen={(cardId) => dispatch({ type: 'open-card', id: cardId })} onDragStart={beginCardDrag}/>
      {state.dropTarget?.zone === 'pool' && state.dropTarget.anchorId === id && state.dropTarget.after && <CardInsertionSlot/>}
    </Fragment>; })}
    {state.dropTarget?.zone === 'pool' && state.dropTarget.anchorId === null && <CardInsertionSlot/>}
    {!visiblePool.length && state.dropTarget?.zone !== 'pool' && <div className="empty-state"><span className="empty-icon"><Icon name="search" size={21}/></span><span>{state.pool.length ? t.emptyPool : t.noCards}</span></div>}
  </>;

  return <main className="app-shell">
    <header className="topbar">
      <a className="brand" href="#top" aria-label="CardRank"><span><strong>{t.title}</strong><small>{t.subtitle}</small></span></a>
      <div className="top-actions">
        <button className="icon-button language-toggle" type="button" aria-label={t.language} title={t.language} onClick={() => dispatch({ type: 'toggle-language' })}>{state.language === 'ru' ? 'EN' : 'RU'}</button>
        <button className="icon-button" type="button" aria-label={state.theme === 'light' ? t.themeDark : t.themeLight} title={state.theme === 'light' ? t.themeDark : t.themeLight} onClick={() => dispatch({ type: 'toggle-theme' })}><Icon name={state.theme === 'light' ? 'moon' : 'sun'}/></button>
      </div>
    </header>

    <section className="ranking-section" aria-label={state.language === 'ru' ? 'Рейтинговые уровни' : 'Ranking tiers'}>
      <div className="section-head">
        <button className="primary-button export-button" type="button" onClick={exportPng} disabled={exporting}><Icon name="download" size={16}/><span>{exporting ? '…' : t.export}</span></button>
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
      <div className="pool-heading"><h1>{t.pool}<span className="pool-count">{visiblePool.length}<small> / {state.pool.length}</small></span></h1></div>
      <div className="filter-toolbar"><div className="filter-panel">
        <div className="filter-group"><span className="filter-label">{t.character}</span>{characters.map((character) => <label className="filter-chip" key={character}><input type="checkbox" checked={state.characters.includes(character)} onChange={() => toggleFilter('toggle-character', character)}/><span>{characterNames[character][state.language]}</span></label>)}</div>
        <div className="filter-group"><span className="filter-label">{t.rarity}</span>{[4, 5].map((rarity) => <label className="filter-chip" key={rarity}><input type="checkbox" checked={state.rarities.includes(rarity)} onChange={() => toggleFilter('toggle-rarity', rarity)}/><span>{rarity === 4 ? t.stars4 : t.stars5}</span></label>)}</div>
        <div className="filter-group"><span className="filter-label">{t.type}</span>{(['solar', 'lunar'] as const).map((type) => <label className="filter-chip" key={type}><input type="checkbox" checked={state.types.includes(type)} onChange={() => toggleFilter('toggle-card-type', type)}/><span>{t[type]}</span></label>)}</div>
      </div><div className="pool-tools"><label className="search-field"><Icon name="search" size={16}/><input value={state.search} onChange={(event) => dispatch({ type: 'search', value: event.target.value })} placeholder={t.search} aria-label={t.search}/>{state.search && <button type="button" aria-label={t.close} onClick={() => dispatch({ type: 'search', value: '' })}><Icon name="close" size={14}/></button>}</label></div></div>
      <div className="sort-controls">
        <div className="segmented-control" role="group" aria-label={state.language === 'ru' ? 'Сортировка' : 'Sorting'}>
          <button type="button" className={state.sortMode === 'date-character' ? 'is-selected' : ''} onClick={() => dispatch({ type: 'sort', mode: 'date-character', direction: state.dateDirection })}>{t.sortDate}</button>
          <button type="button" className={state.sortMode === 'character-date' ? 'is-selected' : ''} onClick={() => dispatch({ type: 'sort', mode: 'character-date', direction: state.dateDirection })}>{t.sortCharacter}</button>
        </div>
        <button type="button" className="date-direction" onClick={() => dispatch({ type: 'sort', mode: state.sortMode, direction: state.dateDirection === 'asc' ? 'desc' : 'asc' })} aria-label={state.dateDirection === 'asc' ? t.newest : t.oldest} title={state.dateDirection === 'asc' ? t.newest : t.oldest}><span className={state.dateDirection === 'desc' ? 'direction-up' : ''}>↓</span>{state.dateDirection === 'asc' ? t.oldest : t.newest}</button>
      </div>
      <div ref={poolGridRef} className={`pool-grid drop-zone ${visiblePool.length ? '' : 'pool-grid--empty'} ${state.dropTarget?.zone === 'pool' ? 'is-drop-target' : ''}`} data-drop-zone="pool" data-drop-count={state.pool.length} aria-hidden={poolDockVisible || undefined}>
        {renderPoolCards()}
      </div>
    </section>

    <aside className={`mobile-pool-dock ${poolDockVisible ? 'mobile-pool-dock--visible' : ''} ${poolDockExpanded ? 'mobile-pool-dock--expanded' : ''}`} aria-label={t.pool} aria-hidden={!poolDockVisible}>
      <button className="mobile-pool-dock-toggle" type="button" aria-expanded={poolDockExpanded}
        aria-label={poolDockExpanded ? (state.language === 'ru' ? 'Свернуть общую стопку' : 'Collapse memory pool') : (state.language === 'ru' ? 'Развернуть общую стопку' : 'Expand memory pool')}
        onClick={() => setPoolDockExpanded((expanded) => !expanded)}>
        <span className="mobile-pool-dock-count">{visiblePool.length}</span>
        <svg className="mobile-pool-dock-chevron" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          {poolDockExpanded ? <path d="m6 9 6 6 6-6"/> : <path d="m6 15 6-6 6 6"/>}
        </svg>
      </button>
      <div className="mobile-pool-dock-scroll" aria-label={t.pool}>
        <div className={`pool-grid mobile-pool-dock-grid drop-zone ${visiblePool.length ? '' : 'pool-grid--empty'} ${state.dropTarget?.zone === 'pool' ? 'is-drop-target' : ''}`} data-drop-zone="pool" data-drop-count={state.pool.length}>
          {renderPoolCards()}
        </div>
      </div>
    </aside>

    {dragPreview && <article ref={(element) => { dragPreviewElementRef.current = element; }} className="card-tile card-drag-preview" aria-hidden="true"
      style={{ width: dragPreview.width, height: dragPreview.height, transform: `translate3d(${dragPreview.x}px, ${dragPreview.y}px, 0)` }}>
      <img className="card-image" src={cardImageUrl(dragPreview.card.image)} alt="" draggable={false} loading="eager" style={{ width: '100%', height: '100%' }}/>
      <span className="card-rarity">{dragPreview.card.rarity}★</span>
    </article>}

    {selected && <div className="modal-backdrop" role="presentation" onClick={(event) => {
      event.stopPropagation();
      if (event.target === event.currentTarget) {
        event.preventDefault();
        dispatch({ type: 'open-card', id: null });
      }
    }}>
        <section className="card-modal" role="dialog" aria-modal="true" aria-label={`${labelForCharacter(selected, state.language)} — ${selected.name}`} onKeyDown={(event) => {
          if (event.key !== 'Tab') return;
          const focusable = [...event.currentTarget.querySelectorAll<HTMLElement>('button:not(:disabled), input:not(:disabled)')];
          if (!focusable.length) return;
          const first = focusable[0]; const last = focusable[focusable.length - 1];
          if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
          else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
        }}>
        <button className="modal-close icon-button" type="button" aria-label={t.close} onClick={() => dispatch({ type: 'open-card', id: null })}><Icon name="close"/></button>
        <div className="modal-card-preview"><img src={cardImageUrl(selected.image)} alt={`${labelForCharacter(selected, state.language)} — ${selected.name}`}/><div className="modal-card-meta"><span>{labelForCharacter(selected, state.language)}</span><strong>{selected.name}</strong><small>{selected.rarity}★ <span>·</span> {t[selected.type]}</small></div></div>
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
    {state.notice && <div className="toast" role="status">{state.notice}</div>}
  </main>;
}
