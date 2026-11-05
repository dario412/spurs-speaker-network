// Formats and FAQ shared by every club site.

export const FORMATS = {
  keynote: {
    title: 'Keynote & after-dinner',
    short: 'Leadership, pressure and resilience, from the dressing room and the dugout.',
    desc: 'A 30–45 minute talk with Q&A, built around your theme.',
    items: ['Conference keynote', 'After-dinner speech', 'Fireside chat with your host'],
  },
  dinner: {
    title: 'After-dinner speaking',
    short: 'Stories from the dressing room to close your dinner, awards night or gala.',
    desc: 'Stories from the dressing room to close your dinner, awards night or gala, told with warmth and humour.',
    items: ['After-dinner speech', 'Awards night host', 'Gala dinner Q&A'],
  },
  appearance: {
    title: 'Appearances',
    short: 'Launches, shoots, Q&As, signings and guest visits: any time you need a speaker in the room.',
    desc: 'Any time you need a speaker in the room: launches, shoots, Q&As, signings and guest visits.',
    items: ['Product launch or shoot', 'Q&A or signing session', 'Guest visit to your event'],
  },
  hospitality: {
    title: 'Matchday hospitality',
    short: 'A legend hosts your guests in the stadium lounges.',
    desc: 'Hosts your guests in the stadium lounges before and after kick-off.',
    items: ['Lounge welcome & Q&A', 'Table visits & photos', 'Half-time insight'],
  },
  brand: {
    title: 'Brand & content',
    short: 'Shoots, launches and social content, approved by the club.',
    desc: 'Club-approved appearances for campaigns, launches and social.',
    items: ['Social content shoot', 'Product launch appearance', 'Internal comms video'],
  },
  clinic: {
    title: 'Coaching clinics',
    short: 'Community and grassroots days with former coaches and players.',
    desc: 'Grassroots and community coaching days led by former players and coaches.',
    items: ['Youth coaching session', 'Staff football day', 'Community programme visit'],
  },
  fan: {
    title: 'Fan Q&As & signings',
    short: "Supporters' clubs, retail moments and members' nights.",
    desc: 'Supporter-facing appearances for clubs, retail and members.',
    items: ["Supporters' club evening", 'Signing session', 'Members’ Q&A'],
  },
  workshop: {
    title: 'Leadership workshops',
    short: 'Managers and staff on building high-performing teams.',
    desc: 'An interactive session for leadership teams on how elite teams are built.',
    items: ['Half-day leadership session', 'Team culture workshop', 'Senior team offsite'],
  },
  virtual: {
    title: 'Virtual & video',
    short: 'Remote talks and personalised video messages.',
    desc: 'Remote talks and personalised video messages.',
    items: ['Live virtual keynote', 'Personalised video message', 'Recorded Q&A'],
  },
};
export const HOME_FORMATS = ['keynote', 'hospitality', 'brand', 'clinic', 'fan', 'workshop'];
// The formats a site offers when its site.json has no `formatKeys` (dinner and appearance are opt-in).
export const DEFAULT_FORMAT_KEYS = ['keynote', 'hospitality', 'brand', 'clinic', 'fan', 'workshop', 'virtual'];

// Booking FAQ shown on the about page; entries with `profile: true` also appear on every profile page, and every entry
// without `home: false` on the home page. `venue: true` entries only appear on sites with a venue-hire promotion.
// Sites override an entry by key in site.json `faqOverrides`: an answer string, or { q, a }.
// Placeholders: {org} is the organisation name, {platform} the site name, {stadium} the venue; {first} is the
// person's first name on a profile page, and {first|text} falls back to text where there is no person (the about page).
export const FAQ = [
  {
    key: 'cost',
    q: 'How much does it cost to book {first|a legend}?',
    a: 'Fees depend on the person, the format, the date and travel. Share your brief and the PepTalk bookings team will come back with an indicative fee.',
    profile: true,
  },
  {
    key: 'leadTime',
    q: 'How far in advance should we book?',
    a: 'Six to eight weeks is ideal. Availability depends on fixtures, media commitments and, for some legends, current roles in football.',
    profile: true,
  },
  {
    key: 'current',
    q: 'Can we book current first-team players?',
    a: 'Yes, for brand work, fan events and hospitality. Current squad appearances are arranged with {org} around the fixture list and training schedule, so allow extra lead time and expect limited dates.',
    profile: false,
  },
  {
    key: 'venue',
    q: 'Can we book an event space at {stadium} too?',
    a: "Yes. Meeting and event spaces at {stadium} are booked directly with the venue's events team (Event spaces, in the menu). Tell us your date and we'll find a speaker to match.",
    profile: false,
    venue: true,
  },
  {
    key: 'travel',
    q: 'Can {first|legends} travel outside London or abroad?',
    a: 'Yes, most legends travel across the UK and internationally. Virtual formats are available too.',
    profile: true,
  },
  {
    key: 'official',
    q: 'Is this the official {org} speaker service?',
    a: 'Yes. {platform} is the official {org} speaker booking service. Every booking is agreed with the club and handled by one bookings team.',
    profile: false,
  },
  {
    key: 'media',
    q: 'Can we use photos and video from the event?',
    a: 'Usually, for internal and agreed social use. Image rights and content use are confirmed in the booking agreement.',
    profile: true,
    home: false,
  },
  {
    key: 'contracting',
    q: 'Who contracts and invoices the booking?',
    a: 'PepTalk handles contracting, invoicing and logistics on behalf of {org}.',
    profile: true,
    home: false,
  },
];

// Default (football) wording. A site overrides any key via site.vocab; formats via site.formats, FAQ entries via site.faqOverrides.
export const VOCAB = {
  rolesEyebrow: 'Players · Managers · Staff',
  heroLead: 'Former players, managers and backroom staff for keynotes, matchday hospitality, brand work and community days.',
  rosterLead: 'Filter by role or era, or search by name or theme, to find the right person for your event.',
  staffPill: 'Coaching &amp; backroom staff',
  rolesHeadline: 'More than the matchday XI',
  whoOptions: ['Ex-player', 'Current player', 'Manager', 'Staff', 'Not sure'],
  whereOptions: ['At the stadium', 'Elsewhere', 'Virtual'],
  fixtureWord: 'fixture list',
  assureRoles: 'Players, managers and staff',
  eraHeadline: null,
  eraLead: 'From the classic sides to the modern greats, find the team you remember and book the people who built it.',
  eventStoryTitle: 'A manager, two fan favourites and 300 guests',
  galleryHeadline: 'On the pitch &amp; beyond',
  howTitle: 'From brief to final whistle',
  diaryCheck: 'PepTalk checks diaries against fixtures and media commitments.',
  hospitalityTitle: 'Matchday with a legend',
  hospitalityEyebrow: 'At the stadium',
  hospitalityHeadline: 'Your guests, their heroes',
  hospitalityLead: null,
  hospitalityBody: 'A legend welcomes your guests, hosts a pre-match Q&amp;A, visits tables for photos and shares half-time insight.',
  hospitalityMetrics: [
    ['Pre-match', 'Welcome &amp; Q&amp;A'],
    ['Half-time', 'Insight'],
    ['Full-time', 'Photos &amp; signings'],
  ],
  eventStoryBody: null,
  quote: '"Our guests still talk about it. Seamless from the first call to the final whistle."',
  careerHeadline: null,
  waysLead: null,
  pastEvents: null,
  peopleNoun: 'players, managers and staff',
  aboutLead: null,
  beyondUrl: 'https://getapeptalk.com/type/football-speakers',
  beyondLinkText: 'PepTalk football speakers',
  beyondLead: 'Browse hundreds of football and sports speakers on PepTalk.',
  squadEyebrow: 'Current squad',
  squadHeadline: "Book today's stars",
  squadLead:
    'Current first-team players are available for brand work, fan events and hospitality, arranged with the club around the fixture list.',
  squadLinkText: 'See the full squad',
  featuredEyebrow: 'Meet the legends',
  featuredHeadline: 'Featured this season',
  legendNoun: 'legend',
  legendsNoun: 'legends',
  storyMetrics: [
    ['300', 'Guests'],
    ['4.9/5', 'Guest rating'],
    ['100%', 'Would book again'],
  ],
  quoteEyebrow: 'What hosts say',
  quoteCite: 'Head of Events, corporate partner (placeholder)',
  profileQuote: '"Warm, funny and genuinely insightful. Our guests didn\'t want the evening to end."',
  formHeadline: "Find your legend's date",
  officialLabel: null,
  officialLegendLabel: null,
  officialFooter: 'Official licensed platform.',
  navLabels: { legends: 'Legends', ways: 'Ways to book', hospitality: 'Hospitality', about: 'About' },
  travelsFrom: 'London, UK',
  // About page heading (h1, title, breadcrumb). null: "About <platform>", built by the renderer from site.platform.
  aboutTitle: null,
  // Under the enquiry form's submit button. {terms:label} and {privacy:label} become links to the site's legal pages.
  consentLine: 'By sending this enquiry you agree to our {terms:Terms} and {privacy:Privacy Policy}.',
  // Fixed section copy, editable per site. {short}, {org}, {platform}, {legendNoun}, {legendsNoun} and {diaryCheck}
  // are filled in by the renderer (lib/render/context.ts).
  trustOfficial: 'Official {short} service',
  trustShortlist: 'Free, tailored shortlist',
  trustManaged: 'Managed end to end',
  browseEyebrow: 'Browse by role',
  homeRolesTitle: 'Find the right voice for the room.',
  waysEyebrow: 'Ways to book',
  waysHomeLead: "Pick a format to see who's available for it, or tell us about your event and we'll suggest the best fit.",
  homeFaqTitle: 'Booking a {short} {legendNoun}, answered.',
  faqLead: "Can't see your question? The bookings team replies to every enquiry.",
  howEyebrow: 'How booking works',
  howHeadline: 'From brief to booked in three steps.',
  step1Title: 'Share your brief',
  step1Text: 'Date, audience, format and who you have in mind. It takes two minutes and commits you to nothing.',
  step2Title: 'Get a tailored shortlist',
  step2Text: '{diaryCheck} You get options and an indicative fee.',
  step3Title: 'Confirm and relax',
  step3Text: 'One contract, one point of contact. The bookings team handles logistics, briefing and the day itself.',
  ctaTitle: 'Bring a {short} {legendNoun} to your next event.',
  ctaLead: 'Tell us about your event and get a free, tailored shortlist from the PepTalk bookings team.',
  // Link and button labels.
  checkAvailability: 'Check availability',
  eventSpacesNav: 'Event spaces',
  findButton: 'Find {legendsNoun}',
  seeAllLink: 'See all {legendsNoun}',
  waysSeeWho: 'See who’s available',
  waysHelpTitle: 'Not sure which?',
  waysHelpText: 'Tell us about your event and we’ll suggest the right format and speaker.',
  askTeam: 'Ask the bookings team',
  esVenueTitle: 'Already have a venue?',
  esVenueText: 'Bring a {short} {legendNoun} to your own meeting, conference or celebration.',
  esVenueLink: 'Find a {legendNoun}',
  ctaBrowse: 'or browse all {legendsNoun}',
};
