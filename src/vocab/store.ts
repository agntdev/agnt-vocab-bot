import { now, todayKey } from "./time.js";

export type Rating = "again" | "hard" | "good" | "easy";

export interface Profile {
  telegram_id: number;
  daily_new_card_limit: number;
  schedule_intensity: number;
  streak_count: number;
  timezone: string;
  last_study_day?: string;
}
export interface Deck { id: string; title: string; description: string; visibility: "private"; created_at: number; }
export interface Card {
  id: string; deck_id: string; prompt: string; answer: string; example?: string;
  ease: number; interval: number; due_date: number; state: "new" | "learning" | "review";
}

interface RedisClient { get(key: string): Promise<string | null>; set(key: string, value: string): Promise<unknown>; del(key: string): Promise<unknown>; }
let clientPromise: Promise<RedisClient | null> | undefined;

async function client(): Promise<RedisClient | null> {
  if (clientPromise) return clientPromise;
  clientPromise = (async () => {
    const url = typeof process === "undefined" ? undefined : process.env.REDIS_URL;
    if (!url) return null;
    // Keep this Node-only dependency out of the Workers static bundle. The
    // Worker path returns above because it has no process.env.REDIS_URL.
    const { createRequire } = await import("node:module");
    const required = createRequire(import.meta.url)("ioredis") as { default?: unknown; Redis?: unknown };
    const Redis = (required.default ?? required.Redis ?? required) as unknown as (new (url: string, opts: object) => RedisClient);
    return Redis ? new Redis(url, { maxRetriesPerRequest: null, lazyConnect: false }) : null;
  })();
  return clientPromise;
}

export async function storageReady(): Promise<boolean> { return (await client()) !== null; }
async function read<T>(key: string): Promise<T | undefined> {
  const redis = await client();
  if (!redis) return undefined;
  const raw = await redis.get(`vocab:${key}`);
  if (!raw) return undefined;
  try { return JSON.parse(raw) as T; } catch { return undefined; }
}
async function write<T>(key: string, value: T): Promise<boolean> {
  const redis = await client();
  if (!redis) return false;
  await redis.set(`vocab:${key}`, JSON.stringify(value));
  return true;
}
const profileKey = (userId: number) => `profile:${userId}`;
const decksKey = (userId: number) => `decks:${userId}`;
const deckKey = (userId: number, id: string) => `deck:${userId}:${id}`;
const cardsKey = (userId: number, deckId: string) => `cards:${userId}:${deckId}`;
const cardKey = (userId: number, id: string) => `card:${userId}:${id}`;
const id = (prefix: string) => `${prefix}_${now().toString(36)}_${crypto.randomUUID().slice(0, 8)}`;

export async function getProfile(userId: number): Promise<Profile | undefined> { return read(profileKey(userId)); }
export async function ensureProfile(userId: number): Promise<Profile | undefined> {
  const existing = await getProfile(userId); if (existing) return existing;
  const profile: Profile = { telegram_id: userId, daily_new_card_limit: 20, schedule_intensity: 1, streak_count: 0, timezone: "UTC" };
  return (await write(profileKey(userId), profile)) ? profile : undefined;
}
export async function saveProfile(profile: Profile): Promise<boolean> { return write(profileKey(profile.telegram_id), profile); }
export async function listDecks(userId: number): Promise<Deck[] | undefined> {
  const ids = await read<string[]>(decksKey(userId)); if (!ids) return undefined;
  return (await Promise.all(ids.map((x) => read<Deck>(deckKey(userId, x))))).filter((x): x is Deck => Boolean(x));
}
export async function createDeck(userId: number, title: string, description = ""): Promise<Deck | undefined> {
  const ids = await read<string[]>(decksKey(userId)); if (!ids && !(await storageReady())) return undefined;
  const deck: Deck = { id: id("deck"), title, description, visibility: "private", created_at: now() };
  await write(deckKey(userId, deck.id), deck); await write(cardsKey(userId, deck.id), []); await write(decksKey(userId), [...(ids ?? []), deck.id]); return deck;
}
export async function getDeck(userId: number, deckId: string): Promise<Deck | undefined> { return read(deckKey(userId, deckId)); }
export async function listCards(userId: number, deckId: string): Promise<Card[] | undefined> {
  const ids = await read<string[]>(cardsKey(userId, deckId)); if (!ids) return undefined;
  return (await Promise.all(ids.map((x) => read<Card>(cardKey(userId, x))))).filter((x): x is Card => Boolean(x));
}
export async function getCard(userId: number, cardId: string): Promise<Card | undefined> { return read(cardKey(userId, cardId)); }
export async function addCard(userId: number, deckId: string, prompt: string, answer: string, example?: string): Promise<Card | undefined> {
  const ids = await read<string[]>(cardsKey(userId, deckId)); if (!ids) return undefined;
  const card: Card = { id: id("card"), deck_id: deckId, prompt, answer, example, ease: 2.5, interval: 0, due_date: now(), state: "new" };
  await write(cardKey(userId, card.id), card); await write(cardsKey(userId, deckId), [...ids, card.id]); return card;
}
export async function importCards(userId: number, deckId: string, rows: Array<{ prompt: string; answer: string; example?: string }>): Promise<number | undefined> {
  for (const row of rows) if (!(await addCard(userId, deckId, row.prompt, row.answer, row.example))) return undefined;
  return rows.length;
}
export function rate(card: Card, rating: Rating, intensity: number): Card {
  const quality = ({ again: 0, hard: 3, good: 4, easy: 5 } as const)[rating];
  let ease = Math.max(1.3, card.ease + (0.1 - (5 - quality) * (0.08 + (5 - quality) * 0.02)));
  let interval: number;
  if (quality < 3) { interval = 1; ease = Math.max(1.3, ease - 0.2); }
  else if (card.interval === 0) interval = 1;
  else if (card.interval === 1) interval = rating === "hard" ? 2 : 6;
  else interval = Math.max(1, Math.round(card.interval * ease * (rating === "hard" ? 0.8 : rating === "easy" ? 1.3 : 1) / Math.max(0.5, intensity)));
  return { ...card, ease, interval, due_date: now() + interval * 86_400_000, state: quality < 3 ? "learning" : "review" };
}
export async function saveCard(userId: number, card: Card): Promise<boolean> { return write(cardKey(userId, card.id), card); }
export async function deleteCard(userId: number, deckId: string, cardId: string): Promise<boolean> {
  const redis = await client(); const ids = await read<string[]>(cardsKey(userId, deckId));
  if (!redis || !ids?.includes(cardId)) return false;
  await redis.del(`vocab:${cardKey(userId, cardId)}`); await write(cardsKey(userId, deckId), ids.filter((id) => id !== cardId)); return true;
}
export async function recordStudy(profile: Profile): Promise<Profile> {
  const day = todayKey(); const previous = profile.last_study_day;
  const yesterday = todayKey(now() - 86_400_000);
  const streak_count = previous === day ? profile.streak_count : previous === yesterday ? profile.streak_count + 1 : 1;
  const next = { ...profile, streak_count, last_study_day: day }; await saveProfile(next); return next;
}
