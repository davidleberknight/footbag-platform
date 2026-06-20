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

export interface PageViewModel<TContent = Record<string, unknown>> {
  seo: SeoMeta;
  page: PageMeta;
  navigation?: NavigationMeta;
  content: TContent;
}
