package kr.lessondeck.app;

import android.app.Activity;
import android.content.ClipData;
import android.content.ClipDescription;
import android.content.ClipboardManager;
import android.content.ContentResolver;
import android.content.Context;
import android.net.Uri;
import android.util.Base64;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import java.io.ByteArrayOutputStream;
import java.io.InputStream;

/**
 * 다른 앱에서 복사한 것 읽기 (기기 클립보드의 첫 항목).
 * 웹뷰의 navigator.clipboard는 안드로이드 앱에서 읽기 권한을 받을 수 없어 네이티브로 읽는다.
 * - 그림(content URI): { type: "image", mime, data(base64) }
 * - 글·웹 주소: { type: "text", text }
 * - 없음·읽을 수 없는 형식: { type: "empty" }
 */
@CapacitorPlugin(name = "SystemClipboard")
public class SystemClipboardPlugin extends Plugin {

    /** 이보다 큰 그림은 읽지 않는다 */
    private static final int MAX_IMAGE_BYTES = 25 * 1024 * 1024;

    @PluginMethod
    public void read(PluginCall call) {
        Activity activity = getActivity();
        // 안드로이드 10부터 앱이 앞에 있을 때만 읽을 수 있다 (화면에 보이는 앱이 누른 직후라 괜찮다)
        activity.runOnUiThread(() -> {
            try {
                ClipboardManager cm = (ClipboardManager) activity.getSystemService(Context.CLIPBOARD_SERVICE);
                ClipData clip = cm == null ? null : cm.getPrimaryClip();
                if (clip == null || clip.getItemCount() == 0) {
                    resolveEmpty(call);
                    return;
                }
                ClipDescription desc = clip.getDescription();
                ClipData.Item item = clip.getItemAt(0);
                Uri uri = item.getUri();
                if (uri != null) {
                    String mime = imageMime(activity.getContentResolver(), uri, desc);
                    if (mime != null) {
                        // 파일 읽기는 화면 스레드 밖에서
                        new Thread(() -> readImage(call, activity.getContentResolver(), uri, mime, item, activity)).start();
                        return;
                    }
                }
                resolveText(call, item, activity);
            } catch (SecurityException e) {
                call.reject("클립보드를 읽을 수 없습니다");
            } catch (Exception e) {
                call.reject("클립보드를 읽지 못했습니다");
            }
        });
    }

    private static String imageMime(ContentResolver resolver, Uri uri, ClipDescription desc) {
        String scheme = uri.getScheme();
        if (!"content".equals(scheme) && !"file".equals(scheme)) return null;
        String mime = null;
        try {
            mime = resolver.getType(uri);
        } catch (Exception ignored) {
            // 형식을 알려 주지 않는 앱
        }
        if (mime != null && mime.startsWith("image/")) return mime;
        if (desc != null) {
            for (int i = 0; i < desc.getMimeTypeCount(); i++) {
                String m = desc.getMimeType(i);
                if (m != null && m.startsWith("image/")) return m;
            }
        }
        return null;
    }

    private static void readImage(PluginCall call, ContentResolver resolver, Uri uri, String mime, ClipData.Item item, Activity activity) {
        try (InputStream in = resolver.openInputStream(uri)) {
            if (in == null) throw new IllegalStateException("no stream");
            ByteArrayOutputStream out = new ByteArrayOutputStream();
            byte[] buf = new byte[64 * 1024];
            int n;
            int total = 0;
            while ((n = in.read(buf)) > 0) {
                total += n;
                if (total > MAX_IMAGE_BYTES) {
                    call.reject("그림이 너무 큽니다 (25MB까지)");
                    return;
                }
                out.write(buf, 0, n);
            }
            JSObject result = new JSObject();
            result.put("type", "image");
            result.put("mime", mime);
            result.put("data", Base64.encodeToString(out.toByteArray(), Base64.NO_WRAP));
            call.resolve(result);
        } catch (Exception e) {
            // 그림을 열 수 없으면(권한 등) 글로라도
            activity.runOnUiThread(() -> resolveText(call, item, activity));
        }
    }

    private static void resolveText(PluginCall call, ClipData.Item item, Activity activity) {
        CharSequence text = item.getText();
        Uri uri = item.getUri();
        if (text == null && uri != null) {
            String scheme = uri.getScheme();
            // 웹 주소는 글로, 그 밖의 파일 주소(content://)는 붙이지 않는다
            if ("http".equals(scheme) || "https".equals(scheme)) text = uri.toString();
        }
        if (text == null && item.getIntent() == null && uri == null) text = item.coerceToText(activity);
        if (text == null || text.toString().trim().isEmpty()) {
            resolveEmpty(call);
            return;
        }
        JSObject result = new JSObject();
        result.put("type", "text");
        result.put("text", text.toString());
        call.resolve(result);
    }

    private static void resolveEmpty(PluginCall call) {
        JSObject result = new JSObject();
        result.put("type", "empty");
        call.resolve(result);
    }
}
