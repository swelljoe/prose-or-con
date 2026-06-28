import type { Genre } from './types';

// ---------------------------------------------------------------------------
// Curated human-source inputs. Lists are longer than the targets need; fetchers
// take the first N that succeed, so a dead title/URL just gets skipped.
// ---------------------------------------------------------------------------

/** Wikipedia: stable, factual, varied articles. Fetched at a pre-2022 revision. */
export const WIKIPEDIA_TITLES: string[] = [
  'Photosynthesis', 'Roman Empire', 'Jupiter', 'Coffee', 'Volcano',
  'Impressionism', 'Great Barrier Reef', 'Printing press', 'Octopus',
  'Mount Everest', 'Beekeeping', 'Lighthouse', 'Tea', 'Glacier',
  'Cartography', 'Bioluminescence', 'Aqueduct', 'Monsoon', 'Origami', 'Sourdough',
  'Silk Road', 'Renaissance', 'Industrial Revolution', 'Plate tectonics',
  'Black hole', 'DNA', 'Vaccine', 'Penguin', 'Thunderstorm', 'Tide',
  'Comet', 'Mitochondrion', 'Fungus', 'Coast redwood', 'Bird migration',
  'Great Wall of China', 'Library of Alexandria', 'Gothic architecture', 'Jazz',
  'Stained glass', 'Calligraphy', 'Chocolate', 'Sahara', 'Amazon River',
  'Fjord', 'Salt', 'Bicycle', 'Compass', 'Telescope', 'Windmill',
  'Submarine', 'Helicopter', 'Honey bee', 'Coral reef', 'Aurora',
  // Expansion batch (to bring the human pool level with the AI pool).
  'Cuneiform', 'Antikythera mechanism', 'Terracotta Army', 'Stonehenge', 'Petra',
  'Machu Picchu', 'Angkor Wat', 'Pompeii', 'Nazca Lines', 'Permafrost', 'Geyser',
  'Mangrove', 'Lichen', 'Tardigrade', 'Axolotl', 'Narwhal', 'Pangolin', 'Platypus',
  'Seahorse', 'Cuttlefish', 'Nautilus', 'Coelacanth', 'Venus flytrap', 'Baobab',
  'Kelp forest', 'Krill', 'Penicillin', 'Pasteurization', 'Vulcanization',
  'Semiconductor', 'Transistor', 'Laser', 'Radar', 'Sonar', 'Gyroscope', 'Barometer',
  'Seismometer', 'Loom', 'Steam engine', 'Morse code', 'Phonograph', 'Ukiyo-e',
  'Fresco', 'Mosaic', 'Porcelain', 'Lacquer', 'Bookbinding', 'Cheese', 'Fermentation',
  'Saffron', 'Cinnamon', 'Maple syrup', 'Atoll', 'Karst', 'Oasis', 'Savanna', 'Taiga',
  'Estuary', 'Caldera', 'Archipelago', 'Nebula', 'Supernova', 'Pulsar', 'Solar eclipse',
];

/**
 * Wikinews: candidate articles are drawn from these topic categories, then
 * filtered by first-revision (publication) date < 2022.
 */
export const WIKINEWS_TOPIC_CATEGORIES: string[] = [
  'Politics and conflicts', 'Science and technology', 'Culture and entertainment',
  'Economy and business', 'Environment', 'Health',
];

/** Wikivoyage: destination guides. */
export const WIKIVOYAGE_TITLES: string[] = [
  'Kyoto', 'Lisbon', 'Edinburgh', 'Marrakech', 'Hanoi', 'Reykjavík',
  'Porto', 'Valparaíso', 'Ljubljana', 'Kraków', 'Bruges', 'Tbilisi',
  'Istanbul', 'Prague', 'Seville', 'Bergen', 'Québec City', 'Cusco',
  'Luang Prabang', 'Chiang Mai', 'Dubrovnik', 'Tallinn', 'Bologna',
  'San Sebastián', 'Galway', 'Salzburg', 'Sarajevo', 'Yangon',
  'Oaxaca', 'Valletta', 'Ghent', 'Bath',
  // Expansion batch (to bring the human pool level with the AI pool).
  'Granada', 'Córdoba', 'Toledo', 'Ronda', 'Cádiz', 'Girona', 'Nara', 'Kanazawa',
  'Takayama', 'Hoi An', 'Hue', 'George Town', 'Malacca', 'Jaipur', 'Udaipur',
  'Varanasi', 'Pokhara', 'Kandy', 'Galle', 'Stone Town', 'Fez', 'Essaouira',
  'Chefchaouen', 'Amman', 'Muscat', 'Antigua Guatemala', 'Guanajuato', 'Arequipa',
  'Trondheim', 'Aarhus', 'Gdańsk', 'Wrocław', 'Brno', 'Vilnius', 'Riga', 'Lviv',
  'Plovdiv', 'Kotor', 'Split', 'Matera', 'Lecce', 'Siena', 'Lucca', 'Trieste',
  'Colmar', 'Utrecht', 'Haarlem', 'Coimbra', 'Sintra',
];

// Project Gutenberg books are selected at fetch time from the full catalog,
// excluding the canon and famous authors so the game tests style, not recognition
// (see corpus/build/fetchers/gutenberg-catalog.ts).

/**
 * Curated modern-journalism essays (CC BY-ND / NC-ND). VERIFY each URL is a real
 * pre-2022 article before relying on it; bad URLs are skipped. ND => verbatim
 * paragraphs only; author byline shown on reveal. Empty => essays backfill from
 * public-domain sources.
 */
export interface NewsSource {
  url: string;
  source: 'The Conversation' | 'ProPublica';
  license: string;
  licenseUrl: string;
}
export const NEWS_SOURCES: NewsSource[] = [];

// ---------------------------------------------------------------------------
// AI generation plan. Genre counts mirror the human side so genre isn't a tell.
// ---------------------------------------------------------------------------

export interface AiModel {
  id: string;
  provider: 'deepseek' | 'openrouter' | 'claude-cli';
  label: string;
}

// Tier 1: older / smaller models, for range.
export const AI_MODELS: AiModel[] = [
  { id: 'deepseek-chat', provider: 'deepseek', label: 'DeepSeek' },
  { id: 'openai/gpt-4o-mini', provider: 'openrouter', label: 'GPT-4o mini' },
  { id: 'meta-llama/llama-3.3-70b-instruct', provider: 'openrouter', label: 'Llama 3.3 70B' },
  { id: 'mistralai/mistral-small-3.2-24b-instruct', provider: 'openrouter', label: 'Mistral Small' },
  { id: 'qwen/qwen-2.5-72b-instruct', provider: 'openrouter', label: 'Qwen 2.5 72B' },
  { id: 'google/gemini-2.5-flash', provider: 'openrouter', label: 'Gemini 2.5 Flash' },
  { id: 'claude', provider: 'claude-cli', label: 'Claude' },
];

// Tier 2: current frontier / near-frontier models, so humans aren't only pitted
// against weaker models. All via OpenRouter for a uniform API.
export const AI_MODELS_FRONTIER: AiModel[] = [
  { id: 'anthropic/claude-opus-4.8', provider: 'openrouter', label: 'Claude Opus 4.8' },
  { id: 'google/gemini-3.5-flash', provider: 'openrouter', label: 'Gemini 3.5 Flash' },
  { id: 'openai/gpt-5.5', provider: 'openrouter', label: 'GPT-5.5' },
  { id: 'deepseek/deepseek-v4-pro', provider: 'openrouter', label: 'DeepSeek V4 Pro' },
  { id: 'z-ai/glm-5.2', provider: 'openrouter', label: 'GLM-5.2' },
];

export interface Assignment {
  genre: Genre;
  topic: string;
  style: 'plain' | 'humanized';
}

// Topics overlap thematically with the human genres without copying them.
const TOPICS: Record<Genre, string[]> = {
  encyclopedic: [
    'how tides work', 'the history of paper money', 'the life cycle of a star',
    'the domestication of the cat', 'how vaccines train the immune system',
    'the geology of caves', 'the invention of the bicycle', 'how bread rises',
    'how rainbows form', 'the history of the alphabet', 'how bridges stay up',
    'the migration of monarch butterflies', 'what causes earthquakes',
    'the chemistry of soap', 'how coral reefs grow', 'the invention of the telescope',
    'why leaves change color', 'how sound travels underwater', 'the history of zero',
    'how mountains form',
  ],
  news: [
    'a city opening a new public library', 'a regional drought and water rationing',
    'a local team winning a championship', 'a factory closure and its town',
    'a new bridge opening after years of delay', 'a record-breaking heat wave',
    'a museum recovering a stolen painting', 'a town debating a wind farm',
    'a community garden saving a vacant lot', 'a ferry service resuming after a storm',
    'a local election with record turnout', 'a hospital opening a new wing',
    'a river cleanup reaching a milestone', 'a small airport adding international flights',
    'a school reopening after renovation', 'a power outage and the response',
    'a farmers market marking its anniversary', 'a coastal town fighting erosion',
  ],
  essay: [
    'why we procrastinate', 'the value of boredom', 'what maps reveal about us',
    'the ethics of keeping pets', 'why cities feel alive at night',
    'the quiet decline of handwriting', 'what we lose when we stop walking',
    'the comfort of routine', 'why we keep old letters', 'what silence teaches',
    'the pull of unfinished books', 'learning to be alone',
    'the strange honesty of strangers', 'why we romanticize the past',
    'the small rebellions of everyday life', 'on changing your mind',
    'the weight of good advice',
  ],
  travel: [
    'a hill town in northern Italy', 'a fishing village on the Atlantic coast',
    'a desert city at dawn', 'a mountain railway journey', 'an old port quarter',
    'a small island reachable only by ferry', 'a canal city in early spring',
    'a high-altitude tea-growing region', 'a windswept lighthouse coast',
    'a souk in the late afternoon', 'a riverside town famous for its bridges',
    'a remote monastery reachable on foot', 'a vineyard valley at harvest',
    'a northern city under the midnight sun', 'an old spa town', 'a coastal road trip',
  ],
  fiction: [
    'a lighthouse keeper on the last night of the season',
    'two strangers sharing a train compartment', 'a clockmaker who fears time',
    'a child convinced the sea is calling them', 'a returning soldier and an empty house',
    'a market on the morning after a storm', 'a letter that arrives fifty years late',
    'a gardener and an uninvited fox', 'an old woman teaching a parrot to lie',
    'a night watchman who collects lost umbrellas',
    "a baker who dreams in other people's memories", 'a boy who trades his shadow',
    "twin sisters who haven't spoken in years", "a translator falling for a dead poet's words",
    'a town where it has rained for a decade', 'a cartographer mapping a city that keeps changing',
    'the last passenger on a midnight bus', 'a girl who keeps a jar of borrowed time',
  ],
  poetry: [
    'the first frost', 'a city seen from a departing train', 'an abandoned orchard',
    'the hour before dawn', 'rain on a tin roof', 'a photograph of someone gone',
    'a kettle coming to boil', 'the last leaf on a branch', 'a childhood house now demolished',
    'the sea at the end of summer', 'a streetlight in fog', 'an empty swing',
    'the smell of coming snow', 'a clock that stopped', 'a field after harvest',
    'low tide at dawn',
  ],
};

/** Per-genre human/AI targets (~200 total). Must roughly match what fetchers yield. */
export const AI_TARGETS: Record<Genre, number> = {
  encyclopedic: 40,
  news: 35,
  essay: 35,
  travel: 25,
  fiction: 40,
  poetry: 25,
};

/** Build the AI assignment list, ~20% humanized. */
export function buildAssignments(): Assignment[] {
  const out: Assignment[] = [];
  for (const [genre, n] of Object.entries(AI_TARGETS) as [Genre, number][]) {
    const topics = TOPICS[genre];
    for (let i = 0; i < n; i++) {
      out.push({
        genre,
        topic: topics[i % topics.length]!,
        style: i % 5 === 0 ? 'humanized' : 'plain',
      });
    }
  }
  return out;
}
