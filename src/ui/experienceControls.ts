import type { QualityTier } from "../effects/postprocessing.ts";
import type { ExperienceMode, ExperienceState } from "./experienceState.ts";

export type ExperienceControlsController = {
  setState: (state: ExperienceState) => void;
  setQualityTier: (qualityTier: QualityTier, isAuto: boolean) => void;
  dispose: () => void;
};

export type ModeChangeSource = "experience-controls";

export const createExperienceControls = ({
  root,
  onModeChange,
  onOpenOnboarding,
  onQualityChange,
}: {
  root: HTMLElement;
  onModeChange: (mode: ExperienceMode, source: ModeChangeSource) => void;
  onOpenOnboarding: () => void;
  onQualityChange: (tier: QualityTier) => void;
}): ExperienceControlsController => {
  const wrap = document.createElement("div");
  wrap.className = "experience-controls ui-panel";

  const heading = document.createElement("p");
  heading.className = "experience-controls__label";
  heading.textContent = "Interaction mode";

  const modes: ExperienceMode[] = ["explorer", "accessibility"];
  const buttons = new Map<ExperienceMode, HTMLButtonElement>();

  const row = document.createElement("div");
  row.className = "experience-controls__modes";

  modes.forEach((mode) => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "experience-controls__mode ui-button";
    button.dataset.mode = mode;
    button.textContent = mode[0].toUpperCase() + mode.slice(1);
    button.addEventListener("click", () => onModeChange(mode, "experience-controls"));
    buttons.set(mode, button);
    row.append(button);
  });

  const qualityLabel = document.createElement("label");
  qualityLabel.className = "experience-controls__quality-label";
  qualityLabel.textContent = "Rendering quality";

  const qualityRow = document.createElement("div");
  qualityRow.className = "experience-controls__quality";

  const qualitySelect = document.createElement("select");
  qualitySelect.className = "experience-controls__quality-select ui-button";
  qualitySelect.setAttribute("aria-label", "Rendering quality");

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
  qualityHint.className = "experience-controls__quality-hint";

  const handleQualityChange = () => {
    onQualityChange(qualitySelect.value as QualityTier);
  };

  qualitySelect.addEventListener("change", handleQualityChange);

  qualityRow.append(qualitySelect, qualityHint);

  const status = document.createElement("p");
  status.className = "experience-controls__status";

  wrap.append(heading, row, qualityLabel, qualityRow, status);
  root.append(wrap);

  return {
    setState: (state) => {
      buttons.forEach((button, mode) => {
        const selected = state.mode === mode;
        button.classList.toggle("is-active", selected);
        button.setAttribute("aria-pressed", String(selected));
      });

      const lockStatus = state.mode === "explorer"
        ? "Pointer lock active. Click in canvas to lock camera."
        : "Pointer lock disabled in accessibility mode.";
      status.textContent = lockStatus;
    },
    setQualityTier: (qualityTier, isAuto) => {
      qualitySelect.value = qualityTier;
      qualityHint.textContent = isAuto ? "Auto-selected for this device" : "Manual override";
    },
    dispose: () => {
      qualitySelect.removeEventListener("change", handleQualityChange);
      buttons.forEach((button) => button.remove());
      wrap.remove();
    },
  };
};
