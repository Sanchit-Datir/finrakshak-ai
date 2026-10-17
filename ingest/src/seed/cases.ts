import { CaseSeedSchema, type CaseSeed } from '@fund-tracker/shared';

const REASON =
  'Widely reported Indian corporate lending / fund-diversion matter with public regulatory or court records. Seed candidate for engineering and backtests only: verify every fact against the linked official documents.';

type SeedInput = Pick<CaseSeed, 'case_id' | 'display_name' | 'aliases' | 'related_aliases'>;

/**
 * Brief step 2: hand-picked historical cases. Aliases are SEARCH TERMS used to
 * link official documents to a case — they are not claims about any entity.
 * All-caps acronyms are matched case-sensitively on word boundaries.
 */
const INPUT: readonly SeedInput[] = [
  {
    case_id: 'dhfl',
    display_name: 'Dewan Housing Finance Corporation (DHFL)',
    aliases: ['Dewan Housing Finance', 'DHFL'],
    related_aliases: [],
  },
  {
    case_id: 'ilfs',
    display_name: 'IL&FS group',
    aliases: [
      'Infrastructure Leasing & Financial Services',
      'Infrastructure Leasing and Financial Services',
      'IL&FS',
      'IL & FS',
    ],
    related_aliases: ['IL&FS Transportation Networks', 'IL&FS Financial Services', 'ITNL'],
  },
  {
    case_id: 'coffee_day',
    display_name: 'Coffee Day Enterprises',
    aliases: ['Coffee Day Enterprises', 'Coffee Day Global'],
    related_aliases: [
      'Mysore Amalgamated Coffee Estates',
      'MACEL',
      'Sical Logistics',
      'Tanglin Developments',
    ],
  },
  {
    case_id: 'reliance_adag_finance',
    display_name: 'Reliance Home Finance / Reliance Commercial Finance / Reliance Capital',
    aliases: [
      'Reliance Home Finance',
      'Reliance Commercial Finance',
      'Reliance Capital Limited',
      'Reliance Capital Ltd',
    ],
    related_aliases: [],
  },
  {
    case_id: 'religare',
    display_name: 'Religare Finvest / Religare Enterprises',
    aliases: ['Religare Finvest', 'Religare Enterprises'],
    related_aliases: ['RHC Holding', 'Fortis Healthcare'],
  },
  {
    case_id: 'abg_shipyard',
    display_name: 'ABG Shipyard',
    aliases: ['ABG Shipyard'],
    related_aliases: [],
  },
  {
    case_id: 'pnb_lou_firestar',
    display_name: 'PNB letters-of-undertaking matter (Firestar group)',
    aliases: ['Firestar Diamond', 'Firestar International', 'Nirav Modi'],
    related_aliases: ['Solar Exports', 'Stellar Diamond', 'Diamonds R Us'],
  },
  {
    case_id: 'gitanjali',
    display_name: 'Gitanjali Gems',
    aliases: ['Gitanjali Gems', 'Mehul Choksi', 'Mehul Chinubhai Choksi'],
    related_aliases: [],
  },
  {
    case_id: 'kingfisher',
    display_name: 'Kingfisher Airlines',
    aliases: ['Kingfisher Airlines', 'Vijay Mallya'],
    related_aliases: ['United Breweries (Holdings)', 'United Breweries Holdings'],
  },
  {
    case_id: 'bhushan_power',
    display_name: 'Bhushan Power and Steel',
    aliases: ['Bhushan Power and Steel', 'Bhushan Power & Steel'],
    related_aliases: [],
  },
  {
    case_id: 'bhushan_steel',
    display_name: 'Bhushan Steel',
    aliases: ['Bhushan Steel'],
    related_aliases: [],
  },
  {
    case_id: 'videocon',
    display_name: 'Videocon group',
    aliases: ['Videocon Industries', 'Videocon International'],
    related_aliases: ['NuPower Renewables'],
  },
  {
    case_id: 'sterling_biotech',
    display_name: 'Sterling Biotech (Sandesara group)',
    aliases: ['Sterling Biotech', 'Sandesara'],
    related_aliases: ['Sterling SEZ'],
  },
  {
    case_id: 'karvy',
    display_name: 'Karvy Stock Broking',
    aliases: ['Karvy Stock Broking'],
    related_aliases: ['Karvy Realty', 'Karvy Capital'],
  },
  {
    case_id: 'srei',
    display_name: 'Srei Infrastructure Finance / Srei Equipment Finance',
    aliases: [
      'Srei Infrastructure Finance',
      'Srei Equipment Finance',
      'SREI Infrastructure Finance',
      'SREI Equipment Finance',
    ],
    related_aliases: [],
  },
  {
    case_id: 'brightcom',
    display_name: 'Brightcom Group',
    aliases: ['Brightcom Group'],
    related_aliases: [],
  },
  {
    case_id: 'zee',
    display_name: 'Zee Entertainment Enterprises',
    aliases: ['Zee Entertainment Enterprises'],
    related_aliases: ['Essel Group'],
  },
  {
    case_id: 'gensol',
    display_name: 'Gensol Engineering',
    aliases: ['Gensol Engineering'],
    related_aliases: ['BluSmart', 'Blu-Smart Mobility'],
  },
  { case_id: 'amtek', display_name: 'Amtek Auto', aliases: ['Amtek Auto'], related_aliases: [] },
  {
    case_id: 'rotomac',
    display_name: 'Rotomac Global',
    aliases: ['Rotomac Global'],
    related_aliases: [],
  },
  {
    case_id: 'cox_kings',
    display_name: 'Cox & Kings',
    aliases: ['Cox & Kings', 'Cox and Kings'],
    related_aliases: [],
  },
  {
    case_id: 'winsome',
    display_name: 'Winsome Diamonds',
    aliases: ['Winsome Diamonds'],
    related_aliases: ['Forever Precious Jewellery'],
  },
  {
    case_id: 'adarsh',
    display_name: 'Adarsh group',
    aliases: ['Adarsh Credit Co-operative', 'Adarsh Group'],
    related_aliases: [],
  },
];

export const CASE_SEEDS: readonly CaseSeed[] = INPUT.map((c) =>
  CaseSeedSchema.parse({
    ...c,
    selection_reason: REASON,
    verification_status: 'seed_candidate_unverified',
  }),
);
