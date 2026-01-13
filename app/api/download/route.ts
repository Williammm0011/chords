import { NextRequest, NextResponse } from "next/server";
import { downloadRequestSchema } from "@/lib/validation";
import {
  generateCacheKey,
  isCached,
  getCachedFilePath,
  downloadYoutubeAudio,
  cleanupOldCache,
} from "@/lib/youtube-download";
import path from "path";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();

    // Validate the URL using Zod
    const result = downloadRequestSchema.safeParse(body);
    if (!result.success) {
      // Format Zod errors as readable strings
      const errorMessages = result.error.issues.map(issue => issue.message).join(", ");
      return NextResponse.json(
        { error: "Invalid request", details: errorMessages },
        { status: 400 }
      );
    }

    const { url } = result.data;

    // Generate cache key
    const hash = generateCacheKey(url);

    // Check if already cached
    if (isCached(hash)) {
      const cachedPath = getCachedFilePath(hash);
      if (cachedPath) {
        const fileName = path.basename(cachedPath);
        const audioUrl = `/audio-cache/${fileName}`;
        
        return NextResponse.json({
          status: "ready",
          audioUrl,
          cached: true,
        });
      }
    }

    // Clean up old files before downloading
    cleanupOldCache().catch(console.error);

    // Download the audio
    const downloadResult = await downloadYoutubeAudio(url, hash, (percent, message) => {
      // For now, we'll just log progress
      // In a real implementation, you'd use Server-Sent Events or WebSockets
      console.log(`[Download] ${percent.toFixed(1)}%: ${message}`);
    });

    if (downloadResult.success && downloadResult.filePath) {
      const fileName = path.basename(downloadResult.filePath);
      const audioUrl = `/audio-cache/${fileName}`;

      return NextResponse.json({
        status: "ready",
        audioUrl,
      });
    } else {
      return NextResponse.json(
        { 
          error: "Download failed", 
          details: downloadResult.error || "Unknown error" 
        },
        { status: 500 }
      );
    }
  } catch (error) {
    console.error("[API] Download error:", error);
    return NextResponse.json(
      { 
        error: "Server error", 
        details: error instanceof Error ? error.message : "Unknown error" 
      },
      { status: 500 }
    );
  }
}
