/// <reference types="vite/client" />

/** Типы страниц из Next.js, на которых написаны перенесённые страницы. */
type PageProps<_Route extends string = string> = {
  params: Promise<Record<string, string>>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

type LayoutProps<_Route extends string = string> = PageProps<_Route> & {
  children: import("react").ReactNode;
};
