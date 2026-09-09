#!/usr/bin/env bash
# PreToolUse (Bash): reminder to verify the real schema before any analytical claim.
#
# Why: repeated incidents came from inferring column names and status-code maps
# from nearby code instead of the source of truth. Non-blocking — injects context.
input=$(cat)

printf '%s' "$input" | grep -qiE 'sqlcmd|INFORMATION_SCHEMA|sys\.(columns|tables|objects)|pyodbc|run_query|SELECT[[:space:]].+FROM' || exit 0

printf '%s' '{"hookSpecificOutput":{"hookEventName":"PreToolUse","additionalContext":"SCHEMA-CLAIM GUARD: before asserting any column name, ID_REC_STATUS / status-code set, or metric formula, confirm it against docs/DICIONARIO-DE-DADOS.md (real schema) and agecob-lens/docs/data-layer.md (business rules). Do NOT infer column names or code maps from surrounding code — past incidents came from exactly that."}}'
