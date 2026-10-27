package kr.lessondeck.app;

import android.net.Uri;
import android.text.TextUtils;
import android.webkit.CookieManager;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;
import java.io.ByteArrayInputStream;
import java.io.InputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.nio.charset.StandardCharsets;
import java.util.HashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Set;
import java.util.concurrent.ConcurrentHashMap;

/**
 * 웹 주소 페이지(iframe) 문서를 앱이 대신 받아 와서 "다른 앱 안에 띄우지 마세요" 머리글
 * (X-Frame-Options, CSP frame-ancestors)만 빼고 넘겨준다. 많은 사이트가 이 머리글 때문에
 * 레슨덱 안에서 하얀 화면으로 나온다.
 *
 * 선생님이 넣은 웹 주소 페이지의 사이트(setHosts)와 그 사이트가 보낸 이동(리다이렉트) 대상에만,
 * GET 방식 문서 요청에만 쓴다. 문제가 생기면 null을 돌려 웹뷰가 평소대로 불러오게 한다.
 */
final class FrameProxy {

    private FrameProxy() {}

    private static final Set<String> hosts = ConcurrentHashMap.newKeySet();
    private static final int CONNECT_TIMEOUT_MS = 15000;
    private static final int READ_TIMEOUT_MS = 20000;

    /** 웹 주소 페이지 사이트 목록 (앱 화면이 알려 준다) */
    static void setHosts(List<String> list) {
        hosts.clear();
        for (String h : list) addHost(h);
    }

    static void addHost(String host) {
        if (host == null || host.isEmpty()) return;
        String h = host.toLowerCase(Locale.ROOT);
        hosts.add(h);
        // example.com ↔ www.example.com 은 같은 사이트로 본다
        hosts.add(h.startsWith("www.") ? h.substring(4) : "www." + h);
    }

    static boolean isAllowedHost(String host) {
        return host != null && hosts.contains(host.toLowerCase(Locale.ROOT));
    }

    /** iframe 안의 문서(페이지) 요청인지: 메인 화면이 아니고, GET이고, HTML을 바라는 요청 */
    static boolean isFrameDocument(WebResourceRequest request) {
        if (request.isForMainFrame()) return false;
        if (!"GET".equalsIgnoreCase(request.getMethod())) return false;
        Uri url = request.getUrl();
        String scheme = url.getScheme();
        if (!"http".equals(scheme) && !"https".equals(scheme)) return false;
        if (!isAllowedHost(url.getHost())) return false;
        String accept = header(request.getRequestHeaders(), "Accept");
        return accept != null && accept.startsWith("text/html");
    }

    static WebResourceResponse load(WebResourceRequest request) {
        HttpURLConnection conn = null;
        try {
            String url = request.getUrl().toString();
            conn = (HttpURLConnection) new URL(url).openConnection();
            conn.setInstanceFollowRedirects(false);
            conn.setConnectTimeout(CONNECT_TIMEOUT_MS);
            conn.setReadTimeout(READ_TIMEOUT_MS);
            for (Map.Entry<String, String> h : request.getRequestHeaders().entrySet()) {
                String key = h.getKey();
                if (key == null) continue;
                String k = key.toLowerCase(Locale.ROOT);
                // 압축은 연결이 알아서 풀고, 나머지는 연결이 정한다.
                // "바뀌었을 때만" 머리글은 빼서 늘 본문(200)을 받는다 (304면 넘겨줄 본문이 없다)
                if (
                    k.equals("accept-encoding") ||
                    k.equals("host") ||
                    k.equals("connection") ||
                    k.equals("content-length") ||
                    k.equals("range") ||
                    k.startsWith("if-")
                ) continue;
                conn.setRequestProperty(key, h.getValue());
            }
            CookieManager cookies = CookieManager.getInstance();
            String cookie = cookies.getCookie(url);
            if (cookie != null && !cookie.isEmpty()) conn.setRequestProperty("Cookie", cookie);

            int status = conn.getResponseCode();
            Map<String, List<String>> fields = conn.getHeaderFields();
            for (Map.Entry<String, List<String>> f : fields.entrySet()) {
                if (f.getKey() != null && f.getKey().equalsIgnoreCase("Set-Cookie")) {
                    for (String v : f.getValue()) cookies.setCookie(url, v);
                }
            }
            cookies.flush();

            if (status >= 300 && status < 400) {
                // 웹뷰는 가로챈 응답의 이동을 따르지 않는다 → 그 iframe 안에서 다음 주소로 넘어가는 작은 페이지
                String location = conn.getHeaderField("Location");
                conn.disconnect();
                if (location == null) return null;
                String target = new URL(new URL(url), location).toString();
                addHost(Uri.parse(target).getHost());
                String html =
                    "<!doctype html><meta charset=\"utf-8\"><meta http-equiv=\"refresh\" content=\"0;url=" +
                    escapeHtml(target) +
                    "\"><script>location.replace(" +
                    jsString(target) +
                    ")</script>";
                Map<String, String> headers = new HashMap<>();
                headers.put("Cache-Control", "no-store");
                return new WebResourceResponse(
                    "text/html",
                    "utf-8",
                    200,
                    "OK",
                    headers,
                    new ByteArrayInputStream(html.getBytes(StandardCharsets.UTF_8))
                );
            }

            String mime = "text/html";
            String charset = null;
            String contentType = conn.getContentType();
            if (contentType != null) {
                String[] parts = contentType.split(";");
                mime = parts[0].trim();
                for (int i = 1; i < parts.length; i++) {
                    String p = parts[i].trim();
                    if (p.toLowerCase(Locale.ROOT).startsWith("charset=")) charset = p.substring(8).trim().replace("\"", "");
                }
            }

            Map<String, String> headers = new HashMap<>();
            for (Map.Entry<String, List<String>> f : fields.entrySet()) {
                String key = f.getKey();
                if (key == null) continue;
                String k = key.toLowerCase(Locale.ROOT);
                if (
                    k.equals("x-frame-options") ||
                    k.equals("set-cookie") ||
                    k.equals("content-length") ||
                    k.equals("content-encoding") ||
                    k.equals("transfer-encoding") ||
                    k.equals("connection") ||
                    k.equals("content-type")
                ) continue;
                String value = TextUtils.join(", ", f.getValue());
                if (k.equals("content-security-policy")) {
                    value = withoutFrameAncestors(value);
                    if (value.isEmpty()) continue;
                }
                headers.put(key, value);
            }

            InputStream body = status >= 400 ? conn.getErrorStream() : conn.getInputStream();
            if (body == null) body = new ByteArrayInputStream(new byte[0]);
            String reason = conn.getResponseMessage();
            if (reason == null || reason.trim().isEmpty()) reason = status >= 400 ? "Error" : "OK";
            if (status < 100 || status > 599) return null;
            return new WebResourceResponse(mime, charset, status, reason, headers, body);
        } catch (Exception e) {
            if (conn != null) conn.disconnect();
            return null;
        }
    }

    /** CSP에서 frame-ancestors 지시어만 뺀다 (여러 정책이 쉼표로 이어진 경우 포함) */
    static String withoutFrameAncestors(String csp) {
        StringBuilder out = new StringBuilder();
        for (String policy : csp.split(",")) {
            StringBuilder kept = new StringBuilder();
            for (String directive : policy.split(";")) {
                String d = directive.trim();
                if (d.isEmpty() || d.toLowerCase(Locale.ROOT).startsWith("frame-ancestors")) continue;
                if (kept.length() > 0) kept.append("; ");
                kept.append(d);
            }
            if (kept.length() == 0) continue;
            if (out.length() > 0) out.append(", ");
            out.append(kept);
        }
        return out.toString();
    }

    private static String header(Map<String, String> headers, String name) {
        if (headers == null) return null;
        for (Map.Entry<String, String> h : headers.entrySet()) {
            if (h.getKey() != null && h.getKey().equalsIgnoreCase(name)) return h.getValue();
        }
        return null;
    }

    private static String escapeHtml(String s) {
        return s.replace("&", "&amp;").replace("\"", "&quot;").replace("<", "&lt;").replace(">", "&gt;");
    }

    private static String jsString(String s) {
        StringBuilder b = new StringBuilder("\"");
        for (char c : s.toCharArray()) {
            if (c == '"' || c == '\\') b.append('\\').append(c);
            else if (c == '<') b.append("\\u003c");
            else if (c < 0x20) b.append(String.format(Locale.ROOT, "\\u%04x", (int) c));
            else b.append(c);
        }
        return b.append('"').toString();
    }
}
