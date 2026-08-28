/*
 * Tab C legacy chrome extraction.
 * The simulator still creates and owns its original nodes. This compatibility
 * layer only reparents those nodes into external layout hosts, retaining their
 * listeners, jQuery data, and editor-engine references.
 */
(function () {
  "use strict";

  var observer;
  var queued = false;
  var pointerBridgeBound = false;
  var existingComponentDrag = false;
  var activeGridMode = "dot";
  var GRID_SIZE = 20;
  var LEGACY_TO_LOGICAL_SCALE = 25 / GRID_SIZE;
  var viewportPan = { x: 0, y: 0 };
  var panSession = null;
  var cadInteractionBound = false;
  var gridTransformObserver = null;
  var observedGridWorld = null;
  var legacyMenuBound = false;
  var legacyMenuActionsBound = false;
  var legacyCommandBridgeBound = false;
  var menuInputSuppressUntil = 0;
  var rotationPrototypeBound = false;
  var rotationTestPlacement = null;
  var activeRotationTestId = null;
  var rotationTestSequence = 0;
  var rotationPlacementObserver = null;
  var panPresentationFrame = null;
  var dmmPlacementObserver = null;
  var dmmPlacementSnapshot = null;
  var dmmSequence = 0;
  var activeDmmId = null;
  var dmmModePopoverBound = false;
  var dmmReadingFrame = null;
  var inspectorState = null;
  var inspectorBridgeBound = false;
  var inspectorReplayingLegacyDoubleClick = false;
  var selectedInspectorTarget = null;
  var inspectorCaptureToken = 0;
  var lastRunPayload = null;
  var currentFlowFrame = null;
  var nativeDcSolveTimer = null;
  var runCommandBound = false;
  var continuousSolveTimer = null;
  var continuousSimulationBound = false;
  var continuousSimulationObserver = null;
  var continuousTopologyPoll = null;
  var continuousTopologySignature = "";
  var nativeSimButton = null;
  var nativeDcSolveButton = null;
  var detachedSimulationPanel = null;
  var smoothZoomBound = false;

  function moveToHost(selector, host) {
    var node = document.querySelector(selector);
    if (node && node.parentNode !== host) host.appendChild(node);
  }

  function paletteHeading(label, children) {
    return Array.prototype.find.call(children, function (node) {
      return node.classList && node.classList.contains("toolbox_spacer") && node.textContent.trim() === label;
    });
  }

  function legacyButtonProps(button) {
    if (!window.jQuery || !window.jQuery._data) return null;
    var events = window.jQuery._data(button, "events");
    var mouseDown = events && events.mousedown ? events.mousedown : [];
    var sourceEvent = Array.prototype.find.call(mouseDown, function (event) {
      return event.data && event.data.button_props;
    });
    return sourceEvent ? sourceEvent.data.button_props : null;
  }

  function isLegacySourceButton(button) {
    var props = legacyButtonProps(button);
    if (!props) return false;
    var type = props.L || "";
    var label = props.text || "";
    return /^Sim(?:Voltage|Current)Source/.test(type) ||
      /^(?:Voltage|Current) Controlled (?:Voltage|Current) Source$/.test(label);
  }

  /* The archived editor owns each palette button and its click handler. Reorder
     the existing direct children rather than cloning controls, so selection and
     placement continue through the unmodified legacy component registry. */
  function consolidateSourcePalette() {
    var palette = document.getElementById("buttons_div");
    if (!palette) return;

    var children = Array.prototype.slice.call(palette.children);
    var essentials = paletteHeading("Essentials", children);
    if (!essentials) return;
    var sourceNodes = children.filter(function (node) {
      return node.tagName === "BUTTON" && isLegacySourceButton(node);
    });
    if (!sourceNodes.length) return;

    var sources = paletteHeading("Sources", children);
    if (!sources) {
      sources = document.createElement("div");
      sources.className = "toolbox_spacer";
      sources.textContent = "Sources";
    }

    /* Remove only source-category headers. Passive Elements and its
       potentiometer remain in their original relative order. */
    ["DC Sources", "Voltage Signal Sources", "Current Signal Sources", "Controlled Sources"].forEach(function (label) {
      var heading = paletteHeading(label, children);
      if (heading) heading.remove();
    });
    if (sources.parentNode === palette) sources.remove();

    var insertionPoint = essentials;
    palette.insertBefore(sources, insertionPoint.nextSibling);
    insertionPoint = sources;
    sourceNodes.forEach(function (node) {
      palette.insertBefore(node, insertionPoint.nextSibling);
      insertionPoint = node;
    });
  }

  function isCircuitLabOneInstance() {
    return new URLSearchParams(window.location.search).get("instance") === "circuitlab-1";
  }

  function isStandardCircuitLabInstance() {
    return new URLSearchParams(window.location.search).get("instance") === "circuitlab-core";
  }

  function usesDockedPropertiesInspector() {
    return isStandardCircuitLabInstance();
  }

  /* CircuitLab 1 is a purpose-built digital instrumentation station. Hide whole
     native palette sections rather than copying buttons, so the retained Probes,
     Digital Primitives, and Digital Gates controls keep their original engine
     bindings. The other editor instances remain untouched. */
  function restrictCircuitLabOnePalette() {
    if (!isCircuitLabOneInstance()) return;
    var palette = document.getElementById("buttons_div");
    if (!palette) return;
    var showSection = false;
    Array.prototype.slice.call(palette.children).forEach(function (node) {
      if (node.classList && node.classList.contains("toolbox_spacer")) {
        var label = node.textContent.trim().replace(/\s+/g, " ");
        showSection = /(?:probe|digital primitives|digital gates)/i.test(label);
      }
      node.hidden = !showSection;
      node.setAttribute("aria-hidden", String(!showSection));
    });
    palette.setAttribute("data-tabc-palette-profile", "digital-instrumentation");
    var digitalLabDmm = document.getElementById("btn_60_button");
    if (digitalLabDmm) {
      digitalLabDmm.hidden = true;
      digitalLabDmm.setAttribute("aria-hidden", "true");
      digitalLabDmm.removeAttribute("data-tabc-dmm-button");
      digitalLabDmm.removeAttribute("title");
    }
    var digitalLabDmmHeading = document.getElementById("tabc-dmm-instruments-heading");
    if (digitalLabDmmHeading) digitalLabDmmHeading.remove();
  }

  /* The archived editor already supplies SimVoltmeter: a real two-terminal
     measurement primitive with its own terminal circles, drag mechanics and
     solver representation. The DMM intentionally reuses that primitive rather
     than drawing an unconnected decorative symbol. This keeps DC voltage mode
     electrically non-invasive and preserves the editor's native wire snapping. */
  function dmmModeSpec(mode) {
    return {
      DCV: { suffix: "V DC", stamp: "native-voltmeter / high-impedance", available: true },
      ACV: { suffix: "V RMS", stamp: "native-voltmeter / high-impedance", available: true },
      DCI: { suffix: "M-PLAN", stamp: "educational plan / native ammeter branch required", available: true, plan: true },
      ACI: { suffix: "M-PLAN", stamp: "educational plan / native ammeter branch required", available: true, plan: true },
      OHM: { suffix: "M-PLAN", stamp: "educational plan / 1 mA test-source branch required", available: true, plan: true },
      CONTINUITY: { suffix: "M-PLAN", stamp: "educational plan / test-current branch required", available: true, plan: true }
    }[mode] || { suffix: "V DC", stamp: "native-voltmeter / high-impedance", available: true };
  }

  function dmmMeasurementPlan(mode) {
    return {
      DCI: { title: "DC CURRENT · M-PLAN", body: "Break the circuit and insert a native Ammeter in series." },
      ACI: { title: "AC CURRENT · M-PLAN", body: "Break the circuit and insert a native Ammeter in series; read RMS from transient samples." },
      OHM: { title: "RESISTANCE · M-PLAN", body: "Apply an external 1 mA current source across the component, measure voltage, then use R = V / 1 mA." },
      CONTINUITY: { title: "CONTINUITY / DIODE · M-PLAN", body: "Apply a test current: near 0 V indicates a short; approximately 0.7 V indicates a forward-biased diode." }
    }[mode] || null;
  }

  function dmmNodes(id) {
    return Array.prototype.slice.call(document.querySelectorAll('[data-tabc-dmm-id="' + id + '"]'));
  }

  function dmmPrimaryText(id) {
    return dmmNodes(id).find(function (node) { return node.tagName && node.tagName.toLowerCase() === "text"; }) || null;
  }

  function dmmNativeValue(id) {
    var text = dmmPrimaryText(id);
    if (!text) return null;
    var raw = String(text.getAttribute("data-tabc-dmm-native-value") || text.textContent || "").replace(/^VM\d+\s*/i, "");
    var match = raw.match(/([-+]?\d+(?:\.\d+)?(?:e[-+]?\d+)?)/i);
    return match ? Number(match[1]) : null;
  }

  function dmmNetAttribute(node) {
    if (!node) return null;
    var keys = ["data-tabc-net", "data-net", "data-node-id", "data-node", "data-terminal-net", "net", "node-id"];
    for (var index = 0; index < keys.length; index += 1) {
      var value = node.getAttribute && node.getAttribute(keys[index]);
      if (value != null && String(value).trim()) return String(value).trim();
    }
    return null;
  }

  function dmmPayloadNet(payload, id, polarity) {
    if (!payload) return null;
    var tables = [payload.dmmTerminalNets, payload.dmmNets, payload.terminals, payload.components, payload.devices].filter(Boolean);
    var aliases = polarity === "positive" ? ["positive", "red", "p", "terminal_0", "terminal0"] : ["negative", "black", "n", "terminal_1", "terminal1"];
    for (var tableIndex = 0; tableIndex < tables.length; tableIndex += 1) {
      var entry = tables[tableIndex][id] || tables[tableIndex]["dmm-" + id.replace(/^dmm-/, "")];
      if (!entry || typeof entry !== "object") continue;
      for (var aliasIndex = 0; aliasIndex < aliases.length; aliasIndex += 1) {
        var candidate = entry[aliases[aliasIndex]];
        if (candidate && typeof candidate === "object") candidate = candidate.net || candidate.node || candidate.id;
        if (candidate != null && String(candidate).trim()) return String(candidate).trim();
      }
    }
    return null;
  }

  function syncDmmTerminalNets(id, payload) {
    var nodes = dmmNodes(id);
    if (!nodes.length) return { positive: null, negative: null, connected: false };
    var positiveNode = nodes.find(function (node) { return node.getAttribute("data-tabc-dmm-terminal") === "positive"; });
    var negativeNode = nodes.find(function (node) { return node.getAttribute("data-tabc-dmm-terminal") === "negative"; });
    var positive = dmmNetAttribute(positiveNode) || dmmPayloadNet(payload, id, "positive");
    var negative = dmmNetAttribute(negativeNode) || dmmPayloadNet(payload, id, "negative");
    nodes.forEach(function (node) {
      if (positive) node.setAttribute("data-tabc-dmm-positive-net", positive);
      if (negative) node.setAttribute("data-tabc-dmm-negative-net", negative);
      node.setAttribute("data-tabc-dmm-connected", String(Boolean(positive && negative)));
    });
    return { positive: positive, negative: negative, connected: Boolean(positive && negative) };
  }

  function syncAllDmmTerminalNets(payload) {
    var ids = {};
    document.querySelectorAll("[data-tabc-dmm-id]").forEach(function (node) { ids[node.getAttribute("data-tabc-dmm-id")] = true; });
    Object.keys(ids).forEach(function (id) { syncDmmTerminalNets(id, payload); });
  }

  function dmmRuntimeState() {
    /* A production DMM adapter may expose the blueprint's Od.sH() state here.
       The archived bundle does not export Od globally, so this guard only reads
       a valid state when a host integration explicitly exposes it. */
    try {
      if (window.Od && typeof window.Od.sH === "function") return window.Od.sH();
      if (window.__tabc_dmm_runtime && window.__tabc_dmm_runtime.Yn) return window.__tabc_dmm_runtime;
    } catch (error) {
      return null;
    }
    return lastRunPayload;
  }

  function captureNativeRuntimePayload() {
    var payload = dmmRuntimeState();
    if (payload && (payload.Yn || payload.Di)) lastRunPayload = payload;
    return lastRunPayload;
  }

  function setRunStatus(message, state) {
    var status = document.getElementById("tabc-run-status");
    if (!status) return;
    status.textContent = message;
    status.setAttribute("data-run-state", state || "idle");
  }

  function branchCurrentValue(branch, payload) {
    if (!branch || !payload || !payload.Di) return 0;
    var keys = [branch.getAttribute("data-tabc-branch-id"), branch.getAttribute("data-branch-id"), branch.getAttribute("data-terminal-id"), branch.getAttribute("data-wire-id"), branch.id, branch.parentElement && branch.parentElement.getAttribute("data-tabc-branch-id"), branch.parentElement && branch.parentElement.getAttribute("data-branch-id"), branch.parentElement && branch.parentElement.id].filter(Boolean);
    for (var index = 0; index < keys.length; index += 1) {
      var sample = payload.Di[keys[index]];
      var current = sample && typeof sample === "object" ? sample.iR : sample;
      if (Number.isFinite(Number(current))) return Number(current);
    }
    return 0;
  }

  function guidePathForWire(wire) {
    var tag = wire.tagName.toLowerCase();
    if (tag === "path") return wire.getAttribute("d") || "";
    if (tag === "line") return "M " + wire.getAttribute("x1") + " " + wire.getAttribute("y1") + " L " + wire.getAttribute("x2") + " " + wire.getAttribute("y2");
    if (tag === "polyline") {
      var points = String(wire.getAttribute("points") || "").trim().replace(/\s+/g, " ");
      return points ? "M " + points.replace(/ /g, " L ") : "";
    }
    return "";
  }

  function currentFlowDuration(current) {
    var normalized = Math.min(1, Math.abs(current) / 0.1);
    return (2.2 - normalized * 1.6).toFixed(2) + "s";
  }

  function renderCurrentFlowOverlay(payload) {
    if (!isStandardCircuitLabInstance()) return;
    var svg = svgRoot();
    var world = worldGroup(svg);
    if (!svg || !world) return;
    var existing = world.querySelector("#tabc-current-flow-layer");
    if (existing) existing.remove();
    if (!payload || !payload.Di) return;
    var activeWires = Array.prototype.slice.call(world.querySelectorAll("path, line, polyline")).map(function (wire) {
      return { current: branchCurrentValue(wire, payload), guide: guidePathForWire(wire) };
    }).filter(function (entry) { return entry.guide && Math.abs(entry.current) >= 0.000001; });
    if (!activeWires.length) return;
    var layer = createSvgNode(svg, "g", { id: "tabc-current-flow-layer", "pointer-events": "none", "aria-hidden": "true" });
    activeWires.forEach(function (entry, index) {
      var guideId = "tabc-current-flow-guide-" + index;
      var guide = createSvgNode(svg, "path", { id: guideId, d: entry.guide, fill: "none", stroke: "none" });
      var dot = createSvgNode(svg, "circle", { r: "3", fill: entry.current > 0 ? "#ef4444" : "#38bdf8", "fill-opacity": "0.94", stroke: "#ffffff", "stroke-width": "0.7" });
      var motion = createSvgNode(svg, "animateMotion", { dur: currentFlowDuration(entry.current), repeatCount: "indefinite", keyPoints: entry.current > 0 ? "0;1" : "1;0", keyTimes: "0;1", calcMode: "linear" });
      motion.appendChild(createSvgNode(svg, "mpath", { href: "#" + guideId }));
      dot.appendChild(motion);
      layer.appendChild(guide);
      layer.appendChild(dot);
    });
    world.appendChild(layer);
  }

  function synchronizeRunTelemetry() {
    if (currentFlowFrame) window.cancelAnimationFrame(currentFlowFrame);
    currentFlowFrame = window.requestAnimationFrame(function () {
      currentFlowFrame = null;
      var payload = captureNativeRuntimePayload();
      syncAllDmmTerminalNets(payload);
      scheduleDmmReadingRefresh();
      renderCurrentFlowOverlay(payload);
      setRunStatus(payload && (payload.Yn || payload.Di) ? "RESULTS SYNCED" : "RUN COMPLETE · AWAITING PAYLOAD", payload && (payload.Yn || payload.Di) ? "synced" : "complete");
    });
  }

  function scheduleNativeDcSolve() {
    if (nativeDcSolveTimer) return;
    nativeDcSolveTimer = window.setTimeout(function () {
      nativeDcSolveTimer = null;
      var solved = nativeDcSolveButton
        ? activateLegacyButtonElement(nativeDcSolveButton)
        : activateLegacyToolbarButton("dcsolve");
      if (!solved) {
        setRunStatus("RUN COMPLETE · DC SOLVER UNAVAILABLE", "complete");
        synchronizeRunTelemetry();
        return;
      }
      window.setTimeout(function () {
        detachLegacySimulationPanel();
        synchronizeRunTelemetry();
      }, 80);
    }, 24);
  }

  function runNativeEcircuitsSolve() {
    if (!isStandardCircuitLabInstance()) return false;
    setRunStatus("RUNNING NATIVE SOLVER", "running");
    var handled = prepareContinuousNativeSolver();
    scheduleNativeDcSolve();
    return handled;
  }

  function dmmRms(samples) {
    if (!Array.isArray(samples) || !samples.length) return null;
    var sumSquares = samples.reduce(function (sum, sample) {
      var value = Number(sample && typeof sample === "object" ? sample.value : sample);
      return Number.isFinite(value) ? sum + value * value : sum;
    }, 0);
    return Math.sqrt(sumSquares / samples.length);
  }

  function dmmWaveform(state, id) {
    if (!state) return null;
    var series = state.waveforms || state.samples || state.timeSeries;
    return series && (series[id] || series.default) || null;
  }

  function formatDmmReading(id) {
    var nodes = dmmNodes(id);
    var mode = nodes[0] && nodes[0].getAttribute("data-tabc-dmm-mode") || "DCV";
    var spec = dmmModeSpec(mode);
    if (spec.plan) return "M-PLAN";
    var state = dmmRuntimeState();
    var value = dmmNativeValue(id);

    /* For DCV/ACV the native SimVoltmeter remains the physical branch. A host
       that exposes Yn may supply a differential result in data-dmm-voltage;
       otherwise the engine's own meter text is used exactly as returned. */
    var rawExplicit = nodes[0] && nodes[0].getAttribute("data-tabc-dmm-value");
    var explicit = rawExplicit == null ? NaN : Number(rawExplicit);
    if (Number.isFinite(explicit)) value = explicit;
    if (state && state.Yn && nodes[0] && nodes[0].hasAttribute("data-tabc-dmm-positive-net")) {
      var positive = nodes[0].getAttribute("data-tabc-dmm-positive-net");
      var negative = nodes[0].getAttribute("data-tabc-dmm-negative-net");
      if (state.Yn[positive] && state.Yn[negative] && Number.isFinite(state.Yn[positive].iS) && Number.isFinite(state.Yn[negative].iS)) {
        value = state.Yn[positive].iS - state.Yn[negative].iS;
      }
    }

    if (mode === "ACV") {
      var rms = dmmRms(dmmWaveform(state, id));
      value = rms == null ? null : rms;
    }

    return mode + " · " + (Number.isFinite(value) ? value.toFixed(2) : "N/A") + " " + spec.suffix;
  }

  function dmmInspectorReading(id) {
    var nodes = dmmNodes(id);
    var mode = nodes[0] && nodes[0].getAttribute("data-tabc-dmm-mode") || "DCV";
    var spec = dmmModeSpec(mode);
    if (spec.plan) return { text: "M-PLAN", stamp: spec.stamp, plan: dmmMeasurementPlan(mode) };
    var state = dmmRuntimeState();
    var terminals = syncDmmTerminalNets(id, state);
    if (!terminals.connected) return { text: "Awaiting probes", stamp: "Connect red and black terminals to circuit nets", plan: null, connected: false };
    var value = dmmNativeValue(id);
    var rawExplicit = nodes[0] && nodes[0].getAttribute("data-tabc-dmm-value");
    var explicit = rawExplicit == null ? NaN : Number(rawExplicit);
    if (Number.isFinite(explicit)) value = explicit;
    if (state && state.Yn && nodes[0] && nodes[0].hasAttribute("data-tabc-dmm-positive-net")) {
      var positive = nodes[0].getAttribute("data-tabc-dmm-positive-net");
      var negative = nodes[0].getAttribute("data-tabc-dmm-negative-net");
      if (state.Yn[positive] && state.Yn[negative] && Number.isFinite(state.Yn[positive].iS) && Number.isFinite(state.Yn[negative].iS)) value = state.Yn[positive].iS - state.Yn[negative].iS;
    }
    if (mode === "ACV") {
      var rms = dmmRms(dmmWaveform(state, id));
      value = rms == null ? null : rms;
    }
    return { text: Number.isFinite(value) ? value.toFixed(3) + " V" : "Awaiting solver payload", stamp: spec.stamp, plan: null, connected: true };
  }

  function updateDmmMeasurementPlan(id) {
    var host = document.getElementById("tabc-canvas-workspace-box");
    var text = dmmPrimaryText(id);
    var nodes = dmmNodes(id);
    if (!host || !text || !nodes.length) return;
    var mode = nodes[0].getAttribute("data-tabc-dmm-mode") || "DCV";
    var plan = dmmMeasurementPlan(mode);
    var overlay = document.querySelector('[data-tabc-dmm-plan-id="' + id + '"]');
    if (!plan) {
      if (overlay) overlay.remove();
      return;
    }
    if (!overlay) {
      overlay = document.createElement("aside");
      overlay.className = "tabc-dmm-plan";
      overlay.setAttribute("data-tabc-dmm-plan-id", id);
      overlay.setAttribute("role", "note");
      host.appendChild(overlay);
    }
    overlay.innerHTML = "<strong>" + plan.title + "</strong><span>" + plan.body + "</span>";
    var hostRect = host.getBoundingClientRect();
    var textRect = text.getBoundingClientRect();
    overlay.style.left = Math.max(12, Math.min(textRect.right - hostRect.left + 12, hostRect.width - 242)) + "px";
    overlay.style.top = Math.max(12, Math.min(textRect.top - hostRect.top + 18, hostRect.height - 112)) + "px";
  }

  function updateDmmDockedTelemetry(id) {
    if (activeDmmId !== id) return;
    var inspector = document.getElementById("tabc-properties-inspector");
    if (!inspector) return;
    var reading = dmmInspectorReading(id);
    var card = inspector.querySelector(".tabc-dmm-telemetry-card");
    if (card) {
      card.setAttribute("data-dmm-connected", String(reading.connected !== false));
      var value = card.querySelector("strong");
      var stamp = card.querySelector("small");
      if (value) value.textContent = reading.text;
      if (stamp) stamp.textContent = reading.stamp;
    }
  }

  function refreshDmmReading(id, preserveInspector) {
    var text = dmmPrimaryText(id);
    if (!text) return;
    text.textContent = "DMM" + id.replace(/^dmm-/, "") + " " + formatDmmReading(id);
    text.setAttribute("fill", "#f8fafc");
    text.setAttribute("stroke", "none");
    text.setAttribute("font-size", "12px");
    text.setAttribute("font-weight", "bold");
    text.setAttribute("data-tabc-dmm-label", "true");
    updateDmmMeasurementPlan(id);
    if (activeDmmId === id) {
      if (preserveInspector) updateDmmDockedTelemetry(id);
      else renderDmmDockedInspector(id);
    }
  }

  function scheduleDmmReadingRefresh() {
    if (dmmReadingFrame) return;
    dmmReadingFrame = window.requestAnimationFrame(function () {
      dmmReadingFrame = null;
      document.querySelectorAll("[data-tabc-dmm-id]").forEach(function (node) {
        var id = node.getAttribute("data-tabc-dmm-id");
        if (id) refreshDmmReading(id, true);
      });
    });
  }

  function styleNativeDmm(id) {
    var nodes = dmmNodes(id);
    var terminalIndex = 0;
    nodes.forEach(function (node) {
      var tag = node.tagName && node.tagName.toLowerCase();
      if (tag === "path") {
        node.setAttribute("stroke", "#0f172a");
        node.setAttribute("stroke-width", "2");
        node.setAttribute("fill", "#1e293b");
      }
      if (tag === "circle") {
        var terminal = terminalIndex === 0 ? "positive" : "negative";
        node.setAttribute("opacity", "1");
        node.setAttribute("r", "4");
        node.setAttribute("fill", terminalIndex === 0 ? "#ef4444" : "#020617");
        node.setAttribute("stroke", terminalIndex++ === 0 ? "#b91c1c" : "#000000");
        node.setAttribute("stroke-width", "2");
        node.setAttribute("data-tabc-dmm-terminal", terminal);
      }
    });
    refreshDmmReading(id);
  }

  function hideDmmModePopover() {
    var popover = document.getElementById("tabc-dmm-mode-popover");
    if (popover) popover.hidden = true;
  }

  function setDmmMode(id, mode) {
    dmmNodes(id).forEach(function (node) {
      node.setAttribute("data-tabc-dmm-mode", mode);
      node.setAttribute("data-tabc-dmm-stamp", dmmModeSpec(mode).stamp);
    });
    refreshDmmReading(id, true);
  }

  function renderDmmDockedInspector(id) {
    if (!isStandardCircuitLabInstance() || !id) return;
    var inspector = document.getElementById("tabc-properties-inspector");
    var nodes = dmmNodes(id);
    if (!inspector || !nodes.length) return;
    activeDmmId = id;
    inspectorState = null;
    syncDmmTerminalNets(id, dmmRuntimeState());
    var mode = nodes[0].getAttribute("data-tabc-dmm-mode") || "DCV";
    var range = nodes[0].getAttribute("data-tabc-dmm-range") || "auto";
    var reading = dmmInspectorReading(id);
    var modeOptions = ["DCV", "ACV", "DCI", "ACI", "OHM", "CONTINUITY"].map(function (value) {
      var label = value === "OHM" ? "Ω" : value === "CONTINUITY" ? "Continuity" : value;
      return "<option value='" + value + "'" + (mode === value ? " selected" : "") + ">" + label + "</option>";
    }).join("");
    var rangeOptions = ["auto", "200 mV", "2 V", "20 V", "200 V", "1000 V"].map(function (value) {
      return "<option value='" + value + "'" + (range === value ? " selected" : "") + ">" + value + "</option>";
    }).join("");
    var planMarkup = reading.plan ? "<aside class='tabc-dmm-inspector-plan'><strong>" + reading.plan.title + "</strong><span>" + reading.plan.body + "</span></aside>" : "";
    inspector.innerHTML = "<div class='tabc-inspector-header'><span>DMM Control & Telemetry</span><small>LIVE</small></div><div class='tabc-inspector-type'>Digital Multimeter</div><label class='tabc-inspector-label'>Mode<select id='tabc-dmm-inspector-mode'>" + modeOptions + "</select></label><label class='tabc-inspector-label'>Range<select id='tabc-dmm-inspector-range'>" + rangeOptions + "</select></label><section class='tabc-dmm-telemetry-card' data-dmm-connected='" + String(reading.connected !== false) + "' aria-live='polite'><span>Probe-linked measurement</span><strong>" + reading.text + "</strong><small>" + reading.stamp + "</small></section>" + planMarkup;
    var modeControl = inspector.querySelector("#tabc-dmm-inspector-mode");
    var rangeControl = inspector.querySelector("#tabc-dmm-inspector-range");
    if (modeControl) modeControl.addEventListener("change", function () {
      setDmmMode(id, modeControl.value);
      hideDmmModePopover();
    });
    if (rangeControl) rangeControl.addEventListener("change", function () {
      dmmNodes(id).forEach(function (node) { node.setAttribute("data-tabc-dmm-range", rangeControl.value); });
      renderDmmDockedInspector(id);
    });
  }

  function showDmmModePopover(id, event) {
    var host = document.getElementById("tabc-canvas-workspace-box");
    if (!host) return;
    var popover = document.getElementById("tabc-dmm-mode-popover");
    if (!popover) {
      popover = document.createElement("div");
      popover.id = "tabc-dmm-mode-popover";
      popover.setAttribute("role", "dialog");
      popover.setAttribute("aria-label", "Digital multimeter mode selector");
      popover.innerHTML = "<strong>DMM mode</strong><div class='tabc-dmm-mode-grid'><button data-dmm-mode='DCV' type='button'>DCV</button><button data-dmm-mode='ACV' type='button'>ACV RMS</button><button data-dmm-mode='DCI' type='button'>DCI</button><button data-dmm-mode='ACI' type='button'>ACI RMS</button><button data-dmm-mode='OHM' type='button'>Ω</button><button data-dmm-mode='CONTINUITY' type='button'>CONT</button></div><small data-dmm-stamp></small>";
      host.appendChild(popover);
      popover.addEventListener("click", function (modeEvent) {
        var button = modeEvent.target.closest && modeEvent.target.closest("button[data-dmm-mode]");
        if (!button || button.disabled || !activeDmmId) return;
        var mode = button.getAttribute("data-dmm-mode");
        setDmmMode(activeDmmId, mode);
        showDmmModePopover(activeDmmId, modeEvent);
      });
    }
    activeDmmId = id;
    var activeNodes = dmmNodes(id);
    var mode = activeNodes[0] && activeNodes[0].getAttribute("data-tabc-dmm-mode") || "DCV";
    popover.querySelectorAll("button[data-dmm-mode]").forEach(function (button) {
      var buttonSpec = dmmModeSpec(button.getAttribute("data-dmm-mode"));
      button.disabled = !buttonSpec.available;
      button.title = buttonSpec.available ? buttonSpec.stamp : buttonSpec.stamp + "; unavailable until a native branch adapter is added";
      button.setAttribute("aria-pressed", String(button.getAttribute("data-dmm-mode") === mode));
    });
    var stamp = popover.querySelector("[data-dmm-stamp]");
    if (stamp) stamp.textContent = dmmModeSpec(mode).stamp;
    var rect = host.getBoundingClientRect();
    var x = Math.max(8, Math.min((event.clientX || rect.left + 16) - rect.left + 12, rect.width - 174));
    var y = Math.max(8, Math.min((event.clientY || rect.top + 16) - rect.top + 12, rect.height - 170));
    popover.style.left = x + "px";
    popover.style.top = y + "px";
    popover.hidden = false;
  }

  function markDmmPlacement(before) {
    var svg = svgRoot();
    var world = worldGroup(svg);
    if (!world) return false;
    var placed = Array.prototype.slice.call(world.querySelectorAll("text")).filter(function (node) {
      return !before.has(node) && /^VM\d+/i.test((node.textContent || "").trim());
    });
    if (!placed.length) return false;
    var nativeText = placed[placed.length - 1];
    var id = "dmm-" + (++dmmSequence);
    var transform = nativeText.getAttribute("transform");
    Array.prototype.slice.call(world.querySelectorAll("[transform]")).filter(function (node) {
      return node.getAttribute("transform") === transform;
    }).forEach(function (node) {
      node.setAttribute("data-tabc-dmm-id", id);
      node.setAttribute("data-tabc-dmm-mode", "DCV");
      node.setAttribute("data-tabc-dmm-range", "auto");
      node.setAttribute("data-tabc-dmm-stamp", dmmModeSpec("DCV").stamp);
    });
    nativeText.setAttribute("data-tabc-dmm-native-value", nativeText.textContent || "");
    styleNativeDmm(id);
    activeDmmId = id;
    return true;
  }

  function scanAndMarkNativeDmm() {
    if (!isStandardCircuitLabInstance()) return false;
    var svg = svgRoot();
    var world = worldGroup(svg);
    if (!world) return false;
    var nativeText = Array.prototype.slice.call(world.querySelectorAll("text")).find(function (node) {
      return /^VM\d+/i.test((node.textContent || "").trim()) && !node.hasAttribute("data-tabc-dmm-id");
    });
    if (!nativeText) return false;
    var id = "dmm-" + (++dmmSequence);
    var transform = nativeText.getAttribute("transform");
    Array.prototype.slice.call(world.querySelectorAll("[transform]")).filter(function (node) {
      return node.getAttribute("transform") === transform;
    }).forEach(function (node) {
      node.setAttribute("data-tabc-dmm-id", id);
      node.setAttribute("data-tabc-dmm-mode", "DCV");
      node.setAttribute("data-tabc-dmm-range", "auto");
      node.setAttribute("data-tabc-dmm-stamp", dmmModeSpec("DCV").stamp);
    });
    nativeText.setAttribute("data-tabc-dmm-native-value", nativeText.textContent || "");
    styleNativeDmm(id);
    activeDmmId = id;
    return true;
  }

  function bindDmmInteractions() {
    if (!isStandardCircuitLabInstance() || dmmModePopoverBound) return;
    dmmModePopoverBound = true;
    document.addEventListener("click", function (event) {
      var node = event.target.closest && event.target.closest("[data-tabc-dmm-id]");
      if (node) {
        var id = node.getAttribute("data-tabc-dmm-id");
        renderDmmDockedInspector(id);
        hideDmmModePopover();
        return;
      }
      if (!event.target.closest || !event.target.closest("#tabc-dmm-mode-popover")) hideDmmModePopover();
    }, true);
    ["mouseup", "pointerup", "touchend"].forEach(function (type) {
      document.addEventListener(type, scheduleDmmReadingRefresh, true);
    });
  }

  function ensureDmmInstrument() {
    if (!isStandardCircuitLabInstance()) return;
    var palette = document.getElementById("buttons_div");
    var svg = svgRoot();
    var world = worldGroup(svg);
    if (!palette || !world) return;
    var dmmButton = document.getElementById("btn_60_button");
    if (!dmmButton) return;
    var heading = document.getElementById("tabc-dmm-instruments-heading");
    if (!heading) {
      heading = document.createElement("div");
      heading.id = "tabc-dmm-instruments-heading";
      heading.className = "toolbox_spacer";
      heading.textContent = "Instruments";
      palette.insertBefore(heading, palette.firstChild);
    }
    if (dmmButton.previousSibling !== heading) palette.insertBefore(dmmButton, heading.nextSibling);
    heading.hidden = false;
    heading.setAttribute("aria-hidden", "false");
    dmmButton.hidden = false;
    dmmButton.setAttribute("aria-hidden", "false");
    dmmButton.setAttribute("data-tabc-dmm-button", "true");
    dmmButton.setAttribute("title", "Digital Multimeter — ideal voltage input");
    var label = dmmButton.querySelector(".ui-button-text");
    if (label) label.textContent = "DMM";
    if (dmmButton.getAttribute("data-tabc-dmm-bound") !== "true") {
      dmmButton.setAttribute("data-tabc-dmm-bound", "true");
      ["mousedown", "pointerdown", "touchstart"].forEach(function (type) {
        dmmButton.addEventListener(type, function (event) {
          if (typeof event.button === "number" && event.button !== 0) return;
          dmmPlacementSnapshot = new Set(Array.prototype.slice.call(world.querySelectorAll("text")));
          if (dmmPlacementObserver) dmmPlacementObserver.disconnect();
          dmmPlacementObserver = new MutationObserver(function () {
            if (dmmPlacementSnapshot && (markDmmPlacement(dmmPlacementSnapshot) || scanAndMarkNativeDmm())) {
              dmmPlacementSnapshot = null;
              dmmPlacementObserver.disconnect();
              dmmPlacementObserver = null;
            }
          });
          dmmPlacementObserver.observe(world, { childList: true, subtree: true });
        }, true);
      });
    }
    scanAndMarkNativeDmm();
    bindDmmInteractions();
  }

  function legacyPropertiesDialog() {
    return document.getElementById("paramBoxContainer");
  }

  function hideLegacyPropertiesDialog() {
    var dialog = legacyPropertiesDialog();
    if (!dialog) return;
    dialog.style.setProperty("display", "block", "important");
    dialog.style.setProperty("position", "fixed", "important");
    dialog.style.setProperty("left", "-10000px", "important");
    dialog.style.setProperty("top", "-10000px", "important");
    dialog.style.setProperty("opacity", "0", "important");
    dialog.style.setProperty("pointer-events", "none", "important");
    dialog.setAttribute("aria-hidden", "true");
  }

  function inspectorUnitFor(target, dialog) {
    var label = target && target.textContent ? target.textContent.trim() : "";
    var dialogText = dialog && dialog.textContent ? dialog.textContent : "";
    if (/\bV\b|voltage/i.test(label + " " + dialogText)) return "V";
    if (/\bA\b|current/i.test(label + " " + dialogText)) return "A";
    if (/resistor|\bR\d+/i.test(label + " " + dialogText)) return "Ω";
    if (/capacitor|\bC\d+/i.test(label + " " + dialogText)) return "F";
    if (/inductor|\bL\d+/i.test(label + " " + dialogText)) return "H";
    return "";
  }

  function inspectorTypeFor(target) {
    var label = target && target.textContent ? target.textContent.trim() : "";
    if (/^V\d+/i.test(label)) return "Voltage Source";
    if (/^I\d+/i.test(label)) return "Current Source";
    if (/^R\d+/i.test(label)) return "Resistor";
    if (/^C\d+/i.test(label)) return "Capacitor";
    if (/^L\d+/i.test(label)) return "Inductor";
    if (/^VM\d+/i.test(label) || /DMM/i.test(label)) return "Digital Multimeter";
    return "Circuit Component";
  }

  function inspectorEditableFields(dialog) {
    return Array.prototype.slice.call(dialog ? dialog.querySelectorAll("input[type='text'], input:not([type]), textarea") : [])
      .filter(function (input) { return !input.disabled && input.offsetParent !== null; });
  }

  function inspectorTargetForEvent(target) {
    if (isExistingComponentTarget(target)) return target;
    var svg = svgRoot();
    if (!svg || !target || !svg.contains(target) || (target.closest && target.closest("#tabc-svg-grid-layer"))) return null;
    if (String(target.tagName || "").toLowerCase() === "text" && String(target.textContent || "").trim()) return target;
    return null;
  }

  function renderDockedInspector() {
    var inspector = document.getElementById("tabc-properties-inspector");
    if (!inspector) return;
    if (isStandardCircuitLabInstance() && activeDmmId && dmmNodes(activeDmmId).length) {
      renderDmmDockedInspector(activeDmmId);
      return;
    }
    if (!inspectorState) {
      inspector.innerHTML = "<div class='tabc-inspector-header'><span>Properties Inspector</span><small>LIVE BRIDGE</small></div><p class='tabc-inspector-empty'>Select or double-click a component to edit its properties.</p>";
      return;
    }
    var fieldValues = inspectorState.fields.map(function (input) { return input.value; });
    inspector.innerHTML = "<div class='tabc-inspector-header'><span>Properties Inspector</span><small>LIVE BRIDGE</small></div><div class='tabc-inspector-type'>" + inspectorState.type + "</div><label class='tabc-inspector-label'>Name<input id='tabc-inspector-name' type='text' value='" + String(fieldValues[0] || "").replace(/&/g, "&amp;").replace(/\"/g, "&quot;") + "'></label><label class='tabc-inspector-label'>Value<span class='tabc-inspector-value-row'><input id='tabc-inspector-value' type='text' value='" + String(fieldValues[1] || "").replace(/&/g, "&amp;").replace(/\"/g, "&quot;") + "'><b>" + (inspectorState.unit || "—") + "</b></span></label><p class='tabc-inspector-status' aria-live='polite'>Updates the native component model.</p>";
    [["#tabc-inspector-name", 0], ["#tabc-inspector-value", 1]].forEach(function (entry) {
      var control = inspector.querySelector(entry[0]);
      if (!control || !inspectorState.fields[entry[1]]) return;
      control.addEventListener("input", function () {
        var nativeField = inspectorState.fields[entry[1]];
        nativeField.value = control.value;
        ["input", "change", "keyup", "blur"].forEach(function (type) {
          nativeField.dispatchEvent(new Event(type, { bubbles: true }));
        });
        var status = inspector.querySelector(".tabc-inspector-status");
        if (status) status.textContent = "Native value updated · ready for next simulation.";
      });
    });
  }

  function captureDockedInspector(target) {
    var dialog = legacyPropertiesDialog();
    var fields = inspectorEditableFields(dialog);
    if (!dialog || fields.length < 1) return false;
    inspectorState = {
      target: target,
      dialog: dialog,
      fields: fields,
      type: inspectorTypeFor(target),
      unit: inspectorUnitFor(target, dialog)
    };
    hideLegacyPropertiesDialog();
    renderDockedInspector();
    return true;
  }

  function captureDockedInspectorWhenReady(target, token, attempt) {
    if (token !== inspectorCaptureToken) return;
    if (captureDockedInspector(target)) {
      inspectorReplayingLegacyDoubleClick = false;
      return;
    }
    if (attempt >= 12) {
      inspectorReplayingLegacyDoubleClick = false;
      return;
    }
    window.setTimeout(function () {
      captureDockedInspectorWhenReady(target, token, attempt + 1);
    }, 40);
  }

  function openNativeProperties(target, event) {
    var nativeTarget = target && target.closest ? target.closest("g.tabc-rotation-component") : null;
    nativeTarget = nativeTarget && nativeTarget.querySelector("[data-manus_clickable]") || target;
    if (window.jQuery) {
      var select = document.getElementById("arrow");
      if (select) window.jQuery(select).trigger("click");
      var nativeDoubleClick = window.jQuery.Event("dblclick");
      nativeDoubleClick.which = 1;
      nativeDoubleClick.button = 0;
      nativeDoubleClick.clientX = event.clientX;
      nativeDoubleClick.clientY = event.clientY;
      nativeDoubleClick.pageX = event.pageX;
      nativeDoubleClick.pageY = event.pageY;
      /* The archived editor opens its property model through its original
         select/click/double-click sequence. Preserve that sequence, then clear
         only the transient placement label after the native dialog is captured. */
      window.jQuery(nativeTarget).trigger("mousedown").trigger("mouseup").trigger("click").trigger(nativeDoubleClick);
      window.setTimeout(function () {
        var edit = document.querySelector(".menu_edit_params");
        if (edit) window.jQuery(edit).trigger("click");
        clearLegacyPlacementLabel();
      }, 0);
      return;
    }
    target.dispatchEvent(new MouseEvent("dblclick", {
      bubbles: true, cancelable: true, button: 0, detail: 2,
      clientX: event.clientX, clientY: event.clientY
    }));
  }

  function requestDockedInspector(target, event) {
    var dmmTarget = target && target.closest && target.closest("[data-tabc-dmm-id]");
    if (dmmTarget) {
      event.preventDefault();
      event.stopImmediatePropagation();
      renderDmmDockedInspector(dmmTarget.getAttribute("data-tabc-dmm-id"));
      return;
    }
    target = inspectorTargetForEvent(target);
    if (!isStandardCircuitLabInstance() || !target || inspectorReplayingLegacyDoubleClick) return;
    inspectorReplayingLegacyDoubleClick = true;
    var token = ++inspectorCaptureToken;
    window.setTimeout(function () {
      openNativeProperties(target, event);
      captureDockedInspectorWhenReady(target, token, 0);
    }, 0);
  }

  function inspectorFallbackEvent(target) {
    var rect = target && target.getBoundingClientRect && target.getBoundingClientRect();
    return {
      target: target,
      clientX: rect ? rect.left + rect.width / 2 : 0,
      clientY: rect ? rect.top + rect.height / 2 : 0,
      pageX: rect ? rect.left + rect.width / 2 : 0,
      pageY: rect ? rect.top + rect.height / 2 : 0,
      preventDefault: function () {},
      stopImmediatePropagation: function () {}
    };
  }

  function forceDockedInspectorFromDom(target) {
    target = inspectorTargetForEvent(target);
    if (!target || inspectorReplayingLegacyDoubleClick) return false;
    if (inspectorState && inspectorState.target === target) {
      renderDockedInspector();
      return true;
    }
    selectedInspectorTarget = target;
    requestDockedInspector(target, inspectorFallbackEvent(target));
    return true;
  }

  function selectedLegacyDomTarget() {
    var svg = svgRoot();
    if (!svg) return null;
    var selected = svg.querySelector("[aria-selected='true'], [data-selected='true'], .selected, .active, [class*='selected']");
    return inspectorTargetForEvent(selected) || inspectorTargetForEvent(selected && selected.querySelector("[raphaelid], text"));
  }

  function bindRedundantInspectorFallbacks() {
    if (!isStandardCircuitLabInstance() || document.documentElement.getAttribute("data-tabc-inspector-fallback-bound") === "true") return;
    document.documentElement.setAttribute("data-tabc-inspector-fallback-bound", "true");
    ["pointerup", "mouseup", "click"].forEach(function (type) {
      document.addEventListener(type, function (event) {
        var target = inspectorTargetForEvent(event.target);
        if (target) forceDockedInspectorFromDom(target);
      }, true);
    });
    var svg = svgRoot();
    if (svg) {
      new MutationObserver(function () {
        var target = selectedLegacyDomTarget();
        if (target) forceDockedInspectorFromDom(target);
      }).observe(svg, { subtree: true, attributes: true, attributeFilter: ["class", "aria-selected", "data-selected"] });
    }
    /* Plan C: a narrow fallback poll recovers selection state only when the
       archived runtime mutates no observable DOM attribute. */
    window.setInterval(function () {
      if (inspectorReplayingLegacyDoubleClick) return;
      var target = selectedLegacyDomTarget() || selectedInspectorTarget;
      if (target && (!inspectorState || inspectorState.target !== target)) forceDockedInspectorFromDom(target);
    }, 150);
  }

  function bindDockedInspector() {
    if (!isStandardCircuitLabInstance() || inspectorBridgeBound) return;
    inspectorBridgeBound = true;
    ["pointerdown", "mousedown"].forEach(function (type) {
      document.addEventListener(type, function (event) {
        var target = inspectorTargetForEvent(event.target);
        if (target) selectedInspectorTarget = target;
      }, true);
    });
    document.addEventListener("dblclick", function (event) { requestDockedInspector(event.target, event); }, true);
    document.addEventListener("click", function (event) {
      var dmmTarget = event.target.closest && event.target.closest("[data-tabc-dmm-id]");
      if (dmmTarget) {
        renderDmmDockedInspector(dmmTarget.getAttribute("data-tabc-dmm-id"));
        return;
      }
      var directTarget = inspectorTargetForEvent(event.target);
      var svg = svgRoot();
      var target = directTarget || (svg && svg.contains(event.target) ? selectedInspectorTarget : null);
      if (!target || target.closest("#tabc-properties-inspector") || inspectorReplayingLegacyDoubleClick) return;
      if (inspectorState && inspectorState.target === target) {
        renderDockedInspector();
        return;
      }
      requestDockedInspector(target, event);
    }, true);
    var popupObserver = new MutationObserver(function () {
      var dialog = legacyPropertiesDialog();
      if (!dialog) return;
      var rect = dialog.getBoundingClientRect();
      if (rect.left > -9000 && window.getComputedStyle(dialog).display !== "none") hideLegacyPropertiesDialog();
    });
    popupObserver.observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ["style", "class"] });
  }

  function clearLegacyPlacementLabel() {
    ["#floatingtooltip", ".floatingtooltip", "#hintbox"].forEach(function (selector) {
      document.querySelectorAll(selector).forEach(function (node) {
        if (node.getAttribute("data-tabc-stale-label") === "true" && node.hidden && !node.textContent && node.style.display === "none") return;
        node.textContent = "";
        node.hidden = true;
        node.setAttribute("data-tabc-stale-label", "true");
        node.style.setProperty("display", "none", "important");
        node.style.setProperty("pointer-events", "none", "important");
      });
    });
  }

  function bindLegacyPlacementLabelCleanup() {
    if (document.documentElement.getAttribute("data-tabc-label-cleanup-bound") === "true") return;
    document.documentElement.setAttribute("data-tabc-label-cleanup-bound", "true");
    document.addEventListener("mouseup", function (event) {
      var canvas = document.getElementById("editor_container");
      if (canvas && canvas.contains(event.target) && event.button === 0) window.setTimeout(clearLegacyPlacementLabel, 0);
    }, true);
    document.addEventListener("click", function (event) {
      var canvas = document.getElementById("editor_container");
      if (canvas && canvas.contains(event.target)) window.setTimeout(clearLegacyPlacementLabel, 0);
    }, true);
    document.addEventListener("keydown", function (event) {
      if (event.key === "Escape") clearLegacyPlacementLabel();
    }, true);
    new MutationObserver(function () {
      /* The archived editor may append its placement hint after mouseup; clear
         it again at the DOM boundary so no delayed label can survive. */
      clearLegacyPlacementLabel();
    }).observe(document.body, { childList: true, subtree: true, characterData: true, attributes: true, attributeFilter: ["style", "class"] });
    clearLegacyPlacementLabel();
  }

  function rotationGroup(componentId) {
    return document.querySelector('[data-tabc-rotation-component-id="' + componentId + '"]');
  }

  function rotateSelectedComponent(delta) {
    var group = activeRotationTestId && rotationGroup(activeRotationTestId);
    if (!group) return false;
    var currentAngle = Number(group.getAttribute("data-tabc-rotation-angle") || 0);
    var angle = (currentAngle + delta) % 360;
    var centerX = Number(group.getAttribute("data-tabc-rotation-center-x"));
    var centerY = Number(group.getAttribute("data-tabc-rotation-center-y"));
    group.setAttribute("transform", "rotate(" + angle + " " + centerX + " " + centerY + ")");
    group.setAttribute("data-tabc-rotation-angle", String(angle));
    return true;
  }

  function markRotationComponent(before, componentId) {
    var svg = svgRoot();
    var layer = worldGroup(svg);
    if (!layer) return false;
    var placed = Array.prototype.slice.call(layer.children).filter(function (node) { return !before.has(node); });
    if (!placed.length) return false;

    /* The archived editor appends each component as a contiguous block of SVG
       nodes. Preserve the component's original geometry inside one group and
       rotate that group around its bounding-box center. This works for every
       palette component without changing the legacy circuit model or solver. */
    var group = document.createElementNS(svg.namespaceURI, "g");
    group.classList.add("tabc-rotation-component");
    group.setAttribute("data-tabc-rotation-component-id", componentId);
    group.setAttribute("data-tabc-rotation-angle", "0");
    layer.insertBefore(group, placed[0]);
    placed.forEach(function (node) { group.appendChild(node); });
    var box = group.getBBox();
    var centerX = box.x + box.width / 2;
    var centerY = box.y + box.height / 2;
    group.setAttribute("data-tabc-rotation-center-x", String(centerX));
    group.setAttribute("data-tabc-rotation-center-y", String(centerY));
    group.setAttribute("transform", "rotate(0 " + centerX + " " + centerY + ")");
    activeRotationTestId = componentId;
    return true;
  }

  function bindRotationPrototype() {
    if (rotationPrototypeBound) return;
    rotationPrototypeBound = true;
    function armRotationPlacement(event) {
      var button = event.target.closest && event.target.closest("#buttons_div button");
      var svg = svgRoot();
      var layer = worldGroup(svg);
      if (!button || !layer || (typeof event.button === "number" && event.button !== 0)) return;
      rotationTestPlacement = {
        before: new Set(Array.prototype.slice.call(layer.children)),
        testId: "rotation-component-" + (++rotationTestSequence)
      };
      if (rotationPlacementObserver) rotationPlacementObserver.disconnect();
      rotationPlacementObserver = new MutationObserver(function () {
        var placement = rotationTestPlacement;
        if (placement && markRotationComponent(placement.before, placement.testId)) {
          rotationTestPlacement = null;
          rotationPlacementObserver.disconnect();
          rotationPlacementObserver = null;
        }
      });
      rotationPlacementObserver.observe(layer, { childList: true });
    }
    ["mousedown", "pointerdown", "touchstart"].forEach(function (type) {
      document.addEventListener(type, armRotationPlacement, true);
    });

    /* The archived editor may commit a new component on mouseup, click,
       pointerup, or touchend depending on the browser input path. Recheck
       after each event and retain the pending snapshot until a real block of
       legacy SVG nodes is available to group. */
    function capturePlacedComponent(event) {
      var canvas = document.getElementById("editor_container");
      if (!canvas || !rotationTestPlacement || !canvas.contains(event.target)) return;
      window.setTimeout(function () {
        var placement = rotationTestPlacement;
        if (placement && markRotationComponent(placement.before, placement.testId)) {
          rotationTestPlacement = null;
          if (rotationPlacementObserver) rotationPlacementObserver.disconnect();
          rotationPlacementObserver = null;
        }
      }, 0);
    }
    ["mousedown", "mouseup", "click", "pointerup", "touchend"].forEach(function (type) {
      document.addEventListener(type, capturePlacedComponent, true);
    });

    function selectRotationComponent(event) {
      var path = event.composedPath ? event.composedPath() : [];
      var component = Array.prototype.find.call(path, function (node) {
        return node && node.classList && node.classList.contains("tabc-rotation-component");
      });
      if (!component) component = event.target.closest && event.target.closest(".tabc-rotation-component");
      if (component) activeRotationTestId = component.getAttribute("data-tabc-rotation-component-id");
    }
    ["mousedown", "pointerdown", "touchstart", "click"].forEach(function (type) {
      document.addEventListener(type, selectRotationComponent, true);
    });
  }

  function ensureRotationPrototypeControls(topHost) {
    var bar = document.getElementById("tabc-rotation-control-bar");
    if (!bar) {
      bar = document.createElement("div");
      bar.id = "tabc-rotation-control-bar";
      bar.setAttribute("role", "group");
      bar.setAttribute("aria-label", "Selected component rotation controls");
      bar.innerHTML = "<button id='tabc-rotate-45' type='button' data-rotate-angle='45'>Rotate 45°</button><button id='tabc-rotate-90' type='button' data-rotate-angle='90'>Rotate 90°</button>";
      bar.querySelectorAll("button[data-rotate-angle]").forEach(function (button) {
        var suppressClickUntil = 0;
        var activate = function (event) {
          if ((event.type === "pointerdown" || event.type === "mousedown") && event.button !== 0) return;
          if (event.type === "click" && Date.now() < suppressClickUntil) {
            event.preventDefault();
            event.stopImmediatePropagation();
            return;
          }
          if (event.type !== "click") suppressClickUntil = Date.now() + 500;
          event.preventDefault();
          event.stopImmediatePropagation();
          rotateSelectedComponent(Number(button.getAttribute("data-rotate-angle")));
        };
        button.addEventListener("click", activate, true);
        if (window.PointerEvent) button.addEventListener("pointerdown", activate, true);
        else button.addEventListener("mousedown", activate, true);
        button.addEventListener("touchstart", activate, { capture: true, passive: false });
      });
    }
    if (bar.parentNode !== topHost) topHost.appendChild(bar);
    var duplicate = document.getElementById("tabc-test-resistor-palette-button");
    if (duplicate) duplicate.remove();
    bindRotationPrototype();
  }

  function createSvgNode(svg, tag, attributes) {
    var node = document.createElementNS(svg.namespaceURI, tag);
    Object.keys(attributes).forEach(function (key) { node.setAttribute(key, attributes[key]); });
    return node;
  }

  function svgRoot() {
    return document.querySelector("#svg_container svg");
  }

  function worldGroup(svg) {
    return svg ? Array.prototype.find.call(svg.children, function (node) {
      return node.tagName && node.tagName.toLowerCase() === "g" && node.id !== "tabc-svg-grid-layer";
    }) : null;
  }

  function gridOverlay() {
    var canvas = document.getElementById("editor_container");
    if (!canvas) return null;
    var overlay = document.getElementById("tabc-svg-viewport-grid");
    if (!overlay) {
      overlay = document.createElementNS("http://www.w3.org/2000/svg", "svg");
      overlay.setAttribute("id", "tabc-svg-viewport-grid");
      overlay.setAttribute("aria-hidden", "true");
      overlay.setAttribute("preserveAspectRatio", "none");
      overlay.setAttribute("pointer-events", "none");
      canvas.insertBefore(overlay, canvas.firstChild);
    }
    return overlay;
  }

  function syncGridPatternTransform(overlay, world) {
    if (!overlay || !world) return;
    var ctm = world.getScreenCTM && world.getScreenCTM();
    var overlayRect = overlay.getBoundingClientRect();
    var patternTransform = ctm
      ? "matrix(" + [ctm.a, ctm.b, ctm.c, ctm.d, ctm.e - overlayRect.left, ctm.f - overlayRect.top].join(" ") + ") scale(" + LEGACY_TO_LOGICAL_SCALE + ")"
      : "translate(" + viewportPan.x + " " + viewportPan.y + ") scale(" + LEGACY_TO_LOGICAL_SCALE + ")";
    ["tabc-svg-grid-dot", "tabc-svg-grid-cartesian"].forEach(function (id) {
      var pattern = overlay.querySelector("#" + id);
      if (pattern) pattern.setAttribute("patternTransform", patternTransform);
    });
  }

  function ensureSvgGrid() {
    var svg = svgRoot();
    var world = worldGroup(svg);
    if (!svg || !world) return null;
    var overlay = gridOverlay();
    if (!overlay) return null;
    var legacyGrid = document.getElementById("grid_container");
    if (legacyGrid) legacyGrid.style.backgroundImage = "none";

    var oldLayer = svg.querySelector("#tabc-svg-grid-layer");
    if (oldLayer) oldLayer.remove();
    var oldDefs = svg.querySelector("#tabc-svg-grid-defs");
    if (oldDefs) oldDefs.remove();

    var defs = overlay.querySelector("#tabc-svg-grid-defs");
    if (!defs) {
      defs = createSvgNode(overlay, "defs", { id: "tabc-svg-grid-defs" });
      overlay.appendChild(defs);

      var dot = createSvgNode(overlay, "pattern", {
        id: "tabc-svg-grid-dot", width: GRID_SIZE, height: GRID_SIZE,
        patternUnits: "userSpaceOnUse"
      });
      dot.appendChild(createSvgNode(overlay, "circle", { cx: 0, cy: 0, r: 1, fill: "#cbd5e1" }));
      defs.appendChild(dot);

      var cartesian = createSvgNode(overlay, "pattern", {
        id: "tabc-svg-grid-cartesian", width: GRID_SIZE, height: GRID_SIZE,
        patternUnits: "userSpaceOnUse"
      });
      cartesian.appendChild(createSvgNode(overlay, "path", {
        d: "M " + GRID_SIZE + " 0 L 0 0 0 " + GRID_SIZE,
        fill: "none",
        stroke: "#cbd5e1",
        "stroke-width": 0.8
      }));
      defs.appendChild(cartesian);
    }

    var gridRect = overlay.querySelector("#tabc-svg-grid-rect");
    if (!gridRect) {
      gridRect = createSvgNode(overlay, "rect", {
        id: "tabc-svg-grid-rect", x: 0, y: 0, width: "100%", height: "100%"
      });
      overlay.appendChild(gridRect);
    }

    gridRect.setAttribute("x", "0");
    gridRect.setAttribute("y", "0");
    gridRect.setAttribute("width", "100%");
    gridRect.setAttribute("height", "100%");
    syncGridPatternTransform(overlay, world);
    if (gridTransformObserver && observedGridWorld !== world) {
      gridTransformObserver.disconnect();
      gridTransformObserver = null;
    }
    if (!gridTransformObserver) {
      gridTransformObserver = new MutationObserver(function () {
        var currentSvg = svgRoot();
        var currentWorld = worldGroup(currentSvg);
        var currentOverlay = gridOverlay();
        var currentCanvas = document.getElementById("editor_container");
        if (currentWorld && currentOverlay) {
          var transform = currentWorld.getAttribute("transform") || "";
          syncGridPatternTransform(currentOverlay, currentWorld);
          var match = transform.match(/scale\(([^)]+)\)/);
          if (currentCanvas) currentCanvas.style.setProperty("--tabc-svg-zoom", String(match ? Number(match[1]) || 1 : 1));
        }
      });
      gridTransformObserver.observe(world, { attributes: true, attributeFilter: ["transform"] });
      observedGridWorld = world;
    }

    var scaleMatch = (world.getAttribute("transform") || "").match(/scale\(([^)]+)\)/);
    var canvas = document.getElementById("editor_container");
    if (canvas) canvas.style.setProperty("--tabc-svg-zoom", String(scaleMatch ? Number(scaleMatch[1]) || 1 : 1));
    if (activeGridMode === "dot") {
      overlay.style.display = "";
      gridRect.setAttribute("fill", "url(#tabc-svg-grid-dot)");
    } else if (activeGridMode === "cartesian") {
      overlay.style.display = "";
      gridRect.setAttribute("fill", "url(#tabc-svg-grid-cartesian)");
    } else {
      overlay.style.display = "none";
    }
    return { svg: svg, world: world, overlay: overlay };
  }

  function screenToLogical(event) {
    var grid = ensureSvgGrid();
    var canvas = document.getElementById("editor_container");
    if (!grid || !canvas || !grid.world.getScreenCTM) return null;
    var ctm = grid.world.getScreenCTM();
    if (!ctm) return null;

    var point = grid.svg.createSVGPoint();
    point.x = event.clientX;
    point.y = event.clientY;
    var physical = point.matrixTransform(ctm.inverse());
    var raw = {
      x: physical.x / LEGACY_TO_LOGICAL_SCALE,
      y: physical.y / LEGACY_TO_LOGICAL_SCALE
    };
    return {
      grid: grid,
      canvas: canvas,
      rawX: raw.x,
      rawY: raw.y,
      x: Math.round(raw.x / GRID_SIZE) * GRID_SIZE,
      y: Math.round(raw.y / GRID_SIZE) * GRID_SIZE
    };
  }

  function logicalToLegacyPointer(coordinate) {
    if (!coordinate) return null;
    var grid = coordinate.grid;
    var canvas = coordinate.canvas;
    var ctm = grid.world.getScreenCTM();
    if (!ctm) return null;
    var snapped = grid.svg.createSVGPoint();
    snapped.x = coordinate.x * LEGACY_TO_LOGICAL_SCALE;
    snapped.y = coordinate.y * LEGACY_TO_LOGICAL_SCALE;
    var screen = snapped.matrixTransform(ctm);
    var rect = canvas.getBoundingClientRect();
    /* The SVG screen CTM includes the visual CSS pan, but the archived editor's
       drag model does not. Remove that presentation-only translation before its
       page-coordinate math so the pointer and component anchor remain coincident. */
    return {
      x: coordinate.x,
      y: coordinate.y,
      rawX: coordinate.rawX,
      rawY: coordinate.rawY,
      screenX: screen.x - rect.left - viewportPan.x,
      screenY: screen.y - rect.top - viewportPan.y,
      clientX: screen.x - viewportPan.x,
      clientY: screen.y - viewportPan.y
    };
  }

  function getSvgCoordinate(event) {
    return logicalToLegacyPointer(screenToLogical(event));
  }

  function localizeCanvasPointer(event) {
    var canvas = document.getElementById("editor_container");
    var continuesExistingDrag = existingComponentDrag && (event.type === "mousemove" || event.type === "mouseup" || event.type === "pointermove" || event.type === "pointerup");
    if (!canvas || !event.target || (!canvas.contains(event.target) && !continuesExistingDrag) || typeof event.clientX !== "number") return;
    var coordinate = getSvgCoordinate(event);
    var rect = canvas.getBoundingClientRect();
    var localX = coordinate ? coordinate.screenX : event.clientX - rect.left - viewportPan.x;
    var localY = coordinate ? coordinate.screenY : event.clientY - rect.top - viewportPan.y;
    try {
      Object.defineProperty(event, "pageX", { configurable: true, value: localX });
      Object.defineProperty(event, "pageY", { configurable: true, value: localY });
      Object.defineProperty(event, "tabcLocalX", { configurable: true, value: localX });
      Object.defineProperty(event, "tabcLocalY", { configurable: true, value: localY });
      if (coordinate) {
        Object.defineProperty(event, "tabcSvgX", { configurable: true, value: coordinate.x });
        Object.defineProperty(event, "tabcSvgY", { configurable: true, value: coordinate.y });
        Object.defineProperty(event, "tabcRawSvgX", { configurable: true, value: coordinate.rawX });
        Object.defineProperty(event, "tabcRawSvgY", { configurable: true, value: coordinate.rawY });
        /* Raphaël reads client coordinates for placements, wire segments, hover
           targets, and existing drags. Preserve the right-button pan path only. */
        var isRightPan = event.button === 2 || event.buttons === 2;
        if (!isRightPan) {
          Object.defineProperty(event, "clientX", { configurable: true, value: coordinate.clientX });
          Object.defineProperty(event, "clientY", { configurable: true, value: coordinate.clientY });
        }
      }
    } catch (ignore) {
      /* Pointer fields are mutable in the supported archived-editor runtime. */
    }
  }

  function isExistingComponentTarget(target) {
    var svg = svgRoot();
    if (!svg || !target || !svg.contains(target)) return false;
    if (target.closest && target.closest("#tabc-svg-grid-layer")) return false;
    var candidate = target;
    while (candidate && candidate !== svg) {
      if (candidate.raphaelid || (candidate.getAttribute && candidate.getAttribute("raphaelid"))) return true;
      candidate = candidate.parentNode;
    }
    return false;
  }

  function trackExistingComponentDrag(event) {
    if ((event.type === "mousedown" || event.type === "pointerdown") && event.button === 0) {
      existingComponentDrag = isExistingComponentTarget(event.target);
      return;
    }
    if ((event.type === "mouseup" || event.type === "pointerup") && event.button === 0) existingComponentDrag = false;
  }

  function manualSvgPointer(event, svg) {
    var rect = svg && svg.getBoundingClientRect && svg.getBoundingClientRect();
    if (!rect || !rect.width || !rect.height) return null;
    var viewBox = svg.viewBox && svg.viewBox.baseVal;
    var viewBoxWidth = viewBox && viewBox.width || svg.clientWidth || rect.width;
    var viewBoxHeight = viewBox && viewBox.height || svg.clientHeight || rect.height;
    return {
      x: (event.clientX - rect.left) * (viewBoxWidth / rect.width),
      y: (event.clientY - rect.top) * (viewBoxHeight / rect.height)
    };
  }

  function dispatchLegacyPointerFallback(event, coordinate) {
    if (event.tabcLegacyClone || !event.target || !coordinate) return false;
    var clone = new MouseEvent(event.type, {
      bubbles: true,
      cancelable: true,
      composed: true,
      button: event.button || 0,
      buttons: event.buttons || 0,
      detail: event.detail || 0,
      clientX: coordinate.x,
      clientY: coordinate.y,
      screenX: coordinate.x,
      screenY: coordinate.y
    });
    try {
      Object.defineProperty(clone, "pageX", { configurable: true, value: coordinate.x });
      Object.defineProperty(clone, "pageY", { configurable: true, value: coordinate.y });
      Object.defineProperty(clone, "tabcLegacyClone", { configurable: true, value: true });
      event.stopImmediatePropagation();
      event.preventDefault();
      event.target.dispatchEvent(clone);
      return true;
    } catch (ignore) {
      return false;
    }
  }

  function bindPointerBridge() {
    if (pointerBridgeBound) return;
    pointerBridgeBound = true;
    /* Plan A: derive coordinates from the root SVG bounding box and viewBox,
       independent of the archived world's internal transform. Plan B activates
       only when the browser refuses mutable event fields. */
    ["pointerdown", "pointermove", "pointerup", "mousedown", "mouseup", "mousemove", "click"].forEach(function (type) {
      document.addEventListener(type, function (event) {
        var svg = svgRoot();
        var canvas = document.getElementById("editor_container");
        var isRightPan = event.button === 2 || event.buttons === 2;
        if (!svg || !canvas || !canvas.contains(event.target) || isRightPan || typeof event.clientX !== "number") return;
        var svgCoords = manualSvgPointer(event, svg);
        if (!svgCoords) return;
        try {
          Object.defineProperty(event, "pageX", { configurable: true, value: svgCoords.x });
          Object.defineProperty(event, "pageY", { configurable: true, value: svgCoords.y });
          Object.defineProperty(event, "clientX", { configurable: true, value: svgCoords.x });
          Object.defineProperty(event, "clientY", { configurable: true, value: svgCoords.y });
          Object.defineProperty(event, "tabcSvgX", { configurable: true, value: svgCoords.x });
          Object.defineProperty(event, "tabcSvgY", { configurable: true, value: svgCoords.y });
        } catch (ignore) {
          dispatchLegacyPointerFallback(event, svgCoords);
        }
      }, true);
    });
  }

  function updateViewportPresentation() {
    var svgHost = document.getElementById("svg_container");
    viewportPan = { x: 0, y: 0 };
    if (svgHost) svgHost.style.transform = "";
    ensureSvgGrid();
  }

  /* The archived editor is SVG/Raphaël, not Canvas. Present one coherent
     transformed frame per animation frame so fast panning cannot leave stale
     compositor tiles at the clipped workspace boundary. */
  function scheduleViewportPresentation() {
    if (panPresentationFrame !== null) return;
    panPresentationFrame = window.requestAnimationFrame(function () {
      panPresentationFrame = null;
      updateViewportPresentation();
    });
  }

  function settleViewportPresentation() {
    if (panPresentationFrame !== null) {
      window.cancelAnimationFrame(panPresentationFrame);
      panPresentationFrame = null;
    }
    updateViewportPresentation();
    window.requestAnimationFrame(function () {
      var canvas = document.getElementById("editor_container");
      if (canvas) void canvas.offsetWidth;
    });
  }

  function startPan(event) {
    var canvas = document.getElementById("editor_container");
    if (event.button !== 2 || !canvas || !canvas.contains(event.target)) return;
    panSession = { x: event.clientX, y: event.clientY, panX: viewportPan.x, panY: viewportPan.y };
    canvas.classList.add("tabc-panning");
    event.preventDefault();
    event.stopImmediatePropagation();
  }

  function movePan(event) {
    if (!panSession) return;
    viewportPan.x = panSession.panX + event.clientX - panSession.x;
    viewportPan.y = panSession.panY + event.clientY - panSession.y;
    scheduleViewportPresentation();
    event.preventDefault();
    event.stopImmediatePropagation();
  }

  function endPan(event) {
    if (!panSession || (event.type === "mouseup" && event.button !== 2)) return;
    var canvas = document.getElementById("editor_container");
    if (canvas) canvas.classList.remove("tabc-panning");
    panSession = null;
    settleViewportPresentation();
    event.preventDefault();
    event.stopImmediatePropagation();
  }

  function bindCadInteractions() {
    if (cadInteractionBound) return;
    cadInteractionBound = true;
    /* Native pan and context handling remain entirely with the archived editor. */
  }

  function setGridMode(mode) {
    if (mode === "hidden") mode = "none";
    if (mode !== "dot" && mode !== "cartesian" && mode !== "none") mode = "dot";
    activeGridMode = mode;
    var canvas = document.getElementById("editor_container");
    if (canvas) canvas.setAttribute("data-grid-mode", mode);
    ensureSvgGrid();
    document.querySelectorAll("#tabc-grid-control-bar [data-grid-mode]").forEach(function (button) {
      button.setAttribute("aria-pressed", String(button.getAttribute("data-grid-mode") === mode));
    });
  }

  function ensureGridControls(topHost) {
    var bar = document.getElementById("tabc-grid-control-bar");
    if (!bar) {
      bar = document.createElement("div");
      bar.id = "tabc-grid-control-bar";
      bar.setAttribute("role", "toolbar");
      bar.setAttribute("aria-label", "Canvas grid controls");
      bar.innerHTML = "<span class='tabc-grid-label'>Grid Style:</span><button type='button' data-grid-mode='dot'>Dot</button><button type='button' data-grid-mode='cartesian'>Cartesian</button><button type='button' data-grid-mode='none'>Hidden</button>";
      bar.addEventListener("click", function (event) {
        var button = event.target.closest("button[data-grid-mode]");
        if (button) setGridMode(button.getAttribute("data-grid-mode"));
      });
    }
    bar.querySelectorAll("button[data-grid-mode]").forEach(function (button) {
      if (button.getAttribute("data-tabc-grid-bound") === "true") return;
      button.setAttribute("data-tabc-grid-bound", "true");
      var activate = function (event) {
        if ((event.type === "mousedown" || event.type === "pointerdown") && event.button !== 0) return;
        event.preventDefault();
        event.stopImmediatePropagation();
        setGridMode(button.getAttribute("data-grid-mode"));
      };
      button.onmousedown = activate;
      button.onclick = activate;
      button.addEventListener("pointerdown", activate, true);
      button.addEventListener("touchstart", activate, { capture: true, passive: false });
    });
    if (bar.parentNode !== topHost) topHost.appendChild(bar);
    setGridMode(activeGridMode);
  }

  function closeLegacyMenus(except) {
    document.querySelectorAll("#tabc-top-toolbar-host .navbar.editor li.dropdown.open").forEach(function (item) {
      if (item === except) return;
      item.classList.remove("open");
      var trigger = item.querySelector(":scope > a.dropdown-toggle");
      if (trigger) trigger.setAttribute("aria-expanded", "false");
      var panel = item.querySelector(":scope > .dropdown-menu");
      if (panel) {
        panel.style.display = "none";
        panel.style.visibility = "hidden";
        panel.style.pointerEvents = "none";
      }
    });
  }

  function bindLegacyMenus(topHost) {
    var nav = topHost.querySelector(".navbar.editor");
    if (!nav) return;
    nav.querySelectorAll("li.dropdown > a.dropdown-toggle").forEach(function (trigger) {
      var item = trigger.parentNode;
      trigger.setAttribute("role", "button");
      trigger.setAttribute("aria-haspopup", "menu");
      trigger.setAttribute("aria-expanded", String(item.classList.contains("open")));
      if (trigger.getAttribute("data-tabc-menu-bound") === "true") return;
      trigger.setAttribute("data-tabc-menu-bound", "true");
      var toggle = function (event) {
        if (event.type === "keydown" && event.key !== "Enter" && event.key !== " " && event.key !== "ArrowDown") return;
        var now = Date.now();
        if (event.type !== "keydown" && now < menuInputSuppressUntil) {
          event.preventDefault();
          event.stopImmediatePropagation();
          return;
        }
        event.preventDefault();
        event.stopImmediatePropagation();
        var shouldOpen = !item.classList.contains("open");
        closeLegacyMenus(item);
        item.classList.toggle("open", shouldOpen);
        var panel = item.querySelector(":scope > .dropdown-menu");
        if (panel) {
          panel.style.display = shouldOpen ? "block" : "none";
          panel.style.visibility = shouldOpen ? "visible" : "hidden";
          panel.style.pointerEvents = shouldOpen ? "auto" : "none";
        }
        trigger.setAttribute("aria-expanded", String(shouldOpen));
        if (shouldOpen && event.type === "keydown") {
          var firstItem = item.querySelector(".dropdown-menu a");
          if (firstItem) firstItem.focus();
        }
        if (event.type === "pointerdown" || event.type === "mousedown") menuInputSuppressUntil = now + 450;
      };
      trigger.addEventListener("click", toggle, true);
      trigger.addEventListener("pointerdown", toggle, true);
      trigger.addEventListener("mousedown", toggle, true);
      trigger.addEventListener("keydown", toggle, true);
    });
    if (legacyMenuBound) return;
    legacyMenuBound = true;
    document.addEventListener("click", function (event) {
      if (!nav.contains(event.target)) closeLegacyMenus(null);
    }, true);
    document.addEventListener("keydown", function (event) {
      if (event.key !== "Escape") return;
      closeLegacyMenus(null);
    }, true);
  }

  function bindLegacyMenuActions(topHost) {
    if (legacyMenuActionsBound) return;
    legacyMenuActionsBound = true;
    var commandMap = {
      "menu_zoom_in": function () { activateLegacyToolbarButton("toolbar_zoom_in"); },
      "menu_zoom_out": function () { activateLegacyToolbarButton("toolbar_zoom_out"); },
      "menu_select_none": function () { activateLegacyToolbarButton("arrow"); },
      "menu_toggle_background_grid": function () { setGridMode(activeGridMode === "none" ? "dot" : "none"); }
    };
    document.addEventListener("click", function (event) {
      var link = event.target.closest && event.target.closest(".navbar.editor .dropdown-menu a");
      if (!link) return;
      var className = Object.keys(commandMap).find(function (name) { return link.classList.contains(name); });
      if (!className) return;
      event.preventDefault();
      event.stopImmediatePropagation();
      commandMap[className]();
      closeLegacyMenus(null);
    }, true);
  }

  function activateLegacyToolbarButton(id) {
    var button = document.getElementById(id);
    return activateLegacyButtonElement(button);
  }

  function activateLegacyButtonElement(button) {
    if (!button) return false;
    var eventInit = { bubbles: true, cancelable: true, button: 0, buttons: 1, clientX: 0, clientY: 0 };
    button.dispatchEvent(new MouseEvent("mousedown", eventInit));
    button.dispatchEvent(new MouseEvent("mouseup", Object.assign({}, eventInit, { buttons: 0 })));
    return true;
  }

  function executeLegacyCommand(command, value) {
    if (command === "SET_GRID") {
      setGridMode(value);
      return true;
    }
    if (command === "ROTATE_45") return rotateSelectedComponent(45);
    if (command === "ROTATE_90") return rotateSelectedComponent(90);
    var toolbarCommands = {
      "ZOOM_IN": "toolbar_zoom_in",
      "ZOOM_OUT": "toolbar_zoom_out",
      "SELECT": "arrow",
      "MOVE": "move",
      "BUILD": "build",
      "SIMULATE": "sim"
    };
    return toolbarCommands[command] ? activateLegacyToolbarButton(toolbarCommands[command]) : false;
  }

  function removeLegacyRunMenuItem() {
    document.querySelectorAll(".navbar.editor ul.nav > li").forEach(function (item) {
      if (item.textContent && item.textContent.trim() === "Run") item.remove();
    });
  }

  function detachLegacySimulationPanel() {
    var panel = document.getElementById("simulate_container");
    if (!panel || !panel.parentNode) return;
    if (!nativeDcSolveButton) nativeDcSolveButton = panel.querySelector("#dcsolve");
    if (!detachedSimulationPanel) detachedSimulationPanel = document.createDocumentFragment();
    detachedSimulationPanel.appendChild(panel);
  }

  function prepareContinuousNativeSolver() {
    if (!isStandardCircuitLabInstance()) return false;
    if (!nativeSimButton) nativeSimButton = document.getElementById("sim");
    if (!nativeSimButton) return false;
    if (!nativeDcSolveButton) {
      activateLegacyButtonElement(nativeSimButton);
      nativeDcSolveButton = document.getElementById("dcsolve");
      detachLegacySimulationPanel();
    }
    return Boolean(nativeDcSolveButton);
  }

  function scheduleContinuousNativeSolve() {
    if (!isStandardCircuitLabInstance()) return;
    if (continuousSolveTimer) window.clearTimeout(continuousSolveTimer);
    setRunStatus("AUTO-SOLVE QUEUED", "running");
    continuousSolveTimer = window.setTimeout(function () {
      continuousSolveTimer = null;
      if (!prepareContinuousNativeSolver()) {
        setRunStatus("AUTO-SOLVE · NATIVE DC UNAVAILABLE", "complete");
        return;
      }
      setRunStatus("AUTO-SOLVING NATIVE MNA", "running");
      scheduleNativeDcSolve();
    }, 200);
  }

  function isContinuousFlowMutation(record) {
    var node = record.target && (record.target.nodeType === 1 ? record.target : record.target.parentElement);
    if (node && node.closest && node.closest("#tabc-current-flow-layer")) return true;
    var changedNodes = Array.prototype.slice.call(record.addedNodes || []).concat(Array.prototype.slice.call(record.removedNodes || []));
    return changedNodes.length > 0 && changedNodes.every(function (changed) {
      return changed.nodeType === 1 && (changed.id === "tabc-current-flow-layer" || changed.closest && changed.closest("#tabc-current-flow-layer"));
    });
  }

  function currentTopologySignature() {
    var svg = svgRoot();
    var world = worldGroup(svg);
    if (!world) return "";
    return Array.prototype.slice.call(world.querySelectorAll("path, line, polyline, circle, rect, text")).filter(function (node) {
      return !(node.closest && node.closest("#tabc-current-flow-layer"));
    }).map(function (node) {
      return [node.tagName, node.id || "", node.getAttribute("d") || "", node.getAttribute("x") || node.getAttribute("x1") || "", node.getAttribute("y") || node.getAttribute("y1") || "", node.getAttribute("transform") || "", node.getAttribute("data-tabc-dmm-mode") || ""].join("|");
    }).join(";");
  }

  function reconcileContinuousTopology() {
    var next = currentTopologySignature();
    if (next !== continuousTopologySignature) {
      continuousTopologySignature = next;
      scheduleContinuousNativeSolve();
    }
  }

  function ensureContinuousSimulation() {
    if (!isStandardCircuitLabInstance()) return;
    var button = document.getElementById("sim");
    if (button && !nativeSimButton) nativeSimButton = button;
    if (button && button.parentNode) button.remove();
    removeLegacyRunMenuItem();
    var status = document.getElementById("tabc-run-status");
    if (!status) {
      status = document.createElement("span");
      status.id = "tabc-run-status";
      status.setAttribute("aria-live", "polite");
      status.setAttribute("data-run-state", "synced");
      status.textContent = "AUTO-SOLVE READY";
      var toolbar = document.getElementById("toolbar");
      if (toolbar) toolbar.appendChild(status);
    }
    if (continuousSimulationBound) return;
    continuousSimulationBound = true;
    var svg = svgRoot();
    if (svg) {
      continuousSimulationObserver = new MutationObserver(function (records) {
        if (records.some(function (record) { return !isContinuousFlowMutation(record); })) reconcileContinuousTopology();
      });
      continuousSimulationObserver.observe(svg, { childList: true, subtree: true, attributes: true, attributeFilter: ["d", "data-tabc-dmm-mode", "data-tabc-dmm-range"] });
    }
    document.addEventListener("change", function (event) {
      if (event.target.closest && event.target.closest("#tabc-properties-inspector, #paramBoxContainer")) scheduleContinuousNativeSolve();
    }, true);
    document.addEventListener("input", function (event) {
      if (event.target.closest && event.target.closest("#tabc-properties-inspector")) scheduleContinuousNativeSolve();
    }, true);
    reconcileContinuousTopology();
    if (!continuousTopologyPoll) continuousTopologyPoll = window.setInterval(reconcileContinuousTopology, 160);
  }

  function worldTransformState(world) {
    var transform = world && world.getAttribute("transform") || "";
    var translate = transform.match(/translate\(\s*([^,\s)]+)[,\s]+([^\s)]+)\s*\)/);
    var scale = transform.match(/scale\(\s*([^\s)]+)\s*\)/);
    return {
      x: translate ? Number(translate[1]) || 0 : 0,
      y: translate ? Number(translate[2]) || 0 : 0,
      scale: scale ? Number(scale[1]) || 1 : 1
    };
  }

  function applySmoothZoom(event) {
    if (!isStandardCircuitLabInstance()) return;
    var svg = svgRoot();
    var world = worldGroup(svg);
    if (!svg || !world) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    var state = worldTransformState(world);
    var nextScale = Math.min(3, Math.max(0.2, state.scale - event.deltaY * 0.0015));
    if (Math.abs(nextScale - state.scale) < 0.0001) return;
    var rect = svg.getBoundingClientRect();
    var anchorX = event.clientX - rect.left;
    var anchorY = event.clientY - rect.top;
    var nextX = anchorX - (anchorX - state.x) * (nextScale / state.scale);
    var nextY = anchorY - (anchorY - state.y) * (nextScale / state.scale);
    world.setAttribute("transform", "translate(" + nextX + ", " + nextY + ") scale(" + nextScale + ")");
    var zoomInput = document.getElementById("zoom_input");
    if (zoomInput) zoomInput.value = Math.round(nextScale * 1000) / 10 + "%";
    var overlay = gridOverlay();
    if (overlay) syncGridPatternTransform(overlay, world);
  }

  function ensureSmoothEcircuitsZoom() {
    /* Do not install a competing wheel listener. The archived editor retains
       its own zoom/viewBox behavior and the corresponding mouse mapping. */
  }

  function bindLegacyCommandBridge() {
    if (legacyCommandBridgeBound) return;
    legacyCommandBridgeBound = true;
    window.LegacyCircuitBridge = {
      setGrid: function (mode) { return executeLegacyCommand("SET_GRID", mode); },
      zoomIn: function () { return executeLegacyCommand("ZOOM_IN"); },
      zoomOut: function () { return executeLegacyCommand("ZOOM_OUT"); },
      select: function () { return executeLegacyCommand("SELECT"); },
      move: function () { return executeLegacyCommand("MOVE"); },
      build: function () { return executeLegacyCommand("BUILD"); },
      simulate: function () { return runNativeEcircuitsSolve(); },
      run: function () { return runNativeEcircuitsSolve(); },
      autoSolve: function () { scheduleContinuousNativeSolve(); return true; },
      rotate45: function () { return executeLegacyCommand("ROTATE_45"); },
      rotate90: function () { return executeLegacyCommand("ROTATE_90"); },
      refreshDmm: function () { scheduleDmmReadingRefresh(); return true; },
      getState: function () {
        return {
          grid: activeGridMode,
          pan: { x: viewportPan.x, y: viewportPan.y },
          zoom: document.getElementById("zoom_input") ? document.getElementById("zoom_input").value : null
        };
      }
    };
    window.addEventListener("message", function (event) {
      if (event.origin !== window.location.origin || (event.source !== window.parent && event.source !== window)) return;
      var payload = event.data;
      if (!payload || payload.channel !== "mae-tab-c" || typeof payload.action !== "string") return;
      var handled = executeLegacyCommand(payload.action, payload.value);
      if (event.source && event.source.postMessage) {
        event.source.postMessage({ channel: "mae-tab-c", type: "COMMAND_RESULT", action: payload.action, handled: handled, state: window.LegacyCircuitBridge.getState() }, event.origin);
      }
    });
  }

  function layout() {
    queued = false;
    var holder = document.getElementById("editor_container_holder");
    if (!holder || !document.body) return;
    document.querySelectorAll("#startupsplashscreen").forEach(function (node) { node.remove(); });

    var shell = document.getElementById("tabc-external-shell");
    if (!shell) {
      shell = document.createElement("div");
      shell.id = "tabc-external-shell";
      var dockedPropertiesLayout = usesDockedPropertiesInspector();
      shell.classList.toggle("tabc-docked-properties-layout", dockedPropertiesLayout);
      shell.innerHTML = "<section id='tabc-top-command-box' class='isolated-top-box' aria-label='Circuit editor commands'><div id='tabc-top-toolbar-host' role='toolbar' aria-label='Circuit editor menu'></div></section><div id='tabc-box-row'><aside id='tabc-component-library-box' class='isolated-left-box' aria-label='" + (dockedPropertiesLayout ? "Circuit component library and properties" : "Circuit component library") + "'>" + (dockedPropertiesLayout ? "<section id='tabc-component-library-panel' aria-label='Circuit component library'><div id='tabc-left-sidebar-host'></div></section><section id='tabc-properties-inspector' aria-label='Properties Inspector'></section>" : "<div id='tabc-left-sidebar-host'></div>") + "</aside><main id='tabc-canvas-workspace-box' class='isolated-canvas-box' aria-label='Circuit workspace'><div id='tabc-workspace-host'></div></main></div>";
      holder.parentNode.insertBefore(shell, holder);
      document.getElementById("tabc-workspace-host").appendChild(holder);
    }

    var topHost = document.getElementById("tabc-top-toolbar-host");
    var sidebarHost = document.getElementById("tabc-left-sidebar-host");
    moveToHost(".navbar.editor", topHost);
    moveToHost("#toolbar", topHost);
    moveToHost("#toolbox", sidebarHost);
    consolidateSourcePalette();
    restrictCircuitLabOnePalette();
    ensureDmmInstrument();
    /* The archived editor owns its Build/Simulate state. Do not start a bridge
       solve loop while the user is placing or wiring components, because its
       native mode transition can clear the active palette tool. */
    ensureSmoothEcircuitsZoom();
    renderDockedInspector();
    bindDockedInspector();
    bindRedundantInspectorFallbacks();
    ensureGridControls(topHost);
    ensureRotationPrototypeControls(topHost);
    bindLegacyMenus(topHost);
    bindLegacyMenuActions(topHost);
    bindLegacyCommandBridge();
    var menu = topHost.querySelector(".navbar.editor");
    var toolbar = topHost.querySelector("#toolbar");
    var gridBar = topHost.querySelector("#tabc-grid-control-bar");
    var rotationBar = topHost.querySelector("#tabc-rotation-control-bar");
    var divider = document.getElementById("tabc-legacy-action-divider");
    if (!divider) {
      divider = document.createElement("div");
      divider.id = "tabc-legacy-action-divider";
      divider.setAttribute("aria-hidden", "true");
    }
    if (gridBar) topHost.appendChild(gridBar);
    if (menu) topHost.appendChild(menu);
    if (rotationBar) topHost.appendChild(rotationBar);
    topHost.appendChild(divider);
    if (toolbar) topHost.appendChild(toolbar);
    bindPointerBridge();
    bindCadInteractions();
    bindLegacyPlacementLabelCleanup();
    updateViewportPresentation();
    window.requestAnimationFrame(function () {
      window.dispatchEvent(new Event("resize"));
      if (window.jQuery) window.jQuery(window).trigger("resize");
    });
  }

  function scheduleLayout() {
    if (queued) return;
    queued = true;
    window.requestAnimationFrame(layout);
  }

  function needsStructuralLayout(records) {
    if (!document.getElementById("tabc-external-shell")) return true;
    return records.some(function (record) {
      return Array.prototype.slice.call(record.addedNodes || []).some(function (node) {
        if (node.nodeType !== 1) return false;
        return node.id === "editor_container_holder" || node.id === "toolbar" || node.id === "toolbox" || (node.matches && node.matches(".navbar.editor"));
      });
    });
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", scheduleLayout);
  else scheduleLayout();

  observer = new MutationObserver(function (records) {
    /* Placement and solver mutations belong to the SVG world, not the shell.
       Reparent only when the archived editor chrome itself mounts again. */
    if (needsStructuralLayout(records)) scheduleLayout();
  });
  observer.observe(document.documentElement, { childList: true, subtree: true });
}());
