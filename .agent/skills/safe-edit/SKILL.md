---
name: safe-edit
description: >
  Use this skill SEMPRE que for fazer qualquer ajuste, correção ou melhoria em:
  (1) código SQL ou estruturas de banco de dados (queries, schemas, migrations, stored procedures, triggers, functions, views),
  (2) prompts de agentes conversacionais (system prompts, instruções, templates, variáveis de contexto, few-shots).
  Esta skill é OBRIGATÓRIA quando o usuário pedir para "corrigir", "ajustar", "melhorar", "atualizar", "adicionar" ou "remover" qualquer parte de banco de dados ou prompt existente. Nunca edite estruturas existentes sem seguir este protocolo — o risco de quebrar o sistema em produção é alto.
---

# Safe Edit — Edição Cirúrgica de Banco de Dados e Prompts

## Princípio fundamental

> **Edite apenas o ponto exato de correção. Preserve todo o resto intacto.**

Você está trabalhando em um sistema em produção. Qualquer simplificação, reorganização ou "limpeza" não solicitada de código de banco ou de prompt pode quebrar comportamentos existentes, invalidar lógicas dependentes ou apagar contexto crítico que o usuário levou tempo construindo.

---

## Regras invioláveis

### 1. Nunca simplifique o que não foi pedido
- Se o usuário pediu para corrigir um campo, corrija **só aquele campo**.
- Não remova colunas, índices, constraints, comentários ou blocos que pareçam "redundantes" — eles podem ter propósito não evidente.
- Não refatore queries funcionais para "deixar mais limpo" se isso não foi solicitado.
- Não condense ou resuma blocos de prompt existentes — cada frase pode ter sido colocada ali intencionalmente.

### 2. Nunca reorganize estrutura não solicitada
- Não mude a ordem de campos em uma tabela ou query.
- Não mude a ordem de seções/blocos em um prompt.
- Não renomeie variáveis, aliases ou identificadores que não foram pedidos para renomear.
- Não mova instruções de um bloco para outro de um prompt.

### 3. Nunca remova sem confirmação explícita
- Só remova algo se o usuário disse explicitamente "remova X" ou "delete X".
- Se algo parece errado ou desnecessário, **aponte** — mas não remova por conta própria.

### 4. Sempre preserve comentários e documentação inline
- Comentários em SQL (`-- comentário`, `/* ... */`) e em prompts (`# seção`, anotações) devem ser mantidos.
- Se o ajuste exigir alterar um comentário, atualize apenas a parte afetada pelo comentário.

### 5. Sinalize colisões antes de agir
- Se a correção solicitada conflitar com outra parte do código/prompt, **informe o conflito** antes de aplicar qualquer mudança.
- Exemplo: "Adicionar esse campo com NOT NULL vai quebrar inserções existentes que não passam esse valor. Quer que eu crie com DEFAULT ou ajuste as queries de inserção também?"

---

## Protocolo de edição (passo a passo)

### Passo 1 — Leia o contexto completo
Antes de qualquer edição:
- Leia o código/prompt completo que será modificado.
- Identifique dependências: outras queries que referenciam a tabela, outras seções do prompt que dependem da que vai ser modificada.

### Passo 2 — Localize o ponto cirúrgico
- Identifique **exatamente** qual linha, campo, instrução ou bloco precisa mudar.
- Se não for claro, pergunte ao usuário antes de prosseguir.

### Passo 3 — Planeje o diff
Antes de escrever o código final, descreva o que vai mudar:

```
MUDANÇAS PLANEJADAS:
- [ARQUIVO/TRECHO]: linha 47 — alterar tipo de VARCHAR(100) para VARCHAR(255)
- Nenhuma outra alteração.

O restante do schema permanece intacto.
```

### Passo 4 — Aplique a edição de forma cirúrgica
Entregue **apenas** o trecho modificado em contexto suficiente para o usuário identificar onde aplicar, ou o arquivo completo com a única mudança marcada claramente.

Formato preferido para entregas parciais:
```sql
-- [ANTES — contexto para localização]
nome_campo VARCHAR(100) NOT NULL,

-- [DEPOIS — apenas esta linha muda]
nome_campo VARCHAR(255) NOT NULL,

-- [DEPOIS — contexto para localização]
outro_campo INT DEFAULT 0,
```

### Passo 5 — Declare o que NÃO mudou
Sempre termine com uma declaração explícita:
```
Preservado intacto:
- Todas as outras colunas e constraints da tabela
- Índices existentes
- Demais queries e views que referenciam esta tabela
- [Para prompts]: todas as outras seções e instruções do prompt
```

---

## Padrões específicos por tipo de artefato

### SQL / Banco de dados

**Ao adicionar coluna:**
```sql
ALTER TABLE nome_tabela
ADD COLUMN novo_campo TIPO [constraints];
-- Não recriar a tabela. Não reorganizar outras colunas.
```

**Ao modificar coluna:**
```sql
ALTER TABLE nome_tabela
MODIFY COLUMN campo_existente NOVO_TIPO [constraints];
-- Verificar impacto em índices, foreign keys e queries dependentes.
```

**Ao corrigir uma query:**
- Entregue a query completa com a correção aplicada.
- Marque o trecho corrigido com comentário `-- CORREÇÃO: [descrição breve]`.
- Não reescreva joins, subqueries ou aliases que funcionam.

**Ao adicionar índice:**
```sql
CREATE INDEX idx_nome ON tabela(campo);
-- Não remover índices existentes. Não alterar a tabela.
```

**Ao criar/ajustar stored procedure ou function:**
- Mantenha a assinatura (nome, parâmetros) intacta se não foi pedido para mudar.
- Edite apenas o corpo no ponto solicitado.

### Prompts de agentes conversacionais

**Ao adicionar instrução:**
- Identifique a seção correta do prompt onde a instrução se encaixa.
- Insira no ponto lógico sem mover ou reescrever as instruções vizinhas.
- Mantenha o estilo/tom/formato das instruções existentes (listas, parágrafos, bullets — siga o padrão do que já existe).

**Ao remover instrução:**
- Remova apenas a instrução exata.
- Se ela for referenciada em outra parte do prompt (ex: "conforme descrito acima em X"), sinalizar antes de remover.

**Ao corrigir instrução:**
- Edite somente as palavras/frases que precisam mudar.
- Não reescreva a instrução inteira se apenas parte dela está errada.
- Não mude o nível de detalhe (não resuma uma instrução longa para uma curta).

**Ao ajustar few-shots / exemplos:**
- Edite somente o exemplo solicitado.
- Não reordene os exemplos.
- Não remova exemplos que pareçam redundantes — eles cobrem casos específicos.

---

## Checklist antes de entregar

Antes de apresentar qualquer edição ao usuário, responda internamente:

- [ ] Editei **apenas** o que foi solicitado?
- [ ] Alguma parte existente foi removida sem pedido explícito?
- [ ] Alguma parte existente foi reordenada sem pedido explícito?
- [ ] Alguma parte existente foi simplificada/condensada sem pedido explícito?
- [ ] Há dependências que podem ser quebradas pela mudança? (se sim → sinalizei?)
- [ ] Declarei explicitamente o que foi preservado?

Se qualquer resposta for problemática, revise antes de entregar.

---

## Sinais de alerta — quando parar e perguntar

Pare e consulte o usuário antes de prosseguir se:

1. A correção solicitada exige **recriar uma tabela** (em vez de ALTER TABLE).
2. A mudança afeta uma **foreign key** ou **constraint** referenciada em outras tabelas.
3. A instrução a corrigir no prompt está **duplicada** em outra seção — qual das duas corrigir?
4. O usuário pediu para "simplificar" ou "limpar" sem especificar o que — pergunte o escopo exato.
5. Remover a instrução do prompt vai deixar um comportamento **sem cobertura**.

---

## O que esta skill NÃO autoriza

- ❌ Reescrever queries "melhores" sem ser pedido
- ❌ Normalizar nomes de campos para um padrão diferente do existente
- ❌ Remover lógica "morta" ou aparentemente não usada
- ❌ Condensar blocos de prompt longos em versões mais curtas
- ❌ Reorganizar seções do prompt para "melhor fluxo"
- ❌ Substituir lógica SQL por uma abordagem diferente sem ser pedido
- ❌ "Enquanto estou aqui, também arrumei X" — nunca edições não solicitadas
