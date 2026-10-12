# ARCSS-WebAR

Browser-based AR review prototype for CSS NC II. A phone camera feed is overlaid with a 3D motherboard that you assemble with your hand (MediaPipe Hands + Three.js). No install, no build step.

## Current scenario: PC assembly (RAM + GPU)
1. Show your hand to the camera.
2. Pinch (thumb + index) on the part in the tray below the board.
3. Drag it over a matching slot. The slot outline turns green when it will snap, red if it's the wrong slot.
4. Release to seat it. Wrong or misaligned drops count as misplacements.
5. Results (time, accuracy, misplacements) are saved on the device and shown in the Records tab.

## Run it
Camera access needs **HTTPS** (or `localhost`); the 3D models can't load from `file://`.
- Local: `python3 -m http.server 8000` in this folder, then open `http://localhost:8000`.
- Phone: host the folder on HTTPS (GitHub Pages, Netlify) and open the link.

## Files
- `index.html`, `ui.js`, `style.css`: screens, router, simulated login (any non-empty values pass)
- `ar.js`: hand tracking, scene, assembly logic, scoring, local records
- `parts.json`: board, slot map and the ordered list of parts to install
- `models/`: `motherboard.glb`, `ram.glb`, `gpu.glb` (converted from the Blender FBX files)

## Adding a part (CPU, PSU, CPU fan...)
1. Send/convert the model (parts are merged by colour, origin at the bottom-centre of the connector edge).
2. Add a slot for it in `parts.json` -> `slots` (type, x, z, length).
3. Add an entry in `parts` (name, file, which slot types it `accepts`, `seatY`, `dock`, instruction text, and `wrong` messages).
No change to `ar.js` is needed.

Libraries load from CDNs with pinned versions (Three r128, MediaPipe Hands 0.4.1675469240).
