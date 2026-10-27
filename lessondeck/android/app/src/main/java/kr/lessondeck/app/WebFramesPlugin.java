package kr.lessondeck.app;

import com.getcapacitor.JSArray;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import java.util.ArrayList;
import java.util.List;
import org.json.JSONException;

/** 앱 화면이 지금 문서의 웹 주소 페이지 사이트 목록을 알려 준다 (FrameProxy가 그 사이트에만 쓴다) */
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
}
