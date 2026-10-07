package com.lijiang.giftbook;

import android.os.Bundle;
import android.webkit.WebView;

import androidx.activity.OnBackPressedCallback;

import com.getcapacitor.BridgeActivity;

/**
 * 返回键统一处理。
 *
 * ---------- 为什么必须这么写 ----------
 *
 * Android 15（API 35）起预测性返回手势默认开启，targetSdk 36 时强制。
 * 官方文档 developer.android.com/guide/navigation/predictive-back-gesture
 * 明确要求：
 *
 *   "**Stop intercepting back events using `KeyEvent.KEYCODE_BACK`.**
 *    ...intercepting back events from `KeyEvent.KEYCODE_BACK`
 *    is **no longer supported**"
 *
 * 也就是说：以前那种 `onKeyDown(KEYCODE_BACK)` / `onBackPressed()`
 * 的老写法在新系统上不再被支持，**必须**用 OnBackPressedCallback
 * （向后兼容的 AndroidX 方案）或 OnBackInvokedCallback（平台 API）。
 *
 * 用 OnBackPressedCallback 的好处：
 *   1. 三键导航的返回键、手势导航的侧滑**走同一条回调**，行为一致
 *   2. 支持预测性返回动画
 *   3. 回调可动态 enable/disable，符合官方「单一职责回调」的建议
 *
 * ---------- 分工 ----------
 *
 * 这里**不直接决定**返回去哪，而是把决定权交给 WebView 里的
 * `window.__wlOnBack__()`（见 src/lib/backStack.ts）。因为：
 *   - 弹层（Sheet / 确认框 / 日历）开不开，只有 React 知道
 *   - 路由层级、有没有可返回的上一页，只有 JS 路由知道
 *   - 主页面要不要二次确认退出，是 UI 层的决定
 *
 * JS 返回 'handled' → 什么都不做
 * JS 返回 'exit'    → 才真正 finish()（此时 JS 侧应已弹过二次确认）
 */
public class MainActivity extends BridgeActivity {

    /**
     * 注册自定义插件。
     *
     * ============ ⚠️⚠️ 时序是关键 ============
     *
     * 我第一版写成在 onCreate 里调 registerPlugin(SafFilePlugin.class)，
     * 编译通过、装上去运行时报：
     *     导出失败："SafFile" plugin is not implemented on android
     *
     * 原因：看 BridgeActivity 的实现
     * ```java
     * protected void onCreate(Bundle) {
     *     super.onCreate(...);
     *     ...
     *     this.load();                 // ← Bridge 在这里就已经建好了
     * }
     *
     * public void registerPlugin(Class<? extends Plugin> plugin) {
     *     bridgeBuilder.addPlugin(plugin);      // ← 只改 Builder，来不及了
     * }
     *
     * protected void load() {
     *     bridge = bridgeBuilder.addPlugins(initialPlugins)
     *                              .setConfig(config).create();
     * }
     * ```
     *
     * `registerPlugin` 只是往 builder 里塞了个类，
     * 而 `super.onCreate()` 里已经 `load()` 完并把 Bridge 建出来了 ——
     * **之后再改Builder 完全无效**。
     *
     * ============ 正确做法 ============
     *
     * 覆盖 load()，在 `super.load()`（真正建 Bridge）**之前**
     * 把插件类塞进 `initialPlugins`。这个字段就是 Capacitor 官方
     * 给自定义插件留的入口。
     *
     * ============ 为什么不用 capacitor.plugins.json ============
     *
     * 那个文件由 `npx cap sync` **自动生成并覆盖**，
     * 自定义插件写进去下次 sync 就没了。Capacitor 6+
     * 也取消了 capacitor.config.ts 里的 plugins 声明能力。
     */
    @Override
    protected void load() {
        initialPlugins.add(SafFilePlugin.class);
        super.load();
    }

    @Override
    public void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);

        // 单一职责回调：只管「把返回事件转给 WebView」。
        // 不在这里写任何 if/else 业务判断 —— 官方最佳实践明确说：
        // 「不要在返回事件已经发生后才做条件判断」，
        // 应该把状态表达为可观察的 enable/disable。
        getOnBackPressedDispatcher().addCallback(this,
                new OnBackPressedCallback(true) {
                    @Override
                    public void handleOnBackPressed() {
                        dispatchToWeb();
                    }
                });
    }

    /**
     * 把返回事件转给页面里的 window.__wlOnBack__()。
     *
     * 用 evaluateJavascript 而不是 addJavascriptInterface：
     *   - 不需要往 WebView 注入 Java 对象，攻击面更小
     *   - 回调本身就是异步的，匹配 JS 的同步返回值约定
     */
    private void dispatchToWeb() {
        WebView web = getBridge() != null ? getBridge().getWebView() : null;
        if (web == null) {
            // 拿不到 WebView（极少见，如引擎未初始化），退化为直接退出
            finish();
            return;
        }
        web.evaluateJavascript(
                "(function(){try{return window.__wlOnBack__?window.__wlOnBack__():'exit'}"
                        + "catch(e){return 'exit'}})()",
                value -> {
                    // value 是JS 返回值的 JSON 编码：字符串带引号，如 "\"handled\""
                    if (value == null || value.contains("exit")) {
                        // JS 说「没人管，请退出」
                        finish();
                    }
                    // 'handled' → 什么都不做，WebView 继续显示
                });
    }
}
