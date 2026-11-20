/**
 * One navigation model for the whole app (2026-11-20).
 *
 * Before this, `Navbar` exposed a flat list of twelve items — Create, Avatar, AI Studio, Pricing, Story Playground,
 * Director, Academy, Credits, Library, Upload, Analytics, Advanced Story Studio — accumulated across five product eras,
 * with two story systems and three generation entry points all at the same level. Nothing was wrong with any single
 * item; the problem was that the navigation could not say what the product *is*.
 *
 * The model below says it in five destinations, and every existing route keeps its URL (nothing 404s — the old pages are
 * grouped, not moved). Create is the only destination with a real hierarchy because it is the only one where the paths
 * genuinely differ in kind: a project you keep working on, a new film, a story, a single asset, a prompt, an upload.
 */
export interface NavLink {
  href: string;
  label: string;
  /** One short line of explanation, shown in the desktop menu only. */
  hint?: string;
}

export interface NavDestination {
  key: string;
  label: string;
  href: string;
  links: NavLink[];
}

export interface NavAudience {
  signedIn: boolean;
  username?: string | null;
  isR16: boolean;
  canAdmin: boolean;
}

export function destinationsFor({ signedIn, username, isR16, canAdmin }: NavAudience): NavDestination[] {
  // R16 is a kids product, not a smaller version of this one: watch, and make stories. Nothing else is offered here,
  // matching what the R16 middleware allows (it blocks /generate, /upload, /credits, /pricing, /analytics, /settings,
  // /subscription and /admin outright, so linking to them would only bounce the child back to the feed).
  if (isR16) {
    return [
      { key: 'watch', label: 'Watch', href: '/', links: [] },
      {
        key: 'stories',
        label: 'Stories',
        href: '/story-playground',
        links: [
          { href: '/story-playground', label: 'My stories' },
          { href: '/story-playground/new?type=story', label: 'New story' },
        ],
      },
    ];
  }

  const destinations: NavDestination[] = [
    { key: 'watch', label: 'Watch', href: '/', links: [] },
    {
      key: 'create',
      label: 'Create',
      href: '/projects',
      links: [
        { href: '/projects', label: 'Projects', hint: 'Every film and story you have started' },
        { href: '/create', label: 'New film', hint: 'Brief, plan, produce, assemble' },
        { href: '/story-playground', label: 'Story Playground', hint: 'Idea, story, pictures, book' },
        { href: '/generate', label: 'AI Studio', hint: 'One image or one clip' },
        { href: '/director', label: 'Director', hint: 'Turn a scene brief into shot prompts' },
        { href: '/avatar', label: 'Avatar', hint: 'A character portrait' },
        { href: '/upload', label: 'Upload a video', hint: 'Publish your own footage' },
        { href: '/story-studio', label: 'Advanced story studio', hint: 'The older, denser story editor' },
      ],
    },
    { key: 'learn', label: 'Learn', href: '/academy', links: [{ href: '/academy', label: 'Academy' }] },
    {
      key: 'films',
      label: 'Films',
      href: '/watch',
      links: [
        { href: '/watch', label: 'Watch films', hint: 'Finished films from the community' },
        { href: '/submit', label: 'Submit a film', hint: 'Enter a finished film' },
      ],
    },
  ];

  if (signedIn) {
    destinations.push({
      key: 'account',
      label: 'Account',
      href: '/settings',
      links: [
        ...(username ? [{ href: `/${username}`, label: 'Profile' }] : []),
        { href: '/library', label: 'Library', hint: 'Everything you have generated' },
        { href: '/credits', label: 'Credits', hint: 'Balance, purchases, history' },
        { href: '/analytics', label: 'Analytics', hint: 'How your work performs' },
        { href: '/settings', label: 'Settings' },
        ...(canAdmin ? [{ href: '/admin', label: 'Admin' }] : []),
      ],
    });
  }

  return destinations;
}

/** True when `pathname` is the destination itself or below it (so the menu can show where you are). */
export function isDestinationActive(destination: NavDestination, pathname: string): boolean {
  if (destination.href === '/') return pathname === '/';
  if (pathname === destination.href || pathname.startsWith(`${destination.href}/`)) return true;
  return destination.links.some((link) => {
    if (link.href === '/') return false;
    const path = link.href.split('?')[0];
    return pathname === path || pathname.startsWith(`${path}/`);
  });
}
