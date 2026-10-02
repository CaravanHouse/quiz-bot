import "dotenv/config";
import { join } from "node:path";
import { createBot, type SessionData } from "./bot";
import { httpsUrl } from "./env";
import { openStore, SessionStore } from "./store";

const token = process.env.BOT_TOKEN;
if (!token) { console.error("Укажите BOT_TOKEN в .env"); process.exit(1); }
// На Railway укажите путь к подключённому Volume (например /data), иначе данные сотрутся при деплое
const dataDir = process.env.DATA_DIR || join(process.cwd(), "data");

const store = openStore(join(dataDir, "quiz.json"));
const sessions = new SessionStore<SessionData>(join(dataDir, "sessions.json"));
const bot = createBot(token, store, {
  adminChatId: process.env.ADMIN_CHAT_ID || undefined,
  // кривой адрес отключаем: иначе Telegram отклонил бы кнопку, и экран результата квиза не показался бы
  configuratorUrl: httpsUrl("CONFIGURATOR_URL", process.env.CONFIGURATOR_URL),
  sessions,
});
bot.catch((e) => console.error("Ошибка бота:", e.message));
void bot.api.setMyCommands([{ command: "start", description: "Пройти тест" }]).catch(() => {});
void bot.start({ onStart: (me) => console.log(`Бот @${me.username} запущен`) });
// Railway останавливает сервис через SIGTERM: успеваем записать данные на диск
for (const signal of ["SIGTERM", "SIGINT"] as const) process.on(signal, () => { store.flush(); sessions.flush(); process.exit(0); });
