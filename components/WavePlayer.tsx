"use client";

import { useEffect, useRef, useState } from "react";
import WaveSurfer from "wavesurfer.js";

interface WavePlayerProps {
  audioUrl: string;
}

export default function WavePlayer({ audioUrl }: WavePlayerProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const wavesurferRef = useRef<WaveSurfer | null>(null);
  
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Initialize WaveSurfer
  useEffect(() => {
    if (!containerRef.current) return;

    // Reset state when audioUrl changes
    setIsLoading(true);
    setError(null);
    setIsPlaying(false);
    setCurrentTime(0);
    setDuration(0);

    let isMounted = true;

    // Create WaveSurfer instance
    const wavesurfer = WaveSurfer.create({
      container: containerRef.current,
      waveColor: "#9333ea",
      progressColor: "#6366f1",
      cursorColor: "#3b82f6",
      barWidth: 2,
      barGap: 1,
      barRadius: 3,
      height: 128,
      normalize: true,
      backend: "WebAudio",
      interact: true,
    });

    wavesurferRef.current = wavesurfer;

    // Event listeners
    wavesurfer.on("ready", () => {
      if (!isMounted) return;
      setDuration(wavesurfer.getDuration());
      setIsLoading(false);
    });

    wavesurfer.on("audioprocess", () => {
      if (!isMounted) return;
      setCurrentTime(wavesurfer.getCurrentTime());
    });

    // @ts-ignore - seek event exists but may not be in types
    wavesurfer.on("seek", () => {
      if (!isMounted) return;
      setCurrentTime(wavesurfer.getCurrentTime());
    });

    wavesurfer.on("play", () => {
      if (!isMounted) return;
      setIsPlaying(true);
    });

    wavesurfer.on("pause", () => {
      if (!isMounted) return;
      setIsPlaying(false);
    });

    wavesurfer.on("finish", () => {
      if (!isMounted) return;
      setIsPlaying(false);
    });

    wavesurfer.on("error", (err) => {
      // Ignore abort errors from cleanup (happens in React Strict Mode)
      if (err instanceof Error && err.name === "AbortError") {
        return;
      }

      if (!isMounted) return;
      
      console.error("WaveSurfer error:", err);
      setError("Failed to load audio");
      setIsLoading(false);
    });

    // Load audio - catch promise rejection to prevent unhandled promise errors
    wavesurfer.load(audioUrl).catch((err) => {
      // Ignore AbortError from cleanup (happens in React Strict Mode double-mounting)
      if (err instanceof Error && err.name === "AbortError") {
        return;
      }
      // Other errors will be handled by the error event
    });

    // Cleanup
    return () => {
      isMounted = false;
      wavesurfer.destroy();
    };
  }, [audioUrl]);

  const handlePlayPause = () => {
    if (wavesurferRef.current) {
      wavesurferRef.current.playPause();
    }
  };

  const formatTime = (seconds: number): string => {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, "0")}`;
  };

  return (
    <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-xl p-8">
      <h2 className="text-2xl font-semibold mb-6 text-gray-800 dark:text-gray-100">
        Audio Player
      </h2>

      {/* Waveform Container */}
      <div className="mb-6">
        <div
          ref={containerRef}
          className="bg-gray-50 dark:bg-gray-900 rounded-lg overflow-hidden"
        />
        {isLoading && (
          <div className="flex items-center justify-center py-16">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
          </div>
        )}
        {error && (
          <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 
                        text-red-700 dark:text-red-300 px-4 py-3 rounded-lg mt-4">
            {error}
          </div>
        )}
      </div>

      {/* Controls */}
      <div className="space-y-4">
        {/* Play/Pause Button */}
        <div className="flex items-center justify-center gap-4">
          <button
            onClick={handlePlayPause}
            disabled={isLoading || !!error}
            className="flex items-center justify-center w-16 h-16 rounded-full 
                     bg-gradient-to-r from-blue-600 to-purple-600 
                     hover:from-blue-700 hover:to-purple-700
                     disabled:from-gray-400 disabled:to-gray-400
                     text-white shadow-lg hover:shadow-xl
                     transition-all duration-200 transform hover:scale-105
                     disabled:cursor-not-allowed disabled:transform-none"
          >
            {isPlaying ? (
              <svg
                xmlns="http://www.w3.org/2000/svg"
                viewBox="0 0 24 24"
                fill="currentColor"
                className="w-8 h-8"
              >
                <path
                  fillRule="evenodd"
                  d="M6.75 5.25a.75.75 0 01.75-.75H9a.75.75 0 01.75.75v13.5a.75.75 0 01-.75.75H7.5a.75.75 0 01-.75-.75V5.25zm7.5 0A.75.75 0 0115 4.5h1.5a.75.75 0 01.75.75v13.5a.75.75 0 01-.75.75H15a.75.75 0 01-.75-.75V5.25z"
                  clipRule="evenodd"
                />
              </svg>
            ) : (
              <svg
                xmlns="http://www.w3.org/2000/svg"
                viewBox="0 0 24 24"
                fill="currentColor"
                className="w-8 h-8 ml-1"
              >
                <path
                  fillRule="evenodd"
                  d="M4.5 5.653c0-1.426 1.529-2.33 2.779-1.643l11.54 6.348c1.295.712 1.295 2.573 0 3.285L7.28 19.991c-1.25.687-2.779-.217-2.779-1.643V5.653z"
                  clipRule="evenodd"
                />
              </svg>
            )}
          </button>
        </div>

        {/* Time Display */}
        <div className="flex items-center justify-between text-sm text-gray-600 dark:text-gray-400">
          <span className="font-mono">{formatTime(currentTime)}</span>
          <span className="text-gray-400 dark:text-gray-500">/</span>
          <span className="font-mono">{formatTime(duration)}</span>
        </div>

        {/* Progress Bar */}
        <div className="relative">
          <div className="h-2 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden">
            <div
              className="h-full bg-gradient-to-r from-blue-600 to-purple-600 transition-all duration-100"
              style={{ width: `${duration > 0 ? (currentTime / duration) * 100 : 0}%` }}
            />
          </div>
        </div>

        {/* Instructions */}
        <p className="text-sm text-center text-gray-500 dark:text-gray-400 mt-4">
          Click on the waveform to seek to a specific position
        </p>
      </div>
    </div>
  );
}
