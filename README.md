# ARCSS-WebAR

Browser-based AR review prototype for CSS NC II. A phone camera feed is overlaid with 3D hardware that you control with your hand (MediaPipe Hands + Three.js). No install, no build step.

## Current scenario: RAM installation (practice)
1. Show your hand to the camera.
2. Pinch (thumb + index) on the RAM stick to pick it up.
3. Move it over the DIMM slot (outline turns green when aligned) and release.
4. Results screen shows time, accuracy and misplacements; sessions are saved on the device (Records tab).

## Run it
Camera access needs **HTTPS** (or `localhost`), and `model.glb` can't load from `file://`.

- Local: `python3 -m http.server 8000` in this folder, then open `http://localhost:8000`.
- On a phone: host the folder on HTTPS (GitHub Pages, Netlify, etc.) and open the link in Chrome or Safari.

## Files
- `index.html`: screens (splash, login, dashboard, AR, guide, records, settings)
- `ui.js`: screen router and simulated login (any non-empty values pass)
- `ar.js`: hand tracking, 3D scene, scenario logic, scoring, local records
- `style.css`, `model.glb` (RAM stick)

Libraries are loaded from CDNs with pinned versions (Three r128, MediaPipe Hands 0.4.1675469240).
