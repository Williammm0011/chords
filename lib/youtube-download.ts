import { spawn } from "child_process";
import { createHash } from "crypto";
import path from "path";
import fs from "fs/promises";
import { existsSync } from "fs";

// Safety limits
const MAX_URL_LENGTH = 500;
const MAX_FILE_SIZE_MB = 50;
const DOWNLOAD_TIMEOUT_MS = 120000; // 2 minutes

/**
 * Generate a hash from a YouTube URL for caching
 */
export function generateCacheKey(url: string): string {
  return createHash("md5").update(url).digest("hex");
}

/**
 * Get the cache directory path
 */
export function getCacheDir(): string {
  return path.join(process.cwd(), "public", "audio-cache");
}

/**
 * Ensure cache directory exists
 */
export async function ensureCacheDir(): Promise<void> {
  const cacheDir = getCacheDir();
  if (!existsSync(cacheDir)) {
    await fs.mkdir(cacheDir, { recursive: true });
  }
}

/**
 * Check if cached file exists
 */
export function isCached(hash: string): boolean {
  const cacheDir = getCacheDir();
  const mp3Path = path.join(cacheDir, `${hash}.mp3`);
  const m4aPath = path.join(cacheDir, `${hash}.m4a`);
  return existsSync(mp3Path) || existsSync(m4aPath);
}

/**
 * Get cached file path (returns null if not cached)
 */
export function getCachedFilePath(hash: string): string | null {
  const cacheDir = getCacheDir();
  const mp3Path = path.join(cacheDir, `${hash}.mp3`);
  const m4aPath = path.join(cacheDir, `${hash}.m4a`);
  
  if (existsSync(mp3Path)) return mp3Path;
  if (existsSync(m4aPath)) return m4aPath;
  return null;
}

/**
 * Download YouTube audio using yt-dlp
 */
export async function downloadYoutubeAudio(
  url: string,
  hash: string,
  onProgress?: (percent: number, message: string) => void
): Promise<{ success: boolean; filePath?: string; error?: string }> {
  // Safety: URL length check
  if (url.length > MAX_URL_LENGTH) {
    return { success: false, error: "URL too long" };
  }

  await ensureCacheDir();
  const cacheDir = getCacheDir();
  const outputTemplate = path.join(cacheDir, `${hash}.%(ext)s`);

  return new Promise((resolve) => {
    const args = [
      "--extract-audio",
      "--audio-format", "mp3",
      "--audio-quality", "0", // Best quality
      "--no-playlist",
      "--no-warnings",
      "--newline",
      "-o", outputTemplate,
      url,
    ];

    const process = spawn("yt-dlp", args);
    let errorOutput = "";
    let downloadStarted = false;

    // Timeout guard
    const timeout = setTimeout(() => {
      process.kill();
      resolve({ success: false, error: "Download timeout exceeded" });
    }, DOWNLOAD_TIMEOUT_MS);

    process.stdout.on("data", (data) => {
      const output = data.toString();
      downloadStarted = true;

      // Parse progress: [download] 45.2% of 3.5MiB at 1.2MiB/s ETA 00:02
      const progressMatch = output.match(/\[download\]\s+(\d+\.?\d*)%/);
      if (progressMatch && onProgress) {
        const percent = parseFloat(progressMatch[1]);
        onProgress(percent, `Downloading: ${percent.toFixed(1)}%`);
      }

      // Check for conversion
      if (output.includes("[ffmpeg]") && onProgress) {
        onProgress(95, "Converting to MP3...");
      }
    });

    process.stderr.on("data", (data) => {
      errorOutput += data.toString();
    });

    process.on("close", (code) => {
      clearTimeout(timeout);

      if (code === 0) {
        // Find the downloaded file
        const mp3Path = path.join(cacheDir, `${hash}.mp3`);
        const m4aPath = path.join(cacheDir, `${hash}.m4a`);

        let finalPath: string | null = null;
        if (existsSync(mp3Path)) finalPath = mp3Path;
        else if (existsSync(m4aPath)) finalPath = m4aPath;

        if (finalPath) {
          // Check file size
          fs.stat(finalPath)
            .then((stats) => {
              const sizeMB = stats.size / (1024 * 1024);
              if (sizeMB > MAX_FILE_SIZE_MB) {
                fs.unlink(finalPath!).catch(() => {});
                resolve({ success: false, error: `File too large: ${sizeMB.toFixed(1)}MB` });
              } else {
                if (onProgress) onProgress(100, "Download complete");
                resolve({ success: true, filePath: finalPath });
              }
            })
            .catch(() => {
              resolve({ success: false, error: "Failed to verify file" });
            });
        } else {
          resolve({ success: false, error: "Downloaded file not found" });
        }
      } else {
        let errorMsg = "Download failed";
        
        if (errorOutput.includes("Sign in to confirm")) {
          errorMsg = "YouTube bot protection triggered. Try a different video or remove playlist parameters.";
        } else if (errorOutput.includes("Video unavailable")) {
          errorMsg = "Video unavailable or private";
        } else if (errorOutput.includes("not a valid URL")) {
          errorMsg = "Invalid YouTube URL";
        } else if (errorOutput.trim()) {
          errorMsg = errorOutput.split("\n")[0].substring(0, 200);
        }

        resolve({ success: false, error: errorMsg });
      }
    });

    process.on("error", (err) => {
      clearTimeout(timeout);
      if (err.message.includes("ENOENT")) {
        resolve({ success: false, error: "yt-dlp not found. Please install it." });
      } else {
        resolve({ success: false, error: err.message });
      }
    });
  });
}

/**
 * Clean up old cache files (older than 24 hours)
 */
export async function cleanupOldCache(): Promise<void> {
  try {
    const cacheDir = getCacheDir();
    if (!existsSync(cacheDir)) return;

    const files = await fs.readdir(cacheDir);
    const now = Date.now();
    const maxAge = 24 * 60 * 60 * 1000; // 24 hours

    for (const file of files) {
      const filePath = path.join(cacheDir, file);
      const stats = await fs.stat(filePath);
      
      if (now - stats.mtimeMs > maxAge) {
        await fs.unlink(filePath);
        console.log(`[Cache] Deleted old file: ${file}`);
      }
    }
  } catch (error) {
    console.error("[Cache] Cleanup error:", error);
  }
}

