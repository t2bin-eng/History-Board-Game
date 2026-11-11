package kr.lessondeck.app;

import android.os.SystemClock;
import android.view.MotionEvent;
import android.webkit.JavascriptInterface;
import java.util.ArrayList;
import java.util.Iterator;

/**
 * S펜 입력 다듬기 (SPEC 6장 "S펜 사이드 버튼 = 지우개").
 *
 * 웹뷰(크로미움)는 S펜 버튼 상태를 제대로 받지 못한다.
 * - 삼성 기기는 버튼을 누른 채 펜이 닿으면 표준 대신 삼성 동작 번호(211 닿음, 213 움직임, 212 뗌)를 보내기도 하는데
 *   웹뷰는 이것을 모른다 → 지우개도 필기도 안 되다가, 버튼을 떼는 순간 표준 움직임으로 바뀌며 갑자기 글이 써진다.
 * - 표준 버튼 상태가 오면 웹뷰가 "버튼 누른 채 끌기 = 글자 고르기"로 가로채기도 한다.
 * 그래서 앱이 웹뷰보다 먼저 받아 모든 펜 이벤트를 표준 동작·버튼 없음으로 바꿔 넘기고,
 * 펜이 닿는 순간 버튼이 눌려 있었는지(이 획이 지우개인지)를 기억해 두었다가 웹 화면이 획을 시작할 때 묻는 대로 알려 준다
 * (JsBridge, 웹 화면에서는 window.LessonDeckPen). 한 획 안에서는 버튼을 떼거나 눌러도 바뀌지 않는다.
 * prompt로 묻던 때(0.16.1)는 대화창이 열리는 동안 웹뷰가 들어오는 터치를 버려서 손가락 뗌이 사라지고 확대·필기가 꼬였다.
 *
 * 펜과 손 구분 (0.17): 갤럭시탭의 S펜은 손가락 터치 화면과 따로 있는 펜 감지판(디지타이저)으로 들어와 안드로이드가 "펜"(STYLUS)으로
 * 확실히 안다. 그래서 닿은 것마다 안드로이드가 알려 준 도구·자리·접촉 크기를 기억해 두고, 웹 화면이 "이 자리에 닿은 것이 S펜인가"를
 * 물으면(JsBridge.toolAt) 답한다. 웹뷰가 넘기는 pointerType만 믿지 않는다.
 */
final class PenInput {

    /** 웹 화면에 붙이는 이름 (window.LessonDeckPen) */
    static final String JS_NAME = "LessonDeckPen";

    /** S펜 버튼(옆 버튼)으로 여기는 버튼 상태 */
    private static final int PEN_BUTTONS =
        MotionEvent.BUTTON_STYLUS_PRIMARY | MotionEvent.BUTTON_STYLUS_SECONDARY | MotionEvent.BUTTON_SECONDARY;

    /** 삼성 S펜: 버튼을 누른 채 닿았을 때의 동작 번호 */
    private static final int SPEN_DOWN = 211;
    private static final int SPEN_UP = 212;
    private static final int SPEN_MOVE = 213;
    private static final int SPEN_CANCEL = 214;

    /** 화면에 닿아 있거나 막 뗀 것 하나 (좌표는 웹뷰 기준 화면 px) */
    private static final class Contact {
        final int id;
        final int tool;
        final float downX;
        final float downY;
        float x;
        float y;
        /** 접촉 크기(긴 쪽, 화면 px). S펜 촉은 작고 손가락·손바닥은 크다 */
        float size;
        /** 뗀 시각 (닿아 있으면 0) */
        long upAt;

        Contact(int id, int tool, float x, float y, float size) {
            this.id = id;
            this.tool = tool;
            this.downX = x;
            this.downY = y;
            this.x = x;
            this.y = y;
            this.size = size;
        }
    }

    /** 뗀 것도 잠깐 기억한다 (톡 친 펜은 웹 화면이 묻기 전에 이미 떼어져 있을 수 있다) */
    private static final long KEEP_AFTER_UP_MS = 1000;
    /** 웹 화면이 물은 자리와 이만큼(화면 px) 안에 있어야 같은 접촉으로 본다 */
    private static final float MATCH_RADIUS_PX = 24;
    private static final ArrayList<Contact> contacts = new ArrayList<>();

    /** 마지막으로 닿은 펜 획을 버튼을 누른 채 시작했는지 (다음 획이 닿을 때까지 유지) */
    static volatile boolean strokeErase = false;
    /** 마지막으로 본 버튼 상태 (도구 막대 지우개 표시) */
    static volatile boolean buttonDown = false;
    /** 입력 디버그용: 마지막 펜 이벤트의 원래 동작 번호·버튼·도구 */
    static volatile String lastInfo = "";

    private PenInput() {}

    /**
     * 웹 화면이 부르는 창구. 웹뷰의 별도 스레드에서 바로 답하므로 대화창도, 터치를 막는 일도 없다.
     */
    static final class JsBridge {
        /** 마지막으로 닿은 펜 획을 S펜 버튼을 누른 채 시작했는지 */
        @JavascriptInterface
        public boolean strokeErase() {
            return strokeErase;
        }

        /**
         * 웹뷰 기준 화면 px (x, y)에 닿은(또는 막 뗀) 것이 무엇인지: "stylus 크기" · "finger 크기" · "other 도구번호 크기" · "none".
         * stylus = S펜(펜 감지판), finger = 손가락·손바닥(터치 화면).
         */
        @JavascriptInterface
        public String toolAt(float x, float y) {
            return PenInput.toolAt(x, y);
        }

        /** 0.26부터: S펜이 화면에 닿아 있는지 (띄운 채면 false — 웹 화면은 이때 획을 시작하지 않는다) */
        @JavascriptInterface
        public boolean stylusTouching() {
            return PenInput.stylusTouching();
        }
    }

    /**
     * 삼성 동작 번호면 표준 동작, 아니면 -1.
     * 손바닥·손가락이 함께 닿아 있으면 그 펜의 POINTER_DOWN/UP으로 (DOWN/UP으로 바꾸면 웹뷰가 손가락까지 끝난 것으로 본다).
     */
    private static int samsungToStandard(MotionEvent ev, int stylus) {
        boolean multi = ev.getPointerCount() > 1;
        int index = (ev.getAction() & MotionEvent.ACTION_POINTER_INDEX_MASK) != 0 ? ev.getActionIndex() : Math.max(stylus, 0);
        int shifted = index << MotionEvent.ACTION_POINTER_INDEX_SHIFT;
        switch (ev.getActionMasked()) {
            case SPEN_DOWN:
                return multi ? MotionEvent.ACTION_POINTER_DOWN | shifted : MotionEvent.ACTION_DOWN;
            case SPEN_UP:
                return multi ? MotionEvent.ACTION_POINTER_UP | shifted : MotionEvent.ACTION_UP;
            case SPEN_MOVE:
                return MotionEvent.ACTION_MOVE;
            case SPEN_CANCEL:
                return MotionEvent.ACTION_CANCEL;
            default:
                return -1;
        }
    }

    private static int stylusIndex(MotionEvent ev) {
        for (int i = 0; i < ev.getPointerCount(); i++) {
            int tool = ev.getToolType(i);
            if (tool == MotionEvent.TOOL_TYPE_STYLUS || tool == MotionEvent.TOOL_TYPE_ERASER) return i;
        }
        return -1;
    }

    /**
     * 화면 터치 이벤트를 웹뷰에 넘길 모양으로. 펜이 없거나 바꿀 것이 없으면 null (원래 이벤트를 그대로 넘긴다).
     * 돌려준 이벤트는 넘긴 뒤 recycle 해야 한다.
     */
    static MotionEvent normalizeTouch(MotionEvent ev, float offsetX, float offsetY) {
        int stylus = stylusIndex(ev);
        int samsung = samsungToStandard(ev, stylus);
        int action = samsung >= 0 ? samsung : ev.getAction();
        track(ev, action, offsetX, offsetY);
        if (stylus < 0 && samsung < 0) return null;
        int masked = action & MotionEvent.ACTION_MASK;
        int index = (action & MotionEvent.ACTION_POINTER_INDEX_MASK) >> MotionEvent.ACTION_POINTER_INDEX_SHIFT;
        boolean pressed = samsung >= 0 || (ev.getButtonState() & PEN_BUTTONS) != 0;
        boolean stylusDown = masked == MotionEvent.ACTION_DOWN || (masked == MotionEvent.ACTION_POINTER_DOWN && index == stylus);
        if (stylusDown) strokeErase = pressed;
        buttonDown = pressed;
        lastInfo =
            "a=" + ev.getAction() + " b=" + ev.getButtonState() + " t=" + (stylus >= 0 ? ev.getToolType(stylus) : -1) + " n=" + ev.getPointerCount();
        if (samsung < 0 && ev.getButtonState() == 0) return null;
        return rebuild(ev, action);
    }

    /** 닿은 것들의 도구·자리·크기를 기억한다 (offset: 창 안에서 웹뷰의 위치) */
    private static void track(MotionEvent ev, int action, float offsetX, float offsetY) {
        long now = SystemClock.uptimeMillis();
        int masked = action & MotionEvent.ACTION_MASK;
        int index = (action & MotionEvent.ACTION_POINTER_INDEX_MASK) >> MotionEvent.ACTION_POINTER_INDEX_SHIFT;
        synchronized (contacts) {
            Iterator<Contact> it = contacts.iterator();
            while (it.hasNext()) {
                Contact c = it.next();
                if (c.upAt != 0 && now - c.upAt > KEEP_AFTER_UP_MS) it.remove();
            }
            switch (masked) {
                case MotionEvent.ACTION_DOWN:
                    // 첫 접촉: 남아 있던 것은 모두 뗀 것이다
                    for (Contact c : contacts) if (c.upAt == 0) c.upAt = now;
                    add(ev, 0, offsetX, offsetY);
                    break;
                case MotionEvent.ACTION_POINTER_DOWN:
                    if (index < ev.getPointerCount()) add(ev, index, offsetX, offsetY);
                    break;
                case MotionEvent.ACTION_MOVE:
                    for (int i = 0; i < ev.getPointerCount(); i++) {
                        Contact c = live(ev.getPointerId(i));
                        if (c == null) continue;
                        c.x = ev.getX(i) - offsetX;
                        c.y = ev.getY(i) - offsetY;
                        c.size = Math.max(c.size, ev.getTouchMajor(i));
                    }
                    break;
                case MotionEvent.ACTION_UP:
                case MotionEvent.ACTION_POINTER_UP: {
                    int i = masked == MotionEvent.ACTION_UP ? 0 : index;
                    if (i < ev.getPointerCount()) {
                        Contact c = live(ev.getPointerId(i));
                        if (c != null) c.upAt = now;
                    }
                    break;
                }
                case MotionEvent.ACTION_CANCEL:
                    for (Contact c : contacts) if (c.upAt == 0) c.upAt = now;
                    break;
                default:
                    break;
            }
        }
    }

    private static void add(MotionEvent ev, int i, float offsetX, float offsetY) {
        int id = ev.getPointerId(i);
        Contact old = live(id);
        if (old != null) old.upAt = SystemClock.uptimeMillis();
        contacts.add(new Contact(id, ev.getToolType(i), ev.getX(i) - offsetX, ev.getY(i) - offsetY, ev.getTouchMajor(i)));
        if (contacts.size() > 32) contacts.remove(0);
    }

    private static Contact live(int id) {
        for (Contact c : contacts) if (c.upAt == 0 && c.id == id) return c;
        return null;
    }

    /** (x, y)에 있는 접촉: 닿아 있는 것 중 가장 가까운 것, 없으면 막 뗀 것 중 가장 최근 것 */
    static String toolAt(float x, float y) {
        synchronized (contacts) {
            Contact best = null;
            float bestDist = Float.MAX_VALUE;
            for (Contact c : contacts) {
                if (c.upAt != 0) continue;
                float d = distance(c, x, y);
                if (d <= MATCH_RADIUS_PX && d < bestDist) {
                    best = c;
                    bestDist = d;
                }
            }
            if (best == null) {
                for (Contact c : contacts) {
                    if (c.upAt == 0 || distance(c, x, y) > MATCH_RADIUS_PX) continue;
                    if (best == null || c.upAt >= best.upAt) best = c;
                }
            }
            if (best == null) return "none";
            String size = String.valueOf(Math.round(best.size));
            switch (best.tool) {
                case MotionEvent.TOOL_TYPE_STYLUS:
                case MotionEvent.TOOL_TYPE_ERASER:
                    return "stylus " + size;
                case MotionEvent.TOOL_TYPE_FINGER:
                    return "finger " + size;
                default:
                    return "other " + best.tool + " " + size;
            }
        }
    }

    private static float distance(Contact c, float x, float y) {
        float down = (float) Math.hypot(c.downX - x, c.downY - y);
        float now = (float) Math.hypot(c.x - x, c.y - y);
        return Math.min(down, now);
    }

    /** 펜을 띄운 채(호버) 버튼을 누르고 뗌 → 버튼 상태만 기억 */
    static void trackHover(MotionEvent ev) {
        if (stylusIndex(ev) < 0) return;
        buttonDown = ev.getActionMasked() != MotionEvent.ACTION_HOVER_EXIT && (ev.getButtonState() & PEN_BUTTONS) != 0;
        lastInfo = "hover a=" + ev.getAction() + " b=" + ev.getButtonState();
    }

    /** 펜이 화면에 정말 닿아 있는지 (막 뗀 것도 잠깐은 닿은 것으로: 톡 친 펜은 웹 화면이 묻기 전에 떼어져 있을 수 있다) */
    private static final long TOUCH_GRACE_MS = 500;

    static boolean stylusTouching() {
        long now = SystemClock.uptimeMillis();
        synchronized (contacts) {
            for (Contact c : contacts) {
                if (c.tool != MotionEvent.TOOL_TYPE_STYLUS && c.tool != MotionEvent.TOOL_TYPE_ERASER) continue;
                if (c.upAt == 0 || now - c.upAt < TOUCH_GRACE_MS) return true;
            }
        }
        return false;
    }

    /**
     * 펜을 띄운 채 오는 이벤트(호버·버튼 누름/뗌)를 웹뷰에 넘길 모양으로 (0.26).
     * 웹뷰는 띄운 펜의 S펜 버튼을 "누른 채 닿음"(왼쪽 버튼)처럼 넘겨서, 띄운 채 버튼만 눌러도 글씨가 써졌다.
     * 그래서 버튼 상태는 앱이 따로 알려 주고(lessondecksidebutton), 웹뷰에는 버튼 없는 호버만 넘긴다.
     */
    static boolean swallowHover(MotionEvent ev) {
        if (stylusIndex(ev) < 0) return false;
        int masked = ev.getActionMasked();
        return masked == MotionEvent.ACTION_BUTTON_PRESS || masked == MotionEvent.ACTION_BUTTON_RELEASE;
    }

    /** 버튼 상태를 뺀 호버 이벤트 (바꿀 것이 없으면 null). 넘긴 뒤 recycle 해야 한다 */
    static MotionEvent cleanHover(MotionEvent ev) {
        if (stylusIndex(ev) < 0 || ev.getButtonState() == 0) return null;
        return rebuild(ev, ev.getAction());
    }

    /** 같은 좌표·도구로, 동작만 바꾸고 버튼 상태는 없이 */
    private static MotionEvent rebuild(MotionEvent ev, int action) {
        int n = ev.getPointerCount();
        MotionEvent.PointerProperties[] props = new MotionEvent.PointerProperties[n];
        MotionEvent.PointerCoords[] coords = new MotionEvent.PointerCoords[n];
        for (int i = 0; i < n; i++) {
            props[i] = new MotionEvent.PointerProperties();
            ev.getPointerProperties(i, props[i]);
            coords[i] = new MotionEvent.PointerCoords();
            ev.getPointerCoords(i, coords[i]);
        }
        return MotionEvent.obtain(
            ev.getDownTime(),
            ev.getEventTime(),
            action,
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
}
