# Download Progress Bar Implementation

## Overview
Real-time progress tracking for YouTube audio downloads using polling.

## How It Works

### 1. Job Queue System (`lib/downloadQueue.ts`)
- In-memory job tracking
- Stores job ID, status, progress (0-100), and result
- Automatic cleanup of old jobs (>5 minutes)

### 2. Download with Progress (`lib/youtube.ts`)
- Uses `spawn()` instead of `exec()` to capture yt-dlp output in real-time
- Parses progress from yt-dlp stdout: `[download] 45.2%`
- Updates job progress in the queue

### 3. API Endpoints

#### POST /api/download
- Creates a job and returns immediately with `jobId`
- Starts download in background (non-blocking)
- Returns: `{ jobId: "xxx", status: "processing" }`

#### GET /api/download/progress?jobId=xxx
- Returns current status and progress
- Returns: `{ jobId, status, progress, audioUrl, error }`

### 4. Client-Side Polling (`app/page.tsx`)
- Calls `/api/download` to get `jobId`
- Polls `/api/download/progress` every 1 second
- Updates progress bar in real-time
- Shows audioUrl when status is "completed"
- Stops polling on completion or error

## UI Components

### Progress Bar
- Displays download status text
- Shows percentage (0-100%)
- Animated gradient progress bar
- Only visible while `loading` is true

### States
- **Queued**: "Starting download..."
- **Downloading**: "Downloading... X%"
- **Completed**: "Download complete! 100%"
- **Error**: Error message displayed

## File Structure

```
/lib/downloadQueue.ts                    - Job queue management
/lib/youtube.ts                          - Download with progress tracking
/app/api/download/route.ts               - Start download endpoint
/app/api/download/progress/route.ts      - Progress polling endpoint
/app/page.tsx                            - UI with progress bar
```

## Testing

1. Start dev server: `npm run dev`
2. Enter a YouTube URL
3. Click "Fetch Audio"
4. Watch the progress bar fill in real-time
5. Audio player appears when download completes

## Progress Parsing

yt-dlp outputs progress in this format:
```
[download]  45.2% of 3.50MiB at 1.23MiB/s ETA 00:02
```

We parse the percentage with regex: `/\[download\]\s+(\d+\.?\d*)%/`

## Timeout

- Max polling time: 2 minutes (120 attempts × 1 second)
- Shows timeout error if download takes longer
- User can try again with a different URL

