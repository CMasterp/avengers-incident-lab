# Playbook JARVIS

## Commandes opérateur

```text
JARVIS, enquête sur la PR #<id>.
JARVIS, publie les constats sur la PR #<id>.
JARVIS, résous le thread <id> après vérification.
```

Le relay JARVIS local accepte uniquement ces intentions structurées : `investigate` (numéro de PR), `publish` (numéro de PR) et `resolve` (identifiant de fil). La demande `status` ne fait qu’actualiser le rapport public et n’atteint jamais le relay. Le relay ne doit jamais transmettre du texte navigateur arbitraire comme commande shell ou appel MCP. L’opérateur a donné à JARVIS une autorisation permanente limitée aux actions structurées demandées.

## Contrat de réponse des spécialistes

Retourne un objet JSON contenant un tableau `findings`. Un constat a cette forme :

```json
{
  "hero": "IRON_MAN | BLACK_WIDOW | DOCTOR_STRANGE | HULK",
  "severity": "critical | high | medium | low",
  "title": "Short, actionable finding",
  "description": "Why this matters",
  "file": "relative/path.js",
  "line": 12,
  "confidence": 0.82,
  "evidence": [{
    "type": "pull_request_diff | repository_file | review_thread | issue",
    "url": "https://github.com/owner/repo/...",
    "detail": "Short factual proof"
  }],
  "proposedComment": "A concise review comment, not published yet"
}
```

Ne retourne pas de constat sous `0.5` de confiance. Si aucune preuve n’est disponible, retourne un tableau vide et explique le manque à JARVIS.

## Flux de l’orchestrateur

1. Confirme la PR cible et place `mission.status` et `liveMonitor.phase` à `investigating`. Ajoute un événement public concis identifiant l’opération, jamais son prompt brut.
2. Lance les trois spécialistes en parallèle avec la PR et leur contrat de réponse.
3. Fusionne les constats étayés par des preuves, en conservant URL source et confiance.
4. Écris un rapport avec `phase: idle` : ne crée aucun commentaire tant qu’une commande `publish` n’a pas été demandée.
5. Sur une commande explicite `publish`, publie les commentaires via GitHub MCP et enregistre leurs identifiants et URL de fil réels. Mets alors la phase à `commented`.
6. Sur une commande explicite `resolve`, relis le diff et le fil pertinent, puis résous uniquement le fil demandé. Mets alors la phase à `resolved`.
7. En cas d’échec, mets la phase publique à `error` avec un message court et sûr, sans prétendre au succès.
8. Committe le rapport publiable mis à jour sur `main` via GitHub MCP pour actualiser GitHub Pages.
