#!/usr/bin/env bash
# PreToolUse (Bash): force a confirmation prompt on network-mutating commands.
#
# Why: a `netsh` call from an agent session once took down the DHCP gateway on the
# print server and killed remote access to this host. Network changes here hit
# shared infra, not just this project. This guard does not block — it downgrades
# the command to "ask" so a human sees the exact scope before it runs.
input=$(cat)

# Prefer the parsed command string; fall back to the raw payload so a parse miss
# still errs toward asking.
cmd=$(printf '%s' "$input" | grep -oE '"command"[[:space:]]*:[[:space:]]*"([^"\\]|\\.)*"' | head -1)
[ -z "$cmd" ] && cmd="$input"

printf '%s' "$cmd" | grep -qiE 'netsh|ipconfig[^"]*/(release|renew)|(^|[^[:alnum:]])route[[:space:]]+(add|delete|change)|(^|[^[:alnum:]])arp[[:space:]]+-d|netcfg|(Disable|Set|Restart|Remove|New)-Net(Adapter|IPAddress|Route|FirewallRule|IPInterface|ConnectionProfile)|Set-DnsClientServerAddress|(^|[^[:alnum:]])net[[:space:]]+(stop|start)[[:space:]]' || exit 0

printf '%s' '{"hookSpecificOutput":{"hookEventName":"PreToolUse","permissionDecision":"ask","permissionDecisionReason":"Network-mutating command detected (netsh / ipconfig release|renew / route / arp -d / Net* cmdlet / net stop|start). A previous netsh call on this host took down the print-server DHCP gateway and killed remote access. State the exact adapter and scope, then confirm before running."}}'
