/**
 * Saved Audio Items Management
 * Stores YouTube URLs with metadata in localStorage
 */

export interface SavedAudioItem {
  id: string;
  url: string;
  audioUrl: string;
  title: string;
  notes: string;
  bpm?: number | null;
  offset?: number | null;
  noteTrack?: Record<string, string>; // Keys: `${timestamp}-${segmentIndex}` (0-3)
  dateAdded: string; // ISO string
  lastAccessed: string; // ISO string
}

const STORAGE_KEY = "chord-looper-saved-audio";

/**
 * Get all saved audio items
 */
export function getSavedItems(): SavedAudioItem[] {
  if (typeof window === "undefined") return [];
  
  try {
    const data = localStorage.getItem(STORAGE_KEY);
    if (!data) return [];
    return JSON.parse(data);
  } catch (error) {
    console.error("Error loading saved items:", error);
    return [];
  }
}

/**
 * Save a new audio item
 */
export function saveAudioItem(item: Omit<SavedAudioItem, "id" | "dateAdded" | "lastAccessed">): SavedAudioItem {
  const items = getSavedItems();
  
  const newItem: SavedAudioItem = {
    ...item,
    id: Date.now().toString() + Math.random().toString(36).substring(2, 9),
    dateAdded: new Date().toISOString(),
    lastAccessed: new Date().toISOString(),
  };
  
  items.unshift(newItem); // Add to beginning
  localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
  
  return newItem;
}

/**
 * Update an existing audio item
 */
export function updateAudioItem(id: string, updates: Partial<Omit<SavedAudioItem, "id" | "dateAdded">>): void {
  const items = getSavedItems();
  const index = items.findIndex(item => item.id === id);
  
  if (index !== -1) {
    items[index] = {
      ...items[index],
      ...updates,
      lastAccessed: new Date().toISOString(),
    };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
  }
}

/**
 * Delete an audio item
 */
export function deleteAudioItem(id: string): void {
  const items = getSavedItems();
  const filtered = items.filter(item => item.id !== id);
  localStorage.setItem(STORAGE_KEY, JSON.stringify(filtered));
}

/**
 * Get a single item by ID
 */
export function getAudioItem(id: string): SavedAudioItem | null {
  const items = getSavedItems();
  return items.find(item => item.id === id) || null;
}

/**
 * Check if a URL is already saved
 */
export function isUrlSaved(url: string): boolean {
  const items = getSavedItems();
  return items.some(item => item.url === url);
}

/**
 * Search saved items by title or notes
 */
export function searchSavedItems(query: string): SavedAudioItem[] {
  const items = getSavedItems();
  const lowerQuery = query.toLowerCase();
  
  return items.filter(item => 
    item.title.toLowerCase().includes(lowerQuery) ||
    item.notes.toLowerCase().includes(lowerQuery)
  );
}

/**
 * Get the 5 most recently accessed songs
 */
export function getRecentSongs(limit: number = 5): SavedAudioItem[] {
  const items = getSavedItems();
  
  // Sort by lastAccessed (most recent first)
  const sorted = items.sort((a, b) => {
    const dateA = new Date(a.lastAccessed).getTime();
    const dateB = new Date(b.lastAccessed).getTime();
    return dateB - dateA;
  });
  
  return sorted.slice(0, limit);
}

