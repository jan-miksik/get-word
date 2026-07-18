import { spawnSync } from 'node:child_process';
import { mkdir, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

export const MIN_AUDIO_BYTES = 1_000;
const MIN_DURATION_SECONDS = 0.25;
const MIN_MAX_VOLUME_DB = -35;
// Max volume alone misses near-silent clips with a loud transient. Healthy
// demo clips currently sit around -16..-26 dB mean volume.
const MIN_MEAN_VOLUME_DB = -30;

export type AudioQuality = {
  ok: boolean;
  durationSeconds: number;
  sizeBytes: number;
  meanVolumeDb: number | null;
  maxVolumeDb: number | null;
  reason: string | null;
};

export function analyzeAudioFile(filePath: string, fallbackSizeBytes = 0): AudioQuality {
  const probe = spawnSync(
    'ffprobe',
    ['-v', 'error', '-show_entries', 'format=duration,size', '-of', 'json', filePath],
    { encoding: 'utf8' },
  );
  const parsed = JSON.parse(probe.stdout || '{}') as {
    format?: { duration?: string; size?: string };
  };
  const durationSeconds = Number(parsed.format?.duration ?? 0);
  const sizeBytes = Number(parsed.format?.size ?? fallbackSizeBytes);

  const ffmpeg = spawnSync(
    'ffmpeg',
    ['-hide_banner', '-nostats', '-i', filePath, '-af', 'volumedetect', '-f', 'null', '-'],
    { encoding: 'utf8' },
  );
  const output = `${ffmpeg.stdout}\n${ffmpeg.stderr}`;
  const meanVolumeDb = Number(output.match(/mean_volume: (-?\d+(?:\.\d+)?) dB/)?.[1]);
  const maxVolumeDb = Number(output.match(/max_volume: (-?\d+(?:\.\d+)?) dB/)?.[1]);
  const normalizedMean = Number.isFinite(meanVolumeDb) ? meanVolumeDb : null;
  const normalizedMax = Number.isFinite(maxVolumeDb) ? maxVolumeDb : null;

  const reason =
    sizeBytes < MIN_AUDIO_BYTES
      ? `too small (${sizeBytes} bytes)`
      : durationSeconds < MIN_DURATION_SECONDS
        ? `too short (${durationSeconds.toFixed(3)}s)`
        : normalizedMax === null
          ? 'could not measure volume'
          : normalizedMax < MIN_MAX_VOLUME_DB
            ? `too quiet (max ${normalizedMax.toFixed(1)} dB)`
            : normalizedMean !== null && normalizedMean < MIN_MEAN_VOLUME_DB
              ? `too quiet (mean ${normalizedMean.toFixed(1)} dB)`
              : null;

  return {
    ok: reason === null,
    durationSeconds,
    sizeBytes,
    meanVolumeDb: normalizedMean,
    maxVolumeDb: normalizedMax,
    reason,
  };
}

export async function analyzeAudioBuffer(
  audio: Buffer,
  filePrefix = 'quality',
): Promise<AudioQuality> {
  const tmpDir = path.join(os.tmpdir(), 'get-word-demo-audio');
  await mkdir(tmpDir, { recursive: true });
  const tmpFile = path.join(
    tmpDir,
    `${filePrefix}-${process.pid}-${Date.now()}-${Math.random().toString(36).slice(2)}.mp3`,
  );
  await writeFile(tmpFile, audio);
  try {
    return analyzeAudioFile(tmpFile, audio.byteLength);
  } finally {
    await rm(tmpFile, { force: true });
  }
}

export function formatAudioQuality(quality: AudioQuality): string {
  const max = quality.maxVolumeDb === null ? 'n/a' : `${quality.maxVolumeDb.toFixed(1)} dB`;
  const mean = quality.meanVolumeDb === null ? 'n/a' : `${quality.meanVolumeDb.toFixed(1)} dB`;
  return `${quality.durationSeconds.toFixed(3)}s, max ${max}, mean ${mean}, ${quality.sizeBytes} bytes`;
}
