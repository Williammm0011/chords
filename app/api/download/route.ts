import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { downloadRequestSchema, type DownloadResponse } from "@/lib/validation";

/**
 * POST /api/download
 * 
 * Request body: { url: string } - Must be a valid YouTube URL
 * Response: DownloadResponse
 * 
 * Currently returns a mocked response for development.
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    
    // Validate request with shared YouTube URL schema
    const { url } = downloadRequestSchema.parse(body);

    // TODO: Implement actual download logic with yt-dlp
    // For now, return mocked response
    const mockResponse: DownloadResponse = {
      jobId: "dev-mock",
      status: "ready",
      audioUrl: "/dev-audio/sample.mp3",
    };

    return NextResponse.json(mockResponse, { status: 200 });

  } catch (error) {
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
        error: "Internal server error",
        status: "error" as const
      } as DownloadResponse,
      { status: 500 }
    );
  }
}

