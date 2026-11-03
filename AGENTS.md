# AGENTS.md

Guidance for AI coding agents working in this repository.

## What this is

`pat-and-hueys-coffee` is a single-file voice AI agent for a (fictional) coffee shop,
"Pat and Huey's Coffee." It uses the [`twilio-agent-connect`](https://www.npmjs.com/package/twilio-agent-connect)
(TAC) framework to answer inbound phone calls with a real-time voice agent and
to personalize greetings using Twilio Conversation Memory.

The entire application lives in `index.ts` (~100 lines). There is no build step
and no custom server code — TAC provides the webhook/WebSocket server.

## Stack

- **Runtime:** Node.js v26 (runs `index.ts` directly via native TypeScript type
  stripping — no `tsx`/`ts-node`/build step).
- **Package manager:** pnpm (see `pnpm-lock.yaml`).
- **Key dependency:** `twilio-agent-connect` ^2.5.0 (ESM-only, `type: module`).
- **Config:** `dotenv` loads `.env` (see `.env.example` for required vars).
- **Voice model:** `gpt-live-1` via `GPTLiveProviderConfig`, with a
  `gpt-6.1-sol` responses-delegation model for tool calls.

## Commands

```bash
pnpm install        # install dependencies
node index.ts       # run the agent server (Node 26 strips TS types natively)
```

There is no test suite (`pnpm test` is a placeholder that exits 1) and no lint
or typecheck script configured in this project's `package.json`.

## Environment

Copy `.env.example` to `.env` and fill in real values before running. Required:

- `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_API_KEY`, `TWILIO_API_SECRET`
- `TWILIO_PHONE_NUMBER` — the number that receives inbound calls
- `TWILIO_CONVERSATION_CONFIGURATION_ID` — Conversation/Memory configuration
- `TWILIO_VOICE_PUBLIC_DOMAIN` — public domain where TAC's webhooks/WebSocket
  are reachable (Twilio must be able to reach this; use a tunnel in local dev)
- `OPENAI_API_KEY`

`TACConfig.fromEnv()` reads these — never hardcode credentials. Keep `.env` out
of version control.

Two webhooks must point at the public URL for inbound calls to work:

- **Twilio phone number** — voice webhook POSTs to `<url>/twiml`.
- **Conversation configuration** — webhook set to `<url>/webhook`.

## Architecture / how it works

`index.ts` wires up TAC in this order:

1. `TAC.create({ config: TACConfig.fromEnv() })` — the client used throughout.
2. `BASE_INSTRUCTIONS` — the agent's persona/system prompt. It is a fake coffee
   shop: **do not** ask for address or payment; orders are "ready when the
   caller hangs up."
3. `sessionConfig(instructions?)` — a factory returning the GPT Live session
   config (model, audio format/voice, responses delegation). Abstracted so the
   same shape is reused for the default session and the memory-augmented one.
4. `VoiceChannel` + `GPTLiveProviderConfig`:
   - `welcomeInstruction` — how to open the call (greet repeat vs. new callers).
   - `defaultSessionConfig` — `sessionConfig(BASE_INSTRUCTIONS)`.
   - `onInboundCallSessionConfig(req)` — per-call hook: looks up the caller by
     `req.from`, recalls their memory, and composes a personalized prompt via
     `MemoryPromptBuilder.compose(...)`.
5. `recallMemory(number)` — uses `tac.getMemoryClient()` to
   `lookupProfile("phone", number)`, then `retrieveMemories(profileId, { query })`
   for the caller's name / usual order / past orders. Wrapped in try/catch and
   returns `undefined` on any miss or error (new caller → default session).
6. `tac.registerChannel(voice)` then `new TACServer(tac).start()`.

## Conventions

- Keep everything in `index.ts` unless a change genuinely warrants new files —
  this is a compact demo, not a multi-module app.
- Import TAC symbols from the `twilio-agent-connect` package root (it re-exports
  everything; see its `dist/index.d.ts` for the full surface).
- Memory recall must stay fault-tolerant: a failed/empty lookup should fall back
  to the default (non-personalized) session, never throw into the call flow.
- The persona rules in `BASE_INSTRUCTIONS` are deliberate for the demo (no
  payment/address). Preserve them unless explicitly asked to change the scenario.
- This is demo code — prefer clarity and the existing explanatory comment style
  over cleverness.
