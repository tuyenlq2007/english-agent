# Repository Guidelines

## Project Structure & Module Organization

This repository is a static browser MVP for a Vietnamese-supported English speaking agent. Keep files grouped by responsibility and avoid generated output in the repository root.

Recommended layout:

- `index.html` defines the practice UI.
- `styles.css` contains responsive layout and visual styling.
- `app.js` contains session state, text-to-speech, speech recognition, retry logic, and localStorage persistence.
- `server.js` is the local static server used by the Windows launcher.
- `run.bat` starts the app on Windows.
- `data/books/index.json` is the book manifest; add each book file there.
- `data/books/book-*.json` stores word/sentence data for each book.
- `tests/` should mirror app modules if automated tests are added.
- `assets/` can hold prompts, fixtures, audio, or other static resources.
- `.env.example` for documented configuration keys; keep real secrets in local `.env` files only.

## Build, Test, and Development Commands

No package manager setup is required. Run commands from the repository root.

- `.\run.bat` starts the app on Windows and opens `http://127.0.0.1:5173`.
- `node server.js` starts the static server directly.
- `node --check app.js` and `node --check server.js` validate JavaScript syntax.
- `Get-ChildItem data\books -Filter *.json | ForEach-Object { Get-Content -Raw $_.FullName | ConvertFrom-Json | Out-Null }` validates book JSON on Windows PowerShell.

Prefer scripts in `package.json`, `pyproject.toml`, `Makefile`, or an equivalent single entry point.

## Coding Style & Naming Conventions

Use clear names and keep functions small enough to review comfortably. Use 2-space indentation for HTML, CSS, JavaScript, JSON, YAML, and Markdown.

Use camelCase for JavaScript variables and functions. Use lowercase, hyphenated names for documentation files when practical, for example `docs/pronunciation-scoring.md`.

## Testing Guidelines

Add tests for new behavior and regressions once a test runner is introduced. Prioritize normalization, pass/fail matching, attempt counting, and retry persistence.

Before opening a pull request, run `node --check app.js`, `node --check server.js`, validate book JSON, and manually verify the start, speak, listen, correct, and retry-later flows in a browser.

## Commit & Pull Request Guidelines

This directory is not currently a Git repository, so no project-specific commit history is available. Use concise, imperative commit messages such as `Add session prompt loader` or `Fix retry handling`.

Pull requests should include a short summary, verification steps, linked issues when applicable, and screenshots or logs for user-visible changes.

## Security & Configuration Tips

Do not commit API keys, credentials, local logs, or generated caches. Speech data currently stays in the browser; do not add remote transcription without documenting privacy and configuration.
