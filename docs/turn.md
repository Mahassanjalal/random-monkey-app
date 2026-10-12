# TURN

- Dev: STUN `stun:stun.l.google.com:19302` works for most NATs.
- Prod/NAT-heavy mobile: deploy `coturn` per region, set `TURN_URL/USERNAME/CREDENTIAL`; backend includes them in `match:found` `iceServers`.
- Frontend falls back `polling→websocket` for signaling and uses adaptive bitrate (mobile 640x480) to survive constrained networks.
