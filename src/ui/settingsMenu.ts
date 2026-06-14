import type { QualityTier } from "../effects/postprocessing.ts";
import type { ExperienceMode, ExperienceState } from "./experienceState.ts";

export type SettingsMenuController = {
  open: () => void;
  setState: (state: ExperienceState) => void;
  setQualityTier: (qualityTier: QualityTier, isAuto: boolean) => void;
  dispose: () => void;
};

export type ModeChangeSource = "settings-menu";

const KEYBOARD_KEYS = new Set(["Enter", " "]);

export const createSettingsMenu = ({
  root,
  triggerHost,
  onModeChange,
  onQualityChange,
}: {
  root: HTMLElement;
  /** Where the trigger button is appended; defaults to root. */
  triggerHost?: HTMLElement;
  onModeChange: (mode: ExperienceMode, source: ModeChangeSource) => void;
  onQualityChange: (tier: QualityTier) => void;
}): SettingsMenuController => {
  const trigger = document.createElement("button");
  trigger.type = "button";
  trigger.className = "settings-menu__trigger ui-button";
  trigger.textContent = "Settings";
  trigger.setAttribute("aria-haspopup", "dialog");
  trigger.setAttribute("aria-expanded", "false");

  const backdrop = document.createElement("div");
  backdrop.className = "settings-menu__backdrop";
  backdrop.hidden = true;

  const panel = document.createElement("section");
  panel.className = "settings-menu ui-card ui-panel";
  panel.setAttribute("role", "dialog");
  panel.setAttribute("aria-modal", "true");
  panel.setAttribute("aria-labelledby", "settings-menu-title");
  panel.tabIndex = -1;

  const header = document.createElement("div");
  header.className = "settings-menu__header";

  const title = document.createElement("h2");
  title.className = "settings-menu__title";
  title.id = "settings-menu-title";
  title.textContent = "Settings";

  const closeButton = document.createElement("button");
  closeButton.type = "button";
  closeButton.className = "settings-menu__close ui-button";
  closeButton.textContent = "Close";

  header.append(title, closeButton);

  // Interaction mode
  const modeSection = document.createElement("section");
  modeSection.className = "settings-menu__section";

  const modeLabel = document.createElement("p");
  modeLabel.className = "settings-menu__label";
  modeLabel.textContent = "Interaction mode";

  const modes: ExperienceMode[] = ["explorer", "accessibility"];
  const buttons = new Map<ExperienceMode, HTMLButtonElement>();

  const modeRow = document.createElement("div");
  modeRow.className = "settings-menu__modes";

  modes.forEach((mode) => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "settings-menu__mode ui-button";
    button.dataset.mode = mode;
    button.textContent = mode[0].toUpperCase() + mode.slice(1);
    button.addEventListener("click", () => onModeChange(mode, "settings-menu"));
    buttons.set(mode, button);
    modeRow.append(button);
  });

  const status = document.createElement("p");
  status.className = "settings-menu__status";

  modeSection.append(modeLabel, modeRow, status);

  // Rendering quality
  const qualitySection = document.createElement("section");
  qualitySection.className = "settings-menu__section";

  const qualityLabel = document.createElement("label");
  qualityLabel.className = "settings-menu__label";
  qualityLabel.htmlFor = "settings-menu-quality";
  qualityLabel.textContent = "Rendering quality";

  const qualityRow = document.createElement("div");
  qualityRow.className = "settings-menu__quality";

  const qualitySelect = document.createElement("select");
  qualitySelect.id = "settings-menu-quality";
  qualitySelect.className = "settings-menu__quality-select ui-button";

  const options: Array<{ value: QualityTier; label: string }> = [
    { value: "low", label: "Low" },
    { value: "medium", label: "Medium" },
    { value: "high", label: "High" },
    { value: "ultra", label: "Ultra" },
  ];

  options.forEach((optionConfig) => {
    const option = document.createElement("option");
    option.value = optionConfig.value;
    option.textContent = optionConfig.label;
    qualitySelect.append(option);
  });

  const qualityHint = document.createElement("span");
  qualityHint.className = "settings-menu__quality-hint";

  const handleQualityChange = () => {
    onQualityChange(qualitySelect.value as QualityTier);
  };

  qualitySelect.addEventListener("change", handleQualityChange);
  qualityRow.append(qualitySelect, qualityHint);
  qualitySection.append(qualityLabel, qualityRow);

  panel.append(header, modeSection, qualitySection);
  backdrop.append(panel);
  (triggerHost ?? root).append(trigger);
  root.append(backdrop);

  let isOpen = false;
  let restoreFocus: HTMLElement | null = null;

  const focusableSelectors = 'a[href], button:not([disabled]), select, [tabindex]:not([tabindex="-1"])';

  const trapFocus = (event: KeyboardEvent) => {
    if (event.key !== "Tab" || !isOpen) return;

    const focusable = Array.from(panel.querySelectorAll<HTMLElement>(focusableSelectors));
    if (focusable.length === 0) {
      event.preventDefault();
      panel.focus();
      return;
    }

    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    const active = document.activeElement as HTMLElement | null;

    if (event.shiftKey && active === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && active === last) {
      event.preventDefault();
      first.focus();
    }
  };

  const closePanel = () => {
    isOpen = false;
    backdrop.hidden = true;
    trigger.setAttribute("aria-expanded", "false");
    if (restoreFocus) {
      restoreFocus.focus();
    }
  };

  const openPanel = () => {
    isOpen = true;
    restoreFocus = document.activeElement as HTMLElement | null;
    backdrop.hidden = false;
    trigger.setAttribute("aria-expanded", "true");
    closeButton.focus();
  };

  const onGlobalKeydown = (event: KeyboardEvent) => {
    if (event.key === "Escape" && isOpen) {
      event.preventDefault();
      closePanel();
      return;
    }
    trapFocus(event);
  };

  const onTriggerKeydown = (event: KeyboardEvent) => {
    if (KEYBOARD_KEYS.has(event.key)) {
      event.preventDefault();
      openPanel();
    }
  };

  const onTriggerClick = () => {
    if (isOpen) {
      closePanel();
      return;
    }
    openPanel();
  };

  const onBackdropClick = (event: MouseEvent) => {
    if (event.target === backdrop) {
      closePanel();
    }
  };

  trigger.addEventListener("click", onTriggerClick);
  trigger.addEventListener("keydown", onTriggerKeydown);
  closeButton.addEventListener("click", closePanel);
  backdrop.addEventListener("click", onBackdropClick);
  window.addEventListener("keydown", onGlobalKeydown);

  return {
    open: openPanel,
    setState: (state) => {
      buttons.forEach((button, mode) => {
        const selected = state.mode === mode;
        button.classList.toggle("is-active", selected);
        button.setAttribute("aria-pressed", String(selected));
      });

      status.textContent = state.mode === "explorer"
        ? "Pointer lock active. Click in canvas to lock camera."
        : "Pointer lock disabled in accessibility mode.";
    },
    setQualityTier: (qualityTier, isAuto) => {
      qualitySelect.value = qualityTier;
      qualityHint.textContent = isAuto ? "Auto-selected for this device" : "Manual override";
    },
    dispose: () => {
      qualitySelect.removeEventListener("change", handleQualityChange);
      trigger.removeEventListener("click", onTriggerClick);
      trigger.removeEventListener("keydown", onTriggerKeydown);
      closeButton.removeEventListener("click", closePanel);
      backdrop.removeEventListener("click", onBackdropClick);
      window.removeEventListener("keydown", onGlobalKeydown);
      trigger.remove();
      backdrop.remove();
    },
  };
};
