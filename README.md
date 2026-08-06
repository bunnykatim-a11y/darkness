# Light vs Darkness — Endless Survival Game

Light vs Darkness is a high-performance 2D browser survival game built with HTML5 Canvas, Vanilla JavaScript, and Vite.

## Features
- **Multi-layer Parallax Background & Day/Night Sky**: Drifting starfields, volumetric god rays, atmospheric fog, and swaying plant silhouettes.
- **Smooth Camera Tracking**: Interpolated camera system following the player.
- **Unlockable Skins**: 5 player themes (*Light*, *Dark*, *Neon*, *Fire*, *Ice*) unlocked via achievements.
- **Power-Ups & Shadow Enemies**: Collect Shield, Speed Boost, 2x Score, Magnet, and Invincibility while dissolving shadow creatures with your flashlight.
- **Progression & Achievements**: `localStorage` persistence for coins, high scores, best time, and 6 achievements with glassmorphic toast notifications.
- **Glassmorphism UI**: High-end translucent panels, responsive layout, HUD active badges, and graphics settings.

## Project Structure
```
Light-vs-Darkness/
├── index.html
├── package.json
├── package-lock.json
├── vite.config.js
├── .gitignore
├── README.md
├── public/
└── src/
    ├── assets/
    │   ├── images/
    │   └── sounds/
    ├── game/
    │   ├── Background.js
    │   ├── Battery.js
    │   ├── Camera.js
    │   ├── Collision.js
    │   ├── Darkness.js
    │   ├── Enemy.js
    │   ├── Flashlight.js
    │   ├── Game.js
    │   ├── Input.js
    │   ├── Player.js
    │   ├── PowerUp.js
    │   ├── Progression.js
    │   ├── Score.js
    │   ├── Sound.js
    │   ├── UI.js
    │   └── Utils.js
    ├── styles/
    │   └── style.css
    └── main.js
```

## Development & Build

```bash
# Install dependencies
npm install

# Start local dev server
npm run dev

# Build for production (outputs to ./dist)
npm run build

# Preview production build locally
npm run preview
```

## Deployment on Vercel
This repository uses standard Vite project configuration and deploys out-of-the-box on Vercel:
- **Framework Preset**: Vite
- **Build Command**: `npm run build`
- **Output Directory**: `dist`
- **Root Directory**: `./`
