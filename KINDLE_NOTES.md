# Kindle Browser Compatibility Notes

Most Kindle “Experimental Browser” builds are based on an older WebKit.

Two very common failure modes are:

1) **No native ES module support** — Vite’s default build uses `<script type="module">`, which older Kindles can’t parse.
2) **Wrong URL for testing** — `http://localhost:8080` on the Kindle points to the Kindle itself, not your computer. You must use your computer’s LAN IP.

This repo has been updated to generate a **legacy (ES5) bundle** and to keep asset URLs **relative**, which makes it far more likely to load on Kindle.

## What changed

- Added `@vitejs/plugin-legacy` so production builds include a `nomodule` (ES5) bundle.
- Set `base: "./"` so built assets load correctly even when hosted in a subfolder.
- Set the dev server host to `0.0.0.0` so it is reachable from other devices on your LAN.
- Added `regenerator-runtime` polyfill support for older async/generator behavior.

## Test on a Kindle (dev mode)

1) Install dependencies and start the dev server:

- `npm install`
- `npm run dev`

2) Find your computer’s LAN IPv4 address (examples: `192.168.1.25`, `10.0.0.14`).

3) On the Kindle, open:

- `http://YOUR_LAN_IP:8080/`

Notes:
- The Kindle and your computer must be on the same Wi‑Fi network.
- If you’re on a corporate/VPN setup, it can block device‑to‑device traffic.
- If you have a firewall, allow inbound connections to port 8080.

## Build a Kindle-friendly production bundle

1) Install deps (if you haven’t):
- `npm install`

2) Build:
- `npm run build`

This creates `dist/`.

3) Serve `dist/` over plain HTTP (don’t use `file://` on Kindle).

Example (from the project folder):

- `cd dist`
- `python3 -m http.server 8000 --bind 0.0.0.0`

Then open on the Kindle:

- `http://YOUR_LAN_IP:8000/`

## If it still won’t load

- If you are hosting on a modern HTTPS-only platform (Netlify/Vercel/etc.), some Kindle models fail TLS negotiation. Try local plain HTTP first.
- If the Kindle shows a white screen, it’s usually a JavaScript parse error (ES modules / modern syntax). The legacy build fixes most of these cases.
- The Kindle browser cache can be stubborn; try a hard reload or restart the browser.
