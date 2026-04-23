const messagesEl = document.getElementById("messages");
const inputEl = document.getElementById("inputMessage");
const sendBtn = document.getElementById("sendBtn");
const readLastBtn = document.getElementById("readLastBtn");
const newChatBtn = document.getElementById("newChatBtn");
const chatListEl = document.getElementById("chatList");
const chatForm = document.getElementById("chatForm");
const typingIndicatorEl = document.getElementById("typingIndicator");
const chatStatusTextEl = document.getElementById("chatStatusText");
const voiceInputBtn = document.getElementById("voiceInputBtn");
const voiceStatusEl = document.getElementById("voiceStatus");
const voiceStatusTextEl = document.getElementById("voiceStatusText");

/* ---------- API LOCAL / RED DEFINITIVA ---------- */

function getApiBaseUrl() {
  const host = location.hostname;

  const isLocal =
    host === "127.0.0.1" ||
    host === "localhost" ||
    host.endsWith(".local");

  if (isLocal) {
    return "http://127.0.0.1:8000/stream";
  }

  return "https://programanova-production.up.railway.app/stream";
}

const API_BASE_URL = getApiBaseUrl();

/* ---------- CONSTANTES ---------- */

const STORAGE_CHATS_KEY = "novap_chats";
const STORAGE_ACTIVE_KEY = "novap_active";
const DEFAULT_CHAT_TITLE = "Nueva conversación";
const DEFAULT_WELCOME_MESSAGE = "Hola 👋 Bienvenido a chatNOVAP";
const DEFAULT_READY_STATUS = "Lista para conversar";
const DEFAULT_THINKING_STATUS = "NOVA está pensando...";
const MAX_CHAT_TITLE_LENGTH = 30;
const MAX_TEXTAREA_HEIGHT = 180;

/* ---------- ESTADO ---------- */

let chats = [];
let activeChatId = null;
let isSending = false;
let recognition = null;
let isListening = false;

/* ---------- HELPERS BASE ---------- */

function generateChatId() {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

function getActiveChat() {
  return chats.find(chat => chat.id === activeChatId) || null;
}

function escapeHtml(text) {
  return String(text || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function safeTrim(text) {
  return typeof text === "string" ? text.trim() : "";
}

function cleanChatTitle(text) {
  let value = safeTrim(text);

  if (!value) {
    return DEFAULT_CHAT_TITLE;
  }

  value = value
    .replace(/\s+/g, " ")
    .replace(/^[-–—:;,.!?¿¡#*_`~|[\](){}\\/\s]+/, "")
    .trim();

  if (!value) {
    return DEFAULT_CHAT_TITLE;
  }

  return value.slice(0, MAX_CHAT_TITLE_LENGTH).trim() || DEFAULT_CHAT_TITLE;
}

function buildChatTitleFromText(text) {
  return cleanChatTitle(text);
}

function normalizeMessage(messageOrText, sender) {
  if (typeof messageOrText === "string") {
    return {
      text: messageOrText,
      sender: sender || "bot",
      imageUrl: null,
      audioUrl: null,
      chartUrl: null
    };
  }

  return {
    text: messageOrText?.text || "",
    sender: messageOrText?.sender || sender || "bot",
    imageUrl: messageOrText?.imageUrl || null,
    audioUrl: messageOrText?.audioUrl || null,
    chartUrl: messageOrText?.chartUrl || null
  };
}

function createWelcomeMessage() {
  return {
    text: DEFAULT_WELCOME_MESSAGE,
    sender: "bot",
    imageUrl: null,
    audioUrl: null,
    chartUrl: null
  };
}

function getFirstUserMessageTitle(messages) {
  if (!Array.isArray(messages)) return DEFAULT_CHAT_TITLE;

  const firstUserMessage = messages.find(
    message => message.sender === "user" && safeTrim(message.text)
  );

  if (!firstUserMessage) {
    return DEFAULT_CHAT_TITLE;
  }

  return buildChatTitleFromText(firstUserMessage.text);
}

function ensureChatShape(chat) {
  const normalizedMessages = Array.isArray(chat?.messages)
    ? chat.messages.map(message => normalizeMessage(message, message?.sender || "bot"))
    : [];

  let title =
    typeof chat?.title === "string" && chat.title.trim()
      ? cleanChatTitle(chat.title)
      : DEFAULT_CHAT_TITLE;

  if (title === DEFAULT_CHAT_TITLE) {
    title = getFirstUserMessageTitle(normalizedMessages);
  }

  return {
    id: chat?.id ? String(chat.id) : generateChatId(),
    title,
    messages: normalizedMessages.length ? normalizedMessages : [createWelcomeMessage()],
    createdAt: Number(chat?.createdAt) || Date.now(),
    updatedAt: Number(chat?.updatedAt) || Date.now()
  };
}

function ensureChatsShape(rawChats) {
  if (!Array.isArray(rawChats)) return [];

  const cleanChats = rawChats.map(ensureChatShape);

  const unique = new Map();
  cleanChats.forEach(chat => {
    unique.set(chat.id, chat);
  });

  return Array.from(unique.values()).sort((a, b) => b.updatedAt - a.updatedAt);
}

function touchChat(chat) {
  if (!chat) return;
  chat.updatedAt = Date.now();
}

function moveChatToTop(chatId) {
  const index = chats.findIndex(chat => chat.id === chatId);
  if (index <= 0) return;
  const [chat] = chats.splice(index, 1);
  chats.unshift(chat);
}

function persistAndRefresh() {
  saveState();
  renderChatList();
  renderMessages();
}

/* ---------- ESTADO VISUAL ---------- */

function setChatStatus(text) {
  if (!chatStatusTextEl) return;
  chatStatusTextEl.textContent = text || DEFAULT_READY_STATUS;
}

function setTypingIndicator(visible) {
  if (!typingIndicatorEl) return;

  typingIndicatorEl.classList.toggle("hidden", !visible);
  typingIndicatorEl.setAttribute("aria-hidden", visible ? "false" : "true");
}

function setSendingState(sending) {
  isSending = sending;

  if (sendBtn) {
    sendBtn.disabled = sending;
  }

  if (inputEl) {
    inputEl.disabled = sending;
  }

  if (voiceInputBtn) {
    voiceInputBtn.disabled = sending;
  }

  setTypingIndicator(sending);
  setChatStatus(sending ? DEFAULT_THINKING_STATUS : DEFAULT_READY_STATUS);
}

function autoResizeTextarea() {
  if (!inputEl) return;
  inputEl.style.height = "auto";
  inputEl.style.height = `${Math.min(inputEl.scrollHeight, MAX_TEXTAREA_HEIGHT)}px`;
}

function scrollMessagesToBottom() {
  if (!messagesEl) return;

  requestAnimationFrame(() => {
    messagesEl.scrollTop = messagesEl.scrollHeight;
  });
}

function setVoiceButtonState(listening) {
  isListening = listening;

  if (!voiceInputBtn) return;

  voiceInputBtn.classList.toggle("listening", listening);
  voiceInputBtn.setAttribute("aria-pressed", listening ? "true" : "false");
  voiceInputBtn.textContent = listening ? "🔴 Escuchando" : "🎤 Hablar";
}

function setVoiceStatus(visible, text = "Escuchando...") {
  if (!voiceStatusEl || !voiceStatusTextEl) return;

  voiceStatusEl.classList.toggle("hidden", !visible);
  voiceStatusEl.setAttribute("aria-hidden", visible ? "false" : "true");
  voiceStatusTextEl.textContent = text;
}

/* ---------- PERSISTENCIA ---------- */

function saveState() {
  try {
    const orderedChats = [...chats].sort((a, b) => b.updatedAt - a.updatedAt);
    localStorage.setItem(STORAGE_CHATS_KEY, JSON.stringify(orderedChats));
    localStorage.setItem(STORAGE_ACTIVE_KEY, activeChatId || "");
  } catch (error) {
    console.error("chatNOVAP saveState error:", error);
  }
}

function loadState() {
  try {
    const savedChats = localStorage.getItem(STORAGE_CHATS_KEY);
    const savedActive = localStorage.getItem(STORAGE_ACTIVE_KEY);

    chats = ensureChatsShape(savedChats ? JSON.parse(savedChats) : []);
    activeChatId = savedActive || null;
  } catch (error) {
    console.error("chatNOVAP loadState error:", error);
    chats = [];
    activeChatId = null;
  }
}

function ensureActiveChatExists() {
  if (!chats.length) {
    createNewChat();
    return;
  }

  const exists = chats.some(chat => chat.id === activeChatId);

  if (!activeChatId || !exists) {
    activeChatId = chats[0].id;
  }
}

/* ---------- MARKDOWN / FORMATEO REAL ---------- */

if (window.marked && typeof window.marked.setOptions === "function") {
  window.marked.setOptions({
    gfm: true,
    breaks: true,
    highlight: function (code, lang) {
      if (window.hljs) {
        const language = window.hljs.getLanguage(lang) ? lang : "plaintext";
        return window.hljs.highlight(code, { language }).value;
      }
      return code;
    }
  });
}

function formatText(text) {
  if (!text) return "";

  if (!window.marked || typeof window.marked.parse !== "function") {
    return escapeHtml(text).replace(/\n/g, "<br>");
  }

  let html = window.marked.parse(text);

  if (window.DOMPurify && typeof window.DOMPurify.sanitize === "function") {
    html = window.DOMPurify.sanitize(html);
  }

  return html;
}

/* ---------- RENDER RICO DE BOT ---------- */

function buildBotContentHtml(text, imageUrl = null, audioUrl = null, chartUrl = null) {
  let html = formatText(text || "");

  if (imageUrl) {
    const safeImageUrl = escapeHtml(imageUrl);
    html += `
      <div style="margin-top:12px;">
        <img
          src="${safeImageUrl}"
          alt="Imagen generada por chatNOVAP"
          style="max-width:100%; border-radius:12px; display:block;"
        >
      </div>
    `;
  }

  if (chartUrl) {
    const safeChartUrl = escapeHtml(chartUrl);
    html += `
      <div style="margin-top:12px;">
        <img
          src="${safeChartUrl}"
          alt="Gráfico generado por chatNOVAP"
          style="max-width:100%; border-radius:12px; display:block;"
        >
      </div>
    `;
  }

  if (audioUrl) {
    const safeAudioUrl = escapeHtml(audioUrl);
    html += `
      <div style="margin-top:12px;">
        <audio controls src="${safeAudioUrl}" style="width:100%;"></audio>
      </div>
    `;
  }

  return html;
}

function addMessageToDOM(messageOrText, sender) {
  if (!messagesEl) return null;

  const message = normalizeMessage(messageOrText, sender);

  const div = document.createElement("div");
  div.classList.add("message", message.sender);

  if (message.sender === "user") {
    div.textContent = message.text;
  } else {
    div.innerHTML = buildBotContentHtml(
      message.text,
      message.imageUrl,
      message.audioUrl,
      message.chartUrl
    );
  }

  messagesEl.appendChild(div);
  return div;
}

function renderMessages() {
  if (!messagesEl) return;

  messagesEl.innerHTML = "";

  const chat = getActiveChat();
  if (!chat) {
    setChatStatus(DEFAULT_READY_STATUS);
    return;
  }

  chat.messages.forEach(message => addMessageToDOM(message, message.sender));
  scrollMessagesToBottom();
}

function getChatDisplayTitle(chat) {
  const title = cleanChatTitle(chat?.title || "");

  if (title !== DEFAULT_CHAT_TITLE) {
    return title;
  }

  return getFirstUserMessageTitle(chat?.messages);
}

/* ---------- LISTA DE CHATS ---------- */

function renderChatList() {
  if (!chatListEl) return;

  chatListEl.innerHTML = "";

  chats.forEach(chat => {
    const container = document.createElement("div");
    container.classList.add("chat-item");
    container.setAttribute("role", "listitem");
    container.setAttribute("tabindex", "0");
    container.setAttribute("aria-label", getChatDisplayTitle(chat));

    if (chat.id === activeChatId) {
      container.classList.add("active");
    }

    container.textContent = getChatDisplayTitle(chat);

    container.addEventListener("click", () => {
      if (isSending) return;

      activeChatId = chat.id;
      saveState();
      renderChatList();
      renderMessages();
      setChatStatus(DEFAULT_READY_STATUS);
    });

    container.addEventListener("keydown", event => {
      if (event.key === "Enter" || event.key === " ") {
        event.preventDefault();
        container.click();
      }
    });

    container.addEventListener("dblclick", () => {
      if (isSending) return;

      const newTitle = prompt("Nuevo nombre:", getChatDisplayTitle(chat));

      if (typeof newTitle === "string" && newTitle.trim()) {
        chat.title = cleanChatTitle(newTitle);
        touchChat(chat);
        moveChatToTop(chat.id);
        saveState();
        renderChatList();
      }
    });

    chatListEl.appendChild(container);
  });
}

/* ---------- LECTURA EN VOZ ---------- */

function readLastBotMessage() {
  const chat = getActiveChat();
  if (!chat) return;

  const botMessages = chat.messages.filter(
    message => message.sender === "bot" && safeTrim(message.text)
  );

  if (!botMessages.length) return;

  const lastBotMessage = botMessages[botMessages.length - 1].text;

  if (!("speechSynthesis" in window)) {
    alert("Tu navegador no soporta lectura por voz.");
    return;
  }

  window.speechSynthesis.cancel();

  const utterance = new SpeechSynthesisUtterance(lastBotMessage);
  utterance.lang = "es-ES";
  utterance.rate = 1;
  utterance.pitch = 1;

  window.speechSynthesis.speak(utterance);
}

/* ---------- VOZ DE ENTRADA ---------- */

function setupVoiceRecognition() {
  const SpeechRecognition =
    window.SpeechRecognition || window.webkitSpeechRecognition;

  if (!SpeechRecognition || !voiceInputBtn) {
    if (voiceInputBtn) {
      voiceInputBtn.style.display = "none";
    }
    return;
  }

  recognition = new SpeechRecognition();
  recognition.lang = "es-ES";
  recognition.interimResults = false;
  recognition.maxAlternatives = 1;

  recognition.onstart = () => {
    setVoiceButtonState(true);
    setVoiceStatus(true, "Escuchando...");
    setChatStatus("Escuchando...");
  };

  recognition.onend = () => {
    setVoiceButtonState(false);
    setVoiceStatus(false);
    setChatStatus(DEFAULT_READY_STATUS);
  };

  recognition.onerror = () => {
    setVoiceButtonState(false);
    setVoiceStatus(false);
    setChatStatus(DEFAULT_READY_STATUS);
  };

  recognition.onresult = event => {
    const transcript = event.results?.[0]?.[0]?.transcript || "";
    const text = transcript.trim();

    if (!text || !inputEl) return;

    inputEl.value = inputEl.value
      ? `${inputEl.value.trim()} ${text}`.trim()
      : text;

    autoResizeTextarea();
    inputEl.focus();
  };
}

function toggleVoiceInput() {
  if (!recognition || isSending) return;

  if (isListening) {
    recognition.stop();
    return;
  }

  recognition.start();
}

/* ---------- CHATS ---------- */

function createNewChat() {
  const id = generateChatId();
  const now = Date.now();

  const newChat = {
    id,
    title: DEFAULT_CHAT_TITLE,
    messages: [createWelcomeMessage()],
    createdAt: now,
    updatedAt: now
  };

  chats.unshift(newChat);
  activeChatId = id;

  saveState();
  renderChatList();
  renderMessages();
  setChatStatus(DEFAULT_READY_STATUS);
}

function deleteChat(id) {
  chats = chats.filter(chat => chat.id !== id);

  if (activeChatId === id) {
    activeChatId = chats.length ? chats[0].id : null;
  }

  if (!activeChatId) {
    createNewChat();
    return;
  }

  saveState();
  renderChatList();
  renderMessages();
  setChatStatus(DEFAULT_READY_STATUS);
}

/* ---------- RESPUESTA BACKEND ---------- */

function normalizeBackendPayload(data) {
  return {
    reply: data?.reply || data?.message || data?.text || "No se pudo obtener respuesta.",
    imageUrl: data?.image_url || data?.imageUrl || null,
    audioUrl: data?.audio_url || data?.audioUrl || null,
    chartUrl: data?.chart_url || data?.chartUrl || null
  };
}

async function requestRichReply(chatId, text) {
  const url = `${API_BASE_URL}/rich-reply?chat_id=${encodeURIComponent(chatId)}&message=${encodeURIComponent(text)}`;

  const response = await fetch(url, {
    method: "POST",
    headers: {
      Accept: "application/json"
    }
  });

  if (!response.ok) {
    throw new Error(`Respuesta no válida del servidor (${response.status})`);
  }

  const contentType = response.headers.get("content-type") || "";

  if (contentType.includes("application/json")) {
    return response.json();
  }

  const fallbackText = await response.text();

  return {
    reply: fallbackText || "No se pudo obtener respuesta."
  };
}

/* ---------- ENVÍO ---------- */

async function sendMessage() {
  if (isSending) return;
  if (!inputEl) return;

  const text = inputEl.value.trim();
  if (!text) return;

  const requestChatId = activeChatId;
  const chat = getActiveChat();
  if (!chat) return;

  setSendingState(true);

  const userMessage = {
    text,
    sender: "user",
    imageUrl: null,
    audioUrl: null,
    chartUrl: null
  };

  chat.messages.push(userMessage);
  touchChat(chat);
  moveChatToTop(chat.id);

  if (chat.title === DEFAULT_CHAT_TITLE) {
    chat.title = buildChatTitleFromText(text);
  }

  inputEl.value = "";
  autoResizeTextarea();

  saveState();
  renderChatList();
  renderMessages();

  try {
    const rawData = await requestRichReply(requestChatId, text);
    const normalized = normalizeBackendPayload(rawData);

    const targetChat = chats.find(item => item.id === requestChatId);
    if (!targetChat) {
      throw new Error("No se encontró la conversación activa para guardar la respuesta.");
    }

    const botMessage = {
      text: normalized.reply,
      sender: "bot",
      imageUrl: normalized.imageUrl,
      audioUrl: normalized.audioUrl,
      chartUrl: normalized.chartUrl
    };

    targetChat.messages.push(botMessage);
    touchChat(targetChat);
    moveChatToTop(targetChat.id);

    saveState();

    if (activeChatId === requestChatId) {
      renderChatList();
      renderMessages();
    } else {
      renderChatList();
    }

    if (normalized.audioUrl) {
      try {
        const audio = new Audio(normalized.audioUrl);
        audio.play().catch(() => {});
      } catch (error) {
        console.warn("chatNOVAP audio autoplay warning:", error);
      }
    }
  } catch (error) {
    console.error("chatNOVAP error:", error);

    const targetChat = chats.find(item => item.id === requestChatId);
    if (targetChat) {
      targetChat.messages.push({
        text: "❌ Error conectando con NOVA",
        sender: "bot",
        imageUrl: null,
        audioUrl: null,
        chartUrl: null
      });

      touchChat(targetChat);
      moveChatToTop(targetChat.id);
      saveState();

      if (activeChatId === requestChatId) {
        renderChatList();
        renderMessages();
      } else {
        renderChatList();
      }
    }
  } finally {
    setSendingState(false);

    if (inputEl) {
      inputEl.focus();
    }

    if (activeChatId === requestChatId) {
      scrollMessagesToBottom();
    }
  }
}

/* ---------- EVENTOS ---------- */

if (chatForm) {
  chatForm.addEventListener("submit", event => {
    event.preventDefault();
    sendMessage();
  });
}

if (readLastBtn) {
  readLastBtn.addEventListener("click", event => {
    event.preventDefault();
    readLastBotMessage();
  });
}

if (voiceInputBtn) {
  voiceInputBtn.addEventListener("click", event => {
    event.preventDefault();
    toggleVoiceInput();
  });
}

if (inputEl) {
  inputEl.addEventListener("input", () => {
    autoResizeTextarea();
  });

  inputEl.addEventListener("keydown", event => {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      sendMessage();
    }
  });
}

if (newChatBtn) {
  newChatBtn.addEventListener("click", event => {
    event.preventDefault();

    if (isSending) return;
    createNewChat();
  });
}

/* ---------- INIT ---------- */

loadState();
ensureActiveChatExists();
saveState();
renderChatList();
renderMessages();
setChatStatus(DEFAULT_READY_STATUS);
setTypingIndicator(false);
autoResizeTextarea();
setupVoiceRecognition();
setVoiceButtonState(false);
setVoiceStatus(false);
