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
    window.scrollTo({ top: 0, behavior: "instant" });
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

/** Пока страница грузит данные — контур будущей вёрстки, а не пустота. */
function PageSkeleton() {
  return (
    <div aria-busy className="mx-auto min-h-[70vh] max-w-7xl px-4 sm:px-6 py-12">
      <div className="skeleton h-3 w-28 rounded-full" />
      <div className="skeleton mt-4 h-10 w-2/3 max-w-md rounded-btn" />
      <div className="skeleton mt-3 h-4 w-1/2 max-w-sm rounded-full" />
      <div className="mt-12 grid grid-cols-2 gap-5 md:grid-cols-3 lg:grid-cols-4">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className={i > 1 ? "hidden md:block" : ""}>
            <div className="skeleton aspect-[3/4] rounded-card" />
            <div className="skeleton mt-4 h-3 w-1/2 rounded-full" />
            <div className="skeleton mt-3 h-4 w-3/4 rounded-full" />
          </div>
        ))}
      </div>
    </div>
  );
}
