import { fetchMissionReport, sourceLabel } from "./report-client.js";

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
  if (!value) return "Heure inconnue";
  return new Intl.DateTimeFormat("fr-FR", { dateStyle: "medium", timeStyle: "short" }).format(new Date(value));
}

function stateLabel(state) {
  return ({ idle: "en attente", investigating: "enquête", complete: "terminé", commented: "publié", resolved: "résolu", open: "ouvert", error: "erreur" }[state] || state || "inconnu");
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
  elements.updatedAt.textContent = `Dernier renseignement : ${formatDate(report.updatedAt)}`;

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
      <header><div><p class="eyebrow">${escapeHtml(agent.role)}</p><h3>${escapeHtml(agent.name)}</h3></div><span class="badge" data-state="${escapeHtml(agent.status)}">${escapeHtml(stateLabel(agent.status))}</span></header>
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
      ${evidence ? `<div class="evidence"><strong>Preuve</strong><p>${escapeHtml(evidence.detail)}</p><a href="${escapeHtml(evidence.url)}" target="_blank" rel="noreferrer">Ouvrir la source ↗</a></div>` : ""}
      <footer><span>${escapeHtml(finding.file || "Tout le dépôt")} ${finding.line ? `:${finding.line}` : ""}</span><span>${Math.round((finding.confidence || 0) * 100)} % de confiance</span></footer>
    </article>`;
  }).join(""));
}

function renderThreads(threads) {
  if (!threads.length) return renderEmpty(elements.threads);
  setHtml(elements.threads, threads.map((thread) => `
    <article class="thread-row">
      <div><h3>${escapeHtml(thread.title)}</h3><p class="thread-detail">${escapeHtml(thread.detail || "Aucun détail supplémentaire.")}</p></div>
      <div><span class="badge" data-state="${escapeHtml(thread.status)}">${escapeHtml(stateLabel(thread.status))}</span>${thread.url ? `<p><a href="${escapeHtml(thread.url)}" target="_blank" rel="noreferrer">Ouvrir le fil ↗</a></p>` : ""}</div>
    </article>`).join(""));
}

async function fetchReport() {
  elements.sourceStatus.textContent = "SYNCHRONISATION DU FLUX DE MISSION";
  try {
    const { report, source } = await fetchMissionReport();
    renderReport(report);
    elements.sourceStatus.textContent = sourceLabel(source);
  } catch (error) {
    elements.sourceStatus.textContent = "FLUX DE MISSION HORS LIGNE";
    elements.missionSummary.textContent = `Impossible de charger le rapport de mission : ${error?.message ?? "erreur inconnue"}`;
  }
}

elements.refresh.addEventListener("click", fetchReport);
fetchReport();
window.setInterval(fetchReport, 120000);
