import * as THREE from "https://unpkg.com/three@0.166.1/build/three.module.js";

const RELAY_ORIGIN = "http://127.0.0.1:4318";
const PUBLIC_REPORT_URL = new URL("mission-report.json", window.location.href).href;
const POLL_INTERVAL = 15000;
const PHASES = {
  idle: { label: "EN ATTENTE", color: "#55b7ff", message: "JARVIS attend une mission." },
  listening: { label: "À L’ÉCOUTE", color: "#55f1e5", message: "Canal de commande vocal et texte ouvert." },
  investigating: { label: "ENQUÊTE NEXUS", color: "#55f1e5", message: "Les Avengers isolent les preuves dans la pull request." },
  commented: { label: "CONTRE-ATTAQUE DÉPLOYÉE", color: "#ff6f70", message: "JARVIS a confirmé la publication des commentaires de revue." },
  resolved: { label: "MISSION ACCOMPLIE", color: "#7af0b3", message: "Le fil vérifié est résolu. L’incursion est contenue." },
  error: { label: "INTERRUPTION DU LIEN", color: "#ff5f6d", message: "JARVIS n’a pas pu terminer l’opération. Consulte le journal." }
};
const AGENT_DEFAULTS = [
  ["Iron Man", "Diff Analyst"],
  ["Black Widow & Doctor Strange", "Security & Impact"],
  ["Hulk", "Test Reviewer"]
];

const el = (id) => document.getElementById(id);
const ui = {
  canvas: el("jarvis-canvas"), phase: el("jarvis-phase"), message: el("jarvis-message"), link: el("link-status"), linkWrap: document.querySelector(".live-link-status"), linkReading: el("link-reading"), arc: el("arc-reading"),
  missionName: el("mission-name"), missionDetail: el("mission-detail"), missionPr: el("mission-pr-link"), agents: el("agent-activity"), badge: el("operation-badge"),
  form: el("command-form"), input: el("command-input"), send: el("send-command"), mic: el("mic-button"), voice: el("voice-toggle"), hint: el("command-hint"), log: el("event-log"), clear: el("clear-log")
};

let report = null;
let relayOnline = false;
let operation = null;
let activeEventSource = null;
let voiceEnabled = true;
let recognition = null;
let robot = null;

function now() {
  return new Intl.DateTimeFormat("en-GB", { hour: "2-digit", minute: "2-digit", second: "2-digit" }).format(new Date());
}

function log(message, state = "intel") {
  const item = document.createElement("li");
  item.dataset.state = state;
  item.innerHTML = `<time>${now()}</time><span>${escapeHtml(message)}</span>`;
  ui.log.prepend(item);
  while (ui.log.children.length > 24) ui.log.lastElementChild.remove();
}

function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>'"]/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" }[char]));
}

function setPhase(phase, message) {
  const detail = PHASES[phase] || PHASES.idle;
  document.body.dataset.jarvisPhase = phase;
  ui.phase.textContent = detail.label;
  ui.message.textContent = message || detail.message;
  ui.badge.textContent = stateLabel(phase);
  ui.badge.dataset.state = phase;
  robot?.setState(phase, detail.color);
}

function stateLabel(state) {
  return ({ idle: "en attente", listening: "à l’écoute", investigating: "enquête", complete: "terminé", commented: "publié", resolved: "résolu", error: "erreur" }[state] || String(state || "en attente").replaceAll("_", " "));
}

function setRelayStatus(online) {
  relayOnline = online;
  ui.linkWrap.dataset.linkState = online ? "online" : "offline";
  ui.link.textContent = online ? "LIEN LOCAL JARVIS EN LIGNE" : "LIEN LOCAL HORS LIGNE · RELAIS CODEX PRÊT";
  ui.linkReading.textContent = online ? "EN LIGNE" : "HORS LIGNE";
  ui.send.textContent = online ? "Envoyer à JARVIS" : "Copier pour Codex";
}

function renderReport(data) {
  report = data;
  const mission = data?.mission || {};
  const pr = data?.pullRequest || {};
  ui.missionName.textContent = mission.label || "Aucune mission active";
  ui.missionDetail.textContent = mission.summary || "JARVIS n’a pas encore de rapport de mission public.";
  ui.missionPr.href = pr.url || "index.html";
  ui.missionPr.textContent = pr.number ? `Ouvrir la PR #${pr.number} ↗` : "Ouvrir le centre de commandement ↗";
  renderAgents(data?.agents || []);
  const live = data?.liveMonitor || {};
  if (!operation && live.phase && PHASES[live.phase]) setPhase(live.phase, live.lastAgentMessage);
}

function renderAgents(rawAgents) {
  const agents = rawAgents.length ? rawAgents : AGENT_DEFAULTS.map(([name, role]) => ({ name, role, status: "idle", summary: "En attente." }));
  ui.agents.replaceChildren(...agents.map((agent) => {
    const node = el("activity-template").content.firstElementChild.cloneNode(true);
    node.querySelector("strong").textContent = agent.name;
    node.querySelector("small").textContent = agent.summary || agent.role || "En attente.";
    const badge = node.querySelector(".badge");
    badge.textContent = stateLabel(agent.status);
    badge.dataset.state = agent.status || "idle";
    node.dataset.state = agent.status || "idle";
    return node;
  }));
}

async function loadPublicReport(silent = false) {
  try {
    const response = await fetch(`${PUBLIC_REPORT_URL}?t=${Date.now()}`, { cache: "no-store" });
    if (!response.ok) throw new Error(`Rapport public indisponible (${response.status})`);
    renderReport(await response.json());
    if (!silent) log("Rapport public du S.H.I.E.L.D. synchronisé.");
  } catch (error) {
    if (!silent) log(error.message, "error");
  }
}

async function checkRelay() {
  try {
    const response = await fetch(`${RELAY_ORIGIN}/health`, { cache: "no-store", signal: AbortSignal.timeout(1800) });
    if (!response.ok) throw new Error("health check failed");
    setRelayStatus(true);
    if (!operation) setPhase(report?.liveMonitor?.phase || report?.mission?.status || "idle");
  } catch {
    setRelayStatus(false);
    if (!operation) setPhase("idle", "Relay local indisponible. La commande peut être copiée vers Codex.");
  }
}

function commandFromInput(text) {
  const input = text.trim();
  const prMatch = input.match(/(?:pr|pull request|merge request)\s*(?:#|number |numéro )?(\d+)/i);
  const threadMatch = input.match(/(?:thread|fil)\s*(?:#|id )?([A-Za-z0-9_:-]+)/i);
  const prNumber = Number(prMatch?.[1] || report?.pullRequest?.number);
  const lower = input.toLowerCase();
  if (/\b(status|statut|remain|reste|remaining|what)\b/.test(lower)) return { type: "status", prNumber };
  if (/\b(resolve|résous|resoudre|résoudre|verify|vérifie)\b/.test(lower)) return threadMatch ? { type: "resolve", prNumber, threadId: threadMatch[1] } : { error: "Indique l’identifiant GitHub exact du fil à résoudre." };
  if (/\b(publish|post|publie|poster|comment)\b/.test(lower)) return { type: "publish", prNumber };
  if (/\b(investigate|analyse|analyze|enquête|enquete|review)\b/.test(lower)) return { type: "investigate", prNumber };
  return { error: "Je comprends uniquement les commandes enquête, publication, résolution ou statut." };
}

function displayCommand(command) {
  if (command.type === "investigate") return `JARVIS, enquête sur la PR #${command.prNumber}.`;
  if (command.type === "publish") return `JARVIS, publie les constats approuvés sur la PR #${command.prNumber}.`;
  if (command.type === "resolve") return `JARVIS, résous le thread ${command.threadId} après vérification.`;
  return "JARVIS, what remains before this pull request can merge?";
}

function codexPrompt(command) {
  const base = displayCommand(command);
  return `${base}\n\nRespecte AGENTS.md et JARVIS_PLAYBOOK.md. Utilise GitHub MCP pour toute lecture ou écriture. ${command.type === "investigate" ? "Délègue les analyses en lecture seule et ne publie aucun commentaire." : "L’opérateur a donné une autorisation permanente pour cette action structurée."}`;
}

async function copyFallback(command) {
  const prompt = codexPrompt(command);
  try {
    await navigator.clipboard.writeText(prompt);
    log("Lien local indisponible : commande sécurisée copiée pour Codex.", "warning");
    setPhase("listening", "Commande prête. Colle-la dans Codex pour exécuter l’opération MCP réelle.");
  } catch {
    ui.input.value = prompt;
    ui.input.select();
    log("Copie indisponible. La commande de relais Codex est sélectionnée dans le champ.", "warning");
  }
}

async function submitCommand(command) {
  if (command.error) { log(command.error, "error"); setPhase("error", command.error); return; }
  if (command.type === "status") {
    await loadPublicReport();
    const summary = report?.summary?.message || "Aucune donnée de mission publique supplémentaire.";
    log(summary); setPhase(report?.liveMonitor?.phase || report?.mission?.status || "idle", summary); return;
  }
  if (!relayOnline) return copyFallback(command);

  setPhase("investigating", `JARVIS a reçu : ${displayCommand(command)}`);
  log(`Envoi du protocole ${command.type} au relay JARVIS local.`);
  try {
    const payload = { type: command.type, pullRequest: command.prNumber };
    if (command.type === "resolve") payload.threadId = command.threadId;
    if (command.type === "publish") {
      payload.findingIds = (report?.findings || []).map((finding, index) => finding.id || `finding-${index + 1}`);
      if (!payload.findingIds.length) throw new Error("Aucun constat public à publier. Lance d’abord une enquête sur la PR.");
    }
    const response = await fetch(`${RELAY_ORIGIN}/v1/commands`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });
    const result = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(result.error || `Le relay a refusé la commande (${response.status})`);
    operation = { id: result.operationId || result.id, command };
    if (!operation.id) throw new Error("Le relay n’a pas renvoyé d’identifiant d’opération.");
    subscribeToOperation(operation.id);
  } catch (error) {
    operation = null;
    log(error.message, "error"); setPhase("error", error.message);
  }
}

function subscribeToOperation(id) {
  activeEventSource?.close();
  activeEventSource = new EventSource(`${RELAY_ORIGIN}/v1/operations/${encodeURIComponent(id)}/events`);
  const receiveEvent = (event) => {
    try { handleOperationEvent(JSON.parse(event.data)); } catch { handleOperationEvent({ message: event.data }); }
  };
  activeEventSource.onmessage = receiveEvent;
  ["created", "phase", "agent", "orchestrator", "complete", "error"].forEach((type) => activeEventSource.addEventListener(type, receiveEvent));
  activeEventSource.onerror = () => {
    activeEventSource?.close();
    if (operation) log("Lien d’événements fermé ; le rapport public continuera à s’actualiser.", "warning");
  };
}

function handleOperationEvent(event) {
  const phase = event.phase || event.state;
  const message = event.message || event.detail || "JARVIS received an operation event.";
  log(message, phase === "error" ? "error" : "intel");
  if (phase && PHASES[phase]) setPhase(phase, message);
  if (Array.isArray(event.agents)) renderAgents(event.agents);
  const isTerminal = ["completed", "complete", "resolved", "commented", "idle", "error"].includes(event.type || phase);
  if (isTerminal) {
    if (voiceEnabled) speak(message);
    activeEventSource?.close(); activeEventSource = null; operation = null;
    loadPublicReport(true);
  }
}

function chooseQuickAction(type) {
  const pr = report?.pullRequest?.number || 1;
  if (type === "resolve") {
    const open = (report?.threads || []).find((thread) => thread.status === "open");
    ui.input.value = open?.id ? `JARVIS, résous le thread ${open.id} après vérification.` : "JARVIS, résous le thread <THREAD_ID> après vérification.";
  } else if (type === "publish") ui.input.value = `JARVIS, publie les constats approuvés sur la PR #${pr}.`;
  else if (type === "status") ui.input.value = "JARVIS, quel est le statut de la mission ?";
  else ui.input.value = `JARVIS, enquête sur la PR #${pr}.`;
  ui.input.focus();
}

function speak(message) {
  if (!("speechSynthesis" in window)) return;
  window.speechSynthesis.cancel();
  const utterance = new SpeechSynthesisUtterance(message);
  utterance.rate = 1.04; utterance.pitch = 0.82; utterance.volume = 0.78;
  window.speechSynthesis.speak(utterance);
}

function setUpVoiceInput() {
  const Recognition = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!Recognition) {
    ui.mic.hidden = true;
    log("La dictée n’est pas prise en charge par ce navigateur. Utilise Chrome récent pour activer le micro.", "warning");
    return;
  }
  recognition = new Recognition(); recognition.lang = "fr-FR"; recognition.interimResults = false; recognition.maxAlternatives = 1;
  recognition.onstart = () => { ui.mic.dataset.active = "true"; setPhase("listening", "JARVIS est à l’écoute."); };
  recognition.onend = () => { delete ui.mic.dataset.active; };
  recognition.onerror = ({ error }) => {
    const messages = {
      "not-allowed": "Accès au microphone refusé. Autorise le micro pour 127.0.0.1 dans Chrome, puis réessaie.",
      "service-not-allowed": "Le service de reconnaissance vocale est bloqué par le navigateur.",
      "audio-capture": "Aucun microphone utilisable n’a été détecté sur cet ordinateur.",
      "network": "Le service de reconnaissance vocale ne peut pas être joint. Vérifie la connexion internet.",
      "no-speech": "JARVIS n’a rien entendu. Réessaie en parlant après l’animation cyan.",
      "aborted": "La dictée a été interrompue. Réessaie.",
      "language-not-supported": "La reconnaissance vocale française n’est pas disponible dans ce navigateur."
    };
    const message = messages[error] || `La dictée a échoué (${error || "erreur inconnue"}).`;
    log(message, "warning");
    setPhase("error", message);
  };
  recognition.onresult = ({ results }) => {
    const transcript = results[0][0].transcript;
    ui.input.value = transcript;
    log("Commande vocale transcrite et envoyée à JARVIS.");
    submitCommand(commandFromInput(transcript));
  };
  ui.mic.addEventListener("click", async () => {
    try {
      if (!navigator.mediaDevices?.getUserMedia) throw new Error("unsupported");
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      stream.getTracks().forEach((track) => track.stop());
      recognition.start();
    } catch (error) {
      const message = error?.name === "NotAllowedError"
        ? "Accès au microphone refusé. Autorise le micro pour 127.0.0.1 dans Chrome, puis réessaie."
        : error?.name === "NotFoundError"
          ? "Aucun microphone utilisable n’a été détecté sur cet ordinateur."
          : "Le microphone ne peut pas être initialisé par ce navigateur.";
      log(message, "warning");
      setPhase("error", message);
    }
  });
}

function createRobot(canvas) {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(34, 1, 0.1, 100); camera.position.set(0, 0.2, 8.4);
  const root = new THREE.Group(); scene.add(root);
  const metal = new THREE.MeshStandardMaterial({ color: 0x172f4a, metalness: 0.92, roughness: 0.25 });
  const darkMetal = new THREE.MeshStandardMaterial({ color: 0x07131f, metalness: 0.85, roughness: 0.34 });
  const glow = new THREE.MeshBasicMaterial({ color: 0x55f1e5, transparent: true, opacity: 0.96 });
  const head = new THREE.Mesh(new THREE.IcosahedronGeometry(1.75, 2), metal); head.scale.set(0.84, 1.05, 0.72); root.add(head);
  const face = new THREE.Mesh(new THREE.BoxGeometry(1.75, 1.95, 0.34), darkMetal); face.position.set(0, -0.04, 1.02); face.rotation.x = -0.05; root.add(face);
  for (const x of [-0.62, 0.62]) {
    const plate = new THREE.Mesh(new THREE.BoxGeometry(0.46, 1.55, 0.4), metal); plate.position.set(x, 0.02, 1.18); plate.rotation.z = x > 0 ? -0.21 : 0.21; root.add(plate);
    const eye = new THREE.Mesh(new THREE.BoxGeometry(0.45, 0.16, 0.08), glow); eye.position.set(x * 0.72, 0.28, 1.4); eye.rotation.z = x > 0 ? -0.08 : 0.08; root.add(eye);
  }
  const jaw = new THREE.Mesh(new THREE.CylinderGeometry(0.58, 0.78, 0.48, 6), metal); jaw.position.set(0, -1.25, 0.82); jaw.rotation.x = Math.PI / 2; root.add(jaw);
  const core = new THREE.Mesh(new THREE.TorusGeometry(0.26, 0.065, 12, 36), glow); core.position.set(0, -0.3, 1.44); root.add(core);
  const ringGroup = new THREE.Group(); root.add(ringGroup);
  [2.35, 2.75].forEach((radius, index) => { const ring = new THREE.Mesh(new THREE.TorusGeometry(radius, 0.016, 8, 72), glow); ring.rotation.x = Math.PI / 2 + index * 0.16; ringGroup.add(ring); });
  const stars = new THREE.BufferGeometry(); const points = new Float32Array(270);
  for (let i = 0; i < points.length; i += 3) { points[i] = (Math.random() - .5) * 11; points[i + 1] = (Math.random() - .5) * 7; points[i + 2] = (Math.random() - .5) * 4 - 2; }
  stars.setAttribute("position", new THREE.BufferAttribute(points, 3));
  const particles = new THREE.Points(stars, new THREE.PointsMaterial({ color: 0x55f1e5, size: 0.035, transparent: true, opacity: .65 })); scene.add(particles);
  scene.add(new THREE.AmbientLight(0x9dcfff, 0.82));
  const key = new THREE.PointLight(0x55f1e5, 18, 12); key.position.set(1.5, 2, 5); scene.add(key);
  const rim = new THREE.PointLight(0x375dff, 10, 10); rim.position.set(-3, -1, 2); scene.add(rim);
  const resize = () => { const { width, height } = canvas.getBoundingClientRect(); renderer.setSize(width, height, false); camera.aspect = width / height; camera.updateProjectionMatrix(); };
  new ResizeObserver(resize).observe(canvas); resize();
  let state = "idle", stateColor = new THREE.Color("#55b7ff"), clock = new THREE.Clock();
  const setState = (next, hex) => { state = next; stateColor.set(hex); glow.color.copy(stateColor); key.color.copy(stateColor); particles.material.color.copy(stateColor); };
  const animate = () => {
    const t = clock.getElapsedTime(); const scanning = state === "investigating";
    root.rotation.y = Math.sin(t * .36) * .16;
    root.rotation.x = Math.sin(t * .42) * .035;
    root.position.y = Math.sin(t * .88) * .08;
    ringGroup.rotation.z += scanning ? .038 : .006;
    ringGroup.rotation.y = Math.sin(t * (scanning ? 2.2 : .7)) * .2;
    const pulse = .75 + Math.sin(t * (scanning ? 5 : 1.5)) * .2;
    core.scale.setScalar(pulse);
    glow.opacity = state === "error" ? .5 + Math.random() * .46 : .74 + Math.sin(t * 2) * .18;
    particles.rotation.y = t * .025;
    renderer.render(scene, camera); requestAnimationFrame(animate);
  };
  animate();
  return { setState };
}

function start() {
  robot = createRobot(ui.canvas);
  ui.form.addEventListener("submit", (event) => { event.preventDefault(); submitCommand(commandFromInput(ui.input.value)); });
  document.querySelectorAll(".quick-action").forEach((button) => button.addEventListener("click", () => chooseQuickAction(button.dataset.command)));
  ui.clear.addEventListener("click", () => ui.log.replaceChildren());
  ui.voice.addEventListener("click", () => { voiceEnabled = !voiceEnabled; ui.voice.setAttribute("aria-pressed", String(voiceEnabled)); ui.voice.dataset.active = String(voiceEnabled); if (voiceEnabled) speak("Canal vocal JARVIS activé."); });
  setUpVoiceInput(); loadPublicReport(true); checkRelay();
  setInterval(() => { loadPublicReport(true); checkRelay(); }, POLL_INTERVAL);
  log("JARVIS Live Monitor initialisé.");
}

start();
