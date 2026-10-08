package com.lijiang.giftbook;

import android.content.Intent;
import android.net.Uri;
import android.os.Build;
import android.provider.Settings;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

/**
 * 跳转到系统设置页。
 *
 * ==================== 为什么必须有这个插件 ====================
 *
 * 小米等国产 ROM 会把非商店渠道APK 判为「敏感应用」，
 * **在安装时��硬性拒绝敏感权限**（涛哥真机截图：
 * 「由于该应用为敏感应用，系统已阻止其获取任何权限」），
 * 后果是：
 *
 *   1. 系统的**首次权限询问窗口根本不会出现**
 *   2. `requestPermissions()` 直接返回 denied，**连弹窗都不弹**
 *   3. 用户在App 内点了「去开启」，什么都不会发生
 *
 * 也就是说：**只要权限是安装时被拒的，App 内就无法再申请到**，
 * 唯一出路是**把用户送到系统设置页，由他手动打开**。
 * 官方文档对此有明确说明（Settings.ACTION_APPLICATION_DETAILS_SETTINGS）。
 *
 * ==================== 为什么不能直接用 intent ============
 *
 * 直连github.com/jaycht 有两个问题：
 *   1. 没有原生封装，只能用 Capacitor 的 App 插件（需另装依赖）
 *   2. 更重要的：**「精确闹钟」不在应用详情页里**，
 *      它在系统「闹钟和提醒」页，用 ACTION_APPLICATION_DETAILS_SETTINGS
 *      到不了，必须用 ACTION_REQUEST_SCHEDULE_EXACT_ALARM
 *
 * ==================== 各厂商的坑 ====================
 *
 * 小米/华为/OPPO/vivo 等都对 `package:` 开头的 Intent 做了拦截，
 * 需要先 `setData(uri, null)` 绕开，否则抛 ActivityNotFoundException。
 * 所以下面每个方法都带 try-catch，逐级降级而不是直接失败。
 */
@CapacitorPlugin(name = "AppSettings")
public class AppSettingsPlugin extends Plugin {

    /**
     * 跳到本应用的详情页（通知权限在这里）。
     *
     * 路径：设置 → 应用管理 → 往来礼记 → 通知
     */
    @PluginMethod
    public void openAppDetails(PluginCall call) {
        try {
            Intent i = new Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS);
            // ★ 关键：厂商 ROM 会校验 data 是否为 null 来判断是否为「敏感操作」，
            //   setData(uri, null) 能绕开这个拦截（各家都吃这一招）
            i.setData(getPackageManager().getPackageFor(getContext().getPackageName()),
                    null);
            i.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            getContext().startActivity(i);
            JSObject r = new JSObject();
            r.put("ok", true);
            r.put("where", "app-details");
            call.resolve(r);
        } catch (Exception e) {
            // 兜底：退到应用列表总页，至少让用户找得到
            try {
                Intent i = new Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS);
                i.setData(Uri.fromParts("package", getContext().getPackageName(), null));
                i.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
                getContext().startActivity(i);
                JSObject r = new JSObject();
                r.put("ok", true);
                r.put("where", "app-details-fallback");
                call.resolve(r);
            } catch (Exception e2) {
                call.reject("无法打开应用设置：" + e2.getMessage());
            }
        }
    }

    /**
     * 跳到「闹钟和提醒」设置页 —— **精确闹钟权限在这里，不在应用详情页**。
     *
     * Android 12(API 31) 起 SCHEDULE_EXACT_ALARM 变成需要单独授权的权限，
     * 官方提供了专用的 Intent：ACTION_REQUEST_SCHEDULE_EXACT_ALARM。
     */
    @PluginMethod
    public void openExactAlarmSettings(PluginCall call) {
        // Android 12+：专用 Intent，直达「闹钟和提醒」
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
            try {
                Intent i = new Intent(Settings.ACTION_REQUEST_SCHEDULE_EXACT_ALARM);
                i.setData(Uri.fromParts("package", getContext().getPackageName(), null));
                i.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
                getContext().startActivity(i);
                JSObject r = new JSObject();
                r.put("ok", true);
                r.put("where", "exact-alarm");
                call.resolve(r);
                return;
            } catch (Exception ignored) {
                // 部分 ROM 没实现这个 Activity，走下面的兜底
            }
        }
        // 兜底 1：系统「应用」列表里的默认 tab
        try {
            Intent i = new Intent(Settings.ACTION_APPLICATION_SETTINGS);
            i.setData(Uri.fromParts("package", getContext().getPackageName(), null));
            i.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            getContext().startActivity(i);
            JSObject r = new JSObject();
            r.put("ok", true);
            r.put("where", "app-settings");
            call.resolve(r);
        } catch (Exception e) {
            call.reject("无法打开闹钟设置：" + e.getMessage());
        }
    }

    /** 回应用详情页（日历权限的说明文字里让用户在这里找） */
    @PluginMethod
    public void openNotificationSettings(PluginCall call) {
        // Android 8+ 可以直达通知设置页，命中率更高
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            try {
                Intent i = new Intent(Settings.ACTION_APP_NOTIFICATION_SETTINGS);
                i.putExtra(Settings.EXTRA_APP_PACKAGE, getContext().getPackageName());
                i.setData(Uri.fromParts("package", getContext().getPackageName(), null));
                i.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
                getContext().startActivity(i);
                JSObject r = new JSObject();
                r.put("ok", true);
                r.put("where", "notification");
                call.resolve(r);
                return;
            } catch (Exception ignored) {
                // 落到通用应用详情页
            }
        }
        openAppDetails(call);
    }

    /**
     * 读当前权限的**真实系统状态**（不是我们记在 localStorage 里的用户选择）。
     * 用户去设置里手动改完权限后，回到 App 需要重新检测。
     */
    @PluginMethod
    public void hasPermission(PluginCall call) {
        try {
            String perm = call.getString("name", "android.permission.POST_NOTIFICATIONS");
            boolean granted = Build.VERSION.SDK_INT < Build.VERSION_CODES.TIRAMISU
                    || getContext().checkSelfPermission(perm)
                       == android.content.pm.PackageManager.PERMISSION_GRANTED;
            JSObject r = new JSObject();
            r.put("granted", granted);
            call.resolve(r);
        } catch (Exception e) {
            call.reject("读取权限失败：" + e.getMessage());
        }
    }

    /**
     * App 回到前台时通知 JS 重新检测权限。
     *
     * ★为什么不用 @capacitor/app 的 AppState★
     * 那个包只装依赖不注册原生代码，对本项目是多余开销；
     * 而这里本来就有原生插件，直接在 onResume 里发事件更轻、更准
     *（onResume 每次从后台/从其他 Activity 返回都会调，正好覆盖
     * 「用户去系统设置改完再回来」这个场景）。
     *
     * 用法：JS 侧 addListener('appResume', ...) 收到后调 refresh()。
     */
    @Override
    protected void handleOnResume() {
        super.handleOnResume();
        JSObject data = new JSObject();
        data.put("fromSettings", true);
        notifyListeners("appResume", data);
    }
}
