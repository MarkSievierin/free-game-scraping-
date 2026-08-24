const STEAM_LANGUAGE = "russian";
const STEAM_COUNTRY_CODE = "ru";
const STEAM_URL =
  `https://store.steampowered.com/search/results/?sort_by=Price_ASC&force_infinite=1&specials=1&l=${STEAM_LANGUAGE}&cc=${STEAM_COUNTRY_CODE}`;
const STEAM_APP_DETAILS_URL = "https://store.steampowered.com/api/appdetails";
const STEAM_REQUEST_HEADERS = {
  "User-Agent": "Mozilla/5.0",
};

async function requestText(url) {
  const response = await fetch(url, {
    headers: STEAM_REQUEST_HEADERS,
  });

  if (!response.ok) {
    throw new Error(`Steam request failed with status ${response.status}`);
  }

  return response.text();
}

async function requestJson(url) {
  const response = await fetch(url, {
    headers: STEAM_REQUEST_HEADERS,
  });

  if (!response.ok) {
    throw new Error(`Steam request failed with status ${response.status}`);
  }

  return response.json();
}

function buildLocalizedSteamUrl(url) {
  if (!url) {
    return "";
  }

  const separator = url.includes("?") ? "&" : "?";
  return `${url}${separator}l=${STEAM_LANGUAGE}&cc=${STEAM_COUNTRY_CODE}`;
}

async function fetchSteamAppDetails(appId) {
  const url =
    `${STEAM_APP_DETAILS_URL}?appids=${appId}&l=${STEAM_LANGUAGE}&cc=${STEAM_COUNTRY_CODE}`;

  return requestJson(url);
}

async function fetchSteamPageMetadata(link) {
  return requestText(buildLocalizedSteamUrl(link));
}

module.exports = {
  STEAM_URL,
  buildLocalizedSteamUrl,
  fetchSteamAppDetails,
  fetchSteamPageMetadata,
  requestText,
};
