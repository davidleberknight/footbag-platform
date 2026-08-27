export interface SeoMeta {
  title: string;
  fullTitle?: string;
  description?: string;
  // Marks a public page do-not-index (login, register, password, and other thin
  // auth/onboarding pages). The layout emits a robots noindex meta when set.
  noindex?: boolean;
}

export interface PageMeta {
  sectionKey: string;
  pageKey: string;
  title: string;
  eyebrow?: string;
  intro?: string;
  notice?: string;
}

export interface NavLink {
  label: string;
  href: string;
}

export interface BreadcrumbLink {
  label: string;
  href?: string;
}

export interface ContextLink extends NavLink {
  variant?: 'primary' | 'outline';
}

export interface SiblingNav {
  previous?: NavLink;
  next?: NavLink;
}

export interface NavigationMeta {
  breadcrumbs?: BreadcrumbLink[];
  siblings?: SiblingNav;
  contextLinks?: ContextLink[];
}

// The one error page every failing route renders. The status digit is carried
// in the view-model rather than written into the template, so the number the
// visitor reads is always the status the response actually carries.
export interface ErrorPageContent {
  statusCode: number;
  paragraphs: string[];
  actions: NavLink[];
}

// A benefit the viewing member does not hold, rendered where the control it
// unlocks would otherwise have been, and on the refusal page behind a form that
// control leads to. Two sentences saying what the benefit is and what unlocks
// it, and the one control that does: the route to buying the tier.
export interface TierBenefitNotice {
  lead: string;
  explanation: string;
  upgradeLabel: string;
  upgradeHref: string;
}

export interface PageViewModel<TContent = Record<string, unknown>> {
  seo: SeoMeta;
  page: PageMeta;
  navigation?: NavigationMeta;
  content: TContent;
}
