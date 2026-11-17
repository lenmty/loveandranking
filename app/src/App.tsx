import { useEffect, useMemo, useReducer, useRef, useState } from 'react';
import type { CSSProperties, ReactNode } from 'react';
import { cards, cardImageUrl } from './catalog';
import { characterNames, copy } from './i18n';
import { reducer, sortCards, tierPalette } from './state';
import { loadAppState, persistAppState } from './persistence';
import type { AppState } from './state';
import type { Card, Language, Tier } from './types';

const characters = ['Xavier', 'Zayne', 'Rafayel', 'Sylus', 'Caleb'] as const;

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

function TierRow({ tier, index, total, cardsById, reorderId, dropIndex, t, language, onRename, onColor, onDelete, onReorder, onMove, onOpen, onDropIndex, onDragStart, onDragEnd }: {
  tier: Tier; index: number; total: number; cardsById: Map<string, Card>; reorderId: string | null; dropIndex: number | null;
  t: Record<string, string>; language: Language; onRename: (id: string, name: string) => void;
  onColor: (id: string, color: string) => void; onDelete: (id: string) => void; onReorder: (id: string | null) => void;
  onMove: (id: string, zone: string, index: number) => void; onOpen: (id: string) => void;
  onDropIndex: (zone: string, index: number) => void; onDragStart: (id: string) => void; onDragEnd: () => void;
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
    <div className={`tier-content drop-zone ${dropIndex !== null ? 'is-drop-target' : ''}`} data-drop-zone={tier.id} data-drop-count={tierCards.length}
      onDragOver={(event) => event.preventDefault()} onPointerMove={(event) => {
        if (!event.buttons) return;
        const target = document.elementFromPoint(event.clientX, event.clientY)?.closest<HTMLElement>('[data-drop-zone]');
        if (target?.dataset.dropZone === tier.id) onDropIndex(tier.id, tierCards.length);
      }}>
      {tierCards.map((card, cardIndex) => <CardTile key={card.id} card={card} language={language} index={cardIndex} zone={tier.id} onMove={onMove} onOpen={onOpen} onDragStart={onDragStart} onDragEnd={onDragEnd} />)}
      {dropIndex !== null && <span className="drop-marker" style={{ left: `${Math.min(99, (dropIndex / Math.max(1, tierCards.length)) * 100)}%` }}/>} 
    </div>
    <div className="tier-actions" style={{ '--tier-color': tier.color } as CSSProperties}>
        <button className="icon-button tier-grip-rail" type="button" aria-label={t.moveTier} title={t.moveTier}
          aria-pressed={reorderId === tier.id}
          onPointerMove={(event) => {
            if (reorderId !== tier.id) return;
            document.querySelectorAll('.tier-row--drop-target').forEach((element) => element.classList.remove('tier-row--drop-target'));
            const target = document.elementFromPoint(event.clientX, event.clientY)?.closest<HTMLElement>('[data-tier-index]');
            target?.classList.add('tier-row--drop-target');
          }} onPointerUp={(event) => {
            if (reorderId === tier.id) {
              const target = document.elementFromPoint(event.clientX, event.clientY)?.closest<HTMLElement>('[data-tier-index]');
              if (target) onMove(tier.id, 'tier-order', Number(target.dataset.tierIndex));
              document.querySelectorAll('.tier-row--drop-target').forEach((element) => element.classList.remove('tier-row--drop-target'));
            }
          }} onClick={() => onReorder(reorderId === tier.id ? null : tier.id)}><Icon name="grip" size={17}/></button>
        <button className="icon-button tier-menu-trigger" type="button" aria-label={t.changeColor} title={t.changeColor} onClick={() => setMenuOpen(!menuOpen)}><span className="color-dot"/></button>
        {total > 1 && <button className="icon-button tier-delete" type="button" aria-label={t.deleteTier} title={t.deleteTier} onClick={() => onDelete(tier.id)}><Icon name="trash" size={15}/></button>}
      {menuOpen && <div className="palette-popover" role="group" aria-label={t.changeColor}>{tierPalette.map((color) => <button key={color} type="button" className={`palette-swatch ${color === tier.color ? 'is-selected' : ''}`} style={{ background: color }} aria-label={color} onClick={() => { onColor(tier.id, color); setMenuOpen(false); }}/>)}</div>}
    </div>
  </section>;
}

function CardTile({ card, language, index, zone, onMove, onOpen, onDragStart, onDragEnd }: {
  card: Card; language: Language; index: number; zone: string;
  onMove: (id: string, zone: string, index: number) => void; onOpen: (id: string) => void;
  onDragStart: (id: string) => void; onDragEnd: () => void;
}) {
  return <article className="card-tile" data-card-id={card.id} data-card-index={index} data-card-zone={zone}>
    <button className="card-image-button" type="button" onClick={() => onOpen(card.id)} aria-label={`${labelForCharacter(card, language)} — ${card.name}`}>
      <img className="card-image" src={cardImageUrl(card.image)} alt={`${labelForCharacter(card, language)} — ${card.name}`} loading="lazy" draggable={false}/>
      <span className="card-rarity" aria-label={`${card.rarity}★`}>{card.rarity}★</span>
    </button>
    <button className="card-drag-handle" type="button" aria-label={language === 'ru' ? 'Перетащить карточку' : 'Drag card'} title={language === 'ru' ? 'Перетащить' : 'Drag'}
      onPointerDown={(event) => { event.preventDefault(); onDragStart(card.id); }} onPointerUp={(event) => {
        const target = document.elementFromPoint(event.clientX, event.clientY)?.closest<HTMLElement>('[data-drop-zone]');
        if (target) {
          const zoneCards = [...target.querySelectorAll<HTMLElement>('[data-card-id]')];
          const overCard = document.elementFromPoint(event.clientX, event.clientY)?.closest<HTMLElement>('[data-card-id]');
          let insertion = Number(target.dataset.dropCount ?? zoneCards.length);
          if (overCard) {
            const bounds = overCard.getBoundingClientRect();
            insertion = Number(overCard.dataset.cardIndex) + (event.clientX > bounds.left + bounds.width / 2 ? 1 : 0);
          }
          onMove(card.id, target.dataset.dropZone!, insertion);
        }
        onDragEnd();
      }}><Icon name="grip" size={14}/></button>
  </article>;
}

export function App() {
  const [state, dispatchBase] = useReducer((current: AppState, action: Parameters<typeof reducer>[1]) => reducer(current, action, cards), undefined, () => loadAppState(cards));
  const [exporting, setExporting] = useState(false);
  const pointerRef = useRef<string | null>(null);
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
    const closeButton = document.querySelector<HTMLElement>('.modal-close');
    closeButton?.focus();
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') dispatch({ type: 'open-card', id: null });
    };
    document.addEventListener('keydown', closeOnEscape);
    return () => {
      document.removeEventListener('keydown', closeOnEscape);
      previousFocus?.focus();
    };
  }, [selected?.id]);
  useEffect(() => {
    const handlePointerMove = (event: PointerEvent) => {
      if (!pointerRef.current) return;
      const target = document.elementFromPoint(event.clientX, event.clientY)?.closest<HTMLElement>('[data-drop-zone]');
      if (target) {
        const targetId = target.dataset.dropZone!;
        const cardsInZone = [...target.querySelectorAll<HTMLElement>('[data-card-id]')];
        const under = document.elementFromPoint(event.clientX, event.clientY)?.closest<HTMLElement>('[data-card-id]');
        let insertAt = cardsInZone.length;
        if (under) {
          const bounds = under.getBoundingClientRect();
          insertAt = Number(under.dataset.cardIndex) + (event.clientX > bounds.left + bounds.width / 2 ? 1 : 0);
        }
        dispatch({ type: 'drag-state', id: pointerRef.current, zone: targetId, index: insertAt });
      }
    };
    const handlePointerUp = () => { pointerRef.current = null; };
    window.addEventListener('pointermove', handlePointerMove);
    window.addEventListener('pointerup', handlePointerUp);
    return () => { window.removeEventListener('pointermove', handlePointerMove); window.removeEventListener('pointerup', handlePointerUp); };
  }, []);

  const handleCardDrop = (id: string, zone: string, index: number) => dispatch({ type: 'move-card', id, zone, index });
  const beginCardDrag = (id: string) => { pointerRef.current = id; dispatch({ type: 'drag-state', id }); };

  const renderTierCard = (tier: Tier, index: number, total: number) => (
    <TierRow key={tier.id} tier={tier} index={index} total={total} cardsById={cardsById} reorderId={state.tierReorderId}
      dropIndex={state.dropTarget?.zone === tier.id ? state.dropTarget.index : null} t={t} language={state.language}
      onRename={(id, name) => dispatch({ type: 'rename-tier', id, name })}
      onColor={(id, color) => dispatch({ type: 'color-tier', id, color })}
      onDelete={(id) => dispatch({ type: 'delete-tier', id })}
      onReorder={(id) => dispatch({ type: 'start-tier-reorder', id })}
      onMove={(id, zone, targetIndex) => zone === 'tier-order'
        ? dispatch({ type: 'move-tier', from: state.tiers.findIndex((item) => item.id === id), to: targetIndex })
        : handleCardDrop(id, zone, targetIndex)}
      onOpen={(id) => dispatch({ type: 'open-card', id })}
      onDropIndex={(zone, targetIndex) => dispatch({ type: 'drag-state', id: state.dragging, zone, index: targetIndex })}
      onDragStart={beginCardDrag} onDragEnd={() => { pointerRef.current = null; dispatch({ type: 'drag-state', id: null }); }}
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
          context.save(); context.beginPath(); context.roundRect(x, imageY, cardSize, cardSize, 8); context.clip();
          context.drawImage(image, x, imageY, cardSize, cardSize); context.restore();
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
      </div>
      <div className="tier-list">{state.tiers.map((tier, index) => renderTierCard(tier, index, state.tiers.length))}</div>
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
      <div className={`pool-grid drop-zone ${visiblePool.length ? '' : 'pool-grid--empty'} ${state.dropTarget?.zone === 'pool' ? 'is-drop-target' : ''}`} data-drop-zone="pool" data-drop-count={state.pool.length}>
        {visiblePool.map((id) => { const card = cardsById.get(id)!; return <CardTile key={id} card={card} language={state.language} index={state.pool.indexOf(id)} zone="pool" onMove={handleCardDrop} onOpen={(cardId) => dispatch({ type: 'open-card', id: cardId })} onDragStart={beginCardDrag} onDragEnd={() => { pointerRef.current = null; dispatch({ type: 'drag-state', id: null }); }}/>; })}
        {state.dropTarget?.zone === 'pool' && <span className="pool-drop-marker" style={{ left: `${Math.min(98, (state.dropTarget.index / Math.max(1, visiblePool.length)) * 100)}%` }}/>} 
        {!visiblePool.length && <div className="empty-state"><span className="empty-icon"><Icon name="search" size={21}/></span><span>{state.pool.length ? t.emptyPool : t.noCards}</span></div>}
      </div>
    </section>

    {selected && <div className="modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) dispatch({ type: 'open-card', id: null }); }} onTouchStart={(event) => { if (event.target === event.currentTarget) dispatch({ type: 'open-card', id: null }); }}>
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
    {state.notice && <div className="toast" role="status">{state.notice}</div>}
  </main>;
}
