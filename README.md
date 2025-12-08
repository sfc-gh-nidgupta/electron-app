ElectronChat
============

Setup
-----
1) Create a `.env` file next to `package.json`:

PROVIDER=shell
# If you want OpenAI later:
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
- To switch to OpenAI, set `PROVIDER=openai` and define `OPENAI_API_KEY` in `.env`.
- Secure preload bridge (`preload.js`) exposes `window.api.sendChat(messages, model)`; in shell mode it executes the latest user message as a command.


