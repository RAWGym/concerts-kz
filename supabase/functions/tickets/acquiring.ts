// Адаптер банка-эквайера: FreedomPay (Merchant API, Pay In).
// Документация: https://freedompay.kz/docs-en/merchant-api/pay
//
// Секреты функции:
//   ACQUIRING_PROVIDER=freedompay
//   ACQUIRING_MERCHANT_ID=<номер магазина, например 591190>
//   ACQUIRING_SECRET=<секретный ключ для приёма платежей>
//   ACQUIRING_TESTING=1            (тестовый режим, убрать для боевых платежей)
//   ACQUIRING_API_URL=https://api.freedompay.kz (по умолчанию)
//   PUBLIC_FUNCTION_URL=https://<project>.supabase.co/functions/v1/tickets

import { crypto } from "jsr:@std/crypto@1";
import { encodeHex } from "jsr:@std/encoding@1/hex";

export type CreatePayment = {
  orderId: string;
  /** Короткий номер заказа: FreedomPay показывает его в кабинете. */
  orderNumber: string;
  amount: number;
  currency: string;
  description: string;
  email: string;
  phone?: string;
  returnUrl: string;
};

export type CallbackResult = {
  orderId: string;
  paymentId: string;
  succeeded: boolean;
  raw: Record<string, string>;
};

const env = (key: string) => Deno.env.get(key) ?? "";
const apiUrl = () => (env("ACQUIRING_API_URL") || "https://api.freedompay.kz").replace(/\/$/, "");

async function md5(text: string) {
  const digest = await crypto.subtle.digest("MD5", new TextEncoder().encode(text));
  return encodeHex(new Uint8Array(digest));
}

/** Подпись FreedomPay: имя скрипта; значения по алфавиту ключей; секрет → MD5. */
async function sign(script: string, params: Record<string, string>) {
  const values = Object.keys(params)
    .filter((k) => k !== "pg_sig")
    .sort()
    .map((k) => params[k]);
  return md5([script, ...values, env("ACQUIRING_SECRET")].join(";"));
}

const salt = () => crypto.randomUUID().replace(/-/g, "");

function xmlValue(xml: string, tag: string) {
  const m = xml.match(new RegExp(`<${tag}>(?:<!\\[CDATA\\[)?([\\s\\S]*?)(?:\\]\\]>)?</${tag}>`));
  return m ? m[1].trim() : "";
}

/** Номер телефона в формате 77001234567, как ждёт FreedomPay. */
const digits = (phone?: string) => (phone ?? "").replace(/\D/g, "").replace(/^8/, "7");

export const acquiring = {
  name: () => env("ACQUIRING_PROVIDER") || "freedompay",
  isConfigured: () => Boolean(env("ACQUIRING_MERCHANT_ID") && env("ACQUIRING_SECRET") && env("PUBLIC_FUNCTION_URL")),
  isTesting: () => env("ACQUIRING_TESTING") === "1",

  /** Создаёт платёж и возвращает ссылку на платёжную страницу FreedomPay. */
  async createPayment(p: CreatePayment): Promise<{ paymentId: string; paymentUrl: string }> {
    const fn = env("PUBLIC_FUNCTION_URL").replace(/\/$/, "");
    const params: Record<string, string> = {
      pg_merchant_id: env("ACQUIRING_MERCHANT_ID").replace(/\D/g, ""),
      pg_order_id: p.orderNumber,
      pg_param1: p.orderId,
      pg_amount: p.amount.toFixed(2),
      pg_currency: p.currency,
      pg_description: p.description,
      pg_salt: salt(),
      pg_result_url: `${fn}/payments/callback`,
      pg_request_method: "POST",
      pg_success_url: p.returnUrl,
      pg_success_url_method: "GET",
      pg_failure_url: p.returnUrl,
      pg_failure_url_method: "GET",
      pg_user_contact_email: p.email,
      pg_language: "ru",
      pg_lifetime: "900",
    };
    const phone = digits(p.phone);
    if (phone.length === 11) params.pg_user_phone = phone;
    // Магазин в статусе «Тестовый» и так проводит только тестовые платежи.
    // pg_testing_mode нужен лишь боевому магазину, поэтому шлём его только по флагу.
    if (env("ACQUIRING_TESTING_PARAM") === "1") params.pg_testing_mode = "1";
    params.pg_sig = await sign("init_payment.php", params);

    const res = await fetch(`${apiUrl()}/init_payment.php`, {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams(params),
    });
    const xml = await res.text();
    if (xmlValue(xml, "pg_status") !== "ok") {
      console.error(
        "freedompay init_payment response",
        res.status,
        `merchant=${params.pg_merchant_id} rawMerchantLen=${env("ACQUIRING_MERCHANT_ID").length} secretLen=${env("ACQUIRING_SECRET").length} testing=${params.pg_testing_mode ?? "0"} api=${apiUrl()}`,
        xml.slice(0, 2000),
      );
      throw new Error(`freedompay init_payment: ${xmlValue(xml, "pg_error_code")} ${xmlValue(xml, "pg_error_description")}`);
    }
    return { paymentId: xmlValue(xml, "pg_payment_id"), paymentUrl: xmlValue(xml, "pg_redirect_url") };
  },

  /** Проверяет подпись уведомления (result_url). null: подпись неверна. */
  async handleCallback(req: Request): Promise<CallbackResult | null> {
    const type = req.headers.get("content-type") ?? "";
    const raw: Record<string, string> = {};
    if (type.includes("application/json")) {
      Object.assign(raw, await req.json());
    } else {
      const form = await req.formData();
      for (const [k, v] of form.entries()) raw[k] = String(v);
    }
    if (!raw.pg_sig) return null;
    const expected = await sign("callback", raw);
    if (expected !== raw.pg_sig) return null;
    return {
      orderId: raw.pg_param1 || raw.pg_order_id,
      paymentId: raw.pg_payment_id,
      succeeded: raw.pg_result === "1",
      raw,
    };
  },

  /** Ответ FreedomPay на уведомление: XML с подписью. */
  async callbackResponse(status: "ok" | "rejected" | "error", description: string) {
    const params: Record<string, string> = { pg_status: status, pg_description: description, pg_salt: salt() };
    params.pg_sig = await sign("callback", params);
    const body =
      `<?xml version="1.0" encoding="utf-8"?><response>` +
      Object.entries(params).map(([k, v]) => `<${k}>${v}</${k}>`).join("") +
      `</response>`;
    return body;
  },
};
