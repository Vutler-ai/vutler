# Postal Inbound Webhook

This runbook covers the production configuration for Postal inbound mail delivery to Vutler.

## Endpoint

- Postal inbound HTTP endpoint: `POST /api/v1/email/incoming`
- Public app URL example: `https://app.vutler.ai/api/v1/email/incoming`

## Required Environment

Set these on the API service:

```bash
POSTAL_API_URL=http://127.0.0.1:8082
POSTAL_HOST=mail.vutler.ai
POSTAL_API_KEY=postal_your_server_api_key_here
POSTAL_INBOUND_WEBHOOK_KEY=your_postal_public_key_body_here
POSTAL_REQUIRE_WEBHOOK_SIGNATURE=true
```

Recommended defense in depth:

```bash
POSTAL_INBOUND_WEBHOOK_SECRET=replace-with-random-secret
POSTAL_REQUIRE_WEBHOOK_SECRET=true
```

## Postal Signature Key

Postal signs inbound webhook payloads with `X-Postal-Signature`.

To extract the verification key from the Postal host:

```bash
postal default-dkim-record
```

Use only the base64 body after `p=` and before the trailing semicolon.

Example:

```text
v=DKIM1; k=rsa; p=MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8A...
```

Store this value in `POSTAL_INBOUND_WEBHOOK_KEY`.

## Optional Shared Secret

If `POSTAL_REQUIRE_WEBHOOK_SECRET=true`, Postal or the proxy in front of it must also provide one of:

- `X-Webhook-Secret: <secret>`
- `X-Vutler-Webhook-Secret: <secret>`
- `?secret=<secret>` on the webhook URL

This is optional and additive. It does not replace the Postal RSA signature.

## Expected Behavior

- Invalid or missing signature when required: `401`
- Missing shared secret when required: `401`
- Missing webhook key while signature verification is required: `503`
- Valid request: immediate `200 { "success": true }`, then async processing

## Plan Gating

Inbound delivery is accepted only when the routed workspace plan allows managed agent email.

- Managed fallback addresses under `@slug.vutler.ai` are allowed on plans with managed agent email entitlement.
- Custom domains are accepted only on plans that allow custom email domains.
- If a workspace loses the relevant entitlement, inbound mail is acknowledged then dropped during async processing.

## Validation

Run the focused tests after any change to webhook verification or inbound delivery:

```bash
npx jest --runInBand tests/postal-webhook-security.test.js tests/workspace-email-service.test.js
```
