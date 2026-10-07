package com.lijiang.giftbook;

import android.app.Activity;
import android.content.Intent;
import android.net.Uri;
import android.provider.DocumentsContract;

import androidx.activity.result.ActivityResult;
import androidx.activity.result.ActivityResultCallback;
import androidx.activity.result.ActivityResultLauncher;
import androidx.activity.result.contract.ActivityResultContracts;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

import java.io.InputStream;
import java.nio.charset.StandardCharsets;

/**
 * SAF 文件选择器（Storage Access Framework）。
 *
 * ==================== 为什么要自己写 ====================
 *
 * 涛哥要求「导出到 Download、提示写明路径、支持自定义目录、恢复时定位到备份目录」。
 * 我先查了 @capacitor/filesystem 插件能不能做，结论是**不行**：
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
 *   3. **能拿到真实路径** —— 满足「提示写明导出位置」
 *   4. **恢复时可定位目录** —— 用 EXTRA_INITIAL_URI 直接打开上次导出的文件夹
 *
 * ACTION_CREATE_DOCUMENT → 导出（另存为）
 * ACTION_OPEN_DOCUMENT   → 恢复（选择已有文件）
 */
@CapacitorPlugin(name = "SafFile")
public class SafFilePlugin extends Plugin {

    /** 导出时的待写内容。选好路径后回调里真正落盘。 */
    private String pendingContent;
    private PluginCall pendingCall;
    private String lastDirUri;

    private ActivityResultLauncher<Intent> createLauncher;
    private ActivityResultLauncher<Intent> openLauncher;

    @Override
    public void load() {
        // 导出：系统「另存为」对话框
        createLauncher = registerForActivityResult(
                new ActivityResultContracts.StartActivityForResult(),
                new ActivityResultCallback<ActivityResult>() {
                    @Override
                    public void onActivityResult(ActivityResult result) {
                        handleCreateResult(result);
                    }
                });

        // 恢复：系统文件选择器
        openLauncher = registerForActivityResult(
                new ActivityResultContracts.StartActivityForResult(),
                new ActivityResultCallback<ActivityResult>() {
                    @Override
                    public void onActivityResult(ActivityResult result) {
                        handleOpenResult(result);
                    }
                });
    }

    /* ==================== 导出 ==================== */

    /**
     * 调起「另存为」，用户选好路径后把 content 写进去。
     *
     * @param filename 预填的文件名（用户可改）
     * @param mime     MIME 类型
     * @param content  文件内容的字符串形式
     */
    @PluginMethod
    public void saveAs(PluginCall call) {
        String filename = call.getString("filename", "backup.json");
        String mime = call.getString("mime", "application/json");
        String content = call.getString("content", "");

        if (getActivity() == null) {
            call.reject("没有活动上下文，无法调起文件选择器");
            return;
        }

        pendingContent = content;
        pendingCall = call;

        Intent i = new Intent(Intent.ACTION_CREATE_DOCUMENT);
        // 必须带这一行，否则部分机型只显示「新建文件夹」而看不到保存按钮
        i.addCategory(Intent.CATEGORY_OPENABLE);
        i.setType(mime);
        i.putExtra(Intent.EXTRA_TITLE, filename);
        // 定位到上次导出的目录，减少用户翻目录的次数
        if (lastDirUri != null) {
            i.putExtra(DocumentsContract.EXTRA_INITIAL_URI, Uri.parse(lastDirUri));
        }

        try {
            createLauncher.launch(i);
        } catch (Exception e) {
            pendingCall = null;
            call.reject("调起文件选择器失败：" + e.getMessage());
        }
    }

    private void handleCreateResult(ActivityResult result) {
        PluginCall call = pendingCall;
        String content = pendingContent;
        pendingCall = null;
        pendingContent = null;
        if (call == null) return;

        Uri uri = result.getData() == null ? null : result.getData().getData();
        if (result.getResultCode() != Activity.RESULT_OK || uri == null) {
            // 用户取消 —— 不是错误，正常返回
            JSObject ret = new JSObject();
            ret.put("canceled", true);
            call.resolve(ret);
            return;
        }

        try {
            // 记住所在目录，下次导出/恢复直接定位过去
            String parent = uri.toString();
            int slash = parent.lastIndexOf('/');
            lastDirUri = slash > 0 ? parent.substring(0, slash) : null;

            // "wt" = write + truncate
            try (OutputStreamHolder holder = new OutputStreamHolder(
                    getContext().getContentResolver().openOutputStream(uri, "wt"))) {
                holder.write(content);
            }

            JSObject ret = new JSObject();
            ret.put("canceled", false);
            // 把真实路径告诉前端，界面要显示给用户看
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
     * @param mime 可接受的类型；备份传 "application/json"，
     *             但很多文件管理器会把 .json 归到 octet-stream，
     *             所以用 * / * 加扩展名过滤更稳
     */
    @PluginMethod
    public void pick(PluginCall call) {
        if (getActivity() == null) {
            call.reject("没有活动上下文，无法调起文件选择器");
            return;
        }
        pendingCall = call;

        Intent i = new Intent(Intent.ACTION_OPEN_DOCUMENT);
        i.addCategory(Intent.CATEGORY_OPENABLE);
        // 用 * / * 再靠 EXTRA_MIME_TYPES 过滤，只用 json 会漏掉
        // 某些机型上被标成 text/plain 或 octet-stream 的 .json 文件
        i.setType("*/*");
        i.putExtra(Intent.EXTRA_MIME_TYPES,
                new String[]{"application/json", "text/plain", "text/csv", "*/*"});
        // 定位到上次导出目录 —— 满足涛哥「恢复时默认打开备份文件夹」
        if (lastDirUri != null) {
            i.putExtra(DocumentsContract.EXTRA_INITIAL_URI, Uri.parse(lastDirUri));
        }

        try {
            openLauncher.launch(i);
        } catch (Exception e) {
            pendingCall = null;
            call.reject("调起文件选择器失败：" + e.getMessage());
        }
    }

    private void handleOpenResult(ActivityResult result) {
        PluginCall call = pendingCall;
        pendingCall = null;
        if (call == null) return;

        Uri uri = result.getData() == null ? null : result.getData().getData();
        if (result.getResultCode() != Activity.RESULT_OK || uri == null) {
            JSObject ret = new JSObject();
            ret.put("canceled", true);
            call.resolve(ret);
            return;
        }

        try {
            String parent = uri.toString();
            int slash = parent.lastIndexOf('/');
            lastDirUri = slash > 0 ? parent.substring(0, slash) : null;

            String text;
            try (InputStream in = getContext().getContentResolver().openInputStream(uri)) {
                if (in == null) throw new IllegalStateException("无法读取所选文件");
                text = readAll(in);
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

    /** 用户可读的路径提示。SAF 的 content URI 不可直接展示，转成能看懂的形式。 */
    private String displayName(Uri uri) {
        String name = queryDisplayName(uri);
        if (name == null || name.isEmpty()) {
            // 部分第三方文件管理器不支持查询 DISPLAY_NAME，退回 URI 尾段
            String s = uri.toString();
            int slash = s.lastIndexOf('/');
            name = slash >= 0 ? s.substring(slash + 1) : s;
        }
        return name;
    }

    private String queryDisplayName(Uri uri) {
        try (android.database.Cursor c = getContext().getContentResolver()
                .query(uri, null, null, null, null)) {
            if (c != null && c.moveToFirst()) {
                int idx = c.getColumnIndex(android.provider.OpenableColumns.DISPLAY_NAME);
                if (idx >= 0) return c.getString(idx);
            }
        } catch (Exception ignored) {
            // 部分提供器不支持查询，忽略
        }
        return null;
    }

    private static String readAll(InputStream in) throws Exception {
        java.io.ByteArrayOutputStream bos = new java.io.ByteArrayOutputStream();
        byte[] buf = new byte[8192];
        int n;
        while ((n = in.read(buf)) > 0) bos.write(buf, 0, n);
        return new String(bos.toByteArray(), StandardCharsets.UTF_8);
    }

    /** 让 try-with-resources 能处理可能为 null 的流 */
    private static final class OutputStreamHolder implements AutoCloseable {
        private final java.io.OutputStream os;
        OutputStreamHolder(java.io.OutputStream os) { this.os = os; }
        void write(String s) throws Exception {
            if (os == null) throw new IllegalStateException("无法写入所选位置");
            os.write(s.getBytes(StandardCharsets.UTF_8));
            os.flush();
        }
        @Override public void close() throws Exception {
            if (os != null) os.close();
        }
    }
}
