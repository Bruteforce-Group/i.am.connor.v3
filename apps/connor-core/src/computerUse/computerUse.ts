import { chromium, Browser, Page, BrowserContext } from 'playwright';
import { getConfig } from '../config.js';

export interface ComputerAction {
  type: 'navigate' | 'click' | 'type' | 'scroll' | 'screenshot' | 'extract_text';
  url?: string;
  selector?: string;
  coordinates?: { x: number; y: number };
  text?: string;
  scrollDirection?: 'up' | 'down';
  scrollAmount?: number;
}

export interface ComputerResult {
  success: boolean;
  screenshot?: Buffer;
  text?: string;
  error?: string;
}

export class ComputerUse {
  private config = getConfig();
  private browser: Browser | null = null;
  private context: BrowserContext | null = null;
  private page: Page | null = null;

  async initialize(): Promise<void> {
    if (this.browser) return;

    this.browser = await chromium.launch({
      headless: this.config.COMPUTER_USE_BROWSER === 'headless'
    });

    this.context = await this.browser.newContext();
    this.page = await this.context.newPage();

    console.log('🖥️ Computer Use initialized');
  }

  async close(): Promise<void> {
    if (this.page) await this.page.close();
    if (this.context) await this.context.close();
    if (this.browser) await this.browser.close();

    this.page = null;
    this.context = null;
    this.browser = null;
  }

  async executeAction(action: ComputerAction): Promise<ComputerResult> {
    if (!this.page) {
      await this.initialize();
    }

    if (!this.page) {
      return {
        success: false,
        error: 'Failed to initialize browser'
      };
    }

    try {
      switch (action.type) {
        case 'navigate':
          if (!action.url) {
            return { success: false, error: 'URL required for navigation' };
          }
          await this.page.goto(action.url, { waitUntil: 'networkidle' });
          return { success: true };

        case 'click':
          if (action.selector) {
            await this.page.click(action.selector);
          } else if (action.coordinates) {
            await this.page.mouse.click(action.coordinates.x, action.coordinates.y);
          } else {
            return { success: false, error: 'Selector or coordinates required for click' };
          }
          return { success: true };

        case 'type':
          if (!action.text) {
            return { success: false, error: 'Text required for typing' };
          }
          if (action.selector) {
            await this.page.fill(action.selector, action.text);
          } else {
            await this.page.keyboard.type(action.text);
          }
          return { success: true };

        case 'scroll':
          const direction = action.scrollDirection || 'down';
          const amount = action.scrollAmount || 500;

          if (direction === 'down') {
            await this.page.evaluate((scrollAmount) => {
              window.scrollBy(0, scrollAmount);
            }, amount);
          } else {
            await this.page.evaluate((scrollAmount) => {
              window.scrollBy(0, -scrollAmount);
            }, amount);
          }
          return { success: true };

        case 'screenshot':
          const screenshot = await this.page.screenshot({ fullPage: false });
          return {
            success: true,
            screenshot: Buffer.from(screenshot)
          };

        case 'extract_text':
          let text = '';
          if (action.selector) {
            text = await this.page.textContent(action.selector) || '';
          } else {
            text = await this.page.evaluate(() => {
              const elements = document.querySelectorAll('p, h1, h2, h3, h4, h5, h6, div, span, li');
              return Array.from(elements)
                .map(el => el.textContent?.trim())
                .filter(text => text && text.length > 10)
                .slice(0, 10)
                .join('\n\n');
            });
          }
          return {
            success: true,
            text
          };

        default:
          return {
            success: false,
            error: `Unknown action type: ${(action as any).type}`
          };
      }

    } catch (error) {
      return {
        success: false,
        error: `Action failed: ${error.message}`
      };
    }
  }

  async takeScreenshot(): Promise<Buffer | null> {
    if (!this.page) return null;

    try {
      const screenshot = await this.page.screenshot({ fullPage: false });
      return Buffer.from(screenshot);
    } catch (error) {
      console.error('Screenshot failed:', error.message);
      return null;
    }
  }

  async getCurrentUrl(): Promise<string | null> {
    if (!this.page) return null;
    return this.page.url();
  }

  async getPageTitle(): Promise<string | null> {
    if (!this.page) return null;
    return this.page.title();
  }
}

// Global instance
let computerUseInstance: ComputerUse | null = null;

export function getComputerUse(): ComputerUse {
  if (!computerUseInstance) {
    computerUseInstance = new ComputerUse();
  }
  return computerUseInstance;
}

export async function closeComputerUse(): Promise<void> {
  if (computerUseInstance) {
    await computerUseInstance.close();
    computerUseInstance = null;
  }
}
