// 生成标题字体（思源宋体 Noto Serif SC 700）的样式表。只有大标题用衬线粗体，其余文字用系统无衬线黑体，所以只需要这一个字重。
// 改了本地看板的固定标题（BOARD_HEAD_TEXT）后运行：npm run build:fonts，并提交生成的文件。
//
// - 主站：src/fonts.css 直接引用 node_modules 里 @fontsource/noto-serif-sc 的 700 分片（按 unicode-range 切开，约 100 个），由 Vite 打包；
//   浏览器只下载标题里实际出现的字所在的分片，只写 woff2，不写 woff 后备。
// - 本地看板：内容安全策略只允许本地资源。local-board/public/fonts.css 只声明覆盖看板固定标题的那几个分片，
//   分片文件在打包下载包时从 node_modules 复制（scripts/build-local-board.mjs），不进仓库。
// 字体许可为 SIL OFL 1.1，许可证全文随文件放置。
import { copyFileSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const NOTO = join(root, 'node_modules', '@fontsource', 'noto-serif-sc');

// 本地看板里用衬线粗体显示的固定标题
export const BOARD_HEAD_TEXT = ['本地投递看板', '这里还空着', '投递漏斗', '每周投递数量', '日程', '投递进度', '新增岗位', '导出', '删除这张卡片', '更新到', '从秋招信库同步个收藏岗位', '用这个文件替换当前看板', '0123456789.v？'];

/** 解析 fontsource 样式表：[{ file, ranges: [[from, to]], rangeText }] */
function parseFaces(cssPath) {
  const css = readFileSync(cssPath, 'utf8');
  return [...css.matchAll(/@font-face\s*{([^}]*)}/g)].map(([, body]) => {
    const file = body.match(/url\(\.\/files\/([^)]+\.woff2)\)/)?.[1];
    const rangeText = body.match(/unicode-range:\s*([^;]+)/)?.[1].trim();
    if (!file || !rangeText) return null;
    const ranges = rangeText.split(',').map((range) => range.trim().replace(/^U\+/i, '').split('-').map((hex) => parseInt(hex, 16)));
    return { file, ranges, rangeText };
  }).filter(Boolean);
}

const headFaces = () => parseFaces(join(NOTO, '700.css'));

/** 覆盖看板固定标题的分片 */
function boardFaces() {
  const codes = [...new Set([...BOARD_HEAD_TEXT.join('')])].filter((char) => char.trim()).map((char) => char.codePointAt(0));
  return headFaces().filter((face) => codes.some((code) => face.ranges.some(([from, to = from]) => code >= from && code <= to)));
}

const face = (url, rangeText) => `@font-face { font-family: "Noto Serif SC"; font-style: normal; font-weight: 700; font-display: swap; src: url("${url}") format("woff2"); unicode-range: ${rangeText}; }`;

/** 本地看板打包时用：需要随下载包分发的分片在 node_modules 里的位置 */
export function boardFontFiles() {
  return boardFaces().map(({ file }) => ({ name: file, path: join(NOTO, 'files', file) }));
}

/** 开发时把同样的文件复制到 local-board/public/fonts/，直接运行看板源码也能看到字体（这些文件不进仓库） */
export function copyBoardFonts(dir) {
  mkdirSync(dir, { recursive: true });
  for (const { name, path } of boardFontFiles()) copyFileSync(path, join(dir, name));
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const header = '/* 由 scripts/build-fonts.mjs 生成，不要手改。思源宋体 Noto Serif SC 700，只用于大标题；SIL OFL 1.1 */';
  writeFileSync(join(root, 'src', 'fonts.css'), `${[header, ...headFaces().map(({ file, rangeText }) => face(`../node_modules/@fontsource/noto-serif-sc/files/${file}`, rangeText))].join('\n')}\n`);

  const boardDir = join(root, 'local-board', 'public', 'fonts');
  rmSync(boardDir, { recursive: true, force: true });
  mkdirSync(boardDir, { recursive: true });
  copyFileSync(join(NOTO, 'LICENSE'), join(boardDir, 'OFL-NotoSerifSC.txt'));
  writeFileSync(join(root, 'local-board', 'public', 'fonts.css'), `${[header, ...boardFaces().map(({ file, rangeText }) => face(`fonts/${file}`, rangeText))].join('\n')}\n`);
  copyBoardFonts(boardDir);

  // 主站不再需要自托管的文楷子集
  rmSync(join(root, 'public', 'fonts'), { recursive: true, force: true });
  console.log(`字体：主站 ${headFaces().length} 个分片按需加载；本地看板打包 ${boardFaces().length} 个分片`);
}
