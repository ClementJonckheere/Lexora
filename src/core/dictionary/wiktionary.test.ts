import { describe, expect, it } from 'vitest';
import { audioScore, pageTitle, parseDefinitions, pickRecording, posInFrench, recordingsUrl, stripHtml } from './wiktionary';

describe('Wiktionnaire', () => {
  it('définitions dans la langue voulue, nature en français, HTML retiré', () => {
    const json = {
      en: [
        { partOfSpeech: 'Verb', language: 'English', definitions: [{ definition: 'To <a href="/wiki/attack">attack</a> a problem.' }, { definition: 'To grab and stop (a player).' }, { definition: 'x3' }] },
        { partOfSpeech: 'Noun', language: 'English', definitions: [{ definition: 'Equipment, gear.' }] },
      ],
      es: [{ partOfSpeech: 'Noun', definitions: [{ definition: 'autre langue' }] }],
    };
    expect(parseDefinitions(json, 'en')).toEqual([
      { pos: 'verbe', definitions: ['To attack a problem.', 'To grab and stop (a player).'] },
      { pos: 'nom', definitions: ['Equipment, gear.'] },
    ]);
    expect(parseDefinitions(json, 'de')).toEqual([]);
    expect(posInFrench('Phrasal verb')).toBe('verbe à particule');
    expect(stripHtml('a&nbsp;<i>b</i> &amp; c')).toBe('a b & c');
    expect(pageTitle('to take for granted', 'en')).toBe('take for granted');
    expect(pageTitle('tomar', 'es')).toBe('tomar');
  });

  it('prononciations : fichiers audio de la langue, accent américain préféré', () => {
    expect(audioScore('File:En-us-tackle.ogg', 'en')).toBeGreaterThan(audioScore('File:En-uk-tackle.ogg', 'en'));
    expect(audioScore('File:LL-Q1860 (eng)-Vealhurl-tackle.wav', 'en')).toBeGreaterThan(0);
    expect(audioScore('File:LL-Q1321 (spa)-Rodelar-hola.wav', 'es')).toBeGreaterThan(0);
    expect(audioScore('File:Es-hola.ogg', 'es')).toBeGreaterThan(0);
    expect(audioScore('File:Es-hola.ogg', 'en')).toBe(0);
    expect(audioScore('File:Tackle diagram.png', 'en')).toBe(0);
    const json = {
      query: {
        pages: {
          '-1': { title: 'File:En-uk-tackle.ogg', imageinfo: [{ url: 'https://upload.wikimedia.org/uk.ogg' }] },
          '-2': { title: 'File:En-us-tackle.ogg', imageinfo: [{ url: 'https://upload.wikimedia.org/us.ogg' }] },
          '-3': { title: 'File:Rugby tackle.jpg', imageinfo: [{ url: 'https://upload.wikimedia.org/x.jpg' }] },
        },
      },
    };
    expect(pickRecording(json, 'en')).toBe('https://upload.wikimedia.org/us.ogg');
    expect(pickRecording({}, 'en')).toBeNull();
    expect(new URL(recordingsUrl('tackle')).searchParams.get('generator')).toBe('images');
  });
});
