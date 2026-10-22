// Адаптер банка-эквайера. Конкретный банк выберем после договора
// эквайринга (Freedom Pay, Kaspi, Halyk и т. п.). Сервер работает
// только через этот интерфейс.

export type CreatePayment = {
  orderId: string;
  amount: number;
  currency: string;
  description: string;
  email: string;
  returnUrl: string;
};

export type CallbackResult = {
  orderId: string;
  paymentId: string;
  succeeded: boolean;
  raw: unknown;
};

const env = (key: string) => Deno.env.get(key) ?? "";

export const acquiring = {
  name: () => env("ACQUIRING_PROVIDER") || "unconfigured",
  isConfigured: () => Boolean(env("ACQUIRING_PROVIDER") && env("ACQUIRING_MERCHANT_ID") && env("ACQUIRING_SECRET")),

  /** Создаёт платёж у банка и возвращает ссылку на платёжную страницу. */
  async createPayment(_p: CreatePayment): Promise<{ paymentId: string; paymentUrl: string }> {
    throw new Error("TODO: API банка — создание платежа");
  },

  /** Проверяет подпись уведомления банка. null — подпись неверна. */
  async handleCallback(_req: Request): Promise<CallbackResult | null> {
    return null;
  },
};
