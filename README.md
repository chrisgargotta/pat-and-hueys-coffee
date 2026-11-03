# Pat and Huey's Coffee — Voice AI Agent

Annotated codebase shown in the Twilio x OpenAI quickstart video

A ~100-line demo of a real-time **voice AI agent** that answers phone calls for a
(fictional) coffee shop and *remembers returning callers*. It's built on
[`twilio-agent-connect`](https://www.npmjs.com/package/twilio-agent-connect) (TAC),
which handles all the telephony plumbing so the whole app fits in one file:
[`index.ts`](./index.ts).

## What it does

Someone calls your Twilio number → the agent picks up, greets them, takes a
coffee order by voice, and hangs up. If the caller has phoned before, it greets
them by name and offers their usual.

```
                 inbound call
   ☎️  caller  ───────────────▶  Twilio  ───▶  your app (TACServer)

                                                     │
                            ┌────────────────────────┼───────────────────────┐
                            ▼                        ▼                       ▼
                   recall caller's memory      GPT Live voice model      send audio back
                   (name, usual order)         (speech ⇄ speech)         down the call
```

## How it works

The agent is assembled in [`index.ts`](./index.ts) in a few clear steps:

1. **Create the client.** `TAC.create({ config: TACConfig.fromEnv() })` reads
   your credentials from the environment and becomes the handle used everywhere.

2. **Define the persona.** `BASE_INSTRUCTIONS` is the system prompt — a warm,
   concise barista. (It's a *fake* shop, so it never asks for payment or an
   address; the order is "ready when you hang up.")

3. **Describe a session.** `sessionConfig()` is a small factory returning the
   voice model setup (`gpt-live-1`, audio format, voice, and a `gpt-6.1-sol`
   "responses" model for tool calls). It's a factory so the *same* shape can be
   reused with different instructions.

4. **Wire up the voice channel.** A `VoiceChannel` with a `GPTLiveProviderConfig`
   gets two things:
   - a `welcomeInstruction` describing how to open the call, and
   - `onInboundCallSessionConfig(req)` — a per-call hook. This is the
     interesting part: for each incoming call it looks up the caller and
     personalizes the prompt.

5. **Personalize with memory.** `recallMemory(number)` uses TAC's Memory client
   to `lookupProfile("phone", number)`, then `retrieveMemories(...)` to fetch the
   caller's name, usual order, and history. `MemoryPromptBuilder.compose(...)`
   folds that into the base instructions. New caller or any lookup failure →
   it quietly falls back to the default session, so the call never breaks.

6. **Serve it.** `tac.registerChannel(voice)` then `new TACServer(tac).start()`.
   TAC runs the webhook + WebSocket server; you write no server code.

The key idea: **TAC owns the telephony/streaming layer, and your job is just to
return the right session config per call.** Memory is what turns a generic bot
into one that recognizes you.

## Run it locally

Prerequisites: **Node.js 26+** (runs TypeScript directly — no build step),
**pnpm**, a **Twilio account** with a phone number, and an **OpenAI API key**.

```bash
pnpm install
cp .env.example .env     # then fill in real values (see below)
node index.ts            # starts the TAC server
```

Your app needs to be reachable by Twilio, so in local dev expose it with a
tunnel (e.g. `ngrok http <port>`) and set that public URL as
`TWILIO_VOICE_PUBLIC_DOMAIN`. Then wire up two webhooks to that public URL:

- **Twilio phone number** — set its voice webhook to POST to `<url>/twiml`.
- **Conversation configuration** — set its webhook to `<url>/webhook`.

Once both point at the app, call the number.

### `.env` values

| Variable | What it is |
| --- | --- |
| `TWILIO_ACCOUNT_SID` / `TWILIO_AUTH_TOKEN` | Twilio account credentials |
| `TWILIO_API_KEY` / `TWILIO_API_SECRET` | Twilio API key pair |
| `TWILIO_PHONE_NUMBER` | The number that receives calls |
| `TWILIO_CONVERSATION_CONFIGURATION_ID` | Your Conversation/Memory config |
| `TWILIO_VOICE_PUBLIC_DOMAIN` | Public domain where Twilio reaches your app |
| `OPENAI_API_KEY` | Powers the GPT Live voice model |

## Get it running fast (copy this prompt)

Paste the following into an AI coding agent (like Claude Code) from inside the
project directory to go from zero to a ringing phone:

> I've cloned the `pat-and-hueys-coffee` repo — a voice AI coffee-shop agent built on
> `twilio-agent-connect`. Help me run it locally end to end. Specifically:
> 1. Confirm I have Node 26+ and pnpm, then run `pnpm install`.
> 2. Walk me through creating a `.env` from `.env.example`. For each variable,
>    tell me exactly where in the Twilio Console or OpenAI dashboard to find the
>    value. Pause and let me paste each one in.
> 3. Start a tunnel to my local app and set `TWILIO_VOICE_PUBLIC_DOMAIN` to the
>    public URL.
> 4. Configure my Twilio phone number's voice webhook to POST to `<url>/twiml`,
>    and set my Conversation configuration's webhook to `<url>/webhook`.
> 5. Start the server with `node index.ts`, watch the logs, and tell me what a
>    healthy startup looks like. Then have me call the number to test it, and
>    help me debug anything that doesn't work.
> Ask me for anything you need as you go, and don't skip steps.

## Project layout

```
index.ts          # the entire application
.env.example      # required environment variables
package.json      # deps: twilio-agent-connect, dotenv
AGENTS.md         # notes for AI coding agents working in this repo
```
