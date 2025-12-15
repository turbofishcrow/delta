const { solvePDRChord } = require('../pdr.js');

function centsToRatio(cents) {
  return Math.pow(2, cents / 1200);
}

const testCases = [
  {
    name: "+1+?+1",
    ratios: [centsToRatio(498.0), centsToRatio(952.1), centsToRatio(1255.7)],
    deltas: [1, null, 1],
    expected: { x: 3.0, free: [1.2] }
  },
  {
    name: "+2+?+1",
    ratios: [centsToRatio(583.6), centsToRatio(1110.3), centsToRatio(1284.8)],
    deltas: [2, null, 1],
    expected: { x: 5.0, free: [2.5] }
  },
  {
    name: "+1+?+1+?+1",
    ratios: [
      centsToRatio(386.7),
      centsToRatio(758.9),
      centsToRatio(1017.7),
      centsToRatio(1343.5),
      centsToRatio(1534.0)
    ],
    deltas: [1, null, 1, null, 1],
    expected: { x: 4.0, free: [1.2, 1.5] }
  },
  {
    name: "+2+?+1+?+2",
    ratios: [
      centsToRatio(499.6),
      centsToRatio(847.8),
      centsToRatio(1017.1),
      centsToRatio(1336.9),
      centsToRatio(1584.8)
    ],
    deltas: [2, null, 1, null, 2],
    expected: { x: 6.0, free: [1.8, 2.2] }
  }
];

const methods = ['lbfgs', 'bfgs', 'nelder-mead', 'powell'];

testCases.forEach(tc => {
  console.log(`\nTest: ${tc.name}`);
  console.log(`Expected: x=${tc.expected.x}, free=[${tc.expected.free}]`);

  const results = methods.map(m => {
    const maxIter = m === 'lbfgs' ? 100 : m === 'bfgs' ? 100 : m === 'nelder-mead' ? 400 : 250;
    const r = solvePDRChord(tc.deltas, tc.ratios, { method: m, maxIterations: maxIter, numStarts: 5 });
    return { method: m, x: r.x, free: r.freeDeltas, error: r.error, success: r.success };
  });

  results.forEach(r => {
    const xStr = r.x ? r.x.toFixed(4) : 'N/A';
    const freeStr = r.free ? r.free.map(f => f.toFixed(4)).join(', ') : 'N/A';
    const errStr = r.error ? r.error.toFixed(6) : 'N/A';
    console.log(`  ${r.method}: x=${xStr}, free=[${freeStr}], err=${errStr}`);
  });

  const errors = results.map(r => r.error).filter(e => e !== undefined && !isNaN(e));
  if (errors.length > 0) {
    const range = Math.max(...errors) - Math.min(...errors);
    console.log(`  Agreement: ${range < 0.001 ? '✓ GOOD' : '⚠ DISAGREE'} (range: ${range.toFixed(6)})`);
  }
});
