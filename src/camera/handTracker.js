import { HandLandmarker, FilesetResolver } from "@mediapipe/tasks-vision";

let landmarker = null;

// V2: try the GPU delegate first (much faster on phones), fall back to CPU.
export async function initHandTracker() {
  // wasm files are copied to public/wasm (see setup step), model to public/models
  const vision = await FilesetResolver.forVisionTasks("/wasm");
  const make = (delegate) =>
    HandLandmarker.createFromOptions(vision, {
      baseOptions: { modelAssetPath: "/models/hand_landmarker.task", delegate },
      runningMode: "VIDEO",
      numHands: 2,
      minHandDetectionConfidence: 0.5,
      minHandPresenceConfidence: 0.5,
      minTrackingConfidence: 0.5,
    });
  try {
    landmarker = await make("GPU");
  } catch (e) {
    console.warn("GPU delegate failed, using CPU", e);
    landmarker = await make("CPU");
  }
}

export function detectHands(video, timestampMs) {
  return landmarker.detectForVideo(video, timestampMs);
}
