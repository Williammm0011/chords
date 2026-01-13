"use client";

import { useEffect, useRef, useState } from "react";
import WaveSurfer from "wavesurfer.js";
import RegionsPlugin from "wavesurfer.js/dist/plugins/regions.js";

interface WavePlayerProps {
  audioUrl: string;
}

interface Region {
  id: string;
  start: number;
  end: number;
}

export default function WavePlayer({ audioUrl }: WavePlayerProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const wavesurferRef = useRef<WaveSurfer | null>(null);
  const regionsPluginRef = useRef<RegionsPlugin | null>(null);
  const loopIntervalRef = useRef<NodeJS.Timeout | null>(null);
  
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [currentRegion, setCurrentRegion] = useState<Region | null>(null);
  const [isLooping, setIsLooping] = useState(false);

  // Use refs to store latest state for the interval (avoid stale closure)
  const currentRegionRef = useRef<Region | null>(null);
  const isLoopingRef = useRef(false);

  // Keep refs in sync with state
  useEffect(() => {
    currentRegionRef.current = currentRegion;
  }, [currentRegion]);

  useEffect(() => {
    isLoopingRef.current = isLooping;
  }, [isLooping]);

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

    // Initialize Regions Plugin
    const regions = wavesurfer.registerPlugin(RegionsPlugin.create());
    regionsPluginRef.current = regions;

    // Region event handlers
    regions.on("region-created", (region: any) => {
      // Remove other regions (only allow one)
      const allRegions = regions.getRegions();
      allRegions.forEach((r: any) => {
        if (r.id !== region.id) {
          r.remove();
        }
      });

      setCurrentRegion({
        id: region.id,
        start: region.start,
        end: region.end,
      });
    });

    regions.on("region-updated", (region: any) => {
      setCurrentRegion({
        id: region.id,
        start: region.start,
        end: region.end,
      });
    });

    regions.on("region-removed", () => {
      setCurrentRegion(null);
      setIsLooping(false);
    });

    // Enable drag selection to create regions
    regions.enableDragSelection({
      color: "rgba(99, 102, 241, 0.3)",
    });

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
      
      // If looping and region exists, restart from region start
      if (isLoopingRef.current && currentRegionRef.current) {
        wavesurfer.setTime(currentRegionRef.current.start);
        wavesurfer.play();
      } else {
        setIsPlaying(false);
      }
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

  const handleToggleLoop = () => {
    if (!currentRegion) return;
    setIsLooping(!isLooping);
  };

  const handleClearRegion = () => {
    if (regionsPluginRef.current) {
      regionsPluginRef.current.clearRegions();
      setCurrentRegion(null);
      setIsLooping(false);
    }
  };

  const formatTime = (seconds: number): string => {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, "0")}`;
  };

  // Loop monitoring effect
  useEffect(() => {
    // Clear any existing interval first
    if (loopIntervalRef.current) {
      clearInterval(loopIntervalRef.current);
      loopIntervalRef.current = null;
    }

    // Only start monitoring if all conditions are met
    if (!isPlaying || !isLooping || !currentRegion) {
      return;
    }
    
    // Start loop monitoring
    loopIntervalRef.current = setInterval(() => {
      if (!wavesurferRef.current) return;
      if (!isLoopingRef.current || !currentRegionRef.current) return;

      const time = wavesurferRef.current.getCurrentTime();
      
      // If we've passed the region end, loop back to start
      if (time >= currentRegionRef.current.end) {
        wavesurferRef.current.setTime(currentRegionRef.current.start);
      }
    }, 50); // Check every 50ms

    // Cleanup
    return () => {
      if (loopIntervalRef.current) {
        clearInterval(loopIntervalRef.current);
        loopIntervalRef.current = null;
      }
    };
  }, [isPlaying, isLooping, currentRegion?.id]); // Use region ID instead of full object

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Ignore if typing in an input
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) {
        return;
      }

      switch (e.key) {
        case " ": // Space - play/pause
          e.preventDefault();
          handlePlayPause();
          break;
        case "l":
        case "L": // L - toggle loop
          e.preventDefault();
          if (currentRegion) {
            handleToggleLoop();
          }
          break;
        case "Escape": // Esc - clear region
          e.preventDefault();
          handleClearRegion();
          break;
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [currentRegion, isLooping]); // Re-attach when these change

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

        {/* Region Controls */}
        {currentRegion && (
          <div className="space-y-4 pt-4 border-t border-gray-200 dark:border-gray-700">
            <h3 className="text-lg font-semibold text-gray-800 dark:text-gray-100">
              Loop Region
            </h3>
            
            {/* Region Timestamps */}
            <div className="flex items-center justify-between text-sm bg-gray-50 dark:bg-gray-900 p-4 rounded-lg">
              <div>
                <span className="text-gray-500 dark:text-gray-400">Start:</span>
                <span className="ml-2 font-mono text-gray-900 dark:text-gray-100">
                  {formatTime(currentRegion.start)}
                </span>
              </div>
              <div className="text-gray-400 dark:text-gray-500">→</div>
              <div>
                <span className="text-gray-500 dark:text-gray-400">End:</span>
                <span className="ml-2 font-mono text-gray-900 dark:text-gray-100">
                  {formatTime(currentRegion.end)}
                </span>
              </div>
              <div>
                <span className="text-gray-500 dark:text-gray-400">Duration:</span>
                <span className="ml-2 font-mono text-gray-900 dark:text-gray-100">
                  {formatTime(currentRegion.end - currentRegion.start)}
                </span>
              </div>
            </div>

            {/* Loop and Clear Buttons */}
            <div className="flex gap-3">
              <button
                onClick={handleToggleLoop}
                className={`flex-1 flex items-center justify-center gap-2 py-3 px-4 rounded-lg font-semibold
                  transition-all duration-200 transform hover:scale-[1.02]
                  ${isLooping 
                    ? 'bg-gradient-to-r from-green-600 to-emerald-600 hover:from-green-700 hover:to-emerald-700 text-white shadow-lg' 
                    : 'bg-gray-200 dark:bg-gray-700 hover:bg-gray-300 dark:hover:bg-gray-600 text-gray-800 dark:text-gray-100'
                  }`}
              >
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="w-5 h-5">
                  <path d="M5.055 7.06C3.805 6.347 2.25 7.25 2.25 8.69v8.122c0 1.44 1.555 2.343 2.805 1.628l7.108-4.061c1.26-.72 1.26-2.536 0-3.256L5.055 7.061zM12.75 8.69c0-1.44 1.555-2.343 2.805-1.628l7.108 4.061c1.26.72 1.26 2.536 0 3.256l-7.108 4.061c-1.25.714-2.805-.189-2.805-1.628V8.69z" />
                </svg>
                {isLooping ? "Loop ON" : "Loop OFF"}
                <span className="text-xs opacity-75">(L)</span>
              </button>
              
              <button
                onClick={handleClearRegion}
                className="px-6 py-3 rounded-lg font-semibold
                  bg-red-600 hover:bg-red-700 text-white
                  transition-all duration-200 transform hover:scale-[1.02]
                  shadow-lg hover:shadow-xl flex items-center gap-2"
              >
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="w-5 h-5">
                  <path fillRule="evenodd" d="M16.5 4.478v.227a48.816 48.816 0 013.878.512.75.75 0 11-.256 1.478l-.209-.035-1.005 13.07a3 3 0 01-2.991 2.77H8.084a3 3 0 01-2.991-2.77L4.087 6.66l-.209.035a.75.75 0 01-.256-1.478A48.567 48.567 0 017.5 4.705v-.227c0-1.564 1.213-2.9 2.816-2.951a52.662 52.662 0 013.369 0c1.603.051 2.815 1.387 2.815 2.951zm-6.136-1.452a51.196 51.196 0 013.273 0C14.39 3.05 15 3.684 15 4.478v.113a49.488 49.488 0 00-6 0v-.113c0-.794.609-1.428 1.364-1.452zm-.355 5.945a.75.75 0 10-1.5.058l.347 9a.75.75 0 101.499-.058l-.346-9zm5.48.058a.75.75 0 10-1.498-.058l-.347 9a.75.75 0 001.5.058l.345-9z" clipRule="evenodd" />
                </svg>
                Clear
                <span className="text-xs opacity-75">(Esc)</span>
              </button>
            </div>
          </div>
        )}

        {/* Instructions */}
        <p className="text-sm text-center text-gray-500 dark:text-gray-400 mt-4">
          {!currentRegion 
            ? "Drag on the waveform to create a loop region" 
            : "Adjust region by dragging edges • Space: play/pause • L: toggle loop • Esc: clear"
          }
        </p>
      </div>
    </div>
  );
}
