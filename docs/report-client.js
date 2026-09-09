export const REPOSITORY = "CMasterp/avengers-incident-lab";

const apiReportUrl = `https://api.github.com/repos/${REPOSITORY}/contents/docs/mission-report.json?ref=main`;
const rawReportUrl = `https://raw.githubusercontent.com/${REPOSITORY}/main/docs/mission-report.json`;
const localReportUrl = "./mission-report.json";

function decodeGitHubContent(content) {
  const binary = atob(content.replace(/\n/g, ""));
  const bytes = Uint8Array.from(binary, (character) => character.charCodeAt(0));
  return JSON.parse(new TextDecoder().decode(bytes));
}

/**
 * Reads the public mission report without requiring browser credentials.
 * GitHub Pages uses the raw copy first; local previews use the adjacent file.
 */
export async function fetchMissionReport({ forceLocal = false } = {}) {
  const isLocalPreview = forceLocal || location.protocol === "file:" || ["localhost", "127.0.0.1"].includes(location.hostname);
  const sources = isLocalPreview
    ? [{ url: localReportUrl, kind: "local" }]
    : [
        { url: apiReportUrl, kind: "github-content" },
        { url: rawReportUrl, kind: "raw" },
        { url: localReportUrl, kind: "local" }
      ];
  let lastError;

  for (const source of sources) {
    try {
      const separator = source.url.includes("?") ? "&" : "?";
      const response = await fetch(`${source.url}${separator}cache=${Date.now()}`, { cache: "no-store" });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const payload = await response.json();
      return {
        report: source.kind === "github-content" ? decodeGitHubContent(payload.content) : payload,
        source: source.kind
      };
    } catch (error) {
      lastError = error;
    }
  }

  throw lastError ?? new Error("Impossible de charger le rapport de mission");
}

export function sourceLabel(source) {
  if (source === "github-content") return "RENSEIGNEMENTS GITHUB EN DIRECT";
  if (source === "raw") return "RENSEIGNEMENTS BRUTS EN DIRECT";
  return "REPLI DE RENSEIGNEMENTS LOCAL";
}
