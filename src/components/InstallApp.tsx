"use client";

import { useEffect, useId, useRef, useState } from "react";

interface InstallEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

export default function InstallApp() {
  const [prompt, setPrompt] = useState<InstallEvent | null>(null);
  const [installed, setInstalled] = useState(false);
  const [showHelp, setShowHelp] = useState(false);
  const dialog = useRef<HTMLDialogElement>(null);
  const id = useId();

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

  useEffect(() => {
    const element = dialog.current;
    if (showHelp) element?.showModal();
    return () => element?.close();
  }, [showHelp]);

  async function install() {
    if (!prompt) {
      setShowHelp(true);
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
        aria-haspopup="dialog"
        aria-expanded={showHelp}
        aria-controls={showHelp ? id : undefined}
        className="min-h-11 rounded-full border border-line-strong bg-white px-3.5 py-1.5 text-sm font-medium text-ink hover:bg-primary-light"
      >
        {prompt ? "Install app" : "Get the app"}
      </button>
      {showHelp && (
        <dialog
          ref={dialog}
          id={id}
          className="install-dialog"
          aria-label="Install instructions"
          onClose={() => setShowHelp(false)}
          onClick={(event) => {
            if (event.target === event.currentTarget) dialog.current?.close();
          }}
        >
          <div className="install-dialog-content">
            <p className="eyebrow">YOUR BUILDING, ONE TAP AWAY</p>
            <h2>Make yourself at home.</h2>
            <p>Add the resident portal to your home screen for quick access.</p>
            <ol>
              <li>
                <strong>iPhone & iPad</strong>
                <span>Open in Safari, tap Share, then Add to Home Screen.</span>
              </li>
              <li>
                <strong>Android & desktop</strong>
                <span>
                  Choose Install app or Add to Home screen from your browser
                  menu. Installation options depend on your browser.
                </span>
              </li>
            </ol>
            <p className="install-small">
              You can always use the portal in your browser. A connection is
              needed for current payment records.
            </p>
            <button
              autoFocus
              type="button"
              className="solid-button"
              onClick={() => dialog.current?.close()}
            >
              Got it
            </button>
          </div>
        </dialog>
      )}
    </div>
  );
}
