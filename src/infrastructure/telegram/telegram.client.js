class TelegramClient {
  constructor({ botToken }) {
    if (!botToken) {
      throw new Error("Telegram bot token is required");
    }

    this.botToken = botToken;
  }

  async sendMessage(dto) {
    return this.request("sendMessage", dto.toPayload());
  }

  async sendPhoto(dto) {
    return this.request("sendPhoto", dto.toPayload());
  }

  async deleteMessage({ chatId, messageId }) {
    return this.request("deleteMessage", {
      chat_id: chatId,
      message_id: messageId,
    });
  }

  async editMessageText({ chatId, messageId, text, parseMode, replyMarkup }) {
    return this.request("editMessageText", {
      chat_id: chatId,
      message_id: messageId,
      text,
      ...(parseMode ? { parse_mode: parseMode } : {}),
      ...(replyMarkup ? { reply_markup: replyMarkup } : {}),
      disable_web_page_preview: "true",
    });
  }

  async editMessageCaption({ chatId, messageId, caption, parseMode, replyMarkup }) {
    return this.request("editMessageCaption", {
      chat_id: chatId,
      message_id: messageId,
      caption,
      ...(parseMode ? { parse_mode: parseMode } : {}),
      ...(replyMarkup ? { reply_markup: replyMarkup } : {}),
    });
  }

  async request(method, payload) {
    const url = `https://api.telegram.org/bot${this.botToken}/${method}`;
    const body = new URLSearchParams();

    for (const [key, value] of Object.entries(payload)) {
      const normalizedValue =
        value !== null && typeof value === "object" ? JSON.stringify(value) : String(value);

      body.append(key, normalizedValue);
    }

    const response = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body,
    });

    if (!response.ok) {
      throw new Error(`Telegram request failed with status ${response.status}`);
    }

    const data = await response.json();
    if (!data.ok) {
      throw new Error(`Telegram API error: ${data.description || "Unknown error"}`);
    }

    return data;
  }
}

module.exports = {
  TelegramClient,
};
