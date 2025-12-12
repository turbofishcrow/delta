const GROUND_INDIGO = "#76f";

const DEFAULT_PITCH_STANDARD = 220;

let currentIntervalCount = 1;

// Target ratios for visualization (set on error computation)
let targetRatiosForViz = null;

// ============ Audio Playback ============

let audioContext = null;
let activeOscillators = [];
let isPlaying = false;
let currentWaveform = "sine"; // "sine", "triangle", "semisine", "square", or "sawtooth"

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
    oscillator.type = waveform; // "sine", "triangle", "square", or "sawtooth"
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
  
  isPlaying = true;
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
  isPlaying = false;
}

// Refresh the chord if audio is currently playing
function refreshChordIfPlaying() {
  if (isPlaying) {
    playChord();
  }
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
  
  refreshChordIfPlaying();
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
  
  refreshChordIfPlaying();
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
  
  refreshChordIfPlaying();
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
  refreshChordIfPlaying();
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
  refreshChordIfPlaying();
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
  
  refreshChordIfPlaying();
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
const btnClearIntervals = document.getElementById("btn-clear-intervals");

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
          </td>
          <td>
            <input
              type="number"
              id="input-interval-${currentIntervalCount}-target-delta"
              name="input-interval-${currentIntervalCount}-target-delta"
              value="1"
              style="width: 80px"
            />
            Target delta
            <br/>
            <input
              type="checkbox"
              id="input-interval-${currentIntervalCount}-free"
              name="input-interval-${currentIntervalCount}-free"
            />
            Free (+?)
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
    refreshChordIfPlaying();
  }
});

btnClearIntervals.addEventListener("click", () => {
  while (currentIntervalCount > 1) {
    const intervalTable = document.getElementById("intervals");
    intervalTable.removeChild(intervalTable.lastElementChild);
    currentIntervalCount--;
  }
  refreshChordIfPlaying();
});

// ============ Audio Control Event Listeners ============

document.getElementById("btn-play-chord").addEventListener("click", playChord);
document.getElementById("btn-stop-chord").addEventListener("click", stopChord);
document.getElementById("btn-waveform-sine").addEventListener("click", () => setWaveform("sine"));
document.getElementById("btn-waveform-triangle").addEventListener("click", () => setWaveform("triangle"));
document.getElementById("btn-waveform-semisine").addEventListener("click", () => setWaveform("semisine"));
document.getElementById("btn-waveform-square").addEventListener("click", () => setWaveform("square"));
document.getElementById("btn-waveform-saw").addEventListener("click", () => setWaveform("sawtooth"));

// Refresh chord when base frequency changes
document.getElementById("input-base-frequency").addEventListener("input", refreshChordIfPlaying);

// ============ Least-Squares Linear Error ============

/**
 * Calculate the least-squares error for approximating a target delta signature (FDR).
 *
 * @param {string} domain - "linear" or "log" (logarithmic)
 * @param {string} model - "rooted" (from root) or "pairwise" (all intervals)
 * @returns {Object|null} - {error, x, targetRatios, deltaSignature} or null if error
 *
 * Given a chord 1:f1:f2:...:fn and a target delta signature +δ1+δ2+...+δn,
 * we find the x that minimizes the sum of squared errors and return that error.
 *
 * For rooted models: optimal x = sum(D_i) / (-n + sum(f_i))
 * For pairwise models: same x formula works
 *
 * Linear domain: error in ratio units
 * Log domain: error in cents (converted from nepers)
 */
function calculateFDRError(domain, model) {
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

  const sumD = cumulativeDeltas.reduce((a, b) => a + b, 0);

  // Build error function that takes x and returns the sum of squared errors
  function computeError(x) {
    if (x <= 0) return Infinity;

    // Compute target ratios from delta signature: f_i = 1 + D_i/x
    const targetRatios = [1]; // Root
    for (let i = 0; i < n; i++) {
      targetRatios.push(1 + cumulativeDeltas[i] / x);
    }

    let sumSquaredError = 0;

    if (model === "rooted") {
      // Rooted: compare each interval from root
      for (let i = 0; i < n; i++) {
        const target = targetRatios[i + 1]; // targetRatios[0] is root = 1
        const actual = ratios[i];

        if (domain === "linear") {
          const diff = target - actual;
          sumSquaredError += diff * diff;
        } else { // log
          const diff = Math.log(target) - Math.log(actual); // in nepers
          sumSquaredError += diff * diff;
        }
      }
    } else if (model === "pairwise") {
      // Pairwise: compare all interval pairs
      // Include the root (index 0) as ratio 1
      const allRatios = [1, ...ratios];
      const allTargetRatios = targetRatios;

      for (let i = 0; i < allTargetRatios.length; i++) {
        for (let j = i + 1; j < allTargetRatios.length; j++) {
          const targetInterval = allTargetRatios[j] / allTargetRatios[i];
          const actualInterval = allRatios[j] / allRatios[i];

          if (domain === "linear") {
            const diff = targetInterval - actualInterval;
            sumSquaredError += diff * diff;
          } else { // log
            const diff = Math.log(targetInterval) - Math.log(actualInterval); // in nepers
            sumSquaredError += diff * diff;
          }
        }
      }
    } else if (model === "all-steps") {
      // All-steps: compare only successive intervals
      const allRatios = [1, ...ratios];
      const allTargetRatios = targetRatios;

      for (let i = 0; i < n; i++) {
        const targetInterval = allTargetRatios[i + 1] / allTargetRatios[i];
        const actualInterval = allRatios[i + 1] / allRatios[i];

        if (domain === "linear") {
          const diff = targetInterval - actualInterval;
          sumSquaredError += diff * diff;
        } else { // log
          const diff = Math.log(targetInterval) - Math.log(actualInterval); // in nepers
          sumSquaredError += diff * diff;
        }
      }
    }

    return sumSquaredError;
  }

  // Use grid search to find optimal x
  // Start with a reasonable range based on the chord and deltas
  const avgRatio = ratios.reduce((a, b) => a + b, 0) / n;
  let xMin = sumD / (avgRatio * 10); // Lower bound
  let xMax = sumD / (avgRatio * 0.1); // Upper bound

  // Coarse grid search
  let bestX = xMin;
  let bestError = computeError(xMin);
  const coarseSteps = 1000;
  const coarseStep = (xMax - xMin) / coarseSteps;

  for (let i = 0; i <= coarseSteps; i++) {
    const testX = xMin + i * coarseStep;
    const error = computeError(testX);
    if (error < bestError) {
      bestError = error;
      bestX = testX;
    }
  }

  // Fine grid search around the best point
  xMin = Math.max(bestX - coarseStep, sumD / (avgRatio * 10));
  xMax = bestX + coarseStep;
  const fineSteps = 2000;
  const fineStep = (xMax - xMin) / fineSteps;

  for (let i = 0; i <= fineSteps; i++) {
    const testX = xMin + i * fineStep;
    const error = computeError(testX);
    if (error < bestError) {
      bestError = error;
      bestX = testX;
    }
  }

  const x = bestX;

  // Compute final target ratios and error
  const targetRatios = [1]; // Root
  for (let i = 0; i < n; i++) {
    targetRatios.push(1 + cumulativeDeltas[i] / x);
  }

  let lsError = Math.sqrt(bestError);

  // Convert to cents if logarithmic
  if (domain === "log") {
    lsError = lsError * (1200 / Math.LN2); // nepers to cents
  }

  // Build target delta signature string
  const deltaSignature = "+" + targetDeltas.join("+");

  // Store target ratios for visualization
  targetRatiosForViz = targetRatios;

  // Display result
  const errorStr = lsError.toFixed(domain === "log" ? 3 : 6) + (domain === "log" ? " ¢" : "");
  document.getElementById("ls-error").textContent = errorStr + ` (x = ${x.toFixed(4)}, target: ${deltaSignature})`;

  // Update visualization to show target
  updateVisualization();

  return {error: lsError, x, targetRatios, deltaSignature};
}

// ============ PDR Chord Processing ============

/**
 * Process PDR chord data: coallesce consecutive free deltas and trim leading/trailing free segments.
 *
 * @param {Array<number>} intervalsFromRoot - Frequency ratios from root for each interval
 * @param {Array<number>} targetDeltas - Target delta values for each interval
 * @param {Array<boolean>} isFree - Whether each delta is free (to be optimized)
 * @returns {Object|null} Processed data or null if all deltas are free:
 *   - includedRatios: Ratios after trimming and rebasing
 *   - includedTargetDeltas: Target deltas for included range
 *   - includedIsFree: Free flags for included range
 *   - interiorFreeSegments: Array of {start, end, isFree} for free segments within included range
 *   - firstIncludedInterval: Original index of first included interval
 *   - lastIncludedInterval: Original index of last included interval
 */
function preprocessPDRChordData(intervalsFromRoot, targetDeltas, isFree) {
  const n = intervalsFromRoot.length;
  if (n === 0) return null;

  // Group consecutive free deltas into segments
  const segments = [];
  let segStart = 0;
  for (let i = 0; i <= n; i++) {
    if (i === n || (i > 0 && isFree[i] !== isFree[i-1])) {
      segments.push({ start: segStart, end: i - 1, isFree: isFree[segStart] });
      segStart = i;
    }
  }

  // Find first and last fixed segments (trim leading/trailing free)
  let firstFixedIdx = segments.findIndex(s => !s.isFree);
  let lastFixedIdx = segments.length - 1 - [...segments].reverse().findIndex(s => !s.isFree);

  if (firstFixedIdx === -1) {
    // All deltas are free - no constraint, cannot optimize
    return null;
  }

  // Determine the range of intervals to include (excluding leading/trailing free)
  const firstIncludedInterval = segments[firstFixedIdx].start;
  const lastIncludedInterval = segments[lastFixedIdx].end;

  // Build the chord starting from the appropriate base note
  // If we trimmed leading intervals, we need to rebase everything
  let baseRatio = 1.0;
  if (firstIncludedInterval > 0) {
    baseRatio = intervalsFromRoot[firstIncludedInterval - 1];
  }

  // For the included range, we need CUMULATIVE ratios from the (possibly rebased) root
  // The least-squares formula uses f_i = (x + D_i)/x where f_i is the ratio to root
  const includedRatios = [];
  for (let i = firstIncludedInterval; i <= lastIncludedInterval; i++) {
    const cumulativeRatio = intervalsFromRoot[i] / baseRatio;
    includedRatios.push(cumulativeRatio);
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

  // Get indices of free segments (now all are interior)
  const interiorFreeSegments = includedSegments.filter(s => s.isFree);

  return {
    includedRatios,
    includedTargetDeltas,
    includedIsFree,
    interiorFreeSegments,
    firstIncludedInterval,
    lastIncludedInterval
  };
}

/**
 * Calculate PDR (Partially Delta-Rational) least-squares error.
 * Rewritten to use L-BFGS-B optimization.
 *
 * @param {string} domain - "linear" or "log" (logarithmic)
 * @param {string} model - "rooted" (from root) or "pairwise" (all intervals)
 *
 * This function expects to be called from a UI context where:
 * - getBaseFrequency() returns the base frequency
 * - currentIntervalCount is the number of intervals
 * - DOM elements exist with IDs: input-interval-{i}-cents, input-interval-{i}-target-delta, input-interval-{i}-free
 */
function calculatePDRError(domain, model) {
  const baseFreq = getBaseFrequency();
  
  // Get the chord data - intervals from root
  const intervalsFromRoot = []; // Absolute intervals from root in ratio form
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
    
    const ratio = centsToRatio(cents);
    intervalsFromRoot.push(ratio);
    targetDeltas.push(isNaN(targetDelta) ? 1 : targetDelta);
    isFree.push(free);
  }
  
  // Process chord data: coalesce consecutive free deltas and trim leading/trailing free segments
  const processed = preprocessPDRChordData(intervalsFromRoot, targetDeltas, isFree);
  if (!processed) {
    // All deltas are free - no constraint, error is always 0
    return { error: 0, x: 1, freeValues: targetDeltas.slice() };
  }

  const {
    includedRatios,
    includedTargetDeltas,
    includedIsFree,
    interiorFreeSegments
  } = processed;
  const includedN = includedRatios.length;
  
  // NORMALIZATION: Scale the delta signature to improve numerical conditioning
  // We want x to be in a reasonable range (e.g., around 1-10) rather than very small
  // Since delta signatures are scale-invariant, we can multiply all deltas by a constant
  // 
  // Strategy: Estimate what x would be, then scale deltas so x ≈ a target value (e.g., 5)
  const targetX = 5.0; // Target x value after scaling
  
  // Estimate unscaled x from first fixed delta (if available)
  let estimatedUnscaledX = 1.0;
  const firstFixedDeltaIdx = includedIsFree.findIndex(free => !free);
  if (firstFixedDeltaIdx !== -1) {
    const firstDelta = includedTargetDeltas[firstFixedDeltaIdx];
    const firstRatio = includedRatios[firstFixedDeltaIdx];
    if (firstRatio > 1 && firstDelta > 0) {
      estimatedUnscaledX = firstDelta / (firstRatio - 1);
    }
  }
  
  // Calculate scaling factor: we want estimatedUnscaledX * scale = targetX
  const deltaScaleFactor = targetX / Math.max(0.1, estimatedUnscaledX);
  
  // Scale all target deltas
  const scaledTargetDeltas = includedTargetDeltas.map(d => d * deltaScaleFactor);

  // Number of free variables to optimize
  const numFreeVars = interiorFreeSegments.length;
  
  // Build the optimization problem for L-BFGS-B
  // Variables: [x, y1, y2, ..., yK] where K = numFreeVars
  // Each yi represents the TOTAL delta sum for free segment i
  
  function buildErrorFunction() {
    return function(params) {
      const x = params[0];
      const freeVals = params.slice(1);
      
      // Build cumulative deltas using SCALED deltas
      const deltas = scaledTargetDeltas.slice();
      
      // Update free segments with their values
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
      
      // Calculate sum of squared errors based on domain and model
      let errorSq = 0;

      // Build target ratios: targetRatios[i] = (x + cumulative[i]) / x = 1 + cumulative[i]/x
      const targetRatios = [1]; // Root
      for (let i = 0; i < includedN; i++) {
        targetRatios.push((x + cumulative[i]) / x);
      }

      if (model === "rooted") {
        // Rooted: compare each interval from root
        for (let i = 0; i < includedN; i++) {
          const target = targetRatios[i + 1]; // targetRatios[0] is root = 1
          const actual = includedRatios[i];

          if (domain === "linear") {
            const diff = target - actual;
            errorSq += diff * diff;
          } else { // log
            const diff = Math.log(target) - Math.log(actual); // in nepers
            errorSq += diff * diff;
          }
        }
      } else if (model === "pairwise") {
        // Pairwise: compare all interval pairs
        const allRatios = [1, ...includedRatios];
        const allTargetRatios = targetRatios;

        for (let i = 0; i < allTargetRatios.length; i++) {
          for (let j = i + 1; j < allTargetRatios.length; j++) {
            const targetInterval = allTargetRatios[j] / allTargetRatios[i];
            const actualInterval = allRatios[j] / allRatios[i];

            if (domain === "linear") {
              const diff = targetInterval - actualInterval;
              errorSq += diff * diff;
            } else { // log
              const diff = Math.log(targetInterval) - Math.log(actualInterval); // in nepers
              errorSq += diff * diff;
            }
          }
        }
      } else if (model === "all-steps") {
        // All-steps: compare only successive intervals
        const allRatios = [1, ...includedRatios];
        const allTargetRatios = targetRatios;

        for (let i = 0; i < includedN; i++) {
          const targetInterval = allTargetRatios[i + 1] / allTargetRatios[i];
          const actualInterval = allRatios[i + 1] / allRatios[i];

          if (domain === "linear") {
            const diff = targetInterval - actualInterval;
            errorSq += diff * diff;
          } else { // log
            const diff = Math.log(targetInterval) - Math.log(actualInterval); // in nepers
            errorSq += diff * diff;
          }
        }
      }

      return errorSq;
    };
  }
  
  // Build initial guess (using scaled deltas)
  // For a chord like 1:f1:f2:...:fn approximating x:(x+d1):(x+d1+d2):...
  // We have f_i ≈ (x + D_i) / x where D_i is cumulative delta
  // A good initial guess for x: use the first ratio and first delta
  // f_1 ≈ (x + delta_1) / x  =>  x ≈ delta_1 / (f_1 - 1)
  
  let initialX = targetX; // Start near our target
  if (scaledTargetDeltas.length > 0 && !includedIsFree[0]) {
    const firstDelta = scaledTargetDeltas[0];
    const firstRatio = includedRatios[0];
    if (firstRatio > 1 && firstDelta > 0) {
      initialX = firstDelta / (firstRatio - 1);
    }
  }
  
  // Fallback if the above doesn't work
  if (initialX <= 0 || !isFinite(initialX)) {
    initialX = targetX;
  }
  
  const initialFreeVals = interiorFreeSegments.map(seg => {
    // For each free segment, estimate the delta sum
    // Based on the spacing of ratios in that segment
    const segStart = seg.start;
    const segEnd = seg.end;
    const segLength = segEnd - segStart + 1;
    
    // Estimate: if ratios grow from f_start to f_end, 
    // cumulative delta changes by approximately x * (f_end - f_start)
    let estimatedDeltaSum = 1.0 * segLength * deltaScaleFactor; // Default, scaled
    
    if (segEnd < includedN - 1) {
      const ratioBefore = segStart > 0 ? includedRatios[segStart - 1] : 1;
      const ratioAfter = includedRatios[segEnd + 1];
      estimatedDeltaSum = initialX * (ratioAfter - ratioBefore) * 0.5;
    }
    
    return Math.max(0.1, estimatedDeltaSum);
  });
  
  const initialParams = [initialX, ...initialFreeVals];
  
  // Set up bounds: x > 0.01, free variables unbounded
  // Use a very small lower bound to avoid barrier issues near optimal x
  const bounds = [[1e-6, null], ...Array(numFreeVars).fill([null, null])];
  
  // Run optimization
  const errorFn = buildErrorFunction();
  const optimizer = new BoundedLBFGS({
    historySize: 10,
    maxIterations: 200,
    tolerance: 1e-10,
    barrierWeight: 1e-10  // Very small barrier weight to minimize interference
  });
  
  let bestResult = null;
  let bestError = Infinity;
  
  // Try multiple starting points for robustness
  const startingPoints = [
    initialParams,
    [targetX, ...initialFreeVals],
    [targetX * 0.5, ...initialFreeVals.map(v => v * 0.5)],
    [targetX * 2.0, ...initialFreeVals.map(v => v * 2.0)],
  ];
  
  for (const x0 of startingPoints) {
    try {
      const result = optimizer.minimize(errorFn, bounds, x0);
      if (result.fx < bestError && !isNaN(result.fx)) {
        bestError = result.fx;
        bestResult = result;
      }
    } catch (e) {
      console.warn('Optimization failed for starting point:', e);
    }
  }
  
  if (!bestResult || !bestResult.success || isNaN(bestResult.fx)) {
    console.warn('L-BFGS-B optimization did not converge or produced NaN');
    console.warn('Best result:', bestResult);
    console.warn('Included ratios:', includedRatios);
    console.warn('Included deltas:', includedTargetDeltas);
    console.warn('Free segments:', interiorFreeSegments);
    return null;
  }
  
  const finalX = bestResult.x[0];
  const finalFreeVals = bestResult.x.slice(1);
  
  // UNSCALE the results: both x and free deltas were optimized with scaled deltas
  // To get back to original scale, we need to unscale x by dividing by the scale factor
  // (since x scales inversely with delta scaling: if deltas × k, then x ÷ k)
  const unscaledX = finalX / deltaScaleFactor;
  const unscaledFreeVals = finalFreeVals.map(v => v / deltaScaleFactor);
  
  // Handle numerical precision issues: if fx is very small and negative due to barrier penalty,
  // recalculate the true error without the barrier
  let trueErrorSquared = bestResult.fx;
  if (trueErrorSquared < 0 && trueErrorSquared > -1e-6) {
    // Recalculate without barrier penalty
    trueErrorSquared = errorFn([finalX, ...finalFreeVals]);
    
    // If still negative (shouldn't happen), clamp to zero
    if (trueErrorSquared < 0) {
      console.warn('Error squared is negative after recalculation:', trueErrorSquared);
      trueErrorSquared = 0;
    }
  }
  
  let finalError = Math.sqrt(Math.abs(trueErrorSquared));

  // Convert to cents if logarithmic
  if (domain === "log") {
    finalError = finalError * (1200 / Math.LN2); // nepers to cents
  }

  // Additional validation
  if (isNaN(finalError) || !isFinite(finalError)) {
    /*
    console.warn('Final error is NaN or infinite');
    console.warn('x (scaled):', finalX, 'x (unscaled):', unscaledX);
    console.warn('free values (scaled):', finalFreeVals, 'unscaled:', unscaledFreeVals);
    console.warn('bestResult.fx:', bestResult.fx);
    console.warn('trueErrorSquared:', trueErrorSquared);
    */
    return null;
  }
  /*
  console.log('PDR optimization succeeded:');
  console.log('  Delta scale factor:', deltaScaleFactor);
  console.log('  x (scaled) =', finalX, ', x (unscaled) =', unscaledX);
  console.log('  free deltas (scaled) =', finalFreeVals);
  console.log('  free deltas (unscaled) =', unscaledFreeVals);
  console.log('  error =', finalError);
  console.log('  error squared =', trueErrorSquared);
  */
  return {
    error: finalError,
    x: unscaledX,  // Return unscaled x
    freeValues: unscaledFreeVals  // Return unscaled free deltas
  };
}

// ============ Error Calculation Dispatcher ============

// Least-squares error function that handles both FDR and PDR
function calculateLeastSquaresError() {
  // Read domain and model from selectors
  const domain = document.getElementById("error-domain").value;
  const model = document.getElementById("error-model").value;

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
    const result = calculatePDRError(domain, model);
    if (result === null) {
      document.getElementById("ls-error").textContent = "undefined";
    } else {
      // Build target delta signature string
      const targetDeltas = [];
      let freeIdx = 0;
      for (let i = 1; i <= currentIntervalCount; i++) {
        const freeCheckbox = document.getElementById(`input-interval-${i}-free`);
        const targetDeltaInput = document.getElementById(`input-interval-${i}-target-delta`);
        const isFree = freeCheckbox && freeCheckbox.checked;
        
        if (isFree) {
          // For free deltas, show the optimized value
          if (freeIdx < result.freeValues.length) {
            targetDeltas.push(result.freeValues[freeIdx].toFixed(6) + "?");
            freeIdx++;
          } else {
            targetDeltas.push("?");
          }
        } else {
          const val = parseFloat(targetDeltaInput?.value);
          targetDeltas.push(isNaN(val) ? "?" : val.toString());
        }
      }
      const deltaSignature = "+" + targetDeltas.join("+");
      
      // Compute target ratios from optimized delta signature
      // First get the final deltas (with free values filled in)
      const finalDeltas = [];
      let freeIdx2 = 0;
      for (let i = 1; i <= currentIntervalCount; i++) {
        const freeCheckbox = document.getElementById(`input-interval-${i}-free`);
        const targetDeltaInput = document.getElementById(`input-interval-${i}-target-delta`);
        const isFree = freeCheckbox && freeCheckbox.checked;
        
        if (isFree && freeIdx2 < result.freeValues.length) {
          finalDeltas.push(result.freeValues[freeIdx2]);
          freeIdx2++;
        } else {
          const val = parseFloat(targetDeltaInput?.value);
          finalDeltas.push(isNaN(val) ? 1 : val);
        }
      }
      
      // Compute cumulative deltas and target ratios
      targetRatiosForViz = [1]; // Root
      let cumDelta = 0;
      for (let i = 0; i < finalDeltas.length; i++) {
        cumDelta += finalDeltas[i];
        targetRatiosForViz.push(1 + cumDelta / result.x);
      }
      
      const errorStr = result.error.toFixed(domain === "log" ? 3 : 6) + (domain === "log" ? " ¢" : "");
      let display = errorStr + ` (x = ${result.x.toFixed(4)}, target: ${deltaSignature})`;
      document.getElementById("ls-error").textContent = display;
      
      // Update visualization to show target
      updateVisualization();
    }
  } else {
    // No free deltas, use FDR calculation
    calculateFDRError(domain, model);
  }
}

// Set up event listeners
document.getElementById("btn-recalc-from-cents").addEventListener("click", recalcFromCents);
document.getElementById("btn-recalc-from-ratios").addEventListener("click", recalcFromRatios);
document.getElementById("btn-update-from-deltas").addEventListener("click", updateAllFromDeltas);
document.getElementById("btn-calculate-error").addEventListener("click", calculateLeastSquaresError);

// Clear target chord from visualization
document.getElementById("btn-clear-target").addEventListener("click", () => {
  targetRatiosForViz = null;
  updateVisualization();
});

// ============ Chord Visualization ============

// Track which viz window input was last edited
let vizWindowSource = "ratio"; // "ratio" or "cents"

function getVizWindow() {
  if (vizWindowSource === "cents") {
    const centsInput = document.getElementById("viz-window-cents").value;
    const cents = parseFloat(centsInput);
    if (!isNaN(cents) && cents > 0) {
      return Math.pow(2, cents / 1200);
    }
    return 2; // Default to 2/1
  }
  
  const input = document.getElementById("viz-window").value;
  // Parse as ratio (e.g., "2/1" or "3/2" or just "2")
  if (input.includes("/")) {
    const parts = input.split("/");
    const num = parseFloat(parts[0]);
    const den = parseFloat(parts[1]);
    if (!isNaN(num) && !isNaN(den) && den > 0) {
      return num / den;
    }
  }
  const val = parseFloat(input);
  return isNaN(val) || val <= 1 ? 2 : val;
}

function syncVizWindowFromRatio() {
  const ratio = getVizWindow();
  const cents = 1200 * Math.log2(ratio);
  document.getElementById("viz-window-cents").value = cents.toFixed(2);
}

function syncVizWindowFromCents() {
  const centsInput = document.getElementById("viz-window-cents").value;
  const cents = parseFloat(centsInput);
  if (!isNaN(cents) && cents > 0) {
    const ratio = Math.pow(2, cents / 1200);
    document.getElementById("viz-window").value = ratio.toFixed(6);
  }
}

function updateVisualization() {
  const frequencies = getChordFrequencies();
  if (frequencies.length === 0) return;
  
  const baseFreq = frequencies[0];
  const windowRatio = getVizWindow();
  const windowCents = 1200 * Math.log2(windowRatio);
  
  // Get ratios relative to base
  const ratios = frequencies.map(f => f / baseFreq);
  
  drawLinearViz(ratios, windowRatio, targetRatiosForViz);
  drawLogViz(ratios, windowCents, targetRatiosForViz);
}

function drawLinearViz(ratios, windowRatio, targetRatios) {
  const svg = document.getElementById("viz-linear");
  const width = svg.clientWidth || 400;
  const height = 60;
  
  // Clear existing content
  svg.innerHTML = "";
  
  const padding = 20;
  const lineY = height / 2;
  const usableWidth = width - 2 * padding;
  
  // Draw axis line
  const axis = document.createElementNS("http://www.w3.org/2000/svg", "line");
  axis.setAttribute("x1", padding);
  axis.setAttribute("y1", lineY);
  axis.setAttribute("x2", width - padding);
  axis.setAttribute("y2", lineY);
  axis.setAttribute("class", "viz-axis");
  svg.appendChild(axis);
  
  // Draw tick marks at 0.1 increments
  const tickInterval = 0.1;
  for (let t = 1; t <= windowRatio; t += tickInterval) {
    const x = padding + ((t - 1) / (windowRatio - 1)) * usableWidth;
    const tick = document.createElementNS("http://www.w3.org/2000/svg", "line");
    tick.setAttribute("x1", x);
    tick.setAttribute("y1", lineY - 4);
    tick.setAttribute("x2", x);
    tick.setAttribute("y2", lineY + 4);
    tick.setAttribute("class", "viz-tick");
    svg.appendChild(tick);
  }
  
  // Draw medium tick marks at 0.5 increments with labels (skip integers)
  for (let t = 1; t <= windowRatio; t += 0.5) {
    // Skip integers (handled by major ticks) and endpoints
    if (Math.abs(t - Math.round(t)) < 0.01) continue;
    
    const x = padding + ((t - 1) / (windowRatio - 1)) * usableWidth;
    const tick = document.createElementNS("http://www.w3.org/2000/svg", "line");
    tick.setAttribute("x1", x);
    tick.setAttribute("y1", lineY - 6);
    tick.setAttribute("x2", x);
    tick.setAttribute("y2", lineY + 6);
    tick.setAttribute("class", "viz-tick");
    svg.appendChild(tick);
    
    const label = document.createElementNS("http://www.w3.org/2000/svg", "text");
    label.setAttribute("x", x);
    label.setAttribute("y", lineY + 20);
    label.setAttribute("text-anchor", "middle");
    label.setAttribute("class", "viz-label-text");
    label.textContent = t.toFixed(1);
    svg.appendChild(label);
  }
  
  // Draw major tick marks and labels at every integer ratio (1, 2, 3, ...)
  for (let t = 1; t <= windowRatio; t += 1) {
    const x = padding + ((t - 1) / (windowRatio - 1)) * usableWidth;
    const tick = document.createElementNS("http://www.w3.org/2000/svg", "line");
    tick.setAttribute("x1", x);
    tick.setAttribute("y1", lineY - 8);
    tick.setAttribute("x2", x);
    tick.setAttribute("y2", lineY + 8);
    tick.setAttribute("class", "viz-tick");
    svg.appendChild(tick);
    
    const label = document.createElementNS("http://www.w3.org/2000/svg", "text");
    label.setAttribute("x", x);
    label.setAttribute("y", lineY + 22);
    label.setAttribute("text-anchor", "middle");
    label.setAttribute("class", "viz-label-text");
    label.textContent = t.toString();
    svg.appendChild(label);
  }
  
  // Draw points for each ratio
  ratios.forEach((r, i) => {
    if (r < 1 || r > windowRatio) return; // Outside window
    const x = padding + ((r - 1) / (windowRatio - 1)) * usableWidth;
    const circle = document.createElementNS("http://www.w3.org/2000/svg", "circle");
    circle.setAttribute("cx", x);
    circle.setAttribute("cy", lineY);
    circle.setAttribute("r", i === 0 ? 6 : 5);
    circle.setAttribute("class", i === 0 ? "viz-root" : "viz-point");
    svg.appendChild(circle);
  });
  
  // Draw target ratios if available
  if (targetRatios && targetRatios.length > 0) {
    targetRatios.forEach((r, i) => {
      if (r < 1 || r > windowRatio) return; // Outside window
      const x = padding + ((r - 1) / (windowRatio - 1)) * usableWidth;
      const circle = document.createElementNS("http://www.w3.org/2000/svg", "circle");
      circle.setAttribute("cx", x);
      circle.setAttribute("cy", lineY);
      circle.setAttribute("r", i === 0 ? 8 : 7);
      circle.setAttribute("class", i === 0 ? "viz-target-root" : "viz-target");
      svg.appendChild(circle);
    });
  }
}

function drawLogViz(ratios, windowCents, targetRatios) {
  const svg = document.getElementById("viz-log");
  const width = svg.clientWidth || 400;
  const height = 60;
  
  // Clear existing content
  svg.innerHTML = "";
  
  const padding = 20;
  const lineY = height / 2;
  const usableWidth = width - 2 * padding;
  
  // Draw axis line
  const axis = document.createElementNS("http://www.w3.org/2000/svg", "line");
  axis.setAttribute("x1", padding);
  axis.setAttribute("y1", lineY);
  axis.setAttribute("x2", width - padding);
  axis.setAttribute("y2", lineY);
  axis.setAttribute("class", "viz-axis");
  svg.appendChild(axis);
  
  // Draw tick marks at 100-cent increments
  const tickInterval = 100;
  for (let t = 0; t <= windowCents; t += tickInterval) {
    const x = padding + (t / windowCents) * usableWidth;
    const tick = document.createElementNS("http://www.w3.org/2000/svg", "line");
    tick.setAttribute("x1", x);
    tick.setAttribute("y1", lineY - 4);
    tick.setAttribute("x2", x);
    tick.setAttribute("y2", lineY + 4);
    tick.setAttribute("class", "viz-tick");
    svg.appendChild(tick);
  }
  
  // Draw medium tick marks at 600-cent (tritone) increments with labels
  for (let t = 0; t <= windowCents; t += 600) {
    // Skip endpoints (handled by major ticks)
    if (t === 0 || Math.abs(t - windowCents) < 1) continue;
    
    const x = padding + (t / windowCents) * usableWidth;
    const tick = document.createElementNS("http://www.w3.org/2000/svg", "line");
    tick.setAttribute("x1", x);
    tick.setAttribute("y1", lineY - 6);
    tick.setAttribute("x2", x);
    tick.setAttribute("y2", lineY + 6);
    tick.setAttribute("class", "viz-tick");
    svg.appendChild(tick);
    
    const label = document.createElementNS("http://www.w3.org/2000/svg", "text");
    label.setAttribute("x", x);
    label.setAttribute("y", lineY + 20);
    label.setAttribute("text-anchor", "middle");
    label.setAttribute("class", "viz-label-text");
    label.textContent = Math.round(t) + "¢";
    svg.appendChild(label);
  }
  
  // Draw major tick marks and labels at 0 and windowCents
  const majorTicks = [0, windowCents];
  majorTicks.forEach(t => {
    const x = padding + (t / windowCents) * usableWidth;
    const tick = document.createElementNS("http://www.w3.org/2000/svg", "line");
    tick.setAttribute("x1", x);
    tick.setAttribute("y1", lineY - 8);
    tick.setAttribute("x2", x);
    tick.setAttribute("y2", lineY + 8);
    tick.setAttribute("class", "viz-tick");
    svg.appendChild(tick);
    
    const label = document.createElementNS("http://www.w3.org/2000/svg", "text");
    label.setAttribute("x", x);
    label.setAttribute("y", lineY + 22);
    label.setAttribute("text-anchor", "middle");
    label.setAttribute("class", "viz-label-text");
    label.textContent = t === 0 ? "0¢" : Math.round(windowCents) + "¢";
    svg.appendChild(label);
  });
  
  // Draw points for each ratio (in cents)
  ratios.forEach((r, i) => {
    const cents = 1200 * Math.log2(r);
    if (cents < 0 || cents > windowCents) return; // Outside window
    const x = padding + (cents / windowCents) * usableWidth;
    const circle = document.createElementNS("http://www.w3.org/2000/svg", "circle");
    circle.setAttribute("cx", x);
    circle.setAttribute("cy", lineY);
    circle.setAttribute("r", i === 0 ? 6 : 5);
    circle.setAttribute("class", i === 0 ? "viz-root" : "viz-point");
    svg.appendChild(circle);
  });
  
  // Draw target ratios if available
  if (targetRatios && targetRatios.length > 0) {
    targetRatios.forEach((r, i) => {
      const cents = 1200 * Math.log2(r);
      if (cents < 0 || cents > windowCents) return; // Outside window
      const x = padding + (cents / windowCents) * usableWidth;
      const circle = document.createElementNS("http://www.w3.org/2000/svg", "circle");
      circle.setAttribute("cx", x);
      circle.setAttribute("cy", lineY);
      circle.setAttribute("r", i === 0 ? 8 : 7);
      circle.setAttribute("class", i === 0 ? "viz-target-root" : "viz-target");
      svg.appendChild(circle);
    });
  }
}

// Update visualization on window change
document.getElementById("btn-update-viz").addEventListener("click", updateVisualization);

// Track which input was last edited and sync them
document.getElementById("viz-window").addEventListener("input", () => {
  vizWindowSource = "ratio";
  syncVizWindowFromRatio();
});
document.getElementById("viz-window-cents").addEventListener("input", () => {
  vizWindowSource = "cents";
  syncVizWindowFromCents();
});

// Update visualization whenever chord changes
const originalRefreshChordIfPlaying = refreshChordIfPlaying;
refreshChordIfPlaying = function() {
  originalRefreshChordIfPlaying();
  updateVisualization();
};

// Initial visualization
updateFromRatio(1); // This already triggers refreshChordIfPlaying
updateVisualization();
