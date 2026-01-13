# YouTube Download Implementation

## Overview
The app now downloads real audio from YouTube URLs using `yt-dlp` and loads them into the WavePlayer.

## How It Works

### 1. API Endpoint: POST /api/download
- Receives YouTube URL from client
- Validates URL with zod schema
- Calls `downloadYoutubeAudio()` to download audio
- Returns path to downloaded file

### 2. Download Process (`lib/youtube.ts`)
- Uses system `yt-dlp` command
- Downloads audio-only in MP3 format (highest quality)
- Saves to `public/downloads/audio-{timestamp}.mp3`
- Returns public URL path (e.g., `/downloads/audio-123456789.mp3`)

### 3. WavePlayer
- Receives audioUrl from API response
- Loads and displays waveform
- Provides play/pause, seek, and time display controls

## File Structure

```
/lib/youtube.ts              - YouTube download logic
/app/api/download/route.ts   - API endpoint
/components/WavePlayer.tsx   - Audio player UI
/public/downloads/           - Downloaded audio files (gitignored)
```

## Requirements

- **yt-dlp** must be installed on the system
  ```bash
  brew install yt-dlp  # macOS
  # or
  pip install yt-dlp
  ```

## Testing

1. Start the dev server: `npm run dev`
2. Open http://localhost:3000
3. Enter a YouTube URL (e.g., `https://www.youtube.com/watch?v=dQw4w9WgXcQ`)
4. Click "Fetch Audio"
5. Wait for download (may take 10-30 seconds)
6. Waveform appears and audio is playable

## Cleanup

Old downloaded files (>1 hour) are automatically cleaned up on each new download to prevent disk space issues.

## Notes

- Downloads are stored in `public/downloads/` for easy serving by Next.js
- Each file has a unique timestamp-based name
- The mock `sample.mp3` is still available at `/dev-audio/sample.mp3` for testing

