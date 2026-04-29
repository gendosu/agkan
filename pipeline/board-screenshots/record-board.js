/**
 * record-board.js
 * agkan board の依存ラインON → カードドラッグ操作をMP4として録画する
 *
 * 使い方:
 *   node record-board.js
 *
 * 環境変数:
 *   BOARD_URL   - ボードのURL（デフォルト: http://localhost:8080）
 *   OUTPUT_DIR  - 出力ディレクトリ（デフォルト: /workspace/output）
 */

const { chromium } = require('playwright');
const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const BOARD_URL = process.env.BOARD_URL || 'http://localhost:8080';
const OUTPUT_DIR = process.env.OUTPUT_DIR || '/workspace/output';

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
  const context = await browser.newContext({
    recordVideo: {
      dir: OUTPUT_DIR,
      size: { width: 1400, height: 900 },
    },
    viewport: { width: 1400, height: 900 },
  });

  const page = await context.newPage();

  console.log('🌐 ボードに接続中...');
  await page.goto(BOARD_URL, { waitUntil: 'networkidle' });
  await page.waitForSelector('.board, [data-testid="board"], .kanban, main', { timeout: 15000 });
  await page.waitForTimeout(1000);

  // 依存ライン表示をONにする
  console.log('🔗 依存ラインを表示...');
  await page.click('#dependency-toggle');
  await page.waitForTimeout(1500);

  // ID=2のカード（APIエンドポイント設計）をready列へドラッグ
  console.log('🚀 タスクをbacklog→readyへドラッグ...');
  const card = page.locator('.card[data-status="backlog"][data-id="2"]');
  const readyColumn = page.locator('#col-ready');
  await card.dragTo(readyColumn);
  await page.waitForTimeout(2000);

  await context.close();
  await browser.close();
  console.log('🎬 録画完了、WebMファイルを確定中...');

  // WebM → MP4 変換
  const webmFiles = fs.readdirSync(OUTPUT_DIR).filter(f => f.endsWith('.webm'));
  if (webmFiles.length === 0) {
    console.error('❌ WebMファイルが見つかりません');
    process.exit(1);
  }
  const webmPath = path.join(OUTPUT_DIR, webmFiles[0]);
  const mp4Path = path.join(OUTPUT_DIR, 'board-demo.mp4');
  console.log(`🎞️  MP4に変換中: ${mp4Path}`);
  execSync(
    `ffmpeg -y -i "${webmPath}" -c:v libx264 -pix_fmt yuv420p "${mp4Path}"`,
    { stdio: 'inherit' }
  );
  fs.unlinkSync(webmPath);
  console.log('✅ 完了:', mp4Path);
})().catch(err => {
  console.error('❌ エラー:', err.message);
  process.exit(1);
});
