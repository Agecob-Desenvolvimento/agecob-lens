# Deploy LAN — runbook de robustez

Itens operacionais para o AgDash na rede local. Rodar **no servidor** (`C:\agecob`), não dá pra automatizar daqui (produção, porta 8000).

---

## 1. IP fixo — Reserva de DHCP (não hardcodar)

Não fixe `192.168.x.x` em código. Reserve o IP no roteador pelo MAC do servidor.

1. Descobrir o MAC do servidor:
   ```powershell
   Get-NetAdapter | Where-Object Status -eq 'Up' | Select-Object Name, MacAddress
   ```
2. Painel do roteador → **DHCP** → **Address Reservation / Static Lease** → associar o MAC ao IP desejado.
3. Reiniciar o roteador: IP do servidor nunca mais muda.

## 2. Acesso por nome (sem mDNS extra)

Servidor é Windows → máquinas Windows da LAN já resolvem pelo **nome do computador** via LLMNR/NetBIOS. Geralmente já funciona hoje:

```
http://NOME-DO-SERVIDOR:8000
```

Ver o nome:
```powershell
hostname
```

Só instalar mDNS/Bonjour (`dashboard.local`) se houver clientes não-Windows (Linux/Mac/celular) que não resolvem o nome. Alternativa central: cadastrar o nome no DNS local do roteador.

## 3. Logs persistentes (NSSM → arquivo)

Hoje stdout/stderr do serviço somem. Redirecionar pra arquivo rotacionado:

```cmd
mkdir C:\agecob\logs
C:\nssm\win64\nssm.exe set AgecobAPI AppStdout C:\agecob\logs\out.log
C:\nssm\win64\nssm.exe set AgecobAPI AppStderr C:\agecob\logs\err.log
C:\nssm\win64\nssm.exe set AgecobAPI AppStdoutCreationDisposition 4
C:\nssm\win64\nssm.exe set AgecobAPI AppStderrCreationDisposition 4
C:\nssm\win64\nssm.exe set AgecobAPI AppRotateFiles 1
C:\nssm\win64\nssm.exe set AgecobAPI AppRotateBytes 10485760
C:\nssm\win64\nssm.exe restart AgecobAPI
```

Rotaciona a cada 10 MB. Logs em `C:\agecob\logs\`.

## 4. Heartbeat — Uptime Kuma → Telegram

`/health/db` já existe; ninguém vigia. Monitor externo bate no endpoint e avisa se cair.

**Ferramenta:** Uptime Kuma (não "Kiosk"). Roda em qualquer máquina da LAN (até um Raspberry Pi) — não no mesmo servidor, senão cai junto.

Setup rápido (numa máquina com Docker):
```bash
docker run -d --restart=always -p 3001:3001 -v uptime-kuma:/app/data --name uptime-kuma louislam/uptime-kuma:1
```

Na UI (`http://<host-monitor>:3001`):
1. **Add New Monitor** → tipo **HTTP(s)**.
2. URL: `http://NOME-DO-SERVIDOR:8000/health/db` — repetir para `/health/db/COBwebRCBAUTOS` e `/health/db/COBwebRCBCONSUMER`.
3. Heartbeat Interval: 60s. **Accepted Status Codes:** 200.
4. **Notifications** → adicionar **Telegram** (bot token + chat id) ou e-mail → atribuir aos 3 monitores.

Cai o banco ou o serviço → alerta no Telegram em ~1 min.

---

## Resumo de prioridade

| # | Item | Esforço | Ganho |
|---|---|---|---|
| 1 | Reserva DHCP | 5 min | Mata o drift de IP |
| 2 | Acesso por nome | 0–5 min | Provável já funciona |
| 3 | NSSM logs em arquivo | 5 min | Diagnóstico pós-queda |
| 4 | Uptime Kuma + Telegram | 20 min | Sabe que caiu **antes** de precisar |
