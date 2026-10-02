import type { StorageAdapter } from "grammy";
import { JsonDb } from "./db";

export interface QuizLead { id: number; at: number; userId: number; name: string; username?: string; phone: string; result: string }
interface DbShape { started: number; finished: number; results: Record<string, number>; leads: QuizLead[] }

export const openStore = (file: string) => new JsonDb<DbShape>(file, { started: 0, finished: 0, results: {}, leads: [] });
export type Store = ReturnType<typeof openStore>;

/** Сессии диалога в файле: после перезапуска бота квиз продолжается с того же вопроса */
export class SessionStore<T> extends JsonDb<Record<string, T>> implements StorageAdapter<T> {
  constructor(file: string) { super(file, {}); }
  read(key: string) { return this.data[key]; }
  write(key: string, value: T) { this.data[key] = value; this.save(); }
  delete(key: string) { delete this.data[key]; this.save(); }
}
