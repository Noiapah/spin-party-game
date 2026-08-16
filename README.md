# Spin & Spill

A dependency-free, phone-first truth-or-dare game with truth, dare, and wildcard prompts, designed for static hosting on GitHub Pages.

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

Every prompt in `questions.js` has a unique ID, type, category, minimum player count, and text. Truths and dares additionally have an intensity from 1–6; wildcards do not use intensity. Used IDs are held in memory for the current game, so a prompt cannot repeat. Every Truth or Dare selection has a 5% chance to become an eligible wildcard instead. Every tenth displayed card overrides the normal draw with an “Everyone drinks” milestone card.

Prompt scores use six content bands: Easy, Personal, Spicy, Adult, Chaos, and Finale. The desired intensity still changes continuously with elapsed game time using a smoothstep curve, building toward the maximum selected during setup. Gaussian proximity weighting blends neighboring bands, while a continuous early-game guard keeps levels 5–6 out of the opening portion. Recently seen categories receive a temporary variety penalty. This is weighted random sampling, not discrete rounds.

To add content, copy an entry in `questions.js`, give it a new unique ID, and adjust its metadata. Keep dares safe, legal, consensual, and possible without leaving the game.
