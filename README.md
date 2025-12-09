ElectronChat
============

Setup
-----
1) Create a `.env` file next to `package.json`:

PROVIDER=shell
# Snowflake (optional)
# PROVIDER=snow
# SNOW_CONNECTION=dev
# SHELL_PATH=/bin/zsh
# SHELL_TIMEOUT_MS=120000
# OpenAI (optional)
# PROVIDER=openai
# OPENAI_API_KEY=your_key_here
# OPENAI_MODEL=gpt-4o-mini

2) Install dependencies:

npm install

3) Run the app:

npm run dev

Packaging
---------
Build installers (macOS/Windows/Linux targets configured in package.json):

npm run dist

Notes
-----
- Default provider runs your shell commands via the main process (`providers/shell.js`).
- Snowflake provider (`providers/snowflake.js`) executes SQL via `snow` CLI:
  - Ensure Snowflake CLI is installed and you have a saved connection (e.g. `snow connection add --name dev ...`).
  - Set `PROVIDER=snow`. The "Conn/Model" input can override `SNOW_CONNECTION` per request.
- OpenAI provider: set `PROVIDER=openai` and define `OPENAI_API_KEY` in `.env`.
- Preload bridge exposes `window.api.sendChat(messages, model)`; depending on provider, `model` acts as either an OpenAI model or a Snowflake connection name.


