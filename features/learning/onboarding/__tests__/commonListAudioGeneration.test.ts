import { describe, expect, it, vi } from 'vitest';
import { generateCommonListAudio } from '../commonListAudioGeneration';
import type { WordList } from '@/features/lists/types';

function jsonResponse(data: unknown, init: Partial<Response> = {}) {
  return Promise.resolve({
    ok: init.ok ?? true,
    status: init.status ?? 200,
    json: async () => data,
  } as Response);
}

describe('generateCommonListAudio', () => {
  it('regenerates rows marked ready when they have no playable media URL', async () => {
    const generatedBodies: unknown[] = [];
    vi.stubGlobal(
      'fetch',
      vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
        const url = String(input);
        if (url === '/api/lists/list-1') {
          return jsonResponse({
            items: [
              {
                id: 'target-missing-url',
                listId: 'list-1',
                categoryId: null,
                position: 0,
                textKnown: 'hello',
                textTarget: 'xin chao',
                translationStatus: 'translated',
                knownAudioStatus: 'ready',
                knownAudioUrl: '/api/audio/known-ok',
                knownAudioArweaveUrls: [],
                audioStatus: 'ready',
                audioUrl: null,
                audioArweaveUrls: [],
                notes: null,
              },
              {
                id: 'target-ready-url',
                listId: 'list-1',
                categoryId: null,
                position: 1,
                textKnown: 'thanks',
                textTarget: 'cam on',
                translationStatus: 'translated',
                knownAudioStatus: 'ready',
                knownAudioUrl: '/api/audio/known-ok-2',
                knownAudioArweaveUrls: [],
                audioStatus: 'ready',
                audioUrl: '/api/audio/target-ok',
                audioArweaveUrls: [],
                notes: null,
              },
            ],
          });
        }
        if (url === '/api/google-usage') {
          return jsonResponse({
            account: [{ scope: 'tts', account_limit: 10_000, used_units: 0 }],
          });
        }
        if (url === '/api/languages') {
          return jsonResponse({
            languages: [
              { code: 'vi', ttsVoices: [] },
              { code: 'en', ttsVoices: [] },
            ],
          });
        }
        if (url === '/api/audio/generate/batch') {
          generatedBodies.push(JSON.parse(String(init?.body ?? '{}')));
          return jsonResponse({
            results: [
              {
                id: 'target-missing-url',
                audio_url: '/api/audio/new-target',
                status: 'ok',
              },
            ],
            generated_count: 1,
          });
        }
        return Promise.reject(new Error(`Unexpected fetch: ${url}`));
      }),
    );

    const summary = await generateCommonListAudio({
      list: {
        id: 'list-1',
        ownerId: null,
        name: 'English Vietnamese',
        description: null,
        languageFrom: 'en',
        languageTo: 'vi',
        isPublic: true,
      } satisfies WordList,
      setGenerationStatus: vi.fn(),
    });

    expect(summary.generatedCount).toBe(1);
    expect(generatedBodies).toHaveLength(1);
    expect(generatedBodies[0]).toMatchObject({
      audio_field: 'target',
      items: [{ id: 'target-missing-url' }],
    });
  });
});
