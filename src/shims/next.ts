/** Минимум типов из пакета next, которым пользуются страницы. */
export type Metadata = {
  title?: string | { default?: string; template?: string; absolute?: string };
  description?: string | null;
  [key: string]: unknown;
};
