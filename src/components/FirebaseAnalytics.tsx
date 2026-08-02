import Script from "next/script";
import { firebaseWebConfig } from "@/lib/firebase-web-config";

const sdkVersion = "11.10.0";
const configuration = JSON.stringify(firebaseWebConfig).replaceAll("<", "\\u003c");

/** Loads only Firebase App + Analytics in the browser after hydration. */
export function FirebaseAnalytics() {
  return (
    <Script id="firebase-analytics" type="module" strategy="afterInteractive">
      {`
        import { initializeApp } from "https://www.gstatic.com/firebasejs/${sdkVersion}/firebase-app.js";
        import { getAnalytics, isSupported } from "https://www.gstatic.com/firebasejs/${sdkVersion}/firebase-analytics.js";

        const app = initializeApp(${configuration});
        if (await isSupported()) getAnalytics(app);
      `}
    </Script>
  );
}
