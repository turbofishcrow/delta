# Delta-Rational Chord Explorer

A web-based tool for exploring and analyzing [delta-rational chords](https://en.xen.wiki/w/Delta-rational_chord) — chords where the frequency differences (deltas) between successive notes have simple integer ratios.

**Made by inthar**

## What are Delta-Rational Chords?

A delta-rational (DR) chord is a chord where some pairs of frequency differences between successive notes have integer ratios. Unlike traditional just intonation (JI) chords, DR chords don't require integer ratios between the frequencies themselves — only between the frequency *differences*.

For example, a chord with delta signature `+1+1` means the frequency difference between notes 1→2 equals the difference between notes 2→3. This creates synchronized beating patterns that can sound concordant even in non-JI contexts.

## Features

### Chord Building

- **Base frequency**: Set the root frequency in Hz (default 220 Hz)
- **Add/Remove intervals**: Build chords with any number of notes above the root
- **Multiple input formats**: Enter intervals as:
  - **Cents** (from root)
  - **Frequency ratio** (from root, e.g., `5/4` or `1.25`)
  - **Relative delta** (frequency difference relative to the first interval's delta)

### Smart Interval Updates

When you update an interval, the system intelligently preserves relationships:

- **Update from cents/ratio (keep deltas)**: The changed interval updates, and all other intervals shift to maintain their delta values
- **Update from delta (keep other deltas)**: The changed interval recalculates its cents/ratio, and other intervals shift while keeping their deltas fixed
- **Recalc deltas from cents**: A global button that recalculates all deltas based on the current cents values — useful after manually entering multiple cent values

### Target Delta Signature

Each interval has a **target delta** field (default 1). This specifies your desired delta signature for error calculation.

Common delta signatures:
- `+1+1+1...` — Isodifferential (equal frequency differences)
- `+1+2` — Like the spacing in a 4:5:7 chord
- `+1+1` — Like the spacing in a 4:5:6 chord

### Least-Squares Linear Error

Click **Calculate** to compute how well your chord approximates the target delta signature.

The error measure finds the optimal reference frequency `x` such that the target DR chord `x : x+D₁ : x+D₂ : ...` best fits your actual chord, then reports the RMS error in the linear (frequency) domain.

Currently only fully delta-rational chords are supported.

- Lower error = closer to the target delta signature
- Error of 0 = exact match

### Audio Playback

Listen to your chords with three waveform options:

- **Sine** — Pure tone, emphasizes fundamentals
- **Triangle** — Slightly brighter, contains odd harmonics
- **Semisine** — Half-wave rectified sine, adds even harmonics

The playback automatically adjusts volume based on the number of notes to prevent clipping.

## Usage Example

To explore a just major chord (4:5:6) as a delta-rational chord:

1. Set base frequency to 220 Hz
2. First interval: Enter ratio `5/4`, click Update
3. Add upper interval
4. Second interval: Enter ratio `3/2`, click Update
5. Set both target deltas to `1` (since 4:5:6 has signature `+1+1`)
6. Click Calculate — the error should be 0 (or very close)
7. Click Play to hear the chord

## Technical Notes

- Delta values are relative to the first interval's frequency difference (which is always normalized to 1)
- The least-squares error formula follows the methodology described in the [Xenharmonic Wiki article](https://en.xen.wiki/w/Delta-rational_chord)
- All calculations use standard equal temperament cents (1200 cents = octave = frequency ratio of 2)

## Running Locally

Simply open `index.html` in a modern web browser. No build step or server required.