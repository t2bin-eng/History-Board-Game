package kr.lessondeck.app;

import android.os.SystemClock;
import android.view.MotionEvent;

/**
 * 다른 사이트(웹 주소·유튜브) 페이지 위의 두 손가락 확대와 스포트라이트용 자리 (v0.39, SPEC 6장).
 *
 * 다른 사이트 액자 안의 터치는 레슨덱 화면(JS)에 오지 않고, 그 사이트에는 스크립트를 넣을 수도 없다.
 * 그래서 웹뷰보다 먼저 터치를 받는 앱이 직접 본다.
 * - 웹 화면이 알려 준 구역(지금 페이지가 다른 사이트일 때 그 페이지 영역, 웹뷰 CSS px) 안에 손가락 두 개가 닿으면
 *   그 접촉은 사이트(웹뷰)에 넘기지 않고 — 먼저 닿은 손가락에는 취소를 보낸다 — 두 손가락 자리를 웹 화면에 알린다
 *   (lessondeckpinch {phase, ax, ay, bx, by}). 두 손가락 중 하나라도 떼면 끝이고, 남은 손가락도 다 뗄 때까지 사이트에 넘기지 않는다.
 *   손바닥 크기(지름 64 CSS px)의 접촉이 섞이면 확대가 아니다.
 * - 웹 화면이 부탁하면(스포트라이트를 켠 동안) 펜·손가락 자리를 알린다(lessondeckpointer {x, y}, 1/60초에 한 번까지).
 */
final class WebGestures {

    /** 웹 화면에 알리는 창구 (MainActivity) */
    interface Sink {
        void send(String event, String json);

        /** 이 접촉을 웹뷰가 취소로 받게 한다 */
        void cancelWebView(MotionEvent ev);
    }

    private static final int IDLE = 0;
    private static final int PINCH = 1;
    /** 두 손가락 중 하나를 뗀 뒤: 나머지를 다 뗄 때까지 사이트에 넘기지 않는다 */
    private static final int DRAIN = 2;

    /** 손바닥으로 보는 접촉 크기 (지름, CSS px) — inputState.ts와 같은 값 */
    private static final float PALM_CSS = 64;
    /** 자리 알림 간격 (ms) */
    private static final long POINTER_EVERY_MS = 16;

    private static volatile boolean zoneOn = false;
    private static volatile float zoneLeft, zoneTop, zoneRight, zoneBottom;
    static volatile boolean trackPointers = false;

    private static int state = IDLE;
    private static int idA = -1;
    private static int idB = -1;
    private static long lastPointerAt = 0;

    private WebGestures() {}

    /** 두 손가락을 앱이 받을 구역 (웹뷰 CSS px). 너비·높이가 0이면 끔 */
    static void setZone(float left, float top, float width, float height) {
        if (width <= 0 || height <= 0) {
            zoneOn = false;
            return;
        }
        zoneLeft = left;
        zoneTop = top;
        zoneRight = left + width;
        zoneBottom = top + height;
        zoneOn = true;
    }

    /**
     * 화면 터치. true면 이 이벤트는 앱이 가져가므로 웹뷰에 넘기지 않는다.
     * offX·offY: 창 안에서 웹뷰 위치(px), density: CSS px 하나의 화면 px
     */
    static boolean onTouch(MotionEvent ev, float offX, float offY, float density, Sink sink) {
        int masked = ev.getActionMasked();
        reportPointer(ev, offX, offY, density, sink, masked == MotionEvent.ACTION_DOWN || masked == MotionEvent.ACTION_POINTER_DOWN);
        // 새 접촉이 시작되면 지난 상태는 버린다 (뗌을 놓쳤어도 꼬이지 않게)
        if (masked == MotionEvent.ACTION_DOWN && state != IDLE) state = IDLE;
        switch (state) {
            case PINCH:
                if (masked == MotionEvent.ACTION_MOVE) {
                    sendPinch(sink, "move", ev, offX, offY, density);
                } else if (masked == MotionEvent.ACTION_POINTER_UP) {
                    int id = ev.getPointerId(ev.getActionIndex());
                    if (id == idA || id == idB) {
                        sink.send("lessondeckpinch", "{\"phase\":\"end\"}");
                        state = DRAIN;
                    }
                } else if (masked == MotionEvent.ACTION_UP || masked == MotionEvent.ACTION_CANCEL) {
                    sink.send("lessondeckpinch", "{\"phase\":\"end\"}");
                    state = IDLE;
                }
                return true;
            case DRAIN:
                if (masked == MotionEvent.ACTION_UP || masked == MotionEvent.ACTION_CANCEL) state = IDLE;
                return true;
            default:
                if (masked == MotionEvent.ACTION_POINTER_DOWN && startsPinch(ev, offX, offY, density)) {
                    idA = ev.getPointerId(0);
                    idB = ev.getPointerId(1);
                    state = PINCH;
                    // 먼저 닿은 손가락으로 사이트가 하던 일(스크롤 등)을 끝낸다
                    sink.cancelWebView(ev);
                    sendPinch(sink, "start", ev, offX, offY, density);
                    return true;
                }
                return false;
        }
    }

    /** 펜을 띄운 채 움직임 (스포트라이트) */
    static void onHover(MotionEvent ev, float offX, float offY, float density, Sink sink) {
        if (ev.getActionMasked() == MotionEvent.ACTION_HOVER_EXIT) return;
        reportPointer(ev, offX, offY, density, sink, false);
    }

    private static boolean startsPinch(MotionEvent ev, float offX, float offY, float density) {
        if (!zoneOn || ev.getPointerCount() != 2) return false;
        for (int i = 0; i < 2; i++) {
            int tool = ev.getToolType(i);
            if (tool != MotionEvent.TOOL_TYPE_FINGER && tool != MotionEvent.TOOL_TYPE_UNKNOWN) return false;
            if (ev.getTouchMajor(i) / density >= PALM_CSS) return false;
            float x = (ev.getX(i) - offX) / density;
            float y = (ev.getY(i) - offY) / density;
            if (x < zoneLeft || x > zoneRight || y < zoneTop || y > zoneBottom) return false;
        }
        return true;
    }

    private static void sendPinch(Sink sink, String phase, MotionEvent ev, float offX, float offY, float density) {
        int a = ev.findPointerIndex(idA);
        int b = ev.findPointerIndex(idB);
        if (a < 0 || b < 0) return;
        sink.send(
            "lessondeckpinch",
            "{\"phase\":\"" + phase + "\",\"ax\":" + css(ev.getX(a), offX, density) + ",\"ay\":" + css(ev.getY(a), offY, density)
                + ",\"bx\":" + css(ev.getX(b), offX, density) + ",\"by\":" + css(ev.getY(b), offY, density) + "}"
        );
    }

    /** 스포트라이트를 켠 동안: 펜이 있으면 펜, 없으면 첫 손가락 자리 */
    private static void reportPointer(MotionEvent ev, float offX, float offY, float density, Sink sink, boolean now) {
        if (!trackPointers) return;
        long t = SystemClock.uptimeMillis();
        if (!now && t - lastPointerAt < POINTER_EVERY_MS) return;
        lastPointerAt = t;
        int i = 0;
        for (int k = 0; k < ev.getPointerCount(); k++) {
            int tool = ev.getToolType(k);
            if (tool == MotionEvent.TOOL_TYPE_STYLUS || tool == MotionEvent.TOOL_TYPE_ERASER) {
                i = k;
                break;
            }
        }
        sink.send("lessondeckpointer", "{\"x\":" + css(ev.getX(i), offX, density) + ",\"y\":" + css(ev.getY(i), offY, density) + "}");
    }

    private static String css(float px, float off, float density) {
        return String.valueOf(Math.round((px - off) / density * 10) / 10f);
    }
}
