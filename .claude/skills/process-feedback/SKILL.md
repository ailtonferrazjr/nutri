---
name: process-feedback
description: Processa feedbacks de receitas não-processados e atualiza perfis de consumo dos usuários
user_invocable: true
---

# Processar Feedback de Receitas

Analisa feedbacks coletados na página /descobrir e atualiza o perfil de consumo dos usuários.

## Quando usar

- Periodicamente (ex: antes de gerar novas receitas com `/generate-recipes`)
- Quando o user pedir pra processar feedbacks
- Quando houver feedbacks acumulados

## Fluxo

### 1. Ler feedbacks não-processados

```bash
pnpm db:query "SELECT id, recipe_name, action, reason, detail, tags, ingredients, created_at FROM recipe_feedback WHERE processed = false ORDER BY created_at"
```

Se não houver feedbacks, informar e encerrar.

### 2. Analisar padrões

Agrupar por tipo de ação e identificar:

**Dismissals (action = 'dismissed'):**
- `reason = 'bad_ingredient'` + `detail` → ingrediente rejeitado
  - Se rejeitado 2+ vezes → confirmar como dislike
- `reason = 'not_interested'` → analisar tags/ingredientes pra entender padrão
- `reason = 'too_complex'` → preferem receitas mais simples

**Favorites (action = 'favorited'):**
- Tags mais favoritadas → preferência forte de estilo
- Ingredientes recorrentes → ingredientes que gostam

**Saved (action = 'saved'):**
- Similar a favoritas mas com peso menor

**Altered (action = 'altered'):**
- `detail` contém o prompt de alteração
- Padrões frequentes: "mais rápida", "sem X", "menos Y" → ajustar preferências

### 3. Atualizar perfis

Ler perfis atuais:
```bash
pnpm db:query "SELECT name, preferences FROM users"
```

O campo `preferences` é JSON com estrutura:
```json
{
  "likes": ["carne", "arroz"],
  "dislikes": ["berinjela"],
  "cuisines": ["brasileira", "japonesa"],
  "cookingSkill": "intermediate",
  "notes": "preferem receitas rápidas"
}
```

Atualizar com novos insights. Usar SQL:
```sql
-- uma linha por perfil afetado (nomes vêm de SELECT name FROM users)
UPDATE users SET preferences = '...' WHERE name = '<nome>';
```

### 4. Marcar como processados

```sql
UPDATE recipe_feedback SET processed = true WHERE id IN ('id1', 'id2', ...);
```

### 5. Resumo

Mostrar ao user:
- Quantos feedbacks processados
- Insights descobertos (ex: "Vocês rejeitaram berinjela 3x → adicionado aos dislikes")
- Mudanças feitas no perfil
- Recomendações (ex: "Baseado nos favoritos, vocês gostam mais de receitas rápidas com airfryer")

## Exemplo de output

```
Processados 12 feedbacks:
- 4 favoritas, 3 salvas, 4 descartadas, 1 alteração

Insights:
- Ingrediente rejeitado: berinjela (3x) → adicionado aos dislikes
- Tags mais favoritadas: airfryer (3x), rapida (4x)
- Alteração frequente: "mais rápida" → preferem receitas <20min
- Cuisines favoritas: brasileira (2x), italiana (2x)

Perfil atualizado:
- Ana: +dislikes: berinjela
- Leo: +dislikes: berinjela, +notes: "preferem receitas <20min"
```

## Atualizar skill generate-recipes

Após processar, lembrar de verificar se a skill `/generate-recipes` precisa de ajustes no prompt baseado nos novos insights.
