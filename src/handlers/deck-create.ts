import { Composer } from "grammy";
import type { Ctx } from "../bot.js";
import { inlineButton, inlineKeyboard, registerMainMenuItem } from "../toolkit/index.js";
import { addCard, createDeck, deleteCard, getCard, getDeck, importCards, listCards, saveCard } from "../vocab/store.js";

registerMainMenuItem({ label: "➕ Add deck", data: "deck:create", order: 20 });
const composer = new Composer<Ctx>();
const back = inlineKeyboard([[inlineButton("⬅️ Back to menu", "menu:main")]]);
const deckMenu = inlineKeyboard([[inlineButton("Type a deck name", "deck:new")], [inlineButton("Import CSV", "deck:csv")], [inlineButton("⬅️ Back to menu", "menu:main")]]);
const userId = (ctx: Ctx) => ctx.from?.id;

function deckDetails(title: string, count: number, id: string) {
  return { text: `“${title}” is ready with ${count} card${count === 1 ? "" : "s"}. Keep going — every card counts.`, reply_markup: inlineKeyboard([[inlineButton("Add a card", `deck:add:${id}`)], [inlineButton("Manage cards", `deck:cards:${id}`)], [inlineButton("Study this deck", `study:deck:${id}`)], [inlineButton("⬅️ Back to menu", "menu:main")]]) };
}

composer.callbackQuery("deck:create", async (ctx) => { await ctx.answerCallbackQuery(); ctx.session.step = "idle"; await ctx.editMessageText("Build a private deck your way. Type cards one by one, or import a CSV with prompt,answer,example columns.", { reply_markup: deckMenu }); });
composer.callbackQuery("deck:new", async (ctx) => { await ctx.answerCallbackQuery(); ctx.session.step = "deck_title"; await ctx.editMessageText("What should this deck be called?", { reply_markup: inlineKeyboard([[inlineButton("Cancel", "deck:create")]]) }); });
composer.callbackQuery("deck:csv", async (ctx) => { await ctx.answerCallbackQuery(); ctx.session.step = "deck_csv"; await ctx.editMessageText("Send a CSV file with a header row: prompt,answer,example. I’ll ask for the deck name after I check it.", { reply_markup: inlineKeyboard([[inlineButton("Cancel", "deck:create")]]) }); });

composer.callbackQuery(/^deck:add:/, async (ctx) => { await ctx.answerCallbackQuery(); const deckId = ctx.callbackQuery.data.slice("deck:add:".length); ctx.session.activeDeckId = deckId; ctx.session.step = "card_prompt"; await ctx.editMessageText("Send the word or phrase you want to remember.", { reply_markup: inlineKeyboard([[inlineButton("Done adding", `deck:show:${deckId}`)]]) }); });
composer.callbackQuery(/^deck:show:/, async (ctx) => { await ctx.answerCallbackQuery(); const uid = userId(ctx); const id = ctx.callbackQuery.data.slice("deck:show:".length); if (!uid) return; const [deck, cards] = await Promise.all([getDeck(uid, id), listCards(uid, id)]); if (!deck || !cards) { await ctx.editMessageText("I couldn’t find that deck. Tap Add deck to make a new one.", { reply_markup: back }); return; } const view = deckDetails(deck.title, cards.length, id); await ctx.editMessageText(view.text, { reply_markup: view.reply_markup }); });
composer.callbackQuery(/^deck:cards:/, async (ctx) => { await ctx.answerCallbackQuery(); const uid = userId(ctx); const deckId = ctx.callbackQuery.data.slice("deck:cards:".length); if (!uid) return; const cards = await listCards(uid, deckId); if (!cards) return; if (cards.length === 0) { await ctx.editMessageText("No cards here yet — tap Add a card to create the first one.", { reply_markup: inlineKeyboard([[inlineButton("Add a card", `deck:add:${deckId}`)], [inlineButton("⬅️ Deck", `deck:show:${deckId}`)]]) }); return; } await ctx.editMessageText("Pick a card to edit or delete.", { reply_markup: inlineKeyboard([...cards.slice(0, 6).map((card) => [inlineButton(card.prompt.slice(0, 24), `card:view:${card.id}`)]), [inlineButton("⬅️ Deck", `deck:show:${deckId}`)]]) }); });
composer.callbackQuery(/^card:view:/, async (ctx) => { await ctx.answerCallbackQuery(); const uid = userId(ctx); const cardId = ctx.callbackQuery.data.slice("card:view:".length); if (!uid) return; const card = await getCard(uid, cardId); if (!card) return; ctx.session.activeDeckId = card.deck_id; ctx.session.currentCardId = card.id; await ctx.editMessageText(`${card.prompt}\n\n${card.answer}${card.example ? `\n\nExample: ${card.example}` : ""}`, { reply_markup: inlineKeyboard([[inlineButton("Edit", "card:edit")], [inlineButton("Delete", "card:delete")], [inlineButton("⬅️ Cards", `deck:cards:${card.deck_id}`)]]) }); });
composer.callbackQuery("card:edit", async (ctx) => { await ctx.answerCallbackQuery(); ctx.session.step = "card_edit_prompt"; await ctx.editMessageText("Send the new word or phrase for this card.", { reply_markup: inlineKeyboard([[inlineButton("Cancel", `deck:cards:${ctx.session.activeDeckId ?? ""}`)]]) }); });
composer.callbackQuery("card:delete", async (ctx) => { await ctx.answerCallbackQuery(); await ctx.editMessageText("Delete this card? This can’t be undone.", { reply_markup: inlineKeyboard([[inlineButton("Delete card", "card:delete:yes"), inlineButton("Keep it", "card:delete:no")]]) }); });
composer.callbackQuery("card:delete:no", async (ctx) => { await ctx.answerCallbackQuery(); const id = ctx.session.currentCardId; if (id) await ctx.editMessageText("Kept it. Every review is progress.", { reply_markup: inlineKeyboard([[inlineButton("⬅️ Cards", `deck:cards:${ctx.session.activeDeckId ?? ""}`)]]) }); });
composer.callbackQuery("card:delete:yes", async (ctx) => { await ctx.answerCallbackQuery(); const uid = userId(ctx); const cardId = ctx.session.currentCardId; const deckId = ctx.session.activeDeckId; if (!uid || !cardId || !deckId || !(await deleteCard(uid, deckId, cardId))) { await ctx.editMessageText("I couldn’t delete that card. Please try again.", { reply_markup: back }); return; } await ctx.editMessageText("Card deleted. Your deck is still moving forward.", { reply_markup: inlineKeyboard([[inlineButton("⬅️ Cards", `deck:cards:${deckId}`)]]) }); });

composer.on("message:text", async (ctx, next) => {
  const uid = userId(ctx); if (!uid) return next(); const text = ctx.message.text.trim();
  if (ctx.session.step === "deck_title") {
    if (text.length < 1 || text.length > 60) { await ctx.reply("Use a deck name between 1 and 60 characters."); return; }
    const deck = await createDeck(uid, text); if (!deck) { await ctx.reply("Your study space isn’t set up yet. Try again when storage is available."); return; }
    ctx.session.step = "idle"; const view = deckDetails(deck.title, 0, deck.id); await ctx.reply(view.text, { reply_markup: view.reply_markup }); return;
  }
  if (ctx.session.step === "card_prompt") { if (!text) return; ctx.session.draftCardPrompt = text; ctx.session.step = "card_answer"; await ctx.reply("Great — what’s the answer or translation?"); return; }
  if (ctx.session.step === "card_answer") { if (!text) return; ctx.session.draftCardAnswer = text; ctx.session.step = "card_example"; await ctx.reply("Add an example sentence, or tap Skip.", { reply_markup: inlineKeyboard([[inlineButton("Skip", "deck:skip-example")]]) }); return; }
  if (ctx.session.step === "card_example") { await finishCard(ctx, text); return; }
  if (ctx.session.step === "card_edit_prompt") { if (!text) return; ctx.session.draftCardPrompt = text; ctx.session.step = "card_edit_answer"; await ctx.reply("Now send the new answer or translation."); return; }
  if (ctx.session.step === "card_edit_answer") { const card = ctx.session.currentCardId ? await getCard(uid, ctx.session.currentCardId) : undefined; if (!card || !text || !ctx.session.draftCardPrompt) { await ctx.reply("That edit didn’t save. Please try again."); return; } await saveCard(uid, { ...card, prompt: ctx.session.draftCardPrompt, answer: text }); ctx.session.step = "idle"; await ctx.reply("Card updated! Nice bit of maintenance.", { reply_markup: inlineKeyboard([[inlineButton("⬅️ Cards", `deck:cards:${card.deck_id}`)]]) }); return; }
  return next();
});
composer.callbackQuery("deck:skip-example", async (ctx) => { await ctx.answerCallbackQuery(); await finishCard(ctx); });

async function finishCard(ctx: Ctx, example?: string) {
  const uid = userId(ctx); const deckId = ctx.session.activeDeckId; const prompt = ctx.session.draftCardPrompt; const answer = ctx.session.draftCardAnswer;
  if (!uid || !deckId || !prompt || !answer) { ctx.session.step = "idle"; await ctx.reply("That card draft slipped away. Tap Add a card and try again."); return; }
  const card = await addCard(uid, deckId, prompt, answer, example?.trim() || undefined); if (!card) { await ctx.reply("I couldn’t save that card just now. Please try again."); return; }
  ctx.session.step = "idle"; ctx.session.draftCardPrompt = undefined; ctx.session.draftCardAnswer = undefined;
  await ctx.reply("Card added! You’re building a strong habit.", { reply_markup: inlineKeyboard([[inlineButton("Add another", `deck:add:${deckId}`)], [inlineButton("View deck", `deck:show:${deckId}`)]]) });
}

composer.on("message:document", async (ctx, next) => {
  if (ctx.session.step !== "deck_csv") return next();
  const uid = userId(ctx); const doc = ctx.message.document;
  if (!uid || !doc.file_name?.toLowerCase().endsWith(".csv") || (doc.file_size ?? 0) > 1_000_000) { await ctx.reply("Send a CSV file smaller than 1 MB with prompt and answer columns."); return; }
  try {
    const file = await ctx.getFile(); const token = (ctx as Ctx & { env?: { BOT_TOKEN?: string } }).env?.BOT_TOKEN ?? (typeof process === "undefined" ? undefined : process.env.BOT_TOKEN);
    if (!token || !file.file_path) { await ctx.reply("CSV import isn’t set up yet. Please add cards one by one for now."); return; }
    const response = await fetch(`https://api.telegram.org/file/bot${token}/${file.file_path}`); if (!response.ok) throw new Error("download failed"); const content = await response.text(); const rows = parseCsv(content);
    if (rows.length === 0) { await ctx.reply("I couldn’t find any valid cards. Include a prompt and answer on each row."); return; }
    const title = doc.file_name.replace(/\.csv$/i, "").slice(0, 60) || "Imported deck"; const deck = await createDeck(uid, title);
    if (!deck || !(await importCards(uid, deck.id, rows))) { await ctx.reply("Your study space isn’t set up yet. Try again when storage is available."); return; }
    ctx.session.step = "idle"; const view = deckDetails(deck.title, rows.length, deck.id); await ctx.reply(`Imported ${rows.length} cards. ${view.text}`, { reply_markup: view.reply_markup });
  } catch { await ctx.reply("I couldn’t read that CSV. Check the columns and try again."); }
});

function parseCsv(input: string): Array<{ prompt: string; answer: string; example?: string }> {
  const lines = input.replace(/^\uFEFF/, "").split(/\r?\n/).filter(Boolean); if (lines.length < 2) return [];
  const header = split(lines[0]).map((x) => x.toLowerCase()); const promptAt = header.indexOf("prompt"); const answerAt = header.indexOf("answer"); const exampleAt = header.indexOf("example");
  if (promptAt < 0 || answerAt < 0) return []; const rows = lines.slice(1, 201).map(split).map((row) => ({ prompt: row[promptAt]?.trim(), answer: row[answerAt]?.trim(), example: exampleAt >= 0 ? row[exampleAt]?.trim() : undefined })).filter((row): row is { prompt: string; answer: string; example: string | undefined } => Boolean(row.prompt && row.answer)); return rows;
}
function split(line: string): string[] { const out: string[] = []; let value = ""; let quoted = false; for (let i = 0; i < line.length; i += 1) { const c = line[i]; if (c === '"' && line[i + 1] === '"') { value += '"'; i += 1; } else if (c === '"') quoted = !quoted; else if (c === "," && !quoted) { out.push(value); value = ""; } else value += c; } out.push(value); return out; }
export default composer;
