import { useSyncExternalStore } from "react";

function subscribe(callback) {
  window.addEventListener("popstate", callback);
  window.addEventListener("hashchange", callback);
  return () => {
    window.removeEventListener("popstate", callback);
    window.removeEventListener("hashchange", callback);
  };
}

export function useLocation() {
  return useSyncExternalStore(
    subscribe,
    () =>
      window.location.pathname + window.location.search + window.location.hash,
  );
}

export function navigate(path) {
  window.history.pushState(null, "", path);
  window.dispatchEvent(new PopStateEvent("popstate"));
}

// Preserve normal link behavior for new tabs, modified clicks and copying URLs.
export function followLink(event) {
  if (
    event.defaultPrevented ||
    event.button !== 0 ||
    event.metaKey ||
    event.ctrlKey ||
    event.shiftKey ||
    event.altKey ||
    (event.currentTarget.target && event.currentTarget.target !== "_self")
  )
    return;
  const url = new URL(event.currentTarget.href, window.location.href);
  if (url.origin !== window.location.origin) return;
  event.preventDefault();
  navigate(url.pathname + url.search + url.hash);
}
