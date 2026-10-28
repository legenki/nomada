# Options Page Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Restyle the options page (proxy list + add/edit dialog) in the popup's visual language, add proxy-string pasting and per-proxy status/exit place.

**Architecture:** Pure helpers (`parse.ts`, `validate.ts`) carry the logic and are unit-tested; `index.ts` stays a thin vanilla-DOM controller over `chrome.storage`. Popup and options share one token stylesheet.

**Tech Stack:** TypeScript (strict), Vite 5, Vitest 1, vanilla DOM/CSS, Chrome MV3.

Spec: `docs/superpowers/specs/2026-10-28-options-redesign-design.md`

## Global Constraints

- No new dependencies, no frameworks (AGENTS.md).
- No changes to `src/background/*`, `src/types.ts`, storage schema or `BgMessage`.
- `manifest.json` `minimum_chrome_version` is 110: no `color-mix()`, no CSS nesting.
- UI copy in English.
- Writes go through `readData()` → `updateProfiles()`, followed by `PROFILES_CHANGED`.

---

### Task 1: Proxy string parser

**Files:**
- Create: `src/options/parse.ts`
- Test: `tests/parse.test.ts`

**Interfaces:**
- Produces: `parseProxyString(text: string, fallbackType: ProxyConfig['type']): ParsedProxy | null`
  where `ParsedProxy = { type: 'pac'; pacUrl: string } | { type: 'http' | 'https' | 'socks5'; host: string; port: number; username: string; password: string }`.

- [ ] Write `tests/parse.test.ts` covering: `host:port` (fallback type, PAC fallback → http), `host:port:user:pass` (password may contain `:`), `user:pass:host:port` (incl. numeric password), `user:pass@host:port`, `host:port@user:pass`, `scheme://[user:pass@]host:port[/]` for http/https/socks/socks5/socks5h with percent-decoded credentials and `/` in password, PAC detection (`http(s)://…/path`, `file://`), rejects (empty, spaces, bad port, unknown scheme, 3 parts).
- [ ] Run `npx vitest run tests/parse.test.ts` — fails (module missing).
- [ ] Implement `src/options/parse.ts`.
- [ ] Run again — passes.

### Task 2: Field-aware validation

**Files:**
- Modify: `src/options/validate.ts`
- Test: `tests/options.test.ts`

**Interfaces:**
- Produces: `validateProfile(type, host, port, pacUrl, user = ''): ValidationError | null`,
  `ValidationError = { field: 'host' | 'port' | 'pacUrl' | 'username'; message: string }`.

- [ ] Update tests to expect `{ field, message }`; run — fail.
- [ ] Return `{ field, message }` from `validateProfile`; run — pass.

### Task 3: Shared tokens

**Files:**
- Create: `src/styles/tokens.css` (popup tokens minus globe ones, plus `--focus-ring`)
- Modify: `src/popup/style.css` (`@import '../styles/tokens.css'`, keep globe tokens)

- [ ] Move tokens; `npm run build:popup`; confirm `dist/popup.css` contains the tokens once and the popup renders unchanged.

### Task 4: Options page markup, styles, controller

**Files:**
- Modify: `src/options/index.html`, `src/options/options.css`, `src/options/index.ts`

**Interfaces:**
- Consumes: `parseProxyString` (Task 1), `validateProfile`/`ValidationError` (Task 2), `selectedProfileOf`/`proxyPlaceOf`/`isProtected` (`src/lib/state.ts`), `readData`/`updateProfiles` (`src/lib/storage.ts`), `escHtml`/`safeColor` (`src/lib/html.ts`).

- [ ] Markup: header with brand mark, section head with count + Add, list, native `<dialog>` with paste field, type segmented radios, host/port row, PAC row, auth row, SOCKS5 note, name, colour swatches (+ custom), footer (Delete two-step, Cancel, Save), toast.
- [ ] Styles per spec, light/dark via tokens.
- [ ] Controller: render cards with status (Active / Connecting… / Selected + place), empty state, open/close dialog, paste → fill, type switching, inline errors, save/delete with fresh read + `PROFILES_CHANGED`, toast.
- [ ] `npm run build` and `npm test` pass.

### Task 5: Verify and document

- [ ] Open built `dist/options.html` and `dist/popup.html` with a stubbed `chrome` API; check empty state, list with each status, add/edit/delete, paste, errors, light and dark.
- [ ] Update `/src/options/` line in `PROJECT_BIBLE.md`.
