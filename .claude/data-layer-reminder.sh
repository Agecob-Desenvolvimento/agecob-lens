#!/usr/bin/env bash
# PreToolUse hook: lembra leitura obrigatória de data-layer.md ao editar código de dados.
# Não bloqueia — injeta additionalContext. Ver CLAUDE.md / AGENTS.md / ADR.
input=$(cat)
fp=$(printf '%s' "$input" | grep -oE '"file_path"[ ]*:[ ]*"[^"]*"' | head -1 | sed -E 's/.*"file_path"[ ]*:[ ]*"([^"]*)".*/\1/' | sed 's#\\#/#g')
case "$fp" in
  *services/api*|*ViewModel*|*useProdutividadeData*|*selectors/*|*lib/metrics*|*transforms/*|*dominios/*|*core/database*)
    printf '%s' '{"hookSpecificOutput":{"hookEventName":"PreToolUse","additionalContext":"MANDATORY DATA-LAYER READ: this edit touches the data layer (fetching/ViewModel/selector/metrics/adapter/backend data). Read agecob-lens/docs/data-layer.md IN FULL before editing, per CLAUDE.md and AGENTS.md."}}'
    ;;
esac
