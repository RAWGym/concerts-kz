import type { AnchorHTMLAttributes } from "react";
import { Link as RouterLink } from "react-router";

type Props = AnchorHTMLAttributes<HTMLAnchorElement> & {
  href: string;
  prefetch?: boolean;
};

/** Аналог next/link: внутренние пути ведёт роутер, внешние — обычный <a>. */
export default function Link({ href, prefetch: _prefetch, ...rest }: Props) {
  const isExternal = /^(https?:|mailto:|tel:)/.test(href);
  if (isExternal) return <a href={href} {...rest} />;
  return <RouterLink to={href} {...rest} />;
}
