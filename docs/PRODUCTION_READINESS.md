# LoteDiretor — Production Readiness

Atualizado em 2026-09-19.

## Estado operacional comprovado

- VM com 6 vCPU e 7,8 GiB de RAM, sem pressão relevante de CPU/memória.
- volume raiz expandido de 29 GiB para 49 GiB; 9 GiB permanecem livres no VG LVM.
- Docker/PostGIS/MinIO/NATS/Valkey/Martin/API/workers operacionais.
- frontend supervisionado por `lotediretor-web.service`; processos ad hoc via `zola.pid`/nohup não fazem parte do modelo de produção.
- backup lógico diário de PostgreSQL + MinIO por `lotediretor-backup.timer`, com SHA-256 e retenção local padrão de 14 dias.
- source health real executado periodicamente por `lotediretor-source-health.timer`.
- gate operacional a cada 10 minutos por `lotediretor-operations-health.timer`, cobrindo web/API, espaço em disco, jobs travados e fontes quebradas.
- UFW ativo: entrada negada por padrão; SSH e web permitidos apenas para a rede privada `10.10.10.0/24`.
- SSH com X11 desabilitado, `MaxAuthTries=3` e `LoginGraceTime=30`.
- Node.js 22 LTS validado no frontend completo; Platform v2 usa Node.js 22.
- Platform v2 com audit de dependências de produção sem advisories após atualização do Fastify.
- Dependabot e CodeQL configurados no repositório.

## Restrições antes de produção pública

Os itens abaixo não devem ser declarados concluídos sem dependências externas correspondentes:

1. **Credenciais:** PostgreSQL e MinIO ainda usam as credenciais históricas de desenvolvimento. A rotação precisa ser feita de forma coordenada no banco/MinIO e no arquivo privado `platform-v2/.env`.
2. **SSH:** `PasswordAuthentication` permanece habilitado porque o usuário operacional ainda não possui chave pública instalada e validada. Instalar/testar a chave antes de desabilitar senha.
3. **TLS/domínio:** não existe domínio definitivo fornecido para esta VM. O Caddy atual é somente edge local/dev.
4. **Backup off-site:** os backups atuais residem na própria VM. Configurar destino externo/snapshot do provedor e executar restore rehearsal completo fora do volume de produção.
5. **Proteção de branch:** `main` deve exigir CI, Platform v2 foundation/API e CodeQL antes de merge, além de bloquear force-push.
6. **IAM/tenant:** Keycloak/OIDC, tenant context e RLS ainda não estão implementados no produto.
7. **Alertas externos:** timers detectam falhas localmente; falta canal externo de paging/notification.
8. **Frontend legado:** advisories remanescentes de alta severidade ficam restritos ao toolchain transitive antigo (glob/minimatch/brace-expansion/json5). A eliminação completa depende da modernização/migração do toolchain Ember; não forçar majors transitive sem regressão completa.

## Backup e restore

Backup manual:

```bash
sudo ./scripts/backup-platform-v2.sh
```

Verificação:

```bash
sudo ./scripts/verify-platform-v2-backup.sh /srv/lotediretor-backups/<timestamp>
```

O dump PostgreSQL usa formato custom (`pg_dump -Fc`) e inclui uma listagem validável por `pg_restore -l`. MinIO é espelhado logicamente por bucket.

Um restore rehearsal destrutivo não deve usar o banco de produção. Executar em PostgreSQL descartável/staging e comparar contagens/hashes antes de considerar o procedimento de DR certificado.

## Deploy

O caminho suportado é:

```bash
./scripts/deploy-production.sh
```

O script faz backup, promove Platform v2 (build/migrations/bootstrap/API/workers), gera o bundle web, reinstala/reinicia o serviço systemd e executa health/smoke.

## Source health

`core.source_registry.ingestion_status` não é mais atualizado pelo seed como se fosse health. O checker real mantém:

- `ingestion_status`
- `last_checked_at`
- `last_success_at`
- `health_error`
- `stale_after`

Endpoints que exigem parâmetros ou POST são classificados como `manual` quando não existe probe GET seguro.

## Critério para produção pública

Somente classificar a VM como produção pública depois de credenciais rotacionadas, SSH por chave, TLS/domínio, backup off-site com restore testado, proteção de branch e monitoramento externo.
