# 往来礼记 - APK 打包指南

## 准备工作

你需要把项目上传到 GitHub，GitHub Actions 会自动帮你编译 APK。

---

## 步骤 1：在 GitHub 创建仓库

1. 打开 [github.com](https://github.com)，登录账号
2. 点击右上角 **+** → **New repository**
3. 仓库名称填：`wangla-liji`（随便填，能认出来就行）
4. 选择 **Private**（私有，只给你自己用）
5. 点击 **Create repository**

---

## 步骤 2：上传代码到 GitHub

打开命令行，进入项目目录，执行：

```bash
cd "E:\Deployment\WorkBuddy\往来礼记"
git init
git add .
git commit -m "first commit"
git branch -M main
git remote add origin https://github.com/你的用户名/仓库名.git
git push -u origin main
```

> ⚠️ 如果你之前没用过 GitHub 命令行，GitHub 会提示你登录，按提示在浏览器授权就行。

---

## 步骤 3：等待自动打包

推送代码后，GitHub 会自动触发构建流程：

1. 打开你的 GitHub 仓库
2. 点击顶部 **Actions** 标签
3. 可以看到 "Build Android APK" 工作流正在运行
4. 等待约 **5-10 分钟**（首次构建需要下载依赖，稍慢）
5. 构建完成后，左侧会多出一个绿色的勾 ✅

---

## 步骤 4：下载 APK

1. 点击 **Actions** → 点击最新的成功运行记录
2. 滚动到页面底部，找到 **Artifacts** 区域
3. 点击 **往来礼记-APK** 即可下载

下载下来的压缩包里会有两个文件：

- `往来礼记-v版本号-测试版.apk`（debug 包，随时能出）
- `往来礼记-v版本号-正式版.apk`（release 包，配了签名才会出）

版本号取自代码里的 `src/version.ts`，打包时自动同步 —— 文件名、关于页、手机设置里的版本号三处一定一致，不会再出现「页面 2.14.9、安装包还叫 2.14.1」这种事。

---

## 以后更新 APP

修改完代码后，只需：

```bash
cd "E:\Deployment\WorkBuddy\往来礼记"
git add .
git commit -m "更新说明"
git push
```

GitHub 会自动重新打包，新 APK 在同一个地方下载。

---

## 常见问题

**Q: 朋友安装时说"未知来源"无法安装？**
A: 在手机设置 → 安全 → 允许安装未知来源应用 → 开启即可。

**Q: APK 可以发布到应用商店吗？**
A: 可以，但需要签名。需要额外配置 keystore，这步比较复杂，建议先用着，等有需求再说。

**Q: 构建失败了怎么办？**
A: 在 Actions 页面点击失败的记录，查看日志，把错误信息发给我，我来帮你排查。
