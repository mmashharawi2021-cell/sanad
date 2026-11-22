---
name: i18n-accessibility
description: "Audit Sanad's Arabic RTL web UI for language and direction issues: lang/dir, bidirectional text (Latin numbers/units/paths inside Arabic), logical CSS properties, icon mirroring, LTR inputs, and Arabic number/date formatting. Use after UI text or layout changes, or when text looks reversed."
license: MIT
---

<!-- Adapted for the Sanad project from Community-Access/accessibility-agents (skills/i18n-accessibility, MIT).
     Changes: self-contained (the original depended on a11y-core schemas and returned JSON only),
     Arabic report output, and Sanad-specific RTL rules. -->

# i18n / RTL Accessibility — سند

You audit Sanad's web UI (`public/index.html`, `public/styles.css`, `public/*.js`) for internationalization accessibility. Sanad is **Arabic-first, RTL** (`<html lang="ar" dir="rtl">`) with frequent Latin fragments: model names, file paths, commands, ports, GB/ms units, code.

## Audit areas

### 1. Language (`lang`) — WCAG 3.1.1 / 3.1.2
- `<html lang="ar">` present.
- Long English passages (code blocks, English UI strings) should carry `lang="en"` when read as prose. Code inside `<pre><code>` is fine without it.

### 2. Direction (`dir`)
- Document-level `dir="rtl"`.
- User or model generated text that may be English → `dir="auto"` on its container.
- Code blocks, terminal output, file paths, URLs → `dir="ltr"` (code blocks already use `direction: ltr`).

### 3. Bidirectional text (the most common bug in Sanad)
- Latin + digits embedded in Arabic sentences get reordered: «GB 930.5» instead of «930.5 GB», «C: القرص» flipping, PIDs and ports jumping.
- Fix with `<bdi>` around the Latin/number fragment (see `public/home.js` disk line), or `unicode-bidi: isolate` on styled spans.
- When building strings in JS with `textContent`, append `<bdi>` elements instead of concatenating.

### 4. RTL layout
- Prefer logical properties: `margin-inline-start`, `padding-inline-end`, `inset-inline-start`, `border-start-start-radius`, `text-align: start`. Flag `left`/`right`/`margin-left` in new CSS unless intentionally physical.
- **Intentionally physical (do not "fix"):** the iOS status bar (`.ios-statusbar` uses `direction: ltr` — iOS does not mirror it), terminal and code blocks.
- Icons: directional icons (arrows, chevrons, "send", "back") mirror in RTL; non-directional icons (clock, globe, mic, eye) do not.

### 5. Forms and inputs
- Arabic label + Latin value (host, port, PID, path, URL, email) → `dir="ltr"` on the input (e.g. `#netPingHost`, `#netFreePortInput`).
- Search fields that accept both scripts → `dir="auto"`.

### 6. Numbers, dates, times
- Sanad uses Latin digits with Arabic locale: `toLocale*String("ar-u-nu-latn", …)`. Flag mixed usage (some places Arabic-Indic ٠١٢, others Latin).
- Relative times/days in Arabic (`أمس`, weekday names); avoid all-numeric dates like `2/11/26`, which reorder confusingly in RTL — prefer `2 نوفمبر`.

### 7. Speech
- Text sent to TTS (`speakText`) should strip code and symbols (see `cleanTextForSpeech`) and keep Arabic punctuation so pauses sound natural.

## BCP 47 tags
| Language | Tag | Direction |
|---|---|---|
| Arabic | `ar` | RTL |
| English | `en` | LTR |
| Persian | `fa` | RTL |
| Urdu | `ur` | RTL |
| Hebrew | `he` | RTL |

## Process
1. **Detect:** read the touched files; list where Arabic and Latin text meet (templates in JS, labels, notifications, stats).
2. **Check direction:** `dir` on containers and inputs; logical vs physical CSS in changed rules.
3. **Verify visually when possible:** load `http://localhost:3000` in a browser at desktop and 430px width; look for reversed units, jumping numbers, mirrored icons that shouldn't be.

## Output
A report **in Arabic**, ordered by impact. For each finding: file and line, what the user sees, the WCAG criterion if any, and the exact fix (markup or CSS). Separate "confirmed (seen)" from "suspected (code reading only)". Do not edit files unless asked.
