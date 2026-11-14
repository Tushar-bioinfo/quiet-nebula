# Quiet Nebula

A calm dark theme for the Claude desktop app. Behind the app sits a glyph sky: tiny halftone crosses and sparse glyph marks in soft wave bands that travel slowly across the window, with hand-cut asterisk stars that drift and glint one at a time. The panels, accent and glass are colored to match.

Set the app to dark mode in Settings; the theme does not switch it for you.

## Install

At the prompt of a terminal session:

```
/plugin install quiet-nebula --marketplace Tushar-bioinfo/quiet-nebula
```

Answer `y` to add the marketplace, then pick a scope (user is first). From a shell:

```bash
claude plugin install quiet-nebula --marketplace Tushar-bioinfo/quiet-nebula
```

In the desktop app, where `/plugin` does not run: click + next to the prompt box, then Plugins, Add marketplace with `Tushar-bioinfo/quiet-nebula`, then Add plugin.

## Commands

| Command | What it does |
|---|---|
| `/qn` | Show the current settings and help |
| `/qn deep` · `misprint` · `miles` · `noir` | Switch the whole look (sky colors, panels, accent). Default: noir |
| `/qn hue blue` · `ember` | Color family for deep, misprint and miles (noir has its own). Default: blue |
| `/qn motion 0`–`3` | Travel speed: 0 a still picture (cheapest), 1 ≈ 4 min per crossing (default), 2 ≈ 2 min, 3 ≈ 1 min |
| `/qn quiet <0–1>` | Dim the sky behind the chat column. Default: 0 |
| `/qn glass <opacity> [hue\|none\|#rrggbb] [blur]` | The veil over the chat area. Default: 0.65, hue, 0.3 |
| `/qn reset` | Back to the defaults |

Settings last for the session; every new session starts at the defaults. With macOS "Reduce motion" on, the sky is always still.

## Cost

The sky is one SVG built when the session starts (a few milliseconds). Only `opacity` and `transform` animate, in steps, on the compositor, so nothing is repainted. In headless Chrome at 1440×900, 2× scale, motion 1 used about 3–4 % of one CPU core more than a plain color; motion 0 and Reduce motion use about as much CPU as a plain color. Drawing the sky at all, moving or still, holds roughly 100 MB more memory than a plain color. These are browser measurements, not taken inside the desktop app.

## Checks

`claude plugin validate mod/`, `bunx --bun tsc -p mod --noEmit`, `claude plugin test mod/`, and from the project root `bun scripts/check-looks.ts`.
