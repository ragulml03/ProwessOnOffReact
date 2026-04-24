const USER_KEY_STORAGE = "ld-user-key";

function resolveUserKey() {
  const url = new URL(window.location.href);
  const fromQuery = url.searchParams.get("ldUserKey");
  if (fromQuery) {
    localStorage.setItem(USER_KEY_STORAGE, fromQuery);
    return fromQuery;
  }

  const stored = localStorage.getItem(USER_KEY_STORAGE);
  if (stored) {
    return stored;
  }

  const generated = `anon-${crypto.randomUUID()}`;
  localStorage.setItem(USER_KEY_STORAGE, generated);
  return generated;
}

export function getLaunchDarklyConfig() {
  const clientSideId = import.meta.env.VITE_LD_CLIENT_SIDE_ID ?? "";
  const userKey = resolveUserKey();
  return {
    clientSideId,
    context: {
      kind: "user",
      key: userKey,
    },
  };
}
