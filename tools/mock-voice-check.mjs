/**
 * Headless verification of the voice protocol + mock server. Starts the mock
 * in-process, then drives it exactly as src/voice/useVoiceSession.ts would
 * (POST /api/session -> WS -> session_start), and asserts the message sequence.
 *
 *   node tools/mock-voice-check.mjs   # exits 0 on PASS, 1 on FAIL
 *
 * Uses Node's global fetch + WebSocket (Node 22) — no extra deps.
 */
const PORT = 8099;
process.env.PORT = String(PORT);
await import('./mock-voice-server.mjs');
await new Promise((r) => setTimeout(r, 300)); // let the server bind

const base = `http://localhost:${PORT}`;
const received = [];
const EXPECTED = ['ack', 'transcript', 'app_action', 'done'];

function fail(msg) {
  console.error(`\n❌ FAIL: ${msg}`);
  console.error(`   received: [${received.join(', ')}]`);
  process.exit(1);
}

// 1. Create a session over REST (as the hook does).
const res = await fetch(`${base}/api/session`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json', Authorization: 'Bearer dummy' },
  body: JSON.stringify({ plan_id: null }),
});
if (!res.ok) fail(`POST /api/session returned HTTP ${res.status}`);
const { session } = await res.json();
if (!session?.id) fail('no session.id in response');
console.log(`✓ REST session created: ${session.id}`);

// 2. Open the voice socket and run the handshake.
const ws = new WebSocket(`ws://localhost:${PORT}/ws/voice/mock-user?token=dummy`);
ws.binaryType = 'arraybuffer';

const timeout = setTimeout(() => fail('timed out waiting for the scripted turn'), 6000);

ws.onopen = () => {
  console.log('✓ WS open — sending session_start');
  ws.send(JSON.stringify({ type: 'session_start', session_id: session.id, voice: true }));
};

ws.onmessage = (ev) => {
  if (typeof ev.data !== 'string') return;
  const msg = JSON.parse(ev.data);
  received.push(msg.type);
  console.log(`✓ received: ${msg.type}`);
  if (msg.type === 'done') {
    clearTimeout(timeout);
    ws.close();
    const ok =
      received.length === EXPECTED.length &&
      EXPECTED.every((t, i) => received[i] === t);
    if (!ok) fail(`sequence mismatch — expected [${EXPECTED.join(', ')}]`);
    console.log('\n✅ PASS — handshake + full turn sequence verified');
    process.exit(0);
  }
};

ws.onerror = (e) => fail(`WebSocket error: ${e?.message ?? e}`);
