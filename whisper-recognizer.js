// Records one utterance from the microphone and transcribes it with Whisper (see whisper-worker.js).
// Exposes a global `whisper` object. `whisper.supported` is false in browsers without the needed APIs.
const whisper = (() => {
  const sampleRate = 16000;
  const speechThreshold = 0.012;
  // Auto end-of-speech: wait ~1.2s of silence, longer (up to 3s) for speakers who pause mid-sentence.
  const minSilenceMs = 1200;
  const maxSilenceMs = 3000;
  const pauseFactor = 1.5;
  const noSpeechMs = 8000;
  const maxMs = 40000;

  const supported =
    typeof Worker !== "undefined" &&
    typeof AudioContext !== "undefined" &&
    Boolean(navigator.mediaDevices && navigator.mediaDevices.getUserMedia);

  let worker = null;
  let ready = null;
  let nextId = 1;
  let token = 0;
  let cancelRecording = null;
  let onProgress = null;
  const pending = new Map();

  class WhisperError extends Error {
    constructor(code) {
      super(code);
      this.code = code;
    }
  }

  function getWorker() {
    if (worker) return worker;
    worker = new Worker("whisper-worker.js", { type: "module" });
    worker.onmessage = (event) => {
      const message = event.data;
      if (message.type === "progress" && onProgress) onProgress(message.progress);
      if (message.type === "result" && pending.has(message.id)) {
        pending.get(message.id).resolve(message.text);
        pending.delete(message.id);
      }
      if (message.type === "error" && pending.has(message.id)) {
        pending.get(message.id).reject(new WhisperError("unavailable"));
        pending.delete(message.id);
      }
    };
    return worker;
  }

  function warmUp(progressCallback) {
    if (!supported) return Promise.reject(new WhisperError("unavailable"));
    onProgress = progressCallback || null;
    if (ready) return ready;
    const target = getWorker();
    ready = new Promise((resolve, reject) => {
      const listener = (event) => {
        const message = event.data;
        if (message.type === "ready") {
          target.removeEventListener("message", listener);
          resolve();
        } else if (message.type === "error" && message.id === undefined) {
          target.removeEventListener("message", listener);
          ready = null;
          reject(new WhisperError("unavailable"));
        }
      };
      target.addEventListener("message", listener);
      target.postMessage({ type: "load" });
    });
    return ready;
  }

  function rms(samples) {
    let sum = 0;
    for (let index = 0; index < samples.length; index += 1) sum += samples[index] * samples[index];
    return Math.sqrt(sum / samples.length);
  }

  async function record(currentToken) {
    let stream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({
        audio: { channelCount: 1, echoCancellation: true, noiseSuppression: true }
      });
    } catch (error) {
      const denied = error && (error.name === "NotAllowedError" || error.name === "SecurityError");
      throw new WhisperError(denied ? "permission-denied" : "unavailable");
    }

    const context = new AudioContext({ sampleRate });
    const source = context.createMediaStreamSource(stream);
    const processor = context.createScriptProcessor(4096, 1, 1);
    const chunks = [];
    let elapsedMs = 0;
    let silentMs = 0;
    let longestPauseMs = 0;
    let speechStarted = false;

    return new Promise((resolve, reject) => {
      let finished = false;
      const finish = (outcome) => {
        if (finished) return;
        finished = true;
        processor.onaudioprocess = null;
        source.disconnect();
        processor.disconnect();
        stream.getTracks().forEach((track) => track.stop());
        context.close();
        cancelRecording = null;
        if (outcome !== "finish") {
          reject(new WhisperError(outcome));
          return;
        }
        const audio = new Float32Array(chunks.reduce((total, chunk) => total + chunk.length, 0));
        let offset = 0;
        chunks.forEach((chunk) => {
          audio.set(chunk, offset);
          offset += chunk.length;
        });
        resolve(audio);
      };
      cancelRecording = () => finish("aborted");
      processor.onaudioprocess = (event) => {
        if (currentToken !== token) {
          finish("aborted");
          return;
        }
        const samples = new Float32Array(event.inputBuffer.getChannelData(0));
        chunks.push(samples);
        const chunkMs = (samples.length / context.sampleRate) * 1000;
        elapsedMs += chunkMs;
        if (rms(samples) >= speechThreshold) {
          if (speechStarted) longestPauseMs = Math.max(longestPauseMs, silentMs);
          speechStarted = true;
          silentMs = 0;
        } else {
          silentMs += chunkMs;
        }
        const allowedSilenceMs = Math.min(maxSilenceMs, Math.max(minSilenceMs, longestPauseMs * pauseFactor));
        if (speechStarted && silentMs >= allowedSilenceMs) finish("finish");
        else if (!speechStarted && elapsedMs >= noSpeechMs) finish("no-speech");
        else if (elapsedMs >= maxMs) finish(speechStarted ? "finish" : "no-speech");
      };
      source.connect(processor);
      processor.connect(context.destination);
    });
  }

  function transcribe(audio) {
    const id = nextId;
    nextId += 1;
    const target = getWorker();
    return new Promise((resolve, reject) => {
      pending.set(id, { resolve, reject });
      target.postMessage({ type: "transcribe", id, audio }, [audio.buffer]);
    });
  }

  // Whisper emits tags such as [BLANK_AUDIO] or (silence) for non-speech audio.
  function cleanText(text) {
    return text.replace(/\[[^\]]*\]|\([^)]*\)/g, " ").replace(/\s+/g, " ").trim();
  }

  function stop() {
    token += 1;
    if (cancelRecording) cancelRecording();
  }

  async function listen(onStatus) {
    if (!supported) throw new WhisperError("unavailable");
    stop();
    const currentToken = token;
    const audio = await record(currentToken);
    if (currentToken !== token) throw new WhisperError("aborted");
    if (onStatus) onStatus("processing");
    let text;
    try {
      await warmUp();
      text = cleanText(await transcribe(audio));
    } catch (error) {
      throw error instanceof WhisperError ? error : new WhisperError("unavailable");
    }
    if (currentToken !== token) throw new WhisperError("aborted");
    if (!text) throw new WhisperError("no-speech");
    return text;
  }

  return { supported, warmUp, listen, stop };
})();
