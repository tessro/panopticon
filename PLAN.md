# Overview

This is a PLAN file for Panopticon, an assistant tool for Terra Invicta playthroughs. Its primary goal is to simplify decision-making through various data browsers and visualizations. It may also allow the user to state things about their playthrough, such as selecting their faction so councilor costs are properly computed.

## Technologies

This is an SPA. There is no backend. Data persistence is achieved via browser technologies.

Technologies:
* mise
* Node LTS (24, as of early 2026)
* pnpm (via corepack)
* Vite
* TypeScript
* React
	* `motion` for animations
	* `shadcn` for UI components
	* `visx` for visualizations
* make
* oxlint w/oxfmt

Please check the package registry and be sure to use the latest versions of each package.

## Deployment

GitHub Pages via GitHub Actions.

## Data Sources

The SPA gets its data from the installed game files, which are available in `C:\Program Files (x86)\Steam\steamapps\common\Terra Invicta\TerraInvicta_Data\StreamingAssets\Templates`. For simplicity of packaging, it should use a make command to copy these files into a local `data` directory, which the user can run when the game has been updated.

# Visual Style

You tend to converge toward generic, "on distribution" outputs. In frontend design, this creates what users call the "AI slop" aesthetic. Avoid this: make creative, distinctive frontends that surprise and delight. Remember that Terra Invicta is a space sci-fi strategy game set in the near future.

Focus on:
 * Typography: Choose fonts that are beautiful, unique, and interesting. Avoid generic fonts like Arial and Inter; opt instead for distinctive choices that elevate the frontend's aesthetics.
 * Color & Theme: Commit to a cohesive aesthetic. Use CSS variables for consistency. Dominant colors with sharp accents outperform timid, evenly-distributed palettes. Draw from IDE themes and cultural aesthetics for inspiration.
 * Motion: Use animations for effects and micro-interactions. Prioritize CSS-only solutions for HTML. Use Motion library for React. Focus on high-impact moments: one well-orchestrated page load with staggered reveals (animation-delay) creates more delight than scattered micro-interactions.
 * Backgrounds: Create atmosphere and depth rather than defaulting to solid colors. Layer CSS gradients, use geometric patterns, or add contextual effects that match the overall aesthetic.
 
Avoid generic AI-generated aesthetics:
- Overused font families (Inter, Roboto, Arial, system fonts)
- Clichéd color schemes (particularly purple gradients on white backgrounds)
- Predictable layouts and component patterns
- Cookie-cutter design that lacks context-specific character
 
Interpret creatively and make unexpected choices that feel genuinely designed for the context. Vary between light and dark themes, different fonts, different aesthetics. You still tend to converge on common choices (Space Grotesk, for example) across generations. Avoid this: it is critical that you think outside the box!

# Technical Approach

## Game data

Raw game data should be stored in `data/raw`. You may preprocess it using `jq` or other tools into a format better suited to a specific tool if desired.

## User data model

The user may have many games. They should be able to toggle between them without losing stored state. Each game will have distinct settings, so all game-specific facts like current faction, difficulty, or councilor stats should be keyed by a game ID or object.

# Functionality

## Overall navigation

A nav bar with a list of tools. A means of creating/deleting/switching between games. An overall user settings capability, with things like the user's name and perhaps their avatar, just for personalization.

All navigation state should be marshalled into the URL so it can be bookmarked and survive reloads. This includes which tool is in use and perhaps the state of various aspects of the tool UI.

## Tools

### Councilor Professions

A table view, with each row containing a profession.

Implementation Notes:
* Prioritize data density. This table has many columns. For example, mission names should use angled labels to minimize column width.
* Where ordering is not specified, use ordering from game data files.

### Table Structure

* Professions grouped by primary stat, e.g. Spy/Fixer/Kingpin/Operative in an ESP group.
	* Groupings, in order:
		1. PER
		2. INV
		3. ESP
		4. CMD
		5. ADM
		6. SCI
	* Exceptions:
		* Astronaut should be grouped with PER professions, as its mission makeup is mostly PER.
* Column for primary stat code (e.g. "PER")
* Column for secondary stat code, in diminished visual style
* Current faction affinities indicated as profession name cell highlight:
	* Good: green
	* Bad: red
	* Ban: strikethrough
* Column for cost:
	* Default councilor cost is 60 INF
	* "Good" affinity is half cost (30 INF)
	* "Bad" affinity is 2x cost (120 INF)
	* "Ban" affinity is not permitted
* One column for "Government" trait odds
* One column for "Criminal" trait odds
* One column per mission type:
	* A symbol (e.g. "X") if the mission is supported by that councilor type
	* Mission columns grouped by mission cost (PER, INF, etc.)
	* Groupings, in order:
		1. PER
		2. INV
		3. ESP
		4. CMD
		5. ADM
		6. No stat
		7. SCI/ADM/CMD ("Advise" mission)


