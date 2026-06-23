import assert from 'node:assert/strict';
import { normalizeReadingProgress, progressKey, splitSentences } from '../src/lib/storybookReading';

const sentences = splitSentences('Max goes to school. He pauses! Then he smiles');
assert.deepEqual(sentences, ['Max goes to school.', 'He pauses!', 'Then he smiles']);

assert.equal(progressKey('project-1'), 'raivstream_storybook_progress_project-1');

assert.deepEqual(
  normalizeReadingProgress({ pageIndex: 8, sentenceIndex: -3, completed: true }, 5),
  { pageIndex: 5, sentenceIndex: 0, completed: true },
);

assert.deepEqual(
  normalizeReadingProgress({ pageIndex: Number.NaN, sentenceIndex: Number.NaN, completed: false }, 5),
  { pageIndex: 0, sentenceIndex: 0, completed: false },
);

console.log('storybook reading regression checks passed');
