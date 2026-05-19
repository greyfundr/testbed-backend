import {
  Injectable,
  Logger,
  OnApplicationBootstrap,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, IsNull } from 'typeorm';
import { Campaign, CampaignCategory } from '../entities';

// Curated topic vocabulary used to assign tags to campaigns. Each
// entry maps a stable slug (the tag stored in `campaigns.tags`)
// to an array of synonyms / keyword patterns. Matching is
// case-insensitive and respects word boundaries so "education"
// does NOT match "reduction" and "men" does NOT match "amen".
//
// Keep this list short and meaningful. The For You feed scores
// users and campaigns in this shared space; bloating it with rare
// tags just dilutes the cosine similarity. Add a tag only when:
//   • you expect a non-trivial fraction of campaigns to carry it
//   • the tag captures a meaningful donor preference
const TAG_VOCABULARY: Record<string, string[]> = {
  children: ['child', 'children', 'kid', 'kids', 'infant', 'baby', 'babies', 'toddler'],
  women: ['woman', 'women', 'girl', 'girls', 'mother', 'mothers', 'maternal'],
  men: ['man', 'men', 'father', 'fathers', 'dad', 'paternal'],
  elderly: ['elder', 'elderly', 'senior', 'seniors', 'aging'],
  youth: ['youth', 'teen', 'teenage', 'teenager', 'adolescent', 'student', 'students'],
  family: ['family', 'families'],
  veterans: ['veteran', 'veterans', 'soldier', 'soldiers'],
  refugees: ['refugee', 'refugees', 'displaced', 'asylum'],
  disability: ['disabled', 'disability', 'disabilities', 'handicap', 'wheelchair', 'blind', 'deaf'],
  orphans: ['orphan', 'orphans', 'orphanage'],

  medical: ['medical', 'health', 'hospital', 'surgery', 'cancer', 'treatment', 'diabetes', 'doctor', 'medication', 'patient', 'clinic'],
  'mental-health': ['mental', 'depression', 'anxiety', 'therapy', 'counselling', 'counseling', 'suicide'],
  education: ['education', 'school', 'scholarship', 'tuition', 'college', 'university', 'classroom', 'teacher', 'student', 'learning'],
  'food-relief': ['food', 'hunger', 'meal', 'meals', 'feeding', 'starvation', 'malnutrition'],
  water: ['water', 'well', 'borehole', 'sanitation', 'hygiene', 'plumbing'],
  housing: ['housing', 'shelter', 'home', 'homeless', 'rent', 'eviction', 'mortgage'],
  faith: ['religion', 'religious', 'church', 'mosque', 'temple', 'faith', 'christian', 'muslim', 'islamic', 'pastor', 'imam'],
  legal: ['legal', 'justice', 'lawyer', 'court', 'attorney', 'litigation', 'bail'],
  animals: ['animal', 'animals', 'dog', 'dogs', 'cat', 'cats', 'pet', 'pets', 'wildlife', 'livestock'],
  environment: ['environment', 'climate', 'tree', 'trees', 'forest', 'planet', 'pollution', 'recycling', 'conservation'],
  arts: ['art', 'arts', 'music', 'dance', 'theater', 'theatre', 'creative', 'painting', 'film'],
  sports: ['sport', 'sports', 'athletics', 'football', 'soccer', 'basketball', 'tournament', 'team'],
  technology: ['tech', 'technology', 'computer', 'computers', 'internet', 'software', 'coding'],
  'disaster-relief': ['disaster', 'flood', 'flooding', 'fire', 'hurricane', 'earthquake', 'emergency', 'crisis'],
  business: ['business', 'startup', 'entrepreneur', 'entrepreneurship', 'capital'],
  community: ['community', 'neighborhood', 'neighbourhood', 'village'],
  funeral: ['funeral', 'burial', 'memorial', 'bereaved', 'bereavement'],
  'birthday': ['birthday', 'birthdays'],
  wedding: ['wedding', 'weddings', 'marriage', 'bride', 'groom'],
  travel: ['travel', 'trip', 'visa', 'flight', 'journey'],
  agriculture: ['farm', 'farming', 'agriculture', 'crop', 'crops', 'harvest', 'livestock'],
};

// Built once at module load — flat list of `{ tag, regex }` pairs.
// Each regex matches a whole-word occurrence of a synonym so we
// never get partial-string false positives.
const TAG_PATTERNS: Array<{ tag: string; regex: RegExp }> = (() => {
  const out: Array<{ tag: string; regex: RegExp }> = [];
  for (const [tag, synonyms] of Object.entries(TAG_VOCABULARY)) {
    for (const s of synonyms) {
      const escaped = s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      out.push({ tag, regex: new RegExp(`\\b${escaped}\\b`, 'i') });
    }
  }
  return out;
})();

// How many tags to keep per campaign. Six is enough to express most
// causes (e.g. a campaign about a sick child's surgery: medical,
// children, family, hospital → only one of those is redundant)
// without diluting the cosine signal.
const MAX_TAGS_PER_CAMPAIGN = 6;

@Injectable()
export class CampaignTaggingService implements OnApplicationBootstrap {
  private readonly logger = new Logger(CampaignTaggingService.name);

  // Runs once per process start. Tags any campaign whose `tags`
  // column is still null — i.e. legacy rows that existed before the
  // tagging service shipped + any row that slipped through the
  // on-create hook (e.g. created during a brief deploy window).
  // Detached from app start so a slow / failing run never blocks
  // the service coming up to serve requests.
  async onApplicationBootstrap(): Promise<void> {
    setTimeout(() => {
      this.backfillMissingTags(500)
        .then((res) =>
          this.logger.log(
            `Boot-time tag backfill complete: ${res.processed} campaigns tagged`,
          ),
        )
        .catch((err) =>
          this.logger.warn(
            `Boot-time tag backfill failed: ${(err as Error).message}`,
          ),
        );
    }, 5000);
  }

  constructor(
    @InjectRepository(Campaign)
    private readonly campaignRepo: Repository<Campaign>,
    @InjectRepository(CampaignCategory)
    private readonly categoryRepo: Repository<CampaignCategory>,
  ) {}

  // Pure derivation function — no DB. Given a campaign's textual
  // fields, returns the inferred topic tags. Caller is responsible
  // for persisting. Exposed publicly so callers (e.g. on-create
  // hooks, backfill jobs, tests) share one canonical implementation.
  deriveTags(input: {
    title?: string | null;
    description?: string | null;
    categoryName?: string | null;
  }): string[] {
    const title = (input.title ?? '').trim();
    const description = (input.description ?? '').trim();
    const categoryName = (input.categoryName ?? '').trim();

    // Title matches count double — a tag in the headline is a much
    // stronger signal than a tag mentioned once in a long story.
    const titleText = ` ${title} `;
    const bodyText = ` ${title} ${description} `;

    const scores: Record<string, number> = {};
    for (const { tag, regex } of TAG_PATTERNS) {
      const inTitle = regex.test(titleText);
      const inBody = regex.test(bodyText);
      if (inTitle || inBody) {
        scores[tag] = (scores[tag] ?? 0) + (inTitle ? 2 : 0) + (inBody ? 1 : 0);
      }
    }

    // Category name → its own derived tag (slugified). Adds the
    // platform's coarse taxonomy on top of the keyword-derived
    // fine-grained tags. Weighted high since the creator explicitly
    // picked it.
    const categorySlug = this.slugify(categoryName);
    if (categorySlug) scores[categorySlug] = (scores[categorySlug] ?? 0) + 3;

    const ranked = Object.entries(scores)
      .sort(([, a], [, b]) => b - a)
      .slice(0, MAX_TAGS_PER_CAMPAIGN)
      .map(([tag]) => tag);

    return ranked;
  }

  private slugify(s: string): string {
    return s
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '');
  }

  // Persists derived tags for one campaign. Cheap idempotent: skips
  // the UPDATE if the new tags match the existing array exactly.
  async retagCampaign(campaignId: string): Promise<string[]> {
    const campaign = await this.campaignRepo.findOne({
      where: { id: campaignId },
      relations: ['category'],
    });
    if (!campaign) return [];

    const newTags = this.deriveTags({
      title: campaign.title,
      description: campaign.description,
      categoryName: campaign.category?.name,
    });

    const existing = campaign.tags ?? [];
    const same =
      existing.length === newTags.length &&
      existing.every((t, i) => t === newTags[i]);
    if (same) return existing;

    await this.campaignRepo.update(campaign.id, { tags: newTags });
    return newTags;
  }

  // One-off backfill: re-tag every campaign that has tags = NULL.
  // Run on demand via the /campaigns/admin/backfill-tags endpoint
  // (gated to operators). Caps batch size so a 10,000-row table
  // doesn't OOM the worker.
  async backfillMissingTags(limit = 500): Promise<{ processed: number }> {
    const batch = await this.campaignRepo.find({
      where: { tags: IsNull() },
      relations: ['category'],
      take: limit,
    });
    for (const c of batch) {
      const newTags = this.deriveTags({
        title: c.title,
        description: c.description,
        categoryName: c.category?.name,
      });
      await this.campaignRepo.update(c.id, { tags: newTags });
    }
    this.logger.log(`Backfilled tags for ${batch.length} campaign(s)`);
    return { processed: batch.length };
  }
}
