# Quick Test Guide for Real YouTube Downloads

## ✅ Prerequisites Verified
- **yt-dlp**: v2025.12.08 installed at `/opt/homebrew/bin/yt-dlp`
- **ffmpeg**: v8.0.1 installed at `/opt/homebrew/bin/ffmpeg`

## 🚀 How to Test

### 1. Server Status
Your dev server should be running at `http://localhost:3000`

If not, start it with:
```bash
cd /Users/williamsu/Documents/ntu/code/2026-01-chords/chords
ulimit -n 10240 && npm run dev
```

### 2. Test URLs

Try these YouTube URLs (usually work well):

**Short videos (faster tests):**
```
https://www.youtube.com/watch?v=jNQXAC9IVRw
https://youtu.be/dQw4w9WgXcQ
https://www.youtube.com/watch?v=9bZkp7q19f0
```

**Avoid:**
- ❌ Music videos from major labels (bot protection)
- ❌ URLs with `&list=...` (unless you want just that video)
- ❌ Age-restricted or private videos

### 3. Test Flow

1. **First download (cache miss):**
   - Paste a YouTube URL
   - Click "Fetch Audio"
   - Wait ~30-120 seconds (download + conversion)
   - Audio player loads with waveform

2. **Second download (cache hit):**
   - Paste the **same URL** again
   - Click "Fetch Audio"
   - Should load instantly from cache
   - Check console for "✓ Loaded from cache"

3. **Check downloaded files:**
   ```bash
   ls -lh /Users/williamsu/Documents/ntu/code/2026-01-chords/chords/public/audio-cache/
   ```

## 🎯 What to Verify

### Client Behavior
- ✅ Loading spinner shows during download
- ✅ Error messages display nicely with icon
- ✅ Cached files load instantly
- ✅ WavePlayer renders after successful download

### Server Behavior
- ✅ Check terminal for download progress logs
- ✅ Files saved to `/public/audio-cache/{hash}.mp3`
- ✅ Cache prevents re-downloading same URL

### Error Handling
Test these scenarios:
1. **Invalid URL**: `https://invalid-url`
   - Should show validation error before submitting

2. **Fake YouTube URL**: `https://youtube.com/watch?v=fakevideo123`
   - Should show server error with details

3. **Bot-protected video**: Try a major label music video
   - Should show clear error about bot protection

## 📁 Files Created

After testing, you'll see:
```
/public/audio-cache/
  ├── README.md
  ├── 5d41402abc4b2a76b9719d911017c592.mp3  (hash-named files)
  └── 7d793037a0760186962055cafe2d31d6.mp3
```

These files are:
- Git-ignored (won't be committed)
- Auto-cleaned after 24 hours
- Named by MD5 hash of the URL

## 🔧 Troubleshooting

### "yt-dlp not found"
Already installed, but if you see this:
```bash
brew install yt-dlp
```

### "Download timeout exceeded"
- Video might be too long
- Slow internet connection
- Increase `DOWNLOAD_TIMEOUT_MS` in `lib/youtube-download.ts`

### "File too large"
- Default limit: 50MB
- Adjust `MAX_FILE_SIZE_MB` in `lib/youtube-download.ts`

### Server logs show no progress
Check terminal running `npm run dev` for:
```
[Download] 45.2%: Downloading: 45.2%
[Download] 95.0%: Converting to MP3...
[Download] 100.0%: Download complete
```

## 📚 Full Documentation
See `SETUP.md` for complete details on:
- System prerequisites
- Safety measures
- Caching strategy
- Production considerations

