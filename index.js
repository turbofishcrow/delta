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
      const cents = parseFloat(centsInput.value);
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
  return parseFloat(document.getElementById("input-base-frequency").value) || DEFAULT_PITCH_STANDARD;
}

// Calculate the cumulative frequency for interval i (1-indexed)
function getFrequencyForInterval(intervalIndex) {
  const baseFreq = getBaseFrequency();
  const centsInput = document.getElementById(`input-interval-${intervalIndex}-cents`);
  if (centsInput) {
    const cents = parseFloat(centsInput.value);
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
  
  const cents = parseFloat(centsInput.value);
  if (isNaN(cents)) return;
  
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
  if (isNaN(cents)) return;
  
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
  const firstCents = parseFloat(firstCentsInput.value);
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
    
    const secondCents = parseFloat(secondCentsInput.value);
    const secondRelativeDelta = parseFloat(secondDeltaInput.value);
    const firstCents = parseFloat(firstCentsInput.value);
    
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
    const firstCents = parseFloat(firstCentsInput.value);
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
    const firstCents = parseFloat(firstCentsInput.value);
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
  const firstCents = parseFloat(firstCentsInput.value);
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
  
  const cents = parseFloat(centsInput.value);
  if (isNaN(cents)) return;
  
  const currentFreq = baseFreq * centsToRatio(cents);
  const prevFreq = getPreviousFrequency(intervalIndex);
  const absoluteDelta = currentFreq - prevFreq;
  
  const relativeDelta = absoluteDelta / firstDelta;
  deltaInput.value = relativeDelta.toFixed(6);
}

// Recalculate all deltas from current interval values (tries ratio first, then cents as fallback)
function recalcAllDeltas() {
  // First, sync cents from ratios (or keep cents if ratio is invalid)
  for (let i = 1; i <= currentIntervalCount; i++) {
    const centsInput = document.getElementById(`input-interval-${i}-cents`);
    const ratioInput = document.getElementById(`input-interval-${i}-ratio`);
    
    if (!centsInput || !ratioInput) continue;
    
    // Try to parse ratio first
    const cents = ratioToCents(ratioInput.value);
    if (!isNaN(cents)) {
      // Ratio is valid, update cents from ratio
      centsInput.value = cents.toFixed(3);
    } else {
      // Ratio is invalid, try to use cents and update ratio
      const centsValue = parseFloat(centsInput.value);
      if (!isNaN(centsValue)) {
        const ratio = centsToRatio(centsValue);
        ratioInput.value = ratio.toFixed(6);
      }
    }
  }
  
  // Recalculate all deltas based on current cents values
  updateAllDeltas();
}

// Update all intervals from their delta values, keeping the first interval fixed
function updateAllFromDeltas() {
  const baseFreq = getBaseFrequency();
  
  // Get the first interval's frequency difference (this is our reference delta = 1)
  const firstCentsInput = document.getElementById("input-interval-1-cents");
  const firstCents = parseFloat(firstCentsInput.value);
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
              type="number"
              id="input-interval-${currentIntervalCount}-cents"
              name="input-interval-${currentIntervalCount}-cents"
              style="width: 80px"
            />
            Interval (in cents, from root)
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
function calculateLeastSquaresError() {
  const baseFreq = getBaseFrequency();
  
  // Get the chord as frequency ratios from root (f_1, f_2, ..., f_n)
  const ratios = [];
  const targetDeltas = [];
  
  for (let i = 1; i <= currentIntervalCount; i++) {
    const centsInput = document.getElementById(`input-interval-${i}-cents`);
    const targetDeltaInput = document.getElementById(`input-interval-${i}-target-delta`);
    
    if (!centsInput || !targetDeltaInput) continue;
    
    const cents = parseFloat(centsInput.value);
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

document.getElementById("btn-calculate-error").addEventListener("click", calculateLeastSquaresError);
document.getElementById("btn-recalc-deltas").addEventListener("click", recalcAllDeltas);
document.getElementById("btn-update-from-deltas").addEventListener("click", updateAllFromDeltas);