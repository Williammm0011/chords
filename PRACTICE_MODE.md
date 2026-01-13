# Practice Mode - Enhanced Looping UX

## New Features Added

### 1. **Set A/B Buttons** (Always Visible)
Located above the region controls, these allow you to set region boundaries while playing:

- **Set A (Start)**: Sets region start to current playhead position
- **Set B (End)**: Sets region end to current playhead position

**Workflow:**
1. Press play and listen
2. Click "Set A" when you reach the start of the section
3. Continue playing
4. Click "Set B" when you reach the end
5. Perfect region created!

### 2. **Fine-Tune Nudge Buttons** (Shows when region exists)
Precise adjustment controls for both start and end:

**Adjust Start:**
- `-0.5s`: Move start earlier by half a second
- `-0.05s`: Move start earlier by 50ms (frame-accurate)
- `+0.05s`: Move start later by 50ms
- `+0.5s`: Move start later by half a second

**Adjust End:**
- Same controls for the end boundary
- Allows pixel-perfect timing for practice

### 3. **Automatic Clamping**
All time adjustments are automatically constrained:
- **Minimum**: 0 seconds (track start)
- **Maximum**: Track duration (track end)
- **Minimum region length**: 0.1 seconds (prevents zero-length regions)

## UI Layout

```
┌─────────────────────────────────────────┐
│        Audio Player                     │
├─────────────────────────────────────────┤
│  [Waveform with blue region overlay]    │
├─────────────────────────────────────────┤
│  ⏯️  Play/Pause                         │
│  Current: 1:23 / 3:45                   │
│  [Progress Bar]                         │
├─────────────────────────────────────────┤
│  [Set A (Start)]  [Set B (End)]         │  ← Always visible
├─────────────────────────────────────────┤
│  Loop Region (if region exists)         │
│  Start: 1:20 → End: 1:35 (Duration: 15s)│
│                                          │
│  Adjust Start                            │
│  [-0.5s] [-0.05s] [+0.05s] [+0.5s]      │
│                                          │
│  Adjust End                              │
│  [-0.5s] [-0.05s] [+0.05s] [+0.5s]      │
│                                          │
│  [Loop ON] [Clear]                       │
└─────────────────────────────────────────┘
```

## Complete Feature Set

### Creating Regions (3 Methods)

| Method | Use Case | How |
|--------|----------|-----|
| **Drag** | Quick visual selection | Click & drag on waveform |
| **Set A/B** | Precise while listening | Play audio, click buttons at exact moments |
| **Edge Drag** | Adjust existing region | Drag region edges |

### Fine-Tuning

| Adjustment | Precision | Best For |
|------------|-----------|----------|
| **±0.5s** | Coarse | Quick adjustments, finding general area |
| **±0.05s** | Fine | Catching exact beat/note starts, frame-accurate |
| **Edge drag** | Visual | General adjustments while viewing waveform |

### Looping Controls

| Control | Action | Shortcut |
|---------|--------|----------|
| **Loop ON/OFF** | Toggle seamless looping | L |
| **Clear Region** | Remove region & disable loop | Esc |
| **Play/Pause** | Control playback | Space |

## Practice Workflow Examples

### Example 1: Guitar Solo Practice
```
1. Load song via YouTube URL
2. Play through the song
3. Click "Set A" right before the solo starts
4. Let it play through the solo
5. Click "Set B" right after the solo ends
6. Use ±0.05s to fine-tune the exact starting note
7. Click "Loop ON"
8. Press Space to practice solo repeatedly
```

### Example 2: Difficult Chord Change
```
1. Play to the tricky section
2. Click "Set A" one beat before the change
3. Continue playing
4. Click "Set B" one beat after the change
5. Short 2-second loop created
6. Use nudge buttons to include exactly what you need
7. Loop and practice the change until smooth
```

### Example 3: Transcribing a Melody
```
1. Create region around the melody
2. Enable loop
3. Listen repeatedly while transcribing
4. Use ±0.05s to extend/shorten to catch exact notes
5. Adjust region as you work through different parts
```

## Technical Details

### Clamping Logic
```typescript
// Start must be: 0 ≤ start < end - 0.1
const newStart = Math.max(0, Math.min(start + delta, end - 0.1));

// End must be: start + 0.1 < end ≤ duration
const newEnd = Math.max(start + 0.1, Math.min(end + delta, duration));
```

### Time Precision
- **50ms loop monitoring**: Ensures seamless restarts
- **0.05s nudges**: Frame-accurate at 20fps video rate
- **0.5s nudges**: Quick adjustments for human perception

### Why These Values?

| Value | Reasoning |
|-------|-----------|
| **0.05s** | 1 frame at 20fps; precise enough for musical notes |
| **0.5s** | Half a beat at 120 BPM; good for rhythm adjustments |
| **0.1s min** | Prevents accidentally creating unusable regions |

## Keyboard Shortcuts (Complete List)

| Key | Action | Availability |
|-----|--------|--------------|
| **Space** | Play/Pause | Always |
| **L** | Toggle Loop | Only when region exists |
| **Esc** | Clear Region | Only when region exists |

*Note: Shortcuts automatically disabled when typing in input fields*

## Best Practices

### For Practice Sessions
1. **Start with Set A/B**: More natural than dragging
2. **Use ±0.05s**: Get exact beat alignment
3. **Short loops**: 2-5 seconds work best for muscle memory
4. **Gradually expand**: Start small, expand region as you improve

### For Transcription
1. **Longer regions**: 5-10 seconds capture full phrases
2. **Loop first**: Listen multiple times before writing
3. **Adjust on-the-fly**: Fine-tune while listening
4. **Multiple regions**: Clear and create new ones for different sections

### For Learning Songs
1. **Section by section**: Break song into manageable parts
2. **Overlap regions**: Include transitions between sections
3. **Practice transitions**: Create regions spanning two sections
4. **Speed control**: (Future feature - adjust playback speed)

## Troubleshooting

**Q: Set A/B buttons don't seem to work?**
A: Make sure audio is loaded (waveform visible). Buttons disabled during loading.

**Q: Can I have multiple regions?**
A: No, only one region at a time. Creating a new one removes the old one. This keeps practice focused.

**Q: Nudge buttons don't respond?**
A: They only appear when a region exists. Create a region first with drag or Set A/B.

**Q: Loop jumps to wrong position?**
A: Check that loop is enabled (button should be green). Region timestamps show exact boundaries.

**Q: Region too small to see?**
A: Use ±0.5s buttons to expand it, or clear and recreate with Set A/B.

## Future Enhancements (Not Yet Implemented)

- Playback speed control (0.5x - 2x)
- Save/load regions for later sessions
- Multiple named regions
- Export region as separate audio file
- Metronome click track
- Pitch shift without tempo change
- Region presets for common practice patterns

