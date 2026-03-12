export type ExperienceMode = "guided" | "explorer" | "accessibility";

export type ExperienceState = {
  mode: ExperienceMode;
  pointerLockConsent: boolean;
  onboardingSeen: boolean;
  neverShowOnboarding: boolean;
};

type ExperienceAction =
  | { type: "set-mode"; mode: ExperienceMode }
  | { type: "set-pointer-lock-consent"; consent: boolean }
  | { type: "set-onboarding-seen"; seen: boolean }
  | { type: "set-never-show-onboarding"; neverShow: boolean };

export const EXPERIENCE_STORAGE_KEY = "invisible_acropolis_experience_state";

const initialState: ExperienceState = {
  mode: "guided",
  pointerLockConsent: false,
  onboardingSeen: false,
  neverShowOnboarding: false,
};

const sanitizeMode = (value: unknown): ExperienceMode => {
  if (value === "guided" || value === "explorer" || value === "accessibility") {
    return value;
  }
  return initialState.mode;
};

export const loadExperienceState = (): ExperienceState => {
  try {
    const raw = localStorage.getItem(EXPERIENCE_STORAGE_KEY);
    if (!raw) return initialState;
    const parsed = JSON.parse(raw) as Partial<ExperienceState>;
    return {
      mode: sanitizeMode(parsed.mode),
      pointerLockConsent: Boolean(parsed.pointerLockConsent),
      onboardingSeen: Boolean(parsed.onboardingSeen),
      neverShowOnboarding: Boolean(parsed.neverShowOnboarding),
    };
  } catch (error) {
    console.warn("Failed to load experience state", error);
    return initialState;
  }
};

const reducer = (state: ExperienceState, action: ExperienceAction): ExperienceState => {
  switch (action.type) {
    case "set-mode":
      return { ...state, mode: action.mode };
    case "set-pointer-lock-consent":
      return { ...state, pointerLockConsent: action.consent };
    case "set-onboarding-seen":
      return { ...state, onboardingSeen: action.seen };
    case "set-never-show-onboarding":
      return { ...state, neverShowOnboarding: action.neverShow };
    default:
      return state;
  }
};

export const createExperienceStateMachine = (seed = loadExperienceState()) => {
  let state: ExperienceState = seed;
  const listeners = new Set<(next: ExperienceState) => void>();

  const emit = () => {
    try {
      localStorage.setItem(EXPERIENCE_STORAGE_KEY, JSON.stringify(state));
    } catch (error) {
      console.warn("Failed to persist experience state", error);
    }
    listeners.forEach((listener) => listener(state));
  };

  const dispatch = (action: ExperienceAction) => {
    const next = reducer(state, action);
    if (next === state) return;
    state = next;
    emit();
  };

  const subscribe = (listener: (next: ExperienceState) => void) => {
    listeners.add(listener);
    listener(state);
    return () => {
      listeners.delete(listener);
    };
  };

  return {
    getState: () => state,
    dispatch,
    subscribe,
  };
};
