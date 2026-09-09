#!/usr/bin/env bash
# PostToolUse (Bash) hook: roda o drift sweep depois que o graphify reconstrói o grafo.
#
# Não olha o comando — olha o artefato. Dispara quando graphify-out/graph.json foi
# reescrito nos últimos ~3 min E ainda não foi varrido nesta versão (marcador mais
# antigo que o graph.json). Um sweep por rebuild, não por comando. Precisa de
# scripts/drift/ na branch. Nunca bloqueia: `exit 0` sempre. Ver CLAUDE.md.
cat >/dev/null   # drain stdin
root="${CLAUDE_PROJECT_DIR:-.}"
gj="$root/graphify-out/graph.json"
marker="$root/graphify-out/drift/.hook_ran"

[ -f "$root/scripts/drift/__main__.py" ] || exit 0
[ -n "$(find "$gj" -mmin -3 2>/dev/null)" ] || exit 0
[ -f "$marker" ] && [ ! "$gj" -nt "$marker" ] && exit 0   # already swept this build

mkdir -p "$(dirname "$marker")" && touch "$marker"
summary=$(cd "$root" && python -m scripts.drift 2>/dev/null | head -1 | tr -d '"\\')
[ -n "$summary" ] || exit 0

printf '%s' "{\"hookSpecificOutput\":{\"hookEventName\":\"PostToolUse\",\"additionalContext\":\"drift sweep (post-graphify): ${summary}. Ranked findings in DRIFT_REPORT.md; auto-fixable ones are stale docs vs config/settings.py.\"}}"
exit 0
