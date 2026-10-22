import { Suspense, use, useEffect, type ReactNode } from "react";
import { useLocation, useParams, useSearchParams } from "react-router";

import type { Metadata } from "next";

/**
 * Страницы перенесены со старого сайта как асинхронные функции:
 * они сами грузят данные и возвращают готовую разметку. Здесь мы
 * вызываем такую функцию, ждём её промис через React `use()` и
 * показываем результат. Промисы кэшируются по адресу страницы.
 */

type PageModule = {
  default: (props: PageProps) => Promise<ReactNode> | ReactNode;
  generateMetadata?: (props: PageProps) => Promise<Metadata> | Metadata;
};

const cache = new Map<string, Promise<ReactNode>>();
const MAX_CACHE = 40;

function load(key: string, run: () => Promise<ReactNode> | ReactNode) {
  let promise = cache.get(key);
  if (!promise) {
    promise = Promise.resolve().then(run);
    cache.set(key, promise);
    if (cache.size > MAX_CACHE) {
      const oldest = cache.keys().next().value;
      if (oldest) cache.delete(oldest);
    }
  }
  return promise;
}

/** Сброс кэша, например после правок в админке. */
export function clearPageCache() {
  cache.clear();
}

function Rendered({ promise }: { promise: Promise<ReactNode> }) {
  return <>{use(promise)}</>;
}

function titleOf(meta: Metadata): string | null {
  const t = meta.title;
  if (!t) return null;
  if (typeof t === "string") return `${t} · Concerts Prod`;
  return t.absolute ?? t.default ?? null;
}

export function AsyncPage({ module: mod }: { module: PageModule }) {
  const params = useParams();
  const [search] = useSearchParams();
  const { pathname } = useLocation();
  const key = `${pathname}?${search.toString()}`;

  const props: PageProps = {
    params: Promise.resolve(params as Record<string, string>),
    searchParams: Promise.resolve(Object.fromEntries(search.entries())),
  };

  const promise = load(key, () => mod.default(props));

  useEffect(() => {
    window.scrollTo(0, 0);
    if (!mod.generateMetadata) {
      document.title = "Concerts Prod";
      return;
    }
    Promise.resolve(mod.generateMetadata(props))
      .then((meta) => {
        document.title = titleOf(meta) ?? "Concerts Prod";
      })
      .catch(() => {});
    // props пересоздаются на каждом рендере, следим только за адресом
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, mod]);

  return (
    <Suspense fallback={<PageSkeleton />}>
      <Rendered promise={promise} />
    </Suspense>
  );
}

function PageSkeleton() {
  return (
    <div className="mx-auto flex min-h-[60vh] max-w-6xl items-center justify-center px-5">
      <span className="h-8 w-8 animate-spin rounded-full border-2 border-line-strong border-t-coral" />
    </div>
  );
}
