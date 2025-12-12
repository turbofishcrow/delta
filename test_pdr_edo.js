const { solvePDRChord } = require('./pdr.js');

function edoToRatio(steps, divisions) {
  return Math.pow(2, steps / divisions);
}

// Test case 1: [3\13, 8\13, 10\13], target +1+?+1
const test1 = {
  name: "[3\\13, 8\\13, 10\\13], target +1+?+1",
  ratios: [
    edoToRatio(3, 13),
    edoToRatio(8, 13),
    edoToRatio(10, 13)
  ],
  deltas: [1, null, 1]
};

// Test case 2: [3\13, 9\14, 11\14], target +1+?+1
const test2 = {
  name: "[3\\13, 9\\14, 11\\14], target +1+?+1",
  ratios: [
    edoToRatio(3, 13),
    edoToRatio(9, 14),
    edoToRatio(11, 14)
  ],
  deltas: [1, null, 1]
};

const domains = ['linear', 'log'];
const models = ['rooted', 'pairwise', 'all-steps'];

function testChord(testCase) {
  console.log(`\n${testCase.name}`);
  console.log(`Ratios: ${testCase.ratios.map(r => r.toFixed(6)).join(', ')}`);
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

      const xStr = r.x ? r.x.toFixed(6) : 'N/A';
      const freeStr = r.freeDeltas ? r.freeDeltas.map(f => f.toFixed(6)).join(', ') : 'N/A';
      const errStr = r.error ? r.error.toFixed(8) : 'N/A';

      console.log(`  ${domain.padEnd(6)} / ${model.padEnd(10)}: x=${xStr}, free=[${freeStr}], err=${errStr}`);
    });
  });
}

testChord(test1);
testChord(test2);

console.log('\n');
