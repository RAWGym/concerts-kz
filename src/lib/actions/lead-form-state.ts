/**
 * Состояние формы заявки живёт отдельно от самого действия: модуль с
 * "use server" может экспортировать только async-функции, поэтому
 * константу оттуда клиент получил бы как undefined.
 */

export type LeadFormState = {
  status: "idle" | "success" | "error";
  message: string;
  /** Поля с ошибками — чтобы подсветить их в форме. */
  fields: string[];
};

export const initialLeadFormState: LeadFormState = {
  status: "idle",
  message: "",
  fields: [],
};
