import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { EventCard } from "@/components/event/event-card";
import { EmptyState, PageHeading, Section } from "@/components/ui/section";
import { isLocale } from "@/i18n/config";
import { getDictionary } from "@/i18n/dictionaries";
import { localePath } from "@/i18n/routing";
import { getEvents } from "@/lib/data/queries";
import type { EventCategory } from "@/lib/supabase/types";


const categories: EventCategory[] = [
  "concert",
  "festival",
  "standup",
  "show",
  "open_air",
];

const allCities = { ru: "Все города", kz: "Барлық қалалар", en: "All cities" } as const;

function parseCategory(value: string | string[] | undefined) {
  if (typeof value !== "string") return undefined;
  return categories.find((category) => category === value);
}

export async function generateMetadata({
  params,
}: PageProps<"/[locale]/events">): Promise<Metadata> {
  const { locale } = await params;
  if (!isLocale(locale)) return {};

  const t = getDictionary(locale);
  return {
    title: t.pages.eventsTitle,
    alternates: { canonical: localePath(locale, "/events") },
  };
}

export default async function EventsPage({
  params,
  searchParams,
}: PageProps<"/[locale]/events">) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();

  const t = getDictionary(locale);
  const { category: rawCategory, city: rawCity } = await searchParams;
  const category = parseCategory(rawCategory);
  const city = typeof rawCity === "string" ? rawCity : undefined;

  const all = await getEvents(locale, { category });
  const cities = [...new Set(all.map((e) => e.city).filter((c): c is string => Boolean(c)))].sort();
  const events = city ? all.filter((e) => e.city === city) : all;

  const href = (next: { category?: string; city?: string }) => {
    const q = new URLSearchParams();
    if (next.category) q.set("category", next.category);
    if (next.city) q.set("city", next.city);
    const s = q.toString();
    return `${localePath(locale, "/events")}${s ? `?${s}` : ""}`;
  };

  return (
    <Section>
      <PageHeading title={t.pages.eventsTitle} />

      <nav className="no-scrollbar -mx-5 mb-10 flex gap-2 overflow-x-auto px-5">
        <FilterChip
          href={href({ city })}
          label={t.categories.all}
          isActive={!category}
        />
        {categories.map((item) => (
          <FilterChip
            key={item}
            href={href({ category: item, city })}
            label={t.categories[item]}
            isActive={category === item}
          />
        ))}
      </nav>

      {cities.length > 1 && (
        <nav className="no-scrollbar -mx-5 -mt-6 mb-10 flex gap-2 overflow-x-auto px-5">
          <FilterChip href={href({ category })} label={allCities[locale]} isActive={!city} />
          {cities.map((c) => (
            <FilterChip key={c} href={href({ category, city: c })} label={c} isActive={city === c} />
          ))}
        </nav>
      )}

      {events.length === 0 ? (
        <EmptyState text={t.pages.eventsEmpty} />
      ) : (
        <div className="grid grid-cols-2 gap-x-5 gap-y-10 md:grid-cols-3 lg:grid-cols-4">
          {events.map((event) => (
            <EventCard key={event.id} event={event} locale={locale} t={t} />
          ))}
        </div>
      )}
    </Section>
  );
}

function FilterChip({
  href,
  label,
  isActive,
}: {
  href: string;
  label: string;
  isActive: boolean;
}) {
  return (
    <Link
      href={href}
      aria-current={isActive ? "page" : undefined}
      className={isActive ? "chip shrink-0" : "chip chip-ghost shrink-0"}
    >
      {label}
    </Link>
  );
}
