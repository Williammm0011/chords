"use client";

import { useState, useEffect } from "react";
import { SavedAudioItem, getSavedItems, deleteAudioItem, searchSavedItems } from "@/lib/savedAudio";

interface SavedAudioSidebarProps {
  onLoadItem: (item: SavedAudioItem) => void;
  onNewSong: () => void;
  isOpen: boolean;
  onToggle: () => void;
}

export default function SavedAudioSidebar({ onLoadItem, onNewSong, isOpen, onToggle }: SavedAudioSidebarProps) {
  const [savedItems, setSavedItems] = useState<SavedAudioItem[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [filteredItems, setFilteredItems] = useState<SavedAudioItem[]>([]);

  // Load saved items on mount and when sidebar opens
  useEffect(() => {
    if (isOpen) {
      loadItems();
    }
  }, [isOpen]);

  // Filter items when search query changes
  useEffect(() => {
    if (searchQuery.trim()) {
      setFilteredItems(searchSavedItems(searchQuery));
    } else {
      setFilteredItems(savedItems);
    }
  }, [searchQuery, savedItems]);

  const loadItems = () => {
    const items = getSavedItems();
    setSavedItems(items);
    setFilteredItems(items);
  };

  const handleDelete = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (confirm("Delete this saved audio?")) {
      deleteAudioItem(id);
      loadItems();
    }
  };

  const handleLoadItem = (item: SavedAudioItem) => {
    onLoadItem(item);
    // Update last accessed time handled by parent
  };

  const formatDate = (isoString: string) => {
    const date = new Date(isoString);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);

    if (diffMins < 1) return "Just now";
    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    if (diffDays < 7) return `${diffDays}d ago`;
    return date.toLocaleDateString();
  };

  return (
    <>
      {/* Sidebar */}
      <div
        className={`fixed top-0 left-0 h-full bg-[#1e1e1e] shadow-2xl transition-transform duration-300 ease-in-out z-50
                   ${isOpen ? "translate-x-0" : "-translate-x-full"}
                   w-[280px] flex flex-col`}
      >
        {/* Header */}
        <div className="px-5 py-4">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-xl font-normal text-[#e3e3e3]">
              Chord Looper
            </h2>
            <button
              onClick={onToggle}
              className="p-2 rounded-lg hover:bg-[#2d2d2d] transition-colors text-[#9aa0a6]"
              aria-label="Close sidebar"
            >
              <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-5 h-5">
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>

        {/* New Song Button */}
        <div className="px-5 pb-3">
          <button
            onClick={() => {
              onNewSong();
              onToggle();
            }}
            className="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg
                     bg-[#2d2d2d] hover:bg-[#3d3d3d] text-[#e3e3e3]
                     transition-colors duration-150 text-sm font-normal"
          >
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="w-5 h-5">
              <path fillRule="evenodd" d="M12 3.75a.75.75 0 01.75.75v6.75h6.75a.75.75 0 010 1.5h-6.75v6.75a.75.75 0 01-1.5 0v-6.75H4.5a.75.75 0 010-1.5h6.75V4.5a.75.75 0 01.75-.75z" clipRule="evenodd" />
            </svg>
            New Song
          </button>
        </div>

        {/* Search */}
        <div className="px-5 pb-4">
          <div className="relative">
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search tracks..."
              className="w-full px-4 py-2.5 pl-10 rounded-lg border-none
                       bg-[#2d2d2d] text-[#e3e3e3] placeholder-[#9aa0a6]
                       focus:outline-none focus:ring-1 focus:ring-[#4d4d4d]
                       text-sm"
            />
            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" 
                 className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-[#9aa0a6]">
              <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z" />
            </svg>
          </div>
        </div>

        {/* Items List */}
        <div className="flex-1 overflow-y-auto px-3 pb-4">
          {filteredItems.length === 0 ? (
            <div className="text-center py-16 px-4">
              <div className="text-[#9aa0a6] text-sm">
                {searchQuery ? "No results found" : "No saved tracks yet"}
              </div>
              {!searchQuery && (
                <div className="text-[#5f6368] text-xs mt-2">
                  Save your favorite loops to access them later
                </div>
              )}
            </div>
          ) : (
            <div className="space-y-1">
              {filteredItems.map((item) => (
                <div
                  key={item.id}
                  onClick={() => handleLoadItem(item)}
                  className="px-3 py-3 rounded-lg
                           bg-transparent hover:bg-[#2d2d2d]
                           cursor-pointer transition-all duration-150 group"
                >
                  <div className="flex items-start justify-between gap-2 mb-1">
                    <h3 className="font-normal text-[#e3e3e3] text-sm line-clamp-2 flex-1">
                      {item.title || "Untitled Track"}
                    </h3>
                    <button
                      onClick={(e) => handleDelete(item.id, e)}
                      className="opacity-0 group-hover:opacity-100 p-1 rounded hover:bg-[#3d3d3d]
                               text-[#9aa0a6] hover:text-[#e3e3e3] transition-all"
                      aria-label="Delete"
                    >
                      <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-3.5 h-3.5">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0" />
                      </svg>
                    </button>
                  </div>

                  {item.notes && (
                    <p className="text-xs text-[#9aa0a6] line-clamp-2 mb-2">
                      {item.notes}
                    </p>
                  )}

                  <div className="flex items-center justify-between text-[10px] text-[#5f6368]">
                    <span>{formatDate(item.dateAdded)}</span>
                    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="w-3 h-3">
                      <path d="M5.055 7.06C3.805 6.347 2.25 7.25 2.25 8.69v8.122c0 1.44 1.555 2.343 2.805 1.628l7.108-4.061c1.26-.72 1.26-2.536 0-3.256L5.055 7.061zM12.75 8.69c0-1.44 1.555-2.343 2.805-1.628l7.108 4.061c1.26.72 1.26 2.536 0 3.256l-7.108 4.061c-1.25.714-2.805-.189-2.805-1.628V8.69z" />
                    </svg>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Footer */}
        {filteredItems.length > 0 && (
          <div className="px-5 py-3 border-t border-[#2d2d2d]">
            <div className="text-[10px] text-[#5f6368] text-center">
              {filteredItems.length} {filteredItems.length === 1 ? "track" : "tracks"}
            </div>
          </div>
        )}
      </div>

      {/* Overlay */}
      {isOpen && (
        <div
          className="fixed inset-0 bg-black bg-opacity-60 z-40 transition-opacity backdrop-blur-[2px]"
          onClick={onToggle}
        />
      )}
    </>
  );
}
