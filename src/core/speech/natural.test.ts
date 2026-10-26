import { beforeEach, describe, expect, it, vi } from 'vitest';

const invoke = vi.fn();
vi.mock('../platform/auth', () => ({ authConfigured: true, supabase: () => ({ functions: { invoke } }) }));

const { naturalVoiceUrl, VoiceUnavailable } = await import('./natural');

describe('naturalVoiceUrl', () => {
  beforeEach(() => invoke.mockReset());

  it("demande le son une seule fois par expression et par langue", async () => {
    invoke.mockResolvedValue({ data: new Blob([new Uint8Array(2000)], { type: 'application/octet-stream' }), error: null });
    const a = await naturalVoiceUrl('to come up with', 'en-US');
    const b = await naturalVoiceUrl('to come  up with ', 'en-US');
    expect(a).toMatch(/^blob:/);
    expect(b).toBe(a);
    expect(invoke).toHaveBeenCalledTimes(1);
    expect(invoke).toHaveBeenCalledWith('speak', { body: { text: 'to come up with', lang: 'en-US' } });
  });

  it('signale une fonction non déployée sans avertissement, puis ne la réinterroge plus', async () => {
    invoke.mockResolvedValue({ data: null, error: { context: { status: 404 } } });
    const err = await naturalVoiceUrl('anxious', 'en-US').catch((e) => e);
    expect(err).toBeInstanceOf(VoiceUnavailable);
    expect(err.silent).toBe(true);
    await naturalVoiceUrl('tackle', 'en-US').catch(() => undefined);
    expect(invoke).toHaveBeenCalledTimes(1);
  });
});
