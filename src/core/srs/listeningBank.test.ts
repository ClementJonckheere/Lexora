import { existsSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { isEvaluationSentence } from '../learn/evaluationSplit';
import { compatibleLicense, type ListeningBankFile } from './listening';

/**
 * Contrôles de la banque d'écoute livrée (générée par .github/workflows/listening.yml, lancés avant chaque
 * enregistrement de la banque) : licences compatibles, auteurs connus, traduction présente, séparation
 * entraînement / évaluation. Ignorés tant que la banque n'a pas été générée.
 */
const dir = 'public/listening/en';
const read = (f: string) => JSON.parse(readFileSync(`${dir}/${f}`, 'utf8')) as ListeningBankFile;

describe.skipIf(!existsSync(`${dir}/sentences.json`))('banque d’écoute livrée', () => {
  it('phrases d’entraînement seulement, enregistrement sous licence compatible, auteur et traduction présents', () => {
    const bank = read('sentences.json');
    expect(bank.items.length).toBeGreaterThan(100);
    const bad: string[] = [];
    for (const [id, text, fr, audioId, author, license] of bank.items) {
      if (isEvaluationSentence(id)) bad.push(`${id} : phrase d'évaluation`);
      if (!compatibleLicense(bank.licenses[license] ?? '')) bad.push(`${id} : licence ${bank.licenses[license]}`);
      if (!bank.authors[author]) bad.push(`${id} : auteur absent`);
      if (!text.trim() || !fr.trim()) bad.push(`${id} : texte ou traduction vide`);
      if (!(audioId >= 0)) bad.push(`${id} : enregistrement invalide`);
    }
    expect(bad.slice(0, 10)).toEqual([]);
  });

  it('banque d’évaluation : phrases réservées seulement, aucune en commun avec l’entraînement', () => {
    const training = new Set(read('sentences.json').items.map((x) => x[0]));
    const evaluation = read('evaluation.json').items.map((x) => x[0]);
    expect(evaluation.every((id) => isEvaluationSentence(id) && !training.has(id))).toBe(true);
  });
});
