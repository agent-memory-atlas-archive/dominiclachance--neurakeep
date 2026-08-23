export type CtaEventValue = string | number | boolean;

export interface CtaEventParams {
  section: string;
  method?: string;
  [key: string]: CtaEventValue | undefined;
}

export interface CtaPageContext {
  path: string;
  title: string;
}

interface GtagWindow {
  gtag?: (...args: unknown[]) => void;
  location?: { pathname?: string };
  document?: { title?: string };
}

export function buildCtaPayload(params: CtaEventParams, page: CtaPageContext): Record<string, CtaEventValue> {
  const payload: Record<string, CtaEventValue> = {
    page_path: page.path,
    page_title: page.title,
    app_surface: "hosted_app"
  };
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined) payload[key] = value;
  }
  return payload;
}

/**
 * Sends a GA4 CTA event through the gtag bootstrap in index.html.
 * No-ops (returns false) when analytics is not configured, so local
 * and self-hosted builds never fail or phone home.
 */
export function trackCtaEvent(name: string, params: CtaEventParams, win?: GtagWindow): boolean {
  const target = win ?? (typeof window === "undefined" ? undefined : (window as GtagWindow));
  if (!target || typeof target.gtag !== "function") return false;
  const payload = buildCtaPayload(params, {
    path: target.location?.pathname ?? "",
    title: target.document?.title ?? ""
  });
  try {
    target.gtag("event", name, payload);
    return true;
  } catch {
    return false;
  }
}
