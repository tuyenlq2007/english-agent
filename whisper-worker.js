import { env, pipeline } from "https://cdn.jsdelivr.net/npm/@huggingface/transformers@4.3.2/dist/transformers.web.js";

// Whisper runs in this worker, inside the browser. Audio is never sent to a server;
// only the model files are downloaded (once) and then cached by the browser.
env.allowLocalModels = false;

const model = "Xenova/whisper-base.en";
let transcriber = null;

function loadModel() {
  if (!transcriber) {
    transcriber = pipeline("automatic-speech-recognition", model, {
      dtype: "q8",
      progress_callback: (info) => {
        if (info.status === "progress" && typeof info.progress === "number") {
          self.postMessage({ type: "progress", progress: info.progress });
        }
      }
    });
    transcriber.catch(() => {
      transcriber = null;
    });
  }
  return transcriber;
}

self.onmessage = async (event) => {
  const message = event.data;
  try {
    const run = await loadModel();
    if (message.type === "load") {
      self.postMessage({ type: "ready" });
      return;
    }
    const output = await run(message.audio, { chunk_length_s: 30 });
    const text = (Array.isArray(output) ? output[0]?.text : output.text) || "";
    self.postMessage({ type: "result", id: message.id, text });
  } catch (error) {
    self.postMessage({ type: "error", id: message.id, message: String(error?.message || error) });
  }
};
