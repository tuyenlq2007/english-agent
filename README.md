# English Agent

English Agent is a static browser app for English speaking practice with Vietnamese meanings. The user chooses a book, chooses the starting word or sentence, listens to the English prompt, then the app automatically listens and checks the user's speech.

## Features

- Book-based practice data in `data/books/*.json`
- Vietnamese meaning shown on screen
- British English voice preference for prompts
- Automatic listening after the agent speaks
- Speech recognition with Whisper running in the browser (falls back to the browser's built-in recognition)
- The recognised words stay on screen for a moment before the next item starts
- Three failed attempts before retrying later
- Local progress saved in the browser with `localStorage`

## Install Node.js on Windows

1. Open the official Node.js download page: <https://nodejs.org/en/download>
2. Download the Windows Installer for the LTS version.
3. Run the installer and keep the default options, including `npm` and `Add to PATH`.
4. Close and reopen Command Prompt or PowerShell.
5. Verify installation:

```powershell
node --version
npm --version
```

## Run the App on Windows

Double-click:

```text
run.bat
```

Or run from PowerShell:

```powershell
.\run.bat
```

The app opens at:

```text
http://127.0.0.1:5173
```

Keep the terminal window open while using the app. Press `Ctrl+C` in that window to stop the server.

## Development Commands

Run the local server directly:

```powershell
node server.js
```

Check JavaScript syntax:

```powershell
node --check app.js
node --check server.js
```

Validate book JSON files:

```powershell
Get-ChildItem data\books -Filter *.json | ForEach-Object { Get-Content -Raw $_.FullName | ConvertFrom-Json | Out-Null }
```

## Add or Edit Books

Each book lives in its own file:

```text
data/books/book-1.json
data/books/book-2.json
data/books/book-3.json
```

Register books in:

```text
data/books/index.json
```

Example item:

```json
{
  "id": "book-1-word-001",
  "text": "comfortable",
  "meaningVi": "thoải mái",
  "type": "word"
}
```

Use unique `id` values. Set `type` to `word` or `sentence`.

## Speech Recognition and Privacy

Answers are transcribed by the Whisper `whisper-base.en` model, which runs entirely in the browser through Transformers.js. Microphone audio is not uploaded anywhere. On first use the browser downloads the library from jsDelivr and the model files (about 80 MB) from Hugging Face, then caches them, so the first load needs Internet access. The recording stops automatically about 1.2 seconds after you finish speaking. If you pause a lot in the middle of a sentence, the app waits longer (up to 3 seconds).

If Whisper cannot run (for example, no `AudioContext` or `Worker`), the app uses the browser's built-in speech recognition instead.

## Browser Notes

Use Chrome or Edge for the best speech recognition support. Allow microphone access when prompted. British English voice quality depends on voices installed in Windows and available to the browser.
