import { describe, expect, it } from 'vitest';
import { encodeWav, parseAssessment, wordLevel } from './pronunciation';

describe('notation de la prononciation (Azure)', () => {
  const nested = {
    RecognitionStatus: 'Success',
    NBest: [
      {
        Display: 'I will be back soon.',
        PronunciationAssessment: { AccuracyScore: 86.4, FluencyScore: 92, CompletenessScore: 100, PronScore: 89.6 },
        Words: [
          { Word: 'i', PronunciationAssessment: { AccuracyScore: 98, ErrorType: 'None' } },
          { Word: 'will', PronunciationAssessment: { AccuracyScore: 55, ErrorType: 'Mispronunciation' } },
          { Word: 'soon', PronunciationAssessment: { AccuracyScore: 0, ErrorType: 'Omission' } },
        ],
      },
    ],
  };

  it('notes globales et par mot (notes imbriquées ou à plat)', () => {
    const s = parseAssessment(nested)!;
    expect([s.score, s.accuracy, s.fluency, s.completeness, s.recognized]).toEqual([90, 86, 92, 100, 'I will be back soon.']);
    expect(s.words.map(wordLevel)).toEqual(['good', 'poor', 'missing']);
    const flat = { RecognitionStatus: 'Success', NBest: [{ Lexical: 'hello', AccuracyScore: 70, FluencyScore: 60, CompletenessScore: 100, PronScore: 72, Words: [{ Word: 'hello', AccuracyScore: 70, ErrorType: 'None' }] }] };
    expect(parseAssessment(flat)).toMatchObject({ score: 72, words: [{ word: 'hello', accuracy: 70 }] });
    expect(wordLevel({ word: 'x', accuracy: 70, error: 'None' })).toBe('fair');
  });

  it('rien de reconnu : pas de note', () => {
    expect(parseAssessment({ RecognitionStatus: 'NoMatch' })).toBeNull();
    expect(parseAssessment(null)).toBeNull();
  });

  it('WAV PCM 16 bits mono : en-tête et échantillons bornés', () => {
    const wav = new DataView(encodeWav(new Float32Array([0, 1, -1, 2]), 16000));
    const ascii = (at: number) => String.fromCharCode(...[0, 1, 2, 3].map((i) => wav.getUint8(at + i)));
    expect([ascii(0), ascii(8), ascii(36)]).toEqual(['RIFF', 'WAVE', 'data']);
    expect([wav.getUint32(24, true), wav.getUint16(22, true), wav.getUint32(40, true)]).toEqual([16000, 1, 8]);
    expect([wav.getInt16(44, true), wav.getInt16(46, true), wav.getInt16(50, true)]).toEqual([0, 32767, 32767]);
  });
});
