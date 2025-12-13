/**
 * Delta-Rational Chord Error Calculation
 * Computes the optimal x value and error for a given chord and target delta signature.
 */

/**
 * Calculate FDR error for a given chord and target deltas.
 *
 * @param {number[]} ratios - Frequency ratios from root [r1, r2, ...]
 * @param {number[]} targetDeltas - Target delta signature [d1, d2, ...]
 * @param {string} domain - "linear" or "log"
 * @param {string} model - "rooted", "pairwise", or "all-steps"
 * @returns {{error: number, x: number}} - The optimal x and resulting error
 */
function calculateFDRError(ratios, targetDeltas, domain, model) {
  const n = ratios.length;

  // Calculate cumulative deltas
  const cumulativeDeltas = [];
  let cumSum = 0;
  for (let i = 0; i < n; i++) {
    cumSum += targetDeltas[i];
    cumulativeDeltas.push(cumSum);
  }

  const sumD = cumulativeDeltas.reduce((a, b) => a + b, 0);

  // Build error function
  function computeError(x) {
    if (x <= 0) return Infinity;

    const targetRatios = [1];
    for (let i = 0; i < n; i++) {
      targetRatios.push(1 + cumulativeDeltas[i] / x);
    }

    let sumSquaredError = 0;

    if (model === "rooted") {
      // Rooted: compare each interval from root
      for (let i = 0; i < n; i++) {
        const target = targetRatios[i + 1];
        const actual = ratios[i];

        if (domain === "linear") {
          const diff = target - actual;
          sumSquaredError += diff * diff;
        } else {
          const diff = Math.log(target) - Math.log(actual);
          sumSquaredError += diff * diff;
        }
      }
    } else if (model === "pairwise") {
      // Pairwise: compare all interval pairs
      const allRatios = [1, ...ratios];
      const allTargetRatios = targetRatios;

      for (let i = 0; i < allTargetRatios.length; i++) {
        for (let j = i + 1; j < allTargetRatios.length; j++) {
          const targetInterval = allTargetRatios[j] / allTargetRatios[i];
          const actualInterval = allRatios[j] / allRatios[i];

          if (domain === "linear") {
            const diff = targetInterval - actualInterval;
            sumSquaredError += diff * diff;
          } else {
            const diff = Math.log(targetInterval) - Math.log(actualInterval);
            sumSquaredError += diff * diff;
          }
        }
      }
    } else if (model === "all-steps") {
      // All-steps: compare only successive intervals (disjoint)
      const allRatios = [1, ...ratios];
      const allTargetRatios = targetRatios;

      for (let i = 0; i < n; i++) {
        const targetInterval = allTargetRatios[i + 1] / allTargetRatios[i];
        const actualInterval = allRatios[i + 1] / allRatios[i];

        if (domain === "linear") {
          const diff = targetInterval - actualInterval;
          sumSquaredError += diff * diff;
        } else {
          const diff = Math.log(targetInterval) - Math.log(actualInterval);
          sumSquaredError += diff * diff;
        }
      }
    }

    return sumSquaredError;
  }

  // Grid search: two-stage (coarse + fine)
  const avgRatio = ratios.reduce((a, b) => a + b, 0) / n;
  let xMin = sumD / (avgRatio * 10);
  let xMax = sumD / (avgRatio * 0.1);

  let bestX = xMin;
  let bestError = computeError(xMin);
  const coarseSteps = 1000;
  const coarseStep = (xMax - xMin) / coarseSteps;

  for (let i = 0; i <= coarseSteps; i++) {
    const testX = xMin + i * coarseStep;
    const error = computeError(testX);
    if (error < bestError) {
      bestError = error;
      bestX = testX;
    }
  }

  xMin = Math.max(bestX - coarseStep, sumD / (avgRatio * 10));
  xMax = bestX + coarseStep;
  const fineSteps = 1000;
  const fineStep = (xMax - xMin) / fineSteps;

  for (let i = 0; i <= fineSteps; i++) {
    const testX = xMin + i * fineStep;
    const error = computeError(testX);
    if (error < bestError) {
      bestError = error;
      bestX = testX;
    }
  }

  const x = bestX;
  let lsError = Math.sqrt(bestError);

  if (domain === "log") {
    lsError = lsError * (1200 / Math.LN2);
  }

  return { error: lsError, x };
}
