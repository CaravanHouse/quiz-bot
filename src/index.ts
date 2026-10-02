import "dotenv/config";
import { join } from "node:path";
import { createBot } from "./bot";
import { openStore } from "./store";

const token = process.env.BOT_TOKEN;
if (!token) { console.error("Укажите BOT_TOKEN в .env"); process.exit(1); }

const store = openStore(join(process.cwd(), "data", "quiz.json"));
const bot = createBot(token, store, {
  adminChatId: process.env.ADMIN_CHAT_ID || undefined,
  configuratorUrl: process.env.CONFIGURATOR_URL || undefined,
});
bot.catch((e) => console.error("Ошибка бота:", e.message));
void bot.api.setMyCommands([{ command: "start", description: "Пройти тест" }]).catch(() => {});
void bot.start({ onStart: (me) => console.log(`Бот @${me.username} запущен`) });
process.on("SIGTERM", () => { store.flush(); process.exit(0); });
