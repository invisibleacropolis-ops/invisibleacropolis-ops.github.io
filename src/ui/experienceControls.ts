import type { ExperienceMode, ExperienceState } from "./experienceState.ts";

export type ExperienceControlsController = {
  setState: (state: ExperienceState) => void;
  dispose: () => void;
};

export const createExperienceControls = ({
  root,
  onModeChange,
  onOpenOnboarding,
}: {
  root: HTMLElement;
  onModeChange: (mode: ExperienceMode) => void;
  onOpenOnboarding: () => void;
}): ExperienceControlsController => {
  const wrap = document.createElement("div");
  wrap.className = "experience-controls ui-panel";

  const heading = document.createElement("p");
  heading.className = "experience-controls__label";
  heading.textContent = "Interaction mode";

  const modes: ExperienceMode[] = ["guided", "explorer", "accessibility"];
  const buttons = new Map<ExperienceMode, HTMLButtonElement>();

  const row = document.createElement("div");
  row.className = "experience-controls__modes";

  modes.forEach((mode) => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "experience-controls__mode ui-button";
    button.dataset.mode = mode;
    button.textContent = mode[0].toUpperCase() + mode.slice(1);
    button.addEventListener("click", () => onModeChange(mode));
    buttons.set(mode, button);
    row.append(button);
  });

  const status = document.createElement("p");
  status.className = "experience-controls__status";

  const onboarding = document.createElement("button");
  onboarding.type = "button";
  onboarding.className = "experience-controls__onboarding ui-button";
  onboarding.textContent = "Controls & onboarding";
  onboarding.addEventListener("click", onOpenOnboarding);

  wrap.append(heading, row, status, onboarding);
  root.append(wrap);

  return {
    setState: (state) => {
      buttons.forEach((button, mode) => {
        const selected = state.mode === mode;
        button.classList.toggle("is-active", selected);
        button.setAttribute("aria-pressed", String(selected));
      });

      const lockStatus = state.mode === "explorer"
        ? state.pointerLockConsent
          ? "Pointer lock enabled. Click Enter Platform to lock camera."
          : "Explorer mode requires consent for pointer lock."
        : "Pointer lock disabled in this mode.";
      status.textContent = lockStatus;
    },
    dispose: () => {
      onboarding.removeEventListener("click", onOpenOnboarding);
      buttons.forEach((button) => button.remove());
      wrap.remove();
    },
  };
};
