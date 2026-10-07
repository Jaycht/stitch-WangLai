# 往来礼记

人情往来记账。**收礼与回礼双向记录**，算得出净人情。

安卓App（Capacitor 打包），数据全部存本机，不联网。

---

## 功能

### 记账
- **双向记账**：一次录入同时含「收礼」和「回礼」两侧，解决"随礼随出去了、对方回礼没记"的问题
- **支付渠道**：现金 / 微信 / 支付宝 / 转账 / 实物折现
- **人员档案**：姓名、关系（表弟/同事…）、亲属分组、电话、微信、地区、备注
- **人情净值**：收 − 回，正数=人家给得多，负数=自己多随了
- 12 类事由：结婚/订婚/生日/满月/百日/升学/乔迁/开业/丧事/忌日/祭祀/其他
- 按月分组、按时序倒序、按人筛选（全部/收礼/回礼）

### 工具
- **万年黄历**：宜忌、纳音、冲煞、值神、彭祖百忌、二十八星宿、建除十二神、12 时辰吉凶、九星、胎神、方位
- **吉日良辰**：按嫁娶/入宅/开业/安葬等事项，60~180 天内自动挑日子并评分
- **太岁查询**：值年、犯太岁生肖、平安符位
- **关系计算**：亲缘称呼速查，含宗亲/姑姻/舅眷/姨姻/其它姻亲分组

### 数据
- **本地备份**：导出 JSON 全量备份，可再导入还原
- **两种恢复模式**：覆盖恢复（清空替换）/ 合并导入（保留本机，同名人员自动归并）
- **CSV 导出**：带 BOM，Excel 双击直接打开
- 备份文件带 FNV-1a 校验和，损坏或被改动会提示
- schema 版本号 + 迁移链，旧版本数据自动升级不丢失

### 外观
- 6 种主题色（默认中国红 #B3271E）、5 种背景色
- 自定义背景图
- 明细紧凑，一屏 5 条记录

---

## 开发

```bash
npm install
npm run dev        # 本地开发
npm run build      # 构建到 dist/
npm run lint       # 类型检查
```

### 打APK

```bash
npm run build
npx cap sync android
cd android && ./gradlew assembleDebug
```

产物在 `android/app/build/outputs/apk/debug/`。

---

## 技术栈

| | |
|---|---|
| 框架 | React 19 + TypeScript |
| 构建 | Vite 6 + Tailwind CSS 4 |
| 打包 | Capacitor 8（安卓原生壳） |
| 图标 | lucide-react |
| 状态 | React useReducer + Context |
| 存储 | localStorage（带版本迁移） |
| 历法 | lunar-javascript 1.7.7（MIT，6tail） |
| 亲缘| relationship.js 1.2.9（MIT，HaoLe Zheng） |

---

## 数据存放

全部在本机浏览器/WebView 的 localStorage，**不联网、不上传**。

备份文件格式：

```json
{
  "_app": "wanglai-liji",
  "_format": 1,
  "_exportedAt": "...",
  "_counts": { "persons": 5, "records": 12 },
  "_checksum": "fnv1a:xxxxxxxx",
  "data": { "schemaVersion": 2, "persons": [], "records": [], "settings": {} }
}
```

---

## 开源依赖声明

本项目使用以下开源库，均为 MIT 协议：

- **lunar-javascript** — Copyright (c) 2018 6tail，历法计算
- **relationship.js** — Copyright (c) 2016-present HaoLe Zheng，亲缘称呼计算

---

## 免责声明

黄历、太岁、择日内容为传统民俗文化参考，婚丧嫁娶请以实际情况与家人意见为准。
