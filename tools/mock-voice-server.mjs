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
 */
import http from 'node:http';
import { WebSocketServer } from 'ws';

const PORT = Number(process.env.PORT ?? 8000);
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

/** Emit one scripted agent turn: transcript -> app_action -> done. */
function scriptedTurn(ws) {
  const steps = [
    [800, { type: 'transcript', text: 'Three... four... five reps.' }],
    [1400, { type: 'app_action', action: 'start_timer', duration: 90 }],
    [1200, { type: 'done' }],
  ];
  let delay = 0;
  for (const [dt, msg] of steps) {
    delay += dt;
    setTimeout(() => {
      if (ws.readyState === ws.OPEN) {
        ws.send(JSON.stringify(msg));
        console.log(`[WS] -> ${msg.type}`);
      }
    }, delay);
  }
}

wss.on('connection', (ws, req) => {
  const url = new URL(req.url ?? '', `http://localhost:${PORT}`);
  const match = url.pathname.match(/^\/ws\/voice\/(.+)$/);
  if (!match) {
    ws.close(1008, 'bad path');
    return;
  }
  const userId = decodeURIComponent(match[1]);
  console.log(`[WS] connected user=${userId} token=${url.searchParams.has('token')}`);

  ws.on('message', (data, isBinary) => {
    if (isBinary) return; // mic PCM frames — ignored by the mock
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
      scriptedTurn(ws); // auto-demo a full turn right after the handshake
    } else if (msg.type === 'message') {
      ws.send(JSON.stringify({ type: 'transcript', text: msg.text }));
      scriptedTurn(ws);
    } else if (msg.type === 'session_end') {
      ws.send(JSON.stringify({ type: 'ack' }));
    }
  });

  ws.on('close', () => console.log(`[WS] closed user=${userId}`));
});

server.listen(PORT, () => {
  console.log(`Mock voice backend on http://localhost:${PORT}  (ws://localhost:${PORT}/ws/voice/:userId)`);
});
