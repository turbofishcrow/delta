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
 * This is a UI wrapper that extracts data from the DOM and calls the pure FDR function from fdr.js.
 *
 * @param {string} domain - "linear" or "log" (logarithmic)
 * @param {string} model - "rooted", "pairwise", or "all-steps"
 * @returns {Object|null} - {error, x, targetRatios, deltaSignature} or null if error
 */
function calculateFDRErrorUI(domain, model) {
  // Extract chord data from DOM
  const ratios = [];
  const targetDeltas = [];

  for (let i = 1; i <= currentIntervalCount; i++) {
    const centsInput = document.getElementById(`input-interval-${i}-cents`);
    const targetDeltaInput = document.getElementById(`input-interval-${i}-target-delta`);

    if (!centsInput || !targetDeltaInput) continue;

    const cents = parseCents(centsInput.value);
    const targetDelta = parseFloat(targetDeltaInput.value);

    if (isNaN(cents) || isNaN(targetDelta)) continue;

    const r_i = centsToRatio(cents);
    ratios.push(r_i);
    targetDeltas.push(targetDelta);
  }

  if (ratios.length === 0) {
    document.getElementById("ls-error").textContent = "—";
    return null;
  }

  // Call the pure FDR calculation function from fdr.js
  const result = calculateFDRError(ratios, targetDeltas, domain, model);

  // Compute target ratios for visualization
  const cumulativeDeltas = [];
  let cumSum = 0;
  for (let i = 0; i < targetDeltas.length; i++) {
    cumSum += targetDeltas[i];
    cumulativeDeltas.push(cumSum);
  }

  const targetRatios = [1]; // Root
  for (let i = 0; i < targetDeltas.length; i++) {
    targetRatios.push(1 + cumulativeDeltas[i] / result.x);
  }

  // Build delta signature string
  const deltaSignature = "+" + targetDeltas.join("+");

  // Store target ratios for visualization
  targetRatiosForViz = targetRatios;

  // Display result
  const errorStr = result.error.toFixed(domain === "log" ? 3 : 6) + (domain === "log" ? " ¢" : "");
  document.getElementById("ls-error").textContent = errorStr + ` (x = ${result.x.toFixed(4)}, target: ${deltaSignature})`;

  // Update visualization
  updateVisualization();

  return { error: result.error, x: result.x, targetRatios, deltaSignature };
}

// ============ PDR Error Calculation ============

/**
 * Calculate PDR (Partially Delta-Rational) least-squares error.
 * This is a UI wrapper that extracts data from the DOM and calls the pure PDR function from pdr.js.
 *
 * @param {string} domain - "linear" or "log" (logarithmic)
 * @param {string} model - "rooted", "pairwise", or "all-steps"
 * @returns {{error: number, x: number, freeValues: number[]}|null} - Result or null if error
 */
function calculatePDRErrorUI(domain, model) {
  // Extract chord data from DOM
  const intervalsFromRoot = [];
  const targetDeltas = [];
  const isFree = [];

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

  // Call the pure PDR calculation function from pdr.js
  return calculatePDRError(intervalsFromRoot, targetDeltas, isFree, domain, model);
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
    const result = calculatePDRErrorUI(domain, model);
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
    calculateFDRErrorUI(domain, model);
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
