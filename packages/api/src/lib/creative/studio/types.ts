/**
 * Raivstream 5.0 — Studio domain types (Slice 7).
 *
 * Studio provides persistent COMMERCIAL context to the exact same creative
 * engine — there is no StudioBrief/StudioBible/StudioDirector. Brand DNA feeds
 * the existing Brief + Bible; campaigns relate to the existing projects and
 * their outputs.
 */

export type CampaignStatus = 'DRAFT' | 'ACTIVE' | 'PAUSED' | 'COMPLETED' | 'ARCHIVED';
export type StudioAssetKind = 'IMAGE' | 'VIDEO' | 'LOGO' | 'AUDIO';

export interface BrandDNA {
  brandIdentity: Record<string, unknown>;
  visualLanguage: Record<string, unknown>;
  audioLanguage: Record<string, unknown>;
  tone: Record<string, unknown>;
  audience: Record<string, unknown>;
  approvedMessaging: Record<string, unknown>;
  constraints: Record<string, unknown>;
}

export interface ProductState {
  id: string;
  studioId: string;
  name: string;
  description: string | null;
  identity: Record<string, unknown> | null;
  imagery: Record<string, unknown> | null;
  claims: Record<string, unknown> | null;
  variants: Record<string, unknown> | null;
}

export interface CampaignState {
  id: string;
  studioId: string;
  productId: string | null;
  name: string;
  objective: string | null;
  audience: string | null;
  context: Record<string, unknown> | null;
  status: CampaignStatus;
  projectIds: string[];
  createdAt: Date;
  updatedAt: Date;
}

export interface StudioState {
  id: string;
  userId: string;
  name: string;
  brand: BrandDNA;
  createdAt: Date;
  updatedAt: Date;
}

/** The assembled commercial context fed into the existing creative engine. */
export interface StudioContext {
  studioId: string;
  studioName: string;
  brand: BrandDNA;
  product: ProductState | null;
  campaign: CampaignState | null;
  reusableAssets: Array<{ id: string; name: string; kind: StudioAssetKind; assetUrl: string | null; provenance: Record<string, unknown> | null }>;
}