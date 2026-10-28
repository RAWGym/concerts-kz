import { lazy, StrictMode, Suspense, type ComponentType } from "react";
import { createRoot } from "react-dom/client";
import { createBrowserRouter, RouterProvider } from "react-router";

import { lazyPage, PageSkeleton } from "@/app/page-loader";
import { LocaleRedirect, reloadOnce, RouteError, SiteLayout } from "@/app/layout";
import NotFound from "@/pages/not-found";

import "./globals.css";

// Сайт не показываем внутри чужих фреймов (защита от кликджекинга).
if (window.top !== window.self) {
  try {
    window.top!.location.replace(window.self.location.href);
  } catch {
    document.documentElement.style.display = "none";
  }
}

// Вкладка открыта со старой версии, а файлы уже обновились: берём свежие.
window.addEventListener("vite:preloadError", (e) => {
  if (reloadOnce()) e.preventDefault();
});

/* Каждая страница — отдельный файл, грузится при первом заходе. */
const Home = lazyPage(() => import("@/pages/home"));
const Events = lazyPage(() => import("@/pages/events"));
const EventDetail = lazyPage(() => import("@/pages/events-detail"));
const Checkout = lazyPage(() => import("@/pages/checkout"));
const News = lazyPage(() => import("@/pages/news"));
const NewsDetail = lazyPage(() => import("@/pages/news-detail"));
const Reports = lazyPage(() => import("@/pages/reports"));
const ReportDetail = lazyPage(() => import("@/pages/reports-detail"));
const About = lazyPage(() => import("@/pages/about"));
const Partners = lazyPage(() => import("@/pages/partners"));
const Contacts = lazyPage(() => import("@/pages/contacts"));
const Legal = lazyPage(() => import("@/pages/legal"));

/** Обычный компонент из отдельного файла с контуром страницы на время загрузки. */
function lazyComponent(loader: () => Promise<{ default: ComponentType }>) {
  const C = lazy(loader);
  return (
    <Suspense fallback={<PageSkeleton />}>
      <C />
    </Suspense>
  );
}

const admin = (loader: () => Promise<{ default: ComponentType }>) => lazyComponent(loader);
const AdminLayout = lazy(() => import("@/admin/layout").then((m) => ({ default: m.AdminLayout })));

const router = createBrowserRouter([
  { path: "/", element: <LocaleRedirect /> },
  {
    path: "/admin",
    element: (
      <Suspense fallback={<PageSkeleton />}>
        <AdminLayout />
      </Suspense>
    ),
    errorElement: <RouteError />,
    children: [
      { index: true, element: admin(() => import("@/admin/dashboard")) },
      { path: "events", element: admin(() => import("@/admin/events")) },
      { path: "events/:id", element: admin(() => import("@/admin/event-edit")) },
      { path: "venues", element: admin(() => import("@/admin/venues")) },
      { path: "orders", element: admin(() => import("@/admin/orders")) },
      { path: "leads", element: admin(() => import("@/admin/leads")) },
      { path: "staff", element: admin(() => import("@/admin/staff")) },
      { path: "account", element: admin(() => import("@/admin/account")) },
      { path: "news", element: admin(() => import("@/admin/news")) },
      { path: "reports", element: admin(() => import("@/admin/reports")) },
      { path: "partners", element: admin(() => import("@/admin/partners")) },
      { path: "stats", element: admin(() => import("@/admin/stats")) },
      { path: "settings", element: admin(() => import("@/admin/settings")) },
      { path: "audit", element: admin(() => import("@/admin/audit")) },
      { path: "entries", element: admin(() => import("@/admin/entries")) },
      { path: "invites", element: admin(() => import("@/admin/invites")) },
      { path: "scanners", element: admin(() => import("@/admin/scanners")) },
      { path: "entry-log", element: admin(() => import("@/admin/entry-log")) },
    ],
  },
  {
    // Сканер билетов для тикеторов (его же открывает Android-приложение).
    path: "/scanner",
    element: lazyComponent(() => import("@/scanner/app")),
    errorElement: <RouteError />,
  },
  {
    path: "/:locale",
    element: <SiteLayout />,
    errorElement: <RouteError />,
    children: [
      {
        errorElement: <RouteError />,
        children: [
          { index: true, element: <Home /> },
          { path: "events", element: <Events /> },
          { path: "events/:slug", element: <EventDetail /> },
          { path: "events/:slug/tickets", element: <Checkout /> },
          { path: "orders/:id", element: lazyComponent(() => import("@/pages/order")) },
          { path: "ticket/:code", element: lazyComponent(() => import("@/pages/ticket")) },
          { path: "news", element: <News /> },
          { path: "news/:slug", element: <NewsDetail /> },
          { path: "reports", element: <Reports /> },
          { path: "reports/:slug", element: <ReportDetail /> },
          { path: "about", element: <About /> },
          { path: "partners", element: <Partners /> },
          { path: "contacts", element: <Contacts /> },
          { path: "legal/:doc", element: <Legal /> },
          { path: "login", element: lazyComponent(() => import("@/pages/login")) },
          { path: "welcome", element: lazyComponent(() => import("@/pages/welcome")) },
          { path: "account", element: lazyComponent(() => import("@/pages/account")) },
          { path: "*", element: <NotFound /> },
        ],
      },
    ],
  },
]);

// Когда браузер свободен, заранее подгружаем самые частые страницы,
// чтобы переход по ссылке был мгновенным.
const idle = window.requestIdleCallback ?? ((cb: () => void) => setTimeout(cb, 1500));
idle(() => {
  for (const p of [Home, Events, EventDetail, About, Checkout]) p.prefetch().catch(() => {});
});

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <RouterProvider router={router} />
  </StrictMode>,
);
