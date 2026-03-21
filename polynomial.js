// Polynomials are encoded as arrays where the i-th element is the coefficient of x^i.

// Helper function for sums.
function sum(numbers) {
  return numbers.reduce((accumulator, currentValue) => accumulator + currentValue, 0);
}

// Helper function
function isBetween(x, l, u) {
  return l < u ? l < x && x < u : l > x && x > u;
}

// Evaluate a polynomial at the number x0.
function ev(polynomial, x0) {
  const evaluatedTerms = polynomial.entries().map(([i, coeff]) => {
    return coeff * Math.pow(x0, i);
  });
  return sum(evaluatedTerms);
}

function inverseQuadInterpolation(p, a, b, c) {
  return ((a * ev(p, b) * ev(p, c))/((ev(p, a) - ev(p, b)) * (ev(p, a) - ev(p, c))))
      + ((b * ev(p, a) * ev(p, c))/((ev(p, b) - ev(p, a)) * (ev(p, b) - ev(p, c))))
      + ((c * ev(p, a) * ev(p, b))/((ev(p, c) - ev(p, a)) * (ev(p, c) - ev(p, b))));
}

// Find a real root of `polynomial`.
// Uses Brent's method to get both convergence speed and robustness.
function findRoot(p, lowerBound, upperBound, maxTries, tolerance) {
  let [l, u] = [lowerBound, upperBound];
  // b should be the "smaller" of |p(l)| and |p(u)|
  let [a, b] = Math.abs(ev(p, l)) > Math.abs(ev(p, u)) 
      ? [l, u]
      : [u, l];
  let c = a;
  let d = undefined;
  let mflag = 1; // set mflag
  let iter = 0;
  while (Math.abs(ev(p, b)) > Number.EPSILON && Math.abs(ev(p, b) - ev(p, a)) > tolerance) {
    let s = Math.abs(ev(p, a) - ev(p, c)) < Number.EPSILON || Math.abs(ev(p, c) - ev(p, b)) < Number.EPSILON
          // If a = c, use secant interpolation
        ? (a * ev(p, b) - b * ev(p, a)) / (ev(p, b) - ev(p, a))
          // Otherwise, use inverse quadratic interpolation
        : inverseQuadInterpolation(p, a, b, c);
    if (!isBetween(s, (3 * a + b) / 4, b)
        || mflag === 1 && Math.abs(s - b) > Math.abs(b - c) / 2
        || mflag === 0 && Math.abs(s - b) > Math.abs(c - d) / 2
        || mflag === 1 && Math.abs(b - c) < tolerance
        || mflag === 0 && Math.abs(c - d) < tolerance) {
      mflag = 1; // set mflag
    } else {
      mflag = 0; // clear mflag
    }
    d = c;
    c = b;
    if (ev(p, a) * ev(p, s) < 0) {
      b = s;
    } else {
      a = s;
    }
    if (Math.abs(ev(p, a)) < Math.abs(ev(p, b))) {
      [a, b] = [b, a]; 
    }
    if (iter === maxTries - 1) {
      return undefined;
    } else {
      iter++;
    }
  }
  return b;
}

function findRootConstrained(poly, lowerBound, upperBound, maxTries=1000, tolerance=1e-4) {
  const maybeRoot = findRoot(poly, lowerBound, upperBound, maxTries, tolerance);
  if (maybeRoot && maybeRoot > lowerBound && maybeRoot < upperBound) {
    return maybeRoot;
  } else {
    return null;
  }
}
