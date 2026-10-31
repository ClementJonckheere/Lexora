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

  it('erreur réseau : explication claire, sans avertissement à chaque lecture', async () => {
    vi.resetModules();
    const fresh = await import('./natural');
    invoke.mockResolvedValue({ data: null, error: { name: 'FunctionsFetchError', context: new TypeError('Failed to fetch') } });
    const err = await fresh.naturalVoiceUrl('give up', 'en-US').catch((e) => e);
    expect(err.silent).toBe(true);
    expect(err.message).toMatch(/injoignable/);
  });

  it("erreur d'Azure : son code est repris dans le message", async () => {
    vi.resetModules();
    const fresh = await import('./natural');
    const reply = (azure: number) => ({ data: null, error: { context: { status: 502, json: async () => ({ error: 'azure', status: azure }) } } });
    invoke.mockResolvedValueOnce(reply(400));
    expect((await fresh.naturalVoiceUrl('fail', 'en-US').catch((e) => e)).message).toMatch(/\(400\)/);
    invoke.mockResolvedValueOnce(reply(401));
    const err = await fresh.naturalVoiceUrl('fail again', 'en-US').catch((e) => e);
    expect(err.message).toMatch(/AZURE_SPEECH_KEY/);
    expect(err.silent).toBe(false);
  });
});
