import { z } from "zod";

/**
 * Shared YouTube URL validation schema
 * Used on both client and server for consistent validation
 */
export const youtubeUrlSchema = z.string().url().refine(
  (url) => {
    // Accept youtube.com and youtu.be URLs
    const youtubeRegex = /^(https?:\/\/)?(www\.)?(youtube\.com|youtu\.be)\/.+/;
    return youtubeRegex.test(url);
  },
  { message: "Must be a valid YouTube URL" }
);

/**
 * Download request schema for the POST /api/download endpoint
 */
export const downloadRequestSchema = z.object({
  url: youtubeUrlSchema,
});

/**
 * Type inference for TypeScript
 */
export type DownloadRequest = z.infer<typeof downloadRequestSchema>;

/**
 * Download response schema
 */
export interface DownloadResponse {
  jobId?: string;
  status: "ready" | "processing" | "error";
  audioUrl?: string;
  error?: string;
  details?: string;
}

