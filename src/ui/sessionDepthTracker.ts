import type { AnalyticsClient } from "../telemetry/analytics.ts";

export type SessionDepthTracker = {
  recordPageVisit: (pathOrUrl: string) => void;
  dispose: () => void;
};

const normalizePath = (pathOrUrl: string): string => {
  try {
    const url = new URL(pathOrUrl, window.location.href);
    return `${url.pathname}${url.search}${url.hash}`;
  } catch {
    return pathOrUrl;
  }
};

export const createSessionDepthTracker = (analytics: AnalyticsClient): SessionDepthTracker => {
  const startedAt = performance.now();
  const pagesVisited: string[] = [normalizePath(window.location.href)];

  const emitSnapshot = () => {
    const dwellTimeMs = Math.round(performance.now() - startedAt);
    analytics.track("session_depth", {
      pagesVisited: pagesVisited.length,
      uniquePagesVisited: new Set(pagesVisited).size,
      dwellTimeMs,
      currentPath: pagesVisited[pagesVisited.length - 1],
    });
  };

  const onPageHide = () => {
    emitSnapshot();
  };

  const onVisibilityChange = () => {
    if (document.visibilityState === "hidden") {
      emitSnapshot();
    }
  };

  window.addEventListener("pagehide", onPageHide);
  document.addEventListener("visibilitychange", onVisibilityChange);

  return {
    recordPageVisit: (pathOrUrl) => {
      pagesVisited.push(normalizePath(pathOrUrl));
      emitSnapshot();
    },
    dispose: () => {
      window.removeEventListener("pagehide", onPageHide);
      document.removeEventListener("visibilitychange", onVisibilityChange);
      emitSnapshot();
    },
  };
};
