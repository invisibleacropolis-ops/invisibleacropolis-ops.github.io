/*
  Starship HUD runtime
  - Updates gauges, waveforms, and scrolling logs every animation frame.
  - Generates pseudo telemetry (noise + easing) for meters and sparklines.
  - Drives per-panel typewriter copy with configurable speeds.
  - Toggles outline states to simulate panel draw-in / dissolve cycles.
*/

const clamp = (value, min, max) => Math.min(Math.max(value, min), max);
const lerp = (start, end, amount) => start + (end - start) * amount;
const formatNumber = (value, decimals = 0) => value.toFixed(decimals);

const readoutConfigs = {
  system: [
    { min: 72, max: 100, decimals: 0, suffix: "%" },
    { min: 35, max: 100, decimals: 0, suffix: "%" },
    { min: 3.1, max: 8.4, decimals: 1, suffix: " GW" }
  ],
  telemetry: [
    { min: 14, max: 96, decimals: 0, suffix: " km/s" },
    { min: 210, max: 980, decimals: 0, suffix: " kg/s" },
    { min: 0.4, max: 2.9, decimals: 2, suffix: " m/s²" },
    { min: 120, max: 520, decimals: 0, suffix: " °C" }
  ],
  scan: [
    { min: 1, max: 18, decimals: 0, suffix: "" },
    { min: 0.2, max: 9.8, decimals: 1, suffix: "" },
    { min: 8, max: 64, decimals: 0, suffix: " ms" }
  ],
  preview: [
    { min: 120, max: 540, decimals: 0, suffix: "" },
    { min: 0.2, max: 1.3, decimals: 2, suffix: "" },
    { min: 0.4, max: 2.3, decimals: 2, suffix: "" }
  ]
};

const gaugeStreams = [];

const createStream = ({ min, max, noise = 0.8, easing = 0.04 }) => {
  const range = max - min;
  return {
    min,
    max,
    noise,
    easing,
    value: min + range * Math.random(),
    target: min + range * Math.random(),
    nextTargetAt: performance.now() + 800 + Math.random() * 1600
  };
};

const updateStream = (stream, now) => {
  if (now >= stream.nextTargetAt) {
    stream.target = stream.min + (stream.max - stream.min) * Math.random();
    stream.nextTargetAt = now + 900 + Math.random() * 1600;
  }
  const noisyTarget = stream.target + (Math.random() - 0.5) * stream.noise;
  stream.value = lerp(stream.value, noisyTarget, stream.easing);
  return clamp(stream.value, stream.min, stream.max);
};

const typewriters = [];

const resetTypewriter = (tw) => {
  tw.lineIndex = 0;
  tw.charIndex = 0;
  tw.state = "typing";
  tw.nextTick = performance.now() + tw.resetDelay;
  if (tw.isList) {
    tw.element.innerHTML = "";
  } else {
    tw.element.textContent = "";
  }
};

const renderTypewriter = (tw) => {
  const currentLine = tw.lines[tw.lineIndex] || "";
  const output = currentLine.slice(0, tw.charIndex);
  if (tw.isList) {
    const items = Array.from(tw.element.querySelectorAll("li"));
    if (items.length < tw.lineIndex + 1) {
      const item = document.createElement("li");
      tw.element.appendChild(item);
    }
    const currentItem = tw.element.querySelectorAll("li")[tw.lineIndex];
    currentItem.textContent = output;
  } else {
    tw.element.textContent = output;
  }
};

const updateTypewriter = (tw, now) => {
  if (now < tw.nextTick) {
    return;
  }
  if (tw.state === "typing") {
    const line = tw.lines[tw.lineIndex] || "";
    if (tw.charIndex <= line.length) {
      tw.charIndex += 1;
      renderTypewriter(tw);
      tw.nextTick = now + tw.speed;
    } else {
      tw.state = "holding";
      tw.nextTick = now + tw.pause;
    }
  } else if (tw.state === "holding") {
    tw.lineIndex += 1;
    tw.charIndex = 0;
    if (tw.lineIndex >= tw.lines.length) {
      resetTypewriter(tw);
    } else {
      tw.state = "typing";
      tw.nextTick = now + tw.speed;
    }
  }
};

const logWindows = [];

const logPhrases = [
  "Gyro alignment nominal.",
  "Quantum relays synchronized.",
  "Thermal buffers cycling.",
  "Long-range scan pulse emitted.",
  "Astrogation lattice stabilizing.",
  "External comms handshake confirmed.",
  "Docking clamps locked.",
  "Radiation screen holding.",
  "Navigation beacons acquired.",
  "Fuel injectors balanced."
];

const createLogEntry = () => {
  const stamp = new Date();
  const hh = String(stamp.getHours()).padStart(2, "0");
  const mm = String(stamp.getMinutes()).padStart(2, "0");
  const ss = String(stamp.getSeconds()).padStart(2, "0");
  const phrase = logPhrases[Math.floor(Math.random() * logPhrases.length)];
  return `[${hh}:${mm}:${ss}] ${phrase}`;
};

const initLogWindow = (element) => {
  const stream = document.createElement("div");
  stream.className = "log-stream";
  const existing = Array.from(element.querySelectorAll("p"));
  existing.forEach((node) => stream.appendChild(node));
  element.appendChild(stream);

  const lineHeight = existing[0]
    ? existing[0].getBoundingClientRect().height + 6
    : 22;

  logWindows.push({
    element,
    stream,
    offset: 0,
    lineHeight,
    nextLineAt: performance.now() + 1200
  });
};

const updateLogWindow = (log, now, delta) => {
  log.offset += delta * 0.025;
  if (now >= log.nextLineAt) {
    const line = document.createElement("p");
    line.textContent = createLogEntry();
    log.stream.appendChild(line);
    log.nextLineAt = now + 1800 + Math.random() * 1400;
  }
  if (log.offset >= log.lineHeight) {
    log.offset -= log.lineHeight;
    const first = log.stream.querySelector("p");
    if (first && log.stream.children.length > 6) {
      log.stream.removeChild(first);
    }
  }
  log.stream.style.transform = `translateY(${-log.offset}px)`;
};

const meters = [];
const telemetryCanvas = document.getElementById("telemetry-canvas");
const radarCanvas = document.getElementById("radar-canvas");

const initMeters = () => {
  document.querySelectorAll(".meter").forEach((meter, index) => {
    const readout = meter.querySelector(".readout");
    const sparkline = meter.querySelector(".sparkline");
    const config = readoutConfigs.telemetry[index];
    const stream = createStream({ ...config, noise: 1.4, easing: 0.06 });
    const history = new Array(32).fill(stream.value);
    gaugeStreams.push(stream);
    meters.push({ meter, readout, sparkline, stream, history, config });
  });
};

const drawSparkline = (canvas, history) => {
  if (!canvas) return;
  const ctx = canvas.getContext("2d");
  const { width, height } = canvas;
  ctx.clearRect(0, 0, width, height);
  ctx.strokeStyle = "rgba(76, 244, 255, 0.9)";
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  history.forEach((value, index) => {
    const x = (index / (history.length - 1)) * width;
    const y = height - (value * height);
    if (index === 0) {
      ctx.moveTo(x, y);
    } else {
      ctx.lineTo(x, y);
    }
  });
  ctx.stroke();

  ctx.fillStyle = "rgba(255, 79, 240, 0.6)";
  const lastValue = history[history.length - 1];
  ctx.beginPath();
  ctx.arc(width - 2, height - lastValue * height, 2, 0, Math.PI * 2);
  ctx.fill();
};

const initReadouts = () => {
  document.querySelectorAll("[data-readouts]").forEach((group) => {
    const groupKey = group.dataset.readouts;
    const config = readoutConfigs[groupKey] || [];
    const spans = group.querySelectorAll(".readout");
    spans.forEach((span, index) => {
      if (span.closest(".meter")) {
        return;
      }
      const settings = config[index] || { min: 0, max: 100, decimals: 0, suffix: "" };
      const stream = createStream({ ...settings, noise: 1.8, easing: 0.04 });
      gaugeStreams.push(stream);
      span.dataset.streamIndex = String(gaugeStreams.length - 1);
      span.dataset.streamDecimals = String(settings.decimals ?? 0);
      span.dataset.streamSuffix = settings.suffix ?? "";
      span.dataset.streamMin = String(settings.min);
      span.dataset.streamMax = String(settings.max);
    });
  });
};

const updateReadouts = (now) => {
  document.querySelectorAll(".readout").forEach((span) => {
    const index = Number(span.dataset.streamIndex);
    if (Number.isNaN(index)) return;
    const stream = gaugeStreams[index];
    const value = updateStream(stream, now);
    const decimals = Number(span.dataset.streamDecimals || 0);
    const suffix = span.dataset.streamSuffix || "";
    span.textContent = `${formatNumber(value, decimals)}${suffix}`;
  });
};

const drawTelemetryWaveform = (canvas, now) => {
  if (!canvas) return;
  const ctx = canvas.getContext("2d");
  const { width, height } = canvas;
  ctx.clearRect(0, 0, width, height);

  const points = 80;
  ctx.strokeStyle = "rgba(76, 244, 255, 0.9)";
  ctx.lineWidth = 2;
  ctx.beginPath();
  for (let i = 0; i <= points; i += 1) {
    const x = (i / points) * width;
    const phase = now * 0.002 + i * 0.3;
    const wave = Math.sin(phase) * 0.35 + Math.sin(phase * 0.4) * 0.2;
    const noise = (Math.random() - 0.5) * 0.12;
    const y = height * (0.5 + wave + noise);
    if (i === 0) {
      ctx.moveTo(x, y);
    } else {
      ctx.lineTo(x, y);
    }
  }
  ctx.stroke();

  ctx.strokeStyle = "rgba(255, 79, 240, 0.4)";
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(0, height * 0.5);
  ctx.lineTo(width, height * 0.5);
  ctx.stroke();
};

const drawRadar = (canvas, now) => {
  if (!canvas) return;
  const ctx = canvas.getContext("2d");
  const { width, height } = canvas;
  const centerX = width / 2;
  const centerY = height / 2;
  const radius = Math.min(width, height) * 0.42;

  ctx.clearRect(0, 0, width, height);
  ctx.strokeStyle = "rgba(76, 244, 255, 0.3)";
  ctx.lineWidth = 1;
  for (let ring = 1; ring <= 3; ring += 1) {
    ctx.beginPath();
    ctx.arc(centerX, centerY, (radius / 3) * ring, 0, Math.PI * 2);
    ctx.stroke();
  }

  const sweepAngle = (now * 0.0005) % (Math.PI * 2);
  ctx.strokeStyle = "rgba(42, 250, 223, 0.8)";
  ctx.beginPath();
  ctx.moveTo(centerX, centerY);
  ctx.lineTo(
    centerX + Math.cos(sweepAngle) * radius,
    centerY + Math.sin(sweepAngle) * radius
  );
  ctx.stroke();

  for (let i = 0; i < 12; i += 1) {
    const angle = (i / 12) * Math.PI * 2 + now * 0.0002;
    const distance = radius * (0.2 + (i % 5) * 0.14);
    const x = centerX + Math.cos(angle) * distance;
    const y = centerY + Math.sin(angle) * distance;
    ctx.fillStyle = `rgba(255, 79, 240, ${0.35 + (i % 3) * 0.2})`;
    ctx.beginPath();
    ctx.arc(x, y, 2.4, 0, Math.PI * 2);
    ctx.fill();
  }
};

const initTypewriters = () => {
  document.querySelectorAll("[data-typewriter]").forEach((element) => {
    const isList = ["UL", "OL"].includes(element.tagName);
    const speed = Number(element.dataset.typewriterSpeed || 42);
    const pause = Number(element.dataset.typewriterPause || 900);
    const resetDelay = Number(element.dataset.typewriterReset || 1400);

    const lines = isList
      ? Array.from(element.querySelectorAll("li")).map((item) => item.textContent.trim())
      : [element.textContent.trim()];

    const typewriter = {
      element,
      lines,
      isList,
      speed,
      pause,
      resetDelay,
      lineIndex: 0,
      charIndex: 0,
      state: "typing",
      nextTick: performance.now() + 300
    };

    if (isList) {
      element.innerHTML = "";
    }

    typewriters.push(typewriter);
  });
};

const initOutlineCycling = () => {
  const panels = Array.from(document.querySelectorAll("[data-panel]"));
  let outlineState = true;
  panels.forEach((panel) => panel.classList.add("is-outline-draw"));
  setInterval(() => {
    outlineState = !outlineState;
    panels.forEach((panel) => {
      panel.classList.toggle("is-outline-draw", outlineState);
      panel.classList.toggle("is-outline-dissolve", !outlineState);
    });
  }, 3200);
};

const init = () => {
  initReadouts();
  initMeters();
  initTypewriters();
  initOutlineCycling();
  document.querySelectorAll("[data-scroll-log]").forEach(initLogWindow);
};

let lastFrame = performance.now();
const animate = (now) => {
  const delta = now - lastFrame;
  lastFrame = now;

  updateReadouts(now);
  meters.forEach((meter) => {
    const value = updateStream(meter.stream, now);
    const normalized = (value - meter.config.min) / (meter.config.max - meter.config.min);
    meter.meter.style.setProperty("--meter-fill", `${Math.round(normalized * 100)}`);
    meter.readout.textContent = `${formatNumber(value, meter.config.decimals)}${meter.config.suffix}`;
    meter.history.shift();
    meter.history.push(clamp(normalized, 0, 1));
    drawSparkline(meter.sparkline, meter.history);
  });

  drawTelemetryWaveform(telemetryCanvas, now);
  drawRadar(radarCanvas, now);

  typewriters.forEach((tw) => updateTypewriter(tw, now));
  logWindows.forEach((log) => updateLogWindow(log, now, delta));

  requestAnimationFrame(animate);
};

init();
requestAnimationFrame(animate);
