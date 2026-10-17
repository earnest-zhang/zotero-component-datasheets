# 电子器件数据手册 → Zotero · v0.2.0

在立创商城单个商品详情页点击 Zotero Connector，保存“文档”条目、商品参数笔记和数据手册 PDF。本版增加标题后缀 `Specification`，固定语言为 `en`、文库编目留空，并从 PDF 首页补全可明确识别的版本日期。

示例：[ISL80103IRAJZ-TK](https://item.szlcsc.com/354697.html)。支持相同结构的其他立创商品页，不限于这个商品。

**下载：[v0.2.0 XPI 安装包](https://github.com/earnest-zhang/zotero-component-datasheets/releases/download/v0.2.0/lcsc-datasheets-v0.2.0.xpi) · [最新发布页与源码包](https://github.com/earnest-zhang/zotero-component-datasheets/releases/latest)**

## 安装更新

适用于 **Zotero 9.0.x** 和已连接桌面端的 Zotero Connector。

1. 在 Zotero 打开 **工具 → 插件**，点击齿轮菜单的 **从文件安装插件**。
2. 选择 `lcsc-datasheets-v0.2.0.xpi`。扩展自动安装或更新内含的 **LCSC Datasheets** 转换器。
3. 保持 Zotero 打开，在浏览器的 **Zotero Connector 设置 → Advanced（高级）→ Reset Translators（重置转换器）** 刷新缓存。
4. 刷新商品页，等待商品信息加载。Connector 应显示使用 **LCSC Datasheets** 保存；必要时右键查看可用转换器。
5. 保存后展开条目，确认有 **Datasheet** PDF 和 **器件参数**笔记。PDF 下载完成后，扩展尝试补全空白日期。

请开启 Zotero 的自动附加关联 PDF 设置。安装使用不需要 Node.js、Python 或 API Key。

发布版通过 GitHub Release 中的更新清单检查新版。如果之前安装的是本地版 v0.2.0，请先手动安装本次 XPI，以替换原来的占位更新地址。

**本版 `.xpi` 是扩展，可以通过插件菜单安装。** 单独的 `LCSC Datasheets.js` 仍是转换器，不能双击运行、用“文件 → 导入”，或通过插件菜单安装。

只需新标题、语言和文库编目规则时，也可以沿用 Scaffold：打开此目录的 `.js` → **Save to Zotero** → Connector **Reset Translators**。但只安装 `.js` 不会读取 PDF 日期。

字段规则适用于之后保存的条目，不批量修改原有条目。扩展不扫描整个资料库；日期识别由 PDF 附件的新增或修改事件触发，已有手动日期不会覆盖。停用扩展会停止日期识别，已安装的转换器仍可继续保存网页信息。

## 字段约定

| Zotero 字段 | 内容 |
|---|---|
| 条目类型 `itemType` | `document`（文档） |
| 标题 `title` | 商品目录 + 空格 + 商品型号 + ` Specification` |
| 作者 `creators` | 品牌名称，单字段机构作者（`fieldMode: 1`） |
| 类型 `type` | `Datasheet` |
| 日期 `date` | PDF 首页可明确识别的版本／发布日期；不覆盖非空值 |
| 语言 `language` | 固定 `en` |
| 文库编目 `libraryCatalog` | 留空 |
| 档案 `archive` | `立创商城` |
| 档案位置／档案编号 `archiveLocation` | 商品编号，例如 `C382020`；不是页面 ID |
| DOI | 留空 |
| URL `url` | 去除查询参数和锚点的商品详情页链接 |
| 访问日期 `accessDate` | Zotero 保存时的当前时间 |
| 摘要 `abstractNote` | 商品描述 |
| 额外信息 `extra` | 型号、封装；自动填日期时追加附件标识及日期依据 |
| 标签 `tags` | 商品目录、品牌名称 |
| 子笔记 `notes` | 全部商品参数、来源链接和 UTC 抓取时间 |
| 附件 `attachments` | 当前商品的数据手册 PDF |

文库编目原来有内容，是因为 Zotero 会在转换器未设置此字段时自动填入转换器名称。本版明确设为空字符串。语言按约定固定为 `en`，不根据网页或 PDF 自动判断。

示例标题：`线性稳压器(LDO) ISL80103IRAJZ-TK Specification`。

## 日期与 WJ 编号

样例 PDF 首页原文为 **FN6660 Rev 9.00 / Mar 19, 2018**，识别为 `2018-03-19`。这是当前附件这一版的日期，不保证是手册的最初发布日期。如果已经手工填了 `2018-03`，会保留。

扩展用 Zotero 内置 PDFWorker 在本机读取第一页，无外部分析服务。支持常见英文月名日期、年月和年在前的数字日期，需要附近存在版本或日期上下文。明确标注 `REVISED` 时优先采用；无法区分多个日期时留空。只有月份就保留 `YYYY-MM` 精度。

不使用 PDF 创建／修改时间、链接目录日期、抓取时间或版权年份，也不拿原厂网站另一版手册的日期套用到当前附件。扫描件、第一页未写日期、不支持的格式或日期冲突会留空，允许手动补充。

**WJ + 数字**：从页面 `fileName: "wj170767"` 等结构判断，是商城侧文件标识；未找到官方对字母缩写的解释。它不能作为原厂版本号、日期或 DOI。样例的原厂文档号是 `FN6660`，版本是 `Rev 9.00`。条目标题不拼接 WJ 编号。

## 提取和失败处理

- 从当前商品详情字段和参数表提取信息；优先使用 `item-pdf-down` 下载链接，缺失时使用 `myPdfIframe` 预览地址。
- 仅接受 HTTPS 的立创域名 PDF；保留下载签名、移除预览锚点，避免保存无关推荐商品的附件。
- 页面未加载时监听变化；保存时字段或 PDF 缺失，最多额外请求一次当前详情页。
- 商品目录、型号、品牌或商品编号仍缺失时终止保存；只有 PDF 缺失时保存元数据，在参数笔记中明确提示。
- 下载由 Zotero 处理。遇到下载失败或链接过期，请刷新商品页，并核对条目下实际 PDF。
- 参数内容经过 HTML 转义；日期仅写入可编辑资料库内符合立创来源条件的文档，并在保存前再次检查手动日期。

本版不增加其他网站、批量抓取、价格库存跟踪、自动去重或原有条目批量更新。重复保存可能产生重复条目。

## 开发验证

开发验证需 Node.js 22+；`linkedom` 仅用于测试 DOM 解析，扩展与转换器无运行时第三方依赖。

```powershell
npm ci
npm test
npm run test:live
```

- `npm test`：20 项离线测试，覆盖字段、PDF 选择、加载与失败处理、日期格式和冲突、手动日期保护、权限变化与停用扩展。
- `npm run test:live`：抓取公开样例页面，运行转换器并下载 PDF，检查文件头，更新 `verification/`；使用模拟 Zotero 接口，不写入个人资料库。
- `tests/zotero-smoke.js`：独立 Zotero 测试资料库中的集成验证片段。由测试环境注入路径，不属于发布插件，不要在个人资料库运行。

2026-10-17 验证通过：20 项离线测试、公开页面抓取及 PDF 下载，以及独立资料库内的真实 Zotero 9.0.6 扩展运行。真实测试验证了安装转换器、下载 PDF、自动填入 `2018-03-19`，并保留已有的 `2018-03` 手动日期。原始测试资料库和本地验证记录不随发布包提供；浏览器 Connector 的按钮点击流程仍需在安装后确认。

v0.1.0 另已验证电阻 `C21190`、电容 `C1525` 的元数据和 PDF 下载；这些记录不代表已覆盖所有厂商日期格式。

ZIP 包包含源码、文档、测试和可安装 XPI，不含 `node_modules`、测试资料库或样例 PDF。网页结构变化时优先检查 `readDetails`、`readProduct` 和 `pdfURL`。

Zotero 9 要求清单包含 `update_url`。本项目使用最新 GitHub Release 的 `updates.json`，包含版本、Zotero 兼容范围、XPI 下载地址和 SHA-256。发布新版时需同步更新插件版本与更新清单，并上传对应 XPI。

参考：[转换器开发](https://www.zotero.org/support/dev/translators)、[Scaffold](https://www.zotero.org/support/dev/translators/scaffold)、[扩展开发](https://www.zotero.org/support/dev/zotero_7_for_developers)。

代码许可证：AGPL-3.0-or-later；网页片段与下载手册归原权利人所有。
