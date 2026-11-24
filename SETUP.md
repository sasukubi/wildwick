# Turning on online accounts (Supabase)

Right now accounts and characters are saved **in each player's own browser**. That works for testing, but your characters won't follow you to another computer.
These steps move accounts online, for free, so your characters work wherever you play. It takes about 10 minutes, and you only do it once (just the person who owns the game).

1. Go to **supabase.com**, sign up (free), and click **New project**. Pick any name (e.g. `wildwick`), set a database password (save it somewhere), and choose the region closest to you.
2. Wait for the project to finish setting up (a minute or two).
3. Left sidebar → **SQL Editor** → **New query**. Open `supabase/setup.sql` from this folder, copy all of it, paste it in, and click **Run**. You should see "Success".
4. Left sidebar → **Authentication** → **Sign In / Providers** (or **Providers**) → **Email**:
   - Leave Email **enabled**.
   - Turn **"Confirm email" OFF**, then save.
   (Wildwick uses usernames, not real emails, so confirmation emails can't be delivered.)
5. Left sidebar → **Project Settings** → **API** (or **Data API**). Copy:
   - the **Project URL**
   - the **anon public** key (NOT the `service_role` key, which must stay secret)
6. Open `js/config.js` and paste them in:
   ```js
   export const SUPABASE_URL = 'https://xxxxxxxx.supabase.co';
   export const SUPABASE_ANON_KEY = 'eyJ...';
   ```
7. Put the update online (ask Claude to push it). Everyone creates their account again (old browser-only accounts don't carry over).

The anon key is meant to be public. The security rules from `setup.sql` make sure each player can only read and change their own characters.
