/**
 * Reconciliation Service Types
 * 
 * Type definitions for the reconciliation service that scrapes Sunbiz
 * and produces structured diffs against extracted data.
 * 
 * Per CONSTITUTION.md: All inputs/outputs validated at runtime
 */

// ============================================================================
// Sunbiz Entity Data Types
// ============================================================================

/**
 * Address structure matching Sunbiz format
 */
export interface SunbizAddress {
  streetAddress: string;
  city: string;
  state: string;
  zipCode: string;
}

/**
 * Officer/Director information from Sunbiz
 */
export interface SunbizOfficer {
  title: string;
  name: string;
  address: SunbizAddress;
}

/**
 * Entity data scraped from Sunbiz
 */
export interface SunbizEntityData {
  documentNumber: string;
  feiEinNumber?: string;
  entityName: string;
  entityType: string;
  filingDate?: string;
  status: string;
  lastEvent?: string;
  lastEventDate?: string;
  principalAddress: SunbizAddress;
  mailingAddress: SunbizAddress;
  registeredAgent: {
    name: string;
    address: SunbizAddress;
  };
  officers: SunbizOfficer[];
  annualReportsDue?: string[];
}

// ============================================================================
// Search Types
// ============================================================================

/**
 * Search parameters for finding an entity on Sunbiz
 */
export interface SunbizSearchParams {
  /** Document number (e.g., P12345678) */
  documentNumber?: string;
  /** Entity name for name-based search */
  entityName?: string;
  /** FEI/EIN number */
  feiEinNumber?: string;
}

/**
 * Search result from Sunbiz
 */
export interface SunbizSearchResult {
  found: boolean;
  documentNumber?: string;
  entityName?: string;
  status?: string;
  detailUrl?: string;
}

// ============================================================================
// Scraper Types
// ============================================================================

/**
 * Scraper configuration
 */
export interface ScraperConfig {
  /** Base URL for Sunbiz search (defaults to production) */
  baseUrl?: string;
  /** Request timeout in milliseconds */
  timeout?: number;
  /** Number of retry attempts */
  maxRetries?: number;
  /** Delay between retries in milliseconds */
  retryDelayMs?: number;
  /** Whether to run in headless mode */
  headless?: boolean;
  /** User agent string */
  userAgent?: string;
}

/**
 * Error types the scraper can encounter
 */
export type ScraperErrorType =
  | 'TIMEOUT'
  | 'NAVIGATION_FAILED'
  | 'SITE_UNAVAILABLE'
  | 'ENTITY_NOT_FOUND'
  | 'CAPTCHA_DETECTED'
  | 'SELECTOR_FAILED'
  | 'PARSE_ERROR'
  | 'RATE_LIMITED'
  | 'UNKNOWN_ERROR';

/**
 * Error from scraper operations
 */
export interface ScraperError {
  type: ScraperErrorType;
  message: string;
  details?: Record<string, unknown>;
  retryable: boolean;
}

/**
 * Result of a scrape operation
 */
export interface ScrapeResult<T> {
  success: boolean;
  data?: T;
  error?: ScraperError;
  /** Number of attempts made */
  attempts: number;
  /** Total time taken in milliseconds */
  durationMs: number;
  /** Timestamp of the scrape */
  scrapedAt: string;
}

// ============================================================================
// Diff Types
// ============================================================================

/**
 * A single field difference
 */
export interface FieldDiff {
  /** Field path (e.g., "principalAddress.city") */
  field: string;
  /** Human-readable field label */
  fieldLabel: string;
  /** Value currently on file (from Sunbiz) */
  current_value: string | null;
  /** Value from extraction */
  extracted_value: string | null;
  /** Whether the values match */
  match: boolean;
  /** Confidence in the match determination (0-1) */
  confidence?: number;
  /** Notes about the comparison */
  notes?: string;
}

/**
 * Complete diff result
 */
export interface DiffResult {
  /** Unique ID for this diff */
  id: string;
  /** Company ID this diff relates to */
  companyId: string;
  /** Document number on Sunbiz */
  documentNumber: string;
  /** Timestamp of diff generation */
  createdAt: string;
  /** Summary statistics */
  summary: {
    totalFields: number;
    matchingFields: number;
    mismatchedFields: number;
    missingFields: number;
    matchPercentage: number;
  };
  /** Individual field differences */
  fields: FieldDiff[];
  /** Source data from Sunbiz */
  sunbizData: SunbizEntityData;
  /** Source data from extraction */
  extractedData: Partial<SunbizEntityData>;
}

// ============================================================================
// Reconciliation Request/Response Types
// ============================================================================

/**
 * Request to reconcile extracted data against Sunbiz
 */
export interface ReconcileRequest {
  /** Company ID in our system */
  companyId: string;
  /** Document number for Sunbiz lookup */
  documentNumber: string;
  /** Extracted data to compare */
  extractedData: Partial<SunbizEntityData>;
  /** Optional: Entity name for fallback search */
  entityName?: string;
  /** Optional: FEI/EIN for fallback search */
  feiEinNumber?: string;
}

/**
 * Response from reconciliation
 */
export interface ReconcileResponse {
  status: 'success' | 'error';
  data?: DiffResult;
  error?: {
    code: string;
    message: string;
    details?: Record<string, unknown>;
  };
}

// ============================================================================
// Database Types
// ============================================================================

/**
 * Reconciliation record stored in database
 */
export interface ReconciliationRecord {
  id: string;
  company_id: string;
  document_number: string;
  sunbiz_data: SunbizEntityData;
  extracted_data: Partial<SunbizEntityData>;
  diff_result: FieldDiff[];
  match_percentage: number;
  status: 'completed' | 'failed' | 'pending';
  error_message?: string;
  scrape_attempts: number;
  scrape_duration_ms: number;
  created_at: string;
  updated_at: string;
}

// ============================================================================
// Selector Types (from selectors.json)
// ============================================================================

/**
 * Selector configuration for a single element
 */
export interface SelectorConfig {
  primary: string;
  fallback: string;
  labelMatch?: string;
}

/**
 * Structure of selectors.json for entity search/detail pages
 */
export interface EntitySelectors {
  entitySearch: {
    url: string;
    searchInput: SelectorConfig;
    searchButton: SelectorConfig;
    resultRow: SelectorConfig;
    resultName: SelectorConfig;
    resultDocNumber: SelectorConfig;
    resultStatus: SelectorConfig;
    resultDetailLink: SelectorConfig;
    noResultsIndicator: SelectorConfig;
  };
  entityDetail: {
    documentNumber: SelectorConfig;
    feiEinNumber: SelectorConfig;
    entityName: SelectorConfig;
    entityType: SelectorConfig;
    filingDate: SelectorConfig;
    status: SelectorConfig;
    lastEvent: SelectorConfig;
    lastEventDate: SelectorConfig;
    principalAddress: {
      container: SelectorConfig;
      streetAddress: SelectorConfig;
      city: SelectorConfig;
      state: SelectorConfig;
      zipCode: SelectorConfig;
    };
    mailingAddress: {
      container: SelectorConfig;
      streetAddress: SelectorConfig;
      city: SelectorConfig;
      state: SelectorConfig;
      zipCode: SelectorConfig;
    };
    registeredAgent: {
      container: SelectorConfig;
      name: SelectorConfig;
      streetAddress: SelectorConfig;
      city: SelectorConfig;
      state: SelectorConfig;
      zipCode: SelectorConfig;
    };
    officers: {
      container: SelectorConfig;
      row: SelectorConfig;
      title: SelectorConfig;
      name: SelectorConfig;
      address: SelectorConfig;
    };
    annualReports: {
      container: SelectorConfig;
      row: SelectorConfig;
      year: SelectorConfig;
      date: SelectorConfig;
    };
  };
  captchaDetection: {
    indicators: string[];
  };
  errorIndicators: {
    validationErrors: string[];
    systemErrors: string[];
  };
}
