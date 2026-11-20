import type { Card, Tier } from './types';
import { initialTiers, tierPalette } from './state';

const SHARE_PREFIX = '#rank=';
const MAX_SHARE_HASH_LENGTH = 20_000;
const MAX_DECOMPRESSED_BYTES = 96 * 1024;
const CARD_ID_SUFFIX = /^card_([a-f\d]{6})$/i;
const hexColorPattern = /^#(?:[\da-f]{3}|[\da-f]{4}|[\da-f]{6}|[\da-f]{8})$/i;

export interface SharedRanking {
  tiers: Tier[];
  skippedMemories: number;
  repaired: boolean;
}

function bytesToBase64Url(bytes: Uint8Array): string {
  let binary = '';
  for (let offset = 0; offset < bytes.length; offset += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + 0x8000));
  }
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

function base64UrlToBytes(value: string): Uint8Array {
  if (!value || !/^[A-Za-z\d_-]+$/.test(value)) throw new Error('Invalid share encoding');
  const base64 = value.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - value.length % 4) % 4);
  const binary = atob(base64);
  return Uint8Array.from(binary, (character) => character.charCodeAt(0));
}

async function readLimited(stream: ReadableStream<Uint8Array>): Promise<Uint8Array> {
  const reader = stream.getReader();
  const chunks: Uint8Array[] = [];
  let length = 0;
  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      length += value.length;
      if (length > MAX_DECOMPRESSED_BYTES) {
        await reader.cancel();
        throw new Error('Share payload is too large');
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  const result = new Uint8Array(length);
  let offset = 0;
  for (const chunk of chunks) {
    result.set(chunk, offset);
    offset += chunk.length;
  }
  return result;
}

function cardSuffix(id: string): string {
  const match = CARD_ID_SUFFIX.exec(id);
  if (!match) throw new Error('Unsupported card ID format');
  return match[1].toLowerCase();
}

export function getShareFragment(hash: string): string | null {
  return hash.startsWith(SHARE_PREFIX) ? hash.slice(SHARE_PREFIX.length) : null;
}

export async function encodeSharedRanking(tiers: Tier[]): Promise<string> {
  const payload = {
    v: 1,
    t: tiers.map((tier) => [tier.name, tier.color, tier.cards.map(cardSuffix)]),
  };
  const bytes = new TextEncoder().encode(JSON.stringify(payload));
  let value: string;
  if (typeof CompressionStream !== 'undefined') {
    try {
      const compressed = await readLimited(new Blob([bytes]).stream().pipeThrough(new CompressionStream('gzip')));
      value = `g1.${bytesToBase64Url(compressed)}`;
    } catch {
      value = `j1.${bytesToBase64Url(bytes)}`;
    }
  } else value = `j1.${bytesToBase64Url(bytes)}`;
  const hash = `${SHARE_PREFIX}${value}`;
  if (hash.length > MAX_SHARE_HASH_LENGTH) throw new Error('Share link is too long');
  return hash;
}

export async function decodeSharedRanking(hash: string, catalog: Card[]): Promise<SharedRanking> {
  if (!hash.startsWith(SHARE_PREFIX) || hash.length > MAX_SHARE_HASH_LENGTH) throw new Error('Invalid share link');
  const encoded = hash.slice(SHARE_PREFIX.length);
  const codec = encoded.slice(0, 3);
  const bytes = base64UrlToBytes(encoded.slice(3));
  let jsonBytes: Uint8Array;
  if (codec === 'g1.') {
    if (typeof DecompressionStream === 'undefined') throw new Error('Unsupported compression');
    jsonBytes = await readLimited(new Blob([bytes]).stream().pipeThrough(new DecompressionStream('gzip')));
  } else if (codec === 'j1.') {
    if (bytes.length > MAX_DECOMPRESSED_BYTES) throw new Error('Share payload is too large');
    jsonBytes = bytes;
  } else throw new Error('Unsupported share version');

  const payload: unknown = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(jsonBytes));
  if (typeof payload !== 'object' || payload === null || Array.isArray(payload)) throw new Error('Invalid share payload');
  const record = payload as Record<string, unknown>;
  if (record.v !== 1 || !Array.isArray(record.t) || !record.t.length) throw new Error('Unsupported share version');

  const suffixToId = new Map<string, string | null>();
  for (const card of catalog) {
    const match = CARD_ID_SUFFIX.exec(card.id);
    if (!match) continue;
    const suffix = match[1].toLowerCase();
    suffixToId.set(suffix, suffixToId.has(suffix) ? null : card.id);
  }

  let repaired = Object.keys(record).some((key) => key !== 'v' && key !== 't');
  let skippedMemories = 0;
  const claimed = new Set<string>();
  const tiers: Tier[] = [];
  record.t.slice(0, 10).forEach((rawTier, index) => {
    if (!Array.isArray(rawTier)) {
      repaired = true;
      return;
    }
    if (rawTier.length !== 3) repaired = true;
    const [rawName, rawColor, rawCards] = rawTier;
    const fallbackName = initialTiers[index]?.name ?? `Tier ${index + 1}`;
    let name = typeof rawName === 'string' ? rawName : '';
    const cleanName = Array.from(name.replace(/[\u0000-\u001f\u007f-\u009f\u200e\u200f\u202a-\u202e\u2066-\u2069]/g, '')).slice(0, 70).join('').trim();
    if (name !== cleanName) repaired = true;
    name = cleanName || fallbackName;
    if (typeof rawName !== 'string' || !cleanName) repaired = true;
    const color = typeof rawColor === 'string' && hexColorPattern.test(rawColor)
      ? rawColor
      : initialTiers[index]?.color ?? tierPalette[index % tierPalette.length];
    if (color !== rawColor) repaired = true;
    const ids = Array.isArray(rawCards) ? rawCards : [];
    if (!Array.isArray(rawCards)) repaired = true;
    const tierCards: string[] = [];
    for (const rawId of ids) {
      if (typeof rawId !== 'string' || !/^[a-f\d]{6}$/i.test(rawId)) {
        skippedMemories += 1;
        continue;
      }
      const id = suffixToId.get(rawId.toLowerCase());
      if (!id || claimed.has(id)) {
        skippedMemories += 1;
        continue;
      }
      claimed.add(id);
      tierCards.push(id);
    }
    tiers.push({ id: `shared-tier-${index + 1}`, name, color, cards: tierCards });
  });
  if (!tiers.length) throw new Error('No usable tiers in share link');
  return { tiers, skippedMemories, repaired };
}

export function hasCustomizedRanking(tiers: Tier[]): boolean {
  if (tiers.length !== initialTiers.length) return true;
  return tiers.some((tier, index) => {
    const initial = initialTiers[index];
    return tier.name !== initial.name || tier.color !== initial.color || tier.cards.length > 0;
  });
}

export function sameRanking(left: Tier[], right: Tier[]): boolean {
  const shape = (tiers: Tier[]) => JSON.stringify(tiers.map(({ name, color, cards }) => [name, color, cards]));
  return shape(left) === shape(right);
}
