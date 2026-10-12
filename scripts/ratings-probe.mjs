// Quick probe for the ratings (karma) API.
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
      email: `${username}@probe.dev`,
      password: 'Passw0rd!123',
      birthDate: '1995-04-12',
      gender: 'FEMALE',
      acceptedTermsAt: new Date().toISOString(),
    }),
  });

let pass = 0, fail = 0;
const check = (name, ok, extra = '') => {
  if (ok) { pass++; console.log(`${name}: PASS ${extra}`); }
  else { fail++; console.log(`${name}: FAIL ${extra}`); }
};

// 1. New user karma is empty
const u1 = (await register(`karma${stamp}`)).body;
const u2 = (await register(`karma${stamp}b`)).body;
check('register both', !!(u1?.tokens?.accessToken && u2?.tokens?.accessToken));
const t1 = u1.tokens.accessToken;
const t2 = u2.tokens.accessToken;

const emptyKarma = await api('/ratings/karma/me', {}, t1);
check('empty karma is null/0', emptyKarma.status === 200 && emptyKarma.body.score === null && emptyKarma.body.ratings === 0, JSON.stringify(emptyKarma.body));

// 2. Connect both sockets, queue + match
function sock(token) {
  return new Promise((resolve, reject) => {
    const s = io(BASE, { auth: { token }, transports: ['polling', 'websocket'] });
    s.on('connect', () => resolve(s));
    s.on('connect_error', reject);
    setTimeout(() => reject(new Error('sock timeout')), 5000);
  });
}
const s1 = await sock(t1);
const s2 = await sock(t2);
let matchId = null;
s1.on('match:found', (p) => (matchId = p.matchId));
s2.on('match:found', (p) => (matchId = p.matchId));
s1.emit('queue:join', { mode: 'TEXT' }, () => {});
s2.emit('queue:join', { mode: 'TEXT' }, () => {});
await new Promise((r) => setTimeout(r, 1500));
check('matched', !!matchId, matchId || 'none');

// 3. Rate the match (u1 rates u2 = 5)
if (matchId) {
  const rate = await api('/ratings', { method: 'POST', body: JSON.stringify({ matchId, score: 5 }) }, t1);
  check('rate match', rate.status < 300 && rate.body.ok === true, JSON.stringify(rate.body));

  // 4. u2's karma should now reflect one 5-star rating
  const karma2 = await api('/ratings/karma/me', {}, t2);
  check('karma after rating', karma2.body.ratings === 1 && karma2.body.score === 5 && karma2.body.positive === 1, JSON.stringify(karma2.body));

  // 5. Re-rating is idempotent (updates)
  const rerate = await api('/ratings', { method: 'POST', body: JSON.stringify({ matchId, score: 4 }) }, t1);
  const karma2b = await api('/ratings/karma/me', {}, t2);
  check('re-rate updates (still 1 rating)', rerate.status < 300 && karma2b.body.ratings === 1 && karma2b.body.score === 4, JSON.stringify(karma2b.body));

  // 6. myRating reflects it
  const myR = await api(`/ratings/match/${matchId}`, {}, t1);
  check('myRating', myR.body.score === 4, JSON.stringify(myR.body));

  // 7. Invalid score rejected
  const bad = await api('/ratings', { method: 'POST', body: JSON.stringify({ matchId, score: 9 }) }, t1);
  check('invalid score rejected', bad.status >= 400, `status=${bad.status}`);
} else {
  check('rate match', false, 'no match');
}

s1.disconnect();
s2.disconnect();
console.log(`--- ratings probe: ${pass} PASS / ${fail} FAIL ---`);
process.exit(fail === 0 ? 0 : 1);
