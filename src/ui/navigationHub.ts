import { NAV_GROUPS, loadPages, type NavGroup, type PageEntry } from "../data/pages.ts";

export type NavigationHubController = {
  dispose: () => void;
};

const KEYBOARD_KEYS = new Set(["Enter", " "]);

const createElement = <T extends keyof HTMLElementTagNameMap>(
  tag: T,
  className?: string,
  text?: string
): HTMLElementTagNameMap[T] => {
  const element = document.createElement(tag);
  if (className) element.className = className;
  if (typeof text === "string") {
    element.textContent = text;
  }
  return element;
};

const groupPages = (pages: PageEntry[]): Map<NavGroup, PageEntry[]> => {
  const grouped = new Map<NavGroup, PageEntry[]>();
  NAV_GROUPS.forEach((group) => grouped.set(group, []));
  pages.forEach((page) => grouped.get(page.navGroup)?.push(page));
  return grouped;
};

const buildPageMeta = (page: PageEntry): string =>
  `${page.category} · ${page.audience} · Priority ${page.priority}`;

const createGroupSection = (group: NavGroup, pages: PageEntry[]): HTMLElement => {
  const section = createElement("section", "nav-hub__section");
  section.setAttribute("aria-labelledby", `nav-hub-group-${group}`);

  const heading = createElement("h3", "nav-hub__group-heading", group);
  heading.id = `nav-hub-group-${group}`;
  section.append(heading);

  if (pages.length === 0) {
    section.append(createElement("p", "nav-hub__empty ui-toast", "No destinations currently published in this section."));
    return section;
  }

  const list = createElement("ul", "nav-hub__list");
  pages.forEach((page) => {
    const item = createElement("li", "nav-hub__item");

    const link = createElement("a", "nav-hub__link") as HTMLAnchorElement;
    link.href = page.url;
    link.setAttribute("data-priority", String(page.priority));

    const icon = createElement("span", "nav-hub__icon", page.iconToken);
    icon.setAttribute("aria-hidden", "true");

    const titleWrap = createElement("span", "nav-hub__title-wrap");
    const title = createElement("span", "nav-hub__item-title", page.title);
    const badge = createElement("span", "nav-hub__badge ui-badge", page.statusBadge);
    badge.setAttribute("aria-label", `Status: ${page.statusBadge}`);

    const meta = createElement("span", "nav-hub__meta", buildPageMeta(page));
    const description = createElement("span", "nav-hub__description", page.description ?? "No description available.");

    titleWrap.append(title, badge, meta, description);
    link.append(icon, titleWrap);
    item.append(link);
    list.append(item);
  });

  section.append(list);
  return section;
};

export const createNavigationHub = ({ root }: { root: HTMLElement }): NavigationHubController => {
  const trigger = createElement("button", "nav-hub__trigger ui-button", "Destinations");
  trigger.type = "button";
  trigger.setAttribute("aria-haspopup", "dialog");
  trigger.setAttribute("aria-expanded", "false");

  const backdrop = createElement("div", "nav-hub__backdrop");
  backdrop.hidden = true;

  const panel = createElement("section", "nav-hub ui-card ui-panel");
  panel.setAttribute("role", "dialog");
  panel.setAttribute("aria-modal", "true");
  panel.setAttribute("aria-labelledby", "nav-hub-title");
  panel.tabIndex = -1;

  const header = createElement("div", "nav-hub__header");
  const title = createElement("h2", "nav-hub__title", "Navigation Hub");
  title.id = "nav-hub-title";
  const closeButton = createElement("button", "nav-hub__close ui-button", "Close");
  closeButton.type = "button";

  const content = createElement("div", "nav-hub__content");
  content.append(createElement("p", "nav-hub__loading ui-toast", "Loading destination index…"));

  header.append(title, closeButton);
  panel.append(header, content);
  backdrop.append(panel);
  root.append(trigger, backdrop);

  let isOpen = false;
  let restoreFocus: HTMLElement | null = null;

  const focusableSelectors = 'a[href], button:not([disabled]), [tabindex]:not([tabindex="-1"])';

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

  const renderFallback = () => {
    content.innerHTML = "";
    const message = createElement(
      "p",
      "nav-hub__error ui-toast",
      "Destination index unavailable. You can still use in-world 3D links while we retry loading pages.json."
    );
    const retryButton = createElement("button", "nav-hub__retry ui-button", "Retry");
    retryButton.type = "button";
    retryButton.addEventListener("click", () => {
      void hydrate();
    });
    content.append(message, retryButton);
  };

  const hydrate = async () => {
    content.innerHTML = "";
    content.append(createElement("p", "nav-hub__loading ui-toast", "Loading destination index…"));

    try {
      const pages = await loadPages();
      const grouped = groupPages(pages);
      content.innerHTML = "";
      NAV_GROUPS.forEach((group) => {
        const items = grouped.get(group) ?? [];
        content.append(createGroupSection(group, items));
      });
    } catch (error) {
      console.error("Navigation hub failed to load pages", error);
      renderFallback();
    }
  };

  void hydrate();

  return {
    dispose: () => {
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
