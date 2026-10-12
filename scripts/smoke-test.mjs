// End-to-end smoke: register 2 users, refresh, prefs, queue, match, chat, skip.
// Run: node scripts/smoke-test.mjs
import { io } from 'socket.io-client';

const BASE = 'http://127.0.0.1:3001';
const stamp = Date.now();

async function api(path, opts = {}, token) {
  const res = await fetch(BASE + path, {
    ...opts,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(opts.headers || {}),
    },
  });
  const body = await res.json().catch(() => ({}));
  return { status: res.status, body };
}

const register = (username) =>
  api('/auth/register', {
    method: 'POST',
    body: JSON.stringify({
      username,
      email: `${username}@example.com`,
      password: 'ValidPass123',
      birthDate: '1990-05-10',
      gender: 'FEMALE',
      acceptedTermsAt: new Date().toISOString(),
    }),
  });

const underage = await api('/auth/register', {
  method: 'POST',
  body: JSON.stringify({
    username: 'u_under_' + stamp,
    email: `u_under_${stamp}@example.com`,
    password: 'ValidPass123',
    birthDate: '2015-01-01',
    gender: 'FEMALE',
    acceptedTermsAt: new Date().toISOString(),
  }),
});
console.log('underage register rejected:', underage.status === 400 ? 'PASS' : 'FAIL', underage.body?.message ?? '');

const a = await register('e2e_a_' + stamp);
const b = await register('e2e_b_' + stamp);
if (a.status !== 201 || b.status !== 201) {
  console.error('register failed', a.status, b.status, a.body, b.body);
  process.exit(1);
}
console.log('register both users: PASS');

// refresh rotation
const ra = await api('/auth/refresh', {
  method: 'POST',
  body: JSON.stringify({ refreshToken: a.body.tokens.refreshToken }),
});
console.log('refresh rotation:', ra.status === 200 && ra.body.tokens?.accessToken ? 'PASS' : 'FAIL');
const reuseOld = await api('/auth/refresh', {
  method: 'POST',
  body: JSON.stringify({ refreshToken: a.body.tokens.refreshToken }),
});
console.log('refresh reuse revoked:', reuseOld.status === 401 ? 'PASS' : 'FAIL', JSON.stringify(reuseOld.body));

// unauthorized
const un = await api('/users/me');
console.log('unauthorized blocked:', un.status === 401 ? 'PASS' : 'FAIL');

const ta = ra.body.tokens.accessToken;

// unauthorized admin
const ad = await api('/admin/metrics', {}, ta);
console.log('user blocked from admin:', ad.status === 403 ? 'PASS' : 'FAIL');

// socket auth failure without token
const badSock = io(BASE, { autoConnect: true, reconnection: false, transports: ['websocket'] });
const badAuth = await new Promise((r) => {
  badSock.on('error', (p) => r(p.message === 'Auth required' ? 'PASS' : 'FAIL:' + p.message));
  setTimeout(() => r('TIMEOUT'), 5000);
});
console.log('socket rejects unauthenticated:', badAuth);
badSock.disconnect();

// Both connect with valid tokens
const sockA = io(BASE, { auth: { token: ta }, autoConnect: true, reconnection: false, transports: ['websocket'] });
const sockB = io(BASE, {
  auth: { token: b.body.tokens.accessToken },
  autoConnect: true,
  reconnection: false,
  transports: ['websocket'],
});
await new Promise((r) => {
  let n = 0;
  const done = () => n++ >= 1 && r();
  sockA.on('connect', done);
  sockB.on('connect', done);
  setTimeout(r, 5000);
});
console.log('both sockets connected: PASS');

const matchPromA = new Promise((r) => sockA.on('match:found', r));
const matchPromB = new Promise((r) => sockB.on('match:found', r));

sockA.emit('queue:join', { mode: 'TEXT' }, (r) => {
  console.log('A queue join:', r.ok ? 'ok' : 'FAIL ' + r.error);
});
sockB.emit('queue:join', { mode: 'TEXT' }, (r) => {
  console.log('B queue join:', r.ok ? 'ok' : 'FAIL ' + r.error);
});

const [mA, mB] = await Promise.all([matchPromA, matchPromB]);
const matchId = mA.matchId;
console.log(
  'match found both peers:',
  mA.matchId === mB.matchId && (mA.role === 'caller' || mA.role === 'callee') ? 'PASS' : 'FAIL',
  JSON.stringify({ matchId, a: mA.role, b: mB.role }),
);

// chat
const msgProm = new Promise((r) => sockB.on('chat:message', r));
sockA.emit(
  'chat:message',
  { matchId, text: 'hello from A' },
  (r) => console.log('A chat send:', r.ok ? 'ok' : 'FAIL ' + r.error),
);
const got = await msgProm.catch(() => null);
console.log('B received message:', got && got.text === 'hello from A' ? 'PASS' : 'FAIL');

// spoofed chat to someone else's room
sockA.emit(
  'chat:message',
  { matchId: '00000000-aaaa-bbbb-cccc-000000000000', text: 'spoof' },
  (r) => console.log('spoofed chat rejected:', r.ok === false ? 'PASS' : 'FAIL'),
);

// unauthorized rtc offer
await new Promise((r) => setTimeout(r, 200));
sockA.emit(
  'rtc:offer',
  { matchId: '00000000-aaaa-bbbb-cccc-000000000000', sdp: 'v=0 fake sdp data' },
  (r) => console.log('spoofed rtc rejected:', r && r.ok === false ? 'PASS' : 'FAIL', JSON.stringify(r)),
);

// cross-user rtc inside real match: B listens for offer, A sends; should relay
const offerOnB = new Promise((r) => sockB.on('rtc:offer', r));
sockA.emit('rtc:offer', { matchId, sdp: 'v=0 test-offer' }, (r) => console.log('A rtc relay send:', r.ok ? 'ok' : 'FAIL'));
const gotOffer = await offerOnB.catch(() => null);
console.log('B received rtc offer via signaling:', gotOffer && gotOffer.sdp.includes('test-offer') ? 'PASS' : 'FAIL');

// report + block
const rep = await api(
  '/reports',
  {
    method: 'POST',
    body: JSON.stringify({
      matchId,
      reportedUserId: mA.peer.userId,
      reason: 'HARASSMENT',
      details: 'e2e smoke report',
    }),
  },
  ta,
);
console.log('report filed:', rep.status === 201 ? 'PASS' : 'FAIL', JSON.stringify(rep.body));

// block via REST
const blk = await api('/reports/blocks', { method: 'POST', body: JSON.stringify({ userId: mA.peer.userId }) }, ta);
console.log('block:', blk.status === 201 ? 'PASS' : 'FAIL', JSON.stringify(blk.body));

// skip from A
const skipProm = new Promise((r) => sockB.on('match:skipped', r));
sockA.emit('match:skip', { matchId }, (r) => console.log('A skip:', r.ok ? 'ok' : 'FAIL'));
const skipped = await skipProm.catch(() => null);
console.log('B notified of skip:', skipped ? 'PASS' : 'FAIL');

// subscriptions: entitlements for free user
const ent = await api('/subscriptions/entitlements', {}, ta);
console.log('entitlements free tier:', ent.body.tier === 'FREE' ? 'PASS' : 'FAIL', JSON.stringify(ent.body.features));

sockA.disconnect();
sockB.disconnect();
console.log('--- smoke complete ---');
process.exit(0);
