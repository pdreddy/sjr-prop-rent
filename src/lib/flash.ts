const KEY = "admin:flash";

export function setFlashMessage(message: string) {
  try {
    sessionStorage.setItem(KEY, message);
  } catch {
    // sessionStorage unavailable (private browsing, etc.) - message is skippable
  }
}

export function consumeFlashMessage(): string | null {
  try {
    const message = sessionStorage.getItem(KEY);
    if (message) sessionStorage.removeItem(KEY);
    return message;
  } catch {
    return null;
  }
}
