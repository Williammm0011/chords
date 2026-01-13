# Chord Clip Looper

A Next.js web application for downloading YouTube audio and looping specific regions.

## Features

- Paste YouTube links to download audio
- Visual waveform display (using wavesurfer.js)
- Select and loop specific regions of audio
- Modern, responsive UI with dark mode support

## Tech Stack

- **Next.js 14+** (App Router)
- **TypeScript**
- **Tailwind CSS**
- **wavesurfer.js** - Waveform visualization and region selection
- **zod** - Input validation
- **ffmpeg-static** - Audio processing
- **yt-dlp** - YouTube audio download (requires local installation)

## Prerequisites

- Node.js 18+ or Node.js 20+
- yt-dlp installed locally (for development)

### Installing yt-dlp

```bash
# macOS (via Homebrew)
brew install yt-dlp

# Linux
sudo curl -L https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp -o /usr/local/bin/yt-dlp
sudo chmod a+rx /usr/local/bin/yt-dlp

# Windows
# Download from https://github.com/yt-dlp/yt-dlp/releases
```

## Getting Started

1. Install dependencies:

```bash
npm install
```

2. Run the development server:

```bash
npm run dev
```

3. Open [http://localhost:3000](http://localhost:3000) in your browser

## Project Structure

```
/app
  /api
    /download      # API endpoint for downloading YouTube audio
  layout.tsx       # Root layout
  page.tsx         # Main page with URL input and waveform
  globals.css      # Global styles
```

## Development Status

- [x] Project scaffolding
- [x] UI components (URL input, basic layout)
- [x] API route placeholder
- [ ] yt-dlp integration
- [ ] Waveform visualization
- [ ] Region selection and looping
- [ ] Audio playback controls

## Future Enhancements

- Docker containerization
- Audio file cleanup/management
- Export selected regions
- Chord detection integration

