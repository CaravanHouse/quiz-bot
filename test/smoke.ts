import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { QUESTIONS, recommend, score } from "../src/quiz";
import { createBot, type SessionData } from "../src/bot";
import { openStore, SessionStore } from "../src/store";
import { httpsUrl } from "../src/env";

// 1. подсчёт баллов
const botFan = [1, 0, 2, 0, 0]; // услуги, Instagram, FAQ, мало клиентов, срочно
assert.equal(recommend(botFan).kinds[0], "bot");
assert.deepEqual(recommend([0, 2, 4, 0, 1]).kinds[0], "site", "хочет рассказать о себе и идёт из поиска — сайт");
assert.ok(recommend([0, 0, 0, 2, 1]).kinds.includes("app"), "магазин с потоком — есть мини-апп");
assert.deepEqual(score([99]), { bot: 0, site: 0, app: 0 }, "несуществующий ответ не ломает подсчёт");

// 2. диалог целиком (Telegram подменён заглушкой)
const calls: { method: string; payload: any }[] = [];
const store = openStore(join(mkdtempSync(join(tmpdir(), "quiz-")), "q.json"));
const bot = createBot("123:TEST", store, {
  adminChatId: "555",
  botInfo: { id: 123, is_bot: true, first_name: "t", username: "t_bot", can_join_groups: true, can_read_all_group_messages: false, supports_inline_queries: false, can_connect_to_business: false, has_main_web_app: false } as any,
});
bot.api.config.use(async (_p, method, payload) => { calls.push({ method, payload }); return { ok: true, result: { message_id: 1, date: 0, chat: { id: 1, type: "private" } } } as any; });

let uid = 1000;
const from = { id: 42, is_bot: false, first_name: "Алишер", username: "alisher" };
const chat = { id: 42, type: "private" as const };
const msg = (extra: object) => ({ update_id: uid++, message: { message_id: uid, date: 0, chat, from, ...extra } }) as any;
const press = (data: string) => ({ update_id: uid++, callback_query: { id: String(uid), chat_instance: "x", from, data, message: { message_id: 1, date: 0, chat, text: "x" } } }) as any;
const last = (method: string) => [...calls].reverse().find((c) => c.method === method)!;

await bot.handleUpdate(msg({ text: "/start", entities: [{ type: "bot_command", offset: 0, length: 6 }] }));
assert.ok(last("sendMessage").payload.text.includes("Привет"));
await bot.handleUpdate(press("q:start"));
assert.ok(last("editMessageText").payload.text.includes(QUESTIONS[0].text));
assert.equal(store.data.started, 1);

await bot.handleUpdate(press("a:3:0")); // чужой шаг: игнорируется
assert.ok(last("answerCallbackQuery").payload.text.includes("уже пройден"));
for (const [q, o] of botFan.entries()) await bot.handleUpdate(press(`a:${q}:${o}`));
const res = last("editMessageText").payload;
assert.ok(res.text.includes("Ваш результат") && res.text.includes("Telegram-бот"), "показан результат");
assert.equal(store.data.finished, 1);
await bot.handleUpdate(press(`a:4:0`)); // повторный тап по старому вопросу
assert.equal(store.data.finished, 1, "двойной тап не засчитывается второй раз");

// 3. заявка с контактом
await bot.handleUpdate(press("lead"));
assert.ok(JSON.stringify(last("sendMessage").payload.reply_markup).includes("request_contact"), "кнопка запроса номера");
await bot.handleUpdate(msg({ contact: { phone_number: "+998901234567", first_name: "Чужой", user_id: 7 } }));
assert.equal(store.data.leads.length, 0, "чужой номер не принимается");
await bot.handleUpdate(msg({ contact: { phone_number: "+998901234567", first_name: "Алишер", user_id: 42 } }));
assert.equal(store.data.leads.length, 1);
const toAdmin = calls.filter((c) => c.method === "sendMessage" && String(c.payload.chat_id) === "555").at(-1)!;
assert.ok(toAdmin.payload.text.includes("@alisher") && toAdmin.payload.text.includes("Telegram-бот"), "админу ушла заявка с результатом");

// 4. статистика только для админа
calls.length = 0;
await bot.handleUpdate({ ...msg({ text: "/stats", entities: [{ type: "bot_command", offset: 0, length: 6 }] }) });
assert.equal(calls.length, 0, "/stats молчит для обычного пользователя");

// 5. сессия переживает перезапуск бота
const sessFile = join(mkdtempSync(join(tmpdir(), "quiz-sess-")), "s.json");
const botInfo = { id: 123, is_bot: true, first_name: "t", username: "t_bot", can_join_groups: true, can_read_all_group_messages: false, supports_inline_queries: false, can_connect_to_business: false, has_main_web_app: false } as any;
const before = new SessionStore<SessionData>(sessFile);
const bot2 = createBot("123:TEST", store, { sessions: before, botInfo });
bot2.api.config.use(async (_p, method, payload) => { calls.push({ method, payload }); return { ok: true, result: true } as any; });
await bot2.handleUpdate(press("q:start"));
await bot2.handleUpdate(press("a:0:1"));
await bot2.handleUpdate(press("a:1:0"));
before.flush();
const bot3 = createBot("123:TEST", store, { sessions: new SessionStore<SessionData>(sessFile), botInfo });
bot3.api.config.use(async (_p, method, payload) => { calls.push({ method, payload }); return { ok: true, result: true } as any; });
await bot3.handleUpdate(press("a:2:2"));
assert.ok(last("editMessageText").payload.text.includes(QUESTIONS[3].text), "после перезапуска квиз продолжается с того же вопроса");

// адрес конфигуратора для кнопки «Посчитать смету»
assert.equal(httpsUrl("CONFIGURATOR_URL", "configurator.up.railway.app"), "https://configurator.up.railway.app/", "без схемы дописываем https://");
assert.equal(httpsUrl("CONFIGURATOR_URL", "http://configurator.up.railway.app"), undefined, "http не принимаем");
assert.equal(httpsUrl("CONFIGURATOR_URL", "not a url"), undefined, "мусор не принимаем");

console.log("✓ все проверки пройдены");
process.exit(0);
