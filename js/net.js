// =============================================================
//  Networking with PeerJS (peer-to-peer, no server of our own).
//  The host opens a room with a 5-letter code; friends join it.
//  PeerJS's free public server only helps the browsers find each
//  other. After that, game data goes directly between players.
// =============================================================
/* global Peer */

import { RELAY_SERVERS } from './config.js';

const PREFIX = 'wildwick-v1-';
// how browsers find a way to each other: several public address-finders (STUN),
// plus a relay (TURN) as a backup for networks that block direct connections
const PEER_OPTS = {
  debug: 1,
  config: {
    iceServers: [
      { urls: ['stun:stun.l.google.com:19302', 'stun:stun1.l.google.com:19302', 'stun:stun.cloudflare.com:3478'] },
      ...RELAY_SERVERS,
    ],
  },
};
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
    let tries = 0, prefTries = 0;
    let want = preferred && /^[A-Z0-9]{5}$/.test(preferred) ? preferred : null;
    const attempt = () => {
      const code = want || makeCode();
      const wasPreferred = !!want;
      const peer = new Peer(PREFIX + code, PEER_OPTS);
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
        if (!opened && err.type === 'unavailable-id') {
          peer.destroy();
          // your code is usually still "held" for a few seconds after your last camp closed:
          // keep trying it for ~10 seconds before giving up and using a random one
          if (wasPreferred && prefTries++ < 7) { setTimeout(attempt, 1500); return; }
          want = null;
          if (tries++ < 6) attempt(); else reject(new Error('Could not open a room. Please try again.'));
        }
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
    const peer = new Peer(PEER_OPTS);
    let done = false;
    const fail = (msg) => { if (done) return; done = true; clearTimeout(timer); peer.destroy(); reject(new Error(msg)); };
    // the room exists but the connection can't get through: usually a router, firewall or VPN blocking it
    const timer = setTimeout(() => fail(RELAY_SERVERS.length
      ? 'Found the room, but could not connect to it. Make sure your friend still has the game open, then try again.'
      : 'Found the room, but your networks would not let you connect directly. Try: your friend reopens their camp, swap who hosts, turn off any VPN, or try a phone hotspot.'), 25000);
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
