package kr.lessondeck.app;

import android.app.Activity;
import android.content.ActivityNotFoundException;
import android.content.ClipData;
import android.content.ClipboardManager;
import android.content.Context;
import android.content.Intent;
import android.net.Uri;
import android.util.Base64;
import androidx.core.content.FileProvider;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import java.io.File;
import java.io.FileOutputStream;

/**
 * AI로 보내기 (v0.31): 판서한 페이지 그림을 고른 AI 앱(Claude·ChatGPT·Gemini)에 바로 공유한다.
 * share({ package, data(base64), mime, name, text }) → { via: "app" | "chooser" }
 * - 그림은 앱 캐시 ai-share/ 에 쓰고 FileProvider 주소로 넘긴다 (읽기 권한만, 1시간 지난 파일은 다음 보내기 때 지움).
 * - 적은 말은 EXTRA_TEXT로 넘기고, 그 앱이 글을 받지 않을 때를 위해 기기 클립보드에도 담는다.
 * - 그 앱이 없거나 그림 공유를 받지 않으면 안드로이드 공유 창을 연다.
 */
@CapacitorPlugin(name = "AiShare")
public class AiSharePlugin extends Plugin {

    private static final long KEEP_MS = 60L * 60L * 1000L;

    @PluginMethod
    public void share(PluginCall call) {
        String pkg = call.getString("package", "");
        String data = call.getString("data");
        String mime = call.getString("mime", "image/jpeg");
        String name = safeName(call.getString("name", "lessondeck-ai.jpg"));
        String text = call.getString("text", "");
        if (data == null || data.isEmpty()) {
            call.reject("보낼 그림이 없습니다");
            return;
        }
        Activity activity = getActivity();
        Context context = getContext();
        // 파일 쓰기는 화면 스레드 밖에서
        new Thread(() -> {
            final Uri uri = writeShareFile(context, name, data);
            if (uri == null) {
                call.reject("그림을 준비하지 못했습니다");
                return;
            }
            activity.runOnUiThread(() -> launch(call, activity, uri, mime, text, pkg));
        }).start();
    }

    /** 앱 캐시 ai-share/ 에 그림을 쓰고 FileProvider 주소를 돌려준다. 못 쓰면 null */
    private static Uri writeShareFile(Context context, String name, String data) {
        try {
            File dir = new File(context.getCacheDir(), "ai-share");
            if (!dir.exists() && !dir.mkdirs()) return null;
            File[] old = dir.listFiles();
            long now = System.currentTimeMillis();
            if (old != null) for (File f : old) if (now - f.lastModified() > KEEP_MS) f.delete();
            File file = new File(dir, name);
            try (FileOutputStream out = new FileOutputStream(file)) {
                out.write(Base64.decode(data, Base64.DEFAULT));
            }
            return FileProvider.getUriForFile(context, context.getPackageName() + ".fileprovider", file);
        } catch (Exception e) {
            return null;
        }
    }

    private void launch(PluginCall call, Activity activity, Uri uri, String mime, String text, String pkg) {
        try {
            Intent send = new Intent(Intent.ACTION_SEND);
            send.setType(mime);
            send.putExtra(Intent.EXTRA_STREAM, uri);
            if (text != null && !text.isEmpty()) {
                send.putExtra(Intent.EXTRA_TEXT, text);
                ClipboardManager cm = (ClipboardManager) activity.getSystemService(Context.CLIPBOARD_SERVICE);
                if (cm != null) cm.setPrimaryClip(ClipData.newPlainText("레슨덱 AI", text));
            }
            send.setClipData(ClipData.newRawUri("", uri));
            send.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);

            Intent direct = new Intent(send);
            if (!pkg.isEmpty()) direct.setPackage(pkg);
            String via = "app";
            Intent target = direct;
            if (pkg.isEmpty() || direct.resolveActivity(activity.getPackageManager()) == null) {
                target = Intent.createChooser(send, "AI 앱 고르기");
                via = "chooser";
            }
            activity.startActivity(target);
            JSObject result = new JSObject();
            result.put("via", via);
            call.resolve(result);
        } catch (ActivityNotFoundException e) {
            call.reject("그림을 받을 앱이 없습니다");
        } catch (Exception e) {
            call.reject("보내지 못했습니다");
        }
    }

    /** 파일 이름에 경로가 섞이지 않게 */
    private static String safeName(String name) {
        String n = name.replaceAll("[^A-Za-z0-9._-]", "_");
        if (n.isEmpty() || n.startsWith(".")) n = "lessondeck-ai.jpg";
        return n;
    }
}
