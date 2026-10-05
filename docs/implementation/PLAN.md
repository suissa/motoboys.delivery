# Plano de Implementação

Este plano define a ordem de implementação das issues do projeto.

A regra de dependência é: uma issue pode depender somente de issues anteriores. Cada etapa deve deixar a base necessária pronta para a etapa seguinte, sem criar dependência circular ou exigir a implementação de uma issue posterior.

## Ordem

### 1. #2 — Persistência transacional e fonte de verdade operacional ✅

Primeira base técnica da operação.

**Status:** implementada em SQLite com transações, WAL, histórico recuperável e proteção contra concorrência entre processos.

Implementar persistência transacional para substituir o estado operacional em memória e estabelecer uma fonte de verdade durável para serviços, pedidos, motoristas, turnos, pagamentos e transições.

**Depende de:** nenhuma.

**Libera:** #3, #4, #7, #8, #10, #12, #13 e as demais funcionalidades que precisam de estado confiável.

### 2. #3 — Event log e projeções para a operação

Com a persistência como fonte de verdade, implementar o histórico de eventos e as projeções derivadas.

O evento representa o que aconteceu; dashboard, WhatsApp e demais interfaces passam a ser projeções da operação.

**Depende de:** #2.

**Libera:** observabilidade, auditoria, reconstrução de estado e integração dos fluxos operacionais.

### 3. #4 — Contabilização real de horas trabalhadas e justiça da fila

Implementar o cálculo real de tempo trabalhado, pausas, descanso e disponibilidade.

A fila deve utilizar dados reais de trabalho, evitando que a distribuição dependa apenas de contadores estáticos.

**Depende de:** #2 e #3.

### 4. #13 — Distribuição de trabalho, metas e descanso orientados à qualidade de vida

Sobre a contabilização real de trabalho, implementar metas, limites de jornada, descanso obrigatório e regras de qualidade de vida.

**Depende de:** #4.

### 5. #12 — Preço definido pelo prestador e cobrança separada da taxa da plataforma

Separar explicitamente preço do serviço, taxa da plataforma e total pago pelo cliente.

O preço do prestador continua sendo definido pelo próprio prestador; a plataforma não deve transformar sua taxa em preço do serviço.

**Depende de:** #2 e #3.

### 6. #8 — Webhook financeiro seguro, idempotente e com ledger de liquidação

Implementar a integração financeira real com assinatura/verificação, idempotência, reconciliação e ledger de liquidação.

**Depende de:** #2, #3 e #12.

### 7. #10 — Localização mínima e compartilhada entre as partes

Implementar localização com escopo, finalidade e validade definidos.

A localização deve existir apenas enquanto necessária ao serviço, sem transformar o sistema em rastreamento permanente.

**Depende de:** #2 e #3.

### 8. #7 — Ciclo completo de dispatch e estados da entrega

Implementar a máquina de estados completa do serviço: busca, oferta, aceite, coleta, deslocamento, chegada, entrega, confirmação, conclusão, rejeição, timeout e requeue.

**Depende de:** #3, #4, #8 e #10.

### 9. #5 — Garantia de capacidade da rede de motoboys

Depois que o dispatch individual estiver correto, implementar capacidade da rede por cidade e janela de tempo.

A garantia é da rede, não de um motoboy específico.

**Depende de:** #4, #7 e #10.

### 10. #6 — Rede multiempresa e distribuição entre empresas e independentes

Expandir a capacidade para múltiplas empresas, independentes e outros provedores elegíveis.

**Depende de:** #5 e #7.

### 11. #9 — Integração oficial do WhatsApp e contrato de mensagens

Substituir o adapter de simulação pela integração oficial, mantendo o domínio independente do canal.

Mensagens recebidas e enviadas devem possuir contrato normalizado, correlação e tratamento de retry.

**Depende de:** #3, #7 e #6.

### 12. #11 — Conversational Twins de cliente e motorista

Criar os contextos conversacionais independentes do cliente e do motorista, vinculados ao mesmo `serviceId`.

**Depende de:** #7 e #9.

### 13. #14 — Observabilidade operacional e auditoria por serviço

Consolidar observabilidade por `serviceId`/`correlationId`, timeline operacional, métricas e auditoria.

**Depende de:** #3, #7, #8, #9 e #11.

### 14. #15 — QA canônico: Intent, Action, Agent, Flow e E2E por canal

Consolidar o contrato de qualidade sobre o sistema implementado.

Os testes devem cobrir invariantes de domínio, intents, actions, agents, flows, persistência, eventos, pagamentos, dispatch e canais de interação.

**Depende de:** todas as issues anteriores.

## Grafo resumido

```text
#2 Persistência
  ↓
#3 Event Log / Projeções
  ├──→ #4 Horas / Justiça
  │      ↓
  │    #13 Metas / Descanso
  │      ↓
  │    #7 Dispatch
  │      ↓
  │    #5 Capacidade
  │      ↓
  │    #6 Multiempresa
  │
  ├──→ #12 Preço / Taxa
  │      ↓
  │    #8 Financeiro
  │      ↓
  │    #7 Dispatch
  │
  └──→ #10 Localização
         ↓
       #7 Dispatch

#7 Dispatch + #6 Multiempresa
  ↓
#9 WhatsApp oficial
  ↓
#11 Conversational Twins
  ↓
#14 Observabilidade
  ↓
#15 QA canônico
```

## Regra de execução

Uma issue só deve ser considerada implementável quando todas as issues das quais ela depende estiverem concluídas.

A implementação pode antecipar detalhes internos de uma issue posterior somente quando isso não criar dependência arquitetural da issue posterior. A issue posterior deve poder ser implementada sobre o contrato deixado pela anterior.

A ordem acima é a ordem preferencial de definição e implementação; dentro de uma etapa, tarefas independentes podem ser desenvolvidas em paralelo.