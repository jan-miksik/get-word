import type { LandingDemoLexeme } from '@/lib/landing-demo-types';

export type DemoWord = {
  front: LandingDemoLexeme;
  back: LandingDemoLexeme;
};

export type DemoAudioSource = {
  text: string;
  lang: string;
  url: string;
  source: 'bundled-static' | 'remote-api' | 'remote-arweave';
  generatedBy: string;
  provider?: string | null;
  voice?: string | null;
  contentHash?: string | null;
  storageType?: string | null;
  storageProvider?: string | null;
  storageRef?: string | null;
  sizeBytes?: number | null;
  createdAt?: string | null;
};

export type DemoSet = {
  fromLang: string;
  toLang: string;
  requestedToLang: string;
  pairLabel: string;
  words: DemoWord[];
};
