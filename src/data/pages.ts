export const NAV_GROUPS = ["Start here", "Workflows", "Reference", "Labs"] as const;

export type NavGroup = (typeof NAV_GROUPS)[number];

export type PageEntry = {
  title: string;
  url: string;
  description?: string;
  category: string;
  navGroup: NavGroup;
  priority: number;
  statusBadge: string;
  iconToken: string;
  audience: string;
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null;

const asString = (value: unknown, field: string): string => {
  if (typeof value !== "string" || !value.trim()) {
    throw new Error(`pages.json field \"${field}\" must be a non-empty string.`);
  }
  return value;
};

const asNumber = (value: unknown, field: string): number => {
  if (typeof value !== "number" || Number.isNaN(value)) {
    throw new Error(`pages.json field \"${field}\" must be a valid number.`);
  }
  return value;
};

const parseEntry = (value: unknown): PageEntry => {
  if (!isRecord(value)) {
    throw new Error("pages.json entries must be objects.");
  }

  const navGroup = asString(value.navGroup, "navGroup") as NavGroup;
  if (!NAV_GROUPS.includes(navGroup)) {
    throw new Error(`pages.json navGroup must be one of: ${NAV_GROUPS.join(", ")}.`);
  }

  const descriptionValue = value.description;
  const description = typeof descriptionValue === "string" ? descriptionValue : undefined;

  return {
    title: asString(value.title, "title"),
    url: asString(value.url, "url"),
    description,
    category: asString(value.category, "category"),
    navGroup,
    priority: asNumber(value.priority, "priority"),
    statusBadge: asString(value.statusBadge, "statusBadge"),
    iconToken: asString(value.iconToken, "iconToken"),
    audience: asString(value.audience, "audience"),
  };
};

export const sortPagesByPriority = (pages: PageEntry[]): PageEntry[] =>
  [...pages].sort((a, b) => a.priority - b.priority || a.title.localeCompare(b.title));

export const resolveAppUrl = (url: string): string => {
  if (/^https?:\/\//.test(url)) {
    return url;
  }

  const normalized = url.startsWith("/") ? url.slice(1) : url;
  const base = (import.meta.env.BASE_URL ?? "/").replace(/^\/+|\/+$/g, "");
  const prefix = base ? `/${base}/` : "/";
  return `${prefix}${normalized}`;
};

export const loadPages = async (): Promise<PageEntry[]> => {
  const response = await fetch(resolveAppUrl("/pages.json"), { headers: { Accept: "application/json" } });

  if (!response.ok) {
    throw new Error(`pages.json request failed: ${response.status}`);
  }

  const data = await response.json();

  if (!Array.isArray(data)) {
    throw new Error("pages.json payload must be an array.");
  }

  const pages = data.map(parseEntry).map((page) => ({
    ...page,
    url: resolveAppUrl(page.url),
  }));
  return sortPagesByPriority(pages);
};
