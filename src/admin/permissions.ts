/**
 * Должности и права сотрудников. Тот же список и заготовки в базе
 * (all_permissions, position_permissions в миграции positions_events_upgrades):
 * база проверяет каждое действие, здесь только подписи и меню.
 */

export type Position = "owner" | "tech" | "admin" | "marketer" | "accountant" | "sales" | "editor" | "scanner";

export type Permission =
  | "metrics"
  | "events.edit"
  | "events.edit_sold"
  | "events.upgrades"
  | "events.delete"
  | "events.delete_confirm"
  | "events.postpone"
  | "events.cancel"
  | "content"
  | "orders"
  | "refunds"
  | "finance"
  | "leads"
  | "invites"
  | "scanners"
  | "entries"
  | "staff"
  | "settings"
  | "audit";

export const positionLabels: Record<Position, string> = {
  owner: "Владелец",
  tech: "Тех. специалист",
  admin: "Администратор",
  marketer: "Маркетолог",
  accountant: "Бухгалтер",
  sales: "Менеджер продаж",
  editor: "Редактор",
  scanner: "Тикетор",
};

export const positionHints: Record<Position, string> = {
  owner: "Все права, подтверждает удаление и отмену событий",
  tech: "Те же права, что у владельца",
  admin: "Всё, кроме отмены событий и подтверждения удаления",
  marketer: "Метрики, события до первой продажи, контент, заявки",
  accountant: "Финансы, отчёты, заказы и проданные билеты",
  sales: "Заказы, возвраты, заявки, проходы",
  editor: "События до первой продажи и контент сайта",
  scanner: "Только сканер билетов на назначенных концертах",
};

/** Должности админки (тикеторы живут в разделе «Тикеторы и входы»). */
export const STAFF_POSITIONS: Position[] = ["owner", "tech", "admin", "marketer", "accountant", "sales", "editor"];
export const TOP_POSITIONS: Position[] = ["owner", "tech"];

export const permissionGroups: { title: string; items: { key: Permission; label: string; hint?: string }[] }[] = [
  {
    title: "События",
    items: [
      { key: "events.edit", label: "Создание и правка событий", hint: "Пока на событие не продано ни одного билета" },
      { key: "events.edit_sold", label: "Правка события с проданными билетами" },
      { key: "events.upgrades", label: "Настройка апгрейдов билетов" },
      { key: "events.postpone", label: "Перенос события с рассылкой покупателям" },
      { key: "events.cancel", label: "Отмена события" },
      { key: "events.delete", label: "Удаление событий", hint: "С продажами: только запрос на подтверждение" },
      { key: "events.delete_confirm", label: "Подтверждение удаления события с продажами" },
    ],
  },
  {
    title: "Продажи и деньги",
    items: [
      { key: "metrics", label: "Метрики и графики продаж", hint: "Без данных покупателей" },
      { key: "orders", label: "Заказы и данные покупателей" },
      { key: "refunds", label: "Возвраты и заявки на возврат" },
      { key: "finance", label: "Финансы, отчёты, выгрузка" },
      { key: "leads", label: "Заявки с сайта" },
    ],
  },
  {
    title: "Вход на концерт",
    items: [
      { key: "entries", label: "Проходы и журнал входа" },
      { key: "invites", label: "Пригласительные" },
      { key: "scanners", label: "Тикеторы и входы" },
    ],
  },
  {
    title: "Сайт и управление",
    items: [
      { key: "content", label: "Новости, фотоотчёты, партнёры, площадки, цифры" },
      { key: "staff", label: "Сотрудники и должности" },
      { key: "settings", label: "Настройки сайта" },
      { key: "audit", label: "Журнал изменений" },
    ],
  },
];

export const ALL_PERMISSIONS: Permission[] = permissionGroups.flatMap((g) => g.items.map((i) => i.key));

export const positionPermissions: Record<Position, Permission[]> = {
  owner: ALL_PERMISSIONS,
  tech: ALL_PERMISSIONS.filter((p) => p !== "events.delete_confirm"),
  admin: [
    "metrics", "events.edit", "events.edit_sold", "events.upgrades", "events.delete", "events.postpone",
    "content", "orders", "refunds", "finance", "leads", "invites", "scanners", "entries", "staff", "audit",
  ],
  marketer: ["metrics", "events.edit", "events.upgrades", "content", "leads"],
  accountant: ["metrics", "orders", "finance"],
  sales: ["metrics", "orders", "refunds", "leads", "entries"],
  editor: ["events.edit", "content"],
  scanner: [],
};

export const permissionLabel = (p: string) =>
  permissionGroups.flatMap((g) => g.items).find((i) => i.key === p)?.label ?? p;
