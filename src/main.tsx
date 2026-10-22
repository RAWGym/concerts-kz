import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { createBrowserRouter, RouterProvider } from "react-router";

import { AsyncPage } from "@/app/page-loader";
import { LocaleRedirect, RouteError, SiteLayout } from "@/app/layout";
import * as about from "@/pages/about";
import * as contacts from "@/pages/contacts";
import * as events from "@/pages/events";
import * as eventDetail from "@/pages/events-detail";
import * as home from "@/pages/home";
import * as checkout from "@/pages/checkout";
import * as legal from "@/pages/legal";
import OrderPage from "@/pages/order";
import LoginPage from "@/pages/login";
import * as news from "@/pages/news";
import * as newsDetail from "@/pages/news-detail";
import NotFound from "@/pages/not-found";
import * as partners from "@/pages/partners";
import * as reports from "@/pages/reports";
import * as reportDetail from "@/pages/reports-detail";

import { AdminLayout } from "@/admin/layout";
import AdminDashboard from "@/admin/dashboard";
import AdminEvents from "@/admin/events";
import AdminEventEdit from "@/admin/event-edit";
import AdminVenues from "@/admin/venues";
import AdminOrders from "@/admin/orders";
import AdminLeads from "@/admin/leads";
import AdminStaff from "@/admin/staff";
import AdminAccount from "@/admin/account";
import AdminNews from "@/admin/news";
import AdminReports from "@/admin/reports";
import AdminPartners from "@/admin/partners";
import AdminStats from "@/admin/stats";

import "./globals.css";

const page = (mod: Parameters<typeof AsyncPage>[0]["module"]) => (
  <AsyncPage module={mod} />
);

const router = createBrowserRouter([
  { path: "/", element: <LocaleRedirect /> },
  {
    path: "/admin",
    element: <AdminLayout />,
    errorElement: <RouteError />,
    children: [
      { index: true, element: <AdminDashboard /> },
      { path: "events", element: <AdminEvents /> },
      { path: "events/:id", element: <AdminEventEdit /> },
      { path: "venues", element: <AdminVenues /> },
      { path: "orders", element: <AdminOrders /> },
      { path: "leads", element: <AdminLeads /> },
      { path: "staff", element: <AdminStaff /> },
      { path: "account", element: <AdminAccount /> },
      { path: "news", element: <AdminNews /> },
      { path: "reports", element: <AdminReports /> },
      { path: "partners", element: <AdminPartners /> },
      { path: "stats", element: <AdminStats /> },
    ],
  },
  {
    path: "/:locale",
    element: <SiteLayout />,
    errorElement: <RouteError />,
    children: [
      {
        errorElement: <RouteError />,
        children: [
          { index: true, element: page(home) },
          { path: "events", element: page(events) },
          { path: "events/:slug", element: page(eventDetail) },
          { path: "events/:slug/tickets", element: page(checkout) },
          { path: "orders/:id", element: <OrderPage /> },
          { path: "news", element: page(news) },
          { path: "news/:slug", element: page(newsDetail) },
          { path: "reports", element: page(reports) },
          { path: "reports/:slug", element: page(reportDetail) },
          { path: "about", element: page(about) },
          { path: "partners", element: page(partners) },
          { path: "contacts", element: page(contacts) },
          { path: "legal/:doc", element: page(legal) },
          { path: "login", element: <LoginPage /> },
          { path: "*", element: <NotFound /> },
        ],
      },
    ],
  },
]);

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <RouterProvider router={router} />
  </StrictMode>,
);
