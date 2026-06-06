import { chromium } from '@playwright/test';

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage();

const errors = [];
const logs = [];
page.on('console', msg => logs.push(`[${msg.type()}] ${msg.text()}`));
page.on('pageerror', err => errors.push(err.message));

await page.goto('http://localhost:5173', { waitUntil: 'networkidle', timeout: 15000 });

console.log('--- Page title:', await page.title());

// Wait for connection
await page.waitForTimeout(3000);

// Check if connected
const connectionStatus = await page.locator('.chat-status').textContent().catch(() => null);
const loadingMsg = await page.locator('.chat-loading h1').textContent().catch(() => null);
console.log('Connection status element:', connectionStatus);
console.log('Loading screen:', loadingMsg);

// Dump page HTML for debugging
const mainContent = await page.locator('main').innerHTML().catch(() => 'no main element');
console.log('--- Main HTML (truncated):\n', mainContent.substring(0, 2000));

// Try sending a message if connected
if (connectionStatus) {
  const textarea = page.locator('textarea[aria-label="message input"]');
  await textarea.fill('Hello from Playwright test');
  const sendBtn = page.locator('button[type="submit"]:has-text("Send")');
  const disabled = await sendBtn.isDisabled();
  console.log('Send button disabled:', disabled);
  if (!disabled) {
    await sendBtn.click();
    await page.waitForTimeout(2000);
    const messages = await page.locator('.chat-message').all();
    console.log('Messages visible:', messages.length);
    for (const msg of messages) {
      const text = await msg.locator('.chat-message-text').textContent();
      console.log(' -', text);
    }
  }
}

console.log('\n--- Console logs:');
logs.forEach(l => console.log(l));
console.log('\n--- Page errors:');
errors.forEach(e => console.log(e));

await browser.close();
