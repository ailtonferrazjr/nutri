# Nutri

Assistente de alimentacao para uma casa de duas pessoas. Chat-first app que gerencia despensa, listas de compras, receitas e nutricao.

## Stack

- Next.js 16 (App Router) + TypeScript
- Vercel AI SDK (`@ai-sdk/anthropic`, `ai`) com Claude Sonnet 4
- PostgreSQL (Supabase) + Drizzle ORM
- Tailwind CSS 4 + shadcn/ui

## Arquitetura

- `app/chat/page.tsx`: Chat UI principal (useChat hook)
- `app/api/chat/route.ts`: API route com streamText() + tools
- `lib/agent/system-prompt.ts`: Persona de nutricionista
- `lib/agent/tools/`: Tool definitions por dominio (pantry, grocery, mercadona, recipes, meal-plan, profiles, receipts); `index.ts` exporta `agentTools`
- `lib/db/schema.ts`: Schema Drizzle (users, pantry_items, receipts, grocery_lists, etc.)
- `lib/receipts/parser.ts`: Claude Vision para parsear recibos espanhois
- `lib/auth.ts`: HMAC token signing/verification (Edge-compatible)
- `middleware.ts`: Protege todas as rotas, redireciona para `/login`

## Convencoes

- Tools usam Zod schemas
- Idioma default: portugues. Nomes de produtos em espanhol.
- Auth simples com password compartilhado (middleware + cookie HMAC-SHA256)
- Env vars de auth: `AUTH_PASSWORD`, `AUTH_SECRET`

## Commands

```bash
pnpm dev              # Dev server
pnpm db:generate      # Gerar migrations
pnpm db:push          # Push schema pro banco
pnpm db:seed          # Seed com perfis iniciais
pnpm typecheck        # Type check
```

## Acesso direto ao banco (CLI)

```bash
pnpm db:query pantry            # Lista despensa
pnpm db:query users             # Lista usuários
pnpm db:query recipes           # Lista receitas
pnpm db:query grocery           # Lista de compras
pnpm db:query receipt-recent    # Recibos recentes
pnpm db:query "SELECT ..."      # SQL livre
pnpm db:query help              # Ver todas as queries disponíveis
```

Script: `scripts/db-query.ts`. Usa `dotenv` para carregar `.env` automaticamente.

## Git Workflow

- Do not include "Claude Code" in commit messages
- Use conventional commits (be brief and descriptive)
