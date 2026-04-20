/**
 * Playwright Automation Module
 * 
 * Handles browser automation for Sunbiz annual report submission.
 * 
 * Critical Requirements (per CONSTITUTION.md):
 * - NEVER automate CAPTCHA - must pause and notify user
 * - NEVER automate payment - must pause and notify user
 * - Use selectors from config file, never hardcode
 * - Retry up to 3 times with exponential backoff
 */

import type { Page, Browser, BrowserContext } from 'playwright';
import {
  AutomationContext,
  AutomationResult,
  AutomationStep,
  SelectorEntry,
  Company,
  Address,
  Officer,
} from './types';
import { IAuditLogger } from './audit-logger';

// ============================================================================
// Playwright Automation Interface
// ============================================================================

export interface IPlaywrightAutomation {
  /**
   * Execute the full submission workflow
   * Returns when CAPTCHA/payment detected or submission complete
   */
  executeSubmission(context: AutomationContext): Promise<AutomationResult>;
  
  /**
   * Resume automation after user completes CAPTCHA/payment
   */
  resumeAfterUserAction(context: AutomationContext): Promise<AutomationResult>;
  
  /**
   * Cleanup browser resources
   */
  cleanup(): Promise<void>;
}

// ============================================================================
// Playwright Automation Implementation
// ============================================================================

export class PlaywrightAutomation implements IPlaywrightAutomation {
  private browser: Browser | null = null;
  private context: BrowserContext | null = null;
  private page: Page | null = null;
  
  private readonly NAVIGATION_TIMEOUT = 30000; // 30 seconds
  private readonly ACTION_TIMEOUT = 10000; // 10 seconds

  constructor(
    private readonly auditLogger: IAuditLogger,
    private readonly browserLauncher: BrowserLauncher
  ) {}

  async executeSubmission(ctx: AutomationContext): Promise<AutomationResult> {
    try {
      // Initialize browser
      await this.initializeBrowser();
      
      if (!this.page) {
        throw new Error('Failed to initialize browser page');
      }

      // Step 1: Navigate to Sunbiz filing start
      const navResult = await this.navigateToFilingStart(ctx);
      if (!navResult.success) return navResult;

      // Step 2: Enter document number
      const docResult = await this.enterDocumentNumber(ctx);
      if (!docResult.success) return docResult;

      // Step 3: Wait for and populate entity form
      const formResult = await this.populateEntityForm(ctx);
      if (!formResult.success) return formResult;

      // Step 4: Proceed to review page
      const reviewResult = await this.proceedToReview(ctx);
      if (!reviewResult.success) return reviewResult;

      // Step 5: Proceed to signature page
      const sigResult = await this.proceedToSignature(ctx);
      if (!sigResult.success) return sigResult;

      // Step 6: Check for CAPTCHA - MUST PAUSE if detected
      const captchaResult = await this.checkForCaptcha(ctx);
      if (captchaResult.pauseRequired === 'captcha') {
        return captchaResult;
      }

      // Step 7: Check for payment page - MUST PAUSE if detected
      const paymentResult = await this.checkForPayment(ctx);
      if (paymentResult.pauseRequired === 'payment') {
        return paymentResult;
      }

      // Step 8: Capture confirmation
      return await this.captureConfirmation(ctx);
      
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      return {
        success: false,
        step: 'navigate_to_start',
        error: {
          code: 'AUTOMATION_ERROR',
          message: errorMessage,
          recoverable: this.isRecoverableError(error),
        },
      };
    }
  }

  async resumeAfterUserAction(ctx: AutomationContext): Promise<AutomationResult> {
    if (!this.page) {
      return {
        success: false,
        step: 'capture_confirmation',
        error: {
          code: 'NO_ACTIVE_SESSION',
          message: 'No active browser session to resume',
          recoverable: false,
        },
      };
    }

    // After user completes CAPTCHA/payment, capture the confirmation
    return await this.captureConfirmation(ctx);
  }

  async cleanup(): Promise<void> {
    if (this.page) {
      await this.page.close().catch(() => {});
      this.page = null;
    }
    if (this.context) {
      await this.context.close().catch(() => {});
      this.context = null;
    }
    if (this.browser) {
      await this.browser.close().catch(() => {});
      this.browser = null;
    }
  }

  // ============================================================================
  // Private Implementation Methods
  // ============================================================================

  private async initializeBrowser(): Promise<void> {
    this.browser = await this.browserLauncher.launch({
      headless: false, // User needs to see for CAPTCHA/payment
    });
    this.context = await this.browser.newContext({
      viewport: { width: 1280, height: 800 },
    });
    this.page = await this.context.newPage();
    
    // Set reasonable timeouts
    this.page.setDefaultNavigationTimeout(this.NAVIGATION_TIMEOUT);
    this.page.setDefaultTimeout(this.ACTION_TIMEOUT);
  }

  private async navigateToFilingStart(ctx: AutomationContext): Promise<AutomationResult> {
    const step: AutomationStep = 'navigate_to_start';
    const url = ctx.selectors.filingStart.url as unknown as string;
    
    try {
      await this.page!.goto(url, { waitUntil: 'networkidle' });
      
      await this.auditLogger.log({
        user_id: 'system',
        action_type: 'form_navigation_started',
        entity_type: 'submission',
        entity_id: ctx.submission.id,
        before_state: undefined,
        after_state: { url, step },
      });
      
      return { success: true, step };
    } catch (error) {
      return this.createErrorResult(step, error);
    }
  }

  private async enterDocumentNumber(ctx: AutomationContext): Promise<AutomationResult> {
    const step: AutomationStep = 'enter_document_number';
    const selector = ctx.selectors.filingStart.documentNumberInput as SelectorEntry;
    
    try {
      const element = await this.findElement(selector);
      await element.fill(ctx.company.document_number);
      
      // Click continue button
      const continueBtn = ctx.selectors.filingStart.continueButton as SelectorEntry;
      const btn = await this.findElement(continueBtn);
      await btn.click();
      
      // Wait for form to load
      await this.page!.waitForLoadState('networkidle');
      
      await this.auditLogger.log({
        user_id: 'system',
        action_type: 'field_populated',
        entity_type: 'submission',
        entity_id: ctx.submission.id,
        before_state: undefined,
        after_state: { field: 'document_number', step },
      });
      
      return { success: true, step };
    } catch (error) {
      return this.createErrorResult(step, error);
    }
  }

  private async populateEntityForm(ctx: AutomationContext): Promise<AutomationResult> {
    const step: AutomationStep = 'load_entity_form';
    
    try {
      // Populate principal address
      await this.populateAddress(
        ctx.selectors.entityForm.principalAddress as Record<string, SelectorEntry>,
        ctx.company.principal_address
      );
      
      // Populate mailing address
      await this.populateAddress(
        ctx.selectors.entityForm.mailingAddress as Record<string, SelectorEntry>,
        ctx.company.mailing_address
      );
      
      // Populate registered agent
      await this.populateRegisteredAgent(ctx);
      
      // Populate officers
      await this.populateOfficers(ctx);
      
      await this.auditLogger.log({
        user_id: 'system',
        action_type: 'field_populated',
        entity_type: 'submission',
        entity_id: ctx.submission.id,
        before_state: undefined,
        after_state: { fields: 'all_entity_fields', step },
      });
      
      return { success: true, step };
    } catch (error) {
      return this.createErrorResult(step, error);
    }
  }

  private async populateAddress(
    selectors: Record<string, SelectorEntry>,
    address: Address
  ): Promise<void> {
    const streetEl = await this.findElement(selectors.streetAddress);
    await streetEl.fill(address.street_address);
    
    const cityEl = await this.findElement(selectors.city);
    await cityEl.fill(address.city);
    
    const stateEl = await this.findElement(selectors.state);
    await stateEl.selectOption(address.state);
    
    const zipEl = await this.findElement(selectors.zipCode);
    await zipEl.fill(address.zip_code);
  }

  private async populateRegisteredAgent(ctx: AutomationContext): Promise<void> {
    const agentSelectors = ctx.selectors.entityForm.registeredAgent as Record<string, SelectorEntry>;
    
    const nameEl = await this.findElement(agentSelectors.name);
    await nameEl.fill(ctx.company.registered_agent.name);
    
    await this.populateAddress(
      agentSelectors as unknown as Record<string, SelectorEntry>,
      ctx.company.registered_agent.address
    );
  }

  private async populateOfficers(ctx: AutomationContext): Promise<void> {
    const officerSelectors = ctx.selectors.entityForm.officers as {
      container: SelectorEntry;
      addOfficerButton: SelectorEntry;
      officerRow: Record<string, SelectorEntry>;
    };
    
    for (const officer of ctx.company.officers) {
      // Each officer needs their own row populated
      const titleEl = await this.findElement(officerSelectors.officerRow.title);
      await titleEl.selectOption(officer.title);
      
      const nameEl = await this.findElement(officerSelectors.officerRow.name);
      await nameEl.fill(officer.name);
      
      const addressEl = await this.findElement(officerSelectors.officerRow.address);
      await addressEl.fill(officer.address);
    }
  }

  private async proceedToReview(ctx: AutomationContext): Promise<AutomationResult> {
    const step: AutomationStep = 'proceed_to_review';
    
    try {
      const selector = ctx.selectors.reviewPage.continueButton as SelectorEntry;
      const btn = await this.findElement(selector);
      await btn.click();
      await this.page!.waitForLoadState('networkidle');
      
      return { success: true, step };
    } catch (error) {
      return this.createErrorResult(step, error);
    }
  }

  private async proceedToSignature(ctx: AutomationContext): Promise<AutomationResult> {
    const step: AutomationStep = 'proceed_to_signature';
    
    try {
      // Fill signature
      const sigSelector = ctx.selectors.signaturePage.signatureInput as SelectorEntry;
      const sigEl = await this.findElement(sigSelector);
      await sigEl.fill(ctx.company.entity_name); // Typically signs with entity name
      
      // Check certification checkbox
      const certSelector = ctx.selectors.signaturePage.certificationCheckbox as SelectorEntry;
      const certEl = await this.findElement(certSelector);
      await certEl.check();
      
      // Click submit
      const submitSelector = ctx.selectors.signaturePage.submitButton as SelectorEntry;
      const submitBtn = await this.findElement(submitSelector);
      await submitBtn.click();
      
      await this.page!.waitForLoadState('networkidle');
      
      return { success: true, step };
    } catch (error) {
      return this.createErrorResult(step, error);
    }
  }

  /**
   * CRITICAL: Check for CAPTCHA and PAUSE if detected
   * Per CONSTITUTION.md: NEVER attempt to automate CAPTCHA
   */
  private async checkForCaptcha(ctx: AutomationContext): Promise<AutomationResult> {
    const step: AutomationStep = 'check_captcha';
    const indicators = ctx.selectors.captchaDetection.indicators;
    
    for (const indicator of indicators) {
      const element = await this.page!.$(indicator).catch(() => null);
      if (element) {
        // CAPTCHA detected - MUST PAUSE
        await this.auditLogger.log({
          user_id: 'system',
          action_type: 'captcha_detected',
          entity_type: 'submission',
          entity_id: ctx.submission.id,
          before_state: { status: 'in_progress' },
          after_state: { status: 'awaiting_captcha' },
          metadata: { selector: indicator },
        });
        
        return {
          success: true,
          step,
          pauseRequired: 'captcha',
        };
      }
    }
    
    return { success: true, step };
  }

  /**
   * CRITICAL: Check for payment page and PAUSE if detected
   * Per CONSTITUTION.md: NEVER attempt to automate payment
   */
  private async checkForPayment(ctx: AutomationContext): Promise<AutomationResult> {
    const step: AutomationStep = 'check_payment';
    const indicators = ctx.selectors.paymentDetection.indicators;
    
    for (const indicator of indicators) {
      const element = await this.page!.$(indicator).catch(() => null);
      if (element) {
        // Payment page detected - MUST PAUSE
        await this.auditLogger.log({
          user_id: 'system',
          action_type: 'payment_detected',
          entity_type: 'submission',
          entity_id: ctx.submission.id,
          before_state: { status: 'in_progress' },
          after_state: { status: 'awaiting_payment' },
          metadata: { selector: indicator },
        });
        
        return {
          success: true,
          step,
          pauseRequired: 'payment',
        };
      }
    }
    
    return { success: true, step };
  }

  private async captureConfirmation(ctx: AutomationContext): Promise<AutomationResult> {
    const step: AutomationStep = 'capture_confirmation';
    
    try {
      // Capture confirmation number
      const confSelector = ctx.selectors.confirmationPage.confirmationNumber as SelectorEntry;
      const confElement = await this.findElement(confSelector);
      const confirmationNumber = await confElement.textContent() || '';
      
      // Capture full page screenshot
      const screenshotPath = `receipts/${ctx.submission.id}_confirmation.png`;
      await this.page!.screenshot({ path: screenshotPath, fullPage: true });
      
      // Capture HTML snapshot
      const htmlPath = `receipts/${ctx.submission.id}_confirmation.html`;
      const htmlContent = await this.page!.content();
      // In real implementation, save htmlContent to file/blob storage
      
      await this.auditLogger.log({
        user_id: 'system',
        action_type: 'confirmation_captured',
        entity_type: 'submission',
        entity_id: ctx.submission.id,
        before_state: { status: 'in_progress' },
        after_state: { 
          status: 'confirmed',
          confirmation_number: confirmationNumber,
        },
        metadata: { screenshot_path: screenshotPath, html_path: htmlPath },
      });
      
      return {
        success: true,
        step,
        data: {
          confirmation_number: confirmationNumber.trim(),
          screenshot_path: screenshotPath,
          html_snapshot_path: htmlPath,
        },
      };
    } catch (error) {
      return this.createErrorResult(step, error);
    }
  }

  /**
   * Find element using primary selector, fall back to XPath if needed
   */
  private async findElement(selector: SelectorEntry) {
    // Try primary selector first
    let element = await this.page!.$(selector.primary).catch(() => null);
    
    if (!element && selector.fallback) {
      // Try XPath fallback
      element = await this.page!.$(selector.fallback).catch(() => null);
    }
    
    if (!element && selector.labelMatch) {
      // Try label-based matching
      element = await this.page!.$(`text=${selector.labelMatch}`).catch(() => null);
    }
    
    if (!element) {
      throw new Error(`Element not found: ${selector.primary}`);
    }
    
    return element;
  }

  private createErrorResult(step: AutomationStep, error: unknown): AutomationResult {
    const message = error instanceof Error ? error.message : 'Unknown error';
    return {
      success: false,
      step,
      error: {
        code: 'SELECTOR_MISMATCH',
        message,
        recoverable: this.isRecoverableError(error),
      },
    };
  }

  private isRecoverableError(error: unknown): boolean {
    if (error instanceof Error) {
      // Network errors and timeouts are generally recoverable
      return error.message.includes('timeout') || 
             error.message.includes('network') ||
             error.message.includes('navigation');
    }
    return false;
  }
}

// ============================================================================
// Browser Launcher Interface (for dependency injection)
// ============================================================================

export interface BrowserLauncher {
  launch(options: { headless: boolean }): Promise<Browser>;
}

// ============================================================================
// Mock Browser Launcher (for testing)
// ============================================================================

export class MockBrowserLauncher implements BrowserLauncher {
  async launch(_options: { headless: boolean }): Promise<Browser> {
    // Return a mock browser for testing
    throw new Error('MockBrowserLauncher.launch() must be mocked in tests');
  }
}
