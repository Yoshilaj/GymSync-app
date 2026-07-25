/**
 * Mock GymSync voice backend — for developing the voice client without the real
 * FastAPI server, Supabase, or paid STT/TTS. Speaks the protocol from
 * backend/app/routers/voice_ws.py and the REST shape from session.py.
 *
 *   node tools/mock-voice-server.mjs        # listens on :8000 (override with PORT)
 *
 * REST:  POST /api/session        -> { session: { id } }
 *        DELETE /api/session/:id   -> { status: "ended" }
 * WS:    /ws/voice/:userId?token=  -> ack on session_start, then a scripted turn
 *        (transcript -> app_action -> done) so the client state machine can be
 *        watched end to end. Re-triggers on any {type:"message"} frame.
 *
 * Failure scenarios (SCENARIO env var, or per-connection via
 * {type:"message", text:"scenario:<name>"}):
 *   tts-fail    — turn degrades to text: transcript -> non-fatal error ->
 *                 text_delta x2 -> done (client should show text + notice,
 *                 then return to listening)
 *   fatal-close — fatal error frame, then socket close 1011 (client should
 *                 auto-reconnect exactly once)
 *
 * Also logs incoming {type:"keepalive"} frames and, once per second, the rate
 * of binary mic frames — for eyeballing the VAD gate (≈0/s silent, ≈15/s speaking).
 */
import http from 'node:http';
import { WebSocketServer } from 'ws';

const PORT = Number(process.env.PORT ?? 8000);
const DEFAULT_SCENARIO = process.env.SCENARIO ?? 'normal';
let counter = 0;

const server = http.createServer((req, res) => {
  const send = (code, body) => {
    res.writeHead(code, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(body));
  };

  if (req.method === 'POST' && req.url === '/api/session') {
    let raw = '';
    req.on('data', (c) => (raw += c));
    req.on('end', () => {
      counter += 1;
      const id = `mock-session-${counter}`;
      console.log(`[REST] POST /api/session -> ${id}`);
      send(201, { session: { id, is_active: true, chat_history: [] } });
    });
    return;
  }

  if (req.method === 'DELETE' && req.url?.startsWith('/api/session/')) {
    const id = req.url.split('/').pop();
    console.log(`[REST] DELETE /api/session/${id}`);
    send(200, { status: 'ended', session_id: id });
    return;
  }

  if (req.method === 'GET' && req.url === '/health') {
    send(200, { status: 'ok' });
    return;
  }

  send(404, { error: 'not found' });
});

const wss = new WebSocketServer({ server, path: undefined });

/** Send a list of [delayAfterPreviousMs, frame] steps, logging each. */
function playScript(ws, steps) {
  let delay = 0;
  for (const [dt, msg] of steps) {
    delay += dt;
    setTimeout(() => {
      if (ws.readyState !== ws.OPEN) return;
      if (msg === 'CLOSE_1011') {
        console.log('[WS] -> close 1011');
        ws.close(1011, 'mock fatal');
        return;
      }
      ws.send(JSON.stringify(msg));
      console.log(`[WS] -> ${msg.type}${msg.fatal ? ' (fatal)' : ''}`);
    }, delay);
  }
}

/** Emit one scripted agent turn for the given scenario. */
function scriptedTurn(ws, scenario) {
  if (scenario === 'tts-fail') {
    playScript(ws, [
      [800, { type: 'transcript', text: 'Three... four... five reps.' }],
      [600, {
        type: 'error',
        message: 'Coach voice is unavailable right now — showing text instead.',
        fatal: false,
      }],
      [300, { type: 'text_delta', text: 'Nice set — five clean reps. ' }],
      [300, { type: 'text_delta', text: 'Rest 90 seconds, then go again. ' }],
      [400, { type: 'app_action', action: 'start_timer', duration: 90 }],
      [300, { type: 'done' }],
    ]);
    return;
  }
  if (scenario === 'fatal-close') {
    playScript(ws, [
      [800, { type: 'error', message: 'Speech recognition dropped.', fatal: true }],
      [200, 'CLOSE_1011'],
    ]);
    return;
  }
  playScript(ws, [
    [800, { type: 'transcript', text: 'Three... four... five reps.' }],
    [1400, { type: 'app_action', action: 'start_timer', duration: 90 }],
    [1200, { type: 'done' }],
  ]);
}

wss.on('connection', (ws, req) => {
  const url = new URL(req.url ?? '', `http://localhost:${PORT}`);
  const match = url.pathname.match(/^\/ws\/voice\/(.+)$/);
  if (!match) {
    ws.close(1008, 'bad path');
    return;
  }
  const userId = decodeURIComponent(match[1]);
  let scenario = DEFAULT_SCENARIO;
  console.log(
    `[WS] connected user=${userId} token=${url.searchParams.has('token')} scenario=${scenario}`,
  );

  // Binary mic-frame rate meter: one line per second while frames arrive.
  let binaryCount = 0;
  const rateTimer = setInterval(() => {
    if (binaryCount > 0) {
      console.log(`[WS] mic frames: ${binaryCount}/s`);
      binaryCount = 0;
    }
  }, 1000);

  ws.on('message', (data, isBinary) => {
    if (isBinary) {
      binaryCount += 1;
      return;
    }
    let msg;
    try {
      msg = JSON.parse(data.toString());
    } catch {
      ws.send(JSON.stringify({ type: 'error', message: 'Invalid JSON' }));
      return;
    }
    console.log(`[WS] <- ${msg.type}`);
    if (msg.type === 'session_start') {
      ws.send(JSON.stringify({ type: 'ack', session_id: msg.session_id, voice: !!msg.voice }));
      scriptedTurn(ws, scenario); // auto-demo a full turn right after the handshake
    } else if (msg.type === 'message') {
      const scenarioCmd = /^scenario:(\S+)$/.exec(msg.text ?? '');
      if (scenarioCmd) {
        scenario = scenarioCmd[1];
        console.log(`[WS] scenario -> ${scenario}`);
        return;
      }
      ws.send(JSON.stringify({ type: 'transcript', text: msg.text }));
      scriptedTurn(ws, scenario);
    } else if (msg.type === 'keepalive') {
      // VAD gate closed on the client — just log it (real server pings Deepgram).
    } else if (msg.type === 'session_end') {
      ws.send(JSON.stringify({ type: 'ack' }));
    }
  });

  ws.on('close', () => {
    clearInterval(rateTimer);
    console.log(`[WS] closed user=${userId}`);
  });
});

server.listen(PORT, () => {
  console.log(`Mock voice backend on http://localhost:${PORT}  (ws://localhost:${PORT}/ws/voice/:userId)`);
  console.log(`Scenario: ${DEFAULT_SCENARIO} (SCENARIO=tts-fail|fatal-close|normal)`);
});
