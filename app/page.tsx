"use client";

import { useState, useEffect } from "react";
import { z } from "zod";
import { youtubeUrlSchema, type DownloadResponse } from "@/lib/validation";
import WavePlayer from "@/components/WavePlayer";

export default function Home() {
  const [youtubeUrl, setYoutubeUrl] = useState("");
  const [validationError, setValidationError] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const [isValid, setIsValid] = useState(false);
  const [downloadProgress, setDownloadProgress] = useState(0);
  const [downloadStatus, setDownloadStatus] = useState("");

  // Validate URL on change
  useEffect(() => {
    if (!youtubeUrl) {
      setValidationError("");
      setIsValid(false);
      return;
    }

    try {
      youtubeUrlSchema.parse(youtubeUrl);
      setValidationError("");
      setIsValid(true);
    } catch (err) {
      if (err instanceof z.ZodError) {
        setValidationError(err.errors[0].message);
      }
      setIsValid(false);
    }
  }, [youtubeUrl]);

  const pollProgress = async (jobId: string) => {
    const maxAttempts = 120; // 2 minutes max (120 * 1 second)
    let attempts = 0;

    const poll = async () => {
      try {
        const response = await fetch(`/api/download/progress?jobId=${jobId}`);
        const data = await response.json();

        if (!response.ok) {
          setError(data.error || "Failed to check progress");
          setLoading(false);
          return;
        }

        setDownloadProgress(data.progress || 0);
        setDownloadStatus(data.status);

        if (data.status === "completed" && data.audioUrl) {
          setAudioUrl(data.audioUrl);
          setLoading(false);
          setDownloadProgress(100);
          setDownloadStatus("Download complete!");
          return;
        }

        if (data.status === "error") {
          setError(data.error || "Download failed");
          setLoading(false);
          return;
        }

        // Continue polling if still downloading
        attempts++;
        if (attempts < maxAttempts && (data.status === "queued" || data.status === "downloading")) {
          setTimeout(poll, 1000); // Poll every second
        } else if (attempts >= maxAttempts) {
          setError("Download timeout - please try again");
          setLoading(false);
        }
      } catch (err) {
        console.error("Progress poll error:", err);
        setError("Failed to check download progress");
        setLoading(false);
      }
    };

    poll();
  };

  const handleFetchAudio = async () => {
    setError("");
    setLoading(true);
    setDownloadProgress(0);
    setDownloadStatus("Starting download...");
    setAudioUrl(null);

    try {
      // Validate URL (redundant but safe)
      youtubeUrlSchema.parse(youtubeUrl);

      // Call API to start download
      const response = await fetch("/api/download", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ url: youtubeUrl }),
      });

      const data: DownloadResponse = await response.json();

      if (!response.ok) {
        setError(data.error || "Failed to fetch audio");
        setLoading(false);
        return;
      }

      console.log("API Response:", data);

      // Start polling for progress
      if (data.jobId) {
        pollProgress(data.jobId);
      } else {
        setError("No job ID received");
        setLoading(false);
      }
    } catch (err) {
      if (err instanceof z.ZodError) {
        setError(err.errors[0].message);
      } else {
        setError("An error occurred while fetching audio");
      }
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100 dark:from-gray-900 dark:to-gray-800">
      <div className="container mx-auto px-4 py-12">
        <div className="max-w-4xl mx-auto">
          {/* Header */}
          <div className="text-center mb-12">
            <h1 className="text-5xl font-bold mb-4 bg-gradient-to-r from-blue-600 to-purple-600 bg-clip-text text-transparent">
              Chord Clip Looper
            </h1>
            <p className="text-lg text-gray-600 dark:text-gray-300">
              Download audio from YouTube and loop specific regions
            </p>
          </div>

          {/* Input Card */}
          <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-xl p-8 mb-8">
            <div className="space-y-6">
              <div>
                <label
                  htmlFor="youtube-url"
                  className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2"
                >
                  YouTube URL
                </label>
                <input
                  id="youtube-url"
                  type="text"
                  value={youtubeUrl}
                  onChange={(e) => setYoutubeUrl(e.target.value)}
                  placeholder="https://www.youtube.com/watch?v=..."
                  className={`w-full px-4 py-3 rounded-lg border 
                           ${validationError && youtubeUrl ? 'border-red-500 dark:border-red-500' : 'border-gray-300 dark:border-gray-600'}
                           bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100
                           focus:ring-2 focus:ring-blue-500 focus:border-transparent
                           transition-all duration-200`}
                  disabled={loading}
                />
                {validationError && youtubeUrl && (
                  <p className="mt-2 text-sm text-red-600 dark:text-red-400">
                    {validationError}
                  </p>
                )}
              </div>

              {error && (
                <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 
                              text-red-700 dark:text-red-300 px-4 py-3 rounded-lg">
                  {error}
                </div>
              )}

              {/* Progress Bar */}
              {loading && (
                <div className="space-y-2">
                  <div className="flex justify-between items-center text-sm">
                    <span className="text-gray-600 dark:text-gray-400">
                      {downloadStatus}
                    </span>
                    <span className="text-gray-600 dark:text-gray-400 font-mono">
                      {downloadProgress}%
                    </span>
                  </div>
                  <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-3 overflow-hidden">
                    <div
                      className="h-full bg-gradient-to-r from-blue-600 to-purple-600 transition-all duration-300 ease-out rounded-full"
                      style={{ width: `${downloadProgress}%` }}
                    />
                  </div>
                </div>
              )}

              <button
                onClick={handleFetchAudio}
                disabled={loading || !isValid}
                className="w-full bg-gradient-to-r from-blue-600 to-purple-600 
                         hover:from-blue-700 hover:to-purple-700
                         disabled:from-gray-400 disabled:to-gray-400
                         text-white font-semibold py-3 px-6 rounded-lg
                         transition-all duration-200 transform hover:scale-[1.02]
                         disabled:cursor-not-allowed disabled:transform-none
                         shadow-lg hover:shadow-xl"
              >
                {loading ? "Fetching..." : "Fetch Audio"}
              </button>
            </div>
          </div>

          {/* Audio Player with Waveform */}
          {audioUrl && <WavePlayer audioUrl={audioUrl} />}
        </div>
      </div>
    </div>
  );
}

