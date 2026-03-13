export type HeroOverlayAction = "enter" | "explore";

export type HeroOverlayOptions = {
  root: HTMLElement;
  onAction?: (action: HeroOverlayAction) => void;
  onImpression?: (action: HeroOverlayAction) => void;
};

export type HeroOverlayController = {
  show: () => void;
  hide: () => void;
  markInteracted: () => void;
  setLocked: (locked: boolean) => void;
  dispose: () => void;
};

export const createHeroOverlay = ({ root, onAction, onImpression }: HeroOverlayOptions): HeroOverlayController => {
  const overlay = root.querySelector<HTMLElement>("[data-hero-overlay]");
  const affordance = root.querySelector<HTMLElement>("[data-overlay-affordance]");
  const actionButtons = Array.from(root.querySelectorAll<HTMLButtonElement>("[data-overlay-action]"));

  if (!overlay || !affordance) {
    throw new Error("Hero overlay markup is incomplete");
  }

  let hasInteracted = false;
  const impressedActions = new Set<HeroOverlayAction>();

  const emitImpressions = () => {
    actionButtons.forEach((button) => {
      const action = button.dataset.overlayAction as HeroOverlayAction | undefined;
      if (!action || impressedActions.has(action)) return;
      impressedActions.add(action);
      onImpression?.(action);
    });
  };

  const markInteracted = () => {
    if (hasInteracted) return;
    hasInteracted = true;
    overlay.classList.add("is-interacted");
    affordance.setAttribute("aria-hidden", "true");
  };

  const show = () => {
    overlay.classList.remove("is-hidden");
    emitImpressions();
  };

  const hide = () => {
    overlay.classList.add("is-hidden");
    markInteracted();
  };

  const setLocked = (locked: boolean) => {
    if (locked) {
      hide();
      return;
    }

    if (!hasInteracted) {
      show();
    }
  };

  const onPointerOrScroll = () => {
    markInteracted();
  };

  const onButtonClick = (event: Event) => {
    markInteracted();

    const button = event.currentTarget as HTMLButtonElement;
    const action = button.dataset.overlayAction as HeroOverlayAction | undefined;
    if (!action) return;

    if (action === "explore") {
      hide();
    }

    onAction?.(action);
  };

  actionButtons.forEach((button) => button.addEventListener("click", onButtonClick));
  window.addEventListener("wheel", onPointerOrScroll, { passive: true });
  window.addEventListener("pointerdown", onPointerOrScroll, { passive: true });
  window.addEventListener("keydown", onPointerOrScroll);

  return {
    show,
    hide,
    markInteracted,
    setLocked,
    dispose: () => {
      actionButtons.forEach((button) => button.removeEventListener("click", onButtonClick));
      window.removeEventListener("wheel", onPointerOrScroll);
      window.removeEventListener("pointerdown", onPointerOrScroll);
      window.removeEventListener("keydown", onPointerOrScroll);
    },
  };
};
