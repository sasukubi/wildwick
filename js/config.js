// =============================================================
//  Online accounts (Supabase)
//  Leave these empty to keep accounts in this browser only.
//  Once you've followed SETUP.md, paste your project's URL and
//  "anon public" key here, and accounts go online.
// =============================================================
export const SUPABASE_URL = 'https://bswwmeuxjqxzyumitjsv.supabase.co';
// the public "publishable" key (safe to share: the database's security rules decide what it can do)
export const SUPABASE_ANON_KEY = 'sb_publishable_KQFerb1TqatF7P_bCPlmsw_q9HwbLsP';

// =============================================================
//  Relay server (TURN) for joining friends on strict networks.
//  Players normally connect directly; when a router or firewall
//  blocks that, game data goes through this relay instead.
//  Paste the TURN details from your relay account here, e.g.
//    { urls: 'turn:global.relay.metered.ca:80', username: '...', credential: '...' }
// =============================================================
export const RELAY_SERVERS = [];
