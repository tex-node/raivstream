/**
 * Raivstream 5.0 — IntentService.
 *
 * Turns raw creator input into a CreativeInterpretation, then (via the project
 * service) materializes it as a CreativeProject + CreativeBrief. Gated by
 * `RAIVSTREAM_5_INTENT_ENABLED`; throws CREATIVE_DISABLED otherwise.
 */

import { isCreativeIntentEnabled } from '../featureFlags';
import { CreativeError } from '../shared/errors';
import type { CreativeInterpretation, CreativeProjectType } from '../shared/types';
import { interpret } from './interpreter';

export class IntentService {
  interpret(text: string, projectType?: CreativeProjectType): CreativeInterpretation {
    if (!isCreativeIntentEnabled()) {
      throw new CreativeError('CREATIVE_DISABLED', 'Raivstream 5.0 intent is not enabled.');
    }
    return interpret(text, projectType);
  }
}

export const intentService = new IntentService();