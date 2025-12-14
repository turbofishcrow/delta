/**
 * Optimization utilities for Delta-Rational Chord Explorer
 * L-BFGS and L-BFGS-B implementations for constrained optimization
 */

// Helper: dot product
function dot(a, b) {
  return a.reduce((sum, ai, i) => sum + ai * b[i], 0);
}

// Numerical gradient computation
function numericalGradient(f, x, eps = 1e-8) {
  const grad = new Array(x.length);
  for (let i = 0; i < x.length; i++) {
    const x_plus = [...x];
    const x_minus = [...x];
    x_plus[i] += eps;
    x_minus[i] -= eps;
    grad[i] = (f(x_plus) - f(x_minus)) / (2 * eps);
  }
  return grad;
}

// Simple L-BFGS implementation (unbounded)
class LBFGS {
  constructor(options = {}) {
    this.historySize = options.historySize || 10;
    this.maxIterations = options.maxIterations || 100;
    this.tolerance = options.tolerance || 1e-6;
  }

  minimize(f, grad, x0) {
    const n = x0.length;
    let x = [...x0];
    let fx = f(x);
    let g = grad(x);

    const s_history = [];
    const y_history = [];
    const rho_history = [];

    for (let iter = 0; iter < this.maxIterations; iter++) {
      // Check convergence
      const gradNorm = Math.sqrt(g.reduce((sum, gi) => sum + gi * gi, 0));
      if (gradNorm < this.tolerance) {
        return { x, fx, iterations: iter, success: true };
      }

      // Compute search direction using two-loop recursion
      const q = [...g];
      const alpha = [];

      for (let i = s_history.length - 1; i >= 0; i--) {
        alpha[i] = rho_history[i] * dot(s_history[i], q);
        for (let j = 0; j < n; j++) {
          q[j] -= alpha[i] * y_history[i][j];
        }
      }

      // Initial Hessian approximation (scaled identity)
      let gamma = 1;
      if (s_history.length > 0) {
        const k = s_history.length - 1;
        gamma = dot(s_history[k], y_history[k]) / dot(y_history[k], y_history[k]);
      }

      const z = q.map(qi => gamma * qi);

      for (let i = 0; i < s_history.length; i++) {
        const beta = rho_history[i] * dot(y_history[i], z);
        for (let j = 0; j < n; j++) {
          z[j] += s_history[i][j] * (alpha[i] - beta);
        }
      }

      const p = z.map(zi => -zi); // Search direction

      // Line search (simple backtracking)
      let stepSize = 1.0;
      const c1 = 1e-4;
      const rho_ls = 0.5;
      const maxLineSearch = 20;

      let x_new = x.map((xi, i) => xi + stepSize * p[i]);
      let fx_new = f(x_new);

      for (let ls = 0; ls < maxLineSearch; ls++) {
        if (fx_new <= fx + c1 * stepSize * dot(g, p)) {
          break;
        }
        stepSize *= rho_ls;
        x_new = x.map((xi, i) => xi + stepSize * p[i]);
        fx_new = f(x_new);
      }

      // Update history
      const s = x_new.map((xi, i) => xi - x[i]);
      const g_new = grad(x_new);
      const y = g_new.map((gi, i) => gi - g[i]);

      const sy = dot(s, y);
      if (sy > 1e-10) {
        s_history.push(s);
        y_history.push(y);
        rho_history.push(1 / sy);

        if (s_history.length > this.historySize) {
          s_history.shift();
          y_history.shift();
          rho_history.shift();
        }
      }

      x = x_new;
      fx = fx_new;
      g = g_new;
    }

    return { x, fx, iterations: this.maxIterations, success: false };
  }
}

// Box constraint transformation using log-barrier
class BoundedLBFGS {
  constructor(options = {}) {
    this.lbfgs = new LBFGS(options);
    this.barrierWeight = options.barrierWeight || 1e-6;
  }

  minimize(f, bounds, x0) {
    // Transform to unbounded problem using log barrier
    const transformedF = (x) => {
      let penalty = 0;
      for (let i = 0; i < x.length; i++) {
        const [lower, upper] = bounds[i];
        if (lower !== null && x[i] <= lower) {
          return Infinity;
        }
        if (upper !== null && x[i] >= upper) {
          return Infinity;
        }

        // Log barrier penalties
        if (lower !== null) {
          penalty -= this.barrierWeight * Math.log(x[i] - lower);
        }
        if (upper !== null) {
          penalty -= this.barrierWeight * Math.log(upper - x[i]);
        }
      }
      return f(x) + penalty;
    };

    const grad = (x) => numericalGradient(transformedF, x);

    const result = this.lbfgs.minimize(transformedF, grad, x0);

    // Return the actual function value, not the transformed one
    result.fx = f(result.x);

    return result;
  }
}

/**
 * Generate smart initial guesses
 */
function generateStartingPoints(rValues, deltas, numFree, numStarts) {
  const points = [];

  // For PDR chords, we have r_i = (x + D_i) / x
  // So x = D_i / (r_i - 1)
  // Try to estimate x from intervals with known deltas

  const xEstimates = [];

  // Estimate x from each known delta position
  let cumulativeDelta = 0;
  for (let i = 0; i < deltas.length; i++) {
    if (deltas[i] !== null) {
      cumulativeDelta += deltas[i];
      const ratio = rValues[i];
      // ratio = (x + cumulativeDelta) / x
      // x * ratio = x + cumulativeDelta
      // x * (ratio - 1) = cumulativeDelta
      const xEst = cumulativeDelta / (ratio - 1);
      if (xEst > 0 && isFinite(xEst)) {
        xEstimates.push(xEst);
      }
    } else {
      cumulativeDelta = null; // Reset when we hit a free delta
      break; // Can't use deltas after this
    }
  }

  // Add some generic estimates
  const avgR = rValues.reduce((sum, r) => sum + r, 0) / rValues.length;
  xEstimates.push(1.0);
  xEstimates.push(rValues[0]);
  xEstimates.push(avgR);
  xEstimates.push((rValues[0] + rValues[rValues.length - 1]) / 2);

  // For each x estimate, estimate free deltas
  for (let i = 0; i < Math.max(numStarts, xEstimates.length); i++) {
    const x = xEstimates[i % xEstimates.length];
    const freeDeltas = [];

    // Try to estimate each free delta from its position
    let cumDelta = 0;
    let freeIdx = 0;
    for (let j = 0; j < deltas.length && freeIdx < numFree; j++) {
      if (deltas[j] === null) {
        // r_j = (x + cumDelta + freeDelta) / x
        // freeDelta = r_j * x - x - cumDelta
        const freeDeltaEst = rValues[j] * x - x - cumDelta;
        freeDeltas.push(Math.max(0.1, freeDeltaEst)); // Ensure positive
        cumDelta += freeDeltaEst;
        freeIdx++;
      } else {
        cumDelta += deltas[j];
      }
    }

    // Fill remaining free deltas if needed
    while (freeDeltas.length < numFree) {
      freeDeltas.push(1.0);
    }

    points.push([x, ...freeDeltas]);
  }

  return points;
}

/**
 * Solve PDR chord optimization problem
 * @param {Array} deltas - Array with numbers for fixed deltas, null for free variables
 * @param {Array} rValues - Target frequency ratios [r1, r2, r3, ...]
 * @param {Object} options - Optimization options
 * @param {string} options.method - Optimizer to use: 'lbfgs' (default), 'nelder-mead', 'powell'
 * @param {string} options.domain - Error domain: 'linear' (default) or 'log'
 * @param {string} options.model - Error model: 'rooted' (default), 'pairwise', or 'all-steps'
 * @returns {Object} Solution with x, freeDeltas, error, success
 */
function solvePDRChord(deltas, rValues, options = {}) {
  const numFree = deltas.filter(d => d === null).length;
  const method = options.method || 'lbfgs';
  const domain = options.domain || 'linear';
  const model = options.model || 'rooted';

  // Build error function
  function errorFunction(params) {
    const x = params[0];
    const freeVars = params.slice(1);

    // Build cumulative deltas
    const D = [];
    let cumsum = 0;
    let freeIdx = 0;

    for (const delta of deltas) {
      if (delta === null) {
        cumsum += freeVars[freeIdx++];
      } else {
        cumsum += delta;
      }
      D.push(cumsum);
    }

    // Build predicted ratios from root
    const predictedRatios = D.map(d => (x + d) / x);

    // Calculate error based on model
    let sumSquaredError = 0;

    if (model === 'rooted') {
      // Rooted: compare each note to root
      for (let i = 0; i < rValues.length; i++) {
        const predicted = predictedRatios[i];
        const actual = rValues[i];

        if (domain === 'linear') {
          const diff = predicted - actual;
          sumSquaredError += diff * diff;
        } else { // log
          const diff = Math.log(predicted) - Math.log(actual);
          sumSquaredError += diff * diff;
        }
      }
    } else if (model === 'pairwise') {
      // Pairwise: compare all interval pairs
      const allPredicted = [1, ...predictedRatios];
      const allActual = [1, ...rValues];

      for (let i = 0; i < allPredicted.length; i++) {
        for (let j = i + 1; j < allPredicted.length; j++) {
          const predictedInterval = allPredicted[j] / allPredicted[i];
          const actualInterval = allActual[j] / allActual[i];

          if (domain === 'linear') {
            const diff = predictedInterval - actualInterval;
            sumSquaredError += diff * diff;
          } else { // log
            const diff = Math.log(predictedInterval) - Math.log(actualInterval);
            sumSquaredError += diff * diff;
          }
        }
      }
    } else if (model === 'all-steps') {
      // All-steps: compare only successive intervals
      const allPredicted = [1, ...predictedRatios];
      const allActual = [1, ...rValues];

      for (let i = 0; i < rValues.length; i++) {
        const predictedInterval = allPredicted[i + 1] / allPredicted[i];
        const actualInterval = allActual[i + 1] / allActual[i];

        if (domain === 'linear') {
          const diff = predictedInterval - actualInterval;
          sumSquaredError += diff * diff;
        } else { // log
          const diff = Math.log(predictedInterval) - Math.log(actualInterval);
          sumSquaredError += diff * diff;
        }
      }
    }

    return sumSquaredError;
  }

  // Set up bounds: x > 0, free variables unbounded
  const bounds = [[0.01, null], ...Array(numFree).fill([null, null])];

  // Try multiple starting points
  const startingPoints = generateStartingPoints(rValues, deltas, numFree, options.numStarts || 3);

  let bestResult = null;
  let bestError = Infinity;

  if (method === 'lbfgs') {
    const optimizer = new BoundedLBFGS({
      historySize: options.historySize || 10,
      maxIterations: options.maxIterations || 100,
      tolerance: options.tolerance || 1e-8,
      barrierWeight: options.barrierWeight || 1e-6
    });

    for (const x0 of startingPoints) {
      try {
        const result = optimizer.minimize(errorFunction, bounds, x0);
        if (result.fx < bestError) {
          bestError = result.fx;
          bestResult = result;
        }
      } catch (e) {
        // console.warn('Optimization failed for starting point:', x0, e);
      }
    }
  } else if (method === 'nelder-mead') {
    const optimizer = new NelderMead({
      maxIterations: options.maxIterations || 400,
      tolerance: options.tolerance || 1e-8
    });

    for (const x0 of startingPoints) {
      try {
        const result = optimizer.minimize(errorFunction, x0, bounds);
        if (result.fx < bestError) {
          bestError = result.fx;
          bestResult = result;
        }
      } catch (e) {
        // console.warn('Optimization failed for starting point:', x0, e);
      }
    }
  } else if (method === 'powell') {
    const optimizer = new Powell({
      maxIterations: options.maxIterations || 250,
      tolerance: options.tolerance || 1e-8
    });

    for (const x0 of startingPoints) {
      try {
        const result = optimizer.minimize(errorFunction, x0, bounds);
        if (result.fx < bestError) {
          bestError = result.fx;
          bestResult = result;
        }
      } catch (e) {
        // console.warn('Optimization failed for starting point:', x0, e);
      }
    }
  } else {
    return { success: false, error: `Unknown method: ${method}` };
  }

  if (!bestResult) {
    return { success: false, error: 'All optimizations failed' };
  }

  return {
    x: bestResult.x[0],
    freeDeltas: bestResult.x.slice(1),
    error: Math.sqrt(bestResult.fx),
    iterations: bestResult.iterations,
    success: bestResult.success
  };
}

// Nelder-Mead Simplex Method
class NelderMead {
  constructor(options = {}) {
    this.maxIterations = options.maxIterations || 200;
    this.tolerance = options.tolerance || 1e-6;
    this.alpha = options.alpha || 1.0;  // Reflection
    this.gamma = options.gamma || 2.0;  // Expansion
    this.rho = options.rho || 0.5;      // Contraction
    this.sigma = options.sigma || 0.5;  // Shrinkage
  }

  minimize(f, x0, bounds = null) {
    const n = x0.length;

    // Initialize simplex
    const simplex = [x0];
    for (let i = 0; i < n; i++) {
      const vertex = [...x0];
      vertex[i] += 0.05 * (Math.abs(x0[i]) + 1);
      simplex.push(vertex);
    }

    // Project onto bounds if needed
    const project = (x) => {
      if (!bounds) return x;
      return x.map((xi, i) => {
        const [lower, upper] = bounds[i];
        if (lower !== null && xi < lower) return lower + 1e-10;
        if (upper !== null && xi > upper) return upper - 1e-10;
        return xi;
      });
    };

    let iteration = 0;
    while (iteration < this.maxIterations) {
      // Evaluate all vertices
      const values = simplex.map(x => ({ x: project(x), fx: f(project(x)) }));
      values.sort((a, b) => a.fx - b.fx);

      // Check convergence
      const fRange = values[n].fx - values[0].fx;
      if (fRange < this.tolerance) {
        return {
          x: values[0].x,
          fx: values[0].fx,
          iterations: iteration,
          success: true
        };
      }

      // Compute centroid (excluding worst point)
      const centroid = new Array(n).fill(0);
      for (let i = 0; i < n; i++) {
        for (let j = 0; j < n; j++) {
          centroid[j] += values[i].x[j];
        }
      }
      for (let j = 0; j < n; j++) {
        centroid[j] /= n;
      }

      // Reflection
      const reflected = centroid.map((cj, j) =>
        cj + this.alpha * (cj - values[n].x[j])
      );
      const fReflected = f(project(reflected));

      if (values[0].fx <= fReflected && fReflected < values[n - 1].fx) {
        values[n] = { x: reflected, fx: fReflected };
        simplex[n] = reflected;
        iteration++;
        continue;
      }

      // Expansion
      if (fReflected < values[0].fx) {
        const expanded = centroid.map((cj, j) =>
          cj + this.gamma * (reflected[j] - cj)
        );
        const fExpanded = f(project(expanded));

        if (fExpanded < fReflected) {
          values[n] = { x: expanded, fx: fExpanded };
          simplex[n] = expanded;
        } else {
          values[n] = { x: reflected, fx: fReflected };
          simplex[n] = reflected;
        }
        iteration++;
        continue;
      }

      // Contraction
      const contracted = centroid.map((cj, j) =>
        cj + this.rho * (values[n].x[j] - cj)
      );
      const fContracted = f(project(contracted));

      if (fContracted < values[n].fx) {
        values[n] = { x: contracted, fx: fContracted };
        simplex[n] = contracted;
        iteration++;
        continue;
      }

      // Shrinkage
      for (let i = 1; i <= n; i++) {
        simplex[i] = simplex[i].map((xi, j) =>
          values[0].x[j] + this.sigma * (xi - values[0].x[j])
        );
      }
      iteration++;
    }

    const values = simplex.map(x => ({ x: project(x), fx: f(project(x)) }));
    values.sort((a, b) => a.fx - b.fx);

    return {
      x: values[0].x,
      fx: values[0].fx,
      iterations: this.maxIterations,
      success: false
    };
  }
}

// Powell's Method (derivative-free)
class Powell {
  constructor(options = {}) {
    this.maxIterations = options.maxIterations || 100;
    this.tolerance = options.tolerance || 1e-6;
  }

  minimize(f, x0, bounds = null) {
    const n = x0.length;
    let x = [...x0];
    let fx = f(x);

    // Project onto bounds
    const project = (x) => {
      if (!bounds) return x;
      return x.map((xi, i) => {
        const [lower, upper] = bounds[i];
        if (lower !== null && xi < lower) return lower + 1e-10;
        if (upper !== null && xi > upper) return upper - 1e-10;
        return xi;
      });
    };

    // Initial search directions (coordinate axes)
    const directions = Array.from({ length: n }, (_, i) => {
      const d = new Array(n).fill(0);
      d[i] = 1;
      return d;
    });

    for (let iter = 0; iter < this.maxIterations; iter++) {
      const x_old = [...x];

      // Line minimization along each direction
      for (let i = 0; i < n; i++) {
        const lineFunc = (alpha) => {
          const x_new = x.map((xi, j) => xi + alpha * directions[i][j]);
          return f(project(x_new));
        };

        // Golden section search
        const alpha_opt = this.goldenSection(lineFunc, -1, 1);
        x = x.map((xi, j) => xi + alpha_opt * directions[i][j]);
        x = project(x);
        fx = f(x);
      }

      // Update directions
      const delta = x.map((xi, i) => xi - x_old[i]);
      const deltaNorm = Math.sqrt(delta.reduce((sum, d) => sum + d * d, 0));

      if (deltaNorm < this.tolerance) {
        return { x, fx, iterations: iter, success: true };
      }

      // Replace first direction with delta
      directions.shift();
      directions.push(delta.map(d => d / deltaNorm));
    }

    return { x, fx, iterations: this.maxIterations, success: false };
  }

  goldenSection(f, a, b, tol = 1e-5) {
    const phi = (1 + Math.sqrt(5)) / 2;
    const resphi = 2 - phi;

    let x1 = a + resphi * (b - a);
    let x2 = b - resphi * (b - a);
    let f1 = f(x1);
    let f2 = f(x2);

    while (Math.abs(b - a) > tol) {
      if (f1 < f2) {
        b = x2;
        x2 = x1;
        f2 = f1;
        x1 = a + resphi * (b - a);
        f1 = f(x1);
      } else {
        a = x1;
        x1 = x2;
        f1 = f2;
        x2 = b - resphi * (b - a);
        f2 = f(x2);
      }
    }

    return (a + b) / 2;
  }
}

/**
 * Process PDR chord data: coalesce consecutive free deltas and trim leading/trailing free segments.
 *
 * @param {Array<number>} intervalsFromRoot - Frequency ratios from root for each interval
 * @param {Array<number>} targetDeltas - Target delta values for each interval
 * @param {Array<boolean>} isFree - Whether each delta is free (to be optimized)
 * @returns {Object|null} Processed data or null if all deltas are free:
 *   - includedRatios: Ratios after trimming and rebasing
 *   - includedTargetDeltas: Target deltas for included range
 *   - includedIsFree: Free flags for included range
 *   - interiorFreeSegments: Array of {start, end, isFree} for free segments within included range
 *   - firstIncludedInterval: Original index of first included interval
 *   - lastIncludedInterval: Original index of last included interval
 */
function preprocessPDRChordData(intervalsFromRoot, targetDeltas, isFree) {
  const n = intervalsFromRoot.length;
  if (n === 0) return null;

  // Group consecutive free deltas into segments
  const segments = [];
  let segStart = 0;
  for (let i = 0; i <= n; i++) {
    if (i === n || (i > 0 && isFree[i] !== isFree[i-1])) {
      segments.push({ start: segStart, end: i - 1, isFree: isFree[segStart] });
      segStart = i;
    }
  }

  // Find first and last fixed segments (trim leading/trailing free)
  let firstFixedIdx = segments.findIndex(s => !s.isFree);
  let lastFixedIdx = segments.length - 1 - [...segments].reverse().findIndex(s => !s.isFree);

  if (firstFixedIdx === -1) {
    // All deltas are free - no constraint, cannot optimize
    return null;
  }

  // Determine the range of intervals to include (excluding leading/trailing free)
  const firstIncludedInterval = segments[firstFixedIdx].start;
  const lastIncludedInterval = segments[lastFixedIdx].end;

  // Build the chord starting from the appropriate base note
  // If we trimmed leading intervals, we need to rebase everything
  let baseRatio = 1.0;
  if (firstIncludedInterval > 0) {
    baseRatio = intervalsFromRoot[firstIncludedInterval - 1];
  }

  // For the included range, we need CUMULATIVE ratios from the (possibly rebased) root
  const includedRatios = [];
  for (let i = firstIncludedInterval; i <= lastIncludedInterval; i++) {
    const cumulativeRatio = intervalsFromRoot[i] / baseRatio;
    includedRatios.push(cumulativeRatio);
  }

  const includedTargetDeltas = targetDeltas.slice(firstIncludedInterval, lastIncludedInterval + 1);
  const includedIsFree = isFree.slice(firstIncludedInterval, lastIncludedInterval + 1);
  const includedN = includedRatios.length;

  // Re-segment the included range
  const includedSegments = [];
  segStart = 0;
  for (let i = 0; i <= includedN; i++) {
    if (i === includedN || (i > 0 && includedIsFree[i] !== includedIsFree[i-1])) {
      includedSegments.push({ start: segStart, end: i - 1, isFree: includedIsFree[segStart] });
      segStart = i;
    }
  }

  // Get indices of free segments (now all are interior)
  const interiorFreeSegments = includedSegments.filter(s => s.isFree);

  // Store original delta proportions within free segments for visualization
  // Calculate actual deltas from the input chord (not target deltas)
  const actualDeltas = [];
  for (let i = 0; i < includedN; i++) {
    const prevRatio = i > 0 ? includedRatios[i - 1] : 1.0;
    const currRatio = includedRatios[i];
    actualDeltas.push(currRatio - prevRatio);
  }

  const freeSegmentProportions = [];
  interiorFreeSegments.forEach(seg => {
    const segmentDeltas = [];
    for (let i = seg.start; i <= seg.end; i++) {
      segmentDeltas.push(actualDeltas[i]);
    }
    const total = segmentDeltas.reduce((a, b) => a + b, 0);
    const proportions = segmentDeltas.map(d => d / total);
    freeSegmentProportions.push(proportions);
  });

  return {
    includedRatios,
    includedTargetDeltas,
    includedIsFree,
    interiorFreeSegments,
    freeSegmentProportions,
    firstIncludedInterval,
    lastIncludedInterval
  };
}

/**
 * Calculate PDR (Partially Delta-Rational) least-squares error.
 * Pure function that doesn't depend on DOM.
 *
 * @param {Array<number>} intervalsFromRoot - Frequency ratios from root [r1, r2, ...]
 * @param {Array<number>} targetDeltas - Target delta values [d1, d2, ...]
 * @param {Array<boolean>} isFree - Whether each delta is free [true/false, ...]
 * @param {string} domain - "linear" or "log" (logarithmic)
 * @param {string} model - "rooted", "pairwise", or "all-steps"
 * @returns {{error: number, x: number, freeValues: number[]}|null} - Result or null if error
 */
function calculatePDRError(intervalsFromRoot, targetDeltas, isFree, domain, model) {
  // Process chord data: coalesce consecutive free deltas and trim leading/trailing free segments
  const processed = preprocessPDRChordData(intervalsFromRoot, targetDeltas, isFree);
  if (!processed) {
    // All deltas are free - no constraint, error is always 0
    return { error: 0, x: 1, freeValues: targetDeltas.slice() };
  }

  const {
    includedRatios,
    includedTargetDeltas,
    includedIsFree,
    interiorFreeSegments
  } = processed;
  const includedN = includedRatios.length;

  // NORMALIZATION: Scale the delta signature to improve numerical conditioning
  const targetX = 5.0; // Target x value after scaling

  // Estimate unscaled x from first fixed delta (if available)
  let estimatedUnscaledX = 1.0;
  const firstFixedDeltaIdx = includedIsFree.findIndex(free => !free);
  if (firstFixedDeltaIdx !== -1) {
    const firstDelta = includedTargetDeltas[firstFixedDeltaIdx];
    const firstRatio = includedRatios[firstFixedDeltaIdx];
    if (firstRatio > 1 && firstDelta > 0) {
      estimatedUnscaledX = firstDelta / (firstRatio - 1);
    }
  }

  // Calculate scaling factor
  const deltaScaleFactor = targetX / Math.max(0.1, estimatedUnscaledX);

  // Scale all target deltas
  const scaledTargetDeltas = includedTargetDeltas.map(d => d * deltaScaleFactor);

  // Number of free variables to optimize
  const numFreeVars = interiorFreeSegments.length;

  // Build the optimization problem for L-BFGS-B
  function buildErrorFunction() {
    return function(params) {
      const x = params[0];
      const freeVals = params.slice(1);

      // Build cumulative deltas using SCALED deltas
      const deltas = scaledTargetDeltas.slice();

      // Update free segments with their values
      interiorFreeSegments.forEach((seg, idx) => {
        const segLength = seg.end - seg.start + 1;
        const valPerDelta = freeVals[idx] / segLength;
        for (let i = seg.start; i <= seg.end; i++) {
          deltas[i] = valPerDelta;
        }
      });

      // Compute cumulative sums
      const cumulative = [];
      let sum = 0;
      for (let i = 0; i < includedN; i++) {
        sum += deltas[i];
        cumulative.push(sum);
      }

      // Build target ratios
      const targetRatios = [1]; // Root
      for (let i = 0; i < includedN; i++) {
        targetRatios.push((x + cumulative[i]) / x);
      }

      // Calculate sum of squared errors based on domain and model
      let errorSq = 0;

      if (model === "rooted") {
        for (let i = 0; i < includedN; i++) {
          const target = targetRatios[i + 1];
          const actual = includedRatios[i];

          if (domain === "linear") {
            const diff = target - actual;
            errorSq += diff * diff;
          } else { // log
            const diff = Math.log(target) - Math.log(actual);
            errorSq += diff * diff;
          }
        }
      } else if (model === "pairwise") {
        const allRatios = [1, ...includedRatios];
        const allTargetRatios = targetRatios;

        for (let i = 0; i < allTargetRatios.length; i++) {
          for (let j = i + 1; j < allTargetRatios.length; j++) {
            const targetInterval = allTargetRatios[j] / allTargetRatios[i];
            const actualInterval = allRatios[j] / allRatios[i];

            if (domain === "linear") {
              const diff = targetInterval - actualInterval;
              errorSq += diff * diff;
            } else { // log
              const diff = Math.log(targetInterval) - Math.log(actualInterval);
              errorSq += diff * diff;
            }
          }
        }
      } else if (model === "all-steps") {
        const allRatios = [1, ...includedRatios];
        const allTargetRatios = targetRatios;

        for (let i = 0; i < includedN; i++) {
          const targetInterval = allTargetRatios[i + 1] / allTargetRatios[i];
          const actualInterval = allRatios[i + 1] / allRatios[i];

          if (domain === "linear") {
            const diff = targetInterval - actualInterval;
            errorSq += diff * diff;
          } else { // log
            const diff = Math.log(targetInterval) - Math.log(actualInterval);
            errorSq += diff * diff;
          }
        }
      }

      return errorSq;
    };
  }

  // Build initial guess (using scaled deltas)
  let initialX = targetX;
  if (scaledTargetDeltas.length > 0 && !includedIsFree[0]) {
    const firstDelta = scaledTargetDeltas[0];
    const firstRatio = includedRatios[0];
    if (firstRatio > 1 && firstDelta > 0) {
      initialX = firstDelta / (firstRatio - 1);
    }
  }

  if (initialX <= 0 || !isFinite(initialX)) {
    initialX = targetX;
  }

  const initialFreeVals = interiorFreeSegments.map(seg => {
    const segStart = seg.start;
    const segEnd = seg.end;
    const segLength = segEnd - segStart + 1;

    let estimatedDeltaSum = 1.0 * segLength * deltaScaleFactor;

    if (segEnd < includedN - 1) {
      const ratioBefore = segStart > 0 ? includedRatios[segStart - 1] : 1;
      const ratioAfter = includedRatios[segEnd + 1];
      estimatedDeltaSum = initialX * (ratioAfter - ratioBefore) * 0.5;
    }

    return Math.max(0.1, estimatedDeltaSum);
  });

  const initialParams = [initialX, ...initialFreeVals];

  // Set up bounds: x > 0.01, free variables unbounded
  const bounds = [[1e-6, null], ...Array(numFreeVars).fill([null, null])];

  // Run optimization
  const errorFn = buildErrorFunction();
  const optimizer = new BoundedLBFGS({
    historySize: 10,
    maxIterations: 200,
    tolerance: 1e-10,
    barrierWeight: 1e-10
  });

  let bestResult = null;
  let bestError = Infinity;

  // Try multiple starting points for robustness
  const startingPoints = [
    initialParams,
    [targetX, ...initialFreeVals],
    [targetX * 0.5, ...initialFreeVals.map(v => v * 0.5)],
    [targetX * 2.0, ...initialFreeVals.map(v => v * 2.0)],
  ];

  for (const x0 of startingPoints) {
    try {
      const result = optimizer.minimize(errorFn, bounds, x0);
      if (result.fx < bestError && !isNaN(result.fx)) {
        bestError = result.fx;
        bestResult = result;
      }
    } catch (e) {
      // Silently continue
    }
  }

  if (!bestResult || !bestResult.success || isNaN(bestResult.fx)) {
    return null;
  }

  const finalX = bestResult.x[0];
  const finalFreeVals = bestResult.x.slice(1);

  // UNSCALE the results
  const unscaledX = finalX / deltaScaleFactor;
  const unscaledFreeVals = finalFreeVals.map(v => v / deltaScaleFactor);

  // Handle numerical precision issues
  let trueErrorSquared = bestResult.fx;
  if (trueErrorSquared < 0 && trueErrorSquared > -1e-6) {
    trueErrorSquared = errorFn([finalX, ...finalFreeVals]);

    if (trueErrorSquared < 0) {
      trueErrorSquared = 0;
    }
  }

  let finalError = Math.sqrt(Math.abs(trueErrorSquared));

  // Convert to cents if logarithmic
  if (domain === "log") {
    finalError = finalError * (1200 / Math.LN2);
  }

  // Validation
  if (isNaN(finalError) || !isFinite(finalError)) {
    return null;
  }

  return {
    error: finalError,
    x: unscaledX,
    freeValues: unscaledFreeVals,
    // Include preprocessing info for visualization
    firstIncludedInterval: processed.firstIncludedInterval,
    lastIncludedInterval: processed.lastIncludedInterval,
    includedTargetDeltas: processed.includedTargetDeltas,
    includedIsFree: processed.includedIsFree,
    interiorFreeSegments: processed.interiorFreeSegments,
    freeSegmentProportions: processed.freeSegmentProportions
  };
}

// Export for use in other modules
if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    LBFGS,
    BoundedLBFGS,
    NelderMead,
    Powell,
    dot,
    numericalGradient,
    generateStartingPoints,
    solvePDRChord,
    preprocessPDRChordData,
    calculatePDRError
  };
}
