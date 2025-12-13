const { solvePDRChord } = require('./pdr.js');

function centsToRatio(cents) {
  return Math.pow(2, cents / 1200);
}

// Simple test case with 3 notes (4 total including root)
const testCase = {
  ratios: [centsToRatio(498.0), centsToRatio(952.1), centsToRatio(1255.7)],
  deltas: [1, null, 1]
};

// Manually count comparisons for each model
console.log('\nTest chord: 3 notes above root (4 total)');
console.log('Expected number of interval comparisons:');
console.log('  rooted: 3 (each note to root)');
console.log('  all-steps: 3 (successive pairs only: root-note1, note1-note2, note2-note3)');
console.log('  pairwise: 6 (all pairs: C(4,2) = 4*3/2 = 6)');
console.log('');

// Test with injected comparison counter
function testModel(model, domain) {
  let comparisonCount = 0;

  // Patch Math.log temporarily to count
  const originalLog = Math.log;
  Math.log = function(...args) {
    comparisonCount++;
    return originalLog(...args);
  };

  const result = solvePDRChord(testCase.deltas, testCase.ratios, {
    method: 'lbfgs',
    domain: domain,
    model: model,
    maxIterations: 1,  // Just one iteration to count comparisons
    numStarts: 1
  });

  Math.log = originalLog;

  return comparisonCount;
}

// Test linear domain (doesn't use log, so count differently)
console.log('Linear domain (counting via optimization function calls):');
['rooted', 'all-steps', 'pairwise'].forEach(model => {
  const r1 = solvePDRChord(testCase.deltas, testCase.ratios, {
    method: 'lbfgs',
    domain: 'linear',
    model: model,
    maxIterations: 100,
    numStarts: 5
  });

  const r2 = solvePDRChord(testCase.deltas, testCase.ratios, {
    method: 'lbfgs',
    domain: 'log',
    model: model,
    maxIterations: 100,
    numStarts: 5
  });

  console.log(`  ${model.padEnd(10)}: linear x=${r1.x.toFixed(6)}, log x=${r2.x.toFixed(6)}`);
});

console.log('\nIf pairwise == all-steps, there is a BUG!');
