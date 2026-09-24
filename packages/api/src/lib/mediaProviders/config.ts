/**
 * Media provider configuration — fail-closed / default-off.
 *
 * Every switch defaults to disabled. A live provider call requires BOTH the
 * master switch AND the real-calls switch AND the per-capability switch AND a
 * configured credential. `FAL_MAX_REQUESTS=0` means "no requests permitted".
 *
 * No credential values are read here beyond an existence check.
 */

export const FAL_ENDPOINTS = {
  image: 'fal-ai/flux-2',
  imageCond: 'fal-ai/flux-pro/v1/kontext',
  video: 'minimax/h3-max-turbo/image-to-video',
  ugc: 'veed/fabric-1.0',
} as const;

export const FAL_ALLOWED_ENDPOINTS: readonly string[] = Object.freeze([
  FAL_ENDPOINTS.image,
  FAL_ENDPOINTS.imageCond,
  FAL_ENDPOINTS.video,
  FAL_ENDPOINTS.ugc,
]);

export interface FalMediaConfig {
  /** Master switch for the fal media layer. Default false. */
  mediaProviderEnabled: boolean;
  /** Must also be true before any real HTTP request leaves the process. Default false. */
  realProviderCallsEnabled: boolean;
  imageEnabled: boolean;
  /** Image-conditioned generation via FLUX Kontext (fal-ai/flux-pro/v1/kontext). Default false. */
  imageCondEnabled: boolean;
  videoEnabled: boolean;
  ugcEnabled: boolean;
  /** Hard cap on provider submissions. 0 = none permitted. */
  maxRequests: number;
  /** Never write benchmark/provider output to the production R2 bucket/prefix. */
  useProductionStorage: boolean;
  credentialEnvVar: string;
  /** Whether the credential env var is present (value is never read/returned). */
  credentialPresent: boolean;
  endpoints: { image: string; imageCond: string; video: string; ugc: string };
  allowedEndpoints: readonly string[];
}

function readBool(env: NodeJS.ProcessEnv, key: string, fallback = false): boolean {
  const raw = env[key];
  if (raw === undefined) return fallback;
  return raw === 'true' || raw === '1';
}

function readInt(env: NodeJS.ProcessEnv, key: string, fallback: number): number {
  const raw = env[key];
  if (raw === undefined || raw.trim() === '') return fallback;
  const parsed = Number.parseInt(raw, 10);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : fallback;
}

export function readFalMediaConfig(env: NodeJS.ProcessEnv = process.env): FalMediaConfig {
  const credentialEnvVar = 'FAL_KEY';
  return {
    mediaProviderEnabled: readBool(env, 'FAL_MEDIA_PROVIDER_ENABLED', false),
    realProviderCallsEnabled: readBool(env, 'FAL_REAL_PROVIDER_CALLS_ENABLED', false),
    imageEnabled: readBool(env, 'FAL_IMAGE_ENABLED', false),
    imageCondEnabled: readBool(env, 'FAL_IMAGE_COND_ENABLED', false),
    videoEnabled: readBool(env, 'FAL_VIDEO_ENABLED', false),
    ugcEnabled: readBool(env, 'FAL_UGC_ENABLED', false),
    maxRequests: readInt(env, 'FAL_MAX_REQUESTS', 0),
    useProductionStorage: readBool(env, 'FAL_USE_PRODUCTION_STORAGE', false),
    credentialEnvVar,
    credentialPresent: Boolean(env[credentialEnvVar]),
    endpoints: { ...FAL_ENDPOINTS },
    allowedEndpoints: FAL_ALLOWED_ENDPOINTS,
  };
}

/** True only when every gate for a real call of `kind` is open. */
export function isFalCapabilityLive(config: FalMediaConfig, kind: 'image' | 'imageCond' | 'video' | 'ugc'): boolean {
  if (!config.mediaProviderEnabled) return false;
  if (!config.realProviderCallsEnabled) return false;
  if (config.maxRequests <= 0) return false;
  if (!config.credentialPresent) return false;
  if (kind === 'image' && !config.imageEnabled) return false;
  if (kind === 'imageCond' && !config.imageCondEnabled) return false;
  if (kind === 'video' && !config.videoEnabled) return false;
  if (kind === 'ugc' && !config.ugcEnabled) return false;
  return true;
}

/** Reject any endpoint that is not on the explicit allowlist. */
export function isFalEndpointAllowed(endpoint: string, config: FalMediaConfig = readFalMediaConfig()): boolean {
  return config.allowedEndpoints.includes(endpoint);
}

/** Human-readable reason a capability is disabled (for diagnostics, no secrets). */
export function falDisabledReason(config: FalMediaConfig, kind: 'image' | 'imageCond' | 'video' | 'ugc'): string {
  if (!config.mediaProviderEnabled) return 'FAL_MEDIA_PROVIDER_ENABLED is false';
  if (!config.realProviderCallsEnabled) return 'FAL_REAL_PROVIDER_CALLS_ENABLED is false';
  if (config.maxRequests <= 0) return 'FAL_MAX_REQUESTS is 0';
  if (!config.credentialPresent) return `${config.credentialEnvVar} is not set`;
  if (kind === 'image' && !config.imageEnabled) return 'FAL_IMAGE_ENABLED is false';
  if (kind === 'imageCond' && !config.imageCondEnabled) return 'FAL_IMAGE_COND_ENABLED is false';
  if (kind === 'video' && !config.videoEnabled) return 'FAL_VIDEO_ENABLED is false';
  if (kind === 'ugc' && !config.ugcEnabled) return 'FAL_UGC_ENABLED is false';
  return 'enabled';
}
