"use client";

import { useEffect, useState } from "react";

interface InstallEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

// "Install app" button: uses the browser's install prompt where available (Chrome, Edge, Android) and
// shows Add-to-Home-Screen instructions elsewhere (iPhone/iPad Safari). Hidden once the app is installed.
export default function InstallApp() {
  const [prompt, setPrompt] = useState<InstallEvent | null>(null);
  const [installed, setInstalled] = useState(false);
  const [showHelp, setShowHelp] = useState(false);

  useEffect(() => {
    const displayMode = window.matchMedia("(display-mode: standalone)");
    const checkInstalled = () => setInstalled(displayMode.matches || Boolean((navigator as Navigator & { standalone?: boolean }).standalone));
    checkInstalled();
    const onPrompt = (event: Event) => {
      event.preventDefault();
      setPrompt(event as InstallEvent);
    };
    const onInstalled = () => {
      setInstalled(true);
      setPrompt(null);
      setShowHelp(false);
    };
    window.addEventListener("beforeinstallprompt", onPrompt);
    window.addEventListener("appinstalled", onInstalled);
    displayMode.addEventListener("change", checkInstalled);
    return () => {
      window.removeEventListener("beforeinstallprompt", onPrompt);
      window.removeEventListener("appinstalled", onInstalled);
      displayMode.removeEventListener("change", checkInstalled);
    };
  }, []);

  async function install() {
    if (!prompt) {
      setShowHelp((v) => !v);
      return;
    }
    try {
      await prompt.prompt();
      await prompt.userChoice;
    } catch {
      setShowHelp(true);
    } finally {
      setPrompt(null);
    }
  }

  if (installed) return null;
  return (
    <div className="relative">
      <button
        type="button"
        onClick={install}
        aria-expanded={showHelp}
        className="min-h-9 rounded-full border border-line-strong bg-white px-3.5 py-1.5 text-sm font-medium text-ink hover:bg-primary-light"
      >
        Get the app
      </button>
      {showHelp && (
        <div role="dialog" aria-label="Install instructions" className="absolute right-0 top-11 z-20 w-72 rounded-card border border-line bg-white p-4 text-left text-sm shadow-raised">
          <p className="font-semibold text-ink">Keep your building close</p>
          <p className="mt-1 text-xs text-muted">
            On iPhone or iPad, open this page in Safari, tap Share, then Add to Home Screen. On Android and desktop Chrome or Edge, choose Install app from the browser menu.
          </p>
          <button type="button" onClick={() => setShowHelp(false)} className="mt-3 text-xs font-semibold text-primary hover:underline">
            Got it
          </button>
        </div>
      )}
    </div>
  );
}
