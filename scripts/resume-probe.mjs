// Verifies the reconnect grace: A+B match → A socket drops → B gets
// match:peer_reconnecting → A reconnects + match:resume → B gets
// match:peer_reconnected and A's ack is ok.
import { io } from 'socket.io-client';
const BASE = 'http://127.0.0.1:3001';
const stamp = Date.now();
const api = (p, o = {}, t) =>
  fetch(BASE + p, {
    ...o,
    headers: { 'Content-Type': 'application/json', ...(t ? { Authorization: `Bearer ${t}` } : {}) },
  }).then((r) => r.json().catch(() => ({})));
const reg = (u) =>
  api('/auth/register', {
    method: 'POST',
    body: JSON.stringify({
      username: u,
      email: u + '@ex.com',
      password: 'ValidPass123',
      birthDate: '1990-05-10',
      gender: 'FEMALE',
      acceptedTermsAt: new Date().toISOString(),
    }),
  });

let pass = 0,
  fail = 0;
const check = (name, cond) => {
  console.log(`${name}: ${cond ? 'PASS' : 'FAIL'}`);
  cond ? pass++ : fail++;
};

const A = await reg('res_a_' + stamp);
const B = await reg('res_b_' + stamp);
const sA = io(BASE, { auth: { token: A.tokens.accessToken }, transports: ['websocket'], reconnection: false });
const sB = io(BASE, { auth: { token: B.tokens.accessToken }, transports: ['websocket'], reconnection: false });

const events = { aFound: null, bFound: null, bReconnecting: 0, bReconnected: 0 };
sB.on('match:peer_reconnecting', () => events.bReconnecting++);
sB.on('match:peer_reconnected', () => events.bReconnected++);
sA.onAny(() => {});
sB.onAny(() => {});

await new Promise((r) => setTimeout(r, 1200));
const join = (s) => new Promise((res) => s.emit('queue:join', { mode: 'TEXT' }, res));
sA.on('match:found', (p) => (events.aFound = p));
sB.on('match:found', (p) => (events.bFound = p));
await join(sA);
await join(sB);
await new Promise((r) => setTimeout(r, 3500));
check('match found for both', !!events.aFound && !!events.bFound);
const matchId = events.aFound?.matchId;

// A drops (simulates mobile blip)
sA.io.opts.reconnection = false;
sA.disconnect();
await new Promise((r) => setTimeout(r, 1500));
check('B told peer is reconnecting', events.bReconnecting === 1);

// A comes back on a NEW socket and resumes
const sA2 = io(BASE, { auth: { token: A.tokens.accessToken }, transports: ['websocket'], reconnection: false });
await new Promise((r) => setTimeout(r, 1200));
const resumeAck = await new Promise((res) => sA2.emit('match:resume', { matchId }, res));
check('resume ack ok', resumeAck?.ok === true);
await new Promise((r) => setTimeout(r, 1200));
check('B told peer reconnected', events.bReconnected === 1);

// A can still chat after resume
const chatAck = await new Promise((res) =>
  sA2.emit('chat:message', { matchId, text: 'back online!', kind: 'text' }, res),
);
check('chat works after resume', chatAck?.ok === true);

sA2.close();
sB.close();
console.log(`--- resume probe: ${pass} pass / ${fail} fail ---`);
process.exit(fail ? 1 : 0);
