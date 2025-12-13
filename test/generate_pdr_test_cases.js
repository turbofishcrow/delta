// Generate actual PDR chords for testing
function ratioToCents(ratio) {
  return 1200 * Math.log2(ratio);
}

function centsToRatio(cents) {
  return Math.pow(2, cents / 1200);
}

// Generate a PDR chord given x and delta pattern
function generatePDRChord(x, deltas) {
  const cumulativeDeltas = [];
  let sum = 0;
  for (const d of deltas) {
    sum += d;
    cumulativeDeltas.push(sum);
  }

  const ratios = cumulativeDeltas.map(D => (x + D) / x);
  return ratios;
}

// Add small random perturbation to make it approximate
function perturb(ratio, maxCents = 10) {
  const cents = ratioToCents(ratio);
  const perturbedCents = cents + (Math.random() - 0.5) * maxCents;
  return centsToRatio(perturbedCents);
}

console.log("Generated PDR Test Cases");
console.log("=" .repeat(80));

// Test case 1: +1+?+1 with x=3
console.log("\n1 free delta: +1+?+1");
const deltas1 = [1, 1.2, 1];
const x1 = 3.0;
const exact1 = generatePDRChord(x1, deltas1);
const approx1 = exact1.map(r => perturb(r, 5));
console.log(`  Exact x: ${x1}`);
console.log(`  Exact deltas: [${deltas1.join(", ")}]`);
console.log(`  Pattern for optimization: [1, null, 1]`);
console.log(`  Exact ratios: [${exact1.map(r => r.toFixed(6)).join(", ")}]`);
console.log(`  Exact cents: [${exact1.map(r => ratioToCents(r).toFixed(1)).join("c, ")}c]`);
console.log(`  Approx ratios: [${approx1.map(r => r.toFixed(6)).join(", ")}]`);
console.log(`  Approx cents: [${approx1.map(r => ratioToCents(r).toFixed(1)).join("c, ")}c]`);
console.log(`  Expected free delta: ~${deltas1[1]}`);

// Test case 2: +2+?+1 with x=5
console.log("\n1 free delta: +2+?+1");
const deltas2 = [2, 2.5, 1];
const x2 = 5.0;
const exact2 = generatePDRChord(x2, deltas2);
const approx2 = exact2.map(r => perturb(r, 5));
console.log(`  Exact x: ${x2}`);
console.log(`  Exact deltas: [${deltas2.join(", ")}]`);
console.log(`  Pattern for optimization: [2, null, 1]`);
console.log(`  Exact ratios: [${exact2.map(r => r.toFixed(6)).join(", ")}]`);
console.log(`  Exact cents: [${exact2.map(r => ratioToCents(r).toFixed(1)).join("c, ")}c]`);
console.log(`  Approx ratios: [${approx2.map(r => r.toFixed(6)).join(", ")}]`);
console.log(`  Approx cents: [${approx2.map(r => ratioToCents(r).toFixed(1)).join("c, ")}c]`);
console.log(`  Expected free delta: ~${deltas2[1]}`);

// Test case 3: +1+?+1+?+1 with x=4
console.log("\n2 free deltas: +1+?+1+?+1");
const deltas3 = [1, 1.2, 1, 1.5, 1];
const x3 = 4.0;
const exact3 = generatePDRChord(x3, deltas3);
const approx3 = exact3.map(r => perturb(r, 5));
console.log(`  Exact x: ${x3}`);
console.log(`  Exact deltas: [${deltas3.join(", ")}]`);
console.log(`  Pattern for optimization: [1, null, 1, null, 1]`);
console.log(`  Exact ratios: [${exact3.map(r => r.toFixed(6)).join(", ")}]`);
console.log(`  Exact cents: [${exact3.map(r => ratioToCents(r).toFixed(1)).join("c, ")}c]`);
console.log(`  Approx ratios: [${approx3.map(r => r.toFixed(6)).join(", ")}]`);
console.log(`  Approx cents: [${approx3.map(r => ratioToCents(r).toFixed(1)).join("c, ")}c]`);
console.log(`  Expected free deltas: ~[${deltas3[1]}, ${deltas3[3]}]`);

// Test case 4: +2+?+1+?+2 with x=6
console.log("\n2 free deltas: +2+?+1+?+2");
const deltas4 = [2, 1.8, 1, 2.2, 2];
const x4 = 6.0;
const exact4 = generatePDRChord(x4, deltas4);
const approx4 = exact4.map(r => perturb(r, 5));
console.log(`  Exact x: ${x4}`);
console.log(`  Exact deltas: [${deltas4.join(", ")}]`);
console.log(`  Pattern for optimization: [2, null, 1, null, 2]`);
console.log(`  Exact ratios: [${exact4.map(r => r.toFixed(6)).join(", ")}]`);
console.log(`  Exact cents: [${exact4.map(r => ratioToCents(r).toFixed(1)).join("c, ")}c]`);
console.log(`  Approx ratios: [${approx4.map(r => r.toFixed(6)).join(", ")}]`);
console.log(`  Approx cents: [${approx4.map(r => ratioToCents(r).toFixed(1)).join("c, ")}c]`);
console.log(`  Expected free deltas: ~[${deltas4[1]}, ${deltas4[3]}]`);

console.log("\n" + "=".repeat(80));
console.log("\nNOTE: Use the 'Approx cents' values in test_pdr.html");
console.log("These are perturbed versions of actual PDR chords, so optimizers should agree.");
