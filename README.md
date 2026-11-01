# Bili Desktop

独立的哔哩哔哩桌面浏览器，使用 B 站网页与 MARGIN 0.40.0 扩展。

- 搜索、视频和网页弹出的新页面在 App 标签页内打开。
- 支持后台标签页、右键打开链接、前进、后退、刷新和地址栏搜索。
- 标签页共享登录状态，登录与插件数据保存在 App 自己的数据目录。
- 工具栏右侧的 MARGIN 按钮打开原扩展设置，主题和背景也可在网页内设置。
- 扩展副本位于 `extensions/margin`，随 App 一起打包，无需保留 Downloads 中的目录。

## 开发

```sh
npm ci
npm start
```

## 检查与打包

```sh
npm run typecheck
npm run lint
npm run package
```

macOS Apple Silicon 的应用生成在 `out/Bili Desktop-darwin-arm64/Bili Desktop.app`，可复制到“应用程序”并保留在 Dock。

## 快捷键

| 操作                       | macOS            |
| -------------------------- | ---------------- |
| 新建 / 关闭标签页          | ⌘T / ⌘W          |
| 地址栏                     | ⌘L               |
| 刷新 / 强制刷新            | ⌘R / ⌘⇧R         |
| 前进 / 后退                | ⌘] / ⌘[          |
| 切换标签页                 | ⌃Tab / ⌃⇧Tab     |
| 第 1–8 个 / 最后一个标签页 | ⌘1–8 / ⌘9        |
| 后台打开链接               | ⌘点击 / 鼠标中键 |

首次使用需要在 App 内登录；Chrome 的登录状态、MARGIN 设置和足迹不会自动导入。
