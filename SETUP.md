# YouTube Audio Download - Setup & Testing

## System Prerequisites

### 1. Install yt-dlp
```bash
# macOS (using Homebrew)
brew install yt-dlp

# Or using pip
pip install yt-dlp

# Verify installation
yt-dlp --version
```

### 2. Install ffmpeg (required for audio conversion)
```bash
# macOS (using Homebrew)
brew install ffmpeg

# Verify installation
ffmpeg -version
```

### 3. Keep yt-dlp Updated
YouTube changes frequently. Update yt-dlp regularly:
```bash
# Using Homebrew
brew upgrade yt-dlp

# Or using pip
pip install -U yt-dlp
```

## How It Works

### Server-Side Flow
1. **URL Validation**: Validates YouTube URL using Zod schema
2. **Cache Check**: Generates MD5 hash from URL and checks if audio already exists
3. **Download**: If not cached, uses `yt-dlp` to:
   - Extract best available audio
   - Convert to MP3 using ffmpeg
   - Save to `/public/audio-cache/{hash}.mp3`
4. **Return**: Sends `/audio-cache/{hash}.mp3` URL to client

### Safety Measures
- **URL Length Limit**: Max 500 characters
- **File Size Limit**: Max 50MB per file
- **Download Timeout**: 2 minutes max
- **Cache Cleanup**: Auto-deletes files older than 24 hours
- **Error Handling**: Clear error messages for common failures

### Caching
- Files are cached by URL hash (MD5)
- Same URL = instant load from cache
- Different URLs with same video = separate cache entries
- Cache persists across server restarts

## Testing

### 1. Start the Development Server
```bash
cd /Users/williamsu/Documents/ntu/code/2026-01-chords/chords
npm run dev
```

### 2. Test with Real YouTube URLs

#### Good Test URLs (usually work)
```
https://www.youtube.com/watch?v=dQw4w9WgXcQ
https://www.youtube.com/watch?v=jNQXAC9IVRw
https://youtu.be/dQw4w9WgXcQ
```

#### URLs to Avoid
- ❌ Music videos from major labels (often bot-protected)
- ❌ URLs with `&list=...` playlist parameters (unless you want just that video)
- ❌ Age-restricted or private videos

### 3. Test Caching
1. Submit a YouTube URL
2. Wait for download to complete
3. Submit the **exact same URL** again
4. Should load instantly from cache
5. Check console for "✓ Loaded from cache"

### 4. Verify Downloaded Files
```bash
ls -lh public/audio-cache/
```

You should see `.mp3` files with MD5 hash names:
```
-rw-r--r--  1 user  staff   3.2M Jan 14 10:30 5d41402abc4b2a76b9719d911017c592.mp3
```

## Common Issues

### "yt-dlp not found"
- **Cause**: yt-dlp is not installed or not in PATH
- **Fix**: Install yt-dlp using brew or pip

### "Download failed: Sign in to confirm you're not a bot"
- **Cause**: YouTube's anti-bot protection
- **Fix**: Try a different video or remove `&list=` playlist parameters

### "File too large"
- **Cause**: Downloaded audio exceeds 50MB limit
- **Fix**: Try a shorter video or adjust `MAX_FILE_SIZE_MB` in `lib/youtube-download.ts`

### "Download timeout exceeded"
- **Cause**: Download took longer than 2 minutes
- **Fix**: Check internet connection or adjust `DOWNLOAD_TIMEOUT_MS`

## Folder Structure

```
/public/audio-cache/          # Downloaded audio files (git-ignored)
  ├── 5d41402abc4b2a76.mp3
  └── 7d793037a0760186.mp3

/lib/youtube-download.ts      # Core download & caching logic
/app/api/download/route.ts    # API endpoint
```

## Development Notes

- **Git Ignore**: `/public/audio-cache` is git-ignored
- **Cache Cleanup**: Runs automatically before each new download
- **Progress Logging**: Check terminal for download progress
- **Error Messages**: Displayed nicely in the UI

## Production Considerations

For production deployment, consider:
- Using a dedicated storage service (S3, CDN)
- Implementing job queue for background downloads
- Adding authentication/rate limiting
- Monitoring disk usage
- Legal compliance with YouTube's Terms of Service

