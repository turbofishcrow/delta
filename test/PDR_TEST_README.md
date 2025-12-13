# PDR Optimization Method Comparison Tests

## Overview

This test suite compares three different optimization methods for solving Partially Delta-Rational (PDR) chord approximation problems:

1. **L-BFGS-B**: Limited-memory Broyden–Fletcher–Goldfarb–Shanno with box constraints
   - Gradient-based quasi-Newton method
   - Uses numerical gradient computation
   - Employs log-barrier method for bound constraints
   - Best for smooth, well-behaved problems

2. **Nelder-Mead**: Simplex-based derivative-free optimization
   - Does not require gradients
   - Robust to non-smooth functions
   - Good for low-dimensional problems (<10 variables)
   - Can be slower but more reliable

3. **Powell's Method**: Conjugate direction method (derivative-free)
   - Uses sequential line searches along conjugate directions
   - Does not require gradients
   - Efficient for quadratic-like functions
   - Good middle ground between gradient-based and simplex methods

## Test Cases

**Important Design**:
- All test cases are **generated from actual PDR chords** with known exact solutions
- Small random perturbations (~5¢) are added to make them approximate PDR chords
- Free deltas are in the **middle** positions only (not leading or trailing)
- Fixed deltas (+1) are placed **between** consecutive free deltas
- This ensures all optimizers should converge to similar solutions

### 1 Free Delta (2 variables: x + 1 free delta)

1. **+1+?+1 pattern**
   - Generated from: x=3, deltas=[1, 1.2, 1]
   - Chord: 0¢-498.0¢-952.1¢-1255.7¢
   - Pattern: +1+?+1
   - Expected: x ≈ 3.0, free ≈ 1.2

2. **+2+?+1 pattern**
   - Generated from: x=5, deltas=[2, 2.5, 1]
   - Chord: 0¢-583.6¢-1110.3¢-1284.8¢
   - Pattern: +2+?+1
   - Expected: x ≈ 5.0, free ≈ 2.5

### 2 Free Deltas (3 variables: x + 2 free deltas)

3. **+1+?+1+?+1 pattern**
   - Generated from: x=4, deltas=[1, 1.2, 1, 1.5, 1]
   - Chord: 0¢-386.7¢-758.9¢-1017.7¢-1343.5¢-1534.0¢
   - Pattern: +1+?+1+?+1
   - Fixed +1 between the two free deltas
   - Expected: x ≈ 4.0, free ≈ [1.2, 1.5]

4. **+2+?+1+?+2 pattern**
   - Generated from: x=6, deltas=[2, 1.8, 1, 2.2, 2]
   - Chord: 0¢-499.6¢-847.8¢-1017.1¢-1336.9¢-1584.8¢
   - Pattern: +2+?+1+?+2
   - Fixed +1 between the two free deltas
   - Expected: x ≈ 6.0, free ≈ [1.8, 2.2]

## Success Criteria

1. **Convergence**: All methods should successfully converge (error < 0.01)
2. **Agreement**: All methods should find similar solutions (error range < 0.001)
3. **Accuracy**: Final error should be small (< 0.01 in linear domain)

## What to Look For

- **L-BFGS-B**: Usually fastest, fewest iterations, but may fail on poorly scaled problems
- **Nelder-Mead**: Most robust, always converges, but slower and more iterations
- **Powell**: Good balance, reliable for quadratic-like objectives

## Running the Tests

Open `test_pdr.html` in a web browser. The tests will run automatically and display:
- Individual optimizer results for each test case
- Performance metrics (runtime, iterations)
- Best result for each case
- Agreement analysis between methods
- Overall success rate

## Interpreting Results

**Green rows**: Successful convergence (error < 0.01)
**Red rows**: Failed to converge or high error
**Agreement message**:
- ✓ Green: Methods agree (error range < 1e-6)
- ⚠ Red: Methods disagree significantly (investigate why)

## Expected Performance

| Method       | Speed    | Robustness | Best For                  |
| ------------ | -------- | ---------- | ------------------------- |
| L-BFGS-B     | Fastest  | Medium     | Smooth, well-scaled       |
| Nelder-Mead  | Slowest  | Highest    | Non-smooth, low-dim       |
| Powell       | Medium   | High       | General purpose           |

## Implementation Details

- All methods use multiple starting points (5 by default) and select the best result
- Bounds: x > 0.01, free deltas unbounded
- Tolerance: 1e-8 for all methods
- Max iterations: L-BFGS=100, Nelder-Mead=400, Powell=250

All three optimizers converge to similar solutions with errors < 0.001 and agreement range < 0.0005.

## Error Domains and Models

Like FDR, PDR now supports multiple error calculation modes:

**Domains:**
- `linear` (default): Minimize error in frequency ratio space
- `log`: Minimize error in logarithmic space (perceptually more uniform)

**Models:**
- `rooted` (default): Compare each note to the root
- `pairwise`: Compare all interval pairs (ensures global consistency)
- `all-steps`: Compare only successive intervals (better for melodic applications)

This gives 6 total modes (3 models × 2 domains). Use the `domain` and `model` options in `solvePDRChord()`:

```javascript
solvePDRChord(deltas, ratios, {
  method: 'lbfgs',
  domain: 'log',      // 'linear' or 'log'
  model: 'pairwise'   // 'rooted', 'pairwise', or 'all-steps'
});
```