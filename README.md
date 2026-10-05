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

## Produção

Esta é uma PoC e usa memória. Para produção: persistência transacional, idempotência, autenticação/autorização, assinatura de webhooks, fila de eventos, observabilidade e um provedor oficial de WhatsApp.
