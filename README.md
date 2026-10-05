# motoboys.delivery

PoC de uma rede de entregas com fila rotacional, justiça por entregas/hora, geolocalização, turnos, descanso, WhatsApp, Pix e dashboard operacional.

## Implementado

- Fila ordenada por entregas/hora; distância define elegibilidade/ETA e desempata.
- Haversine + ETA.
- Turnos de 4h e descanso de 1h.
- Webhook WhatsApp para mensagens, geolocalização e mídia.
- Gateway WhatsApp atrás de interface, atualmente mock.
- Cobrança em `FINANCIAL_API/cobranca` com `{ price: Number }`.
- QR Code, Pix copia-e-cola e expiração.
- Webhook de confirmação do pagamento.
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
4. O financeiro chama `POST /api/payments/webhook`.
5. O dispatcher escolhe o motoboy elegível com menor entregas/hora.
6. O cliente recebe a localização e ETA.
7. A empresa pode enviar a foto do produto pelo webhook WhatsApp.
8. `POST /api/orders/:id/confirm` gera e envia o código ao cliente.
9. O cliente informa o código ao motoboy.
10. O webhook valida o código e conclui a entrega.

## Exemplos

```bash
curl -X POST http://localhost:60060/api/orders -H 'content-type: application/json' -d '{"companyId":"company-demo","customerPhone":"5515999992000","pickup":{"lat":-24.112,"lng":-49.334},"destination":{"lat":-24.115,"lng":-49.330},"price":12.5}'
curl -X POST http://localhost:60060/api/drivers/moto-01/shift/start
curl -X POST http://localhost:60060/api/drivers/moto-01/location -H 'content-type: application/json' -d '{"lat":-24.112,"lng":-49.334}'
curl -X POST http://localhost:60060/api/payments/webhook -H 'content-type: application/json' -d '{"paymentId":"<payment-id>"}'
```

Webhook WhatsApp:

```json
{"message":{"from":"5515999990001","text":"iniciar turno","location":{"latitude":-24.112,"longitude":-49.334}}}
```

## Persistência

O estado operacional usa SQLite por padrão em `data/motoboys.sqlite` (`MOTOBOYS_DB_FILE`). As mutações passam por transações SQLite, com `WAL` e `synchronous=FULL`. Cada transação grava um histórico recuperável em `state_history`.

O próximo passo de arquitetura é separar esse histórico de persistência do Event Log de domínio da issue #3.

## Produção

Persistência transacional, Event Log/projeções, contabilização de jornada, WorkPolicy e quote por prestador estão implementados. Ainda permanecem: idempotência financeira, autenticação/autorização, assinatura de webhooks, dispatch completo, capacidade de rede, observabilidade e um provedor oficial de WhatsApp.


## Simulações executáveis

Cada funcionalidade operacional possui uma simulação independente:

```bash
npm run simulate:geo
npm run simulate:queue
npm run simulate:shifts
npm run simulate:work-time
npm run simulate:work-policy
npm run simulate:quotes
npm run simulate:payments
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

A ordem oficial de implementação está em `docs/implementation/PLAN.md`. A issue #2 — persistência transacional e fonte de verdade operacional — está implementada; as demais seguem a sequência definida no plano.

## Lacunas planejadas

As funcionalidades ainda não implementadas estão registradas como Issues no GitHub, com justificativa, escopo e critérios de aceitação. A PoC deliberadamente não considera essas lacunas como funcionalidades concluídas.
