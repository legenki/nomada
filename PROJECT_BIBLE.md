# Nomada (Chrome Extension) - Project Bible

_Ранее называлось wooPortal: ключ хранилища (`wooportal-data`) и тип `WooPortalData` сохранены ради совместимости._

## Обзор архитектуры
Nomada — расширение Chrome (Manifest V3) на TypeScript + Vite. Одна кнопка: трафик идёт через выбранный прокси, а геолокация, таймзона и язык браузера автоматически подстраиваются под местоположение выходного IP прокси. Когда выключено — попап показывает реальное местоположение. Чистый TypeScript/DOM, D3 для глобуса, без фреймворков.

**Без `chrome.debugger`:** подмена делается скриптом в мире страницы, поэтому Chrome не показывает баннер «расширение отлаживает браузер».

## Chrome и Firefox
Одна кодовая база, платформа выбирается при сборке: `TARGET=firefox` → константа `__TARGET__` (`vite.target.ts`), вывод в `dist-firefox/`, манифест `manifest.firefox.json`; ветки другого браузера выпадают из бандла. Тесты собираются как Chrome; Firefox-пути проверяются через параметры (`probeOrder`, `validateProfile`, `detectProxyType`) и модуль `firefox-proxy.ts`. Подробности — `docs/superpowers/specs/2026-10-29-firefox-port-design.md`, сборка для рецензентов AMO — `BUILD.md`.
- Фон: Chrome — service worker; Firefox — фоновая страница (`background.scripts`).
- Маршрутизация: Chrome — `chrome.proxy.settings` (fixed_servers / PAC); Firefox — `proxy.onRequest` (`firefox-proxy.ts`): постоянное событие, будит страницу; при включённой Nomada ответ `[proxyInfo, null]` — без запасного прямого соединения; при выключенной `undefined` — настройки браузера. PAC в Firefox не поддерживается.
- SOCKS5 с логином работает только в Firefox (`SOCKS_LOGIN` в `src/lib/platform.ts`).
- Проверка Auto: Chrome подменяет PAC так, чтобы через кандидата шёл только запрос к ipwho.is; Firefox отдаёт кандидата из `onRequest` для этого запроса (`probe-state.ts`).
- Конфиг подмены для content scripts: Chrome — `storage.session` (+ `setAccessLevel`), Firefox — `storage.local` (у него нет `setAccessLevel`).
- Firefox даёт отозвать доступ ко всем сайтам: без него Nomada не включается, при отзыве выключается, попап предлагает «Allow».

## Структура директорий
- `/src/background/` — Service Worker: состояние, прокси, поиск места по IP, управление подменой.
  - `index.ts` — `commit()` (все переходы состояния), действия, сообщения, авторизация прокси.
  - `proxy.ts` — `buildProxyConfig()` / `applyProxy()` + политика WebRTC.
  - `places.ts` — поиск места по IP через ipwho.is (из SW; для прокси — с проверкой обхода и запасным запросом из вкладки).
  - `detect.ts` — автоопределение типа прокси (`DETECT_PROXY`): по очереди HTTP → SOCKS5 → HTTPS через временный PAC, который пускает через кандидата только запрос к ipwho.is; остальной трафик идёт прежним маршрутом, после проверки восстанавливается сохранённая настройка.
  - `spoof.ts` — включает/выключает подмену: конфиг в `storage.session`, правило DNR для `Accept-Language`, регистрация content scripts.
  - `icon.ts` — иконка и badge.
- `/src/content/` — скрипты страниц (регистрируются только пока Nomada включена).
  - `spoof-main.ts` (мир MAIN, document_start, все фреймы) — подменяет `Date`, `Intl`, `toLocale*`, `navigator.language(s)`, геолокацию; патчит iframe того же origin при доступе к `contentWindow`.
  - `spoof-bridge.ts` (изолированный мир) — читает конфиг из `storage.session` и передаёт его странице событием; при изменении конфига обновляет открытые вкладки без перезагрузки.
  - `tz.ts` — математика таймзон на оригинальных `Date`/`Intl` (покрыта тестами).
- `/src/popup/` — попап: свитч, точечный глобус (`globe.ts`) с дугой «реальное место → прокси», место/время/язык/IP, выбор прокси.
- `/src/options/` — управление профилями прокси в стиле попапа: список карточек со статусом выбранного прокси (Active / Connecting… / Selected + место выхода) и диалог `<dialog>` добавления/редактирования. Тип по умолчанию — Auto: при сохранении background определяет рабочий тип, пустое имя заменяется городом выхода. Вместо цвета профиля карточки показывают флаг страны выхода, рамка — цвета флага (у выбранной — в полную силу).
  - `parse.ts` — разбор строки прокси при вставке (`host:port:user:pass`, `user:pass@host:port`, `socks5://…`, URL PAC-скрипта и др.).
  - `validate.ts` — проверка формы; ошибка привязана к полю (`{ field, message }`).
- `/src/styles/tokens.css` — общие токены дизайна (цвета светлой/тёмной темы, радиусы, шрифты) для попапа и настроек.
- `/src/styles/flags.css` + `/public/fonts/TwemojiCountryFlags.woff2` — флаги-эмодзи встроенным шрифтом Twemoji (CC-BY 4.0, см. `public/fonts/LICENSE.md`), чтобы они были и на Windows.
- `/src/lib/` — `storage.ts`, `storage-migration.ts`, `state.ts` (что сейчас активно), локали стран, иконки, HTML-экранирование, `flags.ts` (эмодзи флага, основной цвет флага по пикселям canvas с кешем в `localStorage`).
- `/store-assets/` — картинки для Chrome Web Store (в расширение не попадают).

## Модель и потоки данных
- `WooPortalData`: `enabled`, `profiles`, `activeProfileId`, `realPlace`, `proxyPlace` (с `profileId`). ON возможен только с выбранным прокси.
- `ProxyProfile.exitCountry` — страна выходного IP, запоминается при проверке Auto и при каждом поиске места активного прокси (`withProxyPlace`); стирается, если вручную сменить сервер. Поле `color` больше не показывается.
- Включение: `commit(enabled)` → `applyProxy` → `lookupProxyPlace()` → `commit(proxyPlace)` → `applySpoof(config)`. Если прокси не отвечает — Nomada выключается и показывает причину.
- Любое изменение идёт через `commit(update)`: чистая функция над свежим состоянием → запись → Chrome приводится в соответствие только там, где что-то изменилось. Коммиты сериализованы.
- При `onStartup`/`onInstalled` всё переприменяется: Chrome сбрасывает session-правила, `storage.session` и незарегистрированные скрипты.
- Места кэшируются на 10 минут (прокси может менять выходной IP).
- Сообщения: `GET_STATE`, `REFRESH_PLACE`, `ENABLE`, `DISABLE`, `SELECT_PROFILE`, `PROFILES_CHANGED`, `DETECT_PROXY`.
- Проверка прокси (`DETECT_PROXY`) идёт в той же очереди, что и `commit()`; поиск места ждёт, пока очередь освободится, чтобы запрос не ушёл через проверяемый прокси.

## Известные ограничения
- Подмена на уровне JS: первые миллисекунды загрузки (до прихода конфига из `storage.session`) скрипты страницы видят реальные значения; продвинутые сайты могут обнаружить подмену.
- Web Workers страницы видят реальную таймзону.
- `getCurrentPosition` сохраняет настоящий запрос разрешения; при отказе пользователя отдаёт отказ.

## Скрипты (package.json)
- `npm run build` — typecheck + сборка background, content scripts, popup и options в чистый `dist/`.
- `npm run typecheck` — `tsc --noEmit` по `src` и `tests`.
- `npm run package` — сборка + `nomada-extension.zip` для Chrome Web Store (zip в git не хранится).
- `npm run build:firefox` / `npm run package:firefox` — версия для Firefox в `dist-firefox/`, `nomada-firefox.zip` и `nomada-firefox-source.zip` (исходники для AMO, `git archive HEAD`).
- `npm run lint:firefox` / `npm run start:firefox` — `web-ext lint` / запуск Firefox с расширением.
- `npm run dev:popup` — Запуск сборки попапа в режиме watch (удобно для стилизации).
- `npm run test` — Запуск тестов на Vitest.
