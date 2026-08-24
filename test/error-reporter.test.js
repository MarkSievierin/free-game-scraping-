const assert = require("node:assert/strict");
const test = require("node:test");

const {
  buildInternalErrorMessage,
  createErrorReporter,
} = require("../src/application/error-reporter");

test("builds a readable escaped stage error message", () => {
  const message = buildInternalErrorMessage({
    scope: "source.epic",
    error: new Error("Catalog <response> failed"),
    context: { status: 503 },
  });

  assert.match(message, /Внутренняя ошибка stage/);
  assert.match(message, /source\.epic/);
  assert.match(message, /Catalog &lt;response&gt; failed/);
  assert.match(message, /&quot;status&quot;:503/);
});

test("reports stage errors to the dev chat", async () => {
  const calls = [];
  const reportError = createErrorReporter({
    env: {
      APP_TYPE: "stage",
      CHAT_ID_DEV: "-5193737797",
    },
    telegramClient: {
      async sendMessage(dto) {
        calls.push(dto.toPayload());
      },
    },
  });

  await reportError({
    scope: "application.run",
    error: new Error("Database is unavailable"),
  });

  assert.equal(calls.length, 1);
  assert.equal(calls[0].chat_id, "-5193737797");
  assert.equal(calls[0].parse_mode, "HTML");
  assert.match(calls[0].text, /Database is unavailable/);
});

test("does not report production errors to the dev chat", async () => {
  const calls = [];
  const reportError = createErrorReporter({
    env: {
      APP_TYPE: "prod",
      CHAT_ID_DEV: "-5193737797",
    },
    telegramClient: {
      async sendMessage() {
        calls.push(true);
      },
    },
  });

  await reportError({
    scope: "application.run",
    error: new Error("Production error"),
  });

  assert.deepEqual(calls, []);
});
