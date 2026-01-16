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
  title?: string;
  description?: string;
  showHelp?: boolean;
  onHelpClose?: () => void;
  zoomLevel?: number;
  onZoomChange?: (level: number) => void;
  showTimingControls?: boolean;
  initialBpm?: number | null;
  onBpmChange?: (bpm: number | null) => void;
  initialOffset?: number | null;
  onOffsetChange?: (offset: number | null) => void;
  initialNotes?: Record<string, string>; // Keys: `${timestamp}-${segmentIndex}` (0-3)
  onNotesChange?: (notes: Record<string, string>) => void;
  initialTabData?: Record<string, string>; // Keys: `${timestamp}-${segmentIndex}` (0-3)
  onTabChange?: (tabData: Record<string, string>) => void;
}

interface Region {
  id: string;
  start: number;
  end: number;
}

export default function WavePlayer({
  audioUrl,
  title,
  description,
  showHelp: externalShowHelp,
  onHelpClose,
  zoomLevel: externalZoomLevel,
  onZoomChange,
  showTimingControls = true,
  initialBpm,
  onBpmChange,
  initialOffset,
  onOffsetChange,
  initialNotes,
  onNotesChange,
  initialTabData,
  onTabChange,
}: WavePlayerProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const wavesurferRef = useRef<WaveSurfer | null>(null);
  const regionsPluginRef = useRef<RegionsPlugin | null>(null);
  const loopIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const progressBarRef = useRef<HTMLDivElement>(null);
  const noteTrackRef = useRef<HTMLDivElement>(null);
  const guitarTabRef = useRef<HTMLDivElement>(null);
  const autoScrollTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const isAutoScrollingRef = useRef<boolean>(false); // Flag to prevent scroll event from disabling autoscroll
  const isSyncingScrollRef = useRef<boolean>(false); // Flag to prevent infinite scroll sync loops
  
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [currentRegion, setCurrentRegion] = useState<Region | null>(null);
  const [internalZoomLevel, setInternalZoomLevel] = useState(27); // 0 = fit, 5-500 = px per second (default 27)
  const zoomLevel = externalZoomLevel !== undefined ? externalZoomLevel : internalZoomLevel;
  const [internalShowHelp, setInternalShowHelp] = useState(false);
  const [isDraggingProgress, setIsDraggingProgress] = useState(false);
  const [dragProgressPercent, setDragProgressPercent] = useState(0);
  const [notes, setNotes] = useState<Record<string, string>>(() => {
    // Convert old format (Record<number, string>) to new format (Record<string, string>)
    if (!initialNotes) return {};
    const converted: Record<string, string> = {};
    for (const [key, value] of Object.entries(initialNotes)) {
      // If key is a number (old format), convert to new format with segment 0
      if (/^\d+\.?\d*$/.test(key)) {
        converted[`${key}-0`] = value;
      } else {
        // Already in new format
        converted[key] = value;
      }
    }
    return converted;
  }); // Notes by segment: `${timestamp}-${segmentIndex}`
  const [hoveredSegment, setHoveredSegment] = useState<string | null>(null); // Track hovered segment: `${timestamp}-${segmentIndex}`
  const [autoScroll, setAutoScroll] = useState(true); // Enable/disable autoscroll
  const [isTypingNote, setIsTypingNote] = useState(false); // Track if user is typing
  const [bpm, setBpm] = useState(initialBpm ?? 120); // Beats per minute
  const [beatsPerBar, setBeatsPerBar] = useState(4); // Time signature / beats per bar
  const [offset, setOffset] = useState(initialOffset ?? 0); // Offset in seconds to align with music
  const [metronomeActive, setMetronomeActive] = useState(false); // Metronome playing state
  const [metronomeWasActive, setMetronomeWasActive] = useState(false); // Track if metronome was playing before BPM became invalid
  const [metronomeVolume, setMetronomeVolume] = useState(0.3); // Metronome volume (0–1)
  const metronomeVolumeRef = useRef(0.3); // Ref to always have latest volume value
  const metronomeIntervalRef = useRef<NodeJS.Timeout | null>(null); // Metronome interval
  const audioContextRef = useRef<AudioContext | null>(null); // Web Audio context for metronome clicks
  const [showGuitarTab, setShowGuitarTab] = useState(false); // Show/hide guitar tab
  const [tabEditorOpen, setTabEditorOpen] = useState(false); // Show/hide tab editor side window
  const [editingBarTimestamp, setEditingBarTimestamp] = useState<number | null>(null); // Which bar is being edited
  // Tab data structure: `${timestamp}-${stringIndex}` -> string[] (array of note values per position)
  const [tabData, setTabData] = useState<Record<string, string[]>>(() => {
    if (!initialTabData) return {};
    const converted: Record<string, string[]> = {};
    // Convert old format to new format
    for (const [key, value] of Object.entries(initialTabData)) {
      if (typeof value === 'string') {
        // Old format: single string per bar, convert to array
        const parts = value.split('').filter(c => c.trim() || c === ' ');
        converted[key] = parts.length > 0 ? parts : [];
      } else if (Array.isArray(value)) {
        converted[key] = value;
      }
    }
    return converted;
  });
  
  // Current focused cell: { barIndex, stringIndex, noteIndex }
  const [focusedTabCell, setFocusedTabCell] = useState<{ barIndex: number; stringIndex: number; noteIndex: number } | null>(null);
  const focusedTabCellRef = useRef<{ barIndex: number; stringIndex: number; noteIndex: number } | null>(null);
  
  // Keep ref in sync
  useEffect(() => {
    focusedTabCellRef.current = focusedTabCell;
  }, [focusedTabCell]);
  
  // Sync BPM/offset/notes from parent when loading a saved item
  useEffect(() => {
    if (initialBpm != null) {
      setBpm(initialBpm);
    }
  }, [initialBpm]);
  
  useEffect(() => {
    if (initialOffset != null) {
      setOffset(initialOffset);
    }
  }, [initialOffset]);
  
  useEffect(() => {
    if (initialNotes) {
      // Convert old format to new format if needed
      const converted: Record<string, string> = {};
      for (const [key, value] of Object.entries(initialNotes)) {
        if (/^\d+\.?\d*$/.test(key)) {
          converted[`${key}-0`] = value;
        } else {
          converted[key] = value;
        }
      }
      setNotes(converted);
    }
  }, [initialNotes]);
  
  useEffect(() => {
    // Only update from initialTabData if we're not currently editing
    // This prevents overwriting user input with collapsed data from parent
    if (initialTabData && !tabEditorOpen && editingBarTimestamp === null) {
      // Convert old format to new format if needed
      const converted: Record<string, string[]> = {};
      for (const [key, value] of Object.entries(initialTabData)) {
        if (typeof value === 'string') {
          // For string format, we can't preserve positions, so we'll just initialize empty
          // The user will need to re-enter data, but at least we won't corrupt existing edits
          const slotsPerBar = getSlotsPerBar();
          const emptyArray: string[] = [];
          for (let i = 0; i < slotsPerBar; i++) {
            emptyArray.push('');
          }
          converted[key] = emptyArray;
        } else if (Array.isArray(value)) {
          // If it's already an array, ensure it has the correct length
          const slotsPerBar = getSlotsPerBar();
          const arr: string[] = [...value] as string[];
          while (arr.length < slotsPerBar) {
            arr.push('');
          }
          if (arr.length > slotsPerBar) {
            arr.length = slotsPerBar;
          }
          converted[key] = arr;
        }
      }
      setTabData(converted);
    }
  }, [initialTabData, tabEditorOpen, editingBarTimestamp]);
  
  // Helper: Get all unique note positions for a bar (treating stacked notes as one)
  const getUniqueNotePositions = (timestamp: number): number[] => {
    const positions = new Set<number>();
    for (let stringIndex = 0; stringIndex < 6; stringIndex++) {
      const key = `${timestamp}-${stringIndex}`;
      const notes = tabData[key] || [];
      notes.forEach((note, index) => {
        if (note && note.trim() !== '') {
          positions.add(index);
        }
      });
    }
    return Array.from(positions).sort((a, b) => a - b);
  };
  
  // Helper: Get note value at specific position
  const getTabNote = (timestamp: number, stringIndex: number, noteIndex: number): string => {
    const key = `${timestamp}-${stringIndex}`;
    const notes = tabData[key] || [];
    return notes[noteIndex] || '';
  };
  
  // Helper: Set note value at specific position
  const setTabNote = (timestamp: number, stringIndex: number, noteIndex: number, value: string) => {
    const key = `${timestamp}-${stringIndex}`;
    setTabData(prev => {
      const slotsPerBar = getSlotsPerBar();
      const existingNotes = prev[key];
      
      // If the array exists but is shorter than slotsPerBar, it might be collapsed
      // Create a fresh array with the correct length, preserving existing values at their indices
      let newNotes: string[];
      if (existingNotes && Array.isArray(existingNotes)) {
        // Start with a full-length array of empty strings
        newNotes = Array(slotsPerBar).fill('');
        // Copy existing values to their original indices (if they fit)
        existingNotes.forEach((val, idx) => {
          if (idx < slotsPerBar && val !== undefined && val !== null) {
            newNotes[idx] = val;
          }
        });
      } else {
        // No existing data, create empty array
        newNotes = Array(slotsPerBar).fill('');
      }
      
      // Set the value at the correct index
      newNotes[noteIndex] = value;
      
      return {
        ...prev,
        [key]: newNotes,
      };
    });
  };
  
  // Sync tab data changes to parent (moved to useEffect to avoid render warnings)
  const tabDataTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  useEffect(() => {
    if (!onTabChange) return;
    
    // Debounce to avoid excessive updates
    if (tabDataTimeoutRef.current) {
      clearTimeout(tabDataTimeoutRef.current);
    }
    
    tabDataTimeoutRef.current = setTimeout(() => {
      // Convert to old format for compatibility (flatten arrays to strings)
      const oldFormat: Record<string, string> = {};
      for (const [k, v] of Object.entries(tabData)) {
        oldFormat[k] = Array.isArray(v) ? v.join('') : String(v);
      }
      onTabChange(oldFormat);
    }, 100);
    
    return () => {
      if (tabDataTimeoutRef.current) {
        clearTimeout(tabDataTimeoutRef.current);
      }
    };
  }, [tabData, onTabChange]);
  
  // Adjust zoom when tab is shown/hidden
  useEffect(() => {
    if (showGuitarTab && zoomLevel < 50) {
      // Set zoom to 50px per second when tab is shown (if current zoom is smaller)
      if (onZoomChange) {
        onZoomChange(50);
      } else {
        setInternalZoomLevel(50);
      }
    }
  }, [showGuitarTab, zoomLevel, onZoomChange]);
  
  // Handle arrow key navigation in tab
  const handleTabArrowKey = (e: React.KeyboardEvent, timestamp: number, stringIndex: number, slotIndex: number) => {
    const timestamps = getNoteTimestamps();
    const barIndex = timestamps.indexOf(timestamp);
    const slotsPerBar = getSlotsPerBar();
    
    if (e.key === 'ArrowLeft' || (e.key === 'Tab' && e.shiftKey)) {
      e.preventDefault();
      if (slotIndex > 0) {
        setFocusedTabCell({ barIndex, stringIndex, noteIndex: slotIndex - 1 });
      } else if (barIndex > 0) {
        // Move to last slot of previous bar
        setFocusedTabCell({ barIndex: barIndex - 1, stringIndex, noteIndex: slotsPerBar - 1 });
      }
    } else if (e.key === 'ArrowRight' || (e.key === 'Tab' && !e.shiftKey)) {
      e.preventDefault();
      if (slotIndex < slotsPerBar - 1) {
        setFocusedTabCell({ barIndex, stringIndex, noteIndex: slotIndex + 1 });
      } else if (barIndex < timestamps.length - 1) {
        // Move to first slot of next bar
        setFocusedTabCell({ barIndex: barIndex + 1, stringIndex, noteIndex: 0 });
      }
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      if (stringIndex > 0) {
        setFocusedTabCell({ barIndex, stringIndex: stringIndex - 1, noteIndex: slotIndex });
      }
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      if (stringIndex < 5) {
        setFocusedTabCell({ barIndex, stringIndex: stringIndex + 1, noteIndex: slotIndex });
      }
    }
  };
  
  // Ensure note exists at position (create if needed)
  const ensureNoteAtPosition = (timestamp: number, stringIndex: number, noteIndex: number) => {
    const key = `${timestamp}-${stringIndex}`;
    const notes = tabData[key] || [];
    if (notes.length <= noteIndex) {
      // Create empty note at this position
      setTabNote(timestamp, stringIndex, noteIndex, '');
    }
  };
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
      
      // Check if it's a 404 error
      let errorMessage = "Failed to load audio";
      if (err instanceof Error) {
        const errorStr = err.toString();
        if (errorStr.includes("404") || errorStr.includes("Not Found")) {
          errorMessage = "Audio file not found. Please re-fetch the audio from YouTube.";
        } else if (errorStr.includes("Failed to fetch")) {
          errorMessage = "Network error. Please check your connection and try again.";
        }
      }
      
      setError(errorMessage);
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
    if (onZoomChange) {
      onZoomChange(newZoom);
    } else {
      setInternalZoomLevel(newZoom);
    }
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

  const handleNoteChange = (timestamp: number, segmentIndex: number, value: string) => {
    const key = `${timestamp}-${segmentIndex}`;
    setNotes(prev => {
      const updated = {
        ...prev,
        [key]: value,
      };
      if (onNotesChange) {
        onNotesChange(updated);
      }
      return updated;
    });
  };


  const handleSetOffsetFromCursor = () => {
    if (!wavesurferRef.current) return;
    const current = wavesurferRef.current.getCurrentTime();
    // Snap to nearest 0.1s
    const snapped = Math.round(current * 10) / 10;
    setOffset(snapped);
    if (onOffsetChange) onOffsetChange(snapped);
  };

  // Play a metronome click sound
  const playMetronomeClick = () => {
    if (!audioContextRef.current) {
      audioContextRef.current = new (window.AudioContext || (window as any).webkitAudioContext)();
    }
    
    const ctx = audioContextRef.current;
    const oscillator = ctx.createOscillator();
    const gainNode = ctx.createGain();
    
    oscillator.connect(gainNode);
    gainNode.connect(ctx.destination);
    
    oscillator.frequency.value = 1000; // 1kHz click
    // Clamp volume between 0 and 2 (2x louder than before), use ref to get latest value
    const clampedVolume = Math.max(0, Math.min(2, metronomeVolumeRef.current));
    gainNode.gain.setValueAtTime(clampedVolume, ctx.currentTime);
    gainNode.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.05);
    
    oscillator.start(ctx.currentTime);
    oscillator.stop(ctx.currentTime + 0.05);
  };

  // Toggle metronome play/stop
  const toggleMetronome = () => {
    if (metronomeActive) {
      // Stop metronome (manually stopped by user, so don't restart)
      if (metronomeIntervalRef.current) {
        clearInterval(metronomeIntervalRef.current);
        metronomeIntervalRef.current = null;
      }
      setMetronomeActive(false);
      setMetronomeWasActive(false); // User manually stopped, don't auto-restart
    } else {
      // Only start if BPM is valid
      if (bpm > 0) {
        // Start metronome
        const intervalMs = (60 / bpm) * 1000;
        
        // Play first click immediately
        playMetronomeClick();
        
        // Set up interval for subsequent clicks
        metronomeIntervalRef.current = setInterval(() => {
          playMetronomeClick();
        }, intervalMs);
        
        setMetronomeActive(true);
        setMetronomeWasActive(false); // Reset flag
      }
    }
  };

  // Sync metronome volume ref with state
  useEffect(() => {
    metronomeVolumeRef.current = metronomeVolume;
  }, [metronomeVolume]);

  // Cleanup metronome on unmount
  useEffect(() => {
    return () => {
      if (metronomeIntervalRef.current) {
        clearInterval(metronomeIntervalRef.current);
      }
    };
  }, []);

  // Update metronome interval when BPM changes while playing
  useEffect(() => {
    if (metronomeActive && metronomeIntervalRef.current) {
      if (bpm > 0) {
        // Update to new BPM
        clearInterval(metronomeIntervalRef.current);
        const intervalMs = (60 / bpm) * 1000;
        metronomeIntervalRef.current = setInterval(() => {
          playMetronomeClick();
        }, intervalMs);
      } else {
        // Stop if BPM becomes invalid, but remember it was active
        clearInterval(metronomeIntervalRef.current);
        metronomeIntervalRef.current = null;
        setMetronomeActive(false);
        setMetronomeWasActive(true);
      }
    } else if (!metronomeActive && metronomeWasActive && bpm > 0) {
      // Restart if BPM becomes valid again and it was previously active
      const intervalMs = (60 / bpm) * 1000;
      
      // Play first click immediately
      playMetronomeClick();
      
      // Set up interval for subsequent clicks
      metronomeIntervalRef.current = setInterval(() => {
        playMetronomeClick();
      }, intervalMs);
      
      setMetronomeActive(true);
      setMetronomeWasActive(false);
    }
  }, [bpm, metronomeActive, metronomeWasActive]);

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
        const roundedTime = Math.round(barTime * 1000) / 1000;
        timestamps.push(roundedTime);
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
  
  // Get number of slots per bar (4 * beatsPerBar)
  const getSlotsPerBar = (): number => {
    return beatsPerBar > 0 ? beatsPerBar * 4 : 16; // Default to 16 if beatsPerBar is 0
  };
  
  // Get the currently playing bar timestamp
  const getCurrentBarTimestamp = (): number | null => {
    // If editing a bar, highlight that bar
    if (editingBarTimestamp !== null) {
      return editingBarTimestamp;
    }
    
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

  // Apply zoom level changes to wavesurfer (only after audio is ready)
  useEffect(() => {
    if (!wavesurferRef.current) return;
    if (typeof zoomLevel !== "number") return;
    if (isLoading || !duration) return;

    // @ts-ignore - zoom is available at runtime even if not in typings
    wavesurferRef.current.zoom(zoomLevel);
  }, [zoomLevel, isLoading, duration]);

  // Ensure containers stay synced when zoom level changes
  useEffect(() => {
    if (!containerRef.current || !noteTrackRef.current) return;
    
    // Sync scroll positions after zoom changes
    const syncScroll = () => {
      if (containerRef.current && noteTrackRef.current) {
        // Use waveform as source of truth
        const scrollLeft = containerRef.current.scrollLeft;
        noteTrackRef.current.scrollLeft = scrollLeft;
        if (guitarTabRef.current) {
          guitarTabRef.current.scrollLeft = scrollLeft;
        }
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
      // Guitar tab ref is optional (only exists if tab is visible)
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
      
      // Scroll all containers atomically
      isSyncingScrollRef.current = true;
      containerRef.current.scrollLeft = targetScrollLeft;
      noteTrackRef.current.scrollLeft = targetScrollLeft;
      if (guitarTabRef.current) {
        guitarTabRef.current.scrollLeft = targetScrollLeft;
      }
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
      <div className="mb-6">
        <h2 className="text-2xl font-semibold text-gray-800 dark:text-gray-100">
          {title || "Audio Player"}
        </h2>
        {description && (
          <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">
            {description}
          </p>
        )}
      </div>

      {/* Waveform Container */}
      <div className="mb-2">
        <div
          ref={containerRef}
          className="bg-gray-50 dark:bg-gray-900 rounded-lg p-1 hide-scrollbar"
          style={{ 
            height: '258px', // Fixed height: 250px waveform + 8px padding (4px top + 4px bottom)
            minHeight: '258px',
            maxHeight: '258px',
            overflowX: 'auto', // Allow horizontal scrolling but hide scrollbar
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
      {duration > 0 && !isLoading && !error && showTimingControls && (
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
              value={bpm || ''}
              onChange={(e) => {
                const raw = e.target.value;
                const next = parseInt(raw);
                if (Number.isNaN(next)) {
                  setBpm(0);
                  if (onBpmChange) onBpmChange(null);
                } else {
                  setBpm(next);
                  if (onBpmChange) onBpmChange(next);
                }
              }}
              className="w-16 px-2 py-1 rounded border border-gray-300 dark:border-gray-600
                       bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100
                       focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
            <button
              onClick={toggleMetronome}
              disabled={bpm <= 0}
              className={`p-1.5 rounded transition-colors ${
                metronomeActive 
                  ? 'bg-blue-100 dark:bg-blue-900 text-blue-600 dark:text-blue-400' 
                  : bpm > 0
                    ? 'bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-600'
                    : 'bg-gray-100 dark:bg-gray-700 text-gray-400 dark:text-gray-600 cursor-not-allowed'
              }`}
              title={metronomeActive ? 'Stop metronome' : bpm > 0 ? 'Start metronome' : 'Enter BPM to use metronome'}
            >
              <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-4 h-4">
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 3L4 21h16L12 3z M12 3v10" />
              </svg>
            </button>
            {/* Metronome volume slider */}
            <div className="flex items-center ml-2">
              <input
                type="range"
                min={0}
                max={2}
                step={0.05}
                value={metronomeVolume}
                onChange={(e) => setMetronomeVolume(parseFloat(e.target.value))}
                className="w-20 h-0.5 bg-gray-300 dark:bg-gray-600 rounded-full appearance-none cursor-pointer
                         [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-2.5 [&::-webkit-slider-thumb]:h-2.5 
                         [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-blue-500 
                         [&::-webkit-slider-thumb]:dark:bg-blue-400 [&::-webkit-slider-thumb]:cursor-pointer
                         [&::-webkit-slider-thumb]:shadow-none [&::-webkit-slider-thumb]:transition-all
                         [&::-webkit-slider-thumb]:hover:bg-blue-600 [&::-webkit-slider-thumb]:dark:hover:bg-blue-300
                         [&::-moz-range-thumb]:w-2.5 [&::-moz-range-thumb]:h-2.5 [&::-moz-range-thumb]:rounded-full 
                         [&::-moz-range-thumb]:bg-blue-500 [&::-moz-range-thumb]:dark:bg-blue-400 
                         [&::-moz-range-thumb]:border-0 [&::-moz-range-thumb]:cursor-pointer
                         [&::-moz-range-thumb]:shadow-none [&::-moz-range-thumb]:transition-colors
                         [&::-moz-range-thumb]:hover:bg-blue-600 [&::-moz-range-thumb]:dark:hover:bg-blue-300
                         [&::-moz-range-track]:bg-gray-300 [&::-moz-range-track]:dark:bg-gray-600 
                         [&::-moz-range-track]:rounded-full [&::-moz-range-track]:h-0.5"
                title="Metronome volume"
              />
            </div>
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
              value={beatsPerBar || ''}
              onChange={(e) => setBeatsPerBar(parseInt(e.target.value) || 0)}
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
              onChange={(e) => {
                const raw = e.target.value;
                const next = parseFloat(raw);
                if (Number.isNaN(next)) {
                  // Treat empty/invalid as "no saved offset" but don't block 0
                  setOffset(0);
                  if (onOffsetChange) onOffsetChange(null);
                } else {
                  // Snap to nearest 0.1s
                  const snapped = Math.round(next * 10) / 10;
                  setOffset(snapped);
                  if (onOffsetChange) onOffsetChange(snapped);
                }
              }}
              className="w-20 px-2 py-1 rounded border border-gray-300 dark:border-gray-600
                       bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100
                       focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
            <span className="text-gray-500 dark:text-gray-400 mr-2">sec</span>
            <button
              type="button"
              onClick={handleSetOffsetFromCursor}
              className="px-2 py-1 text-xs rounded border border-gray-300 dark:border-gray-600
                       text-gray-600 dark:text-gray-300 bg-white dark:bg-gray-800
                       hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
            >
              Use playhead
            </button>
          </div>
        </div>
      )}

      {/* Horizontal Note Track */}
      {duration > 0 && !isLoading && !error && (() => {
        // Offset to align with WaveSurfer cursor: accounts for padding difference
        // WaveSurfer container: p-1 (4px), Note track container: p-2 (8px)
        // Difference: 8px - 4px = 4px
        const alignmentOffset = 8;
        
        return (
          <div className="mb-6">
            {/* Note Track Header with Guitar Tab Toggle */}
            <div className="flex items-center justify-between mb-2">
              <h3 className="text-sm font-medium text-gray-700 dark:text-gray-300">Note Track</h3>
              <button
                onClick={() => setShowGuitarTab(!showGuitarTab)}
                className="flex items-center gap-1.5 px-3 py-2 text-sm rounded border border-gray-300 dark:border-gray-600
                         text-gray-700 dark:text-gray-300 bg-white dark:bg-gray-800
                         hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
                title={showGuitarTab ? "Hide Guitar Tab" : "Show Guitar Tab"}
              >
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} 
                     className="w-4 h-4 flex-shrink-0">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9 9l10.5-3m0 6.553v3.75a2.25 2.25 0 01-1.632 2.163l-1.32.377a1.803 1.803 0 11-.99-3.467l2.31-.66a2.25 2.25 0 001.632-2.163zm0 0V2.25L9 5.25v10.303m0 0v3.75a2.25 2.25 0 001.632 2.163l1.32.377a1.803 1.803 0 01-.99 3.467l-2.31-.66A2.25 2.25 0 019 19.553V15.553z" />
                </svg>
                <span>{showGuitarTab ? "Hide Tab" : "Show Tab"}</span>
              </button>
            </div>
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
              
              // Sync waveform, note track, and guitar tab scrolls
              const scrollLeft = e.currentTarget.scrollLeft;
              if (containerRef.current) {
                containerRef.current.scrollLeft = scrollLeft;
              }
              if (guitarTabRef.current) {
                guitarTabRef.current.scrollLeft = scrollLeft;
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
                    {/* Playhead indicator for offset adjustment - aligned with WaveSurfer cursor */}
                    <div
                      className="absolute top-0 w-0.5 h-2 bg-blue-500 dark:bg-blue-400 z-20 pointer-events-none"
                      style={{
                        left: zoomLevel > 0 
                          ? `${currentTime * zoomLevel - alignmentOffset}px`
                          : `${(currentTime / duration) * 100}%`,
                      }}
                    >
                      {/* Triangle indicator */}
                      <div className="absolute top-0 left-1/2 -translate-x-1/2 -translate-y-full">
                        <div className="w-0 h-0 border-l-[4px] border-l-transparent border-r-[4px] border-r-transparent border-t-[6px] border-t-blue-500 dark:border-t-blue-400"></div>
                      </div>
                    </div>
              
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
                              ? `${timestamp * zoomLevel - alignmentOffset}px`
                              : `${(timestamp / duration) * 100}%`,
                            width: zoomLevel > 0 
                              ? `${barWidth * zoomLevel}px`
                              : `${(barWidth / duration) * 100}%`
                          }}
                        />
                      );
                    })}
                    
                    {/* Background grid lines for each bar */}
                    {getNoteTimestamps().map((timestamp, index) => {
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
                              ? `${timestamp * zoomLevel - alignmentOffset}px`
                              : `${(timestamp / duration) * 100}%`
                          }}
                        >
                    <div className={`text-xs font-mono mt-1 ml-1 ${
                      isCurrentBar 
                        ? 'text-blue-600 dark:text-blue-300 font-semibold' 
                        : 'text-gray-500 dark:text-gray-400'
                    }`}>
                      {index + 1}
                    </div>
                  </div>
                );
              })}

                    {/* Note inputs at each bar - 4 segments per bar */}
                    {getNoteTimestamps().map(timestamp => {
                      const barWidth = getBarWidth();
                      const segmentWidth = barWidth / 4;
                      
                      return (
                        <div
                          key={`note-${timestamp}`}
                          className="absolute top-6 flex"
                          style={{
                            left: zoomLevel > 0 
                              ? `${timestamp * zoomLevel - alignmentOffset}px`
                              : `${(timestamp / duration) * 100}%`,
                      width: zoomLevel > 0 
                        ? `${barWidth * zoomLevel}px` // Bar width in pixels
                        : `${(barWidth / duration) * 100}%`,
                      minWidth: '60px'
                    }}
                  >
                    {/* 4 segments, each with its own input */}
                    {Array.from({ length: 4 }).map((_, segmentIndex) => {
                      const segmentKey = `${timestamp}-${segmentIndex}`;
                      const isHovered = hoveredSegment === segmentKey;
                      
                      return (
                        <div
                          key={segmentIndex}
                          className="flex-1 relative"
                          onMouseEnter={() => setHoveredSegment(segmentKey)}
                          onMouseLeave={() => setHoveredSegment(null)}
                        >
                          {/* Hover highlight - only visible when this segment is hovered */}
                          <div
                            className={`absolute inset-0 transition-opacity duration-150 ${
                              isHovered 
                                ? 'opacity-100 bg-blue-500/10 dark:bg-blue-400/10' 
                                : 'opacity-0'
                            }`}
                          />
                          
                          {/* Transparent text input */}
                          <input
                            type="text"
                            value={notes[segmentKey] || ''}
                            onChange={(e) => handleNoteChange(timestamp, segmentIndex, e.target.value)}
                            onFocus={(e) => {
                              setIsTypingNote(true);
                              setHoveredSegment(segmentKey);
                            }}
                            onBlur={(e) => {
                              setIsTypingNote(false);
                              setHoveredSegment(null);
                            }}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter' || e.key === 'Escape') {
                                e.currentTarget.blur();
                              }
                            }}
                            placeholder=""
                            data-timestamp={timestamp}
                            data-segment={segmentIndex}
                            className="w-full h-full px-1 py-1 text-sm rounded text-gray-900 dark:text-gray-100 
                                     bg-transparent border border-transparent cursor-text relative z-10
                                     focus:ring-2 focus:ring-blue-500 focus:border-blue-400 dark:focus:border-blue-400
                                     transition-colors"
                          />
                        </div>
                      );
                    })}
                  </div>
                );
              })}

            </div>
          </div>
        </div>
        );
      })()}

      {/* Guitar Tab Section */}
      {duration > 0 && !isLoading && !error && showGuitarTab && (() => {
        const alignmentOffset = 8;
        const guitarStrings = ['E', 'B', 'G', 'D', 'A', 'E']; // Standard tuning from high to low
        
        return (
          <div className="mb-6">
            <div className="flex items-center justify-between mb-2">
              <h3 className="text-sm font-medium text-gray-700 dark:text-gray-300">Guitar Tab</h3>
            </div>
            <div
              ref={guitarTabRef}
              className="bg-gray-50 dark:bg-gray-900 rounded-lg p-2 overflow-x-auto overflow-y-hidden hide-scrollbar"
              style={{
                height: '136px',
                minHeight: '136px',
                maxHeight: '136px',
              }}
              onScroll={(e) => {
                // Skip if autoscrolling or already syncing
                if (isAutoScrollingRef.current || isSyncingScrollRef.current) return;
                
                // Set flag to prevent infinite loop
                isSyncingScrollRef.current = true;
                
                // Sync waveform, note track, and tab scrolls
                if (containerRef.current) {
                  containerRef.current.scrollLeft = e.currentTarget.scrollLeft;
                }
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
            >
                  {(() => {
                const tabContentHeight = guitarStrings.length * 20; // 120px for 6 strings (0-100px positions, but need to include the last line)
                const containerHeight = 136; // Container height with padding (p-2 = 8px top + 8px bottom = 16px, content area = 120px)
                const topOffset = (containerHeight - tabContentHeight - 16) / 2; // Center vertically accounting for padding
                
                return (
                  <div
                    className="relative h-full"
                    style={{
                      width: zoomLevel > 0 ? `${duration * zoomLevel}px` : '100%',
                      minWidth: '100%'
                    }}
                  >
                    {/* Content wrapper - centered vertically */}
                    <div
                      className="relative"
                      style={{
                        width: '100%',
                        height: `${tabContentHeight}px`,
                        top: `${8 + topOffset}px`, // Container padding (8px) + vertical offset
                      }}
                    >
                      {/* Current bar background highlight - only extend between top and bottom horizontal lines */}
                      {getNoteTimestamps().map((timestamp, index) => {
                        const isCurrentBar = getCurrentBarTimestamp() === timestamp;
                        const barWidth = getBarWidth();
                        if (!isCurrentBar) return null;
                        const lastStringPosition = (guitarStrings.length - 1) * 20; // Position of the last string (100px for 6 strings)
                        
                        return (
                          <div
                            key={`tab-highlight-${timestamp}`}
                            className="absolute bg-blue-100/30 dark:bg-blue-900/20 pointer-events-none transition-all duration-200"
                            style={{
                              left: zoomLevel > 0 
                                ? `${timestamp * zoomLevel - alignmentOffset}px`
                                : `${(timestamp / duration) * 100}%`,
                              width: zoomLevel > 0 
                                ? `${barWidth * zoomLevel}px`
                                : `${(barWidth / duration) * 100}%`,
                              top: '0px', // Start at first horizontal line
                              height: `${lastStringPosition}px`, // End at last horizontal line (100px)
                            }}
                          />
                        );
                      })}
                      
                      {/* Hover highlights for each bar - match grid line positions */}
                      {getNoteTimestamps().map((timestamp, index) => {
                        const barWidth = getBarWidth();
                        const lastStringPosition = (guitarStrings.length - 1) * 20; // Position of the last string (100px for 6 strings)
                        const isFirstBar = index === 0;
                        
                        return (
                          <div
                            key={`tab-hover-${timestamp}`}
                            className={`absolute transition-opacity duration-150 pointer-events-none ${
                              hoveredSegment === `tab-${timestamp}`
                                ? 'opacity-100 bg-blue-500/10 dark:bg-blue-400/10' 
                                : 'opacity-0'
                            }`}
                            style={{
                              left: zoomLevel > 0 
                                ? `${timestamp * zoomLevel - alignmentOffset}px`
                                : `${(timestamp / duration) * 100}%`,
                              width: zoomLevel > 0 
                                ? `${barWidth * zoomLevel}px`
                                : `${(barWidth / duration) * 100}%`,
                              top: '0px',
                              height: `${lastStringPosition}px`,
                            }}
                          />
                        );
                      })}
                      
                      {/* Vertical grid lines for each bar - stay within top and bottom horizontal lines */}
                      {(() => {
                        const timestamps = getNoteTimestamps();
                        const firstTimestamp = timestamps[0];
                        
                        return (
                          <>
                            {/* Leftmost bar line at first bar position - use first bar's actual position */}
                            {firstTimestamp !== undefined && (
                              <div
                                className="absolute w-px bg-gray-300 dark:bg-gray-700 pointer-events-none"
                                style={{
                                  left: zoomLevel > 0 
                                    ? `${firstTimestamp * zoomLevel - alignmentOffset}px`
                                    : `${(firstTimestamp / duration) * 100}%`,
                                  top: '0px',
                                  height: `${(guitarStrings.length - 1) * 20}px`,
                                }}
                              />
                            )}
                            
                            {timestamps.map((timestamp, index) => {
                              const isCurrentBar = getCurrentBarTimestamp() === timestamp;
                              const lastStringPosition = (guitarStrings.length - 1) * 20; // Position of the last string (100px for 6 strings)
                              const isFirstBar = index === 0;
                              
                              // Skip first bar since we already have the leftmost line above
                              if (isFirstBar) return null;
                              
                              return (
                                <div
                                  key={`tab-grid-${timestamp}`}
                                  className={`absolute transition-all duration-200 pointer-events-none ${
                                    isCurrentBar 
                                      ? 'w-0.5 bg-blue-500 dark:bg-blue-400 z-10' 
                                      : 'w-px bg-gray-300 dark:bg-gray-700'
                                  }`}
                                  style={{
                                    left: zoomLevel > 0 
                                      ? `${timestamp * zoomLevel - alignmentOffset}px`
                                      : `${(timestamp / duration) * 100}%`,
                                    top: '0px', // Start at first horizontal line (0px)
                                    height: `${lastStringPosition}px`, // End at last horizontal line (100px)
                                  }}
                                />
                              );
                            })}
                          </>
                        );
                      })()}
                  
                  {/* 6 Horizontal grid lines (one for each string) */}
                  {guitarStrings.map((stringName, stringIndex) => {
                    const linePosition = stringIndex * 20;
                    
                    return (
                      <div key={`string-line-${stringIndex}`}>
                        {/* Horizontal grid line */}
                        <div
                          className="absolute left-0 right-0 border-b border-gray-300 dark:border-gray-700"
                          style={{
                            top: `${linePosition}px`,
                            height: '0px',
                          }}
                        />
                        
                        {/* Tab grid cells for each bar on this string */}
                        {getNoteTimestamps().map((timestamp, barIndex) => {
                          const barWidth = getBarWidth();
                          const barLeft = zoomLevel > 0 
                            ? timestamp * zoomLevel - alignmentOffset
                            : (timestamp / duration) * 100;
                          const barWidthPx = zoomLevel > 0 
                            ? barWidth * zoomLevel
                            : (barWidth / duration) * 100;
                          
                          // Always use fixed slots: 4 * beatsPerBar slots per bar
                          const slotsPerBar = getSlotsPerBar();
                          const key = `${timestamp}-${stringIndex}`;
                          const notes = tabData[key] || [];
                          
                          // Calculate spacing for fixed slots
                          // Distribute slots evenly across the bar width, ensuring the last slot stays within bounds
                          const barWidthNum = typeof barWidthPx === 'number' ? barWidthPx : 100;
                          const cellWidth = 30; // Width of each cell
                          // Calculate spacing so that the last cell fits within the bar
                          // First cell at 0, last cell at (barWidthNum - cellWidth)
                          const spacing = slotsPerBar > 1 
                            ? (barWidthNum - cellWidth) / (slotsPerBar - 1)
                            : (barWidthNum - cellWidth) / 2; // Fallback for edge case
                          
                          // Create all slots (0 to slotsPerBar - 1)
                          const allSlots = Array.from({ length: slotsPerBar }, (_, i) => i);
                          
                          return (
                            <div
                              key={`tab-bar-${timestamp}-${stringIndex}`}
                              className="absolute cursor-pointer"
                              style={{
                                left: typeof barLeft === 'number' 
                                  ? `${barLeft}px`
                                  : `${barLeft}%`,
                                width: typeof barWidthPx === 'number' 
                                  ? `${barWidthPx}px`
                                  : `${barWidthPx}%`,
                                top: `${linePosition - 10}px`, // Parent positioned to center inputs on grid line
                                height: '20px',
                                minWidth: '60px',
                                zIndex: 1
                              }}
                              onMouseEnter={() => {
                                setHoveredSegment(`tab-${timestamp}`);
                              }}
                              onMouseLeave={() => {
                                setHoveredSegment(null);
                              }}
                              onClick={(e) => {
                                // Open side window for this bar
                                e.preventDefault();
                                e.stopPropagation();
                                setEditingBarTimestamp(timestamp);
                                setTabEditorOpen(true);
                              }}
                            >
                              {/* Render all fixed slots for this string */}
                              {allSlots.map((slotIndex) => {
                                const xPosition = slotIndex * spacing;
                                const noteValue = notes[slotIndex] || '';
                                
                                return (
                                  <div
                                    key={`tab-cell-${timestamp}-${stringIndex}-${slotIndex}`}
                                    className="absolute pointer-events-none"
                                    style={{
                                      left: `${xPosition}px`,
                                      top: '0px', // Center vertically on the horizontal grid line (parent is at linePosition - 10, text at 0px centers it on linePosition)
                                      width: '30px',
                                      height: '20px',
                                      transform: 'translateX(0)',
                                    }}
                                  >
                                    <div
                                      className="w-full h-full text-xs font-mono text-gray-900 dark:text-gray-100 
                                               text-center pointer-events-none"
                                      style={{ 
                                        fontSize: '11px', 
                                        padding: '0', 
                                        margin: '0', 
                                        marginTop: '0px', 
                                        textAlign: 'center', 
                                        lineHeight: '20px' 
                                      }}
                                    >
                                      {noteValue || ''}
                                    </div>
                                  </div>
                                );
                              })}
                            </div>
                          );
                        })}
                      </div>
                    );
                  })}
                    </div>
                  </div>
                );
              })()}
            </div>
          </div>
        );
      })()}

      {/* Tab Editor Block - Below Tab Block */}
      {tabEditorOpen && editingBarTimestamp !== null && (() => {
        const guitarStrings = ['E', 'B', 'G', 'D', 'A', 'E']; // Standard tuning from high to low
        return (
          <div className="mt-4 mb-8 p-4 bg-gray-50 dark:bg-gray-900 rounded-lg border border-gray-300 dark:border-gray-700">
            {/* Header */}
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
                Edit Bar
              </h3>
              <button
                onClick={() => {
                  setTabEditorOpen(false);
                  setEditingBarTimestamp(null);
                }}
                className="flex items-center justify-center w-8 h-8 rounded-full 
                         bg-gray-200 dark:bg-gray-700 
                         hover:bg-gray-300 dark:hover:bg-gray-600
                         text-gray-600 dark:text-gray-400 
                         hover:text-gray-800 dark:hover:text-gray-200
                         transition-all duration-200 
                         hover:scale-110 active:scale-95
                         focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2"
                aria-label="Close editor"
              >
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4">
                  <path d="M6.28 5.22a.75.75 0 00-1.06 1.06L8.94 10l-3.72 3.72a.75.75 0 101.06 1.06L10 11.06l3.72 3.72a.75.75 0 101.06-1.06L11.06 10l3.72-3.72a.75.75 0 00-1.06-1.06L10 8.94 6.28 5.22z" />
                </svg>
              </button>
            </div>
            
            {/* Editor Content */}
            <div className="space-y-2">
              {guitarStrings.map((stringName: string, stringIndex: number) => {
                const key = `${editingBarTimestamp}-${stringIndex}`;
                const notes = tabData[key] || [];
                const slotsPerBar = getSlotsPerBar();
                
                return (
                  <div key={`editor-string-${stringIndex}`} className="flex items-center gap-2">
                    <div className="w-8 text-sm font-mono text-gray-600 dark:text-gray-400 text-right">
                      {stringName}
                    </div>
                    <div className="flex-1 flex gap-1 justify-center">
                      {Array.from({ length: slotsPerBar }).map((_, slotIndex) => {
                        const currentValue = notes[slotIndex] || '';
                        // Add a gap every 4 columns (after indices 3, 7, 11, 15, etc.)
                        const shouldAddGap = (slotIndex + 1) % 4 === 0 && slotIndex < slotsPerBar - 1;
                        
                        return (
                          <input
                            key={`editor-slot-${stringIndex}-${slotIndex}`}
                            type="text"
                            value={currentValue}
                            onChange={(e) => {
                              const value = e.target.value;
                              
                              // Allow numbers and space (multi-digit numbers like 11, 20, etc. are fully supported)
                              // The regex allows one or more digits, or a space
                              if (value === '' || /^[0-9]+$/.test(value) || value === ' ') {
                                setTabNote(editingBarTimestamp, stringIndex, slotIndex, value === ' ' ? ' ' : value);
                              }
                              // If invalid character, the controlled input will revert to currentValue on next render
                            }}
                            onKeyDown={(e) => {
                              // Handle arrow keys
                              if (['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Tab'].includes(e.key)) {
                                e.preventDefault();
                                const slotsPerBar = getSlotsPerBar();
                                
                                if (e.key === 'ArrowLeft' || (e.key === 'Tab' && e.shiftKey)) {
                                  if (slotIndex > 0) {
                                    const prevInput = document.querySelector(`input[data-editor-slot="${stringIndex}-${slotIndex - 1}"]`) as HTMLInputElement;
                                    if (prevInput) prevInput.focus();
                                  }
                                } else if (e.key === 'ArrowRight' || (e.key === 'Tab' && !e.shiftKey)) {
                                  if (slotIndex < slotsPerBar - 1) {
                                    const nextInput = document.querySelector(`input[data-editor-slot="${stringIndex}-${slotIndex + 1}"]`) as HTMLInputElement;
                                    if (nextInput) nextInput.focus();
                                  }
                                } else if (e.key === 'ArrowUp') {
                                  if (stringIndex > 0) {
                                    const upInput = document.querySelector(`input[data-editor-slot="${stringIndex - 1}-${slotIndex}"]`) as HTMLInputElement;
                                    if (upInput) upInput.focus();
                                  }
                                } else if (e.key === 'ArrowDown') {
                                  if (stringIndex < 5) {
                                    const downInput = document.querySelector(`input[data-editor-slot="${stringIndex + 1}-${slotIndex}"]`) as HTMLInputElement;
                                    if (downInput) downInput.focus();
                                  }
                                }
                                return;
                              }
                              
                              // Handle space
                              if (e.key === ' ') {
                                e.preventDefault();
                                setTabNote(editingBarTimestamp, stringIndex, slotIndex, ' ');
                                return;
                              }
                              
                              // Allow all number keys (0-9) for multi-digit input, and navigation/editing keys
                              // Don't prevent default for numbers - let them be handled by onChange
                              if (/^[0-9]$/.test(e.key)) {
                                // Allow the key to proceed normally for multi-digit input
                                return;
                              }
                              
                              // Allow navigation and editing keys
                              if (['Backspace', 'Delete', 'Enter', 'Escape', 'Home', 'End', 'ArrowLeft', 'ArrowRight'].includes(e.key)) {
                                return;
                              }
                              
                              // Block other keys (letters, symbols, etc.)
                              e.preventDefault();
                            }}
                            onFocus={(e) => {
                              const input = e.target as HTMLInputElement;
                              // Don't auto-select text on focus - let users type naturally
                              // Place cursor at the end of existing text to allow appending digits
                              if (input.value && input.value.length > 0) {
                                setTimeout(() => {
                                  // Place cursor at end to allow appending more digits
                                  const endPos = input.value.length;
                                  input.setSelectionRange(endPos, endPos);
                                }, 0);
                              } else {
                                // For empty fields, place cursor at start (ready for typing)
                                setTimeout(() => {
                                  input.setSelectionRange(0, 0);
                                }, 0);
                              }
                            }}
                            data-editor-slot={`${stringIndex}-${slotIndex}`}
                            className={`h-8 text-xs font-mono text-center border border-gray-300 dark:border-gray-600 
                                     bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100
                                     focus:ring-2 focus:ring-blue-500 focus:border-blue-500
                                     rounded ${shouldAddGap ? 'mr-2' : ''}`}
                            style={{ 
                              fontSize: '11px',
                              width: '36px', // Wider to accommodate 2-3 digit numbers
                              minWidth: '36px'
                            }}
                            maxLength={3}
                            placeholder=""
                          />
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        );
      })()}

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
