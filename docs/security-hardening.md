# Security Hardening — AgDash LAN

Complementa o runbook do README (Caddy + HTTPS + Basic Auth). Cobre o que não é
config direta do Caddyfile: rate limit, CSRF, rotação de credenciais, backup,
dependências e monitoramento.

Arquitetura: `Browser → Caddy (443, TLS + Basic Auth) → uvicorn (127.0.0.1:8000)`.
Caddy injeta `X-API-Key` + `Bearer` no upstream; o bundle do frontend não embute token.

---

## 1. Rate limit no Basic Auth (anti brute force)

O `rate_limit` do Caddy **não existe no binário oficial** — é módulo de terceiro.
Precisa de build custom:

```
xcaddy build --with github.com/mholt/caddy-ratelimit
```

Depois, no `infra/Caddyfile`: descomentar `order rate_limit before basic_auth` (bloco
global) e o bloco `rate_limit { zone login { key {remote_host}; events 10; window 1m } }`.

**Mitigação já ativa sem o módulo:** o hash Basic Auth usa bcrypt cost 14
(~0,5–1 s por tentativa). Brute force fica inviável e cada falha vai para o log de
acesso. Suficiente para LAN; o rate_limit é defesa em profundidade.

---

## 2. Security headers

Aplicados pelo Caddy em todas as respostas (ver `header { }` no Caddyfile):
HSTS, `X-Content-Type-Options: nosniff`, `X-Frame-Options: DENY`, `Referrer-Policy`,
CSP, e `-Server` (esconde versão).

**CSP:** `default-src 'self'` com `style-src 'unsafe-inline'` (shadcn/Tailwind),
`img-src data: blob:` (export CSV/charts). O bundle foi auditado: sem `<script>`
inline e sem `eval` → `script-src 'self'` sem `unsafe-eval`. `connect-src 'self'`
**bloqueia de propósito** a telemetria externa (PostHog/Sentry) que vem nas libs.
Se ativar analytics, adicionar os domínios em `connect-src`. Validar no console do
browser no primeiro load real (após `caddy trust`).

---

## 3. CSRF

**Não há cookies de sessão** — auth é Basic Auth (Caddy) + Bearer injetado no
upstream. Logo, não se aplica CSRF clássico de cookie nem `SameSite`.

Vetor residual: Basic Auth é credencial ambiente (o browser reenvia automático ao
host após o login). Um site malicioso pode forçar o browser a mandar request para
o dashboard com a credencial em cache.

- **GET / leitura:** o CORS já bloqueia leitura cross-origin (origin fora da
  whitelist não recebe `Access-Control-Allow-Origin`). Atacante não lê resposta.
- **POST JSON** (ex.: `/admin/indexes/apply`): content-type JSON dispara preflight
  → CORS bloqueia origin não-whitelistada → request nem sai.
- **POST multipart** (`/dashboard/metas/upload`): `multipart/form-data` é
  "simple request", **não** dispara preflight. Um `<form>` cross-origin pode
  submeter com a credencial em cache. Atacante não lê a resposta, mas o efeito
  colateral (regravar o JSON de metas) acontece. Impacto baixo (extractor valida
  o PDF; sem exfiltração), mas é o único furo real.

**Correção recomendada (cirúrgica):** rejeitar no backend POSTs cujo header
`Origin` não esteja na whitelist de CORS. Aplicar nas rotas de efeito colateral.

---

## 4. Rotação de credenciais (API_KEY / API_TOKEN)

O backend hoje valida **um** par. Rotação com restart curto:

1. Gerar nova `API_KEY` / `API_TOKEN`.
2. Atualizar `.env` do backend **e** as variáveis `AGECOB_API_KEY`/`AGECOB_API_TOKEN`
   do Caddy.
3. `caddy reload --config infra/Caddyfile` (zero downtime no Caddy).
4. Reiniciar uvicorn (NSSM restart) — janela de segundos.

**Zero downtime real** exige o backend aceitar dois pares durante a transição
(antigo + novo) — pequena mudança em `api/dependencias.py:require_auth`. Sob
demanda. A senha do Basic Auth gira sozinha: novo hash no Caddyfile + `caddy reload`.

---

## 5. Backup e recovery

Versionar (Git): `infra/Caddyfile`. **Nunca** versionar: `.env`, hash de senha real,
chaves privadas, a CA do Caddy.

Backup obrigatório (fora do Git, lugar seguro):
- `.env` do backend (`copy .env .env.bak`, já no README).
- **CA interna do Caddy**: pasta de dados
  `%LOCALAPPDATA%\Caddy\pki\authorities\local\` (ou `XDG_DATA_HOME/caddy/pki/...`).
  Contém `root.crt` + `root.key`. **Se perder a CA**, todo cert TLS fica inválido e
  é preciso `caddy trust` de novo em todos os clientes. Backupar root.key resolve.
- Hash do Basic Auth (cofre de senhas).

---

## 6. Dependency scanning

Sem CI no projeto. Rodar a cada release:

```cmd
cd agecob-lens && npm audit --omit=dev          REM frontend
python -m pip_audit -r requirements.txt          REM backend (precisa ensurepip ok)
```

Estado auditado (2026-06-23):

- **Frontend:** 11 moderate — `dompurify` (XSS, `IN_PLACE`), `protobufjs`,
  `@opentelemetry` (transitivos de PostHog/Sentry). `npm audit fix` disponível.
- **Backend (env instalado):** `python-multipart 0.0.20` e `starlette 0.44.0` com
  DoS de multipart (afeta `/metas/upload`); `urllib3 1.26.20`, `requests 2.32.4`,
  `cryptography 36.0.2` desatualizados. Conferir contra pins do `requirements.txt`
  e subir versão. Priorizar multipart/starlette (superfície de upload).

> `pip-audit -r` cria venv e exige `ensurepip` funcional. Se falhar, auditar o env
> instalado: `python -m pip_audit`.

---

## 7. Monitoramento

- **Log de acesso do Caddy:** JSON em `logs/caddy-access.log` (rotação 10 MiB × 10).
  Registra Basic Auth falho. Criar a pasta `logs/` antes de subir.
- **Health do backend:** já existe `GET /health/db`. Caddy pode fazer health check
  passivo (`fail_duration`) no `reverse_proxy`. Evitar health **ativo** em
  `/health/db` (cada check conecta no SQL Server). Para liveness barato, usar `GET /`.
- **Caddy caiu, quem avisa?** Rodar Caddy como serviço (NSSM, igual ao uvicorn) com
  restart automático; alertar via monitor externo batendo em `https://<host>/`.
