# Voice Client Implementation Plan

The backend voice pipeline (`backend/app/agents/voice.py`, `backend/app/routers/voice_ws.py`)
is built and working. The **frontend** voice UI (`src/screens/sync/VoiceCoachScreen.tsx`)
is currently a mock — it fakes a conversation with a timer over `mockChatHistory.ts` and
never opens a socket or captures audio. This document is the plan to build the real client.

The design goal: **only stream audio to Deepgram when the user is actually speaking**
(client-side Voice Activity Detection), because continuous streaming is the dominant
per-session cost. See the cost analysis for why — Deepgram bills on audio-minutes sent,
including silence and rest periods.

---

## 1. Architecture of the client module

```
┌─────────────────────── VoiceCoachScreen (UI) ───────────────────────┐
│  listening state · transcript · coach-speaking indicator · timer     │
└───────────────┬──────────────────────────────────────────────────────┘
                │ uses
┌───────────────▼──────────── useVoiceSession() hook ──────────────────┐
│  orchestrates everything below; exposes start() / stop() / state     │
└──┬───────────┬──────────────┬───────────────┬───────────────┬────────┘
   │           │              │               │               │
┌──▼──┐   ┌────▼─────┐   ┌────▼──────┐   ┌────▼─────┐   ┌─────▼──────┐
│Auth │   │ WS       │   │ Mic       │   │ VAD gate │   │ Audio      │
│+    │   │ manager  │   │ capture   │   │ (Silero) │   │ playback   │
│sess │   │(JSON+bin)│   │(raw PCM)  │   │+preroll  │   │(MP3 queue) │
└─────┘   └──────────┘   └───────────┘   └──────────┘   └────────────┘
```

The mic/VAD gate controls **what bytes are sent**; the WebSocket messages control
**the conversation phase**. Keeping those two concerns separate is the key to a clean
state machine (see §5).

---

## 2. Prerequisites & dependencies

- **Leave Expo Go → make a development build.** Raw audio frames require native modules
  that Expo Go can't load. `npx expo install expo-dev-client`, then
  `eas build --profile development`. This is unavoidable the moment you touch real audio.
- **Dependencies:**
  - Raw PCM capture → `react-native-live-audio-stream` (16kHz mono Linear16 frames)
  - VAD → `onnxruntime-react-native` + the Silero VAD `.onnx` model (~1–2MB bundled asset)
  - Playback → `expo-audio` (or `expo-av`) for the returned MP3 chunks
  - Permissions → mic permission via `expo-audio`'s request API
- **iOS audio session:** configure `playAndRecord` + `allowBluetooth` (AirPods in the gym),
  and enable the background-audio mode if the session should survive screen-lock mid-set.

---

## 3. Backend protocol (the contract to match)

From `voice_ws.py`. The client MUST speak exactly this or audio garbles / the socket rejects.

**Connect:** WebSocket to `/ws/voice/{user_id}?token=<supabase_jwt>`
(server checks the token maps to `user_id`, else closes with code 4001).

**Client → Server**
| Message | Purpose |
|---|---|
| `{"type":"session_start","session_id":"<uuid>","voice":true}` | open a voice session |
| `<binary>` | Linear16 PCM, **16kHz, mono** — mic audio |
| `{"type":"session_end"}` | end the voice session |

**Server → Client**
| Message | Handle by |
|---|---|
| `{"type":"ack","voice":true}` | handshake complete → start mic |
| `{"type":"transcript","text":"..."}` | show what was heard; utterance is complete |
| `{"type":"app_action","action":"...",...}` | dispatch to UI (timer, log_set, swap, …) |
| `<binary>` | MP3 audio chunk → playback queue |
| `{"type":"done"}` | agent turn finished → back to listening |
| `{"type":"error","message":"..."}` | surface + recover |

**Audio format contract:** OUT = Linear16 PCM 16kHz mono. IN = MP3. Must match byte-for-byte.

**Session lifecycle (REST, from `session.py`):** `POST /api/session {plan_id}` → `session_id`
before opening the socket; `DELETE /api/session/{id}` on teardown.

---

## 4. Build milestones (each is one demoable, journal-style commit)

**M1 — Session bootstrap + WS handshake (no audio).** Get JWT → `POST /api/session` →
open WS → `session_start` → receive `ack`. *Test: connection acks.*

**M2 — Mic capture → raw PCM streaming (no VAD).** Stream every frame as binary; handle
inbound `transcript` + MP3. *Test: speak → transcript → hear reply. First working loop
(continuous/expensive — fine for now).*

**M3 — Audio playback queue.** Buffer + play inbound MP3 chunks in order; track
`coachSpeaking`. *Test: coach audio plays smoothly.*

**M4 — App-action handling.** Dispatch `app_action` packets to UI (`start_timer`,
`log_set`, `swap_exercise`, …). *Test: "done, 8 reps at 135" → set appears AND timer starts.*

**M5 — The VAD gate (the cost saver).** Load Silero; keep a ~300ms pre-roll buffer; stream
frames only on speech, send `KeepAlive` on silence. *Test: Deepgram usage drops during rest.*

**M6 — Wire into `VoiceCoachScreen` + teardown.** Replace the mock with `useVoiceSession()`;
on exit send `session_end`, stop mic, close WS, `DELETE /api/session/{id}`.
*Test: full end-to-end on a real device.*

> M1–M4 give a fully working voice coach; M5 is a pure optimization on top. Ship working, then make it cheap.

---

## 5. The `useVoiceSession()` state machine

Two coordinated machines. **Machine A** (conversation phase) is driven by WS messages and
`start()/stop()`. **Machine B** (mic gate) is driven by client-side VAD and is only active
while Machine A permits it. Keeping them separate avoids conflating "am I sending bytes"
with "whose turn is it."

### Machine A — Conversation phase

```
        start()                ack                VAD speech OR mic active
 idle ──────────► connecting ───────► listening ─────────────────────────┐
   ▲                   │                  ▲  │                            │
   │             error │            done  │  │ {transcript}               │
   │ stop()            ▼                  │  ▼                            │
   └──────────────── error ◄──────────┐  thinking                        │
                       ▲              │     │                             │
                       │ {error}      │     │ first MP3 / text / action   │
              (any state) ────────────┘     ▼                             │
                                       coach_speaking ◄───────────────────┘
                                            │  {done}
                                            └────────► listening
```

| State | Meaning | Mic gate (Machine B) |
|---|---|---|
| `idle` | not connected | off |
| `connecting` | REST session + WS handshake in flight | off |
| `listening` | connected, waiting for the user to speak | **active** (VAD-gated) |
| `thinking` | utterance sent; agent is working | active but usually **muted** (utterance already captured) |
| `coach_speaking` | receiving/playing TTS | **muted** (half-duplex — avoid echo & wasted Deepgram) |
| `error` | failure; recoverable via retry/stop | off |

### Machine A transitions

| From | Trigger | To | Side effects |
|---|---|---|---|
| `idle` | `start()` | `connecting` | `POST /api/session`, open WS, send `session_start` |
| `connecting` | `ack` received | `listening` | start mic + VAD; begin KeepAlive-on-silence |
| `connecting` | error / timeout | `error` | surface message |
| `listening` | `{transcript}` received | `thinking` | display transcript; mute mic |
| `thinking` | first MP3 / `text_delta` / `app_action` | `coach_speaking` | play audio; dispatch actions; keep mic muted |
| `coach_speaking` | `{app_action}` | `coach_speaking` | dispatch to UI (timer/log/swap) |
| `coach_speaking` | `{done}` | `listening` | drain playback; **unmute** mic; resume VAD |
| any | `{error}` | `error` | stop streaming; surface |
| any | `stop()` | `idle` | `session_end`, close WS, stop mic, `DELETE /api/session/{id}` |
| `error` | `retry()` / `stop()` | `connecting` / `idle` | |

### Machine B — Mic gate (only runs while Machine A is `listening`)

```
                VAD: speech (flush preroll)
   silent ───────────────────────────────► streaming
   (KeepAlive)  ◄─────────────────────────  (send PCM frames)
                VAD: silence (endpoint)

   forced ─► muted   (whenever Machine A is thinking / coach_speaking / off)
```

| Sub-state | Behavior |
|---|---|
| `muted` | mic captured but nothing sent (Machine A is thinking / coach speaking) |
| `silent` | listening for speech; send periodic `KeepAlive` so the socket stays open without billing |
| `streaming` | VAD positive → flush pre-roll once, then stream PCM frames to the WS |

**Coordination rule:** Machine B is `muted` unless Machine A is `listening`. Within
`listening`, VAD flips B between `silent` and `streaming`. The authoritative "utterance
complete" signal is the backend's `{transcript}` (Deepgram `speech_final`), **not** the
client VAD — client VAD only decides which bytes to send.

---

## 6. Edge cases & policies

- **First-word clipping** → pre-roll buffer: always keep the last ~300ms; flush it when VAD
  first fires so Deepgram gets the whole utterance ("eight reps", not "…ght reps").
- **Barge-in (user talks over the coach)** → backend already drops overlapping speech via
  the `_busy` flag in `voice.py`, so the client can stay half-duplex (mic muted while
  `coach_speaking`). A future full-duplex upgrade would unmute and let the user interrupt.
- **Rest-timer policy (extra savings)** → optionally fully pause the mic (not just VAD-gate)
  while a `start_timer` action is counting down — no coaching happens mid-rest anyway.
- **Network drop / reconnect** → on WS close mid-session, re-open and re-send `session_start`
  with the same `session_id`; the backend session state (history, sets) persists in Supabase.
- **Permission denied** → transition to `error` with a "mic access needed" message; never
  silently sit in `connecting`.
- **Reconnect churn** → during silence, use `KeepAlive`, not open/close, to keep the socket warm.

---

## 7. Format contract (do not drift)

| Direction | Format |
|---|---|
| Client → Server (mic) | Linear16 PCM, **16000 Hz, mono, 16-bit** |
| Server → Client (coach) | MP3 |

These must match `voice.py`'s `LiveOptions(encoding="linear16", sample_rate=16000, channels=1)`
and the ElevenLabs `output_format`. A mismatch produces garbled or silent audio with no error.

---

## 8. Nice property

None of this touches the backend. `voice.py` / `voice_ws.py` don't care *why* audio arrives —
they process whatever frames come in. The entire VAD/cost optimization is a client-side gate
in front of the pipe that already exists.
