import { spawn } from "child_process";
import path from "path";
import fs from "fs";
import { downloadQueue } from "./downloadQueue";

export interface DownloadResult {
  success: boolean;
  audioPath?: string;
  error?: string;
}

/**
 * Downloads audio from a YouTube URL using yt-dlp with progress tracking
 * @param youtubeUrl - The YouTube video URL
 * @param jobId - The job ID for progress tracking
 * @param outputDir - Directory to save the audio file (defaults to public/downloads)
 * @returns Path to the downloaded audio file
 */
export async function downloadYoutubeAudio(
  youtubeUrl: string,
  jobId: string,
  outputDir: string = path.join(process.cwd(), "public", "downloads")
): Promise<DownloadResult> {
  return new Promise((resolve) => {
    try {
      // Create output directory if it doesn't exist
      if (!fs.existsSync(outputDir)) {
        fs.mkdirSync(outputDir, { recursive: true });
      }

      // Generate a unique filename based on timestamp
      const timestamp = Date.now();
      const outputTemplate = path.join(outputDir, `audio-${timestamp}.%(ext)s`);

      console.log("[YouTube] Downloading audio:", youtubeUrl);

      // Update job status
      downloadQueue.updateJob(jobId, { status: "downloading", progress: 0 });

      // Spawn yt-dlp process
      const ytdlp = spawn("yt-dlp", [
        "-x",
        "--audio-format", "mp3",
        "--audio-quality", "0",
        "--no-playlist", // Only download single video, not entire playlist
        "--no-warnings", // Suppress warnings about outdated version
        "-o", outputTemplate,
        "--newline", // Force progress on new lines
        youtubeUrl,
      ]);

      let stderr = "";

      ytdlp.stdout.on("data", (data) => {
        const output = data.toString();
        console.log("[YouTube] stdout:", output);

        // Parse progress from yt-dlp output
        // Example: [download]  45.2% of 3.50MiB at 1.23MiB/s ETA 00:02
        const progressMatch = output.match(/\[download\]\s+(\d+\.?\d*)%/);
        if (progressMatch) {
          const progress = parseFloat(progressMatch[1]);
          downloadQueue.updateJob(jobId, { progress: Math.min(progress, 99) });
        }

        // Check for conversion progress
        if (output.includes("[ExtractAudio]") || output.includes("Deleting original file")) {
          downloadQueue.updateJob(jobId, { progress: 95 });
        }
      });

      ytdlp.stderr.on("data", (data) => {
        stderr += data.toString();
        console.warn("[YouTube] stderr:", data.toString());
      });

      ytdlp.on("close", (code) => {
        if (code === 0) {
          // Find the downloaded file
          const files = fs.readdirSync(outputDir);
          const downloadedFile = files.find((f) => f.startsWith(`audio-${timestamp}`));

          if (!downloadedFile) {
            const error = "Downloaded file not found";
            console.error("[YouTube]", error);
            downloadQueue.updateJob(jobId, { status: "error", error, progress: 0 });
            resolve({ success: false, error });
            return;
          }

          const audioPath = `/downloads/${downloadedFile}`;
          console.log("[YouTube] Download complete:", audioPath);

          downloadQueue.updateJob(jobId, {
            status: "completed",
            progress: 100,
            audioPath,
          });

          resolve({ success: true, audioPath });
        } else {
          // Provide user-friendly error messages
          let error = stderr;
          
          if (stderr.includes("Sign in to confirm") || stderr.includes("not a bot")) {
            error = "YouTube is blocking downloads (bot protection). This video may require authentication. Try a different video or use a public video URL.";
          } else if (stderr.includes("Video unavailable")) {
            error = "Video is unavailable or private. Please try a different video.";
          } else if (stderr.includes("Unsupported URL")) {
            error = "Invalid YouTube URL. Please check the URL and try again.";
          } else {
            error = `Download failed: ${stderr.substring(0, 200)}`;
          }
          
          console.error("[YouTube]", error);
          downloadQueue.updateJob(jobId, { status: "error", error, progress: 0 });
          resolve({ success: false, error });
        }
      });

      ytdlp.on("error", (error) => {
        const errorMsg = error.message;
        console.error("[YouTube] Process error:", errorMsg);
        downloadQueue.updateJob(jobId, { status: "error", error: errorMsg, progress: 0 });
        resolve({ success: false, error: errorMsg });
      });
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : "Unknown error";
      console.error("[YouTube] Download error:", errorMsg);
      downloadQueue.updateJob(jobId, { status: "error", error: errorMsg, progress: 0 });
      resolve({ success: false, error: errorMsg });
    }
  });
}

/**
 * Clean up old downloaded files (optional - to prevent disk space issues)
 * @param maxAgeMs - Maximum age of files to keep (default: 1 hour)
 */
export async function cleanupOldDownloads(maxAgeMs: number = 60 * 60 * 1000) {
  const downloadDir = path.join(process.cwd(), "public", "downloads");
  
  if (!fs.existsSync(downloadDir)) {
    return;
  }

  const files = fs.readdirSync(downloadDir);
  const now = Date.now();

  for (const file of files) {
    const filePath = path.join(downloadDir, file);
    const stats = fs.statSync(filePath);
    const age = now - stats.mtimeMs;

    if (age > maxAgeMs) {
      fs.unlinkSync(filePath);
      console.log("[YouTube] Cleaned up old file:", file);
    }
  }
}

