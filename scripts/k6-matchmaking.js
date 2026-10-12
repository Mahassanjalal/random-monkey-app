import http from 'k6/http';
import { check, sleep } from 'k6';
// k6 run scripts/k6-matchmaking.js — tune VUs to simulate queue pressure.
export const options = { stages: [{ duration: '2m', target: 200 }, { duration: '3m', target: 1000 }] };
export default function () {
  const r = http.get(`${__ENV.API_URL || 'http://127.0.0.1:3001'}/health/ready`);
  check(r, { 'ready 200/503': (x) => x.status === 200 || x.status === 503 });
  sleep(1);
}
