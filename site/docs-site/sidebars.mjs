/**
 * Docs and runnable-example sidebars for the VitePress site in site/docs-site.
 *
 * This public tree does not contain the rest of that package (theme, films,
 * or .vitepress/config). Import these arrays from the local config, for example:
 *
 *   import { docsSidebar, examplesSidebar } from './sidebars.mjs'
 *   themeConfig: { sidebar: { '/docs/': docsSidebar, '/examples/': examplesSidebar } }
 *
 * Verify stays Verify (Evidence and Benchmark only). Transparency is a separate
 * top-nav item. Do not deploy this file on its own, and do not change
 * production DNS or aliases.
 */

/** @type {import('vitepress').DefaultTheme.SidebarItem[]} */
export const docsSidebar = [
  {
    text: 'Get started',
    items: [
      { text: 'What is Shōkai?', link: '/docs/' },
      { text: 'How Shōkai works', link: '/docs/how-it-works' },
      { text: 'The core (15-minute read)', link: '/docs/core' },
      { text: 'Quickstart', link: '/docs/quickstart' },
      { text: 'Watch the implementation', link: '/docs/watch-the-implementation' },
    ],
  },
  {
    text: 'Understand',
    collapsed: true,
    items: [
      { text: 'Why Shōkai', link: '/docs/why' },
      { text: 'How it works, step by step', link: '/docs/step-by-step' },
      { text: 'Shōkai in diagrams', link: '/docs/diagrams' },
    ],
  },
  {
    text: 'Core concepts',
    collapsed: true,
    items: [
      { text: 'Overview', link: '/docs/concepts/' },
      { text: 'Places and doors', link: '/docs/concepts/places-and-doors' },
      { text: 'Website, agent front, door', link: '/docs/concepts/website-front-door' },
      { text: 'Shōkai cards', link: '/docs/concepts/cards' },
      { text: 'Owners and representatives', link: '/docs/concepts/owners-and-representatives' },
      { text: 'Arriving', link: '/docs/concepts/arriving' },
      { text: 'Limits and mandates', link: '/docs/concepts/limits' },
      { text: 'Outcomes', link: '/docs/concepts/outcomes' },
      { text: 'Report home', link: '/docs/concepts/report-home' },
      { text: 'Conduct', link: '/docs/concepts/conduct' },
      { text: 'Door policy', link: '/docs/concepts/door-policy' },
      { text: 'Visit stamps', link: '/docs/concepts/visit-stamps' },
    ],
  },
  {
    text: 'Where Shōkai applies',
    collapsed: true,
    items: [
      { text: 'Commerce', link: '/commerce' },
      { text: 'Financial', link: '/financial' },
      { text: 'Learning', link: '/learning' },
      { text: 'Communities and games', link: '/communities' },
      { text: 'All use cases', link: '/use-cases' },
    ],
  },
  {
    text: 'Worked examples',
    collapsed: true,
    items: [
      { text: 'Overview', link: '/docs/examples/' },
      { text: 'At a bank', link: '/docs/examples/harborlight-bank' },
      { text: 'A co-worker agent', link: '/docs/examples/enterprise-coworker' },
      { text: 'Browse before you join', link: '/docs/examples/look-before-you-join' },
      { text: 'An online university', link: '/docs/examples/online-university' },
      { text: 'A fan community', link: '/docs/examples/fan-community' },
      { text: 'At a heritage watchmaker', link: '/docs/examples/heritage-watchmaker' },
      { text: 'A friend introduces a brand', link: '/docs/examples/brand-door' },
    ],
  },
  {
    text: 'Situations & proofs',
    collapsed: true,
    items: [
      { text: 'Unsolicited offer, pressure declined', link: '/docs/examples/pressure-declined' },
      { text: 'Identity proofs', link: '/docs/examples/identity-proofs' },
    ],
  },
  {
    text: 'Runnable examples',
    items: [
      { text: 'Runnable examples', link: '/examples/' },
    ],
  },
  {
    text: 'Build',
    collapsed: true,
    items: [
      { text: 'SDK: @kigenka/shokai', link: '/build/sdk' },
      { text: 'Host a place', link: '/build/host-a-place' },
      { text: "A place's address", link: '/docs/place-addresses' },
      { text: 'Set up your representative', link: '/docs/set-up-your-representative' },
      { text: 'Prepare your host representative', link: '/docs/prepare-your-host-representative' },
      { text: 'Agent platforms', link: '/docs/platforms/' },
      { text: 'Grok Bot', link: '/docs/platforms/grok-bot' },
      { text: 'Platform recipes', link: '/docs/platforms/recipes' },
      { text: 'A prompt for any agent', link: '/build/any-agent-prompt' },
      { text: 'Extensions', link: '/docs/extensions' },
      { text: 'Implementation and scaling', link: '/docs/implementation-and-scaling' },
    ],
  },
  {
    text: 'Verify',
    collapsed: true,
    items: [
      { text: 'Evidence (live round)', link: '/docs/evidence/' },
      { text: 'Benchmark: core vs rich', link: '/docs/benchmarks/core-vs-rich' },
    ],
  },
  {
    text: 'Learn more',
    collapsed: true,
    items: [
      { text: 'Architecture', link: '/docs/architecture' },
      { text: 'Owner journeys', link: '/docs/owner-journeys' },
      { text: 'Security and threat model', link: '/docs/security' },
      { text: 'Design lessons', link: '/docs/design-lessons' },
      { text: 'Relationship to other protocols', link: '/docs/relationship-to-other-protocols' },
      { text: 'Glossary', link: '/docs/glossary' },
      { text: 'FAQ', link: '/docs/faq' },
      { text: 'Roadmap', link: '/docs/roadmap' },
      { text: 'Future directions', link: '/docs/future-directions' },
    ],
  },
]

/** @type {import('vitepress').DefaultTheme.SidebarItem[]} */
export const examplesSidebar = [
  {
    text: 'Runnable examples',
    items: [
      { text: 'Overview', link: '/examples/' },
      { text: 'A tea shop', link: '/examples/tea-shop' },
      { text: 'A store', link: '/examples/store' },
      { text: 'A bank', link: '/examples/bank' },
      { text: 'A marketplace', link: '/examples/marketplace' },
      { text: 'A community room', link: '/examples/community-room' },
      { text: 'An online university', link: '/examples/university' },
      { text: "A brand at a person's door", link: '/examples/brand-door' },
      { text: 'Keeping a door and going out', link: '/examples/dual-role' },
      { text: 'Traces', link: '/examples/traces/' },
    ],
  },
  {
    text: 'More',
    items: [
      { text: 'Use cases', link: '/use-cases' },
      { text: 'Worked examples', link: '/docs/examples/' },
      { text: 'Quickstart', link: '/docs/quickstart' },
    ],
  },
]
