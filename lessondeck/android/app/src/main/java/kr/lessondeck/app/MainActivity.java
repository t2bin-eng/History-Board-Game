package kr.lessondeck.app;

import android.os.Bundle;
import android.view.WindowManager;
import android.webkit.CookieManager;
import android.webkit.WebView;
import androidx.core.view.WindowCompat;
import androidx.core.view.WindowInsetsCompat;
import androidx.core.view.WindowInsetsControllerCompat;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {

    @Override
    public void onCreate(Bundle savedInstanceState) {
        // 앱 안에 들어 있는 플러그인 (구글 드라이브 권한, 웹 주소 페이지 사이트 목록)
        registerPlugin(GoogleDrivePlugin.class);
        registerPlugin(WebFramesPlugin.class);
        super.onCreate(savedInstanceState);
        // 웹 주소 페이지(iframe)가 하얗게 남지 않게: iframe 안의 이동은 그 안에서, 띄우기 거부 머리글 처리
        getBridge().setWebViewClient(new LessonDeckWebViewClient(getBridge()));
        // 웹 주소 페이지는 앱(localhost)과 다른 사이트라 쿠키가 "제3자 쿠키"가 된다.
        // 웹뷰는 기본으로 막아서 로그인·세션이 필요한 사이트가 열리지 않으므로 허용한다
        WebView webView = getBridge().getWebView();
        CookieManager.getInstance().setAcceptCookie(true);
        CookieManager.getInstance().setAcceptThirdPartyCookies(webView, true);
        // 수업 중에 화면이 꺼지지 않게 한다
        getWindow().addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
        // 기기의 글꼴 크기 설정 때문에 툴바가 커지거나 깨지지 않게 한다
        webView.getSettings().setTextZoom(100);
        hideSystemBars();
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
