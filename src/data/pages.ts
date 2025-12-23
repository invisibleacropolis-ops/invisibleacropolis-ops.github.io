export type PageEntry = {
  title: string;
  slug: string;
  description?: string;
};

export const loadPages = async (): Promise<PageEntry[]> => {
  const response = await fetch("/pages.json", { headers: { Accept: "application/json" } });

  if (!response.ok) {
    throw new Error(`pages.json request failed: ${response.status}`);
  }

  const data = await response.json();

  if (!Array.isArray(data)) {
    throw new Error("pages.json payload must be an array.");
  }

  return data as PageEntry[];
};
