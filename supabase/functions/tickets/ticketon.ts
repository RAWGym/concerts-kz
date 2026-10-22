// Адаптер Freedom Ticketon. Методы и поля заполним по документации API,
// которую выдаст Ticketon вместе с ключами. Интерфейс уже используется
// сервером и сайтом, поэтому менять придётся только этот файл.

export type Reservation = {
  ticketonOrderId: string;
  total: number;
  serviceFee: number;
  currency: "KZT" | "KGS" | "UZS";
  expiresAt: string | null;
  items: { category_id: string; category_name: string; quantity: number; unit_price: number; seat_label?: string }[];
  raw: unknown;
};

const apiUrl = () => Deno.env.get("TICKETON_API_URL") ?? "";
const apiKey = () => Deno.env.get("TICKETON_API_KEY") ?? "";

export const ticketon = {
  isConfigured: () => Boolean(apiUrl() && apiKey()),

  /** Категории, цены и остатки по событию. */
  async getCategories(_eventId: string): Promise<unknown[]> {
    throw new Error("TODO: Ticketon API — список категорий и цен");
  },

  /** Бронь мест на время оплаты. */
  async reserve(_draft: unknown): Promise<Reservation> {
    throw new Error("TODO: Ticketon API — бронирование");
  },

  /** Подтверждение продажи после успешной оплаты: выпуск билетов. */
  async confirmOrder(_orderId: string): Promise<void> {
    throw new Error("TODO: Ticketon API — подтверждение и выпуск билетов");
  },
};
