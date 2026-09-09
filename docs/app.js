const repository = "CMasterp/avengers-incident-lab";
const apiReportUrl = `https://api.github.com/repos/${repository}/contents/docs/mission-report.json?ref=main`;
const rawReportUrl = `https://raw.githubusercontent.com/${repository}/main/docs/mission-report.json`;
const localReportUrl = "./mission-report.json";

const elements = {
  sourceStatus: document.querySelector("#source-status"),
  refresh: document.querySelector("#refresh-button"),
  missionTitle: document.querySelector("#mission-title"),
  missionSummary: document.querySelector("#mission-summary"),
  prLabel: document.querySelector("#pr-label"),
  prLink: document.querySelector("#pr-link"),
  threatLevel: document.querySelector("#threat-level"),
  threatMessage: document.querySelector("#threat-message"),
  resolved: document.querySelector("#resolved-count"),
  open: document.querySelector("#open-count"),
  meter: document.querySelector("#progress-meter"),
  updatedAt: document.querySelector("#updated-at"),
  timeline: document.querySelector("#timeline"),
  agents: document.querySelector("#agents"),
  findings: document.querySelector("#findings"),
  threads: document.querySelector("#threads"),
  emptyTemplate: document.querySelector("#empty-state-template")
};

const escapeHtml = (value = "") => String(value).replace(/[&<>'"]/g, (character) => ({
  "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#039;", "\"": "&quot;"
}[character]));

function formatDate(value) {
  if (!value) return "Unknown time";
  return new Intl.DateTimeFormat("en", { dateStyle: "medium", timeStyle: "short" }).format(new Date(value));
}

function setHtml(target, html) {
  target.innerHTML = html;
}

function renderEmpty(target) {
  target.replaceChildren(elements.emptyTemplate.content.cloneNode(true));
}

function renderReport(report) {
  const { mission, pullRequest, summary } = report;
  elements.missionTitle.textContent = mission.label;
  elements.missionSummary.textContent = mission.summary;
  elements.prLabel.textContent = pullRequest.number ? `${pullRequest.repository} · PR #${pullRequest.number} · ${pullRequest.title}` : pullRequest.title;
  elements.prLink.hidden = !pullRequest.url;
  elements.prLink.href = pullRequest.url || "#";
  elements.threatLevel.textContent = (summary.threatLevel || "none").toUpperCase();
  elements.threatLevel.dataset.level = summary.threatLevel || "none";
  elements.threatMessage.textContent = summary.message;
  elements.resolved.textContent = summary.resolvedThreads ?? 0;
  elements.open.textContent = summary.openThreads ?? 0;
  const total = (summary.resolvedThreads ?? 0) + (summary.openThreads ?? 0);
  elements.meter.style.width = `${total ? Math.round(((summary.resolvedThreads ?? 0) / total) * 100) : 0}%`;
  elements.updatedAt.textContent = `Last intelligence: ${formatDate(report.updatedAt)}`;

  renderTimeline(report.timeline || []);
  renderAgents(report.agents || []);
  renderFindings(report.findings || []);
  renderThreads(report.threads || []);
}

function renderTimeline(items) {
  if (!items.length) return renderEmpty(elements.timeline);
  setHtml(elements.timeline, items.map((item) => `
    <li>
      <div class="timeline-title"><span>${escapeHtml(item.event)}</span><time>${formatDate(item.at)}</time></div>
      <p class="timeline-detail">${escapeHtml(item.detail)}</p>
    </li>`).join(""));
}

function renderAgents(agents) {
  if (!agents.length) return renderEmpty(elements.agents);
  setHtml(elements.agents, agents.map((agent) => `
    <article class="agent-card panel">
      <header><div><p class="eyebrow">${escapeHtml(agent.role)}</p><h3>${escapeHtml(agent.name)}</h3></div><span class="badge" data-state="${escapeHtml(agent.status)}">${escapeHtml(agent.status)}</span></header>
      <p>${escapeHtml(agent.summary)}</p>
    </article>`).join(""));
}

function renderFindings(findings) {
  if (!findings.length) return renderEmpty(elements.findings);
  setHtml(elements.findings, findings.map((finding) => {
    const evidence = finding.evidence?.[0];
    return `<article class="finding-card panel" data-hero="${escapeHtml(finding.hero)}">
      <header><div><p class="eyebrow">${escapeHtml(finding.hero)}</p><h3>${escapeHtml(finding.title)}</h3></div><span class="badge severity-${escapeHtml(finding.severity)}">${escapeHtml(finding.severity)}</span></header>
      <p class="finding-body">${escapeHtml(finding.description)}</p>
      ${evidence ? `<div class="evidence"><strong>Evidence</strong><p>${escapeHtml(evidence.detail)}</p><a href="${escapeHtml(evidence.url)}" target="_blank" rel="noreferrer">Open source ↗</a></div>` : ""}
      <footer><span>${escapeHtml(finding.file || "Repository-wide")} ${finding.line ? `:${finding.line}` : ""}</span><span>${Math.round((finding.confidence || 0) * 100)}% confidence</span></footer>
    </article>`;
  }).join(""));
}

function renderThreads(threads) {
  if (!threads.length) return renderEmpty(elements.threads);
  setHtml(elements.threads, threads.map((thread) => `
    <article class="thread-row">
      <div><h3>${escapeHtml(thread.title)}</h3><p class="thread-detail">${escapeHtml(thread.detail || "No additional detail.")}</p></div>
      <div><span class="badge" data-state="${escapeHtml(thread.status)}">${escapeHtml(thread.status)}</span>${thread.url ? `<p><a href="${escapeHtml(thread.url)}" target="_blank" rel="noreferrer">Open thread ↗</a></p>` : ""}</div>
    </article>`).join(""));
}

async function fetchReport() {
  elements.sourceStatus.textContent = "SYNCING MISSION FEED";
  const isLocalPreview = location.protocol === "file:" || ["localhost", "127.0.0.1"].includes(location.hostname);
  const sources = isLocalPreview
    ? [{ url: localReportUrl, kind: "json" }]
    : [
        { url: apiReportUrl, kind: "github-content" },
        { url: rawReportUrl, kind: "json" },
        { url: localReportUrl, kind: "json" }
      ];
  let lastError;

  for (const source of sources) {
    try {
      const separator = source.url.includes("?") ? "&" : "?";
      const response = await fetch(`${source.url}${separator}cache=${Date.now()}`, { cache: "no-store" });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const payload = await response.json();
      const report = source.kind === "github-content"
        ? JSON.parse(new TextDecoder().decode(Uint8Array.from(atob(payload.content.replace(/\n/g, "")), (character) => character.charCodeAt(0))))
        : payload;
      renderReport(report);
      elements.sourceStatus.textContent = source.kind === "github-content" ? "LIVE GITHUB INTEL" : "LOCAL INTEL FALLBACK";
      return;
    } catch (error) {
      lastError = error;
    }
  }

  elements.sourceStatus.textContent = "MISSION FEED OFFLINE";
  elements.missionSummary.textContent = `Unable to load the mission report: ${lastError?.message ?? "unknown error"}`;
}

elements.refresh.addEventListener("click", fetchReport);
fetchReport();
window.setInterval(fetchReport, 120000);
