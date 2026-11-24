// =============================================================
//  Accounts and saved characters.
//  LocalBackend: stored in this browser (used until Supabase is set up).
//  SupabaseBackend: stored online, so characters work on any computer.
//  Passwords are never stored as plain text.
// =============================================================
import { SUPABASE_URL, SUPABASE_ANON_KEY } from './config.js';

export const MAX_CHARACTERS = 6;

export function validateUsername(u) {
  return /^[A-Za-z0-9_]{3,16}$/.test(u) ? null : 'Usernames are 3–16 letters, numbers or underscores.';
}
export function validatePassword(p) {
  return p.length >= 6 ? null : 'Passwords need at least 6 characters.';
}

const b64 = {
  enc: (bytes) => btoa(String.fromCharCode(...bytes)),
  dec: (s) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0)),
};

async function hashPassword(password, salt) {
  if (!window.crypto || !crypto.subtle) {
    throw new Error('Start the game with "Start Wildwick.bat" (it opens http://localhost). Double-clicking index.html will not work.');
  }
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(password), 'PBKDF2', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits({ name: 'PBKDF2', salt, iterations: 150000, hash: 'SHA-256' }, key, 256);
  return b64.enc(new Uint8Array(bits));
}

class LocalBackend {
  constructor() {
    this.note = 'Accounts are saved in this browser for now. Online accounts turn on once Supabase is set up.';
    this.username = null;
  }
  _accounts() {
    try { return JSON.parse(localStorage.getItem('wildwick.accounts') || '{}'); } catch { return {}; }
  }
  async restore() {
    const u = localStorage.getItem('wildwick.session');
    if (u && this._accounts()[u.toLowerCase()]) { this.username = u; return u; }
    return null;
  }
  async signUp(u, p) {
    const err = validateUsername(u) || validatePassword(p);
    if (err) throw new Error(err);
    const acc = this._accounts();
    const key = u.toLowerCase();
    if (acc[key]) throw new Error('That username is taken.');
    const salt = crypto.getRandomValues(new Uint8Array(16));
    acc[key] = { name: u, salt: b64.enc(salt), hash: await hashPassword(p, salt) };
    localStorage.setItem('wildwick.accounts', JSON.stringify(acc));
    this._login(u);
  }
  async logIn(u, p) {
    const a = this._accounts()[u.toLowerCase()];
    if (!a) throw new Error('Wrong username or password.');
    const h = await hashPassword(p, b64.dec(a.salt));
    if (h !== a.hash) throw new Error('Wrong username or password.');
    this._login(a.name);
  }
  _login(u) { this.username = u; localStorage.setItem('wildwick.session', u); }
  async logOut() { this.username = null; localStorage.removeItem('wildwick.session'); }
  _key() { return 'wildwick.chars.' + this.username.toLowerCase(); }
  async listChars() {
    try { return JSON.parse(localStorage.getItem(this._key()) || '[]'); } catch { return []; }
  }
  _write(list) { localStorage.setItem(this._key(), JSON.stringify(list)); }
  async createChar(c) {
    const list = await this.listChars();
    if (list.length >= MAX_CHARACTERS) throw new Error(`You can have up to ${MAX_CHARACTERS} characters.`);
    const ch = { ...c, id: crypto.randomUUID() };
    list.push(ch);
    this._write(list);
    return ch;
  }
  async saveChar(c) {
    const list = await this.listChars();
    const i = list.findIndex((x) => x.id === c.id);
    if (i >= 0) { list[i] = { ...c }; this._write(list); }
  }
  async deleteChar(id) {
    this._write((await this.listChars()).filter((x) => x.id !== id));
  }
}

class SupabaseBackend {
  constructor() {
    this.note = 'Online account: your characters follow you to any computer.';
    this.username = null;
    this.sb = null;
  }
  async _client() {
    if (!this.sb) {
      const { createClient } = await import('https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.45.4/+esm');
      this.sb = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
    }
    return this.sb;
  }
  // Supabase logs in with an email, so each username gets a placeholder address.
  // No emails are ever sent (email confirmation is switched off, see SETUP.md).
  _email(u) { return `wildwick_${u.toLowerCase()}@example.com`; }
  async restore() {
    const sb = await this._client();
    const { data } = await sb.auth.getSession();
    this.username = data.session?.user?.user_metadata?.username || null;
    return this.username;
  }
  async signUp(u, p) {
    const err = validateUsername(u) || validatePassword(p);
    if (err) throw new Error(err);
    const sb = await this._client();
    const { data, error } = await sb.auth.signUp({ email: this._email(u), password: p, options: { data: { username: u } } });
    if (error) throw new Error(/registered|exists/i.test(error.message) ? 'That username is taken.' : error.message);
    if (!data.session) throw new Error('Supabase is asking for email confirmation. Turn off "Confirm email" (see SETUP.md).');
    this.username = u;
  }
  async logIn(u, p) {
    const sb = await this._client();
    const { data, error } = await sb.auth.signInWithPassword({ email: this._email(u), password: p });
    if (error) throw new Error('Wrong username or password.');
    this.username = data.user?.user_metadata?.username || u;
  }
  async logOut() {
    await (await this._client()).auth.signOut();
    this.username = null;
  }
  async listChars() {
    const sb = await this._client();
    const { data, error } = await sb.from('characters').select('id,data').order('created_at');
    if (error) throw new Error(error.message);
    return data.map((r) => ({ ...r.data, id: r.id }));
  }
  async createChar(c) {
    if ((await this.listChars()).length >= MAX_CHARACTERS) throw new Error(`You can have up to ${MAX_CHARACTERS} characters.`);
    const sb = await this._client();
    const { id, ...rest } = c;
    const { data, error } = await sb.from('characters').insert({ data: rest }).select('id,data').single();
    if (error) throw new Error(error.message);
    return { ...data.data, id: data.id };
  }
  async saveChar(c) {
    const sb = await this._client();
    const { id, ...rest } = c;
    const { error } = await sb.from('characters').update({ data: rest }).eq('id', id);
    if (error) throw new Error(error.message);
  }
  async deleteChar(id) {
    const sb = await this._client();
    const { error } = await sb.from('characters').delete().eq('id', id);
    if (error) throw new Error(error.message);
  }
}

export function createBackend() {
  return SUPABASE_URL && SUPABASE_ANON_KEY ? new SupabaseBackend() : new LocalBackend();
}
