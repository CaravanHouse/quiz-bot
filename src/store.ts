import { JsonDb } from "./db";

export interface QuizLead { id: number; at: number; userId: number; name: string; username?: string; phone: string; result: string }
interface DbShape { started: number; finished: number; results: Record<string, number>; leads: QuizLead[] }

export const openStore = (file: string) => new JsonDb<DbShape>(file, { started: 0, finished: 0, results: {}, leads: [] });
export type Store = ReturnType<typeof openStore>;
