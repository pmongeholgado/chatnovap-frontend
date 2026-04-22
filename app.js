const messagesEl = document.getElementById("messages");
const inputEl = document.getElementById("inputMessage");
const sendBtn = document.getElementById("sendBtn");
const readLastBtn = document.getElementById("readLastBtn");
const newChatBtn = document.getElementById("newChatBtn");
const chatListEl = document.getElementById("chatList");
const chatForm = document.getElementById("chatForm");
const typingIndicatorEl = document.getElementById("typingIndicator");
const chatStatusTextEl = document.getElementById("chatStatusText");

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

/* ---------- ESTADO ---------- */

let chats = [];
let activeChatId = null;
let isSending = false;

/* ---------- HELPERS BASE ---------- */

function generateChatId() {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
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

function ensureChatShape(chat) {
  return {
    id: chat?.id ? String(chat.id) : generateChatId(),
    title: typeof chat?.title === "string" && chat.title.trim()
      ? chat.title.trim()
      : DEFAULT_CHAT_TITLE,
    messages: Array.isArray(chat?.messages)
      ? chat.messages.map(message => normalizeMessage(message, message?.sender || "bot"))
      : []
  };
}

function ensureChatsShape(rawChats) {
  if (!Array.isArray(rawChats)) return [];
  return rawChats.map(ensureChatShape);
}

/* ---------- ESTADO VISUAL ---------- */

function setChatStatus(text) {
  if (!chatStatusTextEl) return;
  chatStatusTextEl.textContent = text || "Lista para conversar";
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

  setTypingIndicator(sending);
  setChatStatus(sending ? "NOVA está pensando..." : "Lista para conversar");
}

function autoResizeTextarea() {
  if (!inputEl) return;
  inputEl.style.height = "auto";
  inputEl.style.height = `${Math.min(inputEl.scrollHeight, 180)}px`;
}

/* ---------- PERSISTENCIA ---------- */

function saveState() {
  try {
    localStorage.setItem(STORAGE_CHATS_KEY, JSON.stringify(chats));
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

function buildBotContentHtml(text, imageUrl = null, audioUrl = null) {
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

/* ---------- MENSAJES ---------- */

function normalizeMessage(messageOrText, sender) {
  if (typeof messageOrText === "string") {
    return {
      text: messageOrText,
      sender,
      imageUrl: null,
      audioUrl: null
    };
  }

  return {
    text: messageOrText?.text || "",
    sender: messageOrText?.sender || sender || "bot",
    imageUrl: messageOrText?.imageUrl || null,
    audioUrl: messageOrText?.audioUrl || null
  };
}

function scrollMessagesToBottom() {
  requestAnimationFrame(() => {
    messagesEl.scrollTop = messagesEl.scrollHeight;
  });
}

function addMessageToDOM(messageOrText, sender) {
  const message = normalizeMessage(messageOrText, sender);

  const div = document.createElement("div");
  div.classList.add("message", message.sender);

  if (message.sender === "user") {
    div.textContent = message.text;
  } else {
    div.innerHTML = buildBotContentHtml(message.text, message.imageUrl, message.audioUrl);
  }

  messagesEl.appendChild(div);
  return div;
}

function renderMessages() {
  messagesEl.innerHTML = "";

  const chat = getActiveChat();
  if (!chat) {
    setChatStatus("Lista para conversar");
    return;
  }

  chat.messages.forEach(message => addMessageToDOM(message, message.sender));
  scrollMessagesToBottom();
}

function getChatDisplayTitle(chat) {
  if (chat.title && chat.title.trim()) return chat.title.trim();

  const firstUserMessage = chat.messages.find(message => message.sender === "user" && message.text.trim());
  if (firstUserMessage) {
    return firstUserMessage.text.trim().slice(0, 30);
  }

  return DEFAULT_CHAT_TITLE;
}

/* ---------- LISTA DE CHATS ---------- */

function renderChatList() {
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
      activeChatId = chat.id;
      saveState();
      renderChatList();
      renderMessages();
      setChatStatus("Lista para conversar");
    });

    container.addEventListener("keydown", (event) => {
      if (event.key === "Enter" || event.key === " ") {
        event.preventDefault();
        container.click();
      }
    });

    container.addEventListener("dblclick", () => {
      const newTitle = prompt("Nuevo nombre:", chat.title);

      if (typeof newTitle === "string" && newTitle.trim()) {
        chat.title = newTitle.trim();
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
    message => message.sender === "bot" && message.text && message.text.trim()
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

/* ---------- CHATS ---------- */

function createWelcomeMessage() {
  return {
    text: DEFAULT_WELCOME_MESSAGE,
    sender: "bot",
    imageUrl: null,
    audioUrl: null
  };
}

function createNewChat() {
  const id = generateChatId();

  chats.unshift({
    id,
    title: DEFAULT_CHAT_TITLE,
    messages: [createWelcomeMessage()]
  });

  activeChatId = id;

  saveState();
  renderChatList();
  renderMessages();
  setChatStatus("Lista para conversar");
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
  setChatStatus("Lista para conversar");
}

/* ---------- PETICIÓN A BACKEND ---------- */

async function requestRichReply(chatId, text) {
  const url = `${API_BASE_URL}/rich-reply?chat_id=${encodeURIComponent(chatId)}&message=${encodeURIComponent(text)}`;

  const response = await fetch(url, {
    method: "POST"
  });

  if (!response.ok) {
    throw new Error("Respuesta no válida del servidor");
  }

  return response.json();
}

/* ---------- ENVÍO RICO CON APOYO EN GENESIOS ---------- */

async function sendMessage() {
  if (isSending) return;

  const text = inputEl.value.trim();
  if (!text) return;

  const chat = getActiveChat();
  if (!chat) return;

  setSendingState(true);

  const userMessage = {
    text,
    sender: "user",
    imageUrl: null,
    audioUrl: null
  };

  chat.messages.push(userMessage);

  if (chat.title === DEFAULT_CHAT_TITLE) {
    chat.title = text.substring(0, 30);
  }

  inputEl.value = "";
  autoResizeTextarea();

  saveState();
  renderChatList();
  renderMessages();

  try {
    const data = await requestRichReply(activeChatId, text);

    const finalText = data?.reply || "No se pudo obtener respuesta.";
    const imageUrl = data?.image_url || null;
    const audioUrl = data?.audio_url || null;

    const botMessage = {
      text: finalText,
      sender: "bot",
      imageUrl,
      audioUrl
    };

    chat.messages.push(botMessage);

    saveState();
    renderMessages();

    if (audioUrl) {
      try {
        const audio = new Audio(audioUrl);
        audio.play().catch(() => {});
      } catch (error) {
        console.warn("chatNOVAP audio autoplay warning:", error);
      }
    }
  } catch (error) {
    console.error("chatNOVAP error:", error);

    const errorMessage = {
      text: "❌ Error conectando con NOVA",
      sender: "bot",
      imageUrl: null,
      audioUrl: null
    };

    chat.messages.push(errorMessage);
    saveState();
    renderMessages();
  } finally {
    setSendingState(false);
    inputEl.focus();
    scrollMessagesToBottom();
  }
}

/* ---------- EVENTOS ---------- */

if (chatForm) {
  chatForm.addEventListener("submit", (event) => {
    event.preventDefault();
    sendMessage();
  });
}

if (sendBtn) {
  sendBtn.addEventListener("click", (event) => {
    event.preventDefault();
    sendMessage();
  });
}

if (readLastBtn) {
  readLastBtn.addEventListener("click", (event) => {
    event.preventDefault();
    readLastBotMessage();
  });
}

if (inputEl) {
  inputEl.addEventListener("input", () => {
    autoResizeTextarea();
  });

  inputEl.addEventListener("keydown", (event) => {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      sendMessage();
    }
  });
}

if (newChatBtn) {
  newChatBtn.addEventListener("click", (event) => {
    event.preventDefault();
    createNewChat();
  });
}

/* ---------- INIT ---------- */

loadState();

if (!chats.length) {
  createNewChat();
} else {
  if (!activeChatId || !chats.find(chat => chat.id === activeChatId)) {
    activeChatId = chats[0].id;
  }

  saveState();
  renderChatList();
  renderMessages();
  setChatStatus("Lista para conversar");
}

setTypingIndicator(false);
autoResizeTextarea();
