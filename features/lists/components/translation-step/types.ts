import type {
  CompletedTranslationRow,
  ConfirmResult,
  GoogleUsageResponse,
  WordCategory,
  WordList,
} from '@/features/lists/types';
import type { PolishFixCode, PolishWarningCode } from '@/lib/formatting-polish';

export type PendingTranslationItem = NonNullable<ConfirmResult['pending_items']>[number];
export type TranslationRow = CompletedTranslationRow;
export type AcceptedSide = 'known' | 'target';
export type TranslationProvider = 'google' | 'openrouter';
export type OpenRouterUiState =
  | 'not_connected'
  | 'connecting'
  | 'connected'
  | 'failed_retryable';

export type PolishField = 'known' | 'target';

export type PolishChange = {
  key: string;
  rowId: string;
  field: PolishField;
  before: string;
  after: string;
  fixCodes: PolishFixCode[];
};

type PolishWarningRow = {
  key: string;
  rowId: string;
  field: PolishField;
  text: string;
  code: PolishWarningCode;
};

export type PolishScan = {
  changes: PolishChange[];
  warnings: PolishWarningRow[];
};

export type BulkAcceptedEntry = {
  key: string;
  rowId: string;
  side: AcceptedSide;
  value: string;
};

export type BulkAcceptedScan = {
  entries: BulkAcceptedEntry[];
  skippedCount: number;
  failedCount: number;
  failureMessage: string | null;
};

export interface TranslationStepProps {
  list: WordList;
  pendingItems: PendingTranslationItem[];
  newItemIds?: Set<string>;
  inputLanguage: 'known' | 'target';
  heading?: string;
  googleUsage?: GoogleUsageResponse | null;
  onInputLanguageChange?: (language: 'known' | 'target') => void;
  onComplete: (rows: CompletedTranslationRow[]) => Promise<void>;
  onSkip: () => Promise<void>;
  onUsageRefresh?: () => Promise<void>;
  onBack?: () => void;
  onRemoveItem?: (itemId: string) => void;
  categories?: WordCategory[];
  onAssignCategory?: (itemId: string, categoryId: string) => Promise<void>;
  onGenerationActiveChange?: (active: boolean) => void;
}

export type DuplicateGroup = {
  key: string;
  word: string;
  rows: TranslationRow[];
};
