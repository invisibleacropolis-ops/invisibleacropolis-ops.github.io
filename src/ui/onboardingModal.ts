import type { ExperienceState } from "./experienceState.ts";

export type OnboardingModalController = {
  open: () => void;
  close: () => void;
  setState: (state: ExperienceState) => void;
  dispose: () => void;
};

export const createOnboardingModal = ({
  root,
  onConsent,
  onSkip,
  onNeverShow,
}: {
  root: HTMLElement;
  onConsent: () => void;
  onSkip: (neverShowAgain: boolean) => void;
  onNeverShow: (neverShowAgain: boolean) => void;
}): OnboardingModalController => {
  const backdrop = document.createElement("section");
  backdrop.className = "onboarding-modal";
  backdrop.hidden = true;

  const panel = document.createElement("div");
  panel.className = "onboarding-modal__panel ui-card ui-panel";
  panel.setAttribute("role", "dialog");
  panel.setAttribute("aria-modal", "true");
  panel.setAttribute("aria-labelledby", "onboarding-modal-title");

  const title = document.createElement("h2");
  title.className = "onboarding-modal__title";
  title.id = "onboarding-modal-title";
  title.textContent = "Choose your interaction mode";

  const instructions = document.createElement("p");
  instructions.className = "onboarding-modal__instructions";
  instructions.textContent =
    "Guided mode auto-tours highlights. Explorer mode supports mouse look + W/A/S/D with pointer lock. Accessibility mode uses low-motion keyboard navigation and never locks pointer.";

  const consent = document.createElement("button");
  consent.type = "button";
  consent.className = "onboarding-modal__cta ui-button";
  consent.textContent = "I consent to pointer lock (Explorer mode)";

  const skip = document.createElement("button");
  skip.type = "button";
  skip.className = "onboarding-modal__secondary ui-button";
  skip.textContent = "Skip for now";

  const neverLabel = document.createElement("label");
  neverLabel.className = "onboarding-modal__never";
  const neverInput = document.createElement("input");
  neverInput.type = "checkbox";
  neverInput.name = "never-show-onboarding";
  neverLabel.append(neverInput, document.createTextNode("Never show this again"));

  const close = document.createElement("button");
  close.type = "button";
  close.className = "onboarding-modal__secondary ui-button";
  close.textContent = "Close";

  panel.append(title, instructions, consent, skip, neverLabel, close);
  backdrop.append(panel);
  root.append(backdrop);

  const closeModal = () => {
    backdrop.hidden = true;
  };

  const openModal = () => {
    backdrop.hidden = false;
  };

  const syncNeverShow = () => {
    onNeverShow(neverInput.checked);
  };

  const onBackdropClick = (event: MouseEvent) => {
    if (event.target === backdrop) {
      closeModal();
    }
  };

  consent.addEventListener("click", () => {
    onConsent();
    closeModal();
  });
  skip.addEventListener("click", () => {
    onSkip(neverInput.checked);
    closeModal();
  });
  close.addEventListener("click", closeModal);
  neverInput.addEventListener("change", syncNeverShow);
  backdrop.addEventListener("click", onBackdropClick);

  return {
    open: openModal,
    close: closeModal,
    setState: (state) => {
      neverInput.checked = state.neverShowOnboarding;
      consent.disabled = state.pointerLockConsent;
      consent.textContent = state.pointerLockConsent
        ? "Pointer lock consent granted"
        : "I consent to pointer lock (Explorer mode)";
    },
    dispose: () => {
      neverInput.removeEventListener("change", syncNeverShow);
      backdrop.removeEventListener("click", onBackdropClick);
      backdrop.remove();
    },
  };
};
