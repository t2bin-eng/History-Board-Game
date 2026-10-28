package kr.lessondeck.app;

import android.view.MotionEvent;

/**
 * S펜 입력 다듬기 (SPEC 6장 "S펜 사이드 버튼 = 지우개").
 *
 * 웹뷰(크로미움)는 S펜 버튼 상태를 제대로 받지 못한다.
 * - 삼성 기기는 버튼을 누른 채 펜이 닿으면 표준 대신 삼성 동작 번호(211 닿음, 213 움직임, 212 뗌)를 보내기도 하는데
 *   웹뷰는 이것을 모른다 → 지우개도 필기도 안 되다가, 버튼을 떼는 순간 표준 움직임으로 바뀌며 갑자기 글이 써진다.
 * - 표준 버튼 상태가 오면 웹뷰가 "버튼 누른 채 끌기 = 글자 고르기"로 가로채기도 한다.
 * 그래서 앱이 웹뷰보다 먼저 받아 모든 펜 이벤트를 표준 동작·버튼 없음으로 바꿔 넘기고,
 * 펜이 닿는 순간 버튼이 눌려 있었는지(이 획이 지우개인지)를 기억해 두었다가 웹 화면이 획을 시작할 때 묻는 대로 알려 준다
 * (LessonDeckChromeClient.onJsPrompt). 한 획 안에서는 버튼을 떼거나 눌러도 바뀌지 않는다.
 */
final class PenInput {

    /** 웹 화면이 "지금 펜 획이 지우개인가"를 물을 때 쓰는 prompt 글 */
    static final String QUERY = "lessondeck:pen-stroke";

    /** S펜 버튼(옆 버튼)으로 여기는 버튼 상태 */
    private static final int PEN_BUTTONS =
        MotionEvent.BUTTON_STYLUS_PRIMARY | MotionEvent.BUTTON_STYLUS_SECONDARY | MotionEvent.BUTTON_SECONDARY;

    /** 삼성 S펜: 버튼을 누른 채 닿았을 때의 동작 번호 */
    private static final int SPEN_DOWN = 211;
    private static final int SPEN_UP = 212;
    private static final int SPEN_MOVE = 213;
    private static final int SPEN_CANCEL = 214;

    /** 마지막으로 닿은 펜 획을 버튼을 누른 채 시작했는지 (다음 획이 닿을 때까지 유지) */
    static volatile boolean strokeErase = false;
    /** 마지막으로 본 버튼 상태 (도구 막대 지우개 표시) */
    static volatile boolean buttonDown = false;
    /** 입력 디버그용: 마지막 펜 이벤트의 원래 동작 번호·버튼·도구 */
    static volatile String lastInfo = "";

    private PenInput() {}

    /** 삼성 동작 번호면 표준 동작, 아니면 -1 */
    private static int samsungToStandard(int masked) {
        switch (masked) {
            case SPEN_DOWN:
                return MotionEvent.ACTION_DOWN;
            case SPEN_UP:
                return MotionEvent.ACTION_UP;
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
    static MotionEvent normalizeTouch(MotionEvent ev) {
        int masked = ev.getActionMasked();
        int samsung = samsungToStandard(masked);
        int stylus = stylusIndex(ev);
        if (stylus < 0 && samsung < 0) return null;
        int standard = samsung >= 0 ? samsung : masked;
        boolean pressed = samsung >= 0 || (ev.getButtonState() & PEN_BUTTONS) != 0;
        boolean stylusDown =
            standard == MotionEvent.ACTION_DOWN || (standard == MotionEvent.ACTION_POINTER_DOWN && ev.getActionIndex() == stylus);
        if (stylusDown) strokeErase = pressed;
        buttonDown = pressed;
        lastInfo = "a=" + ev.getAction() + " b=" + ev.getButtonState() + " t=" + (stylus >= 0 ? ev.getToolType(stylus) : -1);
        if (samsung < 0 && ev.getButtonState() == 0) return null;
        return rebuild(ev, samsung >= 0 ? samsung : ev.getAction());
    }

    /** 펜을 띄운 채(호버) 버튼을 누르고 뗌 → 버튼 상태만 기억 */
    static void trackHover(MotionEvent ev) {
        if (stylusIndex(ev) < 0) return;
        buttonDown = ev.getActionMasked() != MotionEvent.ACTION_HOVER_EXIT && (ev.getButtonState() & PEN_BUTTONS) != 0;
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
