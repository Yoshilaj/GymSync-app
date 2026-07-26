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
 * Plan flow (no scenario needed): any {type:"message"} whose text mentions
 * "plan" streams text_deltas then a plan_proposal frame; POST
 * /api/plans/:id/accept flips the in-memory active plan that
 * GET /api/plans/active then serves. GET/PUT /api/profile round-trip an
 * in-memory profile (onboarded_at stamps when the required set is complete)
 * so the onboarding flow is testable on simulator with zero backend.
 *
 * Also logs incoming {type:"keepalive"} frames and, once per second, the rate
 * of binary mic frames — for eyeballing the VAD gate (≈0/s silent, ≈15/s speaking).
 */
import http from 'node:http';
import { WebSocketServer } from 'ws';

const PORT = Number(process.env.PORT ?? 8000);
const DEFAULT_SCENARIO = process.env.SCENARIO ?? 'normal';
let counter = 0;

// ── In-memory profile + plan state (REST mocks for onboarding/plan E2E) ─────
const REQUIRED_PROFILE_FIELDS = [
  'sex', 'birth_year', 'height_cm', 'weight_kg', 'activity_level',
  'experience', 'training_days', 'session_minutes',
];
let mockProfile = {
  display_name: 'Mock User', units: 'lbs', experience: null, goals: [],
  preferences: {}, sex: null, birth_year: null, height_cm: null,
  weight_kg: null, activity_level: null, training_days: null,
  session_minutes: null, equipment: [], onboarded_at: null,
};
let activePlanTree = null;
let proposalSeq = 0;

const SAMPLE_PROPOSAL = {
  name: '3-Day Full Body',
  split_type: 'full-body',
  rationale: 'Three full-body days maximize frequency at your schedule; compound-first for efficient sessions.',
  days: [
    { day_label: 'Mon', title: 'Full Body A', est_minutes: 55, exercises: [
      { exercise_id: 'ex-squat', exercise_name: 'Barbell Back Squat', sets: 3, reps_low: 5, reps_high: 8 },
      { exercise_id: 'ex-bench', exercise_name: 'Barbell Bench Press', sets: 3, reps_low: 6, reps_high: 10 },
      { exercise_id: 'ex-row', exercise_name: 'Barbell Row', sets: 3, reps_low: 8, reps_high: 12 },
    ]},
    { day_label: 'Wed', title: 'Full Body B', est_minutes: 55, exercises: [
      { exercise_id: 'ex-deadlift', exercise_name: 'Deadlift', sets: 3, reps_low: 4, reps_high: 6 },
      { exercise_id: 'ex-ohp', exercise_name: 'Overhead Press', sets: 3, reps_low: 6, reps_high: 10 },
      { exercise_id: 'ex-pulldown', exercise_name: 'Lat Pulldown', sets: 3, reps_low: 10, reps_high: 12 },
    ]},
    { day_label: 'Fri', title: 'Full Body C', est_minutes: 50, exercises: [
      { exercise_id: 'ex-lunge', exercise_name: 'Walking Lunge', sets: 3, reps_low: 10, reps_high: 12 },
      { exercise_id: 'ex-incline-db', exercise_name: 'Incline Dumbbell Press', sets: 3, reps_low: 8, reps_high: 12 },
      { exercise_id: 'ex-curl', exercise_name: 'Dumbbell Curl', sets: 3, reps_low: 10, reps_high: 15 },
    ]},
  ],
};

function proposalToTree(proposal) {
  return {
    plan_id: `mock-plan-${++proposalSeq}`,
    name: proposal.name,
    is_active: true,
    workouts: proposal.days.map((d, wi) => ({
      id: `mock-w-${proposalSeq}-${wi}`,
      day_label: d.day_label,
      title: d.title,
      est_minutes: d.est_minutes ?? null,
      sort_order: wi,
      exercises: d.exercises.map((ex, ei) => ({
        exercise_id: ex.exercise_id ?? null,
        exercise_name: ex.exercise_name,
        note: ex.note ?? null,
        sort_order: ei,
        target_sets: Array.from({ length: ex.sets }, (_, i) => ({
          id: `s${i + 1}`,
          exerciseId: ex.exercise_id ?? '',
          targetReps: ex.reps_low,
          ...(ex.reps_high ? { repsHigh: ex.reps_high } : null),
          weight: null,
        })),
      })),
    })),
  };
}

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

  // ── Profile (onboarding E2E) ──────────────────────────────────────────────
  if (req.url === '/api/profile') {
    if (req.method === 'GET') {
      console.log('[REST] GET /api/profile');
      send(200, { profile: mockProfile, onboarded: !!mockProfile.onboarded_at });
      return;
    }
    if (req.method === 'PUT') {
      let raw = '';
      req.on('data', (c) => (raw += c));
      req.on('end', () => {
        try {
          const patch = JSON.parse(raw || '{}');
          delete patch.complete_onboarding;
          mockProfile = { ...mockProfile, ...patch };
          const missing = REQUIRED_PROFILE_FIELDS.filter((f) => mockProfile[f] == null);
          if (!mockProfile.onboarded_at && missing.length === 0 &&
              mockProfile.goals.length && mockProfile.equipment.length) {
            mockProfile.onboarded_at = new Date().toISOString();
          }
          console.log(`[REST] PUT /api/profile (missing: ${missing.join(',') || 'none'})`);
          send(200, { profile: mockProfile, onboarded: !!mockProfile.onboarded_at });
        } catch {
          send(400, { error: 'bad json' });
        }
      });
      return;
    }
  }

  // ── Plans (proposal accept + active plan) ─────────────────────────────────
  if (req.method === 'GET' && req.url === '/api/plans/active') {
    console.log(`[REST] GET /api/plans/active -> ${activePlanTree ? activePlanTree.plan_id : 'null'}`);
    send(200, { plan: activePlanTree });
    return;
  }

  if (req.method === 'GET' && req.url === '/api/plans/proposals/latest') {
    send(200, { proposal: null });
    return;
  }

  const acceptMatch = req.url?.match(/^\/api\/plans\/proposals\/(.+)\/accept$/);
  if (req.method === 'POST' && acceptMatch) {
    activePlanTree = proposalToTree(SAMPLE_PROPOSAL);
    console.log(`[REST] POST accept ${acceptMatch[1]} -> plan ${activePlanTree.plan_id}`);
    send(200, { plan: activePlanTree });
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
      // Any message mentioning "plan" (or the plan scenario) streams a
      // plan_proposal turn — exercises the chat card end to end.
      if (scenario === 'plan' || /plan/i.test(msg.text ?? '')) {
        playScript(ws, [
          [400, { type: 'text_delta', text: "Here's what I'd run for you — " }],
          [400, { type: 'text_delta', text: 'three full-body days, compounds first. ' }],
          [500, {
            type: 'plan_proposal',
            proposal_id: `mock-proposal-${Date.now()}`,
            plan: SAMPLE_PROPOSAL,
            warnings: [],
          }],
          [300, { type: 'done' }],
        ]);
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
