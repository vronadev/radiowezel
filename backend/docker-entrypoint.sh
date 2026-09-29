#!/bin/sh
set -eu

cfg_transport=""
cfg_from=""
if [ -f /app/config.json ]; then
  config_values="$(node -e 'const fs=require("fs"); let smtp={}; try { smtp=JSON.parse(fs.readFileSync("/app/config.json","utf8")).smtp||{}; } catch (e) {} function emit(n,v){ if(v==null||v==="") return; const t=String(v); if(/[\r\n]/.test(t)) return; process.stdout.write(n+"="+t+"\n"); } emit("CFG_TRANSPORT", smtp.transport); emit("CFG_FROM", smtp.from); emit("CFG_HOST", smtp.host); emit("CFG_PORT", smtp.port); emit("CFG_SECURE", smtp.secure === true ? "true" : "");')"
  cfg_transport="$(printf '%s\n' "$config_values" | sed -n 's/^CFG_TRANSPORT=//p' | head -n 1)"
  cfg_from="$(printf '%s\n' "$config_values" | sed -n 's/^CFG_FROM=//p' | head -n 1)"
  cfg_host="$(printf '%s\n' "$config_values" | sed -n 's/^CFG_HOST=//p' | head -n 1)"
  cfg_port="$(printf '%s\n' "$config_values" | sed -n 's/^CFG_PORT=//p' | head -n 1)"
  cfg_secure="$(printf '%s\n' "$config_values" | sed -n 's/^CFG_SECURE=//p' | head -n 1)"
fi

transport="${SMTP_TRANSPORT:-$cfg_transport}"
if [ "$transport" = "sendmail" ]; then
  smtp_host="${SMTP_HOST:-${cfg_host:-host.docker.internal}}"
  smtp_port="${SMTP_PORT:-${cfg_port:-25}}"
  smtp_from="${SMTP_FROM:-${cfg_from:-noreply@localhost}}"
  tls_mode=off
  if [ "${SMTP_SECURE:-$cfg_secure}" = "true" ]; then
    tls_mode=on
  fi

  umask 077
  cat >/etc/msmtprc <<EOF
defaults
auth off
tls ${tls_mode}
tls_starttls ${tls_mode}
tls_trust_file /etc/ssl/certs/ca-certificates.crt

account default
host ${smtp_host}
port ${smtp_port}
from ${smtp_from}
EOF
  chmod 600 /etc/msmtprc
fi

exec "$@"
