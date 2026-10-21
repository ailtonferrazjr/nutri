---
name: generate-recipes
description: Gera sugestões de receitas personalizadas e insere no pool do /descobrir. Usa despensa, perfis e preferências reais.
user_invocable: true
---

# Gerar Receitas para o Pool de Sugestões

Gera receitas curadas para a página /descobrir do Nutri, inserindo diretamente na tabela `recipe_suggestions`.

## Argumentos (opcionais)

O user pode passar argumentos após `/generate-recipes`:
- Tipo de refeição: `café`, `almoço`, `lanche`, `jantar`, ou `todos` (default: todos)
- Quantidade: número de receitas por tipo (default: 5)
- Tema/estilo: ex: "japonesa", "comfort food", "meal prep", "rápidas <15min"
- Restrição extra: ex: "sem frango", "low carb"

Exemplos:
- `/generate-recipes` → gera 5 por tipo, variadas
- `/generate-recipes jantar 3` → 3 receitas de jantar
- `/generate-recipes almoço meal prep` → 5 almoços focados em meal prep
- `/generate-recipes café low carb 3` → 3 cafés da manhã low carb

## Contexto obrigatório

ANTES de gerar receitas, SEMPRE:

1. **Ler a despensa atual**: `pnpm db:query pantry`
2. **Ler receitas existentes**: `pnpm db:query recipes` (pra não repetir)
3. **Ler sugestões atuais no pool**: `pnpm db:query "SELECT name, meal_type FROM recipe_suggestions WHERE used = false"`
4. **Ler os perfis da casa**: `pnpm db:query users` (restrições, preferências e metas de cada pessoa)
5. **Ler feedbacks recentes**: `pnpm db:query "SELECT recipe_name, action, reason, detail FROM recipe_feedback ORDER BY created_at DESC LIMIT 30"`
   - Feedbacks mostram o que foi rejeitado e por quê
   - Ingredientes em `detail` de `bad_ingredient` → NÃO usar
   - Receitas favoritadas → gerar mais do mesmo estilo
   - Alterações frequentes → ajustar (ex: "mais rápida" = preferem <20min)
6. **Considerar rodar `/process-feedback` antes** se houver feedbacks não-processados

## Perfis

Os perfis vêm do banco (tabela `users`), nunca hardcoded aqui. Para cada pessoa, considerar:
- `restrictions`: absolutas, nenhuma receita pode violar
- `preferences`: likes, dislikes, cuisines, mealTiming, notes
- `health_goals`: metas que orientam as sugestões

Contexto fixo da casa: um casal morando na Espanha, compra no Mercadona, usa airfryer e faz meal prep.
Evitar ingredientes difíceis de achar na Espanha (ex: tapioca).

## Regras de geração

- TODAS as receitas devem respeitar as restrições de todos os perfis (ou ser marcadas como opção individual)
- Nunca usar ingredientes que aparecem nos dislikes de algum perfil
- Receitas práticas (max 45min total)
- Usar ingredientes encontrados em supermercados espanhóis
- Variar estilos culinários (brasileira, italiana, asiática, mediterrânea, etc.)
- Priorizar ingredientes da despensa quando fizer sentido, mas NÃO limitar-se a ela
- Respeitar preferências de horário/estilo de refeição (`mealTiming`) de cada perfil
- Indicar ingredientes que precisam ser comprados no campo `missing_ingredients`

## Como calcular missing_ingredients

Para cada ingrediente da receita:
1. Verificar se existe na despensa (match fuzzy: "cebola" match "cebola roxa")
2. Ignorar básicos que toda cozinha tem: sal, água, azeite, vinagre, pimenta
3. O que não tem → vai no array `missing_ingredients`

## Formato de inserção

```sql
INSERT INTO recipe_suggestions (meal_type, name, description, servings, prep_minutes, cook_minutes, ingredients, instructions, tags, nutrition, missing_ingredients)
VALUES (
  'tipo',           -- café, almoço, lanche, jantar
  'Nome da Receita',
  'Descrição curta e apetitosa.',
  2,                 -- servings (default 2)
  10,                -- prep_minutes
  20,                -- cook_minutes
  '[{"name":"item","quantity":1,"unit":"un"}]',  -- JSON array
  '["Passo 1","Passo 2"]',                       -- JSON array
  '["vegetariana","airfryer","café"]', -- JSON array, incluir tipo de refeição
  '{"calories":300,"protein":20,"carbs":30,"fat":10}', -- JSON object
  '["item que falta"]'  -- JSON array, vazio se tudo disponível
);
```

## Fluxo

1. Ler contexto (despensa, receitas existentes, pool atual)
2. Parsear argumentos do user
3. Gerar receitas mentalmente, considerando todo o contexto
4. Inserir via SQL
5. Mostrar resumo ao user: nome, tipo, tempo, e o que precisa comprar

## Limpeza (opcional)

Se o user pedir pra limpar o pool antes:
```sql
DELETE FROM recipe_suggestions WHERE used = false;
```

Se quiser limpar só um tipo:
```sql
DELETE FROM recipe_suggestions WHERE meal_type = 'café' AND used = false;
```
