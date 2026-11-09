"use client";

import { useEffect, useState } from "react";
import { Icon } from "./Icon";

interface InstallEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

export default function InstallApp() {
  const [prompt, setPrompt] = useState<InstallEvent | null>(null);
  const [installed, setInstalled] = useState(false);
  const [showHelp, setShowHelp] = useState(false);

  useEffect(() => {
    const displayMode = window.matchMedia("(display-mode: standalone)");
    const checkInstalled = () =>
      setInstalled(
        displayMode.matches ||
          Boolean(
            (navigator as Navigator & { standalone?: boolean }).standalone,
          ),
      );
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
      setShowHelp((value) => !value);
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
    <div className="install-app">
      <button
        className="install-button"
        onClick={install}
        aria-expanded={showHelp}
        aria-controls="install-help"
      >
        <Icon name="download" /> Get the app
      </button>
      {showHelp && (
        <div id="install-help" className="install-help">
          <strong>Keep your building close.</strong>
          <p>
            On iPhone or iPad, open in Safari, tap Share, then Add to Home
            Screen. In supported desktop and Android browsers, choose Install
            app from the browser menu.
          </p>
          <p>You can always use the portal in your browser.</p>
          <button className="text-button" onClick={() => setShowHelp(false)}>
            Got it
          </button>
        </div>
      )}
    </div>
  );
}
