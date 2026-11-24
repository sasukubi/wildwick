# Wildwick

An online co-op roguelite for 1–4 players, set in a dark magical forest.
**Your flame is your health:** taking damage dims your light so you see less, and embers relight it. Each class also has a **Wildfire** ultimate, charged by glowing elite enemies, bosses and Heartwood shrines.

## Play

**https://sasukubi.github.io/wildwick/**. Send this link to your friends; nothing to install.

1. Open the link (Chrome, Edge or Firefox).
2. Create an account (username + password), then make a character.
3. **Host:** click *Host a game* and share the 5-letter room code in Discord.
   **Friends:** click *Join* and type the code.
4. In the campfire lobby, visit the **wardrobe** (cloak, hat, flame colour) and the **class shrines**. When everyone stands on the glowing path to the north, the run starts.
5. A run is **3 forests, then the Elder Treant**. In each forest, defeat the **Alpha Thornwolf** to open the Heartwood Gate, then get everyone inside. Between forests, everyone picks a **boon**.
6. Enemies give the whole party EXP. Each level gives everyone a **skill point** (press **T**).

To run it from this folder instead (for testing changes before they go online), double-click **`Start Wildwick.bat`**. It opens `http://localhost:5317`.

The game keeps running for as long as the **host** has it open. If the host closes it, the room closes.

## Controls

All keys can be changed in **Settings (Esc) > Controls**.

| Action | Keyboard + mouse | Controller |
|---|---|---|
| Move | WASD / arrows | Left stick |
| Aim | Mouse | Right stick |
| Strike / staff (hold to keep swinging) | Left click | RT |
| Warrior: Smoulder Guard (hold to block, let go to counter) · Sorcerer: Gale | Right click | LT |
| Warrior: Cinder Quake · Sorcerer: Fire | E | X |
| Sorcerer: Frost | Q | LB |
| Wildfire ultimate (Pyre Cleave / Starfall) | R | RB |
| Dash (the start of a dash dodges) | Space / Shift | A |
| Interact | F | Y |
| Skill tree | T / Tab | View |
| Settings | Esc | Start |

**Sorcerer weaving:** cast two *different* spells quickly and they fuse: Fire + Frost = Steam Burst (stuns), Fire + Gale = Firestorm (moving fire tornado), Frost + Gale = Blizzard (slowing storm). Spells use mana, which refills on its own.

**Line of sight:** nobody can hit, notice or attack through trees and rocks, you included.

## What's in the game so far

- Accounts and up to 6 saved characters each (name, cloak, hat, flame colour, class). Your **username** is shown above your head.
- Campfire lobby with a wardrobe (party cloak colours are unique), six class shrines (Warrior and Sorcerer work so far) and a ready path.
- **Sorcerer:** a weak staff swing that pushes enemies back, Fire, Frost and Gale spells paid with mana, spell weaving, and the Starfall ultimate.
- **Warrior:**
  - Sword combo (every 3rd hit is heavy) and dash.
  - Cinder Quake: burns some of your flame to slam the ground.
  - Smoulder Guard: block from the front, store the heat, then counter-slash.
  - Dark Fury: up to +80% damage as your flame dims.
  - Pyre Cleave: the Wildfire ultimate, a huge flaming sweep that leaves a burning trail.
- Skill tree with three groups: Fury, Bulwark and Cinder. Plus 10 boons to pick from between stages.
- **Enemies:**
  - Thorn-wolves.
  - Glowing ember-touched elites, which drop Wildfire.
  - The Alpha Thornwolf mini boss, which lunges three times and howls for help.
  - The Elder Treant final boss, which bursts roots up under you, sweeps its branches and calls the pack.
- Original pixel art, sound effects, forest ambience and music (volume in settings).

## Where things are

| File | What it does |
|---|---|
| `js/data.js` | **All the numbers.** Speeds, damage, cooldowns, skill tree, boons. Start here to tweak the game. |
| `js/sim.js` | The rules: enemies, bosses, damage, EXP, Wildfire, stages. Only the host runs this. |
| `js/world.js` | Builds the lobby, the random forests and the boss arena. |
| `js/game.js` | Your character, smoothing of other players, effects, sounds. |
| `js/sprites.js` | All the pixel art, painted by code. |
| `js/render.js` | Drawing the world, light and darkness. |
| `js/hud.js`, `js/ui.js` | The on-screen bars and buttons, skill tree, boons, wardrobe, settings. |
| `js/audio.js` | Sound effects, ambience and music (made by code). |
| `js/net.js` | Online rooms (PeerJS). |
| `js/accounts.js` | Log in and saving characters. |
| `js/main.js` | The menus. |

Accounts are kept in your browser until online accounts are set up. See **SETUP.md**.
