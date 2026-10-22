/** Реквизиты владельца сайта. Используются в подвале и во всех документах. */
export const company = {
  name: 'ИП «BSL Production»',
  brand: "Concerts Prod",
  address: "Республика Казахстан, г. Алматы, Северное кольцо, дом 92/3, кв./офис 37",
  bin: "870613300367",
  bank: "АО «Kaspi Bank»",
  kbe: "19",
  bik: "CASPKZKA",
  account: "KZ46722S000054248689",
  phone: "+7 700 258 62 49",
  email: "barsuklighter@gmail.com",
  site: "concerts.kz",
} as const;

export const requisiteRows: [string, string][] = [
  ["Наименование", company.name],
  ["Адрес", company.address],
  ["БИН (ИИН)", company.bin],
  ["Банк", company.bank],
  ["КБе", company.kbe],
  ["БИК", company.bik],
  ["Номер счёта (IBAN)", company.account],
];
