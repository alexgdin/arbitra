// Un `chrome` fals, doar cu ce folosește service worker-ul: storage.local, action, runtime, permissions.

export const EXTENSION_ID = "pretpilot-test-id";

/**
 * @param {{ permissionsGranted?: boolean }} [options]
 */
export function createFakeChrome({ permissionsGranted = true } = {}) {
  /** @type {Map<string, unknown>} */
  const data = new Map();
  /** @type {Map<number, { text: string, color: string, textColor: string }>} */
  const badges = new Map();
  const messageListeners = [];
  const permission = { granted: permissionsGranted };

  function badge(tabId) {
    if (!badges.has(tabId)) {
      badges.set(tabId, { text: "", color: "", textColor: "" });
    }
    return badges.get(tabId);
  }

  function pick(keys) {
    if (keys === null || keys === undefined) {
      return Object.fromEntries(data);
    }
    const list = typeof keys === "string" ? [keys] : keys;
    return Object.fromEntries(list.filter((key) => data.has(key)).map((key) => [key, data.get(key)]));
  }

  const chrome = {
    runtime: {
      id: EXTENSION_ID,
      getURL: (path = "") => `chrome-extension://${EXTENSION_ID}/${path}`,
      onMessage: { addListener: (listener) => messageListeners.push(listener) },
    },
    storage: {
      local: {
        get: async (keys) => pick(keys),
        set: async (items) => {
          for (const [key, value] of Object.entries(items)) {
            data.set(key, value);
          }
        },
        remove: async (keys) => {
          for (const key of typeof keys === "string" ? [keys] : keys) {
            data.delete(key);
          }
        },
      },
    },
    action: {
      setBadgeText: async ({ tabId, text }) => {
        badge(tabId).text = text;
      },
      setBadgeBackgroundColor: async ({ tabId, color }) => {
        badge(tabId).color = color;
      },
      setBadgeTextColor: async ({ tabId, color }) => {
        badge(tabId).textColor = color;
      },
    },
    permissions: { contains: async () => permission.granted },
  };

  /**
   * Trimite un mesaj ca din altă parte a extensiei și întoarce răspunsul.
   * Se rezolvă cu undefined când listener-ul nu răspunde.
   * @param {object} message
   * @param {object} sender
   */
  function sendMessage(message, sender) {
    return new Promise((resolve) => {
      const keepOpen = messageListeners[0](message, sender, resolve);
      if (keepOpen !== true) {
        queueMicrotask(() => resolve(undefined));
      }
    });
  }

  return { chrome, data, badges, permission, messageListeners, sendMessage };
}
