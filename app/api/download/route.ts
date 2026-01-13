import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { downloadRequestSchema, type DownloadResponse } from "@/lib/validation";
import { downloadYoutubeAudio, cleanupOldDownloads } from "@/lib/youtube";
import { downloadQueue } from "@/lib/downloadQueue";

/**
 * POST /api/download
 * 
 * Request body: { url: string } - Must be a valid YouTube URL
 * Response: DownloadResponse with jobId
 * 
 * Creates a download job and starts downloading in the background.
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    
    // Validate request with shared YouTube URL schema
    const { url } = downloadRequestSchema.parse(body);

    console.log("[API] Starting download for URL:", url);

    // Clean up old files and jobs
    cleanupOldDownloads(60 * 60 * 1000).catch(err => 
      console.error("[API] Cleanup error:", err)
    );
    downloadQueue.cleanup();

    // Create a job and return immediately
    const jobId = downloadQueue.createJob(url);

    // Start download in background (don't await)
    downloadYoutubeAudio(url, jobId).catch(err => {
      console.error("[API] Background download error:", err);
    });

    const response: DownloadResponse = {
      jobId,
      status: "processing",
    };

    console.log("[API] Job created:", jobId);
    return NextResponse.json(response, { status: 200 });

  } catch (error) {
    console.error("[API] Error:", error);
    
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { 
          error: "Invalid YouTube URL", 
          details: error.errors[0].message 
        } as DownloadResponse,
        { status: 400 }
      );
    }

    return NextResponse.json(
      { 
        error: error instanceof Error ? error.message : "Internal server error",
        status: "error" as const
      } as DownloadResponse,
      { status: 500 }
    );
  }
}

