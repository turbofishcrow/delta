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

    return this.lbfgs.minimize(transformedF, grad, x0);
  }
}

/**
 * Generate smart initial guesses
 */
function generateStartingPoints(fValues, deltas, numFree, numStarts) {
  const points = [];

  // Estimate x from first interval
  const fixedSum = deltas.reduce((sum, d) => sum + (d || 0), 0);
  const avgF = fValues.reduce((sum, f) => sum + f, 0) / fValues.length;

  const xEstimates = [
    1.0,
    fValues[0],
    avgF,
    (fValues[0] + fValues[fValues.length - 1]) / 2
  ];

  for (let i = 0; i < numStarts; i++) {
    const x = xEstimates[i % xEstimates.length];

    // Estimate free deltas from spacing
    const spacing = (fValues[fValues.length - 1] - fValues[0]) / (deltas.length + 1);
    const freeEstimate = spacing * x;

    points.push([x, ...Array(numFree).fill(freeEstimate)]);
  }

  return points;
}

/**
 * Solve PDR chord optimization problem
 * @param {Array} deltas - Array with numbers for fixed deltas, null for free variables
 * @param {Array} fValues - Target frequency ratios [f1, f2, f3, ...]
 * @param {Object} options - Optimization options
 * @returns {Object} Solution with x, freeDeltas, error, success
 */
function solvePDRChord(deltas, fValues, options = {}) {
  const numFree = deltas.filter(d => d === null).length;

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

    // Sum of squared errors
    let error = 0;
    for (let i = 0; i < fValues.length; i++) {
      const predicted = (x + D[i]) / x;
      const diff = predicted - fValues[i];
      error += diff * diff;
    }

    return error;
  }

  // Set up bounds: x > 0, free variables unbounded
  const bounds = [[0.01, null], ...Array(numFree).fill([null, null])];

  // Try multiple starting points
  const startingPoints = generateStartingPoints(fValues, deltas, numFree, options.numStarts || 3);

  let bestResult = null;
  let bestError = Infinity;

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
      console.warn('Optimization failed for starting point:', x0, e);
    }
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

// Export for use in other modules
if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    LBFGS,
    BoundedLBFGS,
    dot,
    numericalGradient,
    generateStartingPoints,
    solvePDRChord
  };
}
