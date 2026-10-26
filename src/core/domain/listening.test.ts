import { describe, expect, it } from 'vitest';
import { checkListening } from './answer';

describe('checkListening', () => {
  it("accepte l'expression entendue", () => {
    expect(checkListening('to give up', 'abandonner', 'give up')).toBe('exact');
    expect(checkListening('tackle', 'aborder', 'tackled')).toBe('close');
  });
  it('accepte le sens en français', () => {
    expect(checkListening('to give up', 'abandonner / renoncer', 'renoncer')).toBe('meaning');
    expect(checkListening('anxious', 'anxieux', 'Anxieux')).toBe('meaning');
  });
  it('refuse le reste', () => {
    expect(checkListening('to give up', 'abandonner', 'give in')).toBe('wrong');
    expect(checkListening('to give up', '', 'abandonner')).toBe('wrong');
  });
});
