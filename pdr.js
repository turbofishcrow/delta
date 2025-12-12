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
function generateStartingPoints(fValues, deltas, numFree, numStarts) {
  const points = [];

  // For PDR chords, we have f_i = (x + D_i) / x
  // So x = D_i / (f_i - 1)
  // Try to estimate x from intervals with known deltas

  const xEstimates = [];

  // Estimate x from each known delta position
  let cumulativeDelta = 0;
  for (let i = 0; i < deltas.length; i++) {
    if (deltas[i] !== null) {
      cumulativeDelta += deltas[i];
      const ratio = fValues[i];
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
  const avgF = fValues.reduce((sum, f) => sum + f, 0) / fValues.length;
  xEstimates.push(1.0);
  xEstimates.push(fValues[0]);
  xEstimates.push(avgF);
  xEstimates.push((fValues[0] + fValues[fValues.length - 1]) / 2);

  // For each x estimate, estimate free deltas
  for (let i = 0; i < Math.max(numStarts, xEstimates.length); i++) {
    const x = xEstimates[i % xEstimates.length];
    const freeDeltas = [];

    // Try to estimate each free delta from its position
    let cumDelta = 0;
    let freeIdx = 0;
    for (let j = 0; j < deltas.length && freeIdx < numFree; j++) {
      if (deltas[j] === null) {
        // f_j = (x + cumDelta + freeDelta) / x
        // freeDelta = f_j * x - x - cumDelta
        const freeDeltaEst = fValues[j] * x - x - cumDelta;
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
 * @param {Array} fValues - Target frequency ratios [f1, f2, f3, ...]
 * @param {Object} options - Optimization options
 * @param {string} options.method - Optimizer to use: 'lbfgs' (default), 'nelder-mead', 'powell'
 * @param {string} options.domain - Error domain: 'linear' (default) or 'log'
 * @param {string} options.model - Error model: 'rooted' (default), 'pairwise', or 'all-steps'
 * @returns {Object} Solution with x, freeDeltas, error, success
 */
function solvePDRChord(deltas, fValues, options = {}) {
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
      for (let i = 0; i < fValues.length; i++) {
        const predicted = predictedRatios[i];
        const actual = fValues[i];

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
      const allActual = [1, ...fValues];

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
      const allActual = [1, ...fValues];

      for (let i = 0; i < fValues.length; i++) {
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
  const startingPoints = generateStartingPoints(fValues, deltas, numFree, options.numStarts || 3);

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
        console.warn('Optimization failed for starting point:', x0, e);
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
        console.warn('Optimization failed for starting point:', x0, e);
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
        console.warn('Optimization failed for starting point:', x0, e);
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
    solvePDRChord
  };
}
