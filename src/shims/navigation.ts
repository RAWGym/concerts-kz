import { useLocation } from "react-router";

export function usePathname(): string {
  return useLocation().pathname;
}

/** Бросаем ошибку, её ловит errorElement маршрута и показывает 404. */
export class NotFoundError extends Error {}

export function notFound(): never {
  throw new NotFoundError("not found");
}
