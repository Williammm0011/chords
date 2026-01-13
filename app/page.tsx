"use client";

import { useState, useEffect } from "react";
import { z } from "zod";
import { youtubeUrlSchema } from "@/lib/validation";
import WavePlayer from "@/components/WavePlayer";

export default function Home() {
  const [youtubeUrl, setYoutubeUrl] = useState("");
  const [validationError, setValidationError] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const [isValid, setIsValid] = useState(false);

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

  const handleFetchAudio = async () => {
    setError("");
    setLoading(true);
    setAudioUrl(null);

    try {
      // Validate URL (redundant but safe)
      youtubeUrlSchema.parse(youtubeUrl);

      // Call API to download
      const response = await fetch("/api/download", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ url: youtubeUrl }),
      });

      const data = await response.json();

      if (!response.ok) {
        const errorMsg = data.details || data.error || "Failed to fetch audio";
        setError(errorMsg);
        setLoading(false);
        return;
      }

      console.log("API Response:", data);

      // Set audio URL if ready
      if (data.status === "ready" && data.audioUrl) {
        setAudioUrl(data.audioUrl);
        if (data.cached) {
          console.log("✓ Loaded from cache");
        }
      } else {
        setError("Unexpected response format");
      }
    } catch (err) {
      if (err instanceof z.ZodError) {
        setError(err.errors[0].message);
      } else {
        setError("An error occurred while fetching audio");
      }
    } finally {
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
                <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg p-4">
                  <div className="flex items-start gap-2">
                    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" 
                         className="w-5 h-5 text-red-600 dark:text-red-400 flex-shrink-0 mt-0.5">
                      <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-8-5a.75.75 0 01.75.75v4.5a.75.75 0 01-1.5 0v-4.5A.75.75 0 0110 5zm0 10a1 1 0 100-2 1 1 0 000 2z" clipRule="evenodd" />
                    </svg>
                    <div>
                      <p className="text-sm font-semibold text-red-900 dark:text-red-200">
                        Error
                      </p>
                      <p className="text-sm text-red-700 dark:text-red-300 mt-1">
                        {error}
                      </p>
                    </div>
                  </div>
                </div>
              )}

              {loading && (
                <div className="flex items-center gap-3 p-4 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg">
                  <svg className="animate-spin h-5 w-5 text-blue-600 dark:text-blue-400" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                  </svg>
                  <span className="text-sm text-blue-700 dark:text-blue-300">
                    Downloading and converting audio... This may take up to 2 minutes.
                  </span>
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

