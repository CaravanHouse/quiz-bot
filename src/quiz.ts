export type Kind = "bot" | "site" | "app";
export type Scores = Record<Kind, number>;
export interface Option { label: string; score: Partial<Scores> }
export interface Question { text: string; options: Option[] }

export const QUESTIONS: Question[] = [
  { text: "Чем занимается ваш бизнес?", options: [
    { label: "Магазин, товары", score: { bot: 1, site: 1, app: 2 } },
    { label: "Услуги и запись (салон, клиника)", score: { bot: 2, site: 1, app: 1 } },
    { label: "Обучение, курсы", score: { bot: 2, site: 1, app: 1 } },
    { label: "Кафе, доставка еды", score: { bot: 1, app: 2 } },
    { label: "Другое", score: { site: 1, bot: 1 } },
  ] },
  { text: "Откуда сейчас приходят клиенты?", options: [
    { label: "Instagram и Telegram", score: { bot: 2, app: 1 } },
    { label: "Сарафанное радио", score: { bot: 1, site: 1 } },
    { label: "Реклама и поиск Google/Яндекс", score: { site: 2 } },
    { label: "Пока нет стабильного потока", score: { site: 2, bot: 1 } },
  ] },
  { text: "Что хотите автоматизировать в первую очередь?", options: [
    { label: "Приём заказов", score: { bot: 1, app: 2 } },
    { label: "Запись клиентов", score: { bot: 2, app: 1 } },
    { label: "Ответы на частые вопросы", score: { bot: 3 } },
    { label: "Рассылки и акции", score: { bot: 2, app: 1 } },
    { label: "Рассказать о себе в интернете", score: { site: 3 } },
  ] },
  { text: "Сколько клиентов обращается в день?", options: [
    { label: "До 10", score: { bot: 1, site: 1 } },
    { label: "От 10 до 50", score: { bot: 1, app: 1 } },
    { label: "Больше 50", score: { app: 2, bot: 1 } },
  ] },
  { text: "Когда нужен результат?", options: [
    { label: "За неделю-две", score: { bot: 2 } },
    { label: "За месяц", score: { site: 1, app: 1 } },
    { label: "Не горит, важно качество", score: { site: 1, app: 1 } },
  ] },
];

export const KIND_INFO: Record<Kind, { title: string; pitch: string; includes: string[]; days: number }> = {
  bot: {
    title: "Telegram-бот",
    pitch: "Бот отвечает клиентам, принимает заявки и записи круглосуточно, пока вы заняты делом.",
    includes: ["Меню с кнопками и частыми вопросами", "Приём заявок и записей", "Уведомления вам в Telegram", "Рассылки по клиентам"],
    days: 7,
  },
  site: {
    title: "Сайт",
    pitch: "Сайт делает бизнес видимым в поиске и показывает услуги и цены, не отвлекая вас на объяснения.",
    includes: ["Дизайн и адаптив под телефон", "Форма заявки с отправкой в Telegram", "Быстрая загрузка и SEO-основа", "Русский и узбекский язык"],
    days: 10,
  },
  app: {
    title: "Telegram Mini App",
    pitch: "Магазин или сервис прямо внутри Telegram: каталог, корзина и заказы без установки приложения.",
    includes: ["Каталог и корзина", "Оформление заказа в два касания", "Статусы заказа в чате", "Панель владельца в боте"],
    days: 14,
  },
};

export const emptyScores = (): Scores => ({ bot: 0, site: 0, app: 0 });

export function score(answers: number[]): Scores {
  const s = emptyScores();
  answers.forEach((o, q) => {
    const opt = QUESTIONS[q]?.options[o];
    if (!opt) return;
    for (const [k, v] of Object.entries(opt.score) as [Kind, number][]) s[k] += v;
  });
  return s;
}

/** Один лидер — рекомендуем его; если отрыв не больше 1 балла — связку из двух лучших */
export function recommend(answers: number[]): { kinds: Kind[]; scores: Scores } {
  const scores = score(answers);
  const sorted = (Object.keys(scores) as Kind[]).sort((a, b) => scores[b] - scores[a]);
  const kinds = scores[sorted[0]] - scores[sorted[1]] <= 1 && scores[sorted[1]] > 0 ? [sorted[0], sorted[1]] : [sorted[0]];
  return { kinds, scores };
}

export const resultKey = (kinds: Kind[]) => [...kinds].sort().join("+");
export const resultTitle = (kinds: Kind[]) => kinds.map((k) => KIND_INFO[k].title).join(" + ");
export const resultDays = (kinds: Kind[]) => Math.ceil(kinds.reduce((s, k) => s + KIND_INFO[k].days, 0) * (kinds.length > 1 ? 0.85 : 1));

export const progress = (step: number) => "▰".repeat(step) + "▱".repeat(QUESTIONS.length - step) + `  ${step}/${QUESTIONS.length}`;
