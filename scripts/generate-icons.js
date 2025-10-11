/**
 * 生成应用桌面图标：从紫色仙女棒SVG导出PNG多尺寸与ICO
 */
const fs = require('fs');
const path = require('path');
const sharp = require('sharp');
const pngToIcoMod = require('png-to-ico');
const pngToIco = pngToIcoMod.default ? pngToIcoMod.default : pngToIcoMod;

async function main() {
  const svgPath = path.join(__dirname, '..', 'web', 'logo-fairy-wand-purple.svg');
  const outDir = path.join(__dirname, '..', 'icons');
  if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });

  const sizes = [16, 24, 32, 48, 64, 128, 256, 512];
  const pngPaths = [];

  for (const size of sizes) {
    const outPng = path.join(outDir, `app-icon-${size}.png`);
    await sharp(svgPath)
      .resize(size, size, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
      .png()
      .toFile(outPng);
    pngPaths.push(outPng);
  }

  // 生成ICO（使用常见尺寸集）
  const icoTarget = path.join(outDir, 'app-icon.ico');
  const icoSrc = [16, 24, 32, 48, 64, 128].map(s => path.join(outDir, `app-icon-${s}.png`));
  const icoBuffer = await pngToIco(icoSrc);
  fs.writeFileSync(icoTarget, icoBuffer);

  // 生成主PNG（256）供Electron窗口icon使用
  const mainPng = path.join(outDir, 'app-icon.png');
  fs.copyFileSync(path.join(outDir, 'app-icon-256.png'), mainPng);

  console.log('图标生成完成:', { ico: icoTarget, png: mainPng });
}

main().catch(err => {
  console.error('生成图标失败:', err);
  process.exit(1);
});