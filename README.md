# JARVIS 1.1 - Personal Goal Tracking Dashboard

A personal dashboard designed to track daily goals, routines, and schedules. Built with raw HTML, CSS, and Vanilla JavaScript.

## Overview

This project is a web-based dashboard with an integrated terminal-style interface designed to help you stay organized. It operates entirely on the client side using a simple local structure and dynamically generates your schedule from JSON configuration files.

## Features

- **Chronometric Watch Header**: A sophisticated, concentric-ring date display where years, months, and days rotate to align the current date vertically at the 12 o'clock position.
- **Arc Reactor UI**: Custom SVG-based progress rings and loading spinners that mimic the Arc Reactor energy signatures.
- **Dynamic Schedule**: Automatically generates a daily timeline based on your goals defined in `data/goals.json`.
- **Configurable**: Easy-to-edit JSON files for managing goals and application settings.

## Installation & Setup

1. **Clone the Repository**
   ```bash
   git clone https://github.com/yourusername/Jarvis-1.1.git
   cd Jarvis-1.1
   ```

2. **Run the Dashboard**
   - Simply open `web/index.html` in any modern web browser.
   - *Optional*: For a better development experience (to avoid CORS issues with JSON fetching), run a simple local server:
     ```bash
     # Python 3
     python -m http.server 8000
     
     # Node.js (http-server)
     npx http-server .
     ```

## Terminal Help
```bash
     # For command list
     node jarvis.js help 
     ```
## Project Structure

```text
Jarvis-1.1/
├── data/               # Configuration files
│   ├── goals.json      # Define your daily goals and tasks
│   └── config.json     # App settings
├── web/                # Frontend assets
│   ├── index.html      # Main entry point
│   ├── styles.css      # All styling and animations
│   └── app.js          # UI logic, animation controllers, and rendering
├── src/                # Core logic (node/backend compatible helpers)
│   ├── goalsManager.js
│   └── configManager.js
└── README.md           # Documentation
```
