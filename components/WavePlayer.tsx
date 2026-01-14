"use client";

import { useEffect, useRef, useState } from "react";
import WaveSurfer from "wavesurfer.js";
import RegionsPlugin from "wavesurfer.js/dist/plugins/regions.js";

/**
 * CHORD CLIP LOOPER - User Guide
 * ==============================
 * 
 * BASIC PLAYBACK:
 * - Click waveform to seek to any position
 * - Press Space or click play button to play/pause
 * - Time display shows current time / total duration
 * - Use zoom slider or +/− buttons to zoom in/out for precise editing
 * 
 * CREATING A LOOP REGION:
 * - Click and drag on waveform to select a region
 * - Click edges of existing region and drag to adjust
 * - The playback will automatically loop within the selected region
 * - When a region is created, playback will jump to the region start
 * 
 * REGION CONTROLS:
 * - "Replay" button: Jump back to region start and play
 * - "Clear" button: Remove the region selection
 * 
 * KEYBOARD SHORTCUTS:
 * - Space: Play/Pause
 * - ← / →: Skip backward/forward 5 seconds
 * - + / =: Zoom in (×1.3, starts at 5px/second)
 * - -: Zoom out (÷1.3)
 * - Esc: Clear region selection
 * - ? / H: Show keyboard shortcuts help
 * 
 * CHORD NOTATION:
 * - Set BPM (beats per minute) to match the song tempo
 * - Set time signature (default 4 for 4/4 time)
 * - Adjust Offset (in seconds) to align bars with the music
 * - Click on any bar in the note track to add chord names
 * - Press Enter or Esc to finish editing a note
 * - Notes are automatically positioned at each bar line
 * 
 * PRACTICE WORKFLOW:
 * 1. Load your YouTube video
 * 2. Set BPM and time signature to match the song
 * 3. Adjust offset so bar lines align with the music
 * 4. Add chord names in the note track
 * 5. Click and drag on the waveform to select a section to practice
 * 6. The audio will automatically loop that section
 * 7. Use "Replay" to restart from the beginning of the region
 * 8. Press Esc to clear and select a new region
 * 
 * TIPS:
 * - Shorter loops (2-5 seconds) work best for practice
 * - Zoom in for precise region selection and chord placement
 * - Use skip buttons for quick navigation
 * - The looping is seamless with no gaps
 * - Press ? or H to see all keyboard shortcuts
 */

interface WavePlayerProps {
  audioUrl: string;
  showHelp?: boolean;
  onHelpClose?: () => void;
}

interface Region {
  id: string;
  start: number;
  end: number;
}

export default function WavePlayer({ audioUrl, showHelp: externalShowHelp, onHelpClose }: WavePlayerProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const wavesurferRef = useRef<WaveSurfer | null>(null);
  const regionsPluginRef = useRef<RegionsPlugin | null>(null);
  const loopIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const progressBarRef = useRef<HTMLDivElement>(null);
  const noteTrackRef = useRef<HTMLDivElement>(null);
  const autoScrollTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const isAutoScrollingRef = useRef<boolean>(false); // Flag to prevent scroll event from disabling autoscroll
  const isSyncingScrollRef = useRef<boolean>(false); // Flag to prevent infinite scroll sync loops
  
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [currentRegion, setCurrentRegion] = useState<Region | null>(null);
  const [zoomLevel, setZoomLevel] = useState(27); // 0 = fit, 5-500 = px per second (default 27)
  const [internalShowHelp, setInternalShowHelp] = useState(false);
  const [isDraggingProgress, setIsDraggingProgress] = useState(false);
  const [dragProgressPercent, setDragProgressPercent] = useState(0);
  const [notes, setNotes] = useState<Record<number, string>>({}); // Notes by timestamp (seconds)
  const [autoScroll, setAutoScroll] = useState(true); // Enable/disable autoscroll
  const [isTypingNote, setIsTypingNote] = useState(false); // Track if user is typing
  const [bpm, setBpm] = useState(120); // Beats per minute
  const [beatsPerBar, setBeatsPerBar] = useState(4); // Time signature / beats per bar
  const [offset, setOffset] = useState(0); // Offset in seconds to align with music
  
  // Use external control if provided, otherwise use internal state
  const showHelp = externalShowHelp !== undefined ? externalShowHelp : internalShowHelp;
  const handleHelpClose = () => {
    if (onHelpClose) {
      onHelpClose();
    } else {
      setInternalShowHelp(false);
    }
  };
  const handleHelpOpen = () => {
    if (externalShowHelp !== undefined && onHelpClose) {
      // If externally controlled, we can't open it directly, but we shouldn't be here
      // This is for keyboard shortcuts - they should work
      setInternalShowHelp(true);
    } else {
      setInternalShowHelp(true);
    }
  };

  // Use refs to store latest state for the interval (avoid stale closure)
  const currentRegionRef = useRef<Region | null>(null);

  // Keep refs in sync with state
  useEffect(() => {
    currentRegionRef.current = currentRegion;
  }, [currentRegion]);

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
      cursorWidth: 2, // Thin playhead line
      barWidth: 2,
      barGap: 1,
      barRadius: 3,
      height: 250, // Fixed height, won't change with zoom
      normalize: false, // Keep bar heights consistent regardless of zoom level
      barHeight: 0.85,
      backend: "WebAudio",
      interact: true,
      autoScroll: true, // Auto-scroll horizontally during playback when zoomed
      autoCenter: true, // Keep playhead centered when zoomed
    });

    wavesurferRef.current = wavesurfer;

    // Initialize Regions Plugin
    const regions = wavesurfer.registerPlugin(RegionsPlugin.create());
    regionsPluginRef.current = regions;

    // Region event handlers
    regions.on("region-created", (region: any) => {
      // Disable dragging the region (moving it), but keep resize enabled
      region.setOptions({ drag: false });

      // Remove other regions (only allow one)
      const allRegions = regions.getRegions();
      allRegions.forEach((r: any) => {
        if (r.id !== region.id) {
          r.remove();
        }
      });

      // Handle mousedown inside region: clear it to allow new selection
      // This enables dragging inside a region to create a new one
      region.element.addEventListener("mousedown", (e: MouseEvent) => {
        const target = e.target as HTMLElement;
        
        // Check if clicking on resize handles (edges)
        // Resize handles have specific classes or cursor styles
        const isResizeHandle = target.classList.contains('wavesurfer-handle') ||
                               target.classList.contains('wavesurfer-region-handle') ||
                               target.dataset.resize !== undefined;
        
        if (!isResizeHandle) {
          // Clicking/dragging inside region content - remove it to allow new selection
          region.remove();
        }
      });

      setCurrentRegion({
        id: region.id,
        start: region.start,
        end: region.end,
      });

      // Auto-seek to region start if current position is not within region
      const currentTime = wavesurfer.getCurrentTime();
      if (currentTime < region.start || currentTime > region.end) {
        wavesurfer.setTime(region.start);
      }
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
      
      // Apply the initial zoom level
      if (zoomLevel > 0) {
        wavesurfer.zoom(zoomLevel);
      }
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
      
      // If region exists, restart from region start
      if (currentRegionRef.current) {
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

  const handleZoomChange = (newZoom: number) => {
    setZoomLevel(newZoom);
    if (wavesurferRef.current) {
      wavesurferRef.current.zoom(newZoom);
    }
  };

  const handleZoomIn = () => {
    let newZoom: number;
    if (zoomLevel === 0) {
      // From Fit to first zoom level
      newZoom = 5;
    } else {
      // Multiply by 1.3
      newZoom = Math.min(500, Math.round(zoomLevel * 1.3));
    }
    handleZoomChange(newZoom);
  };

  const handleZoomOut = () => {
    if (zoomLevel === 0) return;
    
    let newZoom: number;
    // Divide by 1.3
    newZoom = Math.round(zoomLevel / 1.3);
    
    // If less than 5, go back to Fit
    if (newZoom < 5) {
      newZoom = 0;
    }
    
    handleZoomChange(newZoom);
  };

  const handleClearRegion = () => {
    if (regionsPluginRef.current) {
      regionsPluginRef.current.clearRegions();
      setCurrentRegion(null);
    }
  };

  const handleReplay = () => {
    if (!wavesurferRef.current) return;
    
    if (currentRegion) {
      // If region exists, replay from region start
      wavesurferRef.current.setTime(currentRegion.start);
    } else {
      // If no region, restart from beginning
      wavesurferRef.current.setTime(0);
    }
    wavesurferRef.current.play();
  };

  const handleSkipBackward = () => {
    if (!wavesurferRef.current) return;
    const current = wavesurferRef.current.getCurrentTime();
    const newTime = Math.max(0, current - 5);
    wavesurferRef.current.setTime(newTime);
  };

  const handleSkipForward = () => {
    if (!wavesurferRef.current) return;
    const current = wavesurferRef.current.getCurrentTime();
    const total = wavesurferRef.current.getDuration();
    const newTime = Math.min(total, current + 5);
    wavesurferRef.current.setTime(newTime);
  };

  const handleProgressBarClick = (e: React.MouseEvent<HTMLDivElement>) => {
    // Don't handle click if we're dragging
    if (isDraggingProgress) return;
    
    if (!wavesurferRef.current || !duration) return;
    
    const rect = e.currentTarget.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const percentage = x / rect.width;
    const newTime = percentage * duration;
    
    wavesurferRef.current.setTime(newTime);
  };

  const handleProgressBarMouseDown = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!progressBarRef.current || !duration) return;
    
    setIsDraggingProgress(true);
    
    // Calculate initial position
    const rect = progressBarRef.current.getBoundingClientRect();
    const x = Math.max(0, Math.min(e.clientX - rect.left, rect.width));
    const percentage = (x / rect.width) * 100;
    setDragProgressPercent(percentage);
  };

  const formatTime = (seconds: number): string => {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, "0")}`;
  };

  const handleNoteChange = (timestamp: number, value: string) => {
    setNotes(prev => ({
      ...prev,
      [timestamp]: value
    }));
  };

  // Generate note timestamps for each bar based on BPM and time signature
  const getNoteTimestamps = (): number[] => {
    if (!duration || bpm <= 0 || beatsPerBar <= 0) return [];
    
    const secondsPerBeat = 60 / bpm;
    const secondsPerBar = secondsPerBeat * beatsPerBar;
    
    const timestamps: number[] = [];
    let barTime = offset;
    
    // Generate timestamps for each bar
    while (barTime <= duration) {
      if (barTime >= 0) {
        // Round to 3 decimal places to avoid floating point precision issues
        timestamps.push(Math.round(barTime * 1000) / 1000);
      }
      barTime += secondsPerBar;
    }
    
    return timestamps;
  };
  
  // Get bar width in seconds
  const getBarWidth = (): number => {
    if (bpm <= 0 || beatsPerBar <= 0) return 1;
    const secondsPerBeat = 60 / bpm;
    return secondsPerBeat * beatsPerBar;
  };
  
  // Get the currently playing bar timestamp
  const getCurrentBarTimestamp = (): number | null => {
    if (!duration || bpm <= 0 || beatsPerBar <= 0) return null;
    
    const barWidth = getBarWidth();
    const timestamps = getNoteTimestamps();
    
    // Find which bar the current time falls into
    for (let i = 0; i < timestamps.length; i++) {
      const barStart = timestamps[i];
      const barEnd = barStart + barWidth;
      
      if (currentTime >= barStart && currentTime < barEnd) {
        return barStart;
      }
    }
    
    return null;
  };

  // Loop monitoring effect
  useEffect(() => {
    // Clear any existing interval first
    if (loopIntervalRef.current) {
      clearInterval(loopIntervalRef.current);
      loopIntervalRef.current = null;
    }

    // Only start monitoring if playing and region exists
    if (!isPlaying || !currentRegion) {
      return;
    }
    
    // Start loop monitoring
    loopIntervalRef.current = setInterval(() => {
      if (!wavesurferRef.current) return;
      if (!currentRegionRef.current) return;

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
  }, [isPlaying, currentRegion?.id]); // Use region ID instead of full object

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
        case "Escape": // Esc - clear region
          e.preventDefault();
          handleClearRegion();
          break;
        case "ArrowLeft": // Left arrow - skip backward 5s
          e.preventDefault();
          handleSkipBackward();
          break;
        case "ArrowRight": // Right arrow - skip forward 5s
          e.preventDefault();
          handleSkipForward();
          break;
        case "-": // Minus - zoom out
        case "_": // Underscore (shift + minus on some keyboards)
          e.preventDefault();
          handleZoomOut();
          break;
        case "=": // Equals - zoom in (same key as + without shift)
        case "+": // Plus (shift + equals)
          e.preventDefault();
          handleZoomIn();
          break;
        case "?": // Question mark - show help
        case "h": // H - show help
        case "H": // Shift + H
          e.preventDefault();
          handleHelpOpen();
          break;
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [currentRegion, zoomLevel]); // Re-attach when region or zoom changes

  // Pause playback when tab is not visible
  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.hidden && wavesurferRef.current && isPlaying) {
        wavesurferRef.current.pause();
      }
    };

    document.addEventListener("visibilitychange", handleVisibilityChange);
    return () => document.removeEventListener("visibilitychange", handleVisibilityChange);
  }, [isPlaying]);

  // Handle progress bar dragging
  useEffect(() => {
    if (!isDraggingProgress) return;

    const handleMouseMove = (e: MouseEvent) => {
      if (!progressBarRef.current) return;
      
      const rect = progressBarRef.current.getBoundingClientRect();
      const x = Math.max(0, Math.min(e.clientX - rect.left, rect.width));
      const percentage = (x / rect.width) * 100;
      setDragProgressPercent(percentage);
    };

    const handleMouseUp = () => {
      if (!wavesurferRef.current || !duration) {
        setIsDraggingProgress(false);
        return;
      }
      
      // Seek to the dragged position
      const newTime = (dragProgressPercent / 100) * duration;
      wavesurferRef.current.setTime(newTime);
      setIsDraggingProgress(false);
    };

    window.addEventListener("mousemove", handleMouseMove);
    window.addEventListener("mouseup", handleMouseUp);

    return () => {
      window.removeEventListener("mousemove", handleMouseMove);
      window.removeEventListener("mouseup", handleMouseUp);
    };
  }, [isDraggingProgress, dragProgressPercent, duration]);

  // Ensure containers stay synced when zoom level changes
  useEffect(() => {
    if (!containerRef.current || !noteTrackRef.current) return;
    
    // Sync scroll positions after zoom changes
    const syncScroll = () => {
      if (containerRef.current && noteTrackRef.current) {
        // Use waveform as source of truth
        noteTrackRef.current.scrollLeft = containerRef.current.scrollLeft;
      }
    };
    
    // Small delay to allow wavesurfer to update
    const timeoutId = setTimeout(syncScroll, 50);
    
    return () => clearTimeout(timeoutId);
  }, [zoomLevel]);

  // Smooth autoscroll waveform and note track during playback
  useEffect(() => {
    if (!isPlaying || !autoScroll || zoomLevel === 0 || isTypingNote) return;
    if (!duration) return;

    // Set flag to indicate autoscroll is active
    isAutoScrollingRef.current = true;
    
    let animationFrameId: number;
    
    const updateScroll = () => {
      if (!containerRef.current || !noteTrackRef.current) {
        animationFrameId = requestAnimationFrame(updateScroll);
        return;
      }
      if (!wavesurferRef.current) {
        animationFrameId = requestAnimationFrame(updateScroll);
        return;
      }

      // Get current playback time
      const currentPlayTime = wavesurferRef.current.getCurrentTime();
      
      // Calculate the playhead position in pixels
      const playheadPosition = (currentPlayTime / duration) * duration * zoomLevel;
      
      // Get the container width (viewport)
      const containerWidth = containerRef.current.clientWidth;
      
      // Center the playhead in the viewport
      const targetScrollLeft = Math.max(0, playheadPosition - containerWidth / 2);
      
      // Scroll both containers atomically
      isSyncingScrollRef.current = true;
      containerRef.current.scrollLeft = targetScrollLeft;
      noteTrackRef.current.scrollLeft = targetScrollLeft;
      isSyncingScrollRef.current = false;
      
      // Continue animation loop
      animationFrameId = requestAnimationFrame(updateScroll);
    };
    
    // Start the animation loop
    animationFrameId = requestAnimationFrame(updateScroll);

    return () => {
      if (animationFrameId) {
        cancelAnimationFrame(animationFrameId);
      }
      isAutoScrollingRef.current = false;
    };
  }, [isPlaying, autoScroll, zoomLevel, duration, isTypingNote]);

  // Disable autoscroll temporarily when user manually scrolls
  const handleManualScroll = () => {
    // Don't disable autoscroll if it's the autoscroll itself that's scrolling
    if (isAutoScrollingRef.current) return;
    
    setAutoScroll(false);
    
    // Clear any existing timeout
    if (autoScrollTimeoutRef.current) {
      clearTimeout(autoScrollTimeoutRef.current);
    }
    
    // Re-enable autoscroll after 3 seconds of no scrolling
    autoScrollTimeoutRef.current = setTimeout(() => {
      setAutoScroll(true);
    }, 3000);
  };

  return (
    <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-xl p-8 relative">
      {/* Header */}
      <h2 className="text-2xl font-semibold mb-6 text-gray-800 dark:text-gray-100">
        Audio Player
      </h2>

      {/* Waveform Container */}
      <div className="mb-2">
        <div
          ref={containerRef}
          className="bg-gray-50 dark:bg-gray-900 rounded-lg p-1 hide-scrollbar"
          style={{ 
            height: '258px', // Fixed height: 250px waveform + 8px padding (4px top + 4px bottom)
            minHeight: '258px',
            maxHeight: '258px',
            overflowX: 'auto', // Allow horizontal scroll when zoomed
            overflowY: 'hidden' // Prevent vertical scroll
          }}
          onScroll={(e) => {
            // Skip if autoscrolling or already syncing
            if (isAutoScrollingRef.current || isSyncingScrollRef.current) return;
            
            // Set flag to prevent infinite loop
            isSyncingScrollRef.current = true;
            
            // Sync note track scroll with waveform scroll
            if (noteTrackRef.current) {
              noteTrackRef.current.scrollLeft = e.currentTarget.scrollLeft;
            }
            
            // Disable autoscroll when user manually scrolls
            handleManualScroll();
            
            // Reset flag after a short delay
            setTimeout(() => {
              isSyncingScrollRef.current = false;
            }, 0);
          }}
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

      {/* Music Timing Controls */}
      {duration > 0 && !isLoading && !error && (
        <div className="mb-4 flex items-center gap-4 text-sm">
          <div className="flex items-center gap-2">
            <label htmlFor="bpm" className="text-gray-700 dark:text-gray-300 font-medium">
              BPM:
            </label>
            <input
              id="bpm"
              type="number"
              min="1"
              max="300"
              value={bpm}
              onChange={(e) => setBpm(Math.max(1, parseInt(e.target.value) || 1))}
              className="w-16 px-2 py-1 rounded border border-gray-300 dark:border-gray-600
                       bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100
                       focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
          </div>
          
          <div className="flex items-center gap-2">
            <label htmlFor="beatsPerBar" className="text-gray-700 dark:text-gray-300 font-medium flex items-center" title="Time Signature (拍號)">
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="w-5 h-5">
                <path fillRule="evenodd" d="M19.952 1.651a.75.75 0 01.298.599V16.303a3 3 0 01-2.176 2.884l-1.32.377a2.553 2.553 0 11-1.403-4.909l2.311-.66a1.5 1.5 0 001.088-1.442V6.994l-9 2.572v9.737a3 3 0 01-2.176 2.884l-1.32.377a2.553 2.553 0 11-1.403-4.909l2.311-.66a1.5 1.5 0 001.088-1.442V3.893a.75.75 0 01.576-.73l11.25-2.662a.75.75 0 01.625.15z" clipRule="evenodd" />
              </svg>
            </label>
            <input
              id="beatsPerBar"
              type="number"
              min="1"
              max="16"
              value={beatsPerBar}
              onChange={(e) => setBeatsPerBar(Math.max(1, parseInt(e.target.value) || 1))}
              className="w-12 px-2 py-1 rounded border border-gray-300 dark:border-gray-600
                       bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100
                       focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
            <span className="text-gray-500 dark:text-gray-400">/4</span>
          </div>
          
          <div className="flex items-center gap-2">
            <label htmlFor="offset" className="text-gray-700 dark:text-gray-300 font-medium">
              Offset:
            </label>
            <input
              id="offset"
              type="number"
              step="0.1"
              value={offset}
              onChange={(e) => setOffset(parseFloat(e.target.value) || 0)}
              className="w-20 px-2 py-1 rounded border border-gray-300 dark:border-gray-600
                       bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100
                       focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
            <span className="text-gray-500 dark:text-gray-400">sec</span>
          </div>
          
          <div className="text-xs text-gray-500 dark:text-gray-400 ml-auto">
            Bar length: {getBarWidth().toFixed(2)}s
          </div>
        </div>
      )}

      {/* Horizontal Note Track */}
      {duration > 0 && !isLoading && !error && (
        <div className="mb-6">
          <div
            ref={noteTrackRef}
            className="bg-gray-50 dark:bg-gray-900 rounded-lg p-2 overflow-x-auto overflow-y-hidden hide-scrollbar"
            style={{
              height: '80px',
              minHeight: '80px',
              maxHeight: '80px',
            }}
            onScroll={(e) => {
              // Skip if autoscrolling or already syncing
              if (isAutoScrollingRef.current || isSyncingScrollRef.current) return;
              
              // Set flag to prevent infinite loop
              isSyncingScrollRef.current = true;
              
              // Sync waveform scroll with note track scroll
              if (containerRef.current) {
                containerRef.current.scrollLeft = e.currentTarget.scrollLeft;
              }
              
              // Disable autoscroll when user manually scrolls
              handleManualScroll();
              
              // Reset flag after a short delay
              setTimeout(() => {
                isSyncingScrollRef.current = false;
              }, 0);
            }}
          >
            <div
              className="relative h-full"
              style={{
                width: zoomLevel > 0 ? `${duration * zoomLevel}px` : '100%',
                minWidth: '100%'
              }}
            >
              {/* Current bar background highlight */}
              {getNoteTimestamps().map(timestamp => {
                const isCurrentBar = getCurrentBarTimestamp() === timestamp;
                const barWidth = getBarWidth();
                if (!isCurrentBar) return null;
                
                return (
                  <div
                    key={`highlight-${timestamp}`}
                    className="absolute top-0 bottom-0 bg-blue-100/30 dark:bg-blue-900/20 pointer-events-none transition-all duration-200"
                    style={{
                      left: zoomLevel > 0 
                        ? `${(timestamp / duration) * duration * zoomLevel}px`
                        : `${(timestamp / duration) * 100}%`,
                      width: zoomLevel > 0 
                        ? `${barWidth * zoomLevel}px`
                        : `${(barWidth / duration) * 100}%`
                    }}
                  />
                );
              })}
              
              {/* Background grid lines for each bar */}
              {getNoteTimestamps().map(timestamp => {
                const isCurrentBar = getCurrentBarTimestamp() === timestamp;
                return (
                  <div
                    key={`grid-${timestamp}`}
                    className={`absolute top-0 bottom-0 transition-all duration-200 ${
                      isCurrentBar 
                        ? 'w-0.5 bg-blue-500 dark:bg-blue-400 z-10' 
                        : 'w-px bg-gray-300 dark:bg-gray-700'
                    }`}
                    style={{
                      left: zoomLevel > 0 
                        ? `${(timestamp / duration) * duration * zoomLevel}px`
                        : `${(timestamp / duration) * 100}%`
                    }}
                  >
                    <div className={`text-xs font-mono mt-1 ml-1 ${
                      isCurrentBar 
                        ? 'text-blue-600 dark:text-blue-300 font-semibold' 
                        : 'text-gray-500 dark:text-gray-400'
                    }`}>
                      {formatTime(timestamp)}
                    </div>
                  </div>
                );
              })}

              {/* Note inputs at each bar */}
              {getNoteTimestamps().map(timestamp => {
                const hasContent = notes[timestamp]?.trim().length > 0;
                const barWidth = getBarWidth();
                
                return (
                  <div
                    key={`note-${timestamp}`}
                    className="absolute top-6"
                    style={{
                      left: zoomLevel > 0 
                        ? `${(timestamp / duration) * duration * zoomLevel}px`
                        : `${(timestamp / duration) * 100}%`,
                      width: zoomLevel > 0 
                        ? `${barWidth * zoomLevel}px` // Bar width in pixels
                        : `${(barWidth / duration) * 100}%`,
                      minWidth: '60px'
                    }}
                  >
                    <input
                      type="text"
                      value={notes[timestamp] || ''}
                      onChange={(e) => handleNoteChange(timestamp, e.target.value)}
                      onFocus={(e) => {
                        setIsTypingNote(true);
                        // Show border when focused
                        e.currentTarget.classList.remove('border-transparent', 'bg-transparent');
                        e.currentTarget.classList.add('border-gray-300', 'dark:border-gray-600', 'bg-white', 'dark:bg-gray-800');
                      }}
                      onBlur={(e) => {
                        setIsTypingNote(false);
                        // Hide border if empty
                        if (!notes[timestamp]?.trim()) {
                          e.currentTarget.classList.remove('border-gray-300', 'dark:border-gray-600', 'bg-white', 'dark:bg-gray-800');
                          e.currentTarget.classList.add('border-transparent', 'bg-transparent');
                        }
                      }}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' || e.key === 'Escape') {
                          e.currentTarget.blur();
                        }
                      }}
                      placeholder=""
                      data-timestamp={timestamp}
                      className={`w-full px-2 py-1 text-sm rounded text-gray-900 dark:text-gray-100 
                               focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-colors
                               ${hasContent 
                                 ? 'border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800' 
                                 : 'border border-transparent bg-transparent cursor-text'}`}
                    />
                  </div>
                );
              })}

            </div>
          </div>
        </div>
      )}

      {/* Controls */}
      <div className="space-y-4">
        {/* Playback Controls */}
        <div className="flex items-center justify-center gap-3">
          {/* Replay Button */}
          <button
            onClick={handleReplay}
            disabled={isLoading || !!error}
            className="flex items-center justify-center w-12 h-12 rounded-full 
                     bg-gray-200 dark:bg-gray-700 
                     hover:bg-gray-300 dark:hover:bg-gray-600
                     disabled:opacity-50 disabled:cursor-not-allowed
                     text-gray-700 dark:text-gray-200
                     transition-all duration-200 transform hover:scale-105"
            title={currentRegion ? "Replay from region start" : "Replay from beginning"}
          >
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="w-6 h-6">
              <path fillRule="evenodd" d="M4.755 10.059a7.5 7.5 0 0112.548-3.364l1.903 1.903h-3.183a.75.75 0 100 1.5h4.992a.75.75 0 00.75-.75V4.356a.75.75 0 00-1.5 0v3.18l-1.9-1.9A9 9 0 003.306 9.67a.75.75 0 101.45.388zm15.408 3.352a.75.75 0 00-.919.53 7.5 7.5 0 01-12.548 3.364l-1.902-1.903h3.183a.75.75 0 000-1.5H2.984a.75.75 0 00-.75.75v4.992a.75.75 0 001.5 0v-3.18l1.9 1.9a9 9 0 0015.059-4.035.75.75 0 00-.53-.918z" clipRule="evenodd" />
            </svg>
          </button>

          {/* Skip Backward Button */}
          <button
            onClick={handleSkipBackward}
            disabled={isLoading || !!error}
            className="flex items-center justify-center w-10 h-10 rounded-full 
                     bg-gray-100 dark:bg-gray-700/50 
                     hover:bg-gray-200 dark:hover:bg-gray-600
                     disabled:opacity-50 disabled:cursor-not-allowed
                     text-gray-600 dark:text-gray-300
                     transition-all duration-200 transform hover:scale-105"
            title="Skip backward 5s (←)"
          >
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="w-5 h-5">
              <path d="M9.195 18.44c1.25.713 2.805-.19 2.805-1.629v-2.34l6.945 3.968c1.25.714 2.805-.188 2.805-1.628V8.688c0-1.44-1.555-2.342-2.805-1.628L12 11.03v-2.34c0-1.44-1.555-2.343-2.805-1.629l-7.108 4.062c-1.26.72-1.26 2.536 0 3.256l7.108 4.061z" />
            </svg>
          </button>

          {/* Play/Pause Button */}
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

          {/* Skip Forward Button */}
          <button
            onClick={handleSkipForward}
            disabled={isLoading || !!error}
            className="flex items-center justify-center w-10 h-10 rounded-full 
                     bg-gray-100 dark:bg-gray-700/50 
                     hover:bg-gray-200 dark:hover:bg-gray-600
                     disabled:opacity-50 disabled:cursor-not-allowed
                     text-gray-600 dark:text-gray-300
                     transition-all duration-200 transform hover:scale-105"
            title="Skip forward 5s (→)"
          >
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="w-5 h-5">
              <path d="M5.055 7.06c-1.25-.714-2.805.189-2.805 1.628v8.123c0 1.44 1.555 2.342 2.805 1.628L12 14.471v2.34c0 1.44 1.555 2.342 2.805 1.628l7.108-4.061c1.26-.72 1.26-2.536 0-3.256L14.805 7.06C13.555 6.346 12 7.25 12 8.688v2.34L5.055 7.06z" />
            </svg>
          </button>

          {/* Cancel/Clear Region Button */}
          <button
            onClick={handleClearRegion}
            disabled={isLoading || !!error || !currentRegion}
            className="flex items-center justify-center w-12 h-12 rounded-full 
                     bg-gray-200 dark:bg-gray-700 
                     hover:bg-red-100 dark:hover:bg-red-900/30
                     disabled:opacity-30 disabled:cursor-not-allowed
                     text-gray-700 dark:text-gray-200
                     hover:text-red-600 dark:hover:text-red-400
                     transition-all duration-200 transform hover:scale-105"
            title="Clear region (Esc)"
          >
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="w-6 h-6">
              <path fillRule="evenodd" d="M5.47 5.47a.75.75 0 011.06 0L12 10.94l5.47-5.47a.75.75 0 111.06 1.06L13.06 12l5.47 5.47a.75.75 0 11-1.06 1.06L12 13.06l-5.47 5.47a.75.75 0 01-1.06-1.06L10.94 12 5.47 6.53a.75.75 0 010-1.06z" clipRule="evenodd" />
            </svg>
          </button>
        </div>

        {/* Time Display */}
        <div className="flex items-center justify-between text-sm text-gray-600 dark:text-gray-400">
          <span className="font-mono">{formatTime(currentTime)}</span>
          <span className="text-gray-400 dark:text-gray-500">/</span>
          <span className="font-mono">{formatTime(duration)}</span>
        </div>

        {/* Progress Bar (Timeline) - Draggable */}
        <div 
          ref={progressBarRef}
          className={`relative group ${isDraggingProgress ? 'cursor-grabbing' : 'cursor-pointer'}`}
          onClick={handleProgressBarClick}
          onMouseDown={handleProgressBarMouseDown}
          title="Click or drag to seek"
        >
          <div className="h-3 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden hover:h-4 transition-all duration-150">
            {/* Progress fill - no transition to avoid visual lag during region loops */}
            <div
              className="h-full bg-gradient-to-r from-blue-600 to-purple-600"
              style={{ 
                width: `${
                  isDraggingProgress 
                    ? dragProgressPercent 
                    : duration > 0 ? (currentTime / duration) * 100 : 0
                }%` 
              }}
            />
          </div>
          {/* Playhead indicator */}
          <div 
            className={`absolute top-1/2 -translate-y-1/2 w-4 h-4 bg-white dark:bg-gray-200 rounded-full shadow-lg 
                     border-2 border-blue-600 pointer-events-none
                     ${isDraggingProgress ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'} 
                     transition-opacity duration-150`}
            style={{ 
              left: `calc(${
                isDraggingProgress 
                  ? dragProgressPercent 
                  : duration > 0 ? (currentTime / duration) * 100 : 0
              }% - 8px)` 
            }}
          />
        </div>

        {/* Zoom Controls */}
        <div className="flex items-center gap-3 pt-2">
          <div className="flex items-center gap-2">
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" 
                 className="w-5 h-5 text-gray-600 dark:text-gray-400">
              <path d="M8.25 10.875a2.625 2.625 0 115.25 0 2.625 2.625 0 01-5.25 0z" />
              <path fillRule="evenodd" d="M12 2.25c-5.385 0-9.75 4.365-9.75 9.75s4.365 9.75 9.75 9.75 9.75-4.365 9.75-9.75S17.385 2.25 12 2.25zm-1.125 4.5a4.125 4.125 0 102.338 7.524l2.007 2.006a.75.75 0 101.06-1.06l-2.006-2.007a4.125 4.125 0 00-3.399-6.463z" clipRule="evenodd" />
            </svg>
            <span className="text-xs font-semibold text-gray-600 dark:text-gray-400 w-12">
              Zoom
            </span>
          </div>
          <button
            onClick={handleZoomOut}
            disabled={zoomLevel === 0}
            className="px-3 py-1 rounded bg-gray-200 hover:bg-gray-300 dark:bg-gray-700 dark:hover:bg-gray-600
                     disabled:opacity-50 disabled:cursor-not-allowed text-sm font-semibold
                     transition-colors duration-200"
            title="Zoom out (÷1.3)"
          >
            −
          </button>
          <input
            type="range"
            min="0"
            max="500"
            step="1"
            value={zoomLevel}
            onChange={(e) => handleZoomChange(parseInt(e.target.value))}
            className="flex-1 h-2 bg-gray-200 dark:bg-gray-700 rounded-lg appearance-none cursor-pointer
              [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-4 [&::-webkit-slider-thumb]:h-4 
              [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-blue-600
              [&::-webkit-slider-thumb]:cursor-pointer [&::-webkit-slider-thumb]:hover:bg-blue-700
              [&::-moz-range-thumb]:w-4 [&::-moz-range-thumb]:h-4 [&::-moz-range-thumb]:rounded-full 
              [&::-moz-range-thumb]:bg-blue-600 [&::-moz-range-thumb]:border-0 [&::-moz-range-thumb]:cursor-pointer"
          />
          <button
            onClick={handleZoomIn}
            disabled={zoomLevel >= 500}
            className="px-3 py-1 rounded bg-gray-200 hover:bg-gray-300 dark:bg-gray-700 dark:hover:bg-gray-600
                     disabled:opacity-50 disabled:cursor-not-allowed text-sm font-semibold
                     transition-colors duration-200"
            title="Zoom in (×1.3)"
          >
            +
          </button>
          <span className="text-xs font-mono text-gray-600 dark:text-gray-400 w-12 text-right">
            {zoomLevel === 0 ? "Fit" : `${zoomLevel}px`}
          </span>
        </div>

      </div>

      {/* Help Modal */}
      {showHelp && (
        <div 
          className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4"
          onClick={handleHelpClose}
        >
          <div 
            className="bg-white dark:bg-gray-800 rounded-2xl shadow-2xl max-w-2xl w-full max-h-[90vh] overflow-y-auto"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header */}
            <div className="sticky top-0 bg-gradient-to-r from-blue-600 to-purple-600 text-white px-6 py-4 rounded-t-2xl flex items-center justify-between">
              <h3 className="text-xl font-bold">Keyboard Shortcuts</h3>
              <button
                onClick={handleHelpClose}
                className="p-1 hover:bg-white/20 rounded-lg transition-colors"
                aria-label="Close"
              >
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="w-6 h-6">
                  <path fillRule="evenodd" d="M5.47 5.47a.75.75 0 011.06 0L12 10.94l5.47-5.47a.75.75 0 111.06 1.06L13.06 12l5.47 5.47a.75.75 0 11-1.06 1.06L12 13.06l-5.47 5.47a.75.75 0 01-1.06-1.06L10.94 12 5.47 6.53a.75.75 0 010-1.06z" clipRule="evenodd" />
                </svg>
              </button>
            </div>

            {/* Content */}
            <div className="p-6 space-y-6">
              {/* Playback Section */}
              <div>
                <h4 className="text-lg font-semibold text-gray-800 dark:text-gray-100 mb-3 flex items-center gap-2">
                  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="w-5 h-5 text-blue-600">
                    <path fillRule="evenodd" d="M4.5 5.653c0-1.426 1.529-2.33 2.779-1.643l11.54 6.348c1.295.712 1.295 2.573 0 3.285L7.28 19.991c-1.25.687-2.779-.217-2.779-1.643V5.653z" clipRule="evenodd" />
                  </svg>
                  Playback Controls
                </h4>
                <div className="space-y-2">
                  <div className="flex items-center justify-between py-2 px-3 rounded-lg bg-gray-50 dark:bg-gray-700/50">
                    <span className="text-gray-700 dark:text-gray-200">Play / Pause</span>
                    <kbd className="px-3 py-1 bg-white dark:bg-gray-600 rounded-md text-sm font-mono border border-gray-300 dark:border-gray-500 shadow-sm">
                      Space
                    </kbd>
                  </div>
                  <div className="flex items-center justify-between py-2 px-3 rounded-lg bg-gray-50 dark:bg-gray-700/50">
                    <span className="text-gray-700 dark:text-gray-200">Skip backward 5 seconds</span>
                    <kbd className="px-3 py-1 bg-white dark:bg-gray-600 rounded-md text-sm font-mono border border-gray-300 dark:border-gray-500 shadow-sm">
                      ←
                    </kbd>
                  </div>
                  <div className="flex items-center justify-between py-2 px-3 rounded-lg bg-gray-50 dark:bg-gray-700/50">
                    <span className="text-gray-700 dark:text-gray-200">Skip forward 5 seconds</span>
                    <kbd className="px-3 py-1 bg-white dark:bg-gray-600 rounded-md text-sm font-mono border border-gray-300 dark:border-gray-500 shadow-sm">
                      →
                    </kbd>
                  </div>
                </div>
              </div>

              {/* Region Controls Section */}
              <div>
                <h4 className="text-lg font-semibold text-gray-800 dark:text-gray-100 mb-3 flex items-center gap-2">
                  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="w-5 h-5 text-purple-600">
                    <path fillRule="evenodd" d="M5.625 1.5c-1.036 0-1.875.84-1.875 1.875v17.25c0 1.035.84 1.875 1.875 1.875h12.75c1.035 0 1.875-.84 1.875-1.875V12.75A3.75 3.75 0 0016.5 9h-1.875a1.875 1.875 0 01-1.875-1.875V5.25A3.75 3.75 0 009 1.5H5.625zM7.5 15a.75.75 0 01.75-.75h7.5a.75.75 0 010 1.5h-7.5A.75.75 0 017.5 15zm.75 2.25a.75.75 0 000 1.5H12a.75.75 0 000-1.5H8.25z" clipRule="evenodd" />
                    <path d="M12.971 1.816A5.23 5.23 0 0114.25 5.25v1.875c0 .207.168.375.375.375H16.5a5.23 5.23 0 013.434 1.279 9.768 9.768 0 00-6.963-6.963z" />
                  </svg>
                  Loop Region
                </h4>
                <div className="space-y-2">
                  <div className="flex items-center justify-between py-2 px-3 rounded-lg bg-gray-50 dark:bg-gray-700/50">
                    <span className="text-gray-700 dark:text-gray-200">Clear region selection</span>
                    <kbd className="px-3 py-1 bg-white dark:bg-gray-600 rounded-md text-sm font-mono border border-gray-300 dark:border-gray-500 shadow-sm">
                      Esc
                    </kbd>
                  </div>
                </div>
              </div>

              {/* Zoom Controls Section */}
              <div>
                <h4 className="text-lg font-semibold text-gray-800 dark:text-gray-100 mb-3 flex items-center gap-2">
                  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="w-5 h-5 text-green-600">
                    <path d="M8.25 10.875a2.625 2.625 0 115.25 0 2.625 2.625 0 01-5.25 0z" />
                    <path fillRule="evenodd" d="M12 2.25c-5.385 0-9.75 4.365-9.75 9.75s4.365 9.75 9.75 9.75 9.75-4.365 9.75-9.75S17.385 2.25 12 2.25zm-1.125 4.5a4.125 4.125 0 102.338 7.524l2.007 2.006a.75.75 0 101.06-1.06l-2.006-2.007a4.125 4.125 0 00-3.399-6.463z" clipRule="evenodd" />
                  </svg>
                  Zoom
                </h4>
                <div className="space-y-2">
                  <div className="flex items-center justify-between py-2 px-3 rounded-lg bg-gray-50 dark:bg-gray-700/50">
                    <span className="text-gray-700 dark:text-gray-200">Zoom in (×1.3)</span>
                    <kbd className="px-3 py-1 bg-white dark:bg-gray-600 rounded-md text-sm font-mono border border-gray-300 dark:border-gray-500 shadow-sm">
                      + / =
                    </kbd>
                  </div>
                  <div className="flex items-center justify-between py-2 px-3 rounded-lg bg-gray-50 dark:bg-gray-700/50">
                    <span className="text-gray-700 dark:text-gray-200">Zoom out (÷1.3)</span>
                    <kbd className="px-3 py-1 bg-white dark:bg-gray-600 rounded-md text-sm font-mono border border-gray-300 dark:border-gray-500 shadow-sm">
                      -
                    </kbd>
                  </div>
                </div>
              </div>

              {/* Music Timing Section */}
              <div>
                <h4 className="text-lg font-semibold text-gray-800 dark:text-gray-100 mb-3 flex items-center gap-2">
                  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="w-5 h-5 text-pink-600">
                    <path fillRule="evenodd" d="M19.952 1.651a.75.75 0 01.298.599V16.303a3 3 0 01-2.176 2.884l-1.32.377a2.553 2.553 0 11-1.403-4.909l2.311-.66a1.5 1.5 0 001.088-1.442V6.994l-9 2.572v9.737a3 3 0 01-2.176 2.884l-1.32.377a2.553 2.553 0 11-1.403-4.909l2.311-.66a1.5 1.5 0 001.088-1.442V3.893a.75.75 0 01.576-.73l11.25-2.662a.75.75 0 01.625.15z" clipRule="evenodd" />
                  </svg>
                  Chord Notation
                </h4>
                <div className="space-y-2 text-sm text-gray-700 dark:text-gray-300">
                  <p className="py-2 px-3 rounded-lg bg-gray-50 dark:bg-gray-700/50">
                    <strong>BPM:</strong> Set beats per minute to match song tempo
                  </p>
                  <p className="py-2 px-3 rounded-lg bg-gray-50 dark:bg-gray-700/50 flex items-center gap-2">
                    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="w-4 h-4 text-pink-600 flex-shrink-0">
                      <path fillRule="evenodd" d="M19.952 1.651a.75.75 0 01.298.599V16.303a3 3 0 01-2.176 2.884l-1.32.377a2.553 2.553 0 11-1.403-4.909l2.311-.66a1.5 1.5 0 001.088-1.442V6.994l-9 2.572v9.737a3 3 0 01-2.176 2.884l-1.32.377a2.553 2.553 0 11-1.403-4.909l2.311-.66a1.5 1.5 0 001.088-1.442V3.893a.75.75 0 01.576-.73l11.25-2.662a.75.75 0 01.625.15z" clipRule="evenodd" />
                    </svg>
                    <span><strong>Time Signature:</strong> Set beats per bar (default 4 for 4/4 time)</span>
                  </p>
                  <p className="py-2 px-3 rounded-lg bg-gray-50 dark:bg-gray-700/50">
                    <strong>Offset:</strong> Adjust timing (in seconds) to align bars with music
                  </p>
                  <p className="py-2 px-3 rounded-lg bg-gray-50 dark:bg-gray-700/50">
                    Click on any bar in the note track to add chord names. Press <kbd className="px-2 py-0.5 bg-white dark:bg-gray-600 rounded text-xs font-mono">Enter</kbd> or <kbd className="px-2 py-0.5 bg-white dark:bg-gray-600 rounded text-xs font-mono">Esc</kbd> to finish editing.
                  </p>
                </div>
              </div>

              {/* Help Section */}
              <div>
                <h4 className="text-lg font-semibold text-gray-800 dark:text-gray-100 mb-3 flex items-center gap-2">
                  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="w-5 h-5 text-orange-600">
                    <path fillRule="evenodd" d="M2.25 12c0-5.385 4.365-9.75 9.75-9.75s9.75 4.365 9.75 9.75-4.365 9.75-9.75 9.75S2.25 17.385 2.25 12zm11.378-3.917c-.89-.777-2.366-.777-3.255 0a.75.75 0 01-.988-1.129c1.454-1.272 3.776-1.272 5.23 0 1.513 1.324 1.513 3.518 0 4.842a3.75 3.75 0 01-.837.552c-.676.328-1.028.774-1.028 1.152v.75a.75.75 0 01-1.5 0v-.75c0-1.279 1.06-2.107 1.875-2.502.182-.088.351-.199.503-.331.83-.727.83-1.857 0-2.584zM12 18a.75.75 0 100-1.5.75.75 0 000 1.5z" clipRule="evenodd" />
                  </svg>
                  Help
                </h4>
                <div className="space-y-2">
                  <div className="flex items-center justify-between py-2 px-3 rounded-lg bg-gray-50 dark:bg-gray-700/50">
                    <span className="text-gray-700 dark:text-gray-200">Show this help dialog</span>
                    <div className="flex gap-2">
                      <kbd className="px-3 py-1 bg-white dark:bg-gray-600 rounded-md text-sm font-mono border border-gray-300 dark:border-gray-500 shadow-sm">
                        ?
                      </kbd>
                      <span className="text-gray-400">or</span>
                      <kbd className="px-3 py-1 bg-white dark:bg-gray-600 rounded-md text-sm font-mono border border-gray-300 dark:border-gray-500 shadow-sm">
                        H
                      </kbd>
                    </div>
                  </div>
                </div>
              </div>

              {/* Tips */}
              <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg p-4">
                <h4 className="text-sm font-semibold text-blue-800 dark:text-blue-300 mb-2">💡 Tips</h4>
                <ul className="text-sm text-blue-700 dark:text-blue-300 space-y-1 list-disc list-inside">
                  <li>Set BPM and offset first to align bars with the music</li>
                  <li>Drag on the waveform to create a loop region</li>
                  <li>Click and drag region edges to adjust boundaries</li>
                  <li>Click anywhere on the progress bar to seek</li>
                  <li>Zoom grows exponentially for more detail</li>
                  <li>Higher zoom = more precision for region selection and chord placement</li>
                </ul>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
