/**
 * In-memory download queue to track progress of downloads
 */

export interface DownloadJob {
  id: string;
  url: string;
  status: "queued" | "downloading" | "completed" | "error";
  progress: number; // 0-100
  audioPath?: string;
  error?: string;
  createdAt: number;
}

class DownloadQueue {
  private jobs: Map<string, DownloadJob> = new Map();

  createJob(url: string): string {
    const id = `job-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    this.jobs.set(id, {
      id,
      url,
      status: "queued",
      progress: 0,
      createdAt: Date.now(),
    });
    return id;
  }

  getJob(id: string): DownloadJob | undefined {
    return this.jobs.get(id);
  }

  updateJob(id: string, update: Partial<DownloadJob>): void {
    const job = this.jobs.get(id);
    if (job) {
      this.jobs.set(id, { ...job, ...update });
    }
  }

  deleteJob(id: string): void {
    this.jobs.delete(id);
  }

  // Clean up old jobs (older than 5 minutes)
  cleanup(): void {
    const now = Date.now();
    const maxAge = 5 * 60 * 1000; // 5 minutes

    Array.from(this.jobs.entries()).forEach(([id, job]) => {
      if (now - job.createdAt > maxAge) {
        this.jobs.delete(id);
      }
    });
  }
}

export const downloadQueue = new DownloadQueue();

