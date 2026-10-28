# Options page redesign — design

Date: 2026-10-28
Scope: `src/options/*` (proxy list + add/edit form), shared style tokens.

## Goal

Bring the settings page (proxy list and add/edit form) in line with the popup's
visual language, replace `alert()`/`confirm()` with in-page feedback, and add two
features: pasting a proxy string to fill the form, and showing the selected
proxy's status and exit location in the list.

Non-goals: background, message types, storage schema, popup behaviour. UI copy
stays in English (matches the popup and store listing).

## Visual system

- Move the popup's design tokens (`--bg`, `--surface`, `--surface-2`, `--line`,
  `--text`, `--text-2`, `--text-3`, `--accent`, `--accent-soft`, `--warn`,
  `--warn-soft`, `--focus`, `--radius`, `--font`, `--mono`, light + dark) into
  `src/styles/tokens.css`. Popup `style.css` and `options.css` both `@import` it;
  popup-only globe tokens stay in the popup stylesheet. The popup must look
  exactly as before.
- The old MD3 blue tokens in `options.css` are removed.

## Page

- Centered column, max-width 640px.
- Header: the popup's brand mark SVG + "Nomada", muted "Settings".
- Section head: uppercase "Proxies" label with count, and an "Add proxy"
  primary pill button (popup `.primary` style).
- List of cards modelled on the popup `.proxy` row: colour dot, name, mono meta
  line `TYPE · host:port` (PAC: `PAC · url`), a lock icon when a username is set.
  The whole card is a button that opens the edit dialog.
- The selected profile (`activeProfileId`) shows a status pill and exit place,
  derived from storage via `lib/state.ts`:
  - **Active** (accent) + `City, Country` — `enabled` and `isProtected()`.
  - **Connecting…** (blinking dot) — `enabled`, no proxy place yet.
  - **Selected** (muted) + last known `City, Country` — Nomada is off.
- Empty state: dashed box (popup `.empty`) with copy and an "Add proxy" button.
- Feedback after save/delete: a toast at the bottom ("Saved", "Deleted", or the
  apply error from `PROFILES_CHANGED` in warn colours). Auto-hides.
- Live updates: re-render on `chrome.storage.onChanged` (already wired).

## Dialog

Native `<dialog>` opened with `showModal()` (Esc, focus trap, backdrop). Closing
by backdrop click is kept.

Fields, top to bottom:

1. **Paste proxy** — one text input. On `input`, `parseProxyString()` runs; on
   success it fills type/host/port/user/pass (or PAC URL) and shows a short
   "Filled in from pasted text" hint; on failure (non-empty input) a hint says
   the format wasn't recognised. Typing never clears fields the user already set
   unless parsing succeeds.
2. **Type** — segmented control (radio group): HTTP / HTTPS / SOCKS5 / PAC.
3. **Host** + **Port** in one row; replaced by **PAC URL** when type is PAC.
4. **Username** + **Password** in one row. Hidden for SOCKS5, replaced by the
   note that Chrome can't authenticate SOCKS5 proxies; credentials are not saved
   for SOCKS5.
5. **Name** (optional, placeholder shows the fallback) — empty name saves as the
   host (PAC: the PAC URL's hostname, else "PAC proxy").
6. **Colour** — 8 preset swatches as a radio group plus a custom colour input.
   A stored colour outside the presets is selected via the custom swatch.

Footer: left "Delete" (edit mode only, two-step: first click turns it into
"Confirm delete" for 3 s), right "Cancel" and "Save".

Validation errors are shown inline: the offending field gets
`aria-invalid="true"` + a message under it, and receives focus.

## Modules

- `src/options/parse.ts` (new, pure): `parseProxyString(text, fallbackType)`
  returns `ParsedProxy | null`:
  - `scheme://[user:pass@]host:port` with scheme `http|https|socks5|socks5h|socks`
    (socks variants → `socks5`); `http(s)://` or `file://` URLs with a path other
    than `/` → PAC.
  - `user:pass@host:port`, `host:port@user:pass` (the side with a numeric port
    is the address).
  - `host:port`, `host:port:user:pass`, `user:pass:host:port` (the side with a
    valid port decides; when both could, the side whose host contains a dot or
    is `localhost` wins, then `host:port:user:pass`).
  - No scheme → `fallbackType` (the currently selected type, PAC → `http`).
  - Credentials in `scheme://` URLs are percent-decoded; other forms are taken
    verbatim.
  - IPv6 literals are not supported (Chrome's auth challenger compares bare
    hosts, and such proxies are rare).
  - SOCKS5 with credentials parses, but the dialog refuses to apply it and
    explains why.
- `src/options/validate.ts`: `validateProfile()` returns
  `{ field, message } | null`, `field` ∈ `host | port | pacUrl | username`.
- `src/options/index.ts`: rendering + dialog. Keeps the existing guarantees:
  re-read storage before each write (`readData` / `updateProfiles`), send
  `PROFILES_CHANGED` after writes, preserve untouched profile fields
  (`description`, `bypassList`, `routingRules`, `tags`, `createdAt`).

## Testing

- `tests/parse.test.ts`: every accepted format, socks aliases, PAC detection,
  IPv6, percent-decoding, garbage → `null`, fallback type.
- `tests/options.test.ts`: updated for the `{ field, message }` result.
- `npm run build` (typecheck + all bundles) and `npm test` pass.
- Visual check of `dist/options.html` and `dist/popup.html` in a browser with a
  stubbed `chrome` API, light and dark.

## Docs

Update the `/src/options/` line in `PROJECT_BIBLE.md`.
