// =============================================================
//  Networking with PeerJS (peer-to-peer, no server of our own).
//  The host opens a room with a 5-letter code; friends join it.
//  PeerJS's free public server only helps the browsers find each
//  other. After that, game data goes directly between players.
// =============================================================
/* global Peer */

const PREFIX = 'wildwick-v1-';
const LETTERS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

function makeCode() {
  let s = '';
  for (let i = 0; i < 5; i++) s += LETTERS[Math.floor(Math.random() * LETTERS.length)];
  return s;
}

function friendly(err) {
  const t = err && err.type;
  if (t === 'network' || t === 'server-error' || t === 'socket-error') return 'Could not reach the matchmaking server. Check your internet connection.';
  if (t === 'browser-incompatible') return 'This browser does not support online play. Try Chrome, Edge or Firefox.';
  return 'Connection problem: ' + (err && err.message ? err.message : t || 'unknown');
}

function ensurePeer() {
  if (typeof Peer === 'undefined') throw new Error('The networking library did not load. Check your internet connection and refresh.');
}

// preferred: a code to try first (your last code, or one you typed). If it's busy, a random one is used.
export function hostRoom(preferred = null) {
  ensurePeer();
  return new Promise((resolve, reject) => {
    let tries = 0;
    let want = preferred && /^[A-Z0-9]{5}$/.test(preferred) ? preferred : null;
    const attempt = () => {
      const code = want || makeCode();
      const wasPreferred = !!want;
      want = null;
      const peer = new Peer(PREFIX + code, { debug: 1 });
      const conns = new Map();
      let opened = false;
      const room = {
        isHost: true,
        code,
        codeChanged: !!preferred && !wasPreferred,
        handlers: {},
        broadcast(msg) { for (const c of conns.values()) if (c.open) c.send(msg); },
        sendTo(id, msg) { const c = conns.get(id); if (c && c.open) c.send(msg); },
        kick(id) { const c = conns.get(id); if (c) c.close(); },
        close() { room.closing = true; peer.destroy(); },
      };
      peer.on('open', () => { opened = true; resolve(room); });
      peer.on('connection', (conn) => {
        conn.on('open', () => conns.set(conn.peer, conn));
        conn.on('data', (d) => room.handlers.data && room.handlers.data(conn.peer, d));
        conn.on('close', () => { if (conns.delete(conn.peer) && room.handlers.leave) room.handlers.leave(conn.peer); });
        conn.on('error', () => {});
      });
      peer.on('disconnected', () => {
        // lost the matchmaking server (players already in stay connected); try to get it back
        if (!room.closing) setTimeout(() => { try { peer.reconnect(); } catch (e) { /* ignore */ } }, 2000);
      });
      peer.on('error', (err) => {
        if (!opened && err.type === 'unavailable-id' && tries++ < 6) { peer.destroy(); attempt(); }
        else if (!opened) { peer.destroy(); reject(new Error(friendly(err))); }
        else console.warn('PeerJS:', err.type, err);
      });
    };
    attempt();
  });
}

export function joinRoom(code) {
  ensurePeer();
  return new Promise((resolve, reject) => {
    const peer = new Peer({ debug: 1 });
    let done = false;
    const fail = (msg) => { if (done) return; done = true; clearTimeout(timer); peer.destroy(); reject(new Error(msg)); };
    const timer = setTimeout(() => fail('Could not reach that room. Check the code and try again.'), 12000);
    peer.on('open', () => {
      const conn = peer.connect(PREFIX + code, { reliable: true, serialization: 'json' });
      const room = {
        isHost: false,
        code,
        handlers: {},
        send(msg) { if (conn.open) conn.send(msg); },
        close() { room.closing = true; peer.destroy(); },
      };
      conn.on('open', () => { if (done) return; done = true; clearTimeout(timer); resolve(room); });
      conn.on('data', (d) => room.handlers.data && room.handlers.data(d));
      conn.on('close', () => { if (!room.closing && room.handlers.close) room.handlers.close(); });
    });
    peer.on('error', (err) => {
      if (!done) fail(err.type === 'peer-unavailable' ? 'No room with that code. Check the code and try again.' : friendly(err));
      else console.warn('PeerJS:', err.type, err);
    });
  });
}
