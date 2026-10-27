package kr.lessondeck.app;

import android.app.Activity;
import android.content.ActivityNotFoundException;
import android.content.Intent;
import android.graphics.Bitmap;
import android.graphics.Canvas;
import android.graphics.Rect;
import android.net.Uri;
import android.os.Build;
import android.os.Handler;
import android.os.Looper;
import android.util.Base64;
import android.view.PixelCopy;
import android.webkit.WebView;
import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import java.io.ByteArrayOutputStream;
import java.util.ArrayList;
import java.util.List;
import org.json.JSONException;

/**
 * 웹 주소 페이지 도우미.
 * - setHosts: 지금 문서의 웹 주소 페이지 사이트 목록 (FrameProxy가 그 사이트에만 쓴다)
 * - openExternal: 바깥 브라우저(또는 그 주소를 여는 앱)로 열기
 * - snapshot: 화면의 한 부분(웹 주소 페이지)을 찍어 페이지 바 미리보기 그림으로
 */
@CapacitorPlugin(name = "WebFrames")
public class WebFramesPlugin extends Plugin {

    @PluginMethod
    public void setHosts(PluginCall call) {
        JSArray array = call.getArray("hosts", new JSArray());
        List<String> hosts = new ArrayList<>();
        try {
            List<Object> items = array.toList();
            for (Object o : items) {
                if (o instanceof String) hosts.add((String) o);
            }
        } catch (JSONException e) {
            call.reject("사이트 목록을 읽지 못했습니다");
            return;
        }
        FrameProxy.setHosts(hosts);
        call.resolve();
    }

    @PluginMethod
    public void openExternal(PluginCall call) {
        String url = call.getString("url");
        if (url == null || url.isEmpty()) {
            call.reject("주소가 없습니다");
            return;
        }
        try {
            Intent intent = new Intent(Intent.ACTION_VIEW, Uri.parse(url));
            intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            getActivity().startActivity(intent);
            call.resolve();
        } catch (ActivityNotFoundException e) {
            call.reject("이 주소를 열 앱이 없습니다");
        }
    }

    @PluginMethod
    public void snapshot(PluginCall call) {
        double x = call.getDouble("x", 0.0);
        double y = call.getDouble("y", 0.0);
        double width = call.getDouble("width", 0.0);
        double height = call.getDouble("height", 0.0);
        int outWidth = call.getInt("outWidth", 320);
        Activity activity = getActivity();
        activity.runOnUiThread(() -> {
            try {
                WebView webView = getBridge().getWebView();
                float density = webView.getResources().getDisplayMetrics().density;
                int[] loc = new int[2];
                webView.getLocationInWindow(loc);
                int left = Math.max(0, loc[0] + (int) Math.round(x * density));
                int top = Math.max(0, loc[1] + (int) Math.round(y * density));
                int right = Math.min(loc[0] + webView.getWidth(), loc[0] + (int) Math.round((x + width) * density));
                int bottom = Math.min(loc[1] + webView.getHeight(), loc[1] + (int) Math.round((y + height) * density));
                if (right - left < 8 || bottom - top < 8) {
                    call.reject("찍을 영역이 없습니다");
                    return;
                }
                Rect src = new Rect(left, top, right, bottom);
                Bitmap bitmap = Bitmap.createBitmap(src.width(), src.height(), Bitmap.Config.ARGB_8888);
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                    // 화면에 실제로 보이는 그대로 (iframe·영상까지)
                    PixelCopy.request(
                        activity.getWindow(),
                        src,
                        bitmap,
                        (result) -> {
                            if (result == PixelCopy.SUCCESS) resolveImage(call, bitmap, outWidth);
                            else call.reject("화면을 찍지 못했습니다 (" + result + ")");
                        },
                        new Handler(Looper.getMainLooper())
                    );
                } else {
                    Canvas canvas = new Canvas(bitmap);
                    canvas.translate(-(src.left - loc[0]), -(src.top - loc[1]));
                    webView.draw(canvas);
                    resolveImage(call, bitmap, outWidth);
                }
            } catch (Exception e) {
                call.reject("화면을 찍지 못했습니다");
            }
        });
    }

    private static void resolveImage(PluginCall call, Bitmap bitmap, int outWidth) {
        int w = Math.max(1, Math.min(outWidth, bitmap.getWidth()));
        int h = Math.max(1, Math.round(bitmap.getHeight() * (w / (float) bitmap.getWidth())));
        Bitmap scaled = Bitmap.createScaledBitmap(bitmap, w, h, true);
        ByteArrayOutputStream out = new ByteArrayOutputStream();
        scaled.compress(Bitmap.CompressFormat.JPEG, 72, out);
        JSObject result = new JSObject();
        result.put("dataUrl", "data:image/jpeg;base64," + Base64.encodeToString(out.toByteArray(), Base64.NO_WRAP));
        call.resolve(result);
    }
}
