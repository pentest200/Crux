import { Mp3Encoder } from "@breezystack/lamejs";

/**
 * Audio format configurations and labels.
 */
export const AUDIO_FORMATS = [
  { value: "mp3", label: "MP3 — Most compatible, fast (Recommended)" },
  { value: "wav", label: "WAV — Lossless uncompressed (Instant)" },
  { value: "aac", label: "AAC — Modern high efficiency" },
  { value: "ogg", label: "OGG Vorbis — Open source" },
  { value: "flac", label: "FLAC — Lossless compressed" },
];

export const BITRATE_OPTIONS = [
  { value: "96k", label: "96 kbps — Small file" },
  { value: "128k", label: "128 kbps — Standard" },
  { value: "192k", label: "192 kbps — High quality (Recommended)" },
  { value: "256k", label: "256 kbps — Very high quality" },
  { value: "320k", label: "320 kbps — Maximum quality" },
];

/**
 * Convert Float32Array (-1.0 to 1.0) to Int16Array (-32768 to 32767).
 */
function floatToInt16(float32Array) {
  const len = float32Array.length;
  const int16 = new Int16Array(len);
  for (let i = 0; i < len; i++) {
    const s = Math.max(-1, Math.min(1, float32Array[i]));
    int16[i] = s < 0 ? s * 0x8000 : s * 0x7fff;
  }
  return int16;
}

/**
 * Encode an AudioBuffer into an MP3 Blob using pure JavaScript (lamejs).
 * Runs completely on device in under a second with real-time progress.
 */
async function encodeMp3(audioBuffer, bitrateKbps = 192, onProgress) {
  const numChannels = Math.min(audioBuffer.numberOfChannels, 2);
  const sampleRate = audioBuffer.sampleRate;
  const kbps = parseInt(bitrateKbps, 10) || 192;

  const mp3encoder = new Mp3Encoder(numChannels, sampleRate, kbps);
  const sampleBlockSize = 1152;
  const mp3Data = [];

  const leftChannel = floatToInt16(audioBuffer.getChannelData(0));
  const rightChannel =
    numChannels > 1 ? floatToInt16(audioBuffer.getChannelData(1)) : null;

  const totalSamples = leftChannel.length;
  let processed = 0;

  for (let i = 0; i < totalSamples; i += sampleBlockSize) {
    const leftChunk = leftChannel.subarray(i, i + sampleBlockSize);
    let mp3buf;
    if (numChannels === 2 && rightChannel) {
      const rightChunk = rightChannel.subarray(i, i + sampleBlockSize);
      mp3buf = mp3encoder.encodeBuffer(leftChunk, rightChunk);
    } else {
      mp3buf = mp3encoder.encodeBuffer(leftChunk);
    }

    if (mp3buf.length > 0) {
      mp3Data.push(mp3buf);
    }

    processed += leftChunk.length;
    if (onProgress && i % (sampleBlockSize * 10) === 0) {
      // 30% to 95% is encoding
      const p = 0.3 + (processed / totalSamples) * 0.65;
      onProgress(p);
      // Yield thread briefly so UI stays responsive
      await new Promise((resolve) => setTimeout(resolve, 0));
    }
  }

  const endBuf = mp3encoder.flush();
  if (endBuf.length > 0) {
    mp3Data.push(endBuf);
  }

  if (onProgress) onProgress(1.0);
  return new Blob(mp3Data, { type: "audio/mpeg" });
}

/**
 * Encode an AudioBuffer into a WAV Blob (16-bit PCM).
 * Instantaneous, 0 dependencies.
 */
function encodeWav(audioBuffer) {
  const numChannels = audioBuffer.numberOfChannels;
  const sampleRate = audioBuffer.sampleRate;
  const bitDepth = 16;
  const bytesPerSample = bitDepth / 8;
  const blockAlign = numChannels * bytesPerSample;
  const numSamples = audioBuffer.length;
  const dataSize = numSamples * blockAlign;
  const buffer = new ArrayBuffer(44 + dataSize);
  const view = new DataView(buffer);

  function writeString(offset, string) {
    for (let i = 0; i < string.length; i++) {
      view.setUint8(offset + i, string.charCodeAt(i));
    }
  }

  writeString(0, "RIFF");
  view.setUint32(4, 36 + dataSize, true);
  writeString(8, "WAVE");
  writeString(12, "fmt ");
  view.setUint32(16, 16, true); // SubChunk1Size (16 for PCM)
  view.setUint16(20, 1, true); // AudioFormat (1 for PCM)
  view.setUint16(22, numChannels, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * blockAlign, true);
  view.setUint16(32, blockAlign, true);
  view.setUint16(34, bitDepth, true);
  writeString(36, "data");
  view.setUint32(40, dataSize, true);

  const channels = [];
  for (let i = 0; i < numChannels; i++) {
    channels.push(audioBuffer.getChannelData(i));
  }

  let offset = 44;
  for (let i = 0; i < numSamples; i++) {
    for (let ch = 0; ch < numChannels; ch++) {
      const s = Math.max(-1, Math.min(1, channels[ch][i]));
      const val = s < 0 ? s * 0x8000 : s * 0x7fff;
      view.setInt16(offset, val, true);
      offset += 2;
    }
  }

  return new Blob([buffer], { type: "audio/wav" });
}

/**
 * Native audio extraction using Web Audio API (decodeAudioData).
 * Works directly in the browser for MP4, WebM, MOV, and other HTML5 video formats.
 * Instant, 0 network downloads.
 */
async function extractNative(videoFile, format, bitrate, onProgress) {
  if (onProgress) onProgress(0.1);

  const arrayBuffer = await videoFile.arrayBuffer();
  if (onProgress) onProgress(0.2);

  const AudioCtxClass = window.AudioContext || window.webkitAudioContext;
  if (!AudioCtxClass) {
    throw new Error("Web Audio API not supported in this browser.");
  }

  const audioCtx = new AudioCtxClass();
  try {
    const audioBuffer = await audioCtx.decodeAudioData(arrayBuffer);
    if (onProgress) onProgress(0.3);

    if (format === "wav") {
      const blob = encodeWav(audioBuffer);
      if (onProgress) onProgress(1.0);
      return { blob, ext: "wav" };
    }

    if (format === "mp3") {
      const kbps = parseInt(bitrate, 10) || 192;
      const blob = await encodeMp3(audioBuffer, kbps, onProgress);
      return { blob, ext: "mp3" };
    }

    // Default to MP3 if format is other, or throw
    throw new Error(`Format ${format} not supported by native encoder.`);
  } finally {
    try {
      await audioCtx.close();
    } catch {
      // ignore
    }
  }
}

/**
 * FFmpeg fallback for uncommon codecs or formats like FLAC/OGG/AAC.
 */
let ffmpegInstance = null;
async function extractWithFFmpeg(videoFile, format, bitrate, onProgress) {
  const { FFmpeg } = await import("@ffmpeg/ffmpeg");
  const { fetchFile, toBlobURL } = await import("@ffmpeg/util");

  if (!ffmpegInstance || !ffmpegInstance.loaded) {
    const ffmpeg = new FFmpeg();
    ffmpeg.on("progress", ({ progress }) => {
      if (onProgress) onProgress(0.4 + Math.min(Math.max(progress, 0), 1) * 0.55);
    });

    // Use fast jsdelivr CDN
    const baseURL = "https://cdn.jsdelivr.net/npm/@ffmpeg/core@0.12.6/dist/esm";
    await ffmpeg.load({
      coreURL: await toBlobURL(`${baseURL}/ffmpeg-core.js`, "text/javascript"),
      wasmURL: await toBlobURL(`${baseURL}/ffmpeg-core.wasm`, "application/wasm"),
    });
    ffmpegInstance = ffmpeg;
  }

  const FORMAT_MAP = {
    mp3: { ext: "mp3", mime: "audio/mpeg", args: ["-vn", "-acodec", "libmp3lame", "-ab", bitrate] },
    wav: { ext: "wav", mime: "audio/wav", args: ["-vn", "-acodec", "pcm_s16le"] },
    aac: { ext: "aac", mime: "audio/aac", args: ["-vn", "-acodec", "aac", "-ab", bitrate] },
    ogg: { ext: "ogg", mime: "audio/ogg", args: ["-vn", "-acodec", "libvorbis", "-ab", bitrate] },
    flac: { ext: "flac", mime: "audio/flac", args: ["-vn", "-acodec", "flac"] },
  };

  const config = FORMAT_MAP[format] || FORMAT_MAP.mp3;
  const inputExt = videoFile.name.split(".").pop()?.toLowerCase() || "mp4";
  const inputName = `input_${Date.now()}.${inputExt}`;
  const outputName = `output_${Date.now()}.${config.ext}`;

  await ffmpegInstance.writeFile(inputName, await fetchFile(videoFile));
  await ffmpegInstance.exec(["-i", inputName, ...config.args, outputName]);
  const data = await ffmpegInstance.readFile(outputName);

  try {
    await ffmpegInstance.deleteFile(inputName);
    await ffmpegInstance.deleteFile(outputName);
  } catch {
    // ignore
  }

  if (onProgress) onProgress(1.0);
  const blob = new Blob([data.buffer], { type: config.mime });
  return { blob, ext: config.ext };
}

/**
 * Main export: extractAudio
 * First tries native browser Web Audio API (instant, 0 download, works for 99% of files).
 * Falls back to FFmpeg WASM if native decoding is not supported.
 *
 * @param {File} videoFile
 * @param {object} options
 * @param {string} options.format — "mp3" | "wav" | "aac" | "ogg" | "flac"
 * @param {string} options.bitrate — "96k" | "128k" | "192k" | "256k" | "320k"
 * @param {(p: number) => void} options.onProgress
 * @returns {Promise<{ blob: Blob, ext: string }>}
 */
export async function extractAudio(videoFile, { format = "mp3", bitrate = "192k", onProgress } = {}) {
  // If user selected MP3 or WAV (most common), try native extraction first
  if (["mp3", "wav"].includes(format)) {
    try {
      return await extractNative(videoFile, format, bitrate, onProgress);
    } catch (err) {
      console.warn("Native audio extraction failed, falling back to FFmpeg:", err);
    }
  }

  // FFmpeg fallback
  return await extractWithFFmpeg(videoFile, format, bitrate, onProgress);
}
