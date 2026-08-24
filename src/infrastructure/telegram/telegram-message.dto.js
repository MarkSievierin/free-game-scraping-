class TelegramMessageDto {
  constructor({ chatId, text, disableWebPagePreview = false, parseMode, replyMarkup }) {
    if (!chatId) {
      throw new Error("chatId is required for Telegram message");
    }

    if (!text) {
      throw new Error("text is required for Telegram message");
    }

    this.chatId = chatId;
    this.text = text;
    this.disableWebPagePreview = disableWebPagePreview;
    this.parseMode = parseMode;
    this.replyMarkup = replyMarkup;
  }

  toPayload() {
    const payload = {
      chat_id: this.chatId,
      text: this.text,
      disable_web_page_preview: String(this.disableWebPagePreview),
    };

    if (this.parseMode) {
      payload.parse_mode = this.parseMode;
    }

    if (this.replyMarkup) {
      payload.reply_markup = this.replyMarkup;
    }

    return payload;
  }
}

function buildTelegramMessageRequestDto(input) {
  return new TelegramMessageDto(input);
}

module.exports = {
  TelegramMessageDto,
  buildTelegramMessageRequestDto,
};
