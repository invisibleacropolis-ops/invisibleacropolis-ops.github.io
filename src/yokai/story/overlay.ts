/**
 * The storyteller's voice: a title card, then narration lines that fade in
 * one by one at the foot of the screen, clearing softly between scenes.
 */

export type StoryOverlay = {
  showTitle: (title: string, subtitle: string) => void;
  hideTitle: () => void;
  addLine: (text: string) => void;
  clearLines: () => void;
  showHint: () => void;
  hideHint: () => void;
  destroy: () => void;
};

export const createStoryOverlay = (root: HTMLElement): StoryOverlay => {
  const wrap = document.createElement("div");
  wrap.className = "story-overlay";

  const title = document.createElement("div");
  title.className = "story-title";
  const titleMain = document.createElement("h2");
  titleMain.className = "story-title__main";
  const titleSub = document.createElement("p");
  titleSub.className = "story-title__sub";
  title.append(titleMain, titleSub);

  const lines = document.createElement("div");
  lines.className = "story-lines";

  const hint = document.createElement("p");
  hint.className = "story-hint";
  hint.innerHTML = "<kbd>Esc</kbd> leave the tale";

  wrap.append(title, lines, hint);
  root.append(wrap);

  return {
    showTitle: (main, sub) => {
      titleMain.textContent = main;
      titleSub.textContent = sub;
      title.classList.add("is-visible");
    },
    hideTitle: () => {
      title.classList.remove("is-visible");
    },
    addLine: (text) => {
      const line = document.createElement("p");
      line.className = "story-line";
      line.textContent = text;
      lines.append(line);
      // Next frame so the transition runs
      requestAnimationFrame(() => line.classList.add("is-visible"));
    },
    clearLines: () => {
      const current = Array.from(lines.children) as HTMLElement[];
      current.forEach((line) => line.classList.remove("is-visible"));
      window.setTimeout(() => current.forEach((line) => line.remove()), 900);
    },
    showHint: () => hint.classList.add("is-visible"),
    hideHint: () => hint.classList.remove("is-visible"),
    destroy: () => wrap.remove(),
  };
};
