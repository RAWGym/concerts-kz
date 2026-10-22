// GitHub Pages отдаёт 404.html на любой неизвестный путь. Кладём туда
// копию приложения, чтобы прямые ссылки вроде /ru/events/mayot работали.
import { copyFileSync } from "node:fs";

copyFileSync("dist/index.html", "dist/404.html");
