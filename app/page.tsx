"use client";

import { useState, useEffect, useRef } from "react";
import { z } from "zod";
import { youtubeUrlSchema } from "@/lib/validation";
import WavePlayer from "@/components/WavePlayer";
import SavedAudioSidebar from "@/components/SavedAudioSidebar";
import { saveAudioItem, updateAudioItem, getRecentSongs, type SavedAudioItem } from "@/lib/savedAudio";

export default function Home() {
  const [youtubeUrl, setYoutubeUrl] = useState("");
  const [validationError, setValidationError] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const [isValid, setIsValid] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(false);

  // UI state
  const [showFetchBlock, setShowFetchBlock] = useState(true); // Show on initial load
  const [showSaveForm, setShowSaveForm] = useState(false); // Show when save button is clicked
  const [showHelp, setShowHelp] = useState(false); // Help modal state
  const [showTools, setShowTools] = useState(true); // Show/hide BPM, metronome, offset controls

  // Metadata states
  const [title, setTitle] = useState("");
  const [notes, setNotes] = useState("");
  const [currentSavedId, setCurrentSavedId] = useState<string | null>(null);
  const [showSaveSuccess, setShowSaveSuccess] = useState(false);
  
  // Zoom & timing control states
  const [zoomLevel, setZoomLevel] = useState(27);
  const [bpm, setBpm] = useState<number | null>(null);
  const [offset, setOffset] = useState<number | null>(null);
  const [noteTrack, setNoteTrack] = useState<Record<string, string>>({}); // Keys: `${timestamp}-${segmentIndex}`
  const autoSaveTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const [recentSongs, setRecentSongs] = useState<SavedAudioItem[]>([]);
  
  const handleZoomIn = () => {
    setZoomLevel(prev => {
      if (prev === 0) return 5;
      return Math.min(500, Math.round(prev * 1.3));
    });
  };
  
  const handleZoomOut = () => {
    setZoomLevel(prev => {
      if (prev === 0) return 0;
      const newZoom = Math.round(prev / 1.3);
      return newZoom < 5 ? 0 : newZoom;
    });
  };

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
    setCurrentSavedId(null);
    setShowSaveForm(false);

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
        setShowFetchBlock(false); // Hide fetch block after successful fetch
        
        if (data.cached) {
          console.log("✓ Loaded from cache");
        }
        
        // Auto-fill title from URL if empty
        if (!title) {
          const videoIdMatch = youtubeUrl.match(/(?:v=|youtu\.be\/)([a-zA-Z0-9_-]+)/);
          if (videoIdMatch) {
            setTitle(`YouTube Video ${videoIdMatch[1]}`);
          }
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

  const handleSave = () => {
    if (!youtubeUrl || !audioUrl) return;

    if (currentSavedId) {
      // Update existing
      updateAudioItem(currentSavedId, {
        title: title || "Untitled",
        notes: notes,
        bpm,
        offset,
        noteTrack,
      });
    } else {
      // Save new
      const savedItem = saveAudioItem({
        url: youtubeUrl,
        audioUrl: audioUrl,
        title: title || "Untitled",
        notes: notes,
        bpm,
        offset,
        noteTrack,
      });
      setCurrentSavedId(savedItem.id);
    }

    // Show success message and hide form
    setShowSaveSuccess(true);
    setShowSaveForm(false);
    setTimeout(() => setShowSaveSuccess(false), 3000);
    
    // Refresh recent songs list
    const recent = getRecentSongs(5);
    setRecentSongs(recent);
  };

  const handleLoadSavedItem = async (item: SavedAudioItem) => {
    setYoutubeUrl(item.url);
    setTitle(item.title);
    setNotes(item.notes);
    setBpm(item.bpm ?? null);
    setOffset(item.offset ?? null);
    
    // Convert old format (Record<number, string>) to new format (Record<string, string>) if needed
    const noteTrackData = item.noteTrack ?? {};
    const convertedNoteTrack: Record<string, string> = {};
    for (const [key, value] of Object.entries(noteTrackData)) {
      // If key is a number (old format), convert to new format with segment 0
      if (/^\d+\.?\d*$/.test(key)) {
        convertedNoteTrack[`${key}-0`] = value;
      } else {
        // Already in new format
        convertedNoteTrack[key] = value;
      }
    }
    setNoteTrack(convertedNoteTrack);
    
    setCurrentSavedId(item.id);
    setSidebarOpen(false);
    setShowSaveForm(false);

    // Verify audio file exists before loading
    try {
      const response = await fetch(item.audioUrl, { method: 'HEAD' });
      if (!response.ok) {
        // File doesn't exist (404 or other error), re-fetch from YouTube
        console.log(`Audio file not found (${response.status}), re-fetching from YouTube...`);
        setLoading(true);
        setError("");
        setShowFetchBlock(false);
        
        try {
          const fetchResponse = await fetch("/api/download", {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
            },
            body: JSON.stringify({ url: item.url }),
          });

          const data = await fetchResponse.json();

          if (!fetchResponse.ok) {
            const errorMsg = data.details || data.error || "Failed to re-fetch audio";
            setError(errorMsg);
            setLoading(false);
            setShowFetchBlock(true);
            return;
          }

          if (data.status === "ready" && data.audioUrl) {
            setAudioUrl(data.audioUrl);
            setShowFetchBlock(false);
            
            // Update saved item with new audio URL
            updateAudioItem(item.id, {
              audioUrl: data.audioUrl,
            });
          } else {
            setError("Unexpected response format");
            setLoading(false);
            setShowFetchBlock(true);
          }
        } catch (err) {
          setError("An error occurred while re-fetching audio");
          setLoading(false);
          setShowFetchBlock(true);
        }
      } else {
        // File exists, use it
        setAudioUrl(item.audioUrl);
        setShowFetchBlock(false);
      }
    } catch (err) {
      // Network error or CORS issue, try to use the URL anyway
      console.warn("Could not verify audio file, attempting to load:", err);
      setAudioUrl(item.audioUrl);
      setShowFetchBlock(false);
    }

    // Update last accessed
    updateAudioItem(item.id, {});
    
    // Refresh recent songs list
    const recent = getRecentSongs(5);
    setRecentSongs(recent);
  };

  const handleNewSong = () => {
    // Reset state and show fetch block
    setYoutubeUrl("");
    setAudioUrl(null);
    setTitle("");
    setNotes("");
    setBpm(null);
    setOffset(null);
    setNoteTrack({});
    setCurrentSavedId(null);
    setError("");
    setValidationError("");
    setShowFetchBlock(true);
    setShowSaveForm(false);
    setShowSaveSuccess(false);
  };

  // Load recent songs on mount
  useEffect(() => {
    if (typeof window === "undefined") return;
    const recent = getRecentSongs(5);
    setRecentSongs(recent);
  }, []);

  // Autosave timing and notes (and title/notes) for already-saved items
  useEffect(() => {
    if (typeof window === "undefined") return;
    if (!currentSavedId) return;
    if (!youtubeUrl || !audioUrl) return;

    if (autoSaveTimeoutRef.current) {
      clearTimeout(autoSaveTimeoutRef.current);
    }

    autoSaveTimeoutRef.current = setTimeout(() => {
      updateAudioItem(currentSavedId, {
        title: title || "Untitled",
        notes,
        bpm,
        offset,
        noteTrack,
      });
    }, 800);

    return () => {
      if (autoSaveTimeoutRef.current) {
        clearTimeout(autoSaveTimeoutRef.current);
      }
    };
  }, [currentSavedId, youtubeUrl, audioUrl, title, notes, bpm, offset, noteTrack]);

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100 dark:from-gray-900 dark:to-gray-800">
      <div className="container mx-auto px-4 py-12">
        <div className="max-w-4xl mx-auto">
          {/* Header */}
          <div className="text-center mb-12 relative">
            <h1 className="text-5xl font-bold mb-4 bg-gradient-to-r from-blue-600 to-purple-600 bg-clip-text text-transparent">
              Chord Clip Looper
            </h1>
            <p className="text-lg text-gray-600 dark:text-gray-300">
              Download audio from YouTube and loop specific regions
            </p>

            {/* Sidebar Toggle Button */}
            <button
              onClick={() => setSidebarOpen(true)}
              className="absolute top-0 left-0 p-2.5 rounded-full bg-white/80 dark:bg-gray-800/80 backdrop-blur-sm
                       hover:bg-white dark:hover:bg-gray-700 transition-all duration-200 group shadow-md"
              aria-label="Open saved audio"
            >
              <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" 
                   className="w-5 h-5 text-gray-700 dark:text-gray-300">
                <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 6.75h16.5M3.75 12h16.5m-16.5 5.25h16.5" />
              </svg>
            </button>
          </div>

          {/* Recent Songs Section */}
          {recentSongs.length > 0 && showFetchBlock && (
            <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-xl p-6 mb-8">
              <h2 className="text-xl font-semibold mb-4 text-gray-800 dark:text-gray-100">
                Recent Songs
              </h2>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                {recentSongs.map((song) => (
                  <button
                    key={song.id}
                    onClick={() => handleLoadSavedItem(song)}
                    className="text-left p-4 rounded-lg border border-gray-200 dark:border-gray-700
                             bg-gray-50 dark:bg-gray-700/50
                             hover:bg-gray-100 dark:hover:bg-gray-700
                             hover:border-blue-300 dark:hover:border-blue-600
                             transition-all duration-200 group"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex-1 min-w-0">
                        <h3 className="font-medium text-gray-900 dark:text-gray-100 truncate group-hover:text-blue-600 dark:group-hover:text-blue-400 transition-colors">
                          {song.title}
                        </h3>
                        {song.notes && (
                          <p className="text-sm text-gray-500 dark:text-gray-400 mt-1 line-clamp-2">
                            {song.notes}
                          </p>
                        )}
                        <p className="text-xs text-gray-400 dark:text-gray-500 mt-2">
                          {new Date(song.lastAccessed).toLocaleDateString()}
                        </p>
                      </div>
                      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} 
                           className="w-5 h-5 text-gray-400 dark:text-gray-500 group-hover:text-blue-600 dark:group-hover:text-blue-400 transition-colors flex-shrink-0">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 4.5L21 12m0 0l-7.5 7.5M21 12H3" />
                      </svg>
                    </div>
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Fetch URL Block - Show on initial load and when "New Song" is clicked */}
          {showFetchBlock && (
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
          )}

          {/* Audio Player with Waveform */}
          {audioUrl && (
            <div className="relative">
              {/* Buttons - Top Right */}
              <div className="absolute top-4 right-4 z-20 flex gap-2">
                {/* Zoom Out Button */}
                <button
                  onClick={handleZoomOut}
                  disabled={zoomLevel === 0}
                  className="p-2.5 rounded-full
                           bg-white/90 dark:bg-gray-800/90 backdrop-blur-sm
                           hover:bg-white dark:hover:bg-gray-700
                           shadow-lg hover:shadow-xl
                           transition-all duration-200 hover:scale-110
                           border border-gray-200 dark:border-gray-600
                           disabled:opacity-50 disabled:cursor-not-allowed"
                  title="Zoom out (−)"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" 
                       className="w-5 h-5 text-gray-600 dark:text-gray-400">
                    <path fillRule="evenodd" d="M10.5 3.75a6.75 6.75 0 100 13.5 6.75 6.75 0 000-13.5zM2.25 10.5a8.25 8.25 0 1114.59 5.28l4.69 4.69a.75.75 0 11-1.06 1.06l-4.69-4.69A8.25 8.25 0 012.25 10.5zm4.5 0a.75.75 0 01.75-.75h6a.75.75 0 010 1.5h-6a.75.75 0 01-.75-.75z" clipRule="evenodd" />
                  </svg>
                </button>

                {/* Zoom In Button */}
                <button
                  onClick={handleZoomIn}
                  disabled={zoomLevel >= 500}
                  className="p-2.5 rounded-full
                           bg-white/90 dark:bg-gray-800/90 backdrop-blur-sm
                           hover:bg-white dark:hover:bg-gray-700
                           shadow-lg hover:shadow-xl
                           transition-all duration-200 hover:scale-110
                           border border-gray-200 dark:border-gray-600
                           disabled:opacity-50 disabled:cursor-not-allowed"
                  title="Zoom in (+)"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" 
                       className="w-5 h-5 text-gray-600 dark:text-gray-400">
                    <path fillRule="evenodd" d="M10.5 3.75a6.75 6.75 0 100 13.5 6.75 6.75 0 000-13.5zM2.25 10.5a8.25 8.25 0 1114.59 5.28l4.69 4.69a.75.75 0 11-1.06 1.06l-4.69-4.69A8.25 8.25 0 012.25 10.5zm8.25-3.75a.75.75 0 01.75.75v2.25h2.25a.75.75 0 010 1.5h-2.25v2.25a.75.75 0 01-1.5 0v-2.25H7.5a.75.75 0 010-1.5h2.25V7.5a.75.75 0 01.75-.75z" clipRule="evenodd" />
                  </svg>
                </button>

                {/* Tools Fold/Unfold Button */}
                <button
                  onClick={() => setShowTools(prev => !prev)}
                  className={`p-2.5 rounded-full
                           bg-white/90 dark:bg-gray-800/90 backdrop-blur-sm
                           shadow-lg hover:shadow-xl
                           transition-all duration-200 hover:scale-110
                           border border-gray-200 dark:border-gray-600
                           ${showTools ? 'text-blue-600 dark:text-blue-400 hover:bg-white dark:hover:bg-gray-700' : 'text-gray-600 dark:text-gray-400 hover:bg-white dark:hover:bg-gray-700'}`}
                  title={showTools ? "Hide timing tools" : "Show timing tools"}
                >
                  {/* Tool/wrench icon */}
                  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className="w-5 h-5">
                    <path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z" />
                  </svg>
                </button>

                {/* Help Button */}
                <button
                  onClick={() => setShowHelp(true)}
                  className="p-2.5 rounded-full
                           bg-white/90 dark:bg-gray-800/90 backdrop-blur-sm
                           hover:bg-white dark:hover:bg-gray-700
                           shadow-lg hover:shadow-xl
                           transition-all duration-200 hover:scale-110
                           border border-gray-200 dark:border-gray-600"
                  title="Keyboard shortcuts (? or H)"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" 
                       className="w-5 h-5 text-gray-600 dark:text-gray-400">
                    <path fillRule="evenodd" d="M2.25 12c0-5.385 4.365-9.75 9.75-9.75s9.75 4.365 9.75 9.75-4.365 9.75-9.75 9.75S2.25 17.385 2.25 12zm11.378-3.917c-.89-.777-2.366-.777-3.255 0a.75.75 0 01-.988-1.129c1.454-1.272 3.776-1.272 5.23 0 1.513 1.324 1.513 3.518 0 4.842a3.75 3.75 0 01-.837.552c-.676.328-1.028.774-1.028 1.152v.75a.75.75 0 01-1.5 0v-.75c0-1.279 1.06-2.107 1.875-2.502.182-.088.351-.199.503-.331.83-.727.83-1.857 0-2.584zM12 18a.75.75 0 100-1.5.75.75 0 000 1.5z" clipRule="evenodd" />
                  </svg>
                </button>

                {/* Save Button */}
                <button
                  onClick={() => setShowSaveForm(true)}
                  className="p-2.5 rounded-full
                           bg-white/90 dark:bg-gray-800/90 backdrop-blur-sm
                           hover:bg-white dark:hover:bg-gray-700
                           shadow-lg hover:shadow-xl
                           transition-all duration-200 hover:scale-110
                           border border-gray-200 dark:border-gray-600"
                  title={currentSavedId ? "Edit saved track" : "Save track"}
                >
                  {currentSavedId ? (
                    // Filled bookmark - saved
                    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" 
                         className="w-5 h-5 text-gray-600 dark:text-gray-400">
                      <path fillRule="evenodd" d="M6.32 2.577a49.255 49.255 0 0111.36 0c1.497.174 2.57 1.46 2.57 2.93V21a.75.75 0 01-1.085.67L12 18.089l-7.165 3.583A.75.75 0 013.75 21V5.507c0-1.47 1.073-2.756 2.57-2.93z" clipRule="evenodd" />
                    </svg>
                  ) : (
                    // Outline bookmark - not saved
                    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" 
                         className="w-5 h-5 text-gray-500 dark:text-gray-500">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M17.593 3.322c1.1.128 1.907 1.077 1.907 2.185V21L12 17.25 4.5 21V5.507c0-1.108.806-2.057 1.907-2.185a48.507 48.507 0 0111.186 0z" />
                    </svg>
                  )}
                </button>
              </div>

              <WavePlayer 
                audioUrl={audioUrl} 
                showHelp={showHelp}
                onHelpClose={() => setShowHelp(false)}
                zoomLevel={zoomLevel}
                onZoomChange={setZoomLevel}
                showTimingControls={showTools}
                initialBpm={bpm}
                onBpmChange={setBpm}
                initialOffset={offset}
                onOffsetChange={setOffset}
                initialNotes={noteTrack}
                onNotesChange={setNoteTrack}
              />

              {/* Success Toast */}
              {showSaveSuccess && (
                <div className="fixed bottom-8 right-8 z-40 animate-in slide-in-from-bottom-5 fade-in duration-300">
                  <div className="px-6 py-4 bg-green-600 text-white rounded-full shadow-2xl flex items-center gap-3">
                    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="w-5 h-5">
                      <path fillRule="evenodd" d="M19.916 4.626a.75.75 0 01.208 1.04l-9 13.5a.75.75 0 01-1.154.114l-6-6a.75.75 0 011.06-1.06l5.353 5.353 8.493-12.739a.75.75 0 011.04-.208z" clipRule="evenodd" />
                    </svg>
                    <span className="font-medium">Saved successfully!</span>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Save Modal */}
          {showSaveForm && (
            <>
              {/* Overlay */}
              <div
                className="fixed inset-0 bg-black bg-opacity-60 z-40 backdrop-blur-sm animate-in fade-in duration-200"
                onClick={() => setShowSaveForm(false)}
              />
              
              {/* Modal */}
              <div className="fixed inset-0 z-50 flex items-center justify-center p-4 animate-in zoom-in-95 fade-in duration-200">
                <div
                  className="bg-white dark:bg-gray-800 rounded-2xl shadow-2xl max-w-md w-full p-6 space-y-5"
                  onClick={(e) => e.stopPropagation()}
                >
                  {/* Header */}
                  <div className="flex items-center justify-between">
                    <h3 className="text-2xl font-semibold text-gray-900 dark:text-gray-100">
                      {currentSavedId ? "Edit Track" : "Save Track"}
                    </h3>
                    <button
                      onClick={() => setShowSaveForm(false)}
                      className="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors text-gray-500 dark:text-gray-400"
                      aria-label="Close"
                    >
                      <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-5 h-5">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                      </svg>
                    </button>
                  </div>

                  {/* Form */}
                  <div className="space-y-4">
                    <div>
                      <label htmlFor="title" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                        Title
                      </label>
                      <input
                        id="title"
                        type="text"
                        value={title}
                        onChange={(e) => setTitle(e.target.value)}
                        placeholder="e.g., Guitar Solo Practice"
                        className="w-full px-4 py-2.5 rounded-lg border border-gray-300 dark:border-gray-600
                                 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100
                                 focus:ring-2 focus:ring-blue-500 focus:border-transparent
                                 transition-all duration-200"
                        autoFocus
                      />
                    </div>

                    <div>
                      <label htmlFor="notes" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                        Notes (optional)
                      </label>
                      <textarea
                        id="notes"
                        value={notes}
                        onChange={(e) => setNotes(e.target.value)}
                        placeholder="Add any notes about this track..."
                        rows={4}
                        className="w-full px-4 py-2.5 rounded-lg border border-gray-300 dark:border-gray-600
                                 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100
                                 focus:ring-2 focus:ring-blue-500 focus:border-transparent resize-none
                                 transition-all duration-200"
                      />
                    </div>
                  </div>

                  {/* Actions */}
                  <div className="flex gap-3 pt-2">
                    <button
                      onClick={handleSave}
                      className="flex-1 bg-green-600 hover:bg-green-700 text-white font-semibold py-3 px-6 rounded-lg
                               transition-all duration-200 shadow-md hover:shadow-lg flex items-center justify-center gap-2"
                    >
                      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="w-5 h-5">
                        <path fillRule="evenodd" d="M19.916 4.626a.75.75 0 01.208 1.04l-9 13.5a.75.75 0 01-1.154.114l-6-6a.75.75 0 011.06-1.06l5.353 5.353 8.493-12.739a.75.75 0 011.04-.208z" clipRule="evenodd" />
                      </svg>
                      {currentSavedId ? "Update" : "Save"}
                    </button>
                    <button
                      onClick={() => setShowSaveForm(false)}
                      className="px-6 py-3 rounded-lg font-semibold
                               bg-gray-200 dark:bg-gray-700 hover:bg-gray-300 dark:hover:bg-gray-600
                               text-gray-800 dark:text-gray-100
                               transition-all duration-200"
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              </div>
            </>
          )}
        </div>
      </div>

      {/* Sidebar */}
      <SavedAudioSidebar
        isOpen={sidebarOpen}
        onToggle={() => setSidebarOpen(!sidebarOpen)}
        onLoadItem={handleLoadSavedItem}
        onNewSong={handleNewSong}
      />
    </div>
  );
}
