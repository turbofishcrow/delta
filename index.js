// ============ Shared State ============

const AppState = {
  activeTab: 'build',
  audioContext: null,
  activeOscillators: [],
  isPlaying: false,
  currentWaveform: 'sine',
  DEFAULT_PITCH_STANDARD: 220
};

// ============ Shared Utilities ============

const Utils = {
  parseCents(input) {
    if (typeof input !== "string") {
      return parseFloat(input);
    }
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
    return parseFloat(input);
  },

  ratioToCents(ratio) {
    let value;
    if (typeof ratio === "string" && ratio.includes("/")) {
      const parts = ratio.split("/");
      value = parseFloat(parts[0]) / parseFloat(parts[1]);
    } else {
      value = parseFloat(ratio);
    }
    if (isNaN(value) || value <= 0) return NaN;
    return 1200 * Math.log2(value);
  },

  centsToRatio(cents) {
    return Math.pow(2, cents / 1200);
  },

  parseRatio(input) {
    if (typeof input === "string" && input.includes("/")) {
      const parts = input.split("/");
      const num = parseFloat(parts[0]);
      const den = parseFloat(parts[1]);
      if (num > 0 && den > 0) return num / den;
      return NaN;
    }
    return parseFloat(input);
  }
};

// ============ Audio System ============

const Audio = {
  getContext() {
    if (!AppState.audioContext) {
      AppState.audioContext = new (window.AudioContext || window.webkitAudioContext)();
    }
    return AppState.audioContext;
  },

  createSemisineWave(ctx) {
    const length = 4096;
    const real = new Float32Array(length);
    const imag = new Float32Array(length);
    real[0] = 0;
    imag[0] = 0;
    real[1] = 0;
    imag[1] = 0.5;
    for (let n = 2; n < length; n++) {
      if (n % 2 === 0) {
        real[n] = 2 / (Math.PI * (1 - n * n));
        imag[n] = 0;
      } else {
        real[n] = 0;
        imag[n] = 0;
      }
    }
    return ctx.createPeriodicWave(real, imag, { disableNormalization: false });
  },

  createOscillator(frequency, waveform) {
    const ctx = this.getContext();
    const oscillator = ctx.createOscillator();
    const gainNode = ctx.createGain();

    if (waveform === "semisine") {
      oscillator.setPeriodicWave(this.createSemisineWave(ctx));
    } else {
      oscillator.type = waveform;
    }

    oscillator.frequency.setValueAtTime(frequency, ctx.currentTime);
    gainNode.gain.setValueAtTime(0.3, ctx.currentTime);
    oscillator.connect(gainNode);
    gainNode.connect(ctx.destination);

    return { oscillator, gainNode };
  },

  playFrequencies(frequencies) {
    this.stop();

    const ctx = this.getContext();
    if (ctx.state === "suspended") {
      ctx.resume();
    }

    AppState.isPlaying = true;
    const numNotes = frequencies.length;

    frequencies.forEach((freq) => {
      const { oscillator, gainNode } = this.createOscillator(freq, AppState.currentWaveform);
      gainNode.gain.setValueAtTime(0.3 / Math.sqrt(numNotes), ctx.currentTime);
      oscillator.start();
      AppState.activeOscillators.push({ oscillator, gainNode });
    });
  },

  stop() {
    const ctx = this.getContext();
    AppState.activeOscillators.forEach(({ oscillator, gainNode }) => {
      gainNode.gain.setTargetAtTime(0, ctx.currentTime, 0.05);
      oscillator.stop(ctx.currentTime + 0.1);
    });
    AppState.activeOscillators = [];
    AppState.isPlaying = false;
  },

  setWaveform(waveform, tabPrefix) {
    AppState.currentWaveform = waveform;
    // Sync waveform selector across all tabs
    for (const prefix of ['build', 'measure', 'approximate']) {
      if (prefix === tabPrefix) continue;
      const select = document.getElementById(`${prefix}-waveform`);
      if (select) select.value = waveform;
    }
  }
};

// ============ Visualization System ============

const Visualization = {
  // Track which input was last edited per tab
  vizWindowSource: {
    build: 'ratio',
    measure: 'ratio'
  },

  // Target ratios per tab
  targetRatios: {
    build: null,
    measure: null
  },

  getWindow(tabPrefix) {
    const source = this.vizWindowSource[tabPrefix];
    if (source === "cents") {
      const centsInput = document.getElementById(`${tabPrefix}-viz-window-cents`).value;
      const cents = parseFloat(centsInput);
      if (!isNaN(cents) && cents > 0) {
        return Math.pow(2, cents / 1200);
      }
      return 2;
    }

    const input = document.getElementById(`${tabPrefix}-viz-window`).value;
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
  },

  syncWindowFromRatio(tabPrefix) {
    const ratio = this.getWindow(tabPrefix);
    const cents = 1200 * Math.log2(ratio);
    document.getElementById(`${tabPrefix}-viz-window-cents`).value = cents.toFixed(2);
  },

  syncWindowFromCents(tabPrefix) {
    const centsInput = document.getElementById(`${tabPrefix}-viz-window-cents`).value;
    const cents = parseFloat(centsInput);
    if (!isNaN(cents) && cents > 0) {
      const ratio = Math.pow(2, cents / 1200);
      document.getElementById(`${tabPrefix}-viz-window`).value = ratio.toFixed(6);
    }
  },

  update(tabPrefix) {
    if (tabPrefix === 'approximate') return;
    const tabModule = tabPrefix === 'build' ? BuildTab : MeasureTab;
    const frequencies = tabModule.getChordFrequencies();
    if (frequencies.length === 0) return;

    const baseFreq = frequencies[0];
    const windowRatio = this.getWindow(tabPrefix);
    const windowCents = 1200 * Math.log2(windowRatio);
    const ratios = frequencies.map(f => f / baseFreq);
    const targetRatios = this.targetRatios[tabPrefix];

    this.drawLinear(`${tabPrefix}-viz-linear`, ratios, windowRatio, targetRatios);
    this.drawLog(`${tabPrefix}-viz-log`, ratios, windowCents, targetRatios);
  },

  drawLinear(svgId, ratios, windowRatio, targetRatios) {
    const svg = document.getElementById(svgId);
    if (!svg) return;
    const width = svg.clientWidth || 400;
    const height = 60;
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

    // Draw tick marks
    for (let t = 1; t <= windowRatio; t += 0.1) {
      const x = padding + ((t - 1) / (windowRatio - 1)) * usableWidth;
      const tick = document.createElementNS("http://www.w3.org/2000/svg", "line");
      tick.setAttribute("x1", x);
      tick.setAttribute("y1", lineY - 4);
      tick.setAttribute("x2", x);
      tick.setAttribute("y2", lineY + 4);
      tick.setAttribute("class", "viz-tick");
      svg.appendChild(tick);
    }

    // Major ticks at integers
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

    // Draw chord points
    ratios.forEach((r, i) => {
      if (r < 1 || r > windowRatio) return;
      const x = padding + ((r - 1) / (windowRatio - 1)) * usableWidth;
      const circle = document.createElementNS("http://www.w3.org/2000/svg", "circle");
      circle.setAttribute("cx", x);
      circle.setAttribute("cy", lineY);
      circle.setAttribute("r", i === 0 ? 6 : 5);
      circle.setAttribute("class", i === 0 ? "viz-root" : "viz-point");
      svg.appendChild(circle);
    });

    // Draw target ratios
    if (targetRatios && targetRatios.length > 0) {
      const isFreeArray = targetRatios.isFree || [];
      targetRatios.forEach((r, i) => {
        if (r === null || r === undefined) return;
        if (r < 0.999 || r > windowRatio * 1.001) return;
        const x = padding + ((r - 1) / (windowRatio - 1)) * usableWidth;
        const circle = document.createElementNS("http://www.w3.org/2000/svg", "circle");
        circle.setAttribute("cx", x);
        circle.setAttribute("cy", lineY);
        circle.setAttribute("r", i === 0 ? 8 : 7);
        let circleClass = i === 0 ? "viz-target-root" : (isFreeArray[i] ? "viz-target-free" : "viz-target");
        circle.setAttribute("class", circleClass);
        svg.appendChild(circle);
      });
    }
  },

  drawLog(svgId, ratios, windowCents, targetRatios) {
    const svg = document.getElementById(svgId);
    if (!svg) return;
    const width = svg.clientWidth || 400;
    const height = 60;
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
    for (let t = 0; t <= windowCents; t += 100) {
      const x = padding + (t / windowCents) * usableWidth;
      const tick = document.createElementNS("http://www.w3.org/2000/svg", "line");
      tick.setAttribute("x1", x);
      tick.setAttribute("y1", lineY - 4);
      tick.setAttribute("x2", x);
      tick.setAttribute("y2", lineY + 4);
      tick.setAttribute("class", "viz-tick");
      svg.appendChild(tick);
    }

    // Major ticks at 0 and windowCents
    [0, windowCents].forEach(t => {
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

    // Draw chord points
    ratios.forEach((r, i) => {
      const cents = 1200 * Math.log2(r);
      if (cents < 0 || cents > windowCents) return;
      const x = padding + (cents / windowCents) * usableWidth;
      const circle = document.createElementNS("http://www.w3.org/2000/svg", "circle");
      circle.setAttribute("cx", x);
      circle.setAttribute("cy", lineY);
      circle.setAttribute("r", i === 0 ? 6 : 5);
      circle.setAttribute("class", i === 0 ? "viz-root" : "viz-point");
      svg.appendChild(circle);
    });

    // Draw target ratios
    if (targetRatios && targetRatios.length > 0) {
      const isFreeArray = targetRatios.isFree || [];
      targetRatios.forEach((r, i) => {
        if (r === null || r === undefined) return;
        const cents = 1200 * Math.log2(r);
        if (cents < -1 || cents > windowCents + 1) return;
        const x = padding + (cents / windowCents) * usableWidth;
        const circle = document.createElementNS("http://www.w3.org/2000/svg", "circle");
        circle.setAttribute("cx", x);
        circle.setAttribute("cy", lineY);
        circle.setAttribute("r", i === 0 ? 8 : 7);
        let circleClass = i === 0 ? "viz-target-root" : (isFreeArray[i] ? "viz-target-free" : "viz-target");
        circle.setAttribute("class", circleClass);
        svg.appendChild(circle);
      });
    }
  }
};

// ============ Tab Controller ============

const TabController = {
  init() {
    document.querySelectorAll('.tab-btn').forEach(btn => {
      btn.addEventListener('click', () => this.switchTab(btn.dataset.tab));
    });
  },

  switchTab(tabId) {
    Audio.stop();
    AppState.activeTab = tabId;

    document.querySelectorAll('.tab-btn').forEach(btn => {
      btn.classList.toggle('active', btn.dataset.tab === tabId);
    });
    document.querySelectorAll('.tab-panel').forEach(panel => {
      panel.classList.toggle('active', panel.id === `tab-${tabId}`);
    });

    // Update visualization for the new tab
    Visualization.update(tabId);
  }
};

// ============ Build Tab Module ============

const BuildTab = {
  intervalCount: 1,
  prefix: 'build',

  getBaseFrequency() {
    const freq = parseFloat(document.getElementById(`${this.prefix}-base-frequency`).value);
    if (isNaN(freq) || freq <= 0) {
      return AppState.DEFAULT_PITCH_STANDARD;
    }
    return freq;
  },

  getChordFrequencies() {
    const baseFreq = this.getBaseFrequency();
    const frequencies = [baseFreq];

    for (let i = 1; i <= this.intervalCount; i++) {
      const centsInput = document.getElementById(`${this.prefix}-interval-${i}-cents`);
      if (centsInput) {
        const cents = Utils.parseCents(centsInput.value);
        if (!isNaN(cents)) {
          frequencies.push(baseFreq * Math.pow(2, cents / 1200));
        }
      }
    }
    return frequencies;
  },

  getFrequencyForInterval(intervalIndex) {
    const baseFreq = this.getBaseFrequency();
    const centsInput = document.getElementById(`${this.prefix}-interval-${intervalIndex}-cents`);
    if (centsInput) {
      const cents = Utils.parseCents(centsInput.value);
      if (!isNaN(cents)) {
        return baseFreq * Math.pow(2, cents / 1200);
      }
    }
    return baseFreq;
  },

  getPreviousFrequency(intervalIndex) {
    if (intervalIndex <= 1) {
      return this.getBaseFrequency();
    }
    return this.getFrequencyForInterval(intervalIndex - 1);
  },

  updateFromCents(intervalIndex) {
    const centsInput = document.getElementById(`${this.prefix}-interval-${intervalIndex}-cents`);
    const ratioInput = document.getElementById(`${this.prefix}-interval-${intervalIndex}-ratio`);

    const cents = Utils.parseCents(centsInput.value);
    if (isNaN(cents) || cents <= 0) {
      alert("Cents must be a positive number.");
      return;
    }

    centsInput.value = cents.toFixed(3);
    const ratio = Utils.centsToRatio(cents);
    ratioInput.value = ratio.toFixed(6);

    this.recalculateIntervalsOtherThan(intervalIndex);
    this.refreshIfPlaying();
  },

  recalculateIntervalsOtherThan(intervalIndex) {
    const baseFreq = this.getBaseFrequency();
    const changedCentsInput = document.getElementById(`${this.prefix}-interval-${intervalIndex}-cents`);
    const changedCents = Utils.parseCents(changedCentsInput.value);
    if (isNaN(changedCents)) return;

    const changedFreq = baseFreq * Utils.centsToRatio(changedCents);

    let sumRelativeDeltas = 0;
    for (let i = 1; i <= intervalIndex; i++) {
      const deltaInput = document.getElementById(`${this.prefix}-interval-${i}-delta`);
      if (!deltaInput) continue;
      const relativeDelta = parseFloat(deltaInput.value);
      if (isNaN(relativeDelta)) continue;
      sumRelativeDeltas += relativeDelta;
    }

    if (sumRelativeDeltas <= 0) return;
    const firstDelta = (changedFreq - baseFreq) / sumRelativeDeltas;
    if (firstDelta <= 0) return;

    for (let i = 1; i <= this.intervalCount; i++) {
      const deltaInput = document.getElementById(`${this.prefix}-interval-${i}-delta`);
      const centsInput = document.getElementById(`${this.prefix}-interval-${i}-cents`);
      const ratioInput = document.getElementById(`${this.prefix}-interval-${i}-ratio`);

      if (!deltaInput || !centsInput || !ratioInput) continue;

      const relativeDelta = parseFloat(deltaInput.value);
      if (isNaN(relativeDelta)) continue;

      const absoluteDelta = relativeDelta * firstDelta;
      const prevFreq = this.getPreviousFrequency(i);
      const newFreq = prevFreq + absoluteDelta;

      const newCents = 1200 * Math.log2(newFreq / baseFreq);
      centsInput.value = newCents.toFixed(3);
      ratioInput.value = (newFreq / baseFreq).toFixed(6);
    }
  },

  updateFromDelta(intervalIndex) {
    const deltaInput = document.getElementById(`${this.prefix}-interval-${intervalIndex}-delta`);
    const deltaValue = parseFloat(deltaInput.value);
    if (isNaN(deltaValue) || deltaValue <= 0) {
      alert("Delta must be a positive number.");
      return;
    }

    const baseFreq = this.getBaseFrequency();
    let unitDelta;

    if (this.intervalCount >= 2 && intervalIndex === 1) {
      const secondCentsInput = document.getElementById(`${this.prefix}-interval-2-cents`);
      const secondDeltaInput = document.getElementById(`${this.prefix}-interval-2-delta`);
      const firstCentsInput = document.getElementById(`${this.prefix}-interval-1-cents`);

      const secondCents = Utils.parseCents(secondCentsInput.value);
      const secondRelativeDelta = parseFloat(secondDeltaInput.value);
      const firstCents = Utils.parseCents(firstCentsInput.value);

      if (isNaN(secondCents) || isNaN(secondRelativeDelta) || isNaN(firstCents) || secondRelativeDelta <= 0) return;

      const firstFreq = baseFreq * Utils.centsToRatio(firstCents);
      const secondFreq = baseFreq * Utils.centsToRatio(secondCents);
      const secondAbsoluteDelta = secondFreq - firstFreq;
      unitDelta = secondAbsoluteDelta / secondRelativeDelta;
    } else if (intervalIndex === 1) {
      const firstCentsInput = document.getElementById(`${this.prefix}-interval-1-cents`);
      const firstCents = Utils.parseCents(firstCentsInput.value);
      if (isNaN(firstCents)) return;

      const firstFreq = baseFreq * Utils.centsToRatio(firstCents);
      const firstAbsoluteDelta = firstFreq - baseFreq;
      unitDelta = firstAbsoluteDelta;
    } else {
      const firstCentsInput = document.getElementById(`${this.prefix}-interval-1-cents`);
      const firstDeltaInput = document.getElementById(`${this.prefix}-interval-1-delta`);
      const firstCents = Utils.parseCents(firstCentsInput.value);
      const firstRelativeDelta = parseFloat(firstDeltaInput.value) || 1;

      if (isNaN(firstCents)) return;

      const firstFreq = baseFreq * Utils.centsToRatio(firstCents);
      const firstAbsoluteDelta = firstFreq - baseFreq;
      unitDelta = firstAbsoluteDelta / firstRelativeDelta;
    }

    if (unitDelta <= 0) return;

    for (let i = intervalIndex; i <= this.intervalCount; i++) {
      const iDeltaInput = document.getElementById(`${this.prefix}-interval-${i}-delta`);
      const iCentsInput = document.getElementById(`${this.prefix}-interval-${i}-cents`);
      const iRatioInput = document.getElementById(`${this.prefix}-interval-${i}-ratio`);

      if (!iDeltaInput || !iCentsInput || !iRatioInput) continue;

      const iRelativeDelta = parseFloat(iDeltaInput.value);
      if (isNaN(iRelativeDelta)) continue;

      const iAbsoluteDelta = iRelativeDelta * unitDelta;
      const iPrevFreq = this.getPreviousFrequency(i);
      const iNewFreq = iPrevFreq + iAbsoluteDelta;

      const iNewCents = 1200 * Math.log2(iNewFreq / baseFreq);
      iCentsInput.value = iNewCents.toFixed(3);
      iRatioInput.value = (iNewFreq / baseFreq).toFixed(6);
    }

    this.refreshIfPlaying();
  },

  updateAllDeltas() {
    const baseFreq = this.getBaseFrequency();
    const firstCentsInput = document.getElementById(`${this.prefix}-interval-1-cents`);
    const firstCents = Utils.parseCents(firstCentsInput.value);
    if (isNaN(firstCents)) return;

    const firstFreq = baseFreq * Utils.centsToRatio(firstCents);
    const firstDelta = firstFreq - baseFreq;
    if (firstDelta <= 0) return;

    const firstDeltaInput = document.getElementById(`${this.prefix}-interval-1-delta`);
    if (firstDeltaInput) {
      firstDeltaInput.value = "1";
    }

    for (let i = 2; i <= this.intervalCount; i++) {
      this.updateDeltaDisplay(i, firstDelta);
    }
  },

  updateDeltaDisplay(intervalIndex, firstDelta) {
    const baseFreq = this.getBaseFrequency();
    const centsInput = document.getElementById(`${this.prefix}-interval-${intervalIndex}-cents`);
    const deltaInput = document.getElementById(`${this.prefix}-interval-${intervalIndex}-delta`);

    if (!centsInput || !deltaInput) return;

    const cents = Utils.parseCents(centsInput.value);
    if (isNaN(cents)) return;

    const currentFreq = baseFreq * Utils.centsToRatio(cents);
    const prevFreq = this.getPreviousFrequency(intervalIndex);
    const absoluteDelta = currentFreq - prevFreq;

    const relativeDelta = absoluteDelta / firstDelta;
    deltaInput.value = relativeDelta.toFixed(6);
  },

  recalcFromCents() {
    for (let i = 1; i <= this.intervalCount; i++) {
      const centsInput = document.getElementById(`${this.prefix}-interval-${i}-cents`);
      if (!centsInput) continue;

      const cents = Utils.parseCents(centsInput.value);
      if (isNaN(cents) || cents <= 0) {
        alert(`Interval ${i}: Cents must be a positive number.`);
        return;
      }
    }

    for (let i = 1; i <= this.intervalCount; i++) {
      const centsInput = document.getElementById(`${this.prefix}-interval-${i}-cents`);
      const ratioInput = document.getElementById(`${this.prefix}-interval-${i}-ratio`);

      if (!centsInput || !ratioInput) continue;

      const cents = Utils.parseCents(centsInput.value);
      if (isNaN(cents)) continue;

      centsInput.value = cents.toFixed(3);
      const ratio = Utils.centsToRatio(cents);
      ratioInput.value = ratio.toFixed(6);
    }

    this.updateAllDeltas();
    this.refreshIfPlaying();
  },

  updateAllFromDeltas() {
    const baseFreq = this.getBaseFrequency();
    const lastCentsInput = document.getElementById(`${this.prefix}-interval-${this.intervalCount}-cents`);
    const lastCents = Utils.parseCents(lastCentsInput.value);
    if (isNaN(lastCents)) return;

    const lastFreq = baseFreq * Utils.centsToRatio(lastCents);

    let sumRelativeDeltas = 0;
    for (let i = 1; i <= this.intervalCount; i++) {
      const deltaInput = document.getElementById(`${this.prefix}-interval-${i}-delta`);
      if (!deltaInput) continue;
      const relativeDelta = parseFloat(deltaInput.value);
      if (isNaN(relativeDelta)) continue;
      sumRelativeDeltas += relativeDelta;
    }

    if (sumRelativeDeltas <= 0) return;
    const refDelta = (lastFreq - baseFreq) / sumRelativeDeltas;
    if (refDelta <= 0) return;

    for (let i = 1; i <= this.intervalCount; i++) {
      const deltaInput = document.getElementById(`${this.prefix}-interval-${i}-delta`);
      const centsInput = document.getElementById(`${this.prefix}-interval-${i}-cents`);
      const ratioInput = document.getElementById(`${this.prefix}-interval-${i}-ratio`);

      if (!deltaInput || !centsInput || !ratioInput) continue;

      const relativeDelta = parseFloat(deltaInput.value);
      if (isNaN(relativeDelta)) continue;

      const absoluteDelta = relativeDelta * refDelta;
      const prevFreq = this.getPreviousFrequency(i);
      const newFreq = prevFreq + absoluteDelta;

      const newCents = 1200 * Math.log2(newFreq / baseFreq);
      centsInput.value = newCents.toFixed(3);
      ratioInput.value = (newFreq / baseFreq).toFixed(6);
    }

    this.refreshIfPlaying();
  },

  play() {
    const frequencies = this.getChordFrequencies();
    Audio.playFrequencies(frequencies);
  },

  refreshIfPlaying() {
    if (AppState.isPlaying && AppState.activeTab === this.prefix) {
      this.play();
    }
    Visualization.update(this.prefix);
  },

  addInterval() {
    this.intervalCount++;
    const intervalTable = document.getElementById(`${this.prefix}-intervals`);
    const newRow = document.createElement("tr");
    newRow.innerHTML = `
      <td>
        <input type="text" id="${this.prefix}-interval-${this.intervalCount}-cents" style="width: 80px" />
        Interval (cents or a\\n, from root)
        <br/>
        <input type="text" id="${this.prefix}-interval-${this.intervalCount}-ratio" style="width: 80px" />
        Ratio (from root)
        <br/>
        <button id="${this.prefix}-btn-update-interval-${this.intervalCount}">Update (keep deltas)</button>
        <br/>
      </td>
      <td>
        <input type="number" id="${this.prefix}-interval-${this.intervalCount}-delta" value="1" style="width: 80px" />
        Delta
        <button id="${this.prefix}-btn-update-delta-${this.intervalCount}">Update (keep other deltas)</button>
        <br/>
      </td>
    `;
    intervalTable.appendChild(newRow);
    this.attachIntervalListeners(this.intervalCount);
    this.updateFromDelta(this.intervalCount);
  },

  removeInterval() {
    if (this.intervalCount > 1) {
      const intervalTable = document.getElementById(`${this.prefix}-intervals`);
      intervalTable.removeChild(intervalTable.lastElementChild);
      this.intervalCount--;
      this.refreshIfPlaying();
    }
  },

  clearIntervals() {
    while (this.intervalCount > 1) {
      const intervalTable = document.getElementById(`${this.prefix}-intervals`);
      intervalTable.removeChild(intervalTable.lastElementChild);
      this.intervalCount--;
    }
    this.refreshIfPlaying();
  },

  attachIntervalListeners(intervalIndex) {
    const intervalBtn = document.getElementById(`${this.prefix}-btn-update-interval-${intervalIndex}`);
    const deltaBtn = document.getElementById(`${this.prefix}-btn-update-delta-${intervalIndex}`);
    const centsInput = document.getElementById(`${this.prefix}-interval-${intervalIndex}-cents`);
    const ratioInput = document.getElementById(`${this.prefix}-interval-${intervalIndex}-ratio`);

    if (intervalBtn) {
      intervalBtn.addEventListener("click", () => this.updateFromCents(intervalIndex));
    }
    if (deltaBtn) {
      deltaBtn.addEventListener("click", () => this.updateFromDelta(intervalIndex));
    }

    if (centsInput) {
      centsInput.addEventListener("input", () => {
        const cents = Utils.parseCents(centsInput.value);
        if (!isNaN(cents) && cents > 0) {
          const ratio = Utils.centsToRatio(cents);
          ratioInput.value = ratio.toFixed(6);
        }
      });
    }
    if (ratioInput) {
      ratioInput.addEventListener("input", () => {
        const cents = Utils.ratioToCents(ratioInput.value);
        if (!isNaN(cents) && cents > 0) {
          centsInput.value = cents.toFixed(3);
        }
      });
    }
  },

  init() {
    // Attach listeners for first interval
    this.attachIntervalListeners(1);

    // Audio controls
    document.getElementById(`${this.prefix}-btn-play`).addEventListener("click", () => this.play());
    document.getElementById(`${this.prefix}-btn-stop`).addEventListener("click", () => Audio.stop());
    document.getElementById(`${this.prefix}-waveform`).addEventListener("change", (e) => {
      Audio.setWaveform(e.target.value, this.prefix);
      if (AppState.isPlaying && AppState.activeTab === this.prefix) {
        this.play();
      }
    });

    // Interval management
    document.getElementById(`${this.prefix}-btn-add`).addEventListener("click", () => this.addInterval());
    document.getElementById(`${this.prefix}-btn-remove`).addEventListener("click", () => this.removeInterval());
    document.getElementById(`${this.prefix}-btn-clear`).addEventListener("click", () => this.clearIntervals());

    // Global update buttons
    document.getElementById(`${this.prefix}-btn-recalc-deltas`).addEventListener("click", () => this.recalcFromCents());
    document.getElementById(`${this.prefix}-btn-update-from-deltas`).addEventListener("click", () => this.updateAllFromDeltas());

    // Base frequency
    document.getElementById(`${this.prefix}-base-frequency`).addEventListener("input", () => this.refreshIfPlaying());

    // Visualization controls
    document.getElementById(`${this.prefix}-btn-update-viz`).addEventListener("click", () => Visualization.update(this.prefix));
    document.getElementById(`${this.prefix}-viz-window`).addEventListener("input", () => {
      Visualization.vizWindowSource[this.prefix] = "ratio";
      Visualization.syncWindowFromRatio(this.prefix);
    });
    document.getElementById(`${this.prefix}-viz-window-cents`).addEventListener("input", () => {
      Visualization.vizWindowSource[this.prefix] = "cents";
      Visualization.syncWindowFromCents(this.prefix);
    });

    // Initialize first interval
    this.updateFromCents(1);
    Visualization.update(this.prefix);
  }
};

// ============ Measure Tab Module ============

const MeasureTab = {
  intervalCount: 1,
  prefix: 'measure',

  getBaseFrequency() {
    const freq = parseFloat(document.getElementById(`${this.prefix}-base-frequency`).value);
    if (isNaN(freq) || freq <= 0) {
      return AppState.DEFAULT_PITCH_STANDARD;
    }
    return freq;
  },

  getChordFrequencies() {
    const baseFreq = this.getBaseFrequency();
    const frequencies = [baseFreq];

    for (let i = 1; i <= this.intervalCount; i++) {
      const centsInput = document.getElementById(`${this.prefix}-interval-${i}-cents`);
      if (centsInput) {
        const cents = Utils.parseCents(centsInput.value);
        if (!isNaN(cents)) {
          frequencies.push(baseFreq * Math.pow(2, cents / 1200));
        }
      }
    }
    return frequencies;
  },

  getTargetChordFrequencies() {
    const baseFreq = this.getBaseFrequency();
    const targetRatios = Visualization.targetRatios[this.prefix];
    if (!targetRatios || targetRatios.length === 0) {
      return this.getChordFrequencies(); // Fall back to actual chord
    }
    return targetRatios.filter(r => r !== null).map(r => baseFreq * r);
  },

  play() {
    const frequencies = this.getChordFrequencies();
    Audio.playFrequencies(frequencies);
  },

  playTarget() {
    // Compute error first to get target ratios
    this.calculateError();
    const frequencies = this.getTargetChordFrequencies();
    Audio.playFrequencies(frequencies);
  },

  refreshIfPlaying() {
    if (AppState.isPlaying && AppState.activeTab === this.prefix) {
      this.play();
    }
    Visualization.update(this.prefix);
  },

  addInterval() {
    this.intervalCount++;
    const intervalTable = document.getElementById(`${this.prefix}-intervals`);
    const newRow = document.createElement("tr");
    newRow.innerHTML = `
      <td>
        <input type="text" id="${this.prefix}-interval-${this.intervalCount}-cents" style="width: 80px" value="701.955" />
        Interval (cents or a\\n)<br/<br/>
        <input type="text" id="${this.prefix}-interval-${this.intervalCount}-ratio" style="width: 80px" value="1.5" />
        Ratio
      </td>
      <td>
        Target delta<input type="number" id="${this.prefix}-interval-${this.intervalCount}-target-delta" value="1" style="width: 60px" />
        <br/>
        Free<input type="checkbox" id="${this.prefix}-interval-${this.intervalCount}-free" />
        
      </td>
    `;
    intervalTable.appendChild(newRow);
    this.attachIntervalListeners(this.intervalCount);
    this.refreshIfPlaying();
  },

  removeInterval() {
    if (this.intervalCount > 1) {
      const intervalTable = document.getElementById(`${this.prefix}-intervals`);
      intervalTable.removeChild(intervalTable.lastElementChild);
      this.intervalCount--;
      this.refreshIfPlaying();
    }
  },

  copyFromBuild() {
    // Clear existing intervals except first
    while (this.intervalCount > 1) {
      const intervalTable = document.getElementById(`${this.prefix}-intervals`);
      intervalTable.removeChild(intervalTable.lastElementChild);
      this.intervalCount--;
    }

    // Copy base frequency
    const buildBaseFreq = document.getElementById('build-base-frequency').value;
    document.getElementById(`${this.prefix}-base-frequency`).value = buildBaseFreq;

    // Copy first interval
    const buildCents1 = document.getElementById('build-interval-1-cents').value;
    const buildRatio1 = document.getElementById('build-interval-1-ratio').value;
    document.getElementById(`${this.prefix}-interval-1-cents`).value = buildCents1;
    document.getElementById(`${this.prefix}-interval-1-ratio`).value = buildRatio1;

    // Copy additional intervals
    for (let i = 2; i <= BuildTab.intervalCount; i++) {
      this.addInterval();
      const buildCents = document.getElementById(`build-interval-${i}-cents`).value;
      const buildRatio = document.getElementById(`build-interval-${i}-ratio`).value;
      document.getElementById(`${this.prefix}-interval-${i}-cents`).value = buildCents;
      document.getElementById(`${this.prefix}-interval-${i}-ratio`).value = buildRatio;
    }

    this.refreshIfPlaying();
  },

  attachIntervalListeners(intervalIndex) {
    const centsInput = document.getElementById(`${this.prefix}-interval-${intervalIndex}-cents`);
    const ratioInput = document.getElementById(`${this.prefix}-interval-${intervalIndex}-ratio`);

    if (centsInput) {
      centsInput.addEventListener("input", () => {
        const cents = Utils.parseCents(centsInput.value);
        if (!isNaN(cents) && cents > 0) {
          const ratio = Utils.centsToRatio(cents);
          ratioInput.value = ratio.toFixed(6);
          this.refreshIfPlaying();
        }
      });
    }
    if (ratioInput) {
      ratioInput.addEventListener("input", () => {
        const cents = Utils.ratioToCents(ratioInput.value);
        if (!isNaN(cents) && cents > 0) {
          centsInput.value = cents.toFixed(3);
          this.refreshIfPlaying();
        }
      });
    }
  },

  calculateError() {
    const domain = document.getElementById(`${this.prefix}-error-domain`).value;
    const model = document.getElementById(`${this.prefix}-error-model`).value;

    // Extract chord data
    const ratios = [];
    const targetDeltas = [];
    const isFree = [];

    for (let i = 1; i <= this.intervalCount; i++) {
      const centsInput = document.getElementById(`${this.prefix}-interval-${i}-cents`);
      const targetDeltaInput = document.getElementById(`${this.prefix}-interval-${i}-target-delta`);
      const freeCheckbox = document.getElementById(`${this.prefix}-interval-${i}-free`);

      if (!centsInput || !targetDeltaInput) continue;

      const cents = Utils.parseCents(centsInput.value);
      const targetDelta = parseFloat(targetDeltaInput.value);
      const checkboxFree = freeCheckbox ? freeCheckbox.checked : false;

      if (isNaN(cents)) continue;

      const free = checkboxFree || isNaN(targetDelta);
      const ratio = Utils.centsToRatio(cents);
      ratios.push(ratio);
      targetDeltas.push(isNaN(targetDelta) ? 1 : targetDelta);
      isFree.push(free);
    }

    if (ratios.length === 0) {
      document.getElementById(`${this.prefix}-error-result`).textContent = "—";
      return;
    }

    // Check if any deltas are free
    const hasFreeDeltas = isFree.some(f => f);

    let result;
    let targetRatiosArray;
    let deltaSignature;

    if (hasFreeDeltas) {
      result = calculatePDRError(ratios, targetDeltas, isFree, domain, model);
      if (!result) {
        document.getElementById(`${this.prefix}-error-result`).textContent = "undefined";
        return;
      }

      // Build target ratios from PDR result with optimized free values
      const resolvedDeltas = targetDeltas.slice();
      if (result.interiorFreeSegments && result.freeValues) {
        const offset = result.firstIncludedInterval || 0;
        result.interiorFreeSegments.forEach((seg, idx) => {
          const segLength = seg.end - seg.start + 1;
          const valPerDelta = result.freeValues[idx] / segLength;
          for (let k = seg.start; k <= seg.end; k++) {
            resolvedDeltas[k + offset] = valPerDelta;
          }
        });
      }
      targetRatiosArray = [1];
      let cumDelta = 0;
      for (let i = 0; i < resolvedDeltas.length; i++) {
        cumDelta += resolvedDeltas[i];
        targetRatiosArray.push(1 + cumDelta / result.x);
      }
      targetRatiosArray.isFree = [false, ...isFree];

      deltaSignature = "+" + resolvedDeltas.map((d, i) => isFree[i] ? d.toFixed(4) : d).join("+");
    } else {
      result = calculateFDRError(ratios, targetDeltas, domain, model);

      // Build target ratios from FDR result
      targetRatiosArray = [1];
      let cumDelta = 0;
      for (let i = 0; i < targetDeltas.length; i++) {
        cumDelta += targetDeltas[i];
        targetRatiosArray.push(1 + cumDelta / result.x);
      }
      targetRatiosArray.isFree = Array(targetRatiosArray.length).fill(false);

      deltaSignature = "+" + targetDeltas.join("+");
    }

    // Store target ratios for visualization
    Visualization.targetRatios[this.prefix] = targetRatiosArray;

    // Build display
    const ratioStr = targetRatiosArray.slice(1).map(r => r.toFixed(6)).join(" : ");
    const errorStr = result.error.toFixed(domain === "log" ? 3 : 6) + (domain === "log" ? " ¢" : "");

    document.getElementById(`${this.prefix}-error-result`).innerHTML =
      `<table><tr><th>error</th><td>${errorStr}</td></tr>` +
      `<tr><th>x</th><td>${result.x.toFixed(4)}</td></tr>` +
      `<tr><th>target chord</th><td>1 : ${ratioStr}</td></tr>` +
      `<tr><th>target deltas</th><td>${deltaSignature}</td></tr></table>`;

    Visualization.update(this.prefix);
  },

  clearTarget() {
    Visualization.targetRatios[this.prefix] = null;
    document.getElementById(`${this.prefix}-error-result`).textContent = "";
    Visualization.update(this.prefix);
  },

  init() {
    // Attach listeners for first interval
    this.attachIntervalListeners(1);

    // Audio controls
    document.getElementById(`${this.prefix}-btn-play`).addEventListener("click", () => this.play());
    document.getElementById(`${this.prefix}-btn-play-target`).addEventListener("click", () => this.playTarget());
    document.getElementById(`${this.prefix}-btn-stop`).addEventListener("click", () => Audio.stop());
    document.getElementById(`${this.prefix}-waveform`).addEventListener("change", (e) => {
      Audio.setWaveform(e.target.value, this.prefix);
      if (AppState.isPlaying && AppState.activeTab === this.prefix) {
        this.play();
      }
    });

    // Interval management
    document.getElementById(`${this.prefix}-btn-add`).addEventListener("click", () => this.addInterval());
    document.getElementById(`${this.prefix}-btn-remove`).addEventListener("click", () => this.removeInterval());
    document.getElementById(`${this.prefix}-btn-copy-from-build`).addEventListener("click", () => this.copyFromBuild());

    // Error calculation
    document.getElementById(`${this.prefix}-btn-calculate`).addEventListener("click", () => this.calculateError());
    document.getElementById(`${this.prefix}-btn-clear-target`).addEventListener("click", () => this.clearTarget());

    // Base frequency
    document.getElementById(`${this.prefix}-base-frequency`).addEventListener("input", () => this.refreshIfPlaying());

    // Visualization controls
    document.getElementById(`${this.prefix}-btn-update-viz`).addEventListener("click", () => Visualization.update(this.prefix));
    document.getElementById(`${this.prefix}-viz-window`).addEventListener("input", () => {
      Visualization.vizWindowSource[this.prefix] = "ratio";
      Visualization.syncWindowFromRatio(this.prefix);
    });
    document.getElementById(`${this.prefix}-viz-window-cents`).addEventListener("input", () => {
      Visualization.vizWindowSource[this.prefix] = "cents";
      Visualization.syncWindowFromCents(this.prefix);
    });

    // Initialize visualization
    Visualization.update(this.prefix);
  }
};

// ============ Approximate Tab Module ============

const ApproximateTab = {
  deltaCount: 2,
  prefix: 'approximate',
  searching: false,
  lastResults: [],
  lastEquaveRatio: 2,
  lastEd: 12,

  addDelta() {
    this.deltaCount++;
    const row = document.getElementById(`${this.prefix}-delta-row`);
    const sep = document.createElement("span");
    sep.className = "delta-separator";
    sep.textContent = "+";
    const input = document.createElement("input");
    input.type = "text";
    input.className = "delta-input";
    input.id = `${this.prefix}-delta-${this.deltaCount}`;
    input.value = "1";
    row.appendChild(sep);
    row.appendChild(input);
  },

  removeDelta() {
    if (this.deltaCount > 1) {
      const row = document.getElementById(`${this.prefix}-delta-row`);
      row.removeChild(row.lastElementChild); // input
      row.removeChild(row.lastElementChild); // separator
      this.deltaCount--;
    }
  },

  getDeltaSignature() {
    const targetDeltas = [];
    const isFree = [];
    for (let i = 1; i <= this.deltaCount; i++) {
      const input = document.getElementById(`${this.prefix}-delta-${i}`);
      const val = input.value.trim();
      if (val === "?") {
        targetDeltas.push(1);
        isFree.push(true);
      } else {
        const num = parseFloat(val);
        if (isNaN(num) || num <= 0) {
          alert(`Delta ${i}: must be a positive number or "?".`);
          return null;
        }
        targetDeltas.push(num);
        isFree.push(false);
      }
    }
    return { targetDeltas, isFree };
  },

  async search() {
    if (this.searching) return;

    const ed = parseFloat(document.getElementById(`${this.prefix}-ed`).value);
    const equaveStr = document.getElementById(`${this.prefix}-equave`).value;
    const outerBound = parseFloat(document.getElementById(`${this.prefix}-outer-bound`).value);
    const domain = document.getElementById(`${this.prefix}-error-domain`).value;
    const model = document.getElementById(`${this.prefix}-error-model`).value;
    const threshold = parseFloat(document.getElementById(`${this.prefix}-threshold`).value);

    if (isNaN(ed) || ed <= 0) { alert("ed must be a positive number."); return; }
    const equaveRatio = Utils.parseRatio(equaveStr);
    if (isNaN(equaveRatio) || equaveRatio <= 1) { alert("Equave must be a ratio greater than 1."); return; }
    if (isNaN(outerBound) || outerBound <= 0) { alert("Outer interval bound must be positive."); return; }
    if (isNaN(threshold) || threshold <= 0) { alert("Error threshold must be positive."); return; }

    const sig = this.getDeltaSignature();
    if (!sig) return;
    const { targetDeltas, isFree } = sig;
    const m = targetDeltas.length;
    const hasFreeDeltas = isFree.some(f => f);

    const equaveCents = 1200 * Math.log2(equaveRatio);
    const stepCents = equaveCents / ed;
    const maxSteps = Math.floor(outerBound / stepCents);

    if (maxSteps < m) {
      document.getElementById(`${this.prefix}-results`).innerHTML =
        "No chords possible (outer bound too small for this many deltas).";
      return;
    }

    // Count total combinations C(maxSteps, m)
    let totalCombinations = 1;
    for (let i = 0; i < m; i++) {
      totalCombinations = totalCombinations * (maxSteps - i) / (i + 1);
    }
    totalCombinations = Math.round(totalCombinations);

    this.searching = true;
    const searchBtn = document.getElementById(`${this.prefix}-btn-search`);
    searchBtn.disabled = true;
    const progressEl = document.getElementById(`${this.prefix}-progress`);
    const resultsEl = document.getElementById(`${this.prefix}-results`);
    resultsEl.innerHTML = "";
    progressEl.textContent = `Searching... 0 / ${totalCombinations} chords tested`;

    const results = [];
    let tested = 0;
    const BATCH_SIZE = 2000;

    // Generate combinations iteratively using an index array
    const indices = [];
    for (let i = 0; i < m; i++) indices.push(i + 1); // [1, 2, ..., m]

    await new Promise((resolve) => {
      function processBatch() {
        let batchCount = 0;
        while (batchCount < BATCH_SIZE) {
          if (indices === null || indices[0] > maxSteps - m + 1) {
            // Done
            progressEl.textContent = `Done. ${tested} chords tested, ${results.length} found.`;
            resolve();
            return;
          }

          // Current combination is indices[0..m-1]
          const ratios = [];
          for (let j = 0; j < m; j++) {
            ratios.push(Math.pow(equaveRatio, indices[j] / ed));
          }

          let result;
          if (hasFreeDeltas) {
            result = calculatePDRError(ratios, targetDeltas, isFree, domain, model);
          } else {
            result = calculateFDRError(ratios, targetDeltas, domain, model);
          }

          if (result && result.error < threshold) {
            // Build target ratios with optimized free delta values
            const resolvedDeltas = targetDeltas.slice();
            if (hasFreeDeltas && result.interiorFreeSegments && result.freeValues) {
              const offset = result.firstIncludedInterval || 0;
              result.interiorFreeSegments.forEach((seg, idx) => {
                const segLength = seg.end - seg.start + 1;
                const valPerDelta = result.freeValues[idx] / segLength;
                for (let k = seg.start; k <= seg.end; k++) {
                  resolvedDeltas[k + offset] = valPerDelta;
                }
              });
            }
            const targetRatios = [1];
            let cumDelta = 0;
            for (let di = 0; di < resolvedDeltas.length; di++) {
              cumDelta += resolvedDeltas[di];
              targetRatios.push(1 + cumDelta / result.x);
            }

            results.push({
              steps: [0, ...indices.slice()],
              cents: [0, ...indices.map(k => k * stepCents)],
              error: result.error,
              targetRatios
            });
          }

          tested++;
          batchCount++;

          // Advance to next combination
          let i = m - 1;
          while (i >= 0 && indices[i] >= maxSteps - (m - 1 - i)) {
            i--;
          }
          if (i < 0) {
            indices[0] = maxSteps + 1; // signal done
          } else {
            indices[i]++;
            for (let j = i + 1; j < m; j++) {
              indices[j] = indices[j - 1] + 1;
            }
          }
        }

        progressEl.textContent = `Searching... ${tested} / ${totalCombinations} chords tested (${results.length} found so far)`;
        setTimeout(processBatch, 0);
      }

      processBatch();
    });

    results.sort((a, b) => a.error - b.error);
    this.lastResults = results;
    this.lastEquaveRatio = equaveRatio;
    this.lastEd = ed;
    this.displayResults(results, domain);

    this.searching = false;
    searchBtn.disabled = false;
  },

  getBaseFrequency() {
    const freq = parseFloat(document.getElementById(`${this.prefix}-base-frequency`).value);
    if (isNaN(freq) || freq <= 0) return AppState.DEFAULT_PITCH_STANDARD;
    return freq;
  },

  playChord(index) {
    const r = this.lastResults[index];
    if (!r) return;
    const baseFreq = this.getBaseFrequency();
    const frequencies = r.steps.map(k => baseFreq * Math.pow(this.lastEquaveRatio, k / this.lastEd));
    Audio.playFrequencies(frequencies);
  },

  playTarget(index) {
    const r = this.lastResults[index];
    if (!r || !r.targetRatios) return;
    const baseFreq = this.getBaseFrequency();
    const frequencies = r.targetRatios.map(ratio => baseFreq * ratio);
    Audio.playFrequencies(frequencies);
  },

  displayResults(results, domain) {
    const resultsEl = document.getElementById(`${this.prefix}-results`);
    if (results.length === 0) {
      resultsEl.innerHTML = "<p>No chords found below the error threshold.</p>";
      return;
    }

    const errorUnit = domain === "log" ? " ¢" : "";
    const errorDecimals = domain === "log" ? 3 : 6;

    let html = `<table><thead><tr><th>#</th><th>Steps</th><th>Cents</th><th>Target (cents)</th><th>Error</th><th></th></tr></thead><tbody>`;
    for (let i = 0; i < results.length; i++) {
      const r = results[i];
      const stepsStr = r.steps.join(" ");
      const centsStr = r.cents.map(c => c.toFixed(1)).join(" ");
      const targetCentsStr = r.targetRatios.map(ratio => (1200 * Math.log2(ratio)).toFixed(1)).join(" ");
      html += `<tr><td>${i + 1}</td><td>${stepsStr}</td><td>${centsStr}</td><td>${targetCentsStr}</td><td>${r.error.toFixed(errorDecimals)}${errorUnit}</td>` +
        `<td><button class="approx-play-btn" data-index="${i}">&#9654;</button>` +
        `<button class="approx-play-target-btn" data-index="${i}">&#9654; Target</button></td></tr>`;
    }
    html += `</tbody></table>`;
    resultsEl.innerHTML = html;
  },

  init() {
    document.getElementById(`${this.prefix}-btn-add-delta`).addEventListener("click", () => this.addDelta());
    document.getElementById(`${this.prefix}-btn-remove-delta`).addEventListener("click", () => this.removeDelta());
    document.getElementById(`${this.prefix}-btn-search`).addEventListener("click", () => this.search());
    document.getElementById(`${this.prefix}-btn-stop`).addEventListener("click", () => Audio.stop());
    document.getElementById(`${this.prefix}-waveform`).addEventListener("change", (e) => {
      Audio.setWaveform(e.target.value, this.prefix);
    });

    // Event delegation for play buttons in results
    document.getElementById(`${this.prefix}-results`).addEventListener("click", (e) => {
      const btn = e.target.closest("button");
      if (!btn) return;
      const index = parseInt(btn.dataset.index);
      if (isNaN(index)) return;
      if (btn.classList.contains("approx-play-btn")) {
        this.playChord(index);
      } else if (btn.classList.contains("approx-play-target-btn")) {
        this.playTarget(index);
      }
    });
  }
};

// ============ Mobile Drag Handle ============

function setupMobileDragHandle() {
  document.querySelectorAll('.mobile-drag-handle').forEach(dragHandle => {
    const vizColumn = dragHandle.closest('.visualization-column');
    if (!vizColumn) return;

    let isDragging = false;
    let startY = 0;
    let startHeight = 0;

    function handleTouchStart(e) {
      if (window.innerWidth > 600) return;
      isDragging = true;
      startY = e.touches[0].clientY;

      const currentMaxHeight = window.getComputedStyle(vizColumn).maxHeight;
      const match = currentMaxHeight.match(/(\d+(?:\.\d+)?)(vh|px)/);
      if (match) {
        if (match[2] === 'vh') {
          startHeight = parseFloat(match[1]);
        } else if (match[2] === 'px') {
          startHeight = (parseFloat(match[1]) / window.innerHeight) * 100;
        }
      } else {
        startHeight = 50;
      }
      e.preventDefault();
    }

    function handleTouchMove(e) {
      if (!isDragging) return;
      const currentY = e.touches[0].clientY;
      const deltaY = startY - currentY;
      const deltaVh = (deltaY / window.innerHeight) * 100;
      let newHeight = startHeight + deltaVh;
      newHeight = Math.max(20, Math.min(80, newHeight));
      vizColumn.style.maxHeight = `${newHeight}vh`;
      e.preventDefault();
    }

    function handleTouchEnd() {
      isDragging = false;
    }

    dragHandle.addEventListener('touchstart', handleTouchStart, { passive: false });
    dragHandle.addEventListener('touchmove', handleTouchMove, { passive: false });
    dragHandle.addEventListener('touchend', handleTouchEnd);
    dragHandle.addEventListener('touchcancel', handleTouchEnd);
  });
}

// ============ Initialization ============

document.addEventListener('DOMContentLoaded', () => {
  TabController.init();
  BuildTab.init();
  MeasureTab.init();
  ApproximateTab.init();
  setupMobileDragHandle();
});
