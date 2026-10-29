# Nomada — Chrome Web Store Listing

## Name (title)
```
Nomada — Location Guard, Locale & Proxy
```
*(75 char max; ~38 chars — well within limit)*

## Short description (summary)
*Max 132 characters. Shown in search results and under the title.*
```
Route your browser through a proxy and match its location, timezone and language — so sites see one consistent place.
```
*(117 chars — same as the manifest description)*

---

## Detailed description
*Max ~16,000 chars. First 2-3 lines matter most — they show before "Read more".*

```
Nomada moves your browser to wherever your proxy is. Flip one switch and your traffic goes through the proxy — and your geolocation, timezone and language change to match its location automatically, so every signal a website reads points to the same place.

A proxy alone hides your IP, but your timezone, language and location still give you away. Nomada keeps them all in sync with the proxy.

━━━━━━━━━━━━━━━━━━━━
HOW IT WORKS
━━━━━━━━━━━━━━━━━━━━

🔌 Add your proxy
Paste it in any common format — host:port, host:port:user:pass, user:pass@host:port or socks5://… — and Nomada fills in the rest. Leave the type on Auto and it checks whether the proxy speaks HTTP, SOCKS5 or HTTPS, finds the country it exits in, and tells you plainly if the proxy can't be reached or rejects the login. PAC scripts work too.

🗂 Public proxies, ready to try
No proxy yet? The settings page shows a gallery of public proxies that are checked every few hours — only working ones, with their country and speed. Filter by country or by HTTP / SOCKS5 and add one with a click. They're run by strangers, so use them to see a site from another country, not to sign in or pay.

🏳️ Know where every proxy goes
Each proxy shows the flag of the country it exits in, and the one in use is highlighted with its status and city.

⚡ Switch Nomada on
Traffic goes through the proxy. Nomada looks up where the proxy's exit IP is and matches your browser to it:
• Geolocation reports the proxy's coordinates
• Timezone and clock follow the proxy's timezone
• Language (navigator.language and the Accept-Language header) and regional formatting follow the proxy's country

🌍 See where you are
The popup globe shows your real location while Nomada is off, and the proxy's location — with your route there — while it's on, along with the local time, language and IP sites see.

🛡️ No leaks around the proxy
While a proxy is active, WebRTC can't reveal your real IP.

━━━━━━━━━━━━━━━━━━━━
WHO IT'S FOR
━━━━━━━━━━━━━━━━━━━━

• Privacy-minded users who don't want sites tracking their real location
• Developers & QA testing geo-targeted features, translations and timezones
• Remote workers and travelers who need a consistent location abroad

━━━━━━━━━━━━━━━━━━━━
WHY NOMADA
━━━━━━━━━━━━━━━━━━━━

✓ One switch — proxy, location, timezone and language move together
✓ Paste a proxy and go — type and country are detected for you
✓ No "debugging this browser" banner
✓ Switch proxies and open tabs update instantly
✓ No account required
✓ Your settings never leave your device

━━━━━━━━━━━━━━━━━━━━
PRIVACY
━━━━━━━━━━━━━━━━━━━━

Nomada stores all settings locally in your browser. It does not collect, sell or transmit your personal data. To show and match locations it asks ipwho.is where an IP address is: your own IP while Nomada is off, the proxy's exit IP while it's on, and — once, through that proxy only — a proxy you save with the Auto type.
```

---

## Category
**Primary:** Tools  *(or Productivity)*

## Language
English (add Russian later if desired)

---

## Single purpose (required by CWS)
*One sentence justifying the permissions — reviewers read this.*
```
Nomada routes the browser through a user-configured proxy and makes the browser's reported location, timezone and language match that proxy's location.
```

## Permission justifications (required for each permission)

| Permission | Justification |
|---|---|
| `proxy` | Route the user's traffic through the proxy profile they configure. |
| `storage` | Save proxy profiles and the last known locations locally. |
| `scripting` | Register the page script that applies the proxy's timezone, language and location (only while Nomada is on), and run the IP lookup in the active tab so it uses the same route as pages. |
| `declarativeNetRequestWithHostAccess` | Set the Accept-Language request header to the proxy country's language. |
| `privacy` | While a proxy is active, set WebRTC to `disable_non_proxied_udp` so it can't reveal the real IP. |
| `webRequest` + `webRequestAuthProvider` | Supply credentials to the authenticated proxy the user configured. |
| `host_permissions: <all_urls>` | The proxy's location, timezone and language must apply to every site the user visits. |

---

## Assets (in `store-assets/`)
- [x] Icon 128×128 (`public/icons/icon-128.png`)
- [x] Screenshots 1280×800: `screenshot-1-popup.png`, `screenshot-2-proxies.png`, `screenshot-3-add-proxy.png`
- [x] Small promo tile 440×280: `Thumb.png`
- [x] Marquee promo tile 1400×560: `Wide.png`
- [x] Large tile 920×680: `Mid.png` (the store no longer asks for it; kept for other uses)
- [x] Privacy policy URL (required because the extension handles location data)

---

## Screenshot captions
1. "One switch — your whole browser moves to your proxy's location."
2. "Every proxy shows the country it exits in."
3. "Paste any proxy — Nomada finds its type and country."

---

## Release notes — 1.2.0
*For the developer dashboard / changelog; the store has no public "what's new" field.*
- New settings page in the popup's style, light and dark
- Paste a proxy in any common format to fill in the form
- Auto proxy type: HTTP, SOCKS5 or HTTPS is detected on save, with clear errors for unreachable proxies and rejected logins
- Proxies show the flag of their exit country instead of a colour
- No new permissions

## Release notes — next version
- Public proxy gallery on the settings page: working public proxies (checked every 6 hours), by country and type, added or used with one click
