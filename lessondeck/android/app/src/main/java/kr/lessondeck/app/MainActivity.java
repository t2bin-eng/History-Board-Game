package kr.lessondeck.app;

import android.os.Bundle;
import android.view.MotionEvent;
import android.view.WindowManager;
import android.webkit.CookieManager;
import android.webkit.WebView;
import androidx.core.view.WindowCompat;
import androidx.core.view.WindowInsetsCompat;
import androidx.core.view.WindowInsetsControllerCompat;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {

    /** 마지막으로 화면에 알린 S펜 버튼 상태 */
    private boolean sideButtonShown = false;

    @Override
    public void onCreate(Bundle savedInstanceState) {
        // 앱 안에 들어 있는 플러그인 (구글 드라이브 권한, 웹 주소 페이지 사이트 목록, 다른 앱에서 복사한 것 읽기)
        registerPlugin(GoogleDrivePlugin.class);
        registerPlugin(WebFramesPlugin.class);
        registerPlugin(SystemClipboardPlugin.class);
        super.onCreate(savedInstanceState);
        // 웹 주소 페이지(iframe)가 하얗게 남지 않게: iframe 안의 이동은 그 안에서, 띄우기 거부 머리글 처리
        getBridge().setWebViewClient(new LessonDeckWebViewClient(getBridge()));
        // 웹 주소 페이지는 앱(localhost)과 다른 사이트라 쿠키가 "제3자 쿠키"가 된다.
        // 웹뷰는 기본으로 막아서 로그인·세션이 필요한 사이트가 열리지 않으므로 허용한다
        WebView webView = getBridge().getWebView();
        // 펜 획이 S펜 버튼을 누른 채 시작했는지 웹 화면이 바로 물을 수 있게 (PenInput.JsBridge)
        webView.addJavascriptInterface(new PenInput.JsBridge(), PenInput.JS_NAME);
        CookieManager.getInstance().setAcceptCookie(true);
        CookieManager.getInstance().setAcceptThirdPartyCookies(webView, true);
        // 웹 페이지의 "크게 보기"(전체 화면)와 새 창이 동작하게 한다
        webView.setWebChromeClient(new LessonDeckChromeClient(getBridge()));
        webView.getSettings().setSupportMultipleWindows(true);
        webView.getSettings().setJavaScriptCanOpenWindowsAutomatically(true);
        // 수업 중에 화면이 꺼지지 않게 한다
        getWindow().addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
        // 기기의 글꼴 크기 설정 때문에 툴바가 커지거나 깨지지 않게 한다
        webView.getSettings().setTextZoom(100);
        hideSystemBars();
    }

    /** S펜 버튼을 누른 채 쓰면 지우개: 펜 이벤트를 웹뷰가 알아듣는 모양으로 다듬어 넘긴다 (PenInput) */
    @Override
    public boolean dispatchTouchEvent(MotionEvent ev) {
        MotionEvent clean = PenInput.normalizeTouch(ev);
        showSideButton(PenInput.buttonDown);
        if (clean == null) return super.dispatchTouchEvent(ev);
        try {
            return super.dispatchTouchEvent(clean);
        } finally {
            clean.recycle();
        }
    }

    /** 펜을 띄운 채(호버) 버튼을 누르고 떼는 것도 알려 지우개 표시를 바꾼다 */
    @Override
    public boolean dispatchGenericMotionEvent(MotionEvent ev) {
        PenInput.trackHover(ev);
        showSideButton(PenInput.buttonDown);
        return super.dispatchGenericMotionEvent(ev);
    }

    private void showSideButton(boolean down) {
        if (down == sideButtonShown || getBridge() == null) return;
        sideButtonShown = down;
        String info = PenInput.lastInfo.replace("\"", "");
        getBridge().triggerWindowJSEvent("lessondecksidebutton", "{\"down\":" + down + ",\"info\":\"" + info + "\"}");
    }

    @Override
    public void onWindowFocusChanged(boolean hasFocus) {
        super.onWindowFocusChanged(hasFocus);
        if (hasFocus) hideSystemBars();
    }

    /** 상태 표시줄·내비게이션 바를 숨긴 전체 화면. 가장자리를 쓸어 넘기면 잠시 나타난다. */
    private void hideSystemBars() {
        WindowInsetsControllerCompat controller =
            WindowCompat.getInsetsController(getWindow(), getWindow().getDecorView());
        controller.hide(WindowInsetsCompat.Type.systemBars());
        controller.setSystemBarsBehavior(WindowInsetsControllerCompat.BEHAVIOR_SHOW_TRANSIENT_BARS_BY_SWIPE);
    }
}
