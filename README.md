# Packet Viewer

**See everything Discord knows about you.** Drop your Discord data package (`package.zip`) into the page and get a searchable report of every message, person, server, device, location and tracked event.

**Everything runs locally in your browser. Your package is never uploaded anywhere.**

## How to use

1. In Discord, go to **User Settings → Data & Privacy → Request all of my Data**. Discord emails you a download link.
2. Open the site and drop in `package.zip`. Don't unzip it first.
3. Explore. The finished report is cached in your browser's IndexedDB, so you can come back to it later.

## Privacy

- This is a static site with no backend.
- The zip is read straight from your disk by a Web Worker. A small ZIP64-aware reader (`js/zip.js`) streams each entry through the browser's built-in `DecompressionStream`, so multi-GB telemetry files are processed without ever being fully loaded into memory.
- A Content-Security-Policy sets `connect-src 'self'`, so the page cannot `fetch` or `XHR` to any other server.
- The only outbound requests are images: avatars and custom emoji from Discord's CDN, attachment and GIF previews, and the Google Font.
- **Load another package** deletes the cached report.

## What you get

| Page | Shows |
|---|---|
| Overview | Profile hero, headline stats, fun facts, a timeline of your Discord life |
| Messages | Calendar and hour heatmaps, vocabulary, emoji, top channels, a chat browser, full-text and regex search |
| People | Friends, blocks, top DMs, DM activity over time |
| Servers | Activity per server, folders, audit log, emoji, webhooks, notification settings |
| Telemetry | Every tracked event type with timelines, heatmaps, experiments and sample payloads |
| Places & Devices | Cities over time, countries, ISPs, IPs, devices, clients, login sessions |
| Games, Voice & Music | Playtime, game launches, hours in voice, streams, Spotify tracks and artists |
| Account & Settings | Identity, connections, avatars, badges, privacy settings, frecency, full settings tree |
| Billing, Orbs & Quests | Payments, entitlements, orb balance, quests, ad traits |
| Support & Activities | Support tickets, Activities data |
| Raw Package | Every file in the zip, plus a JSON explorer |

**Streamer mode** blurs your email, phone number, IPs and payment details.

## Development

The site is plain HTML, CSS and JS with no build step. Serve the folder with any static server, for example:

```
python -m http.server 8000
```

Then open http://localhost:8000. For testing, `?src=package.zip` loads a same-origin zip without the file picker, and adding `&noact=1` skips the telemetry scan.

GitHub Pages: push to `main`, then go to **Settings → Pages → Deploy from branch → main / (root)**.

Not affiliated with Discord.
