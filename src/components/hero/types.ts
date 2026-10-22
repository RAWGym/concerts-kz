/**
 * Данные одного «кадра» кинематографичного героя.
 *
 * Компонент ничего не знает про Supabase: страница собирает слайды из
 * featured-событий и передаёт готовыми. Поэтому даты и цены приходят
 * уже отформатированными — Intl отрабатывает на сервере, а клиенту не
 * нужны ни локаль, ни часовой пояс площадки.
 */
export type HeroSlide = {
  id: string;
  /** Гигантское слово на фоне. Обычно имя артиста. */
  name: string;
  /** Подзаголовок под именем в инфо-блоке. */
  subtitle: string | null;
  city: string | null;
  venue: string | null;
  /** «1 августа / 12:00» */
  schedule: string;
  /** «от 20 000 ₸» — null, если цена не объявлена. */
  price: string | null;
  /** Обтравленный портрет с прозрачным фоном. */
  portraitUrl: string;
  /** Внешняя ссылка на билеты. null — продажи ещё не открыты. */
  ticketonUrl: string | null;
  /** Внутренняя ссылка на страницу события. */
  detailsHref: string;
  /** «Настроение» артиста: акцент слова и цвет свечения. */
  mood: {
    accent: string;
    glow: string;
  };
};

export type HeroLabels = {
  overline: string;
  buyTicket: string;
  details: string;
  soon: string;
  soldOut: string;
};
