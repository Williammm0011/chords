import { NextRequest } from "next/server";
import { downloadQueue } from "@/lib/downloadQueue";

/**
 * GET /api/download/progress?jobId=xxx
 * 
 * Returns the current status and progress of a download job
 */
export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const jobId = searchParams.get("jobId");

  if (!jobId) {
    return new Response(
      JSON.stringify({ error: "jobId is required" }),
      { status: 400, headers: { "Content-Type": "application/json" } }
    );
  }

  const job = downloadQueue.getJob(jobId);

  if (!job) {
    return new Response(
      JSON.stringify({ error: "Job not found" }),
      { status: 404, headers: { "Content-Type": "application/json" } }
    );
  }

  return new Response(
    JSON.stringify({
      jobId: job.id,
      status: job.status,
      progress: job.progress,
      audioUrl: job.audioPath,
      error: job.error,
    }),
    {
      status: 200,
      headers: { "Content-Type": "application/json" },
    }
  );
}

