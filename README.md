# Delta-Rational Chord Explorer

A web-based tool for exploring and analyzing [delta-rational chords](https://en.xen.wiki/w/Delta-rational_chord) — chords where the frequency differences (deltas) between successive notes have simple integer ratios.

![Front page screenshot](https://raw.githubusercontent.com/inthar-raven/delta/main/static/images/front.png)

## What are Delta-Rational Chords?

A delta-rational (DR) chord is a chord where some pairs of frequency differences between successive notes have integer ratios. Unlike traditional just intonation (JI) chords, DR chords don't require integer ratios between the frequencies themselves — only between the frequency *differences*.

For example, a chord with delta signature `+1+1` means the frequency difference between notes 1→2 equals the difference between notes 2→3. This creates synchronized beating patterns that can sound concordant even in non-JI contexts.

## Features

### Chord Building

- **Base frequency**: Set the root frequency in Hz (default 220 Hz)
- **Add/Remove intervals**: Build chords with any number of notes above the root
- **Multiple input formats**: Enter intervals as:
  - **Cents or edo interval** (from root): `a\n` is `a` steps of `n`-edo
  - **Frequency ratio** (from root, e.g., `5/4` or `1.25`)
  - **Delta** (frequency difference in reference to a unit)

### Interval Updates

- **Update from cents/ratio (keep deltas)**: The changed interval updates, and all other intervals shift to maintain their delta values
- **Update from delta (keep other deltas)**: The changed interval recalculates its cents/ratio based on intervals below it (based on previous size if it's the bottom interval), and intervals above it shift while keeping their deltas fixed
- **New deltas from cents**: A global button that recalculates all deltas based on the entered cents values — useful after manually entering multiple interval values
- **New deltas from ratios**: A global button that recalculates all deltas based on the entered ratio values
- **Update from all deltas (keep first interval)**: A global button that recalculates all cents/ratios from the current delta values, keeping the first (bottom) interval fixed — useful for setting up a specific delta signature

### Target Delta Signature

Each interval has a **target delta** field (default 1). This specifies your desired delta signature for error calculation.

Common delta signatures:
- `+1+1+1...` — Isodifferential (equal frequency differences)
- `+1+2` — Like the spacing in a 4:5:7 chord
- `+1+1` — Like the spacing in a 4:5:6 chord

### Free Deltas (+?)

Each interval also has a **Free (+?)** checkbox. When checked, that delta is treated as a free variable during error calculation — the optimizer will find the best value for it.

A delta is also treated as free if the target delta field is empty or contains an invalid value (e.g., non-numeric text).

This is useful for **Partially Delta-Rational (PDR)** chords, where only some of the deltas have fixed integer ratios.

For example, with chord 4:5:6:7:8 and target `+1+?+?+1`:
- The first and last deltas are fixed at ratio 1
- The middle two deltas are free to take any value
- The optimizer finds the optimal values for the free deltas

**Note:** Leading and trailing free deltas are automatically ignored (they don't constrain the chord). Only interior free deltas (between fixed deltas) are optimized.

### Least-Squares Error

Click **Calculate** to compute how well your chord approximates the target delta signature.

Before calculating, you can choose:
- **Domain**: Linear (frequency space) or Logarithmic (pitch space, in cents) — default: **Logarithmic**
- **Error model**: Rooted (from root) or Pairwise (all intervals) — default: **Pairwise**

The error measure finds the optimal real-valued harmonic `x` such that the target DR chord `x : x+D_1 : x+D_2 : ...` (where `D_1, D_2, ...` are cumulative sums of deltas) best fits your actual chord, then reports the root-mean-square error.

**Domain modes:**
- **Linear**: Error measured in frequency ratio units (dimensionless)
- **Logarithmic**: Error measured in cents (more musically intuitive)

**Error model modes:**
- **Rooted**: Compares each interval from the root (n comparisons for n intervals)
- **Pairwise**: Compares all interval pairs including non-rooted intervals (n(n+1)/2 comparisons)

The result shows the error, optimal `x`, and (for PDR) the optimized values of the free variables.

- Lower error = closer to the target delta signature
- Error of 0 = exact match

### Audio Playback

Listen to your chords with five waveform options:

- **Sine** — Pure tone, emphasizes fundamentals
- **Triangle** — Slightly brighter, contains odd harmonics
- **Semisine** — Half-wave rectified sine, adds even harmonics
- **Square** — Bright odd-harmonic-only timbre
- **Saw** — Bright all-harmonic timbre

The playback instantly responds to chord changes. It automatically adjusts volume based on the number of notes to prevent clipping.

## Visualization

- The app includes a visualization of the entered chord in both the linear (frequency) and logarithmic (pitch) domains.
- The entered chord will be displayed as filled indigo circles and the target chord (on error computation) as hollow orange circles.
- The window size can be adjusted using the input boxes.

## Usage Example

To explore a just major chord (4:5:6) as a delta-rational chord:

1. Set base frequency to 220 Hz
2. First interval: Enter ratio `5/4`, click Update
3. Add upper interval
4. Second interval: Enter ratio `3/2`, click Update
5. Set both target deltas to `1` (since 4:5:6 has signature `+1+1`)
6. Click Calculate — the error should be 0 (or very close)
7. Click Play to hear the chord

## Error Computation: Technical Notes

### FDR (Fully Delta-Rational)
When no deltas are marked as free, a two-stage grid search is used to find the optimal `x`:
1. **Coarse search**: 500 steps across a wide range to locate the general region
2. **Fine search**: 500 steps zooming in around the best point for precision

This approach works correctly for all 4 error modes (linear/log × rooted/pairwise) without requiring complex derivative calculations.

### PDR (Partially Delta-Rational)
Uses L-BFGS-B optimization to minimize the sum of squared errors over all variables simultaneously. The optimization:
- Solves for the root real-valued harmonic `x` (constrained to `x > 0`)
- Solves for all free delta variables (unbounded)
- Uses multiple starting points for robustness
- Employs a log-barrier method to enforce the positivity constraint on `x`
- Scales the delta signature when `x` is guessed to be small

### Error Formulas

The error is computed as the root-mean-square difference between the target and actual chords. The target chord has ratios `x : x+D₁ : x+D₂ : ...` where `Dᵢ` are cumulative deltas.

**Linear + Rooted:**
```
minimize √(Σᵢ ((x + Dᵢ)/x - fᵢ)²)
```
Error in frequency ratio units (dimensionless).

**Linear + Pairwise:**
```
minimize √(Σᵢ<ⱼ ((x + Dⱼ)/(x + Dᵢ) - fⱼ/fᵢ)²)
```
Compares all interval pairs. Error in frequency ratio units.

**Logarithmic + Rooted:**
```
minimize √(Σᵢ (log((x + Dᵢ)/x) - log(fᵢ))²) × (1200/ln2)
```
Error computed in nepers then converted to cents.

**Logarithmic + Pairwise:**
```
minimize √(Σᵢ<ⱼ (log((x + Dⱼ)/(x + Dᵢ)) - log(fⱼ/fᵢ))²) × (1200/ln2)
```
Compares all interval pairs in log space. Error in cents.

In all formulas, `fᵢ` are the cumulative frequency ratios from the root, `Dᵢ` are the cumulative deltas, and `x` is the base frequency of the target chord in the same units as the deltas.

## Running Locally

Simply open `index.html` in a modern web browser. No build step or server required.
