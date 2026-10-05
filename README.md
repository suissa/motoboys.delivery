# motoboys.delivery

PoC de uma rede de entregas com fila rotacional, justiça por entregas/hora, geolocalização, turnos, descanso, WhatsApp, Pix e dashboard operacional.

## Implementado

- Fila ordenada por entregas/hora; distância define elegibilidade/ETA e desempata.
- Haversine + ETA.
- Turnos de 4h e descanso de 1h.
- Webhook WhatsApp para mensagens, geolocalização e mídia.
- Gateway WhatsApp atrás de interface, com modo mock para simulação e adapter oficial Cloud API.
- Cobrança em `FINANCIAL_API/cobranca` com total cobrado do cliente.
- QR Code, Pix copia-e-cola e expiração.
- Webhook financeiro assinado, idempotente e reconciliado em ledger.
- Mensagem ao cliente com localização e ETA do motoboy.
- Código de confirmação enviado ao cliente e validado pelo motoboy.
- Recebimento de foto do produto via WhatsApp da empresa/motoboy.
- Dashboard SSE em tempo real.
- Métricas de entregas e dinheiro por hora/dia/semana/mês, por motoboy, empresa e cidade.
- Total recebido hoje fixado no topo e animado quando muda.
- Tema escuro/amarelo.
- Persistência operacional em SQLite com transações, WAL e histórico recuperável de estados.
- Estado canônico persistido independente do processo HTTP ou canal de comunicação.
- Domain Event Log transacional com projeções reconstruíveis para a operação.
- Contabilização de tempo ativo por período de trabalho, descanso e virada de dia, sem polling contínuo.
- WorkPolicy configurável por motorista, com limite de jornada, descanso obrigatório e meta não punitiva.
- Quote auditável separando preço definido pelo prestador, taxa da plataforma e total cobrado do cliente.
- LocationSession temporária com escopo, finalidade e expiração; sessões expiradas não permanecem como localização operacional.
- Dispatch explícito com oferta, aceite, rejeição, timeout, requeue, coleta, trânsito, chegada e confirmação.
- Capacidade de rede por cidade, com reservas comprometidas e estado explícito de insuficiência.
- Rede multi-provider com empresas e independentes, elegibilidade por provider e `assignedProviderId` auditável.
- Conversational Twins independentes para cliente e motorista, sincronizados pelo `serviceId` e mediados pela plataforma.
- Toda propriedade visual está em `src/configs/layout.yml`; o frontend recebe o YAML por `/api/config/layout` e transforma os valores em CSS custom properties em runtime.

## Execução

```bash
cp .env.example .env
npm install
npm run dev
```

Abra `http://localhost:60060`.

## Fluxo

1. `POST /api/orders` cria o pedido.
2. O servidor chama `FINANCIAL_API/cobranca`.
3. A camada WhatsApp envia a cobrança ao cliente.
4. O financeiro chama `POST /api/payments/webhook` com assinatura HMAC e `Idempotency-Key`.
5. O financeiro liquida a cobrança no ledger e dispara o dispatch.
6. O dispatcher cria uma oferta para o motoboy elegível com menor entregas/hora.
7. O motoboy aceita ou recusa a oferta.
8. Após aceite, a entrega passa por coleta, trânsito e chegada.
9. O cliente recebe o código de confirmação após a chegada.
10. A empresa pode enviar a foto do produto pelo webhook WhatsApp.
11. A entrega só pode receber o código após a chegada.
12. O motoboy informa o código pelo canal mediado.
13. O webhook valida o código e conclui a entrega.

## Exemplos

```bash
curl -X POST http://localhost:60060/api/orders -H 'content-type: application/json' -d '{"companyId":"company-demo","customerPhone":"5515999992000","pickup":{"lat":-24.112,"lng":-49.334},"destination":{"lat":-24.115,"lng":-49.330},"price":12.5}'
curl -X POST http://localhost:60060/api/drivers/moto-01/shift/start
curl -X POST http://localhost:60060/api/drivers/moto-01/location -H 'content-type: application/json' -d '{"lat":-24.112,"lng":-49.334}'
BODY='{"paymentId":"<payment-id>"}'
SIGNATURE=$(printf '%s' "$BODY" | openssl dgst -sha256 -hmac "$FINANCIAL_WEBHOOK_SECRET" | sed 's/^.* //')
curl -X POST http://localhost:60060/api/payments/webhook -H 'content-type: application/json' -H "x-financial-signature: sha256=$SIGNATURE" -H 'idempotency-key: example-1' -d "$BODY"
```

Webhook WhatsApp:

```json
{"message":{"from":"5515999990001","text":"iniciar turno","location":{"latitude":-24.112,"longitude":-49.334}}}
```

## Persistência

O estado operacional usa SQLite por padrão em `data/motoboys.sqlite` (`MOTOBOYS_DB_FILE`). As mutações passam por transações SQLite, com `WAL` e `synchronous=FULL`. Cada transação grava um histórico recuperável em `state_history`.

O `state_history` preserva mutações persistidas; o `domain_events` preserva fatos de negócio e alimenta projeções reconstruíveis.

## Produção

Persistência transacional, Event Log/projeções, contabilização de jornada, WorkPolicy, quote por prestador, liquidação financeira idempotente, localização temporária e dispatch completo estão implementados. Ainda permanecem: autenticação/autorização, observabilidade e QA canônico.


## Simulações executáveis

Cada funcionalidade operacional possui uma simulação independente:

```bash
npm run simulate:geo
npm run simulate:queue
npm run simulate:shifts
npm run simulate:work-time
npm run simulate:work-policy
npm run simulate:quotes
npm run simulate:location
npm run simulate:payments
npm run simulate:dispatch
npm run simulate:capacity
npm run simulate:providers
npm run simulate:twins
npm run simulate:orders
npm run simulate:whatsapp
npm run simulate:events
npm run simulate:persistence
npm run simulate:api
```

Para executar todas em sequência:

```bash
npm run simulate:pipeline
```

A simulação HTTP sobe uma instância temporária do servidor na porta `60160` por padrão. Para outra porta:

```bash
SIMULATION_PORT=60170 npm run simulate:api
```

## Testes

Os testes foram separados em unitários e BDD:

```bash
npm run test:unit
npm run test:bdd
npm test
```

Os testes cobrem geometria/ETA, fila de justiça, elegibilidade por distância/status/descanso, turnos, descanso, parser WhatsApp, ciclo Pix, ciclo de pedido, dispatch, confirmação da entrega, persistência transacional, rollback, reinício, concorrência entre processos e reconstrução de projeções a partir do Event Log.

## Implementação em andamento

A ordem oficial de implementação está em `docs/implementation/PLAN.md`. As issues #2, #3, #4, #13, #12, #8, #10, #7, #5, #6, #9, #11 e #14 estão implementadas; a #15 fecha a suíte canônica.

## Lacunas planejadas

As funcionalidades ainda não implementadas estão registradas como Issues no GitHub, com justificativa, escopo e critérios de aceitação. A PoC deliberadamente não considera essas lacunas como funcionalidades concluídas.
