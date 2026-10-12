import { io } from 'socket.io-client';
const BASE = 'http://127.0.0.1:3001';
const stamp = Date.now();
const api = async (p, o = {}, t) =>
  (await fetch(BASE + p, { ...o, headers: { 'Content-Type': 'application/json', ...(t ? { Authorization: `Bearer ${t}` } : {}) } }).then(r => r.json().catch(() => ({}))));
const reg = (u) => api('/auth/register', { method: 'POST', body: JSON.stringify({ username: u, email: u + '@ex.com', password: 'ValidPass123', birthDate: '1990-05-10', gender: 'FEMALE', acceptedTermsAt: new Date().toISOString() }) });
const A = await reg('qd_a_' + stamp), B = await reg('qd_b_' + stamp);
console.log('registered', A.user?.id, B.user?.id);
const sA = io(BASE, { auth: { token: A.tokens.accessToken }, transports: ['websocket'], reconnection: false });
const sB = io(BASE, { auth: { token: B.tokens.accessToken }, transports: ['websocket'], reconnection: false });
for (const [tag, s] of [['A', sA], ['B', sB]]) {
  s.onAny((ev, ...a) => console.log(`[${tag}]`, ev, JSON.stringify(a).slice(0, 160)));
  s.on('disconnect', (r) => console.log(`[${tag}] disconnect`, r));
  s.on('connect_error', (e) => console.log(`[${tag}] conn_error`, e.message));
}
await new Promise(r => setTimeout(r, 1000));
sA.emit('queue:join', { mode: 'TEXT' }, r => console.log('A ack', JSON.stringify(r)));
await new Promise(r => setTimeout(r, 800));
sB.emit('queue:join', { mode: 'TEXT' }, r => console.log('B ack', JSON.stringify(r)));
await new Promise(r => setTimeout(r, 6000));
console.log('done');
process.exit(0);
