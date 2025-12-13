const { solvePDRChord } = require('./pdr.js');

function centsToRatio(cents) {
  return Math.pow(2, cents / 1200);
}

// Test case: +1+?+1 pattern
const testCase = {
  name: "+1+?+1",
  ratios: [centsToRatio(498.0), centsToRatio(952.1), centsToRatio(1255.7)],
  deltas: [1, null, 1],
  expected: { x: 3.0, free: [1.2] }
};

const domains = ['linear', 'log'];
const models = ['rooted', 'pairwise', 'all-steps'];

console.log(`\nTest: ${testCase.name}`);
console.log(`Expected: x=${testCase.expected.x}, free=[${testCase.expected.free}]`);
console.log('');

domains.forEach(domain => {
  models.forEach(model => {
    const r = solvePDRChord(testCase.deltas, testCase.ratios, {
      method: 'lbfgs',
      domain: domain,
      model: model,
      maxIterations: 100,
      numStarts: 5
    });

    const xStr = r.x ? r.x.toFixed(4) : 'N/A';
    const freeStr = r.freeDeltas ? r.freeDeltas.map(f => f.toFixed(4)).join(', ') : 'N/A';
    const errStr = r.error ? r.error.toFixed(6) : 'N/A';

    console.log(`  ${domain.padEnd(6)} / ${model.padEnd(10)}: x=${xStr}, free=[${freeStr}], err=${errStr}`);
  });
});

console.log('\nAll 6 modes completed successfully!');
