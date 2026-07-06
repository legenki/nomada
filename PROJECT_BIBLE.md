# wooPortal (Chrome Extension) - Project Bible

## Обзор архитектуры
wooPortal — это браузерное расширение для Chrome (Manifest V3), написанное на TypeScript с использованием сборщика Vite. 
Основная цель расширения — централизованное управление прокси, геолокацией и часовыми поясами.

**Обратите внимание:** В файле `AGENTS.md` упоминается, что это Astro проект (Legenki site), однако текущая кодовая база является исключительно расширением для браузера без использования Astro, React или Vue. Используется чистый TypeScript/DOM и D3.js для отрисовки интерактивного глобуса.

## Структура директорий
- `/src/background/` — Service Worker расширения. Управляет состоянием прокси, перехватывает сетевые запросы, устанавливает гео-дебаггер.
- `/src/popup/` — UI попапа, открывающегося по клику на иконку. Содержит логику работы с глобусом (`globe.ts`, использующий `d3-geo` и `topojson-client`), а также базовый интерфейс управления.
- `/src/options/` — Страница настроек, где можно управлять профилями прокси.
- `/src/lib/` — Общие утилиты, включая работу со `chrome.storage` (`storage.ts`), конфигурации стран, локалей и иконок.
- `vite.config.*.ts` — Отдельные конфигурации Vite для сборки `background`, `popup` и `options`.

## Ключевые модули и потоки данных
1. **Проксирование (`src/background/proxy.ts` / `src/types.ts`)**: 
   Поддерживаются `http`, `https`, `socks5` и `pac` прокси. Также есть базовая поддержка аутентификации через перехват `onAuthRequired` и правила маршрутизации.
2. **Геолокация и часовые пояса (`src/background/geolocation.ts`)**:
   Для подмены локации используется `chrome.debugger`. Расширение подключается к активным вкладкам и отправляет команды протокола DevTools (Emulation.setGeolocationOverride и Emulation.setTimezoneOverride).
3. **Хранилище (`src/lib/storage.ts`)**:
   Используется `chrome.storage.local`. Структура данных типизирована через интерфейс `WooPortalData`.
4. **Взаимодействие (Messaging)**:
   Попап и страница настроек общаются с Service Worker через `chrome.runtime.sendMessage`, используя строго типизированные сообщения (`BgMessage` / `BgState`).

## Скрипты (package.json)
- `npm run build` — Запускает сборку всех 3 компонентов (background, popup, options).
- `npm run dev:popup` — Запуск сборки попапа в режиме watch (удобно для стилизации).
- `npm run test` — Запуск тестов на Vitest.
