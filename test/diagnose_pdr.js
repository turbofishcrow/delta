// Diagnostic script to see what each optimizer actually finds
const { solvePDRChord } = require('./pdr.js');

function centsToRatio(cents) {
  return Math.pow(2, cents / 1200);
}

const testCases = [
  {
    name: "1 free delta: Major triad +1+?+1",
    ratios: [centsToRatio(400), centsToRatio(700), centsToRatio(1200)],
    deltas: [1, null, 1]
  },
  {
    name: "1 free delta: Minor 7th +2+?+1",
    ratios: [centsToRatio(300), centsToRatio(700), centsToRatio(1000)],
    deltas: [2, null, 1]
  },
  {
    name: "2 free deltas: Major 7th +1+?+1+?+1",
    ratios: [
      centsToRatio(400),
      centsToRatio(700),
      centsToRatio(1100),
      centsToRatio(1400),
      centsToRatio(1700)
    ],
    deltas: [1, null, 1, null, 1]
  }
];

const methods = ['lbfgs', 'nelder-mead', 'powell'];

console.log("PDR Optimization Diagnostic Results\n");
console.log("=" .repeat(80));

testCases.forEach(testCase => {
  console.log(`\nTest: ${testCase.name}`);
  console.log(`Ratios: ${testCase.ratios.map(r => r.toFixed(6)).join(", ")}`);
  console.log(`Deltas: ${testCase.deltas.map(d => d === null ? "?" : d).join(" + ")}`);
  console.log("-".repeat(80));

  const results = {};

  methods.forEach(method => {
    const result = solvePDRChord(testCase.deltas, testCase.ratios, {
      method,
      maxIterations: method === 'nelder-mead' ? 500 : (method === 'powell' ? 200 : 150),
      numStarts: 5
    });

    results[method] = result;

    console.log(`\n${method.toUpperCase()}:`);
    console.log(`  Success: ${result.success}`);
    console.log(`  x: ${result.x?.toFixed(8) || 'N/A'}`);
    console.log(`  Free deltas: [${result.freeDeltas?.map(d => d.toFixed(6)).join(", ") || 'N/A'}]`);
    console.log(`  Error: ${result.error?.toFixed(8) || 'N/A'}`);
    console.log(`  Iterations: ${result.iterations || 'N/A'}`);
  });

  // Check agreement
  const errors = methods
    .map(m => results[m].error)
    .filter(e => e !== undefined && !isNaN(e));

  if (errors.length > 0) {
    const minError = Math.min(...errors);
    const maxError = Math.max(...errors);
    const errorRange = maxError - minError;

    console.log(`\n${"=".repeat(80)}`);
    console.log(`Error range: ${errorRange.toFixed(8)}`);
    console.log(`Min error: ${minError.toFixed(8)}`);
    console.log(`Max error: ${maxError.toFixed(8)}`);

    if (errorRange > 0.001) {
      console.log(`⚠️  WARNING: Large disagreement!`);
    } else {
      console.log(`✓ Methods agree within tolerance`);
    }
  }

  console.log("\n" + "=".repeat(80));
});
