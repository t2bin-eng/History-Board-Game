package kr.lessondeck.app;

import android.app.Activity;
import android.app.Dialog;
import android.graphics.Color;
import android.os.Message;
import android.view.Gravity;
import android.view.View;
import android.view.ViewGroup;
import android.webkit.CookieManager;
import android.webkit.JsPromptResult;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceRequest;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.Button;
import android.widget.FrameLayout;
import com.getcapacitor.Bridge;
import com.getcapacitor.BridgeWebChromeClient;

/**
 * 웹 페이지(iframe)의 "크게 보기"가 동작하게 Capacitor 기본 동작을 고친다.
 * - 전체 화면(requestFullscreen): Capacitor 기본은 시작하자마자 끝내 버려서 아무 반응이 없다 → 화면 위에 실제로 띄운다.
 * - 새 창(window.open, target=_blank): 웹뷰 기본은 새 창을 지원하지 않는다 → 앱 안 전체 화면 창으로 띄우고 "닫기" 단추를 둔다.
 *   (레슨덱 자신의 "브라우저에서 열기"는 앱 화면이 WebFrames.openExternal로 바깥 브라우저에 연다)
 */
public class LessonDeckChromeClient extends BridgeWebChromeClient {

    private final Bridge bridge;
    private View fullscreenView;
    private CustomViewCallback fullscreenCallback;

    public LessonDeckChromeClient(Bridge bridge) {
        super(bridge);
        this.bridge = bridge;
    }

    @Override
    public void onShowCustomView(View view, CustomViewCallback callback) {
        if (fullscreenView != null) {
            callback.onCustomViewHidden();
            return;
        }
        fullscreenView = view;
        fullscreenCallback = callback;
        view.setBackgroundColor(Color.BLACK);
        decor().addView(view, new FrameLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT));
    }

    @Override
    public void onHideCustomView() {
        if (fullscreenView == null) return;
        decor().removeView(fullscreenView);
        fullscreenView = null;
        CustomViewCallback callback = fullscreenCallback;
        fullscreenCallback = null;
        if (callback != null) callback.onCustomViewHidden();
    }

    private FrameLayout decor() {
        return (FrameLayout) bridge.getActivity().getWindow().getDecorView();
    }

    /**
     * 웹 화면이 펜 획을 시작할 때 "이 획이 S펜 버튼을 누른 채 시작했나"를 묻는다 (PenInput).
     * prompt는 답을 받을 때까지 기다리므로, 이벤트보다 늦게 도착할 걱정 없이 바로 그 획의 답을 준다. 창은 띄우지 않는다.
     */
    @Override
    public boolean onJsPrompt(WebView view, String url, String message, String defaultValue, JsPromptResult result) {
        if (PenInput.QUERY.equals(message)) {
            result.confirm(PenInput.strokeErase ? "erase" : "draw");
            return true;
        }
        return super.onJsPrompt(view, url, message, defaultValue, result);
    }

    @Override
    public boolean onCreateWindow(WebView view, boolean isDialog, boolean isUserGesture, Message resultMsg) {
        // 누르지도 않았는데 저절로 뜨는 창(광고 등)은 열지 않는다
        if (!isUserGesture) return false;
        Activity activity = bridge.getActivity();
        WebView popup = new WebView(activity);
        WebSettings settings = popup.getSettings();
        settings.setJavaScriptEnabled(true);
        settings.setDomStorageEnabled(true);
        settings.setMixedContentMode(WebSettings.MIXED_CONTENT_ALWAYS_ALLOW);
        settings.setTextZoom(100);
        settings.setUseWideViewPort(true);
        settings.setLoadWithOverviewMode(true);
        CookieManager.getInstance().setAcceptThirdPartyCookies(popup, true);
        popup.setBackgroundColor(Color.WHITE);

        Dialog dialog = new Dialog(activity, android.R.style.Theme_Black_NoTitleBar_Fullscreen);
        popup.setWebViewClient(
            new WebViewClient() {
                @Override
                public boolean shouldOverrideUrlLoading(WebView v, WebResourceRequest request) {
                    String scheme = request.getUrl().getScheme();
                    // 웹 주소는 이 창 안에서, 전화·메일 같은 다른 앱 주소는 그 앱으로
                    if ("http".equals(scheme) || "https".equals(scheme) || "about".equals(scheme) || "data".equals(scheme) || "blob".equals(scheme)) {
                        return false;
                    }
                    return bridge.launchIntent(request.getUrl());
                }
            }
        );
        popup.setWebChromeClient(
            new WebChromeClient() {
                @Override
                public void onCloseWindow(WebView window) {
                    dialog.dismiss();
                }
            }
        );

        FrameLayout root = new FrameLayout(activity);
        root.setBackgroundColor(Color.WHITE);
        root.addView(popup, new FrameLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT));
        Button close = new Button(activity);
        close.setText("✕  닫기");
        close.setAllCaps(false);
        close.setTextColor(Color.WHITE);
        close.setBackgroundColor(0xCC202020);
        close.setOnClickListener(v -> dialog.dismiss());
        FrameLayout.LayoutParams closeParams = new FrameLayout.LayoutParams(
            ViewGroup.LayoutParams.WRAP_CONTENT,
            ViewGroup.LayoutParams.WRAP_CONTENT,
            Gravity.TOP | Gravity.END
        );
        int margin = Math.round(12 * activity.getResources().getDisplayMetrics().density);
        closeParams.setMargins(margin, margin, margin, margin);
        root.addView(close, closeParams);

        dialog.setContentView(root);
        dialog.setOnDismissListener(d -> {
            root.removeView(popup);
            popup.destroy();
        });
        dialog.show();

        WebView.WebViewTransport transport = (WebView.WebViewTransport) resultMsg.obj;
        transport.setWebView(popup);
        resultMsg.sendToTarget();
        return true;
    }
}
