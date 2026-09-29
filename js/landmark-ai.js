import { pipeline } from 'https://cdn.jsdelivr.net/npm/@huggingface/transformers@4.3.0';

const MODEL_ID = 'Xenova/clip-vit-base-patch32';

// Multiple visual descriptions are grouped for each registered landmark.
// This is more robust than forcing the photo to match one single phrase.
const LANDMARK_PROMPTS = {
  petra: [
    'the Treasury at Petra Jordan, a monumental rose-red sandstone facade carved into a cliff',
    'Petra Jordan with tall rock-cut Nabataean columns and rose sandstone walls',
    'Al Khazneh Petra viewed through a sandstone canyon'
  ],
  'wadi-rum': [
    'Wadi Rum Jordan with red desert sand and large sandstone mountains',
    'Wadi Rum desert valley with isolated cliffs, arches and orange sand',
    'Jordan desert landscape in Wadi Rum with wide open sand valleys and rocky mountains'
  ],
  'dead-sea': [
    'the Dead Sea Jordan with calm blue salt water, pale shoreline and arid mountains',
    'Dead Sea salt lake shoreline in Jordan with mineral salt edges and desert hills',
    'people-free landscape of the Dead Sea in Jordan, blue water and dry mountains'
  ]
};

// Negative prompts stop an unrelated photo from being automatically forced
// into Petra, Wadi Rum, or the Dead Sea.
const NEGATIVE_PROMPTS = [
  'a person taking a selfie indoors',
  'food on a table in a restaurant',
  'a random everyday object',
  'a normal city street with buildings and cars',
  'a green forest or garden'
];

const promptRows = [
  ...Object.entries(LANDMARK_PROMPTS).flatMap(([key, prompts]) => prompts.map(label => ({ key, label, negative: false }))),
  ...NEGATIVE_PROMPTS.map(label => ({ key: 'unknown', label, negative: true }))
];

let classifierPromise = null;

function getClassifier(onStatus) {
  if (!classifierPromise) {
    onStatus?.('Downloading the landmark recognition model…');
    classifierPromise = pipeline('zero-shot-image-classification', MODEL_ID, {
      progress_callback: (progress) => {
        if (!onStatus || !progress) return;
        const pct = Number.isFinite(progress.progress) ? Math.round(progress.progress) : null;
        if (progress.status === 'progress' && pct !== null) onStatus(`Loading recognition model… ${pct}%`);
        else if (progress.status === 'ready') onStatus('Recognition model ready. Analyzing photo…');
      }
    });
  }
  return classifierPromise;
}

function groupScores(output) {
  const scores = { petra: 0, 'wadi-rum': 0, 'dead-sea': 0, unknown: 0 };
  for (const item of output || []) {
    const row = promptRows.find(x => x.label === item.label);
    if (row) scores[row.key] += Number(item.score) || 0;
  }
  return scores;
}

async function recognize(imageBlob, onStatus) {
  if (!(imageBlob instanceof Blob)) throw new Error('No captured photo was provided.');
  const classifier = await getClassifier(onStatus);
  onStatus?.('Comparing the photo with registered landmarks…');

  const output = await classifier(imageBlob, promptRows.map(x => x.label));
  if (!Array.isArray(output) || !output.length) throw new Error('The AI model returned no landmark match.');

  const scores = groupScores(output);
  const ranked = ['petra', 'wadi-rum', 'dead-sea']
    .map(key => ({ key, score: scores[key] }))
    .sort((a, b) => b.score - a.score);

  const best = ranked[0];
  const second = ranked[1];
  const landmarkTotal = ranked.reduce((sum, x) => sum + x.score, 0) || 1;
  const normalized = ranked.map(x => ({ key: x.key, score: x.score / landmarkTotal }));
  const normalizedBest = normalized.find(x => x.key === best.key)?.score || 0;

  // Two checks are used: the top landmark must beat other registered landmarks
  // and the photo must not look more like an unrelated scene.
  const margin = best.score - second.score;
  const beatsUnknown = best.score >= scores.unknown * 0.78;
  const accepted = normalizedBest >= 0.43 && margin >= 0.035 && beatsUnknown;

  return {
    key: best.key,
    score: normalizedBest,
    accepted,
    rawUnknownScore: scores.unknown,
    matches: normalized
  };
}

window.TourismLandmarkAI = { recognize };
