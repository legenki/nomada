# Nomada (Chrome Extension) - Project Bible

_Ранее называлось wooPortal: ключ хранилища (`wooportal-data`) и тип `WooPortalData` сохранены ради совместимости._

## Обзор архитектуры
Nomada — это браузерное расширение для Chrome (Manifest V3), написанное на TypeScript с использованием сборщика Vite. 
Основная цель расширения — централизованное управление прокси, геолокацией и часовыми поясами.

Используется чистый TypeScript/DOM и D3.js для отрисовки интерактивного глобуса, без фреймворков.

## Структура директорий
- `/src/background/` — Service Worker расширения. Управляет состоянием прокси, перехватывает сетевые запросы, устанавливает гео-дебаггер.
- `/src/popup/` — UI попапа, открывающегося по клику на иконку. Содержит логику работы с глобусом (`globe.ts`, использующий `d3-geo` и `topojson-client`), а также базовый интерфейс управления.
- `/src/options/` — Страница настроек, где можно управлять профилями прокси.
- `/src/lib/` — Общие утилиты: `chrome.storage` (`storage.ts`), состояние (`state.ts`), страны/локали, иконки, HTML-экранирование.
- `/store-assets/` — картинки для листинга в Chrome Web Store (в расширение не попадают).
- `vite.config.*.ts` — Отдельные конфигурации Vite для сборки `background`, `popup` и `options`.

## Ключевые модули и потоки данных
1. **Переходы состояния (`src/background/index.ts`)**:
   Любое изменение идёт через `commit(update)`: чистая функция над *свежим* состоянием → запись в storage → приведение Chrome (прокси, overrides, WebRTC, иконка) в соответствие только там, где что-то поменялось. Коммиты сериализованы. При `onStartup`/`onInstalled` состояние пере-применяется целиком (Chrome может сбросить настройки расширения).
   Модель: `enabled` — мастер-свитч; при OFF выбранные место и профиль *сохраняются*, но не применяются. `isGeoActive()` / `activeProfileOf()` — единственные источники правды «что сейчас реально работает».
2. **Проксирование (`src/background/proxy.ts`)**:
   `http`, `https`, `socks5`, `pac` + правила маршрутизации (генерируемый PAC). `buildProxyConfig()` — чистая и покрыта тестами. Нет профиля → `settings.clear()` (не `system`). Аутентификация — `onAuthRequired` с проверкой хоста прокси и защитой от цикла. WebRTC ограничивается, пока активен прокси.
3. **Геолокация, таймзона, локаль (`src/background/geolocation.ts`)**:
   `chrome.debugger` + Emulation (timezone, geolocation, locale, user agent с `acceptLanguage`). Вкладки с нашим debugger отслеживаются в `chrome.storage.session`; смена места переприменяет overrides на всех них, а не отключает. Подключение на `tabs.onCreated` и `webNavigation.onBeforeNavigate`.
4. **IP-локация (`src/background/sync.ts`)**: ipwho.is. Для кнопки «Use my IP location» запрос идёт из активной вкладки в изолированном мире (тот же маршрут, что у страниц); фоновые подсказки — из service worker, кэш 10 минут.
5. **Хранилище (`src/lib/storage.ts`)**: `chrome.storage.local`, тип `WooPortalData`, миграция в `storage-migration.ts`. Долгоживущие страницы пишут только через `updateData()`/`updateProfiles()`.
6. **Взаимодействие (Messaging)**: типизированные `BgMessage` / `BgState`. Страница настроек после правки профилей шлёт `PROFILES_CHANGED`.

## Известные ограничения
- Overrides не действуют в Web Workers страницы (таймзона внутри Worker реальная).
- Пока debugger подключён, Chrome показывает плашку «Nomada started debugging this browser».

## Скрипты (package.json)
- `npm run build` — typecheck + сборка всех 3 компонентов (background, popup, options) в чистый `dist/`.
- `npm run typecheck` — `tsc --noEmit` по `src` и `tests`.
- `npm run package` — сборка + `nomada-extension.zip` для Chrome Web Store (zip в git не хранится).
- `npm run dev:popup` — Запуск сборки попапа в режиме watch (удобно для стилизации).
- `npm run test` — Запуск тестов на Vitest.
