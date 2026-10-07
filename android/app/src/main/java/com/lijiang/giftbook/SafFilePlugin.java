package com.lijiang.giftbook;

import android.content.Intent;
import android.net.Uri;
import android.provider.DocumentsContract;

import androidx.activity.result.ActivityResult;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.ActivityCallback;
import com.getcapacitor.annotation.CapacitorPlugin;

import java.io.ByteArrayOutputStream;
import java.io.InputStream;
import java.io.OutputStream;
import java.nio.charset.StandardCharsets;

/**
 * SAF 文件选择器（Storage Access Framework）。
 *
 * ==================== 为什么要自己写 ====================
 *
 * 涛哥要求「导出到 Download、提示写明路径、支持自定义目录、恢复时定位到备份目录」。
 * 我先查了 @capacitor/filesystem 能不能做，结论是**不行**：
 *
 *   Directory.ExternalStorage 的官方文档原文：
 *   "On Android 10 it's not accessible unless the app enables legacy
 *    External Storage by adding android:requestLegacyExternalStorage"
 *   "**It's not accessible on Android 11 or newer.**"
 *
 * 本项目 targetSdk = 36，必然是 Android 11+，
 * 所以任何「直接写入 Download 目录」的方案都走不通，
 * 强行做只能加 requestLegacyExternalStorage（已废弃的兼容模式），
 * 在 Android 11+ 上**依然无效**，只是白写。
 *
 * ==================== 正确做法 ====================
 *
 * 用系统的 SAF：调起系统自带的「文件选择器 / 另存为」对话框。
 * 好处：
 *   1. **零存储权限** —— 用户通过系统对话框授权，绕开权限墙
 *   2. **用户可以选任意目录** —— 满足「自定义导出路径」
 *   3. **能拿到真实文件名** —— 满足「提示写明导出位置」
 *   4. **恢复时可定位目录** —— 用 EXTRA_INITIAL_URI 直接打开上次导出的文件夹
 *
 * ==================== 一处踩过的坑 ====================
 *
 * 我第一版写的是：
 *     createLauncher = registerForActivityResult(
 *         new ActivityResultContracts.StartActivityForResult(), ...);
 *
 * 编译直接失败：
 *     error: cannot find symbol
 *     symbol: method registerForActivityResult(...)
 *     location: class SafFilePlugin
 *
 * 原因：**registerForActivityResult 是 ComponentActivity / Fragment 的方法，
 * Capacitor 的 Plugin 类没有这个方法**（它只是普通 Java 类，不是 Activity）。
 *
 * 正确做法是用 Capacitor 自己封的那一套：
 *     startActivityForResult(call, intent, "callbackName");   启动
 *     @ActivityCallback
 *     private void handleXxx(PluginCall call, ActivityResult result) { }
 *
 * 而且 startActivityForResult 内部会 bridge.saveCall(call)，
 * **PluginCall 会自动带回回调**，不需要自己用字段存。
 */
@CapacitorPlugin(name = "SafFile")
public class SafFilePlugin extends Plugin {

    /** 上次操作所在目录，导出/恢复都用它定位（满足「恢复时打开备份文件夹」） */
    private String lastDirUri;

    /* ==================== 导出 ==================== */

    /**
     * 调起「另存为」，用户选好路径后把 content 写进去。
     *
     * @param filename 预填的文件名（用户可改）
     * @param mime     MIME 类型
     * @param content  文件内容
     */
    @PluginMethod
    public void saveAs(PluginCall call) {
        if (getActivity() == null) {
            call.reject("没有活动上下文，无法调起文件选择器");
            return;
        }
        String filename = call.getString("filename", "backup.json");
        String mime = call.getString("mime", "application/json");

        Intent i = new Intent(Intent.ACTION_CREATE_DOCUMENT);
        // 必须带这一行，否则部分机型只显示「新建文件夹」而看不到保存按钮
        i.addCategory(Intent.CATEGORY_OPENABLE);
        i.setType(mime);
        i.putExtra(Intent.EXTRA_TITLE, filename);
        if (lastDirUri != null) {
            i.putExtra(DocumentsContract.EXTRA_INITIAL_URI, Uri.parse(lastDirUri));
        }
        startActivityForResult(call, i, "handleSaveResult");
    }

    @ActivityCallback
    private void handleSaveResult(PluginCall call, ActivityResult result) {
        Uri uri = result.getData() == null ? null : result.getData().getData();
        if (result.getResultCode() != android.app.Activity.RESULT_OK || uri == null) {
            // 用户取消 —— 不是错误，正常返回
            JSObject ret = new JSObject();
            ret.put("canceled", true);
            call.resolve(ret);
            return;
        }
        try {
            rememberParent(uri);
            String content = call.getString("content", "");
            try (OutputStream os = getContext().getContentResolver().openOutputStream(uri, "wt")) {
                if (os == null) throw new IllegalStateException("无法写入所选位置");
                os.write(content.getBytes(StandardCharsets.UTF_8));
                os.flush();
            }
            JSObject ret = new JSObject();
            ret.put("canceled", false);
            // 真实文件名，界面要显示给用户看
            ret.put("name", displayName(uri));
            ret.put("uri", uri.toString());
            call.resolve(ret);
        } catch (Exception e) {
            call.reject("写入失败：" + e.getMessage());
        }
    }

    /* ==================== 恢复 ==================== */

    /**
     * 调起系统文件选择器读取文件。
     *
     * MIME 用 * / * 加 EXTRA_MIME_TYPES 过滤：很多文件管理器会把 .json
     * 归到 text/plain 或 octet-stream，只传 application/json 会漏掉。
     */
    @PluginMethod
    public void pick(PluginCall call) {
        if (getActivity() == null) {
            call.reject("没有活动上下文，无法调起文件选择器");
            return;
        }
        Intent i = new Intent(Intent.ACTION_OPEN_DOCUMENT);
        i.addCategory(Intent.CATEGORY_OPENABLE);
        i.setType("*/*");
        i.putExtra(Intent.EXTRA_MIME_TYPES,
                new String[]{"application/json", "text/plain", "text/csv", "*/*"});
        if (lastDirUri != null) {
            i.putExtra(DocumentsContract.EXTRA_INITIAL_URI, Uri.parse(lastDirUri));
        }
        startActivityForResult(call, i, "handlePickResult");
    }

    @ActivityCallback
    private void handlePickResult(PluginCall call, ActivityResult result) {
        Uri uri = result.getData() == null ? null : result.getData().getData();
        if (result.getResultCode() != android.app.Activity.RESULT_OK || uri == null) {
            JSObject ret = new JSObject();
            ret.put("canceled", true);
            call.resolve(ret);
            return;
        }
        try {
            rememberParent(uri);
            String text;
            try (InputStream in = getContext().getContentResolver().openInputStream(uri)) {
                if (in == null) throw new IllegalStateException("无法读取所选文件");
                ByteArrayOutputStream bos = new ByteArrayOutputStream();
                byte[] buf = new byte[8192];
                int n;
                while ((n = in.read(buf)) > 0) bos.write(buf, 0, n);
                text = new String(bos.toByteArray(), StandardCharsets.UTF_8);
            }
            JSObject ret = new JSObject();
            ret.put("canceled", false);
            ret.put("name", displayName(uri));
            ret.put("uri", uri.toString());
            ret.put("content", text);
            call.resolve(ret);
        } catch (Exception e) {
            call.reject("读取失败：" + e.getMessage());
        }
    }

    /* ==================== 辅助 ==================== */

    /** 记住所在目录，下次导出/恢复直接定位过去 */
    private void rememberParent(Uri uri) {
        String s = uri.toString();
        int slash = s.lastIndexOf('/');
        lastDirUri = slash > 0 ? s.substring(0, slash) : null;
    }

    /** 用户可读的文件名。SAF 的 content URI 不可直接展示，要转成能看懂的形式。 */
    private String displayName(Uri uri) {
        String name = null;
        try (android.database.Cursor c = getContext().getContentResolver()
                .query(uri, null, null, null, null)) {
            if (c != null && c.moveToFirst()) {
                int idx = c.getColumnIndex(android.provider.OpenableColumns.DISPLAY_NAME);
                if (idx >= 0) name = c.getString(idx);
            }
        } catch (Exception ignored) {
            // 部分第三方文件管理器不支持查询，忽略
        }
        if (name == null || name.isEmpty()) {
            String s = uri.toString();
            int slash = s.lastIndexOf('/');
            name = slash >= 0 ? s.substring(slash + 1) : s;
        }
        return name;
    }
}
