import type {
  CaseDocumentLink,
  CaseEvent,
  DocumentRecord,
  EvidenceClaim,
  EvidenceStatus,
  ListingItem,
  RawArtifact,
  SourceId,
} from '@finrakshak-ai/shared';
import { getConfig } from '../config.js';
import type { ExtractedText } from '../extract/text.js';
import { EntityRegistry } from '../resolve/entityRegistry.js';
import { matchSeeds } from '../select/relevance.js';
import { stableId } from '../util/ids.js';
import { bindCins, typedAmounts } from './amounts.js';
import type { Classification } from './classify.js';
import { extractParties, type OrgMention, type PersonMention } from './parties.js';

export interface DocWithText {
  readonly url: string;
  readonly artifact: RawArtifact | null;
  readonly text: ExtractedText | null;
}

/** An org mention waiting for final entity ids. */
export interface PendingOrg extends OrgMention {
  readonly key: string;
  readonly eventId: string;
  readonly documentId: string;
  readonly source: SourceId;
  readonly status: EvidenceStatus;
  readonly date: string | null;
  readonly page: number | null;
  readonly subjectKeys: readonly string[];
}

export interface PendingPerson extends PersonMention {
  readonly personId: string;
  readonly eventId: string;
  readonly documentId: string;
  readonly source: SourceId;
  readonly date: string | null;
  readonly subjectKeys: readonly string[];
}

const LISTING_FALLBACK: Readonly<Record<SourceId, string>> = {
  mca_ogd: 'https://www.data.gov.in/',
  sebi: 'https://www.sebi.gov.in/enforcement/orders.html',
  nse_bse: 'https://www.nseindia.com/',
  ibbi: 'https://ibbi.gov.in/public-announcement',
  sfio: 'https://sfio.gov.in/',
  ed: 'https://enforcementdirectorate.gov.in/media/press-release/',
  nclt: 'https://nclt.gov.in/',
  ecourts_sci: 'https://www.sci.gov.in/',
  rbi: 'https://www.rbi.org.in/Scripts/BS_PressReleaseDisplay.aspx',
  nfra: 'https://nfra.gov.in/',
};

function pageOf(pages: readonly string[], needle: string): number | null {
  const i = pages.findIndex((p) => p.includes(needle));
  return i >= 0 ? i + 1 : null;
}

export class DatasetCollector {
  readonly registry = new EntityRegistry();
  readonly documents: DocumentRecord[] = [];
  readonly events: CaseEvent[] = [];
  readonly orgs: PendingOrg[] = [];
  readonly persons: PendingPerson[] = [];
  readonly claims: EvidenceClaim[] = [];
  readonly caseLinks: CaseDocumentLink[] = [];
  readonly cinBindings: {
    key: string;
    cin: string;
    documentId: string;
    source: SourceId;
    excerpt: string;
    page: number;
  }[] = [];
  private readonly extractedAt = new Date().toISOString();

  addItem(
    item: ListingItem,
    docs: readonly DocWithText[],
    cls: Classification,
    termsNote: string,
  ): void {
    const documentIds = this.addDocuments(item, docs, termsNote);
    const documentId = documentIds[0] ?? stableId('doc', item.item_id);
    const pages = docs.flatMap((d) => d.text?.pages ?? []);
    const text = pages.join('\n');
    const eventId = stableId('evt', item.item_id);
    const parties = extractParties(item, text);
    const amounts = pages.flatMap((p, i) => typedAmounts(p).map((a) => ({ ...a, page: i + 1 })));
    this.events.push({
      event_id: eventId,
      case_type: cls.case_type,
      authority: cls.authority,
      source_id: item.source_id,
      document_id: documentId,
      title: item.title.slice(0, 1_000),
      party_names: [
        ...new Set(parties.orgs.filter((o) => o.role === 'subject').map((o) => o.name)),
      ],
      event_date: item.published_date,
      publication_date: item.published_date,
      proceeding_status: cls.proceeding_status,
      outcome: amounts.length ? [...new Set(amounts.map((a) => a.kind))].join(', ') : null,
      appeal_status: item.fields['sat_appeal'] ? `SAT appeal: ${item.fields['sat_appeal']}` : null,
      amounts: amounts
        .filter((a) => a.kind !== 'claim_or_debt')
        .slice(0, 5)
        .map((a) => a.money),
    });
    this.addParties(item, parties.orgs, parties.persons, { eventId, documentId, cls, pages });
    this.addCinBindings(item, pages, documentId);
    for (const a of amounts)
      this.claims.push(
        this.claim(
          eventId,
          `amount:${a.kind}`,
          a.money.minor.toString(),
          a,
          documentId,
          item.source_id,
          a.page,
          cls.evidence_status,
        ),
      );
    this.addCaseLinks(item, documentId, text);
  }

  private addDocuments(
    item: ListingItem,
    docs: readonly DocWithText[],
    termsNote: string,
  ): string[] {
    const rows =
      docs.length > 0
        ? docs
        : [
            {
              url: item.document_urls[0] ?? item.detail_url ?? LISTING_FALLBACK[item.source_id],
              artifact: null,
              text: null,
            },
          ];
    return rows.map((d) => {
      const id = stableId('doc', item.item_id, d.url);
      this.documents.push({
        document_id: id,
        source_id: item.source_id,
        collection: item.collection,
        item_id: item.item_id,
        url: d.url,
        title: item.title.slice(0, 1_000),
        publication_date: item.published_date,
        retrieval_date: d.artifact?.retrieved_at ?? null,
        checksum_sha256: d.artifact?.sha256 ?? null,
        file_location: d.artifact ? `gs://<bucket>/${d.artifact.path}` : null,
        content_type: d.artifact?.content_type ?? null,
        text_chars: d.text?.chars ?? 0,
        page_count: d.text?.pages.length ?? 0,
        terms_note: d.artifact?.terms_note ?? termsNote,
      });
      return id;
    });
  }

  private addParties(
    item: ListingItem,
    orgs: readonly OrgMention[],
    persons: readonly PersonMention[],
    ctx: { eventId: string; documentId: string; cls: Classification; pages: readonly string[] },
  ): void {
    const typed = orgs.map((o) => ({
      o,
      key: this.registry.addOrg(
        o.name,
        item.source_id,
        o.role === 'audit_firm' ? 'audit_firm' : undefined,
      ),
    }));
    const subjectKeys = typed
      .filter((t) => t.o.role === 'subject' && t.key)
      .map((t) => t.key ?? '');
    for (const { o, key } of typed) {
      if (!key) continue;
      const status: EvidenceStatus =
        o.origin === 'text' && o.role === 'mentioned' ? 'inference' : ctx.cls.evidence_status;
      const page = o.origin === 'text' ? pageOf(ctx.pages, o.name) : null;
      this.orgs.push({
        ...o,
        key,
        eventId: ctx.eventId,
        documentId: ctx.documentId,
        source: item.source_id,
        status,
        date: item.published_date,
        page,
        subjectKeys,
      });
    }
    for (const p of persons) {
      const personId = this.registry.addPerson(p.name, p.role, item.source_id);
      if (personId)
        this.persons.push({
          ...p,
          personId,
          eventId: ctx.eventId,
          documentId: ctx.documentId,
          source: item.source_id,
          date: item.published_date,
          subjectKeys,
        });
    }
  }

  private addCinBindings(item: ListingItem, pages: readonly string[], documentId: string): void {
    pages.slice(0, 6).forEach((page, i) => {
      for (const b of bindCins(item.source_id, page, item.fields['corporate_debtor'])) {
        const key = this.registry.addOrg(b.name, item.source_id);
        if (!key) continue;
        this.registry.bindCin(key, b.cin);
        this.cinBindings.push({
          key,
          cin: b.cin,
          documentId,
          source: item.source_id,
          excerpt: b.excerpt,
          page: i + 1,
        });
      }
    });
  }

  private addCaseLinks(item: ListingItem, documentId: string, text: string): void {
    const listingText = `${item.title} ${Object.values(item.fields).join(' ')}`;
    const fromListing = matchSeeds(listingText);
    const fromText = matchSeeds(text.slice(0, 30_000)).filter(
      (m) => !fromListing.some((l) => l.case_id === m.case_id),
    );
    for (const [matches, where] of [
      [fromListing, 'title'],
      [fromText, 'text'],
    ] as const) {
      for (const m of matches) {
        this.caseLinks.push({
          case_id: m.case_id,
          document_id: documentId,
          source_id: item.source_id,
          matched_alias: m.alias,
          matched_in: where,
          publication_date: item.published_date,
        });
      }
    }
  }

  claim(
    subjectId: string,
    predicate: string,
    objectValue: string,
    detail: { excerpt: string; money?: EvidenceClaim['amount'] },
    documentId: string,
    source: SourceId,
    page: number | null,
    status: EvidenceStatus,
    method: EvidenceClaim['extraction_method'] = 'regex',
    confidence = 0.7,
  ): EvidenceClaim {
    return {
      claim_id: stableId('clm', subjectId, predicate, objectValue, documentId, String(page)),
      subject_id: subjectId,
      predicate,
      object_value: objectValue.slice(0, 500),
      amount: detail.money ?? null,
      document_id: documentId,
      source_id: source,
      page,
      excerpt: detail.excerpt.replace(/\s+/g, ' ').trim().slice(0, 600),
      extraction_method: method,
      extractor_version: getConfig().extractorVersion,
      extracted_at: this.extractedAt,
      status,
      confidence,
    };
  }
}
