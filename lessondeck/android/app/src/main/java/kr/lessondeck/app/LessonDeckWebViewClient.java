package kr.lessondeck.app;

import android.webkit.WebResourceError;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;
import android.webkit.WebView;
import com.getcapacitor.Bridge;
import com.getcapacitor.BridgeWebViewClient;
import com.getcapacitor.JSObject;

/**
 * 웹 주소 페이지(iframe)가 하얀 화면으로 남지 않게 Capacitor 기본 동작을 고친다.
 * - iframe 안의 이동(링크, 사이트가 보낸 이동)은 그 iframe 안에서 한다. Capacitor 기본은
 *   앱 밖 주소면 무조건 바깥 브라우저로 보내고 이동을 취소해서 iframe이 하얗게 남는다.
 * - "다른 앱 안에 띄우지 마세요" 머리글이 있는 사이트는 FrameProxy가 그 머리글만 빼고 보여 준다.
 * - iframe이 열리지 않으면 이유(연결 실패, 404 등)를 앱 화면에 알린다.
 */
public class LessonDeckWebViewClient extends BridgeWebViewClient {

    private final Bridge bridge;

    public LessonDeckWebViewClient(Bridge bridge) {
        super(bridge);
        this.bridge = bridge;
    }

    @Override
    public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
        if (!request.isForMainFrame()) {
            String scheme = request.getUrl().getScheme();
            if ("http".equals(scheme) || "https".equals(scheme)) return false;
        }
        return super.shouldOverrideUrlLoading(view, request);
    }

    @Override
    public WebResourceResponse shouldInterceptRequest(WebView view, WebResourceRequest request) {
        WebResourceResponse local = super.shouldInterceptRequest(view, request);
        if (local != null) return local;
        if (FrameProxy.isFrameDocument(request)) return FrameProxy.load(request);
        return null;
    }

    @Override
    public void onReceivedError(WebView view, WebResourceRequest request, WebResourceError error) {
        super.onReceivedError(view, request, error);
        if (isFramePage(request)) report(request, error.getErrorCode(), String.valueOf(error.getDescription()));
    }

    @Override
    public void onReceivedHttpError(WebView view, WebResourceRequest request, WebResourceResponse errorResponse) {
        super.onReceivedHttpError(view, request, errorResponse);
        if (isFramePage(request)) report(request, errorResponse.getStatusCode(), errorResponse.getReasonPhrase());
    }

    /** 웹 주소 페이지 사이트의 문서 요청 (그림·스크립트 같은 부속 파일은 빼고) */
    private static boolean isFramePage(WebResourceRequest request) {
        if (request.isForMainFrame() || !FrameProxy.isAllowedHost(request.getUrl().getHost())) return false;
        String accept = null;
        if (request.getRequestHeaders() != null) {
            for (java.util.Map.Entry<String, String> h : request.getRequestHeaders().entrySet()) {
                if (h.getKey() != null && h.getKey().equalsIgnoreCase("Accept")) accept = h.getValue();
            }
        }
        return accept != null && accept.startsWith("text/html");
    }

    private void report(WebResourceRequest request, int code, String description) {
        JSObject data = new JSObject();
        data.put("url", request.getUrl().toString());
        data.put("code", code);
        data.put("description", description == null ? "" : description);
        bridge.triggerWindowJSEvent("lessondeckframeerror", data.toString());
    }
}
