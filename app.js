const messages = {
  start: "Bắt đầu luyện nói.",
  listenRepeat: "Hãy nghe và lặp lại.",
  correct: "Tốt lắm. Chuyển sang mục tiếp theo.",
  incorrect: "Chưa đúng. Từ đúng là:",
  tryAgain: "Hãy thử lại.",
  retryLater: "Mình sẽ lưu mục này để bạn ôn lại lần sau.",
  finished: "Bạn đã hoàn thành buổi luyện tập.",
  unsupported: "Trình duyệt này chưa hỗ trợ nhận diện giọng nói. Bạn có thể dùng nút Mark correct hoặc Retry later.",
  noSpeech: "Mình chưa nghe thấy bạn. Hãy nói gần micrô hơn và thử lại.",
  permissionDenied: "Chưa thể dùng micrô. Hãy cho phép trang này truy cập micrô rồi thử lại.",
  recognitionUnavailable: "Chưa thể nhận diện giọng nói. Hãy kiểm tra kết nối Internet (lần đầu cần tải mô hình) rồi thử lại."
};

// How long the recognised words stay on screen before the next item starts.
const reviewDelayMs = 2500;

let books = [];
const maxAttempts = 3;
const progressKey = "english-agent-progress-v2";
const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;

const state = {
  currentIndex: 0,
  selectedBookId: "",
  selectedStartIndex: 0,
  loadingBooks: true,
  started: false,
  listening: false,
  reviewing: false,
  promptToken: 0,
  progress: loadProgress(),
  items: []
};

const el = {
  bookSelect: document.querySelector("#book-select"),
  startSelect: document.querySelector("#start-select"),
  passedCount: document.querySelector("#passed-count"),
  retryCount: document.querySelector("#retry-count"),
  progressBar: document.querySelector("#progress-bar"),
  agentMessage: document.querySelector("#agent-message"),
  itemType: document.querySelector("#item-type"),
  attemptCount: document.querySelector("#attempt-count"),
  meaningText: document.querySelector("#meaning-text"),
  targetText: document.querySelector("#target-text"),
  transcript: document.querySelector("#transcript"),
  startBtn: document.querySelector("#start-btn"),
  speakBtn: document.querySelector("#speak-btn"),
  listenBtn: document.querySelector("#listen-btn"),
  correctBtn: document.querySelector("#correct-btn"),
  skipBtn: document.querySelector("#skip-btn"),
  reloadBtn: document.querySelector("#reload-btn"),
  queueList: document.querySelector("#queue-list")
};

let recognition = null;
let availableVoices = [];

function refreshVoices() {
  availableVoices = window.speechSynthesis.getVoices();
}

function selectVoice(lang, preference = "default") {
  const voices = availableVoices.length ? availableVoices : window.speechSynthesis.getVoices();
  const normalizedLang = lang.toLowerCase();
  const langMatches = voices.filter((voice) => voice.lang.toLowerCase().startsWith(normalizedLang));

  if (preference === "british-female") {
    const femaleNameHints = ["female", "woman", "susan", "hazel", "sonia", "libby", "serena", "kate", "emma"];
    const britishVoices = langMatches.length
      ? langMatches
      : voices.filter((voice) => voice.lang.toLowerCase().startsWith("en-gb"));
    const femaleVoice = britishVoices.find((voice) =>
      femaleNameHints.some((hint) => voice.name.toLowerCase().includes(hint))
    );
    return femaleVoice || britishVoices[0] || null;
  }

  return langMatches[0] || null;
}

async function loadBooks() {
  state.loadingBooks = true;
  render();

  try {
    const indexResponse = await fetch("data/books/index.json", { cache: "no-store" });
    if (!indexResponse.ok) {
      throw new Error(`Book index request failed: ${indexResponse.status}`);
    }

    const entries = await indexResponse.json();
    const loadedBooks = await Promise.all(
      entries.map(async (entry) => {
        const response = await fetch(`data/books/${entry.file}`, { cache: "no-store" });
        if (!response.ok) {
          throw new Error(`${entry.file} request failed: ${response.status}`);
        }
        return response.json();
      })
    );

    books = loadedBooks;
    state.selectedBookId = books[0]?.id || "";
    state.selectedStartIndex = 0;
    el.agentMessage.textContent = "Book data loaded.";
  } catch (error) {
    books = [];
    state.selectedBookId = "";
    state.selectedStartIndex = 0;
    el.agentMessage.textContent = "Could not load book files. Check data/books/index.json.";
    console.error(error);
  } finally {
    state.loadingBooks = false;
    renderBookOptions();
    renderStartOptions();
    resetSessionFromSelection();
  }
}

function loadProgress() {
  const saved = JSON.parse(localStorage.getItem(progressKey) || "null");
  return saved && typeof saved === "object" && !Array.isArray(saved) ? saved : {};
}

function saveProgress() {
  localStorage.setItem(progressKey, JSON.stringify(state.progress));
}

function selectedBook() {
  return books.find((book) => book.id === state.selectedBookId) || books[0] || null;
}

function createSessionItems() {
  const book = selectedBook();
  if (!book) return [];
  return book.items.slice(state.selectedStartIndex).map((item, offset) => ({
    ...item,
    bookId: book.id,
    bookTitle: book.title,
    bookPosition: state.selectedStartIndex + offset,
    attempts: 0,
    maxAttempts,
    status: "new",
    practiceLanguage: "en",
    supportLanguage: "vi",
    nextReviewAt: state.progress[item.id]?.nextReviewAt || null
  }));
}

function resetSessionFromSelection() {
  state.started = false;
  state.listening = false;
  state.reviewing = false;
  whisper.stop();
  state.promptToken += 1;
  state.currentIndex = 0;
  state.items = createSessionItems();
  window.speechSynthesis.cancel();
  render();
}

function currentItem() {
  return state.items[state.currentIndex];
}

function normalize(value) {
  return value
    .toLowerCase()
    .replace(/[^\w\s']/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function isCorrect(transcript, target) {
  return normalize(transcript) === normalize(target);
}

function speak(text, lang = "en-US", onEnd = null, preference = "default") {
  const utterance = new SpeechSynthesisUtterance(text);
  utterance.lang = lang;
  utterance.voice = selectVoice(lang, preference);
  utterance.rate = 0.82;
  if (onEnd) utterance.onend = onEnd;
  window.speechSynthesis.speak(utterance);
}

function shouldAutoListen(token, itemId) {
  const item = currentItem();
  return state.started && token === state.promptToken && item?.id === itemId && !state.listening;
}

function speakCurrent() {
  const item = currentItem();
  if (!item) return;
  const token = (state.promptToken += 1);
  window.speechSynthesis.cancel();
  el.agentMessage.textContent = `${item.meaningVi}. ${messages.listenRepeat}`;
  speak(
    item.text,
    "en-GB",
    () => {
      if (shouldAutoListen(token, item.id)) {
        listen();
      }
    },
    "british-female"
  );
}

function startSession() {
  if (state.started && !currentItem()) {
    resetSessionFromSelection();
  }
  state.started = true;
  state.currentIndex = findNextPlayableIndex();
  el.agentMessage.textContent = messages.start;
  render();
  speakCurrent();
}

function findNextPlayableIndex() {
  const index = state.items.findIndex((item) => item.status === "new" || item.status === "practicing");
  return index === -1 ? state.items.length : index;
}

async function listenWithWhisper(item) {
  const token = state.promptToken;
  state.listening = true;
  item.status = "practicing";
  el.transcript.textContent = "Bạn nói: đang nghe...";
  render();

  try {
    const transcript = await whisper.listen((status) => {
      if (status === "processing" && token === state.promptToken) {
        el.transcript.textContent = "Bạn nói: đang xử lý...";
      }
    });
    state.listening = false;
    if (token !== state.promptToken || currentItem() !== item) return;
    el.transcript.textContent = `Bạn nói: ${transcript}`;
    render();
    handleResult(transcript);
  } catch (error) {
    state.listening = false;
    if (token !== state.promptToken || error.code === "aborted") {
      render();
      return;
    }
    el.transcript.textContent = "Bạn nói: ...";
    el.agentMessage.textContent =
      error.code === "no-speech" ? messages.noSpeech
        : error.code === "permission-denied" ? messages.permissionDenied
          : messages.recognitionUnavailable;
    render();
  }
}

function listen() {
  const item = currentItem();
  if (!item || state.listening || state.reviewing) return;

  if (whisper.supported) {
    listenWithWhisper(item);
    return;
  }

  if (!SpeechRecognition) {
    el.agentMessage.textContent = messages.unsupported;
    render();
    return;
  }

  recognition = new SpeechRecognition();
  recognition.lang = "en-US";
  recognition.interimResults = false;
  recognition.maxAlternatives = 1;
  state.listening = true;
  item.status = "practicing";
  render();

  recognition.onresult = (event) => {
    const transcript = event.results[0][0].transcript;
    el.transcript.textContent = `Bạn nói: ${transcript}`;
    handleResult(transcript);
  };

  recognition.onerror = () => {
    state.listening = false;
    el.agentMessage.textContent = "Không nghe rõ. Hãy thử lại.";
    render();
  };

  recognition.onend = () => {
    state.listening = false;
    render();
  };

  recognition.start();
}

function updateProgress(item) {
  state.progress[item.id] = {
    status: item.status,
    attempts: item.attempts,
    nextReviewAt: item.nextReviewAt,
    lastPracticedAt: new Date().toISOString()
  };
  saveProgress();
}

function repeatCurrentItem() {
  const item = currentItem();
  if (!item) return;
  const token = (state.promptToken += 1);
  window.speechSynthesis.cancel();
  speak(
    item.text,
    "en-GB",
    () => {
      if (shouldAutoListen(token, item.id)) {
        listen();
      }
    },
    "british-female"
  );
}

async function reloadAgent() {
  if (recognition && state.listening) {
    recognition.abort();
  }
  state.promptToken += 1;
  state.reviewing = false;
  whisper.stop();
  refreshVoices();
  el.transcript.textContent = "Bạn nói: ...";
  el.agentMessage.textContent = "Reloading agent...";
  await loadBooks();

if (whisper.supported) {
  // Download the Whisper model in the background so the first answer is not delayed.
  whisper
    .warmUp((percent) => {
      if (!state.started) el.agentMessage.textContent = `Đang tải mô hình Whisper (${Math.round(percent)}%)...`;
    })
    .then(() => {
      if (!state.started) el.agentMessage.textContent = "Whisper đã sẵn sàng. Bấm Start để luyện nói.";
    })
    .catch(() => {
      if (!state.started) el.agentMessage.textContent = messages.recognitionUnavailable;
    });
}
}

function handleResult(transcript) {
  const item = currentItem();
  if (!item) return;

  if (isCorrect(transcript, item.text)) {
    passCurrentItem(true);
    return;
  }

  item.attempts += 1;
  if (item.attempts >= maxAttempts) {
    retryLater(true);
    return;
  }

  el.agentMessage.textContent = `${messages.incorrect} ${item.text}. ${messages.tryAgain}`;
  updateProgress(item);
  render();
  repeatCurrentItem();
}

function passCurrentItem(afterSpeech = false) {
  const item = currentItem();
  if (!item || state.reviewing) return;
  item.status = "passed";
  item.nextReviewAt = null;
  el.agentMessage.textContent = messages.correct;
  updateProgress(item);
  advance(afterSpeech);
}

function retryLater(afterSpeech = false) {
  const item = currentItem();
  if (!item || state.reviewing) return;
  item.status = "retry_later";
  item.nextReviewAt = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
  el.agentMessage.textContent = messages.retryLater;
  updateProgress(item);
  advance(afterSpeech);
}

// After a spoken answer, keep the target and recognised words visible before moving on.
function advance(afterSpeech) {
  if (!afterSpeech) {
    moveNext();
    return;
  }
  state.reviewing = true;
  const token = (state.promptToken += 1);
  window.speechSynthesis.cancel();
  render();
  window.setTimeout(() => {
    if (token !== state.promptToken) return;
    state.reviewing = false;
    moveNext();
  }, reviewDelayMs);
}

function moveNext() {
  state.currentIndex = findNextPlayableIndex();
  el.transcript.textContent = "Bạn nói: ...";
  render();
  if (currentItem()) {
    window.setTimeout(speakCurrent, 500);
  } else {
    el.agentMessage.textContent = messages.finished;
    speak("Finished. Good practice.", "en-GB", null, "british-female");
    render();
  }
}

function renderBookOptions() {
  el.bookSelect.innerHTML = "";
  books.forEach((book) => {
    const option = document.createElement("option");
    option.value = book.id;
    option.textContent = book.title;
    option.selected = book.id === state.selectedBookId;
    el.bookSelect.appendChild(option);
  });
}

function renderStartOptions() {
  const book = selectedBook();
  el.startSelect.innerHTML = "";
  if (!book) return;
  book.items.forEach((item, index) => {
    const option = document.createElement("option");
    option.value = String(index);
    option.textContent = `${index + 1}. ${item.text} - ${item.meaningVi}`;
    option.selected = index === state.selectedStartIndex;
    el.startSelect.appendChild(option);
  });
}

function renderQueue() {
  el.queueList.innerHTML = "";
  state.items.forEach((item, index) => {
    const row = document.createElement("li");
    row.className = `${item.status}${index === state.currentIndex ? " current" : ""}`;
    row.innerHTML = `<span>${item.bookPosition + 1}. ${item.text}</span><strong>${item.status.replace("_", " ")}</strong>`;
    el.queueList.appendChild(row);
  });
}

function render() {
  const item = currentItem();
  const sessionActive = state.started && Boolean(item);
  const book = selectedBook();
  const passed = state.items.filter((entry) => entry.status === "passed").length;
  const retry = state.items.filter((entry) => entry.status === "retry_later").length;
  const done = passed + retry;

  el.passedCount.textContent = passed;
  el.retryCount.textContent = retry;
  el.progressBar.style.width = state.items.length ? `${(done / state.items.length) * 100}%` : "0%";

  if (item) {
    el.itemType.textContent = `${book?.title || "Book"} / ${item.type}`;
    el.attemptCount.textContent = `${item.attempts} / ${maxAttempts} attempts`;
    el.meaningText.textContent = `${item.meaningVi}`;
    el.targetText.textContent = item.text;
  } else {
    el.itemType.textContent = state.loadingBooks ? "loading" : "done";
    el.attemptCount.textContent = `${done} / ${state.items.length} complete`;
    el.meaningText.textContent = "";
    el.targetText.textContent = state.loadingBooks ? "Loading books..." : "Finished";
  }

  el.bookSelect.disabled = state.loadingBooks || sessionActive;
  el.startSelect.disabled = state.loadingBooks || sessionActive;
  el.startBtn.disabled = state.loadingBooks || sessionActive || state.items.length === 0;
  el.startBtn.textContent = state.started && !item ? "Start again" : "Start";
  el.speakBtn.disabled = state.loadingBooks || !item || state.reviewing;
  el.listenBtn.disabled = state.loadingBooks || !item || state.listening || state.reviewing;
  el.correctBtn.disabled = state.loadingBooks || !item || state.reviewing;
  el.skipBtn.disabled = state.loadingBooks || !item || state.reviewing;
  el.listenBtn.textContent = state.listening ? "Listening..." : "Listen";

  renderQueue();
}

el.bookSelect.addEventListener("change", () => {
  state.selectedBookId = el.bookSelect.value;
  state.selectedStartIndex = 0;
  renderStartOptions();
  resetSessionFromSelection();
});

el.startSelect.addEventListener("change", () => {
  state.selectedStartIndex = Number(el.startSelect.value);
  resetSessionFromSelection();
});

el.startBtn.addEventListener("click", startSession);
el.speakBtn.addEventListener("click", speakCurrent);
el.listenBtn.addEventListener("click", listen);
el.correctBtn.addEventListener("click", () => passCurrentItem(false));
el.skipBtn.addEventListener("click", () => retryLater(false));
el.reloadBtn.addEventListener("click", reloadAgent);

refreshVoices();
if ("onvoiceschanged" in window.speechSynthesis) {
  window.speechSynthesis.onvoiceschanged = refreshVoices;
}

loadBooks();

