/**
 * Placeholder stubs for AI video generation models whose APIs are not yet available.
 *
 * Models:
 *   - KLING      (Kuaishou)   — set KLING_ACCESS_KEY + KLING_SECRET_KEY
 *   - HIGGSFIELD (Higgsfield) — set HIGGSFIELD_API_KEY
 *
 * Note: LTX2 and Wan 2.5 are handled via RunPod in ./ltx2.ts and ./wan25.ts.
 */

export interface PlaceholderInput {
  prompt:         string;
  negativePrompt?: string;
  duration?:      number;
  aspectRatio?:   string;
  seedImageUrl?:  string;
}

function notConfigured(model: string, envKey: string): never {
  throw new Error(
    `${model} is coming soon — integration will be live once ${envKey} is added to .env`
  );
}

// ── Kling (Kuaishou) ─────────────────────────────────────────────────────────
// Docs:  https://klingai.kuaishou.com/api-reference
// Auth:  KLING_ACCESS_KEY + KLING_SECRET_KEY — used to sign a short-lived JWT
//        sent as Authorization: Bearer <signed-jwt>
// Endpoint: POST https://api.klingai.com/v1/videos/text2video
//
// To activate:
//   1. Apply for API access at https://klingai.kuaishou.com
//   2. Add KLING_ACCESS_KEY and KLING_SECRET_KEY to .env
//   3. Implement JWT signing (HS256, payload: {iss, exp, nbf}) and replace the stub below
export async function submitKling(_input: PlaceholderInput): Promise<string> {
  const accessKey = process.env.KLING_ACCESS_KEY;
  if (!accessKey) notConfigured('Kling', 'KLING_ACCESS_KEY');

  // TODO: uncomment and complete when credentials are available
  // import jwt from 'jsonwebtoken';
  // const token = jwt.sign(
  //   { iss: accessKey, exp: Math.floor(Date.now() / 1000) + 1800, nbf: Math.floor(Date.now() / 1000) - 5 },
  //   process.env.KLING_SECRET_KEY!,
  //   { algorithm: 'HS256', header: { alg: 'HS256', typ: 'JWT' } }
  // );
  // const res = await fetch('https://api.klingai.com/v1/videos/text2video', {
  //   method: 'POST',
  //   headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
  //   body: JSON.stringify({
  //     model: 'kling-v1',
  //     prompt: _input.prompt,
  //     negative_prompt: _input.negativePrompt ?? '',
  //     cfg_scale: 0.5,
  //     mode: 'std',
  //     duration: String(_input.duration ?? 5),
  //   }),
  // });
  // if (!res.ok) throw new Error(`Kling API ${res.status}: ${await res.text()}`);
  // const data = await res.json();
  // return data.data.task_id as string;
  notConfigured('Kling', 'KLING_ACCESS_KEY');
}

export async function getKlingStatus(
  _jobId: string
): Promise<{ status: string; outputUrl?: string }> {
  // TODO: GET https://api.klingai.com/v1/videos/text2video/{task_id}
  // Map data.data.task_status → 'queued' | 'generating' | 'completed' | 'failed'
  // outputUrl = data.data.task_result.videos[0].url
  notConfigured('Kling', 'KLING_ACCESS_KEY');
}

// ── Higgsfield AI ─────────────────────────────────────────────────────────────
// Docs:     https://higgsfield.ai/api (invite-only)
// Auth:     Bearer token in Authorization header
// Endpoint: POST https://higgsfield.ai/api/v1/generate
//
// To activate:
//   1. Request API access at https://higgsfield.ai
//   2. Add HIGGSFIELD_API_KEY to .env
//   3. Uncomment the implementation below
export async function submitHighgsfield(_input: PlaceholderInput): Promise<string> {
  const key = process.env.HIGGSFIELD_API_KEY;
  if (!key) notConfigured('Higgsfield', 'HIGGSFIELD_API_KEY');

  // TODO: uncomment when credentials are available
  // const res = await fetch('https://higgsfield.ai/api/v1/generate', {
  //   method: 'POST',
  //   headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
  //   body: JSON.stringify({
  //     prompt:          _input.prompt,
  //     negative_prompt: _input.negativePrompt ?? '',
  //     duration:        _input.duration ?? 5,
  //     aspect_ratio:    _input.aspectRatio ?? '9:16',
  //     ...(input.seedImageUrl ? { image_url: _input.seedImageUrl } : {}),
  //   }),
  // });
  // if (!res.ok) throw new Error(`Higgsfield API ${res.status}: ${await res.text()}`);
  // const data = await res.json();
  // return data.job_id as string;
  notConfigured('Higgsfield', 'HIGGSFIELD_API_KEY');
}

export async function getHiggsfieldStatus(
  _jobId: string
): Promise<{ status: string; outputUrl?: string }> {
  // TODO: GET https://higgsfield.ai/api/v1/status/{jobId}
  notConfigured('Higgsfield', 'HIGGSFIELD_API_KEY');
}
