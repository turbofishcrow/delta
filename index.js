const GROUND_INDIGO = "#76f";

const DEFAULT_PITCH_STANDARD = 220;

let currentIntervalCount = 1;

// ============ Audio Playback ============

let audioContext = null;
let activeOscillators = [];
let currentWaveform = "sine"; // "sine", "triangle", or "semisine"

function getAudioContext() {
  if (!audioContext) {
    audioContext = new (window.AudioContext || window.webkitAudioContext)();
  }
  return audioContext;
}

// Create a semisine waveform (half sine wave, then silence)
function createSemisineWave(ctx) {
  const length = 4096;
  const real = new Float32Array(length);
  const imag = new Float32Array(length);
  
  // Semisine is created by summing specific harmonics
  // It's a half-wave rectified sine, which has a specific Fourier series
  real[0] = 0;
  imag[0] = 0;
  
  // Half-wave rectified sine Fourier coefficients
  // DC component
  real[1] = 0;
  imag[1] = 0.5; // fundamental
  
  for (let n = 2; n < length; n++) {
    if (n % 2 === 0) {
      // Even harmonics: 2/(π(1-n²))
      real[n] = 2 / (Math.PI * (1 - n * n));
      imag[n] = 0;
    } else {
      real[n] = 0;
      imag[n] = 0;
    }
  }
  
  return ctx.createPeriodicWave(real, imag, { disableNormalization: false });
}

function createOscillator(frequency, waveform) {
  const ctx = getAudioContext();
  const oscillator = ctx.createOscillator();
  const gainNode = ctx.createGain();
  
  if (waveform === "semisine") {
    oscillator.setPeriodicWave(createSemisineWave(ctx));
  } else {
    oscillator.type = waveform; // "sine" or "triangle"
  }
  
  oscillator.frequency.setValueAtTime(frequency, ctx.currentTime);
  gainNode.gain.setValueAtTime(0.3, ctx.currentTime); // Moderate volume
  
  oscillator.connect(gainNode);
  gainNode.connect(ctx.destination);
  
  return { oscillator, gainNode };
}

function getChordFrequencies() {
  const baseFreq = parseFloat(document.getElementById("input-base-frequency").value) || DEFAULT_PITCH_STANDARD;
  const frequencies = [baseFreq];
  
  // Collect all interval inputs
  for (let i = 1; i <= currentIntervalCount; i++) {
    const centsInput = document.getElementById(`input-interval-${i}-cents`);
    if (centsInput) {
      const cents = parseCents(centsInput.value);
      if (!isNaN(cents)) {
        const freq = baseFreq * Math.pow(2, cents / 1200);
        frequencies.push(freq);
      }
    }
  }
  
  return frequencies;
}

function playChord() {
  stopChord(); // Stop any currently playing chord
  
  const ctx = getAudioContext();
  if (ctx.state === "suspended") {
    ctx.resume();
  }
  
  const frequencies = getChordFrequencies();
  const numNotes = frequencies.length;
  
  frequencies.forEach((freq) => {
    const { oscillator, gainNode } = createOscillator(freq, currentWaveform);
    // Adjust gain based on number of notes to prevent clipping
    gainNode.gain.setValueAtTime(0.3 / Math.sqrt(numNotes), ctx.currentTime);
    oscillator.start();
    activeOscillators.push({ oscillator, gainNode });
  });
}

function stopChord() {
  const ctx = getAudioContext();
  activeOscillators.forEach(({ oscillator, gainNode }) => {
    // Fade out to avoid clicks
    gainNode.gain.setTargetAtTime(0, ctx.currentTime, 0.05);
    oscillator.stop(ctx.currentTime + 0.1);
  });
  activeOscillators = [];
}

function setWaveform(waveform) {
  currentWaveform = waveform;
  // Update button states
  document.querySelectorAll(".waveform-btn").forEach((btn) => {
    btn.classList.remove("active");
  });
  const activeBtn = document.getElementById(`btn-waveform-${waveform}`);
  if (activeBtn) {
    activeBtn.classList.add("active");
  }
  
  // If chord is playing, restart with new waveform
  if (activeOscillators.length > 0) {
    playChord();
  }
}

// ============ UI Setup ============

// ============ Interval Conversion Utilities ============

/**
 * Parse a cents value from various formats:
 * - Plain number: "386.31" -> 386.31
 * - EDO notation: "5\12" -> 5 steps of 12-EDO = 500 cents
 * - EDO notation: "7\31" -> 7 steps of 31-EDO
 */
function parseCents(input) {
  if (typeof input !== "string") {
    return parseFloat(input);
  }
  
  // Check for EDO notation: x\n (x steps of n-EDO)
  if (input.includes("\\")) {
    const parts = input.split("\\");
    if (parts.length === 2) {
      const steps = parseFloat(parts[0]);
      const edo = parseFloat(parts[1]);
      if (!isNaN(steps) && !isNaN(edo) && edo > 0) {
        return (1200 * steps) / edo;
      }
    }
    return NaN;
  }
  
  // Plain number
  return parseFloat(input);
}

function ratioToCents(ratio) {
  // Parse ratio string like "5/4" or decimal like "1.25"
  let value;
  if (typeof ratio === "string" && ratio.includes("/")) {
    const parts = ratio.split("/");
    value = parseFloat(parts[0]) / parseFloat(parts[1]);
  } else {
    value = parseFloat(ratio);
  }
  if (isNaN(value) || value <= 0) return NaN;
  return 1200 * Math.log2(value);
}

function centsToRatio(cents) {
  return Math.pow(2, cents / 1200);
}

function getBaseFrequency() {
  const freq = parseFloat(document.getElementById("input-base-frequency").value);
  if (isNaN(freq) || freq <= 0) {
    return DEFAULT_PITCH_STANDARD;
  }
  return freq;
}

// Calculate the cumulative frequency for interval i (1-indexed)
function getFrequencyForInterval(intervalIndex) {
  const baseFreq = getBaseFrequency();
  const centsInput = document.getElementById(`input-interval-${intervalIndex}-cents`);
  if (centsInput) {
    const cents = parseCents(centsInput.value);
    if (!isNaN(cents)) {
      return baseFreq * Math.pow(2, cents / 1200);
    }
  }
  return baseFreq;
}

// Get the frequency of the note just below interval i
function getPreviousFrequency(intervalIndex) {
  if (intervalIndex <= 1) {
    return getBaseFrequency();
  }
  return getFrequencyForInterval(intervalIndex - 1);
}

// ============ Update Functions ============

function updateFromCents(intervalIndex) {
  const centsInput = document.getElementById(`input-interval-${intervalIndex}-cents`);
  const ratioInput = document.getElementById(`input-interval-${intervalIndex}-ratio`);
  
  const cents = parseCents(centsInput.value);
  if (isNaN(cents) || cents <= 0) {
    alert("Cents must be a positive number.");
    return;
  }
  
  // Update the input to show the computed cents value (in case EDO notation was used)
  centsInput.value = cents.toFixed(3);
  
  // Update ratio
  const ratio = centsToRatio(cents);
  ratioInput.value = ratio.toFixed(6);
  
  // Recalculate intervals other than this one, keeping their deltas fixed
  recalculateIntervalsOtherThan(intervalIndex);
}

function updateFromRatio(intervalIndex) {
  const centsInput = document.getElementById(`input-interval-${intervalIndex}-cents`);
  const ratioInput = document.getElementById(`input-interval-${intervalIndex}-ratio`);
  
  const cents = ratioToCents(ratioInput.value);
  if (isNaN(cents) || cents <= 0) {
    alert("Ratio must be greater than 1.");
    return;
  }
  
  // Update cents
  centsInput.value = cents.toFixed(3);
  
  // Recalculate intervals other than this one, keeping their deltas fixed
  recalculateIntervalsOtherThan(intervalIndex);
}

// Recalculate all intervals other than the given index, keeping their deltas fixed
function recalculateIntervalsOtherThan(intervalIndex) {
  const baseFreq = getBaseFrequency();
  
  // Get the first interval's frequency difference (reference delta)
  const firstCentsInput = document.getElementById("input-interval-1-cents");
  const firstCents = parseCents(firstCentsInput.value);
  if (isNaN(firstCents)) return;
  
  const firstFreq = baseFreq * centsToRatio(firstCents);
  const firstDelta = firstFreq - baseFreq;
  
  if (firstDelta <= 0) return;
  
  // Update the delta display for the changed interval
  if (intervalIndex >= 1) {
    updateDeltaDisplay(intervalIndex, firstDelta);
  }
  
  // For all intervals other than the given one, recalculate their cents/ratio based on their current delta
  for (let i = 1; i <= currentIntervalCount; i++) {
    if (i === intervalIndex) continue;
    const deltaInput = document.getElementById(`input-interval-${i}-delta`);
    const centsInput = document.getElementById(`input-interval-${i}-cents`);
    const ratioInput = document.getElementById(`input-interval-${i}-ratio`);
    
    if (!deltaInput || !centsInput || !ratioInput) continue;
    
    const relativeDelta = parseFloat(deltaInput.value);
    if (isNaN(relativeDelta)) continue;
    
    // Calculate new frequency based on the stored delta
    const absoluteDelta = relativeDelta * firstDelta;
    const prevFreq = getPreviousFrequency(i);
    const newFreq = prevFreq + absoluteDelta;
    
    // Update cents and ratio
    const newCents = 1200 * Math.log2(newFreq / baseFreq);
    centsInput.value = newCents.toFixed(3);
    ratioInput.value = (newFreq / baseFreq).toFixed(6);
  }
}

function updateFromDelta(intervalIndex) {
  // When delta is updated, we need to recalculate the cents/ratio for this interval
  // and all intervals above it, keeping intervals below fixed.
  // The unit delta is determined from the previous delta signature.
  
  // Validate delta is positive
  const deltaInput = document.getElementById(`input-interval-${intervalIndex}-delta`);
  const deltaValue = parseFloat(deltaInput.value);
  if (isNaN(deltaValue) || deltaValue <= 0) {
    alert("Delta must be a positive number.");
    return;
  }
  
  const baseFreq = getBaseFrequency();
  
  // We need to determine the unit delta from the current chord state.
  // The unit delta can be computed from any interval: unitDelta = absoluteDelta / relativeDelta
  // We'll use the second interval if available, otherwise we can't determine the unit.
  
  let unitDelta;
  
  if (currentIntervalCount >= 2 && intervalIndex === 1) {
    // Use the second interval to determine the unit delta
    const secondCentsInput = document.getElementById("input-interval-2-cents");
    const secondDeltaInput = document.getElementById("input-interval-2-delta");
    const firstCentsInput = document.getElementById("input-interval-1-cents");
    
    const secondCents = parseCents(secondCentsInput.value);
    const secondRelativeDelta = parseFloat(secondDeltaInput.value);
    const firstCents = parseCents(firstCentsInput.value);
    
    if (isNaN(secondCents) || isNaN(secondRelativeDelta) || isNaN(firstCents) || secondRelativeDelta <= 0) return;
    
    const firstFreq = baseFreq * centsToRatio(firstCents);
    const secondFreq = baseFreq * centsToRatio(secondCents);
    const secondAbsoluteDelta = secondFreq - firstFreq;
    
    unitDelta = secondAbsoluteDelta / secondRelativeDelta;
  } else if (intervalIndex === 1) {
    // Only one interval exists, can't determine unit delta from other intervals
    // In this case, the delta value acts as a direct scaling factor
    const firstCentsInput = document.getElementById("input-interval-1-cents");
    const firstDeltaInput = document.getElementById("input-interval-1-delta");
    const firstCents = parseCents(firstCentsInput.value);
    const newFirstDelta = parseFloat(firstDeltaInput.value);
    
    if (isNaN(firstCents) || isNaN(newFirstDelta) || newFirstDelta <= 0) return;
    
    // With only one interval and no reference, we assume the current absolute delta IS the unit
    // So changing delta to N means scaling by N
    const firstFreq = baseFreq * centsToRatio(firstCents);
    const firstAbsoluteDelta = firstFreq - baseFreq;
    unitDelta = firstAbsoluteDelta; // Assume old delta was 1
  } else {
    // For intervals other than the first, use the first interval to determine unit delta
    const firstCentsInput = document.getElementById("input-interval-1-cents");
    const firstDeltaInput = document.getElementById("input-interval-1-delta");
    const firstCents = parseCents(firstCentsInput.value);
    const firstRelativeDelta = parseFloat(firstDeltaInput.value) || 1;
    
    if (isNaN(firstCents)) return;
    
    const firstFreq = baseFreq * centsToRatio(firstCents);
    const firstAbsoluteDelta = firstFreq - baseFreq;
    unitDelta = firstAbsoluteDelta / firstRelativeDelta;
  }
  
  if (unitDelta <= 0) return;
  
  // Recalculate cents/ratio for this interval and all intervals above it
  for (let i = intervalIndex; i <= currentIntervalCount; i++) {
    const iDeltaInput = document.getElementById(`input-interval-${i}-delta`);
    const iCentsInput = document.getElementById(`input-interval-${i}-cents`);
    const iRatioInput = document.getElementById(`input-interval-${i}-ratio`);
    
    if (!iDeltaInput || !iCentsInput || !iRatioInput) continue;
    
    const iRelativeDelta = parseFloat(iDeltaInput.value);
    if (isNaN(iRelativeDelta)) continue;
    
    // Calculate new frequency based on the delta
    const iAbsoluteDelta = iRelativeDelta * unitDelta;
    const iPrevFreq = getPreviousFrequency(i);
    const iNewFreq = iPrevFreq + iAbsoluteDelta;
    
    // Update cents and ratio
    const iNewCents = 1200 * Math.log2(iNewFreq / baseFreq);
    iCentsInput.value = iNewCents.toFixed(3);
    iRatioInput.value = (iNewFreq / baseFreq).toFixed(6);
  }
}

function updateAllDeltas() {
  const baseFreq = getBaseFrequency();
  
  // Get the first interval's frequency difference (reference delta)
  const firstCentsInput = document.getElementById("input-interval-1-cents");
  const firstCents = parseCents(firstCentsInput.value);
  if (isNaN(firstCents)) return;
  
  const firstFreq = baseFreq * centsToRatio(firstCents);
  const firstDelta = firstFreq - baseFreq;
  
  if (firstDelta <= 0) return;
  
  // First interval always has relative delta = 1
  const firstDeltaInput = document.getElementById("input-interval-1-delta");
  if (firstDeltaInput) {
    firstDeltaInput.value = "1";
  }
  
  // Update all other intervals
  for (let i = 2; i <= currentIntervalCount; i++) {
    updateDeltaDisplay(i, firstDelta);
  }
}

function updateDeltaDisplay(intervalIndex, firstDelta) {
  const baseFreq = getBaseFrequency();
  const centsInput = document.getElementById(`input-interval-${intervalIndex}-cents`);
  const deltaInput = document.getElementById(`input-interval-${intervalIndex}-delta`);
  
  if (!centsInput || !deltaInput) return;
  
  const cents = parseCents(centsInput.value);
  if (isNaN(cents)) return;
  
  const currentFreq = baseFreq * centsToRatio(cents);
  const prevFreq = getPreviousFrequency(intervalIndex);
  const absoluteDelta = currentFreq - prevFreq;
  
  const relativeDelta = absoluteDelta / firstDelta;
  deltaInput.value = relativeDelta.toFixed(6);
}

// Recalculate ratios and deltas from current cents values
function recalcFromCents() {
  // Validate all cents values first
  for (let i = 1; i <= currentIntervalCount; i++) {
    const centsInput = document.getElementById(`input-interval-${i}-cents`);
    if (!centsInput) continue;
    
    const cents = parseCents(centsInput.value);
    if (isNaN(cents) || cents <= 0) {
      alert(`Interval ${i}: Cents must be a positive number.`);
      return;
    }
  }
  
  // Sync all ratios from cents
  for (let i = 1; i <= currentIntervalCount; i++) {
    const centsInput = document.getElementById(`input-interval-${i}-cents`);
    const ratioInput = document.getElementById(`input-interval-${i}-ratio`);
    
    if (!centsInput || !ratioInput) continue;
    
    const cents = parseCents(centsInput.value);
    if (isNaN(cents)) continue;
    
    // Update the input to show the computed cents value (in case EDO notation was used)
    centsInput.value = cents.toFixed(3);
    
    // Update ratio to match cents
    const ratio = centsToRatio(cents);
    ratioInput.value = ratio.toFixed(6);
  }
  
  // Recalculate all deltas based on current cents values
  updateAllDeltas();
}

// Recalculate cents and deltas from current ratio values
function recalcFromRatios() {
  // Validate all ratio values first
  for (let i = 1; i <= currentIntervalCount; i++) {
    const ratioInput = document.getElementById(`input-interval-${i}-ratio`);
    if (!ratioInput) continue;
    
    const cents = ratioToCents(ratioInput.value);
    if (isNaN(cents) || cents <= 0) {
      alert(`Interval ${i}: Ratio must be greater than 1.`);
      return;
    }
  }
  
  // Sync all cents from ratios
  for (let i = 1; i <= currentIntervalCount; i++) {
    const centsInput = document.getElementById(`input-interval-${i}-cents`);
    const ratioInput = document.getElementById(`input-interval-${i}-ratio`);
    
    if (!centsInput || !ratioInput) continue;
    
    const cents = ratioToCents(ratioInput.value);
    if (isNaN(cents)) continue;
    
    // Update cents to match ratio
    centsInput.value = cents.toFixed(3);
  }
  
  // Recalculate all deltas based on current cents values
  updateAllDeltas();
}

// Update all intervals from their delta values, keeping the first interval fixed
function updateAllFromDeltas() {
  const baseFreq = getBaseFrequency();
  
  // Get the first interval's frequency difference (this is our reference delta = 1)
  const firstCentsInput = document.getElementById("input-interval-1-cents");
  const firstCents = parseCents(firstCentsInput.value);
  if (isNaN(firstCents)) return;
  
  const firstFreq = baseFreq * centsToRatio(firstCents);
  const firstDelta = firstFreq - baseFreq; // This corresponds to relative delta = 1
  
  if (firstDelta <= 0) return;
  
  // For all intervals after the first, recalculate their cents/ratio based on their delta
  for (let i = 2; i <= currentIntervalCount; i++) {
    const deltaInput = document.getElementById(`input-interval-${i}-delta`);
    const centsInput = document.getElementById(`input-interval-${i}-cents`);
    const ratioInput = document.getElementById(`input-interval-${i}-ratio`);
    
    if (!deltaInput || !centsInput || !ratioInput) continue;
    
    const relativeDelta = parseFloat(deltaInput.value);
    if (isNaN(relativeDelta)) continue;
    
    // Calculate new frequency based on the delta
    const absoluteDelta = relativeDelta * firstDelta;
    const prevFreq = getPreviousFrequency(i);
    const newFreq = prevFreq + absoluteDelta;
    
    // Update cents and ratio
    const newCents = 1200 * Math.log2(newFreq / baseFreq);
    centsInput.value = newCents.toFixed(3);
    ratioInput.value = (newFreq / baseFreq).toFixed(6);
  }
}

// ============ Event Listener Setup ============

function attachIntervalListeners(intervalIndex) {
  const centsBtn = document.getElementById(`btn-update-cents-${intervalIndex}`);
  const ratioBtn = document.getElementById(`btn-update-ratio-${intervalIndex}`);
  const deltaBtn = document.getElementById(`btn-update-delta-${intervalIndex}`);
  
  if (centsBtn) {
    centsBtn.addEventListener("click", () => updateFromCents(intervalIndex));
  }
  if (ratioBtn) {
    ratioBtn.addEventListener("click", () => updateFromRatio(intervalIndex));
  }
  if (deltaBtn) {
    deltaBtn.addEventListener("click", () => updateFromDelta(intervalIndex));
  }
}

// Attach listeners for the first interval
attachIntervalListeners(1);

// Initialize first interval from ratio
updateFromRatio(1);

const btnAddInterval = document.getElementById("btn-add-interval");
const btnRemoveInterval = document.getElementById("btn-remove-interval");

btnAddInterval.addEventListener("click", () => {
  currentIntervalCount++;
  const intervalTable = document.getElementById("intervals");
  const newRow = document.createElement("tr");
  newRow.innerHTML = (`
          <td>
            <input
              type="text"
              id="input-interval-${currentIntervalCount}-cents"
              name="input-interval-${currentIntervalCount}-cents"
              style="width: 80px"
            />
            Interval (cents or a\\n, from root)
            <button id="btn-update-cents-${currentIntervalCount}">Update (keep deltas)</button>
            <br/>
            <input
              type="text"
              id="input-interval-${currentIntervalCount}-ratio"
              name="input-interval-${currentIntervalCount}-ratio"
              style="width: 80px"
            />
            Ratio (from root)
            <button id="btn-update-ratio-${currentIntervalCount}">Update (keep deltas)</button>
            <br/>
            <input
              type="number"
              id="input-interval-${currentIntervalCount}-delta"
              name="input-interval-${currentIntervalCount}-delta"
              value="1"
              style="width: 80px"
            />
            Delta
            <button id="btn-update-delta-${currentIntervalCount}">Update (keep other deltas)</button>
            <br/>
            <input
              type="number"
              id="input-interval-${currentIntervalCount}-target-delta"
              name="input-interval-${currentIntervalCount}-target-delta"
              value="1"
              style="width: 80px"
            />
            Target delta
            <input
              type="checkbox"
              id="input-interval-${currentIntervalCount}-free"
              name="input-interval-${currentIntervalCount}-free"
            />
            Free (+?)
            <br/>
          </td>
          `
      );
  intervalTable.appendChild(newRow);
  
  // Attach event listeners for the new interval
  attachIntervalListeners(currentIntervalCount);

  // Initialize new interval from delta
  updateFromDelta(currentIntervalCount);
});

btnRemoveInterval.addEventListener("click", () => {
  if (currentIntervalCount > 1) {
    const intervalTable = document.getElementById("intervals");
    intervalTable.removeChild(intervalTable.lastElementChild);
    currentIntervalCount--;
  }
});

// ============ Audio Control Event Listeners ============

document.getElementById("btn-play-chord").addEventListener("click", playChord);
document.getElementById("btn-stop-chord").addEventListener("click", stopChord);
document.getElementById("btn-waveform-sine").addEventListener("click", () => setWaveform("sine"));
document.getElementById("btn-waveform-triangle").addEventListener("click", () => setWaveform("triangle"));
document.getElementById("btn-waveform-semisine").addEventListener("click", () => setWaveform("semisine"));

// ============ Least-Squares Linear Error ============

/**
 * Calculate the least-squares linear error for approximating a target delta signature.
 * 
 * Given a chord 1:f1:f2:...:fn and a target delta signature +δ1+δ2+...+δn,
 * we find the x that minimizes the sum of squared errors and return that error.
 * 
 * The optimal x is: x = sum(D_i) / (-n + sum(f_i))
 * where D_i = sum of first i deltas (cumulative)
 * 
 * The error is: sqrt(sum((1 + D_i/x - f_i)^2))
 */
function calculateLeastSquaresErrorForFDR() {
  const baseFreq = getBaseFrequency();
  
  // Get the chord as frequency ratios from root (f_1, f_2, ..., f_n)
  const ratios = [];
  const targetDeltas = [];
  
  for (let i = 1; i <= currentIntervalCount; i++) {
    const centsInput = document.getElementById(`input-interval-${i}-cents`);
    const targetDeltaInput = document.getElementById(`input-interval-${i}-target-delta`);
    
    if (!centsInput || !targetDeltaInput) continue;
    
    const cents = parseCents(centsInput.value);
    const targetDelta = parseFloat(targetDeltaInput.value);
    
    if (isNaN(cents) || isNaN(targetDelta)) continue;
    
    // f_i is the frequency ratio from root
    const f_i = centsToRatio(cents);
    ratios.push(f_i);
    targetDeltas.push(targetDelta);
  }
  
  const n = ratios.length;
  if (n === 0) {
    document.getElementById("ls-error").textContent = "—";
    return;
  }
  
  // Calculate cumulative deltas D_i = δ_1 + δ_2 + ... + δ_i
  const cumulativeDeltas = [];
  let cumSum = 0;
  for (let i = 0; i < n; i++) {
    cumSum += targetDeltas[i];
    cumulativeDeltas.push(cumSum);
  }
  
  // Calculate sum of D_i and sum of f_i
  const sumD = cumulativeDeltas.reduce((a, b) => a + b, 0);
  const sumF = ratios.reduce((a, b) => a + b, 0);
  
  // Optimal x = sum(D_i) / (-n + sum(f_i))
  const denominator = -n + sumF;
  
  if (Math.abs(denominator) < 1e-10) {
    document.getElementById("ls-error").textContent = "undefined (denominator ≈ 0)";
    return;
  }
  
  const x = sumD / denominator;
  
  if (x <= 0) {
    document.getElementById("ls-error").textContent = "undefined (x ≤ 0)";
    return;
  }
  
  // Calculate error: sqrt(sum((1 + D_i/x - f_i)^2))
  let sumSquaredError = 0;
  for (let i = 0; i < n; i++) {
    const error = 1 + cumulativeDeltas[i] / x - ratios[i];
    sumSquaredError += error * error;
  }
  
  const lsError = Math.sqrt(sumSquaredError);
  
  // Display result
  document.getElementById("ls-error").textContent = lsError.toFixed(6) + ` (x = ${x.toFixed(4)})`;
  
  return lsError;
}

/**
 * Calculate PDR (Partially Delta-Rational) least-squares error using alternating optimization.
 * 
 * For a chord 1:f1:f2:...:fn with target delta signature where some deltas are free (+?),
 * we optimize over x (the reference frequency) and the free delta variables.
 * 
 * The alternating method:
 * 1. Fix free variables, solve for optimal x (closed form)
 * 2. Fix x, solve for optimal free variables (closed form)
 * 3. Repeat until convergence
 */
function calculatePDRError() {
  const baseFreq = getBaseFrequency();
  
  // Get the chord data
  const ratios = [];      // f_i values
  const targetDeltas = []; // δ_i values (will be optimized if free)
  const isFree = [];       // whether each delta is free
  
  for (let i = 1; i <= currentIntervalCount; i++) {
    const centsInput = document.getElementById(`input-interval-${i}-cents`);
    const targetDeltaInput = document.getElementById(`input-interval-${i}-target-delta`);
    const freeCheckbox = document.getElementById(`input-interval-${i}-free`);
    
    if (!centsInput || !targetDeltaInput) continue;
    
    const cents = parseCents(centsInput.value);
    const targetDelta = parseFloat(targetDeltaInput.value);
    const checkboxFree = freeCheckbox ? freeCheckbox.checked : false;
    
    if (isNaN(cents)) continue;
    
    // Treat as free if checkbox is checked OR if target delta is invalid/empty
    const free = checkboxFree || isNaN(targetDelta);
    
    const f_i = centsToRatio(cents);
    ratios.push(f_i);
    targetDeltas.push(isNaN(targetDelta) ? 1 : targetDelta);
    isFree.push(free);
  }
  
  const n = ratios.length;
  if (n === 0) return null;
  
  // Group consecutive free deltas into segments
  // Each segment of consecutive free deltas shares one variable
  const segments = []; // {start, end, isFree}
  let segStart = 0;
  for (let i = 0; i <= n; i++) {
    if (i === n || (i > 0 && isFree[i] !== isFree[i-1])) {
      segments.push({ start: segStart, end: i - 1, isFree: isFree[segStart] });
      segStart = i;
    }
  }
  
  // Count free segments (excluding leading and trailing free segments)
  let firstFixedIdx = segments.findIndex(s => !s.isFree);
  let lastFixedIdx = segments.length - 1 - [...segments].reverse().findIndex(s => !s.isFree);
  
  if (firstFixedIdx === -1) {
    // All deltas are free - no constraint, error is always 0
    return { error: 0, x: 1, freeValues: targetDeltas.slice() };
  }
  
  // Determine the range of intervals to include (excluding leading/trailing free)
  const firstIncludedInterval = segments[firstFixedIdx].start;
  const lastIncludedInterval = segments[lastFixedIdx].end;
  
  // Filter ratios and deltas to only include the interior range
  // When trimming leading free intervals, we need to rebase the ratios
  // relative to the new "root" (the interval just before the first included one)
  let includedRatios;
  if (firstIncludedInterval === 0) {
    // No leading free intervals, use ratios as-is
    includedRatios = ratios.slice(firstIncludedInterval, lastIncludedInterval + 1);
  } else {
    // Rebase ratios relative to the previous interval (which becomes the new root)
    const newBaseRatio = ratios[firstIncludedInterval - 1];
    includedRatios = ratios.slice(firstIncludedInterval, lastIncludedInterval + 1)
      .map(r => r / newBaseRatio);
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
  
  // Get indices of free segments (now all are interior since we trimmed leading/trailing)
  const interiorFreeSegments = includedSegments.filter(s => s.isFree);
  
  const numFreeVars = interiorFreeSegments.length;
  
  // Initialize free variable values from current target deltas
  let freeVarValues = interiorFreeSegments.map(seg => {
    // Sum of deltas in this segment
    let sum = 0;
    for (let i = seg.start; i <= seg.end; i++) {
      sum += includedTargetDeltas[i];
    }
    return sum;
  });
  
  // Helper: compute cumulative deltas given current free variable values
  function getCumulativeDeltas(freeVals) {
    const deltas = includedTargetDeltas.slice();
    
    // Update free segments with their optimized values
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
    return cumulative;
  }
  
  // Helper: compute optimal x given cumulative deltas
  function computeOptimalX(cumDeltas) {
    const sumD = cumDeltas.reduce((a, b) => a + b, 0);
    const sumF = includedRatios.reduce((a, b) => a + b, 0);
    const denom = -includedN + sumF;
    if (Math.abs(denom) < 1e-10) return null;
    return sumD / denom;
  }
  
  // Helper: compute error given x and cumulative deltas
  function computeError(x, cumDeltas) {
    let sumSq = 0;
    for (let i = 0; i < includedN; i++) {
      const err = 1 + cumDeltas[i] / x - includedRatios[i];
      sumSq += err * err;
    }
    return Math.sqrt(sumSq);
  }
  
  // Helper: compute optimal free variable given x (for a single free segment)
  function computeOptimalFreeVar(segIdx, x, currentFreeVals) {
    const seg = interiorFreeSegments[segIdx];
    const segLength = seg.end - seg.start + 1;
    
    // For a free segment spanning indices [seg.start, seg.end], we have one variable y
    // representing the TOTAL delta for the segment. Each individual delta = y/segLength.
    //
    // The contribution of y to cumulative delta D_i:
    // - For i < seg.start: 0
    // - For seg.start <= i <= seg.end: (i - seg.start + 1) * (y / segLength)
    // - For i > seg.end: y (full contribution)
    //
    // Let c_i = coefficient of y in D_i
    // Error = sum_i (1 + (baseCumDeltas[i] + c_i * y)/x - f_i)^2
    // Let a_i = 1 + baseCumDeltas[i]/x - f_i
    // Error = sum_i (a_i + c_i * y/x)^2
    // d/dy = sum_i 2 * (a_i + c_i * y/x) * (c_i / x) = 0
    // sum_i (c_i * a_i + c_i^2 * y/x) = 0
    // y = -x * sum_i(c_i * a_i) / sum_i(c_i^2)
    
    // Get current cumulative deltas without this segment's contribution
    const testFreeVals = currentFreeVals.slice();
    testFreeVals[segIdx] = 0;
    const baseCumDeltas = getCumulativeDeltas(testFreeVals);
    
    let sumCA = 0;   // sum of c_i * a_i
    let sumC2 = 0;   // sum of c_i^2
    
    for (let i = 0; i < includedN; i++) {
      let c_i;
      if (i < seg.start) {
        c_i = 0;
      } else if (i <= seg.end) {
        c_i = (i - seg.start + 1) / segLength;
      } else {
        c_i = 1;
      }
      
      if (c_i > 0) {
        const a_i = 1 + baseCumDeltas[i] / x - includedRatios[i];
        sumCA += c_i * a_i;
        sumC2 += c_i * c_i;
      }
    }
    
    if (sumC2 < 1e-10) return currentFreeVals[segIdx];
    
    const optimalY = -x * sumCA / sumC2;
    return optimalY; // Allow any value (can be negative for some chord shapes)
  }
  
  // Alternating optimization
  const maxIter = 1000;
  const tolerance = 1e-12;
  let prevError = Infinity;
  let x = 1;
  
  for (let iter = 0; iter < maxIter; iter++) {
    // Step 1: Fix free variables, compute optimal x
    const cumDeltas = getCumulativeDeltas(freeVarValues);
    x = computeOptimalX(cumDeltas);
    
    if (x === null || x <= 0) {
      return null;
    }
    
    // Step 2: Fix x, compute optimal free variables
    for (let j = 0; j < numFreeVars; j++) {
      freeVarValues[j] = computeOptimalFreeVar(j, x, freeVarValues);
    }
    
    // Check convergence
    const newCumDeltas = getCumulativeDeltas(freeVarValues);
    const error = computeError(x, newCumDeltas);
    
    if (Math.abs(prevError - error) < tolerance) {
      break;
    }
    prevError = error;
  }
  
  const finalCumDeltas = getCumulativeDeltas(freeVarValues);
  const finalError = computeError(x, finalCumDeltas);
  
  // For single free variable, use grid search over x (more reliable than alternating)
  if (numFreeVars === 1) {
    const seg = interiorFreeSegments[0];
    const segLength = seg.end - seg.start + 1;
    
    // Compute coefficients c_i for each interval
    const coeffs = [];
    for (let i = 0; i < includedN; i++) {
      let c_i;
      if (i < seg.start) {
        c_i = 0;
      } else if (i <= seg.end) {
        c_i = (i - seg.start + 1) / segLength;
      } else {
        c_i = 1;
      }
      coeffs.push(c_i);
    }
    
    // Base cumulative deltas with y=0
    const baseCumDeltas = getCumulativeDeltas([0]);
    
    // For a given x, optimal y = -x * sum(c_i * a_i) / sum(c_i^2)
    // where a_i = 1 + baseCumDeltas[i]/x - f_i
    function computeOptimalY(testX) {
      let sumCA = 0;
      let sumC2 = 0;
      for (let i = 0; i < includedN; i++) {
        if (coeffs[i] > 0) {
          const a_i = 1 + baseCumDeltas[i] / testX - includedRatios[i];
          sumCA += coeffs[i] * a_i;
          sumC2 += coeffs[i] * coeffs[i];
        }
      }
      if (sumC2 < 1e-10) return 1;
      return -testX * sumCA / sumC2;
    }
    
    function computeErrorForX(testX) {
      const testY = computeOptimalY(testX);
      const testCumDeltas = getCumulativeDeltas([testY]);
      return computeError(testX, testCumDeltas);
    }
    
    // Grid search over x
    let bestError = Infinity;
    let bestX = 1;
    let bestY = 1;
    
    // Coarse search
    for (let testX = 0.5; testX <= 20; testX += 0.1) {
      const err = computeErrorForX(testX);
      if (err < bestError) {
        bestError = err;
        bestX = testX;
      }
    }
    
    // Fine search around best
    for (let testX = Math.max(0.1, bestX - 1); testX <= bestX + 1; testX += 0.001) {
      const err = computeErrorForX(testX);
      if (err < bestError) {
        bestError = err;
        bestX = testX;
      }
    }
    
    // Ultra-fine search
    for (let testX = Math.max(0.01, bestX - 0.05); testX <= bestX + 0.05; testX += 0.00001) {
      const err = computeErrorForX(testX);
      if (err < bestError) {
        bestError = err;
        bestX = testX;
      }
    }
    
    bestY = computeOptimalY(bestX);
    
    return { error: bestError, x: bestX, freeValues: [bestY] };
  }
  
  return { error: finalError, x: x, freeValues: freeVarValues };
}

// Least-squares error function that handles PDR
function calculateLeastSquaresError() {
  // Check if any deltas are free
  let hasFreeDeltas = false;
  for (let i = 1; i <= currentIntervalCount; i++) {
    const freeCheckbox = document.getElementById(`input-interval-${i}-free`);
    if (freeCheckbox && freeCheckbox.checked) {
      hasFreeDeltas = true;
      break;
    }
  }
  
  if (hasFreeDeltas) {
    const result = calculatePDRError();
    if (result === null) {
      document.getElementById("ls-error").textContent = "undefined";
    } else {
      let display = result.error.toFixed(6) + ` (x = ${result.x.toFixed(4)}`;
      if (result.freeValues.length > 0) {
        display += `, free: [${result.freeValues.map(v => v.toFixed(3)).join(", ")}]`;
      }
      display += ")";
      document.getElementById("ls-error").textContent = display;
    }
  } else {
    // No free deltas, use original FDR calculation
    calculateLeastSquaresErrorForFDR();
  }
}

// Set up event listeners
document.getElementById("btn-recalc-from-cents").addEventListener("click", recalcFromCents);
document.getElementById("btn-recalc-from-ratios").addEventListener("click", recalcFromRatios);
document.getElementById("btn-update-from-deltas").addEventListener("click", updateAllFromDeltas);
document.getElementById("btn-calculate-error").addEventListener("click", calculateLeastSquaresError);