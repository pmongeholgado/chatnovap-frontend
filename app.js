const messagesEl = document.getElementById("messages");
const inputEl = document.getElementById("inputMessage");
const sendBtn = document.getElementById("sendBtn");
const readLastBtn = document.getElementById("readLastBtn");
const newChatBtn = document.getElementById("newChatBtn");
const chatListEl = document.getElementById("chatList");

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

/* ---------- ESTADO ---------- */

let chats = [];
let activeChatId = null;
let isSending = false;

/* ---------- PERSISTENCIA ---------- */

function saveState() {
  localStorage.setItem("novap_chats", JSON.stringify(chats));
  localStorage.setItem("novap_active", activeChatId || "");
}

function loadState() {
  try {
    const saved = localStorage.getItem("novap_chats");
    const savedActive = localStorage.getItem("novap_active");

    chats = saved ? JSON.parse(saved) : [];
    activeChatId = savedActive || null;
  } catch {
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
    return text
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/\n/g, "<br>");
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
    html += `
      <div style="margin-top:12px;">
        <img
          src="${imageUrl}"
          alt="Imagen generada por chatNOVAP"
          style="max-width:100%; border-radius:12px; display:block;"
        >
      </div>
    `;
  }

  if (audioUrl) {
    html += `
      <div style="margin-top:12px;">
        <audio controls src="${audioUrl}" style="width:100%;"></audio>
      </div>
    `;
  }

  return html;
}

/* ---------- UI ---------- */

function scrollMessagesToBottom() {
  requestAnimationFrame(() => {
    messagesEl.scrollTop = messagesEl.scrollHeight;
  });
}

function readLastBotMessage() {
  const chat = chats.find(c => c.id === activeChatId);
  if (!chat) return;

  const botMessages = chat.messages.filter(
    m => m.sender === "bot" && m.text && m.text.trim()
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
    text: messageOrText.text || "",
    sender: messageOrText.sender || sender || "bot",
    imageUrl: messageOrText.imageUrl || null,
    audioUrl: messageOrText.audioUrl || null
  };
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
  scrollMessagesToBottom();

  return div;
}

function renderMessages() {
  messagesEl.innerHTML = "";

  const chat = chats.find(c => c.id === activeChatId);
  if (!chat) return;

  chat.messages.forEach(m => addMessageToDOM(m, m.sender));
}

function renderChatList() {
  chatListEl.innerHTML = "";

  chats.forEach(chat => {
    const container = document.createElement("div");
    container.classList.add("chat-item");

    if (chat.id === activeChatId) {
      container.classList.add("active");
    }

    const title = document.createElement("div");
    title.classList.add("chat-title");
    title.textContent = chat.title;

    title.ondblclick = (e) => {
      e.stopPropagation();

      const newTitle = prompt("Nuevo nombre:", chat.title);

      if (newTitle) {
        chat.title = newTitle;
        saveState();
        renderChatList();
      }
    };

    const deleteBtn = document.createElement("button");
    deleteBtn.textContent = "🗑";
    deleteBtn.type = "button";

    deleteBtn.onclick = (e) => {
      e.stopPropagation();
      deleteChat(chat.id);
    };

    container.appendChild(title);
    container.appendChild(deleteBtn);

    container.onclick = () => {
      activeChatId = chat.id;
      saveState();
      renderChatList();
      renderMessages();
    };

    chatListEl.appendChild(container);
  });
}

/* ---------- CHATS ---------- */

function createNewChat() {
  const id = Date.now().toString();

  chats.unshift({
    id,
    title: "Nueva conversación",
    messages: [
      {
        text: "Hola 👋 Bienvenido a chatNOVAP",
        sender: "bot",
        imageUrl: null,
        audioUrl: null
      }
    ]
  });

  activeChatId = id;

  saveState();
  renderChatList();
  renderMessages();
}

function deleteChat(id) {
  chats = chats.filter(c => c.id !== id);

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
}

/* ---------- ENVÍO RICO CON APOYO EN GENESIOS ---------- */

async function sendMessage() {
  if (isSending) return;

  const text = inputEl.value.trim();
  if (!text) return;

  const chat = chats.find(c => c.id === activeChatId);
  if (!chat) return;

  isSending = true;

  chat.messages.push({
    text,
    sender: "user",
    imageUrl: null,
    audioUrl: null
  });

  if (chat.title === "Nueva conversación") {
    chat.title = text.substring(0, 30);
  }

  inputEl.value = "";
  inputEl.focus();

  saveState();
  renderChatList();
  renderMessages();

  const messageDiv = addMessageToDOM(
    {
      text: "NOVA está escribiendo...",
      sender: "bot",
      imageUrl: null,
      audioUrl: null
    },
    "bot"
  );
  messageDiv.style.opacity = "0.7";

  let dots = 0;
  const typingInterval = setInterval(() => {
    dots = (dots + 1) % 4;
    messageDiv.innerHTML = buildBotContentHtml(
      "NOVA está escribiendo" + ".".repeat(dots),
      null,
      null
    );
  }, 400);

  try {
    const url = `${API_BASE_URL}/rich-reply?chat_id=${encodeURIComponent(activeChatId)}&message=${encodeURIComponent(text)}`;
    const res = await fetch(url, {
      method: "POST"
    });

    if (!res.ok) {
      throw new Error("Respuesta no válida del servidor");
    }

    const data = await res.json();

    clearInterval(typingInterval);
    messageDiv.style.opacity = "1";

    const finalText = data.reply || "No se pudo obtener respuesta.";
    const imageUrl = data.image_url || null;
    const audioUrl = data.audio_url || null;

    messageDiv.innerHTML = buildBotContentHtml(finalText, imageUrl, audioUrl);

    chat.messages.push({
      text: finalText,
      sender: "bot",
      imageUrl,
      audioUrl
    });

    if (audioUrl) {
      try {
        const audio = new Audio(audioUrl);
        audio.play().catch(() => {});
      } catch (_) {}
    }
  } catch (err) {
    clearInterval(typingInterval);
    messageDiv.textContent = "❌ Error conectando con NOVA";
    messageDiv.style.opacity = "1";
    console.error("chatNOVAP error:", err);
  }

  isSending = false;
  saveState();
  scrollMessagesToBottom();
}

/* ---------- EVENTOS ---------- */

sendBtn.addEventListener("click", (e) => {
  e.preventDefault();
  sendMessage();
});

readLastBtn.addEventListener("click", (e) => {
  e.preventDefault();
  readLastBotMessage();
});

inputEl.addEventListener("keydown", (e) => {
  if (e.key === "Enter" && !e.shiftKey) {
    e.preventDefault();
    sendMessage();
  }
});

newChatBtn.addEventListener("click", (e) => {
  e.preventDefault();
  createNewChat();
});

/* ---------- INIT ---------- */

loadState();

if (!chats.length) {
  createNewChat();
} else {
  if (!activeChatId || !chats.find(c => c.id === activeChatId)) {
    activeChatId = chats[0].id;
  }

  saveState();
  renderChatList();
  renderMessages();
}