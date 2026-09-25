/* ────── AI INSIGHTS (Phase 4) ────── */
function showAILoading(title) {
  const modal = document.getElementById("aiModal");
  const body = document.getElementById("aiModalBody");
  if (!modal || !body) return;
  body.innerHTML =
    '<div style="font-size:13px;color:var(--muted);margin-bottom:12px">' + title + '</div>' +
    '<div class="ai-loading"><span class="ai-spinner"></span>AI is analyzing... (5-20 sec first time)</div>';
  modal.classList.add("open");
}

function showAIResponse(title, analysis, model, elapsed) {
  const body = document.getElementById("aiModalBody");
  if (!body) return;
  body.innerHTML =
    '<div style="font-size:13px;color:var(--muted);margin-bottom:12px">' + title + '</div>' +
    '<div class="ai-panel" style="margin:0">' +
      '<div class="ai-panel-head">' +
        '<div class="ai-panel-title">🤖 Analysis' +
          (model ? '<span class="ai-model-badge">' + model + '</span>' : '') +
        '</div>' +
      '</div>' +
      '<div class="ai-content">' + (analysis || 'No response') + '</div>' +
      '<div class="ai-footer">' +
        '<span>⚡ Read-only analysis · No actions executed</span>' +
        (elapsed ? '<span style="margin-left:auto">' + elapsed + 's</span>' : '') +
      '</div>' +
    '</div>' +
    '<div class="ai-actions-row">' +
      '<button class="ai-btn" onclick="reAskAI()">🔄 Regenerate</button>' +
    '</div>';
}

function showAIError(title, err) {
  const body = document.getElementById("aiModalBody");
  if (!body) return;
  body.innerHTML =
    '<div style="font-size:13px;color:var(--muted);margin-bottom:12px">' + title + '</div>' +
    '<div class="ai-error">⚠ ' + (err || 'AI request failed') + '</div>' +
    '<div class="ai-actions-row"><button class="ai-btn" onclick="reAskAI()">🔄 Retry</button></div>';
}

let AI_LAST_REQUEST = null;

async function askAIAboutServer(name) {
  AI_LAST_REQUEST = { type: "server", name: name };
  showAILoading("Analyzing server: " + name);
  const t0 = Date.now();
  try {
    const r = await api("/api/v1/ai/analyze_server/" + encodeURIComponent(name), { method: "POST" });
    const elapsed = ((Date.now() - t0) / 1000).toFixed(1);
    showAIResponse("Server analysis: " + name, r.data.analysis, r.data.model, elapsed);
  } catch (e) {
    showAIError("Server analysis: " + name, e.detail || e.message || "AI unavailable");
  }
}

async function askAIAboutIncident(id) {
  AI_LAST_REQUEST = { type: "incident", id: id };
  showAILoading("Analyzing incident #" + id);
  const t0 = Date.now();
  try {
    const r = await api("/api/v1/ai/analyze_incident/" + id, { method: "POST" });
    const elapsed = ((Date.now() - t0) / 1000).toFixed(1);
    showAIResponse("Incident #" + id + " root cause", r.data.analysis, r.data.model, elapsed);
  } catch (e) {
    showAIError("Incident analysis", e.detail || e.message || "AI unavailable");
  }
}

async function askAIAboutTrend(name, range) {
  if (!range) range = "24h";
  if (!name) name = (typeof CURRENT !== "undefined" ? CURRENT : null) || (window.CURRENT || "unknown");
  AI_LAST_REQUEST = { type: "trend", name: name, range: range };
  showAILoading("Analyzing " + range + " trend for " + name);
  const t0 = Date.now();
  try {
    const r = await api("/api/v1/ai/analyze_trend/" + encodeURIComponent(name) + "?range=" + range, { method: "POST" });
    const elapsed = ((Date.now() - t0) / 1000).toFixed(1);
    showAIResponse("Trend analysis: " + name + " (" + range + ")", r.data.analysis, r.data.model, elapsed);
  } catch (e) {
    showAIError("Trend analysis", e.detail || e.message || "AI unavailable");
  }
}

function reAskAI() {
  if (!AI_LAST_REQUEST) return;
  const r = AI_LAST_REQUEST;
  if (r.type === "server") askAIAboutServer(r.name);
  else if (r.type === "incident") askAIAboutIncident(r.id);
  else if (r.type === "trend") askAIAboutTrend(r.name, r.range);
}

function closeAIModal() {
  const modal = document.getElementById("aiModal");
  if (modal) modal.classList.remove("open");
}

/* ══════ GLOBAL EXPORTS (so inline onclick handlers work) ══════ */
window.askAIAboutServer = askAIAboutServer;
window.askAIAboutIncident = askAIAboutIncident;
window.askAIAboutTrend = askAIAboutTrend;
window.closeAIModal = closeAIModal;
window.reAskAI = reAskAI;

