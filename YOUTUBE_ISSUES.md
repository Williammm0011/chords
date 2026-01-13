# YouTube Download Issues & Solutions

## Issues Found

### 1. ✅ FIXED: Playlist URLs
**Problem**: URLs with playlist parameters (e.g., `&list=RDPJhxxDnZHuY`) caused yt-dlp to download entire playlists (602+ videos) instead of single videos.

**Solution**: Added `--no-playlist` flag to yt-dlp command.

**Status**: ✅ Fixed in `lib/youtube.ts`

---

### 2. ⚠️ YouTube Bot Protection
**Problem**: Some videos trigger YouTube's anti-bot protection and require authentication:
```
ERROR: Sign in to confirm you're not a bot
```

**Example URL**: https://www.youtube.com/watch?v=PJhxxDnZHuY

**Why This Happens**:
- YouTube's Content ID system flags certain music videos
- Videos with high copyright sensitivity
- Geographic restrictions
- YouTube's dynamic anti-bot measures

**Workarounds**:
1. **Try a different video**: Use more public/popular videos
2. **Remove playlist parameters**: Use clean URL like `https://www.youtube.com/watch?v=VIDEO_ID`
3. **Test URL first**: Videos like "Me at the zoo" (jNQXAC9IVRw) work reliably

**Status**: ⚠️ Some videos will fail due to YouTube restrictions

---

### 3. ✅ FIXED: Outdated yt-dlp
**Problem**: yt-dlp version 2025.08.27 was showing warnings and had known issues.

**Solution**: Updated via `brew upgrade yt-dlp`

**Current Version**: 2025.12.08

**Status**: ✅ Fixed

---

## Testing Results

### ✅ Working Videos
- "Me at the zoo" (jNQXAC9IVRw) - First YouTube video
- Most public, popular videos
- Educational content
- Official music videos from major labels

### ❌ Problematic Videos
- Videos in playlists (if `&list=` parameter included without `--no-playlist`)
- Some music videos with Content ID
- Geographic-restricted content
- Recently uploaded videos

---

## Error Messages Improved

The app now shows user-friendly messages:

| Error Type | Message |
|------------|---------|
| Bot protection | "YouTube is blocking downloads (bot protection). Try a different video." |
| Private/unavailable | "Video is unavailable or private. Please try a different video." |
| Invalid URL | "Invalid YouTube URL. Please check the URL and try again." |

---

## Recommendations for Users

1. **Use clean URLs**: Remove playlist and tracking parameters
   - ❌ Bad: `https://www.youtube.com/watch?v=ID&list=RD&start_radio=1`
   - ✅ Good: `https://www.youtube.com/watch?v=ID`

2. **Choose public videos**: Popular, public videos work best

3. **Check video first**: Make sure the video plays in your browser without sign-in

4. **Update yt-dlp regularly**: Run `brew upgrade yt-dlp` periodically

---

## Future Enhancements (Optional)

If YouTube bot protection becomes a bigger issue, consider:
- Cookie-based authentication (`--cookies-from-browser chrome`)
- OAuth integration
- Alternative downloaders (youtube-dl, pytube)
- Proxy/VPN options

