# MIMICme

Adaptive gesture-mimicking game. The player copies hand poses shown on screen. A per-finger
error-aware agent picks the next pose in Arcade mode. Hand tracking: MediaPipe Hand Landmarker
(Tasks Vision), runs fully in the browser, no video leaves the device.

## Modes

Campaign (EASY/MEDIUM/HARD levels, one pose per level, unlocked in order), Arcade (timed, agent
chooses poses from unlocked ones), Practice (no timer). First play asks for a one-time finger
calibration (open palm) to adapt to the player's finger lengths.

## Run locally

    npm install
    npm run dev        # http://localhost:5173  (camera works on localhost)

The MediaPipe wasm files are in public/wasm and the model in public/models/hand_landmarker.task.
If they are missing: copy node_modules/@mediapipe/tasks-vision/wasm to public/wasm and download
hand_landmarker.task from the official MediaPipe Hand Landmarker guide.

## Build and deploy

    npm run build
    npm run preview

Upload dist/ to Netlify Drop, Vercel or GitHub Pages (HTTPS is required for the phone camera).

## Developer mode (record target poses)

Add ?dev=1 to the URL (or use npm run dev) -> Developer tools -> Capture -> Export poses.json
-> save as public/poses.json. The player build only reads that file.

## Offline experiment (paper)

    node src/eval/simulate.js        # simulated players, 3 policies
    node src/eval/simulate.js 0      # ablation: players never improve

## Structure

src/camera tracking | src/gestures normalization, matching, calibration, pose data |
src/agent profile + challenge selection | src/game rounds, campaign, timers |
src/ui screens, cursor trail, sounds | src/eval simulation | src/config.js tunable numbers.
