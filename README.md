# Spin & Spill

A dependency-free, phone-first truth-or-dare game with 336 prompts, designed for static hosting on GitHub Pages.

## Run locally

You can open `index.html` directly, or serve the folder so browser behavior matches GitHub Pages:

```powershell
python -m http.server 8080
```

Then open `http://localhost:8080`.

## Publish on GitHub Pages

1. Push these files to a GitHub repository.
2. Open **Settings → Pages**.
3. Under **Build and deployment**, choose **Deploy from a branch**.
4. Select the main branch and `/ (root)`, then save.

No build command or framework is required.

## How prompt selection works

Every prompt in `questions.js` has a unique ID, type, category, intensity from 1–100, minimum player count, and text. Used IDs are held in memory for the current game, so a prompt cannot repeat.

The desired intensity changes continuously with elapsed game time using a smoothstep curve. Eligible prompts receive more weight when their intensity is close to that target. A small exploration weight keeps the order surprising, and prompts from recently seen categories get a temporary penalty. This is weighted random sampling, not discrete rounds or difficulty tiers.

To add content, copy an entry in `questions.js`, give it a new unique ID, and adjust its metadata. Keep dares safe, legal, consensual, and possible without leaving the game.
