/**
 * src/renderer/category-init.js
 *
 * Phase A1b (App Categorization): renderer 端注入 category data.
 *
 * 关键: esbuild 在 bundle src/renderer/index.jsx 时, 静态 import 这个模块,
 * 顶层 import 触发 setData() 立刻跑. 之后 store.js / selectors.js 调
 * category.* 都有数据.
 *
 * 跟 main 进程的区别:
 *   - main: 用 fs.readFileSync 读 src/config/data/*.json (Node 跑)
 *   - renderer: 用 esbuild static import 把 JSON inline 进 bundle (browser 跑)
 */

import * as category from '../config/category.js';
import catsData from '../config/data/categories.json';
import mapData from '../config/data/app-category.json';

// 顶层副作用: require 这个模块时立刻跑 setData
category.setData({
  cats: catsData.categories,
  map: mapData.mapping,
  source: 'inline-esbuild',
});
