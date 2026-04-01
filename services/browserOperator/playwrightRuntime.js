'use strict';

const { chromium } = require('playwright');

const DEFAULT_VIEWPORT = { width: 1440, height: 960 };

async function createRuntime(run) {
  const storageState = run.session_mode === 'named' ? (run.session_state || undefined) : undefined;
  const browser = await chromium.launch({
    headless: true,
  });

  const context = await browser.newContext({
    viewport: DEFAULT_VIEWPORT,
    ignoreHTTPSErrors: true,
    storageState,
  });
  const page = await context.newPage();

  const state = {
    page,
    context,
    browser,
    currentUrl: null,
    lastHtml: '',
    lastStatus: null,
    lastTitle: null,
    consoleLogs: [],
    networkSummary: {
      requests: 0,
      responsesByStatusClass: {
        '2xx': 0,
        '3xx': 0,
        '4xx': 0,
        '5xx': 0,
        other: 0,
      },
    },
  };

  page.on('console', (msg) => {
    state.consoleLogs.push({
      type: msg.type(),
      text: msg.text(),
      location: msg.location(),
      timestamp: new Date().toISOString(),
    });
  });

  page.on('request', () => {
    state.networkSummary.requests += 1;
  });

  page.on('response', (response) => {
    const status = response.status();
    if (status >= 200 && status < 300) state.networkSummary.responsesByStatusClass['2xx'] += 1;
    else if (status >= 300 && status < 400) state.networkSummary.responsesByStatusClass['3xx'] += 1;
    else if (status >= 400 && status < 500) state.networkSummary.responsesByStatusClass['4xx'] += 1;
    else if (status >= 500 && status < 600) state.networkSummary.responsesByStatusClass['5xx'] += 1;
    else state.networkSummary.responsesByStatusClass.other += 1;
  });

  return state;
}

function resolveTargetUrl(run, step) {
  const relativePath = String(step.input?.path || run.target.path || '').trim();
  return relativePath
    ? new URL(relativePath, run.target.baseUrl).toString()
    : run.target.baseUrl;
}

async function executeStep(run, step, state) {
  const page = state.page;

  if (step.action_key === 'browser.open') {
    const targetUrl = resolveTargetUrl(run, step);
    const response = await page.goto(targetUrl, {
      waitUntil: step.input?.waitUntil || 'domcontentloaded',
      timeout: Number(step.input?.timeoutMs) || 20000,
    });
    state.currentUrl = page.url();
    state.lastHtml = await page.content();
    state.lastStatus = response ? response.status() : null;
    state.lastTitle = await page.title();
    return {
      url: state.currentUrl,
      statusCode: state.lastStatus,
      title: state.lastTitle,
      contentLength: Buffer.byteLength(state.lastHtml, 'utf8'),
      runtime: 'playwright',
    };
  }

  if (step.action_key === 'browser.click') {
    const selector = String(step.input?.selector || '').trim();
    if (!selector) {
      const error = new Error('browser.click requires input.selector');
      error.code = 'INVALID_STEP_INPUT';
      throw error;
    }
    await page.locator(selector).first().click({
      timeout: Number(step.input?.timeoutMs) || 10000,
    });
    await page.waitForLoadState(step.input?.waitUntil || 'domcontentloaded', {
      timeout: Number(step.input?.postWaitTimeoutMs) || 10000,
    }).catch(() => null);
    state.currentUrl = page.url();
    state.lastHtml = await page.content();
    state.lastTitle = await page.title();
    return {
      selector,
      url: state.currentUrl,
      title: state.lastTitle,
    };
  }

  if (step.action_key === 'browser.fill') {
    const selector = String(step.input?.selector || '').trim();
    if (!selector) {
      const error = new Error('browser.fill requires input.selector');
      error.code = 'INVALID_STEP_INPUT';
      throw error;
    }
    const value = String(step.input?.value || '').trim();
    await page.locator(selector).first().fill(value, {
      timeout: Number(step.input?.timeoutMs) || 10000,
    });
    return {
      selector,
      filled: true,
      valueLength: value.length,
    };
  }

  if (step.action_key === 'browser.login') {
    const usernameSelector = String(step.input?.usernameSelector || step.input?.emailSelector || '').trim();
    const passwordSelector = String(step.input?.passwordSelector || '').trim();
    const submitSelector = String(step.input?.submitSelector || '').trim();
    const credentials = step.input?.resolvedCredentials || null;

    if (!usernameSelector || !passwordSelector || !submitSelector) {
      const error = new Error('browser.login requires usernameSelector, passwordSelector and submitSelector');
      error.code = 'INVALID_STEP_INPUT';
      throw error;
    }
    if (!credentials?.username || !credentials?.password) {
      const error = new Error('browser.login requires resolved credentials');
      error.code = 'MISSING_CREDENTIALS';
      throw error;
    }

    await page.locator(usernameSelector).first().fill(String(credentials.username), {
      timeout: Number(step.input?.timeoutMs) || 10000,
    });
    await page.locator(passwordSelector).first().fill(String(credentials.password), {
      timeout: Number(step.input?.timeoutMs) || 10000,
    });
    await page.locator(submitSelector).first().click({
      timeout: Number(step.input?.timeoutMs) || 10000,
    });
    await page.waitForLoadState(step.input?.waitUntil || 'domcontentloaded', {
      timeout: Number(step.input?.postWaitTimeoutMs) || 10000,
    }).catch(() => null);

    state.currentUrl = page.url();
    state.lastHtml = await page.content();
    state.lastTitle = await page.title();

    if (step.input?.successText) {
      const successText = String(step.input.successText).trim().toLowerCase();
      if (successText && !state.lastHtml.toLowerCase().includes(successText)) {
        const error = new Error(`Login success text not found: ${step.input.successText}`);
        error.code = 'LOGIN_ASSERTION_FAILED';
        throw error;
      }
    }

    if (step.input?.successUrlContains) {
      const expected = String(step.input.successUrlContains).trim();
      if (expected && !state.currentUrl.includes(expected)) {
        const error = new Error(`Login success URL fragment not found: ${expected}`);
        error.code = 'LOGIN_ASSERTION_FAILED';
        throw error;
      }
    }

    return {
      loggedIn: true,
      url: state.currentUrl,
      title: state.lastTitle,
      usernameMasked: `${String(credentials.username).slice(0, 2)}***`,
    };
  }

  if (step.action_key === 'browser.signup') {
    const emailSelector = String(step.input?.emailSelector || step.input?.usernameSelector || '').trim();
    const passwordSelector = String(step.input?.passwordSelector || '').trim();
    const submitSelector = String(step.input?.submitSelector || '').trim();
    const nameSelector = String(step.input?.nameSelector || '').trim();
    const credentials = step.input?.resolvedCredentials || null;
    const signupEmail = step.input?.signupEmail || credentials?.username || '';
    const signupPassword = step.input?.signupPassword || credentials?.password || '';

    if (!emailSelector || !passwordSelector || !submitSelector) {
      const error = new Error('browser.signup requires emailSelector, passwordSelector and submitSelector');
      error.code = 'INVALID_STEP_INPUT';
      throw error;
    }

    if (nameSelector && step.input?.fullName) {
      await page.locator(nameSelector).first().fill(String(step.input.fullName), {
        timeout: Number(step.input?.timeoutMs) || 10000,
      });
    }
    await page.locator(emailSelector).first().fill(String(signupEmail), {
      timeout: Number(step.input?.timeoutMs) || 10000,
    });
    await page.locator(passwordSelector).first().fill(String(signupPassword), {
      timeout: Number(step.input?.timeoutMs) || 10000,
    });
    if (step.input?.confirmPasswordSelector) {
      await page.locator(String(step.input.confirmPasswordSelector)).first().fill(String(signupPassword), {
        timeout: Number(step.input?.timeoutMs) || 10000,
      });
    }
    await page.locator(submitSelector).first().click({
      timeout: Number(step.input?.timeoutMs) || 10000,
    });
    await page.waitForLoadState(step.input?.waitUntil || 'domcontentloaded', {
      timeout: Number(step.input?.postWaitTimeoutMs) || 10000,
    }).catch(() => null);

    state.currentUrl = page.url();
    state.lastHtml = await page.content();
    state.lastTitle = await page.title();

    if (step.input?.successText) {
      const successText = String(step.input.successText).trim().toLowerCase();
      if (successText && !state.lastHtml.toLowerCase().includes(successText)) {
        const error = new Error(`Signup success text not found: ${step.input.successText}`);
        error.code = 'SIGNUP_ASSERTION_FAILED';
        throw error;
      }
    }

    if (step.input?.successUrlContains) {
      const expected = String(step.input.successUrlContains).trim();
      if (expected && !state.currentUrl.includes(expected)) {
        const error = new Error(`Signup success URL fragment not found: ${expected}`);
        error.code = 'SIGNUP_ASSERTION_FAILED';
        throw error;
      }
    }

    return {
      signedUp: true,
      url: state.currentUrl,
      title: state.lastTitle,
      emailMasked: signupEmail ? `${String(signupEmail).slice(0, 2)}***` : null,
    };
  }

  if (step.action_key === 'browser.consume_magic_link') {
    const magicLinkUrl = String(step.input?.resolvedMagicLinkUrl || step.input?.magicLinkUrl || '').trim();
    const selector = String(step.input?.selector || '').trim();
    let targetUrl = magicLinkUrl;

    if (!targetUrl && selector) {
      const href = await page.locator(selector).first().getAttribute('href');
      if (href) {
        targetUrl = new URL(href, page.url()).toString();
      }
    }
    if (!targetUrl) {
      const error = new Error('browser.consume_magic_link requires a resolved magic link URL or selector');
      error.code = 'MISSING_MAGIC_LINK';
      throw error;
    }

    const response = await page.goto(targetUrl, {
      waitUntil: step.input?.waitUntil || 'domcontentloaded',
      timeout: Number(step.input?.timeoutMs) || 20000,
    });
    state.currentUrl = page.url();
    state.lastHtml = await page.content();
    state.lastStatus = response ? response.status() : null;
    state.lastTitle = await page.title();

    if (step.input?.successText) {
      const successText = String(step.input.successText).trim().toLowerCase();
      if (successText && !state.lastHtml.toLowerCase().includes(successText)) {
        const error = new Error(`Magic link success text not found: ${step.input.successText}`);
        error.code = 'MAGIC_LINK_ASSERTION_FAILED';
        throw error;
      }
    }

    if (step.input?.successUrlContains) {
      const expected = String(step.input.successUrlContains).trim();
      if (expected && !state.currentUrl.includes(expected)) {
        const error = new Error(`Magic link success URL fragment not found: ${expected}`);
        error.code = 'MAGIC_LINK_ASSERTION_FAILED';
        throw error;
      }
    }

    return {
      consumed: true,
      url: state.currentUrl,
      title: state.lastTitle,
    };
  }

  if (step.action_key === 'browser.consume_email_code') {
    const codeSelector = String(step.input?.codeSelector || '').trim();
    const submitSelector = String(step.input?.submitSelector || '').trim();
    const code = String(step.input?.resolvedEmailCode || '').trim();
    if (!codeSelector || !submitSelector || !code) {
      const error = new Error('browser.consume_email_code requires codeSelector, submitSelector and a resolved code');
      error.code = 'MISSING_EMAIL_CODE';
      throw error;
    }

    await page.locator(codeSelector).first().fill(code, {
      timeout: Number(step.input?.timeoutMs) || 10000,
    });
    await page.locator(submitSelector).first().click({
      timeout: Number(step.input?.timeoutMs) || 10000,
    });
    await page.waitForLoadState(step.input?.waitUntil || 'domcontentloaded', {
      timeout: Number(step.input?.postWaitTimeoutMs) || 10000,
    }).catch(() => null);

    state.currentUrl = page.url();
    state.lastHtml = await page.content();
    state.lastTitle = await page.title();

    return {
      consumed: true,
      url: state.currentUrl,
      title: state.lastTitle,
      codeLength: code.length,
    };
  }

  if (step.action_key === 'browser.consume_reset_password') {
    const targetUrl = String(step.input?.resolvedResetUrl || step.input?.resetUrl || '').trim();
    const passwordSelector = String(step.input?.passwordSelector || '').trim();
    const submitSelector = String(step.input?.submitSelector || '').trim();
    const newPassword = String(step.input?.newPassword || step.input?.resolvedCredentials?.password || '').trim();

    if (targetUrl) {
      await page.goto(targetUrl, {
        waitUntil: step.input?.waitUntil || 'domcontentloaded',
        timeout: Number(step.input?.timeoutMs) || 20000,
      });
    }

    if (!passwordSelector || !submitSelector || !newPassword) {
      const error = new Error('browser.consume_reset_password requires passwordSelector, submitSelector and a new password');
      error.code = 'INVALID_STEP_INPUT';
      throw error;
    }

    await page.locator(passwordSelector).first().fill(newPassword, {
      timeout: Number(step.input?.timeoutMs) || 10000,
    });
    if (step.input?.confirmPasswordSelector) {
      await page.locator(String(step.input.confirmPasswordSelector)).first().fill(newPassword, {
        timeout: Number(step.input?.timeoutMs) || 10000,
      });
    }
    await page.locator(submitSelector).first().click({
      timeout: Number(step.input?.timeoutMs) || 10000,
    });
    await page.waitForLoadState(step.input?.waitUntil || 'domcontentloaded', {
      timeout: Number(step.input?.postWaitTimeoutMs) || 10000,
    }).catch(() => null);

    state.currentUrl = page.url();
    state.lastHtml = await page.content();
    state.lastTitle = await page.title();

    if (step.input?.successText) {
      const successText = String(step.input.successText).trim().toLowerCase();
      if (successText && !state.lastHtml.toLowerCase().includes(successText)) {
        const error = new Error(`Reset success text not found: ${step.input.successText}`);
        error.code = 'RESET_ASSERTION_FAILED';
        throw error;
      }
    }

    return {
      resetCompleted: true,
      url: state.currentUrl,
      title: state.lastTitle,
    };
  }

  if (step.action_key === 'browser.wait_for') {
    const selector = String(step.input?.selector || '').trim();
    if (selector) {
      await page.locator(selector).first().waitFor({
        state: step.input?.state || 'visible',
        timeout: Number(step.input?.timeoutMs) || 10000,
      });
      return { selector, state: step.input?.state || 'visible' };
    }

    const timeoutMs = Number(step.input?.timeoutMs) || 1000;
    await page.waitForTimeout(timeoutMs);
    return { waitedMs: timeoutMs };
  }

  if (step.action_key === 'browser.assert_text') {
    const expectedText = String(step.input?.text || '').trim();
    if (!expectedText) {
      const error = new Error('browser.assert_text requires input.text');
      error.code = 'INVALID_STEP_INPUT';
      throw error;
    }
    const haystack = await page.content();
    state.lastHtml = haystack;
    const found = haystack.toLowerCase().includes(expectedText.toLowerCase());
    if (!found) {
      const error = new Error(`Expected text not found: ${expectedText}`);
      error.code = 'TEXT_ASSERTION_FAILED';
      throw error;
    }
    return { text: expectedText, found };
  }

  if (step.action_key === 'browser.assert_status') {
    const expectedStatus = Number(step.input?.expectedStatus || 200);
    if (state.lastStatus !== expectedStatus) {
      const error = new Error(`Expected status ${expectedStatus} but got ${state.lastStatus}`);
      error.code = 'STATUS_ASSERTION_FAILED';
      throw error;
    }
    return { expectedStatus, actualStatus: state.lastStatus };
  }

  if (step.action_key === 'browser.assert_url') {
    const expectedContains = String(step.input?.contains || '').trim();
    const url = page.url();
    if (expectedContains && !url.includes(expectedContains)) {
      const error = new Error(`Expected URL to contain ${expectedContains} but got ${url}`);
      error.code = 'URL_ASSERTION_FAILED';
      throw error;
    }
    return { url, contains: expectedContains || null };
  }

  if (step.action_key === 'browser.extract_title') {
    state.lastTitle = await page.title();
    return { title: state.lastTitle };
  }

  if (step.action_key === 'browser.capture') {
    const screenshot = await page.screenshot({
      fullPage: Boolean(step.input?.fullPage ?? true),
      type: 'png',
    });
    return {
      screenshotBase64: screenshot.toString('base64'),
      url: page.url(),
      title: await page.title(),
    };
  }

  const error = new Error(`Unsupported action: ${step.action_key}`);
  error.code = 'UNSUPPORTED_ACTION';
  throw error;
}

async function collectFinalState(state) {
  const html = await state.page.content();
  const title = await state.page.title();
  const screenshot = await state.page.screenshot({ fullPage: true, type: 'png' });
  return {
    html,
    title,
    url: state.page.url(),
    screenshotBase64: screenshot.toString('base64'),
    storageState: await state.context.storageState(),
    consoleLogs: state.consoleLogs,
    networkSummary: state.networkSummary,
  };
}

async function closeRuntime(state) {
  await state.context?.close().catch(() => null);
  await state.browser?.close().catch(() => null);
}

module.exports = {
  createRuntime,
  executeStep,
  collectFinalState,
  closeRuntime,
};
