import type { PageEntry } from "../data/pages.ts";

export type WaypointCardController = {
  /** Show (or retarget) the card for a destination. */
  show: (page: PageEntry, accentColor: string) => void;
  hide: () => void;
  /** Currently displayed destination, if any. */
  getActivePage: () => PageEntry | null;
  dispose: () => void;
};

/**
 * Bottom-center HUD card that surfaces whichever monument the visitor is
 * near or aiming at. Travelling happens via the E/Enter keys or by clicking
 * the card — far friendlier than clicking thin wireframe letters in 3D.
 */
export const createWaypointCard = ({
  root,
  onTravel,
}: {
  root: HTMLElement;
  onTravel: (page: PageEntry) => void;
}): WaypointCardController => {
  const card = document.createElement("aside");
  card.className = "waypoint-card";
  card.setAttribute("role", "status");
  card.setAttribute("aria-live", "polite");

  const icon = document.createElement("span");
  icon.className = "waypoint-card__icon";
  icon.setAttribute("aria-hidden", "true");

  const body = document.createElement("div");
  body.className = "waypoint-card__body";

  const kicker = document.createElement("p");
  kicker.className = "waypoint-card__kicker";

  const title = document.createElement("h2");
  title.className = "waypoint-card__title";

  const description = document.createElement("p");
  description.className = "waypoint-card__description";

  body.append(kicker, title, description);

  const enterButton = document.createElement("button");
  enterButton.type = "button";
  enterButton.className = "waypoint-card__enter";
  enterButton.innerHTML = "<kbd>E</kbd><span>Enter</span>";

  card.append(icon, body, enterButton);
  root.append(card);

  let activePage: PageEntry | null = null;

  const travel = () => {
    if (activePage) {
      onTravel(activePage);
    }
  };

  const onKeyDown = (event: KeyboardEvent) => {
    if (!activePage) return;
    if (event.code === "KeyE" || event.code === "Enter") {
      // Don't hijack Enter while the visitor is on another control
      const target = event.target as HTMLElement | null;
      if (event.code === "Enter" && target && target !== document.body && target !== enterButton) {
        return;
      }
      event.preventDefault();
      travel();
    }
  };

  enterButton.addEventListener("click", travel);
  window.addEventListener("keydown", onKeyDown);

  return {
    show: (page, accentColor) => {
      activePage = page;
      card.style.setProperty("--waypoint-accent", accentColor);
      icon.textContent = page.iconToken;
      kicker.textContent = `${page.navGroup} · ${page.category} · ${page.statusBadge}`;
      title.textContent = page.title;
      description.textContent = page.description ?? "";
      card.classList.add("is-visible");
    },
    hide: () => {
      activePage = null;
      card.classList.remove("is-visible");
    },
    getActivePage: () => activePage,
    dispose: () => {
      enterButton.removeEventListener("click", travel);
      window.removeEventListener("keydown", onKeyDown);
      card.remove();
    },
  };
};
