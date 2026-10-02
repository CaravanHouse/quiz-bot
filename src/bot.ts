import { Bot, Context, InlineKeyboard, Keyboard, session, type SessionFlavor } from "grammy";
import { KIND_INFO, QUESTIONS, progress, recommend, resultDays, resultKey, resultTitle } from "./quiz";
import type { Store } from "./store";

interface SessionData { step: number; answers: number[]; resultKey?: string; resultTitle?: string; awaitingContact: boolean }
export type MyContext = Context & SessionFlavor<SessionData>;

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const fresh = (): SessionData => ({ step: 0, answers: [], awaitingContact: false });

function questionView(step: number) {
  const q = QUESTIONS[step];
  const kb = new InlineKeyboard();
  q.options.forEach((o, i) => kb.text(o.label, `a:${step}:${i}`).row());
  return { text: `<code>${progress(step)}</code>\n\n<b>${q.text}</b>`, kb };
}

function resultView(answers: number[], configuratorUrl?: string) {
  const { kinds } = recommend(answers);
  const parts = kinds.map((k) => KIND_INFO[k]);
  const text = [
    "<b>Ваш результат</b>",
    "",
    `🎯 <b>${resultTitle(kinds)}</b>`,
    kinds.length > 1 ? "Лучше всего сработает связка из двух направлений." : "",
    "",
    ...parts.map((p) => p.pitch),
    "",
    "<b>Что входит:</b>",
    ...parts.flatMap((p) => p.includes.slice(0, kinds.length > 1 ? 2 : 4).map((i) => `• ${i}`)),
    "",
    `⏱ Ориентировочный срок: ~${resultDays(kinds)} дн.`,
  ].filter((l, i, a) => !(l === "" && a[i - 1] === "")).join("\n");
  const kb = new InlineKeyboard().text("📩 Обсудить проект", "lead").row();
  if (configuratorUrl) kb.url("🧮 Посчитать смету", configuratorUrl).row();
  kb.text("🔁 Пройти заново", "q:start");
  return { text, kb, kinds };
}

export function createBot(token: string, store: Store, opts: { adminChatId?: string; configuratorUrl?: string; botInfo?: ConstructorParameters<typeof Bot>[1] extends infer O ? (O extends { botInfo?: infer B } ? B : never) : never }) {
  const bot = new Bot<MyContext>(token, opts.botInfo ? { botInfo: opts.botInfo } : undefined);
  const isAdmin = (chatId?: number) => !!opts.adminChatId && String(chatId) === String(opts.adminChatId);
  bot.use(session({ initial: fresh }));

  bot.command("start", async (ctx) => {
    ctx.session = fresh();
    await ctx.reply(
      "👋 Привет! Я помогу понять, что нужно вашему бизнесу: <b>бот, сайт или мини-приложение в Telegram</b>.\n\nПять коротких вопросов, примерно минута.",
      { parse_mode: "HTML", reply_markup: new InlineKeyboard().text("▶️ Начать тест", "q:start") }
    );
  });

  bot.command("id", (ctx) => ctx.reply(`id этого чата: <code>${ctx.chat.id}</code>\nВпишите его в ADMIN_CHAT_ID.`, { parse_mode: "HTML" }));

  bot.callbackQuery("q:start", async (ctx) => {
    ctx.session = fresh();
    store.data.started += 1; store.save();
    const v = questionView(0);
    await ctx.editMessageText(v.text, { parse_mode: "HTML", reply_markup: v.kb });
    await ctx.answerCallbackQuery();
  });

  bot.callbackQuery(/^a:(\d+):(\d+)$/, async (ctx) => {
    const q = Number(ctx.match[1]), o = Number(ctx.match[2]);
    // защита от двойных тапов и старых сообщений: принимаем ответ только на текущий вопрос
    if (q !== ctx.session.step || !QUESTIONS[q]?.options[o]) return ctx.answerCallbackQuery({ text: "Этот вопрос уже пройден" });
    ctx.session.answers.push(o);
    ctx.session.step += 1;

    if (ctx.session.step < QUESTIONS.length) {
      const v = questionView(ctx.session.step);
      await ctx.editMessageText(v.text, { parse_mode: "HTML", reply_markup: v.kb });
    } else {
      const r = resultView(ctx.session.answers, opts.configuratorUrl);
      ctx.session.resultKey = resultKey(r.kinds);
      ctx.session.resultTitle = resultTitle(r.kinds);
      store.data.finished += 1;
      store.data.results[ctx.session.resultKey] = (store.data.results[ctx.session.resultKey] ?? 0) + 1;
      store.save();
      await ctx.editMessageText(r.text, { parse_mode: "HTML", reply_markup: r.kb });
    }
    await ctx.answerCallbackQuery();
  });

  bot.callbackQuery("lead", async (ctx) => {
    if (!ctx.session.resultKey) return ctx.answerCallbackQuery({ text: "Сначала пройдите тест" });
    ctx.session.awaitingContact = true;
    await ctx.answerCallbackQuery();
    await ctx.reply("Оставьте номер, и мы свяжемся, чтобы обсудить проект. Нажмите кнопку ниже 👇", {
      reply_markup: new Keyboard().requestContact("📱 Поделиться номером").row().text("Отмена").oneTime().resized(),
    });
  });

  bot.hears("Отмена", async (ctx) => {
    ctx.session.awaitingContact = false;
    await ctx.reply("Хорошо. Если передумаете — нажмите «Обсудить проект» под результатом.", { reply_markup: { remove_keyboard: true } });
  });

  bot.on("message:contact", async (ctx) => {
    const c = ctx.message.contact;
    if (!ctx.session.awaitingContact) return;
    if (c.user_id !== ctx.from.id) return ctx.reply("Пожалуйста, отправьте свой номер кнопкой «Поделиться номером».");
    const lead = { id: store.data.leads.length + 1, at: Date.now(), userId: ctx.from.id, name: ctx.from.first_name, username: ctx.from.username, phone: c.phone_number, result: ctx.session.resultTitle ?? "—" };
    store.data.leads.push(lead); store.save();
    ctx.session.awaitingContact = false;
    await ctx.reply("Спасибо! Мы напишем вам в ближайшее время 🙌", { reply_markup: { remove_keyboard: true } });
    if (opts.adminChatId) {
      const who = lead.username ? `@${lead.username}` : esc(lead.name);
      await ctx.api.sendMessage(opts.adminChatId, `📩 <b>Заявка из квиза №${lead.id}</b>\n\n👤 ${who}\n📞 ${esc(lead.phone)}\n🎯 Результат: ${esc(lead.result)}`, { parse_mode: "HTML" }).catch((e) => console.error("Не удалось отправить заявку:", e.message));
    }
  });

  bot.command("stats", (ctx) => {
    if (!isAdmin(ctx.chat.id)) return;
    const d = store.data;
    const rate = d.started ? Math.round((d.finished / d.started) * 100) : 0;
    const results = Object.entries(d.results).sort((a, b) => b[1] - a[1]).map(([k, n]) => `• ${k}: ${n}`);
    return ctx.reply(`📊 Начали: ${d.started}\nДошли до конца: ${d.finished} (${rate}%)\nЗаявок: ${d.leads.length}\n\n${results.join("\n") || "Результатов пока нет"}`);
  });

  return bot;
}
