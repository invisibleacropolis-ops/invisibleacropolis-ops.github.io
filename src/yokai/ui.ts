export type YokaiUi = {
  /** Fade the loading veil away once the world is built. */
  reveal: () => void;
  /** Hide the intro card (first pointer lock / first interaction). */
  dismissIntro: () => void;
  /** Bring the intro card back (after a tale ends). */
  showIntro: () => void;
  dispose: () => void;
};

/**
 * Minimal interface for the hidden world: a veil, a title card, and then
 * nothing between the visitor and the valley.
 */
export const createYokaiUi = (root: HTMLElement): YokaiUi => {
  const veil = root.querySelector<HTMLElement>("[data-loading-veil]");

  const intro = document.createElement("div");
  intro.className = "yokai-intro";
  intro.innerHTML = `
    <p class="yokai-intro__kana">隠り世</p>
    <h1 class="yokai-intro__title">Kakuriyo</h1>
    <p class="yokai-intro__sub">the hidden world of the kami</p>
    <p class="yokai-intro__hint">
      click to wander &mdash; <kbd>W</kbd>/<kbd>S</kbd> glide &middot; <kbd>A</kbd>/<kbd>D</kbd> drift &middot; <kbd>Space</kbd>/<kbd>Shift</kbd> rise &amp; fall &middot; <kbd>Esc</kbd> rest
    </p>
    <p class="yokai-intro__story">
      tales: <kbd>1</kbd> <em>the fox &amp; the fallen star</em> &middot; <kbd>2</kbd> <em>the tanuki &amp; the moon-offering</em><br />
      <kbd>3</kbd> <em>the day the river slept</em> &middot; <kbd>4</kbd> <em>the oni who guarded the gate</em> &middot; <kbd>5</kbd> <em>the night of first snow</em>
    </p>
    <a class="yokai-intro__classic" href="/?classic">return to the previous dimension</a>
  `;
  root.append(intro);

  let dismissed = false;

  return {
    reveal: () => {
      veil?.classList.add("is-hidden");
      intro.classList.add("is-visible");
    },
    dismissIntro: () => {
      if (dismissed) return;
      dismissed = true;
      intro.classList.add("is-dismissed");
    },
    showIntro: () => {
      dismissed = false;
      intro.classList.remove("is-dismissed");
    },
    dispose: () => {
      intro.remove();
    },
  };
};
