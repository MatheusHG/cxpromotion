# Deploy no Coolify

Dois Apps dentro do **mesmo Project** (pra compartilhar rede Docker com o PG):

```
Project: cx-promocoes
├── postgresql-database-jrn1si4n9wg1v86pzckpffd4   (já existe)
├── cx-promocoes-backend                            (criar)
└── cx-promocoes-frontend                           (criar)
```

## 1. Backend

**New Application** → escolhe a fonte:
- Public Git Repository: cole a URL do seu repo
- Build pack: **Dockerfile**
- Base directory: `/backend`
- Dockerfile location: `Dockerfile`
- Port (container): `4000`

### Environment Variables (Coolify UI)

| Var | Valor |
|---|---|
| `NODE_ENV` | `production` |
| `PORT` | `4000` |
| `JWT_SECRET` | uma string aleatória longa (ex.: `openssl rand -hex 64`) |
| `JWT_EXPIRES_IN` | `8h` |
| `PG_HOST` | `postgresql-database-jrn1si4n9wg1v86pzckpffd4` |
| `PG_PORT` | `5432` |
| `PG_USER` | `postgres` |
| `PG_PASSWORD` | a senha do banco |
| `PG_DATABASE` | `postgres` |
| `PG_SSL` | `false` (rede interna não precisa de SSL) |
| `CLICKHOUSE_URL` | seu cluster CH |
| `CLICKHOUSE_USER` | `default` |
| `CLICKHOUSE_PASSWORD` | senha do CH |
| `XTREMEPUSH_REGION` | `us` |
| `XTREMEPUSH_API_TOKEN` | seu token XP |
| `FRONTEND_ORIGIN` | URL do front (ex.: `https://cx-promocoes.jbd.com`) |

### Domain
- Pode deixar **sem domain público** se quiser que só o frontend acesse (mais seguro)
- Ou expõe em `https://api-cx-promocoes.jbd.com` se preferir separado

### Primeiro deploy
1. Salva e dá **Deploy**. Aguarda subir saudável (`/api/health` retorna `{ok:true}`)
2. **Migrate** e **seed** rodam automaticamente em todo start do container (entrypoint),
   então não precisa abrir terminal — basta esperar o container subir.
   - Migrate é idempotente (`CREATE TABLE IF NOT EXISTS`)
   - Seed só insere o admin se ele ainda não existir
3. **Loga no front com admin@jbd / admin123 e troca a senha imediatamente**

## 2. Frontend

**New Application**:
- Build pack: **Dockerfile**
- Base directory: `/frontend`
- Dockerfile location: `Dockerfile`
- Port (container): `80`

### Environment Variables

| Var | Valor |
|---|---|
| `BACKEND_HOST` | `cx-promocoes-backend` (nome do serviço backend na rede Coolify) |
| `BACKEND_PORT` | `4000` |

### Domain
- Define o domínio público, ex.: `https://cx-promocoes.jbd.com`
- Esse mesmo domínio vai pro `FRONTEND_ORIGIN` do backend (CORS)

### Como funciona o proxy

O nginx do frontend serve o SPA na raiz e **encaminha `/api/*` pro backend** via DNS interno do Docker (`http://cx-promocoes-backend:4000`). Isso significa:
- Browser sempre fala com o domínio do front
- Backend não precisa CORS configurado nem domínio público
- Tudo trafega na rede privada do Coolify

## 3. Smoke test

```bash
# Health do backend (via proxy do front)
curl https://cx-promocoes.jbd.com/api/health
# → {"ok":true}

# Login
curl -X POST https://cx-promocoes.jbd.com/api/auth/login \
  -H 'Content-Type: application/json' \
  -d '{"email":"admin@jbd","password":"admin123"}'
# → {"token":"...","user":{...}}
```

## 4. Trocar a senha do admin (CRÍTICO)

Faz login na UI com `admin@jbd / admin123`, vai em **Atendentes**, edita seu próprio usuário, define uma senha forte. Depois disso já dá pra criar contas pros outros atendentes.

## 5. Variáveis sensíveis na próxima rotação

A senha do PG e o `XTREMEPUSH_API_TOKEN` foram compartilhados em chat — recomendo:
1. Gerar uma nova senha do PG no painel do provedor (Coolify pode ter botão de rotate)
2. Atualizar `PG_PASSWORD` no app backend e dar redeploy
3. Idem pro `XTREMEPUSH_API_TOKEN` se for o caso
