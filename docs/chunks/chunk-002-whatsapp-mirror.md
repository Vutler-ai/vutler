# Chunk 002 — WhatsApp Mirror

## Goal
End-to-end mirror from WhatsApp payload to Vutler chat room.

## API Path
`POST /api/v1/whatsapp/mirror`

## Requirements
- `VUTLER_WHATSAPP_MIRROR_ENABLED=true`
- Auth via Bearer API key
- Payload fields: `direction`, `text`, `conversation_label`, optional `timestamp`, `message_id`

## Expected Result
Messages land in room display name:
`Jarvis WhatsApp Mirror`
