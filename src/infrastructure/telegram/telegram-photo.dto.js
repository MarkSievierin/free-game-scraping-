class TelegramPhotoDto {
  constructor({ chatId, photo, caption = "", parseMode, replyMarkup }) {
    if (!chatId) {
      throw new Error("chatId is required for Telegram photo");
    }

    if (!photo) {
      throw new Error("photo is required for Telegram photo");
    }

    this.chatId = chatId;
    this.photo = photo;
    this.caption = caption;
    this.parseMode = parseMode;
    this.replyMarkup = replyMarkup;
  }

  toPayload() {
    const payload = {
      chat_id: this.chatId,
      photo: this.photo,
      caption: this.caption,
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

function buildTelegramPhotoRequestDto(input) {
  return new TelegramPhotoDto(input);
}

module.exports = {
  TelegramPhotoDto,
  buildTelegramPhotoRequestDto,
};
