# Nomada — Chrome Web Store Listing

## Name (title)
```
Nomada — Location Guard, Locale & Proxy
```
*(75 char max; ~38 chars — well within limit)*

## Short description (summary)
*Max 132 characters. Shown in search results and under the title.*
```
Change your location, timezone, locale & proxy in one click. Keep them in sync so sites see one consistent place.
```
*(112 chars)*

Alternative:
```
One switch to set your location, timezone, locale and proxy together — for privacy and testing sites from anywhere.
```

---

## Detailed description
*Max ~16,000 chars. First 2-3 lines matter most — they show before "Read more".*

```
Nomada puts your browser anywhere in the world. Flip one switch and your geolocation, timezone, locale and proxy all change together — so every signal a website reads points to the same place, with no mismatch to give you away.

Most location tools only fake GPS coordinates while your timezone, language and IP still reveal the truth. Nomada keeps all four in sync.

━━━━━━━━━━━━━━━━━━━━
WHAT NOMADA DOES
━━━━━━━━━━━━━━━━━━━━

🌍 Set your location
Pick a city and your browser's geolocation reports those coordinates to every site.

🕐 Match your timezone & clock
Your timezone shifts to the chosen city — see its live local time right in the popup.

🗣️ Switch your locale
Browser language (navigator.language and the Accept-Language header) and regional formatting update to match the destination.

🔌 Route through a proxy
Add HTTP, HTTPS, SOCKS5 or PAC proxy profiles with optional authentication. One click to connect.

📍 Use my IP location
Detect the location of your current outgoing IP (including your proxy's exit IP) and match your geolocation to it automatically — a perfect, consistent disguise.

⚡ One master switch
Turn the whole extension on or off instantly. The toolbar icon shows the active country and turns green when Nomada is on.

━━━━━━━━━━━━━━━━━━━━
WHO IT'S FOR
━━━━━━━━━━━━━━━━━━━━

• Privacy-minded users who don't want sites tracking their real location
• Developers & QA testing geo-targeted features, translations and timezones
• Remote workers and travelers who need a consistent location abroad
• Anyone who wants region-locked content to behave as if they were local

━━━━━━━━━━━━━━━━━━━━
WHY NOMADA
━━━━━━━━━━━━━━━━━━━━

✓ Everything stays consistent — location, timezone, locale and IP all agree
✓ Clean, modern Material Design 3 interface
✓ Live world globe shows exactly where you are
✓ Smart proxy ↔ location sync suggestions
✓ No account required — works entirely in your browser
✓ Your data never leaves your device

━━━━━━━━━━━━━━━━━━━━
PRIVACY
━━━━━━━━━━━━━━━━━━━━

Nomada stores all settings locally in your browser. It does not collect, sell or transmit your personal data. It only contacts ipwho.is to look up the location of your current exit IP — when you click "Use my IP location", and automatically (at most every 10 minutes) while a proxy is active, to suggest matching your location to it. While a proxy is active, Nomada also stops WebRTC from leaking your real IP.

Open the popup, choose a city, and you're there.
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
Nomada lets users change their browser's reported geolocation, timezone, locale and proxy to a chosen location, keeping all of them consistent.
```

## Permission justifications (required for each permission)

| Permission | Justification |
|---|---|
| `proxy` | Route the user's traffic through a proxy profile they configure. |
| `storage` | Save the user's location, locale and proxy profiles locally. |
| `debugger` | Override geolocation, timezone, locale and browser language via the DevTools Protocol (the only API able to set these per-tab). |
| `scripting` | Run a small fetch (isolated world) in the active tab to detect the current outgoing IP's location through the proxy. |
| `privacy` | While a proxy is active, set WebRTC to `disable_non_proxied_udp` so it can't reveal the real IP. |
| `webNavigation` | Re-apply the location override when the user navigates to a new page. |
| `webRequest` + `webRequestAuthProvider` | Supply credentials for authenticated proxy profiles. |
| `host_permissions: <all_urls>` | Location and proxy settings must apply to every site the user visits. |

> **Note on `debugger`:** Chrome shows a "Nomada started debugging this browser" banner while geolocation override is active. This is expected — explain it in the listing/FAQ so users aren't alarmed.

---

## Assets needed before submitting
- [ ] Icon 128×128 (have it — universe icon)
- [ ] At least 1 screenshot, 1280×800 or 640×400 (popup with globe)
- [ ] Recommended: 3-5 screenshots (popup ON, city selection, proxy section, options page, IP-sync)
- [ ] Optional: small promo tile 440×280
- [ ] Privacy policy URL (required because the extension handles location data)

---

## Suggested screenshot captions
1. "One switch — your whole browser moves to a new place."
2. "Pick any city. Geolocation, timezone and locale follow."
3. "See the live local time of wherever you are."
4. "Route through your own HTTP, SOCKS5 or PAC proxy."
5. "Match your location to your proxy's IP automatically."
