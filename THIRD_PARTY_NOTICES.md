# 第三方声明与致谢

## 映间 MARGIN

Bilibili Desktop 的网页重设计与大部分网页增强功能来自 **映间 MARGIN**，不是本项目重新实现的功能。

- 项目：<https://github.com/jiuyang5354/bilibili-margin>
- 作者：jiuyang5354
- 初始内置版本：0.41.0
- 许可证：MIT，全文位于 [extensions/margin/LICENSE](extensions/margin/LICENSE)。
- 上游设计来源与署名：[ATTRIBUTION.md](extensions/margin/ATTRIBUTION.md)，原文来自[上游设计参考与致谢](https://github.com/jiuyang5354/bilibili-margin/blob/main/docs/design-references.md)。

本项目为内置扩展增加固定 `key`，用来保持安装与更新前后的扩展身份；同时附带许可证和署名文件。扩展代码的版权和许可归原作者及相关权利人所有。后续下载的更新包也会保留这些文件。

## 字体

MARGIN 随包提供字体及子集；它们不受本项目代码的 MIT 许可证替代。

| 字体 / 打包名称                    | 权利人 / 来源                   | 许可与文本                                                                                                                       |
| ---------------------------------- | ------------------------------- | -------------------------------------------------------------------------------------------------------------------------------- |
| Geist / Geist Mono                 | Vercel                          | [SIL OFL 1.1](extensions/margin/fonts/licenses/Geist-OFL.txt)                                                                    |
| Noto Sans SC / Margin Sans SC      | Google / Adobe                  | [SIL OFL 1.1](extensions/margin/fonts/licenses/NotoSansSC-OFL.txt)                                                               |
| LXGW Neo ZhiSong / Margin Serif SC | LXGW；原始字体来源见上游仓库    | [IPA Font License 1.0](extensions/margin/fonts/licenses/LXGW-IPA.md)；[原始字体与源文件](https://github.com/lxgw/LxgwNeoZhiSong) |
| Instrument Serif                   | Instrument / Rodrigo Fuenzalida | [SIL OFL 1.1](extensions/margin/fonts/licenses/InstrumentSerif-OFL.txt)                                                          |
| Alte Haas Grotesk / MarginGrotesk  | Yann Le Coroller                | [随字体分发的 freeware 授权](extensions/margin/fonts/licenses/AlteHaasGrotesk-licence.rtf)                                       |
| Pirkkala / MarginPixel             | Otto Ojala                      | [作者对个人及商业使用的授权](extensions/margin/fonts/licenses/Pirkkala-PERMISSION.txt)                                           |

中文字体子集与切片由 MARGIN 提供，保留其派生命名。原始字体来源、构建方式和子集说明见 [MARGIN 字体说明](extensions/margin/fonts/FONTS-LICENSES.md) 与[上游 fonts-src](https://github.com/jiuyang5354/bilibili-margin/tree/main/fonts-src)。

原始字体获取与替换方法见 [字体替换说明](licenses/fonts/REPLACEMENT.md)。

## 运行时依赖

- Electron / Chromium / Node.js：各自的许可证随 Electron 分发包保留，包括 `LICENSE` 与 `LICENSES.chromium.html`。
- electron-squirrel-startup、debug、ms、yauzl、pend：许可证副本位于 [licenses/runtime](licenses/runtime)。
- MARGIN 中的第三方设计、算法与着色器来源保留在其署名文件中；Paper Shaders 衍生部分涉及的 Apache-2.0 全文见 [licenses/Apache-2.0.txt](licenses/Apache-2.0.txt)。

## 品牌、图标与内容

Bilibili Desktop 是独立开发的非官方客户端，与哔哩哔哩、MARGIN 作者不存在官方隶属、合作或背书关系。`bilibili`、哔哩哔哩及网站展示的标识、视频、图片、弹幕等内容，其权利归各自权利人所有。

应用图标与 README 示意图由本项目以矢量图形绘制；示意图不使用参考项目的截图或第三方视频封面。网页实际显示的内容由 B 站提供，访问和使用仍适用 B 站的相关规则。

如发现署名、许可证或素材归属问题，请通过 [Issue](https://github.com/haodijia/bilibili-desktop/issues) 提供具体文件、来源及权利说明。
