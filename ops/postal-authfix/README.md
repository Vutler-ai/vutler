## Postal SMTP Auth Fix Overlay

This overlay must be applied against the existing `postal2` deployment on the VPS.

Related regression runbook:

- [docs/runbooks/agent-email-delivery-regression.md](/Users/alopez/Devs/Vutler/docs/runbooks/agent-email-delivery-regression.md)

It keeps the patched Postal services on:

- `postal2_postal-net` for MariaDB and RabbitMQ
- `vutler_vutler-network` for `vutler-api -> postal-web` traffic

Typical usage:

```bash
cd /home/ubuntu/postal
docker build -t postal-authfix:latest /home/ubuntu/postal/authfix
docker compose -p postal2 -f docker-compose.yml -f /home/ubuntu/postal/authfix/docker-compose.override.yml up -d postal-web postal-worker postal-smtp
```
