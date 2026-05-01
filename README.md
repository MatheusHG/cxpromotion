# cx-promocoes

Dashboard interno para o time de CX consultar estatísticas de promoções (PRAGMATIC, SOFTSWISS, AVIATOR) no banco `majorsports` (ClickHouse) e o histórico individual de usuários.

## Stack

- **Backend**: Node.js + Express + TypeScript, JWT auth, Postgres (atendentes), `@clickhouse/client` (analytics)
- **Frontend**: React + Vite + TypeScript + shadcn/ui (Tailwind) + React Query + Zustand

## Estrutura

```
cx-promocoes/
├── backend/    API REST (porta 4000)
└── frontend/   SPA (porta 5173, com proxy /api → 4000)
```

## Setup

### 1. Postgres

Crie o banco e o usuário (se ainda não tiver):

```bash
createdb cx_promocoes
```

### 2. Backend

```bash
cd backend
cp .env.example .env
# Edite .env com:
#   - JWT_SECRET (string aleatória longa)
#   - PG_HOST/PG_USER/PG_PASSWORD/PG_DATABASE
#   - CLICKHOUSE_URL/CLICKHOUSE_USER/CLICKHOUSE_PASSWORD

npm install
npm run migrate    # cria tabela cx_users
npm run seed       # cria admin admin@jbd / admin123
npm run dev        # http://localhost:4000
```

### 3. Frontend

```bash
cd frontend
npm install
npm run dev        # http://localhost:5173
```

Acesse http://localhost:5173, faça login com `admin@jbd / admin123` e **troque a senha imediatamente** em "Atendentes" → editar próprio usuário.

## Funcionalidades

### Dashboard (`/dashboard`)
- Cards de resumo por provider (resgates, usuários únicos, ganhos, valor)
- Tabelas de promoções por provider (drill-down) — colunas e métricas adaptadas a cada um
- Filtro de período (data início/fim)

### Buscar usuário (`/user-search`)
- Input do `to_id` + período
- Histórico unificado das 3 plataformas: cada linha = 1 promoção (com provider, dados da promo, resgates, giros/ganhos/perdas, valor)
- Total agregado no topo

### Atendentes (`/users`, só admin)
- CRUD completo (listar / criar / editar / desativar / deletar)
- Senhas hashadas com bcrypt
- Roles: `admin` (acesso total) e `operador` (sem acesso a /users)

## Mecânicas de cada provider (resumo)

A lógica de classificação dos eventos é diferente por provider — embedida em `backend/src/routes/promotions.ts` e `user-search.ts`.

| | PRAGMATIC | SOFTSWISS | AVIATOR |
|---|---|---|---|
| Resgate | `context_identifier != ''`, type=DEBIT | mesmo | mesmo |
| Giros individuais | type=DEBIT, prefix `bonusCode:` | ❌ não logados | type=CREDIT, prefix `reason:FREEBET_*` |
| Ganhos | type=CREDIT, prefix `bonusCode:` | 1 CREDIT agregado, prefix `issueId:` | reason=`FREEBET_WIN` |
| Linking resgate↔giros | bonus_code (info_extra_info) ↔ resgate.info_bet_id | mesmo info_bet_id | sem mapeamento direto — usa ASOF JOIN temporal |

Datas: o ClickHouse armazena tudo em UTC com offset de +3h da realidade. **Sempre** aplicamos `(date - INTERVAL 3 HOUR)` em filtros e exibições.

Filtros padrão: `info_is_test = false` em todas as queries (descarta contas de teste).

## API endpoints

Todos requerem `Authorization: Bearer <token>`.

```
POST  /api/auth/login                            { email, password } → { token, user }
GET   /api/auth/me

GET   /api/users                                 (admin)
POST  /api/users                                 (admin)
PUT   /api/users/:id                             (admin)
DELETE /api/users/:id                            (admin)

GET   /api/promotions/overview?start_date&end_date
GET   /api/promotions/pragmatic?start_date&end_date
GET   /api/promotions/softswiss?start_date&end_date
GET   /api/promotions/aviator?start_date&end_date

GET   /api/user-search?user_id&start_date&end_date
```

Datas no formato `YYYY-MM-DD HH:MM:SS` (já no horário "real" — o backend não aplica offset adicional).

## Próximos passos sugeridos

- Substituir as senhas hardcoded do seed antes de subir em qualquer ambiente compartilhado
- Adicionar logging estruturado (pino/winston)
- Cache em Redis para os endpoints de overview/promotions (queries pesadas no ClickHouse)
- Exportar resultados em CSV/Excel
- Métricas adicionais: ROI, taxa de utilização, abuso (usuários que resgatam muito e jogam pouco)
