# Wildwick

An online co-op roguelite for 1–4 players, set in a dark magical forest.
**Your flame is your health:** taking damage dims your light so you see less, embers relight it, and overhealing builds heat until you burst into **Wildfire** for 2 seconds.

## Play

**https://sasukubi.github.io/wildwick/**. Send this link to your friends; nothing to install.

1. Open the link (Chrome, Edge or Firefox).
2. Create an account (username + password), then make a character.
3. **Host:** click *Host a game* and share the 5-letter room code in Discord.
   **Friends:** click *Join* and type the code.
4. In the campfire lobby you can visit the **wardrobe** (cloak, hat, flame colour) and the **class shrines**. When everyone stands on the glowing path to the north, the run starts.
5. In the Thornwood, fight the thorn-wolves, collect embers, and get everyone to the **Heartwood Gate**.

To run it from this folder instead (for testing changes before they go online), double-click **`Start Wildwick.bat`**. It opens `http://localhost:5317`.

The game keeps running for as long as the **host** has it open. If the host closes it, the room closes.

## Controls

| Action | Keyboard + mouse | Controller |
|---|---|---|
| Move | WASD / arrows | Left stick |
| Aim | Mouse | Right stick |
| Strike (hold to keep swinging) | Left click | RT / RB |
| Dash (dodges bites) | Space / Shift | A |
| Cinder Quake (costs 10 flame) | E / Q / Right click | X / LB / LT |
| Interact (lobby) | F | Y |
| Close menus | Esc | B |

## What's in this first test

- Accounts and up to 6 saved characters each (name, cloak, hat, flame colour, class)
- Campfire lobby with a wardrobe (party cloak colours are unique), six class shrines (only the Warrior works so far) and a ready path
- **Warrior:** sword combo (every 3rd hit is heavy), dash, Cinder Quake, and *Dark Fury* (up to +80% damage as your flame dims)
- **Thorn-wolves:** pack hunters that circle you, then flash and lunge. Watch for the red warning streak.
- Flame health, embers, heat and Wildfire, rekindling downed friends, defeat and victory
- A new random forest every run

## Where things are

| File | What it does |
|---|---|
| `js/data.js` | **All the numbers.** Speeds, damage, cooldowns, colours. Start here to tweak the game. |
| `js/sim.js` | The rules: enemies, damage, healing, Wildfire. Only the host runs this. |
| `js/world.js` | Builds the lobby and the random forest. |
| `js/game.js` | Your character, smoothing of other players, effects. |
| `js/render.js` | All drawing (characters, trees, light and darkness, HUD). |
| `js/net.js` | Online rooms (PeerJS). |
| `js/accounts.js` | Log in and saving characters. |
| `js/main.js` | The menus. |

Accounts are kept in your browser until online accounts are set up. See **SETUP.md**.
