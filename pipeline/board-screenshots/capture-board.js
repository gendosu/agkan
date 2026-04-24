/**
 * capture-board.js
 * agkan board Web UI (http://localhost:8080) のスクリーンショットを撮る
 *
 * 使い方:
 *   node capture-board.js
 *
 * 環境変数:
 *   BOARD_URL       - ボードのURL（デフォルト: http://localhost:8080）
 *   SCREENSHOT_DIR  - スクリーンショット保存先（デフォルト: /workspace/output/screenshots）
 */

const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

const BOARD_URL = process.env.BOARD_URL || 'http://localhost:8080';
const OUTPUT_DIR = process.env.SCREENSHOT_DIR || '/workspace/output/screenshots';

(async () => {
  fs.mkdirSync(OUTPUT_DIR, { recursive: true });

  console.log(`📁 出力先: ${OUTPUT_DIR}`);
  console.log(`🌐 ボードURL: ${BOARD_URL}`);

  const launchOptions = {
    args: ['--no-sandbox', '--disable-dev-shm-usage', '--disable-gpu'],
  };
  if (process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH) {
    launchOptions.executablePath = process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH;
  }

  const browser = await chromium.launch(launchOptions);
  const page = await browser.newPage({ viewport: { width: 1400, height: 900 } });

  console.log(`🌐 ボードに接続中: ${BOARD_URL}`);
  await page.goto(BOARD_URL, { waitUntil: 'networkidle' });

  // ボードのカラムが表示されるまで待機
  await page.waitForSelector('.board, [data-testid="board"], .kanban, main', { timeout: 15000 });
  await page.waitForTimeout(2000);

  // board-full.png: ボード全体（fullPage）
  const screenshotPath = path.join(OUTPUT_DIR, 'board-full.png');
  await page.screenshot({ path: screenshotPath, fullPage: true });
  console.log(`  ✅ ${path.basename(screenshotPath)}`);

  await browser.close();
  console.log('\n🎉 完了！');
})().catch(err => {
  console.error('❌ エラー:', err.message);
  process.exit(1);
});
