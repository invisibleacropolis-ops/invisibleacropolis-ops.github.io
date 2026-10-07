import { createAtlas } from "./landing/atlas.ts";

type Page = { title: string; url: string };

const canvas = document.querySelector<HTMLCanvasElement>("#hologram");
const art = document.querySelector<HTMLElement>(".hero-art");
const atlas = canvas && art ? createAtlas(canvas, art) : null;
const directory = document.querySelector<HTMLElement>("#destinations");
const directoryToggle = document.querySelector<HTMLButtonElement>("#directory-toggle");
const directoryClose = document.querySelector<HTMLButtonElement>("#directory-close");
const skipLink = document.querySelector<HTMLAnchorElement>(".skip-link");

if (directory && directoryToggle && directoryClose) {
  const close = (restoreFocus = true) => {
    directory.hidden = true;
    directoryToggle.setAttribute("aria-expanded", "false");
    if (restoreFocus) directoryToggle.focus();
  };
  const open = () => {
    directory.hidden = false;
    directoryToggle.setAttribute("aria-expanded", "true");
    directoryClose.focus();
  };
  directoryToggle.addEventListener("click", () => {
    if (directory.hidden) open();
    else close();
  });
  directoryClose.addEventListener("click", () => close());
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && !directory.hidden) {
      event.preventDefault();
      close();
    }
  });
  document.addEventListener("pointerdown", (event) => {
    if (!directory.hidden && event.target instanceof Node
      && !directory.contains(event.target) && !directoryToggle.contains(event.target)) {
      close(false);
    }
  });
  skipLink?.addEventListener("click", (event) => {
    event.preventDefault();
    open();
    directory.querySelector<HTMLAnchorElement>(".route")?.focus();
  });
}

// Direct links are present in HTML. The manifest adds future standalone pages
// to both the directory and the 3D map when they are published.
const grid = document.querySelector<HTMLElement>("#project-grid");
const count = document.querySelector<HTMLElement>("#destination-count");
const experimentCount = document.querySelector<HTMLElement>("#experiment-count");
if (grid) {
  fetch("/pages.json")
    .then((response) => {
      if (!response.ok) throw new Error(`Destination manifest: ${response.status}`);
      return response.json();
    })
    .then((value: unknown) => {
      if (!Array.isArray(value)) return;
      const known = new Set(Array.from(grid.querySelectorAll<HTMLAnchorElement>("a[href]"), (link) => new URL(link.href).pathname));
      for (const item of value as Page[]) {
        if (!item || typeof item.url !== "string" || typeof item.title !== "string") continue;
        const url = new URL(item.url, location.origin);
        if (url.origin !== location.origin || known.has(url.pathname) || url.pathname === "/kami.html") continue;
        known.add(url.pathname);
        const link = document.createElement("a");
        link.className = "route";
        link.href = url.pathname;
        const number = document.createElement("span");
        number.className = "route-number";
        const title = document.createElement("strong");
        title.className = "route-name";
        title.textContent = item.title;
        const arrow = document.createElement("span");
        arrow.className = "route-arrow";
        arrow.setAttribute("aria-hidden", "true");
        arrow.textContent = "↗";
        link.append(number, title, arrow);
        grid.append(link);
      }
      document.querySelectorAll<HTMLElement>(".route-number").forEach((label, index) => {
        label.textContent = String(index + 1).padStart(2, "0");
      });
      if (experimentCount) experimentCount.textContent = String(known.size).padStart(2, "0");
      if (count) count.textContent = `${document.querySelectorAll(".route").length} ROUTES`;
      atlas?.refreshRoutes();
    })
    .catch((error) => console.info("Destination manifest unavailable; built-in links remain visible.", error));
}
