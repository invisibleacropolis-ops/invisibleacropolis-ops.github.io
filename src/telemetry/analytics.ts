export type AnalyticsEventMap = {
  first_meaningful_paint: {
    appStartMs: number;
    uiReadyMs: number;
    sceneReadyMs: number;
    meaningfulPaintMs: number;
    qualityTier: string;
    qualitySource: "auto" | "manual";
  };
  cta_impression: {
    ctaId: string;
    placement: string;
  };
  cta_click: {
    ctaId: string;
    placement: string;
  };
  mode_selected: {
    mode: "guided" | "explorer" | "accessibility";
    previousMode: "guided" | "explorer" | "accessibility";
    source: "hero-overlay" | "experience-controls";
  };
  link_interaction: {
    url: string;
    origin: "world-link" | "navigation-hub";
    status: "success" | "failure";
    reason?: string;
  };
  session_depth: {
    pagesVisited: number;
    uniquePagesVisited: number;
    dwellTimeMs: number;
    currentPath: string;
  };
};

export type AnalyticsEventName = keyof AnalyticsEventMap;

export type AnalyticsProvider = {
  track: (eventName: string, payload: Record<string, unknown>) => void;
};

export type AnalyticsClient = {
  track: <TEventName extends AnalyticsEventName>(
    eventName: TEventName,
    payload: AnalyticsEventMap[TEventName]
  ) => void;
  addProvider: (provider: AnalyticsProvider) => void;
};

const sanitizePayload = (payload: Record<string, unknown>): Record<string, unknown> => {
  return Object.fromEntries(Object.entries(payload).filter(([, value]) => value !== undefined));
};

export const createAnalyticsClient = (providers: AnalyticsProvider[] = []): AnalyticsClient => {
  const activeProviders = [...providers];

  return {
    track: (eventName, payload) => {
      const safePayload = sanitizePayload(payload as Record<string, unknown>);
      activeProviders.forEach((provider) => {
        try {
          provider.track(eventName, safePayload);
        } catch (error) {
          console.warn(`[analytics] provider failed for ${eventName}`, error);
        }
      });
    },
    addProvider: (provider) => {
      activeProviders.push(provider);
    },
  };
};

export const createWindowEventAnalyticsProvider = (
  eventName = "invisible-acropolis-analytics"
): AnalyticsProvider => ({
  track: (name, payload) => {
    window.dispatchEvent(
      new CustomEvent(eventName, {
        detail: {
          name,
          payload,
          timestamp: Date.now(),
        },
      })
    );
  },
});

export const createDataLayerAnalyticsProvider = (layerName = "dataLayer"): AnalyticsProvider => ({
  track: (eventName, payload) => {
    const globalScope = window as unknown as {
      [key: string]: Array<Record<string, unknown>> | undefined;
    };
    const layer = globalScope[layerName];
    if (!Array.isArray(layer)) {
      return;
    }

    layer.push({
      event: eventName,
      ...payload,
      trackedAt: Date.now(),
    });
  },
});

export const createConsoleAnalyticsProvider = (): AnalyticsProvider => ({
  track: (eventName, payload) => {
    console.info(`[analytics] ${eventName}`, payload);
  },
});
