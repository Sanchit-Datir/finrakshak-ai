/** Relationships between entities (ownership, guarantees, shared addresses, proceedings). */

import type { Relationship } from '../../domain/schemas.js';
import type { SeedContext } from './context.js';

export type MakeRelationship = (
  from: string,
  to: string,
  type: Relationship['type'],
  status: Relationship['status'],
  source: string,
  days: number,
  evidence: string,
) => Relationship;

export function demoRelationships(ctx: SeedContext): {
  relationships: Relationship[];
  rel: MakeRelationship;
} {
  const { ago } = ctx;
  let relSeq = 0;
  const rel = (
    from: string,
    to: string,
    type: Relationship['type'],
    status: Relationship['status'],
    source: string,
    days: number,
    evidence: string,
  ): Relationship => {
    relSeq += 1;
    return { id: `r-${relSeq}`, from, to, type, status, source, observedAt: ago(days), evidence };
  };
  const relationships: Relationship[] = [
    rel(
      'e-ganesh-kale',
      'c-ganesh-agro',
      'owner_of',
      'verified',
      'GST registration certificate (A-1003)',
      3,
      'Proprietor: Ganesh Kale',
    ),
    rel(
      'e-sachin',
      'c-omsai',
      'owner_of',
      'verified',
      'Udyam certificate (A-1010)',
      38,
      'Name of entrepreneur: Sachin Bhosale',
    ),
    rel(
      'e-sachin',
      'c-bhosale-infra',
      'director_of',
      'user_provided',
      'Director declaration in A-1010 application',
      38,
      'Applicant declared directorship in Bhosale Infra Developers Pvt Ltd',
    ),
    rel(
      'e-rohit',
      'e-sachin',
      'shares_address',
      'verified',
      'Address on application A-1013 and A-1010',
      4,
      'Both list "Bus stand road, Junnar" — applicant is the son of Sachin Bhosale',
    ),
    rel(
      'e-vikas-more',
      'c-shivneri',
      'director_of',
      'user_provided',
      'Dealer quotation SAE/Q/0912 (A-1008)',
      52,
      'Quotation signed by Vikas More, Director',
    ),
    rel(
      'e-navnath-gade',
      'e-rohit',
      'guarantor_for',
      'user_provided',
      'Guarantor section of A-1013',
      4,
      'Guarantor: Navnath Gade (business associate)',
    ),
    rel(
      'e-navnath-gade',
      'c-navnath',
      'owner_of',
      'inferred',
      'Name similarity only',
      4,
      'Guarantor "Navnath Gade" and counterparty "Navnath Enterprises" share a name. No ownership record is available — possible match, not verified.',
    ),
    rel(
      'e-ramesh',
      'e-sunita',
      'guarantor_for',
      'user_provided',
      'Guarantor section of A-1002',
      1,
      'Guarantor: Ramesh Shankar Jadhav (relative)',
    ),
    rel(
      'c-ganesh-agro',
      'e-dnyaneshwar',
      'shared_identifier',
      'verified',
      'Warehouse receipts in A-1003 and A-1009',
      3,
      'Both applications cite warehouse receipt WR-PN-0457',
    ),
    rel(
      'c-bhosale-infra',
      'p-civil-117',
      'same_proceeding',
      'user_provided',
      'Analyst note — demo record, no public-record lookup performed',
      10,
      'Named as a party in a commercial dispute',
    ),
    rel(
      'c-navnath',
      'p-civil-117',
      'same_proceeding',
      'user_provided',
      'Analyst note — demo record, no public-record lookup performed',
      10,
      'Named as a party in a commercial dispute',
    ),
  ];
  return { relationships, rel };
}
