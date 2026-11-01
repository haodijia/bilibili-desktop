# 字体来源与替换

MARGIN 使用的 Margin Serif SC 是 LXGW Neo ZhiSong 的中文子集。原始字体、源文件与许可可从以下地址取得：

- 原始项目：<https://github.com/lxgw/LxgwNeoZhiSong>
- 原始字体发行包：<https://github.com/lxgw/LxgwNeoZhiSong/releases>
- MARGIN 的子集源文件：<https://github.com/jiuyang5354/bilibili-margin/tree/main/fonts-src>
- MARGIN 的字体构建脚本：<https://github.com/jiuyang5354/bilibili-margin/tree/main/scripts>

## 使用原始字体替换子集

1. 从 LXGW Neo ZhiSong 的官方发行页下载原始 TTF / OTF 字体，保持字体文件及其内部命名不变。
2. 在本项目源码中，将原始字体文件放入 `extensions/margin/fonts/`。
3. 编辑 `extensions/margin/fonts/margin-sc.css`：删除字体族为 `Margin Serif SC` 的分片 `@font-face` 定义，保留 `Margin Sans SC` 的定义。
4. 增加一个 `@font-face`，使用 `font-family: 'Margin Serif SC'` 作为网页中的引用别名，将 `src` 指向下载的原始字体文件；TTF 使用 `format('truetype')`，OTF 使用 `format('opentype')`。
5. 按 README 从源码构建并启动 App。网页对 `Margin Serif SC` 的引用会使用原始字形。

这是网页字体引用的替换，不会更改原始字体程序内部的名称。原始字体和派生字体分别遵循 IPA Font License 1.0；全文随包保留在 `extensions/margin/fonts/licenses/LXGW-IPA.md`。

Geist、Noto Sans SC、Instrument Serif、Alte Haas Grotesk、Pirkkala 的来源与许可证见根目录 `THIRD_PARTY_NOTICES.md`。
