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

    /** S펜 버튼(옆 버튼)으로 여기는 버튼 상태 */
    private static final int PEN_BUTTONS =
        MotionEvent.BUTTON_STYLUS_PRIMARY | MotionEvent.BUTTON_STYLUS_SECONDARY | MotionEvent.BUTTON_SECONDARY;

    /** 지금 획이 버튼을 누른 채 시작해 지우개로 넘기는 중인지 (뗄 때까지) */
    private boolean erasingStroke = false;
    /** 마지막으로 화면에 알린 버튼 상태 */
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

    /**
     * S펜 버튼을 누른 채 쓰면 지우개 (SPEC 6장).
     * 웹뷰(크로미움)는 버튼을 누른 채 끄는 펜을 글자 고르기 동작으로 가로채서 웹 화면이 버튼을 모른다.
     * 그래서 펜을 댈 때 버튼이 눌려 있으면 그 획 전체를 "지우개 끝" 입력으로 바꿔 넘긴다
     * (웹 화면에는 지우개 버튼(32)이 눌린 펜으로 온다).
     */
    @Override
    public boolean dispatchTouchEvent(MotionEvent ev) {
        int action = ev.getActionMasked();
        boolean stylus = hasStylus(ev);
        boolean pressed = stylus && (ev.getButtonState() & PEN_BUTTONS) != 0;
        if (action == MotionEvent.ACTION_DOWN) erasingStroke = pressed;
        showSideButton(pressed || erasingStroke);
        if (!erasingStroke) return super.dispatchTouchEvent(ev);
        MotionEvent converted = asEraser(ev);
        try {
            return super.dispatchTouchEvent(converted);
        } finally {
            converted.recycle();
            if (action == MotionEvent.ACTION_UP || action == MotionEvent.ACTION_CANCEL) {
                erasingStroke = false;
                showSideButton(pressed);
            }
        }
    }

    /** 펜을 띄운 채(호버) 버튼을 누르고 떼는 것도 알려 지우개 표시를 바꾼다 */
    @Override
    public boolean dispatchGenericMotionEvent(MotionEvent ev) {
        if (hasStylus(ev)) {
            int action = ev.getActionMasked();
            if (action == MotionEvent.ACTION_HOVER_EXIT) showSideButton(false);
            else showSideButton((ev.getButtonState() & PEN_BUTTONS) != 0);
        }
        return super.dispatchGenericMotionEvent(ev);
    }

    private static boolean hasStylus(MotionEvent ev) {
        for (int i = 0; i < ev.getPointerCount(); i++) {
            if (ev.getToolType(i) == MotionEvent.TOOL_TYPE_STYLUS) return true;
        }
        return false;
    }

    /** 같은 이벤트를 펜 대신 지우개 끝으로, 버튼 상태 없이 (손가락 등 다른 포인터는 그대로) */
    private static MotionEvent asEraser(MotionEvent ev) {
        int n = ev.getPointerCount();
        MotionEvent.PointerProperties[] props = new MotionEvent.PointerProperties[n];
        MotionEvent.PointerCoords[] coords = new MotionEvent.PointerCoords[n];
        for (int i = 0; i < n; i++) {
            props[i] = new MotionEvent.PointerProperties();
            ev.getPointerProperties(i, props[i]);
            if (props[i].toolType == MotionEvent.TOOL_TYPE_STYLUS) props[i].toolType = MotionEvent.TOOL_TYPE_ERASER;
            coords[i] = new MotionEvent.PointerCoords();
            ev.getPointerCoords(i, coords[i]);
        }
        return MotionEvent.obtain(
            ev.getDownTime(),
            ev.getEventTime(),
            ev.getAction(),
            n,
            props,
            coords,
            ev.getMetaState(),
            0,
            ev.getXPrecision(),
            ev.getYPrecision(),
            ev.getDeviceId(),
            ev.getEdgeFlags(),
            ev.getSource(),
            ev.getFlags()
        );
    }

    private void showSideButton(boolean down) {
        if (down == sideButtonShown || getBridge() == null) return;
        sideButtonShown = down;
        getBridge().triggerWindowJSEvent("lessondecksidebutton", "{\"down\":" + down + "}");
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
