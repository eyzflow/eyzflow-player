import type { ImaGlobal } from "./shaka-types";

const IMA_SDK_URL = "https://imasdk.googleapis.com/js/sdkloader/ima3.js";
const SCRIPT_ID = "eyz-ima-sdk";

let pending: Promise<ImaGlobal> | null = null;

function current(): ImaGlobal | null {
  const ima = (window as Window & { google?: { ima?: ImaGlobal } }).google?.ima;
  return ima?.AdsLoader ? ima : null;
}

/**
 * Loads Google's IMA SDK for client-side ads, once per page. Rejects when the script is blocked (ad blockers do) or
 * does not load within `timeoutMs`; the caller then plays the content without ads.
 */
export function loadIma(timeoutMs = 5000): Promise<ImaGlobal> {
  if (typeof window === "undefined") return Promise.reject(new Error("loadIma is browser-only"));
  const ready = current();
  if (ready) return Promise.resolve(ready);
  if (pending) return pending;

  pending = new Promise<ImaGlobal>((resolve, reject) => {
    let script = document.getElementById(SCRIPT_ID) as HTMLScriptElement | null;
    if (!script) {
      script = document.createElement("script");
      script.id = SCRIPT_ID;
      script.async = true;
      script.src = IMA_SDK_URL;
      document.head.appendChild(script);
    }
    const timer = setTimeout(() => done(new Error("IMA SDK timed out")), timeoutMs);
    const done = (error?: Error) => {
      clearTimeout(timer);
      script?.removeEventListener("load", onLoad);
      script?.removeEventListener("error", onError);
      const ima = current();
      if (!error && ima) {
        resolve(ima);
        return;
      }
      // Let a later player try again (the viewer may turn the blocker off).
      pending = null;
      script?.remove();
      reject(error ?? new Error("IMA SDK did not initialise"));
    };
    const onLoad = () => done();
    const onError = () => done(new Error("IMA SDK blocked or unreachable"));
    script.addEventListener("load", onLoad);
    script.addEventListener("error", onError);
  });
  return pending;
}
