package kr.lessondeck.app;

import android.app.Activity;
import android.content.Context;
import android.content.Intent;
import android.content.pm.PackageInfo;
import android.content.pm.PackageManager;
import android.content.pm.Signature;
import android.net.Uri;
import android.os.Build;
import android.provider.Settings;
import androidx.core.content.FileProvider;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import java.io.File;
import java.io.FileOutputStream;
import java.io.InputStream;
import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.util.Arrays;

/**
 * 앱 안 업데이트 (v0.34, SPEC 5장 "앱 배포·업데이트").
 * - info(): 지금 앱의 versionName·versionCode, 설치 허용("이 출처의 앱 설치 허용") 여부
 * - download({ url }): GitHub 릴리스의 lessondeck.apk를 앱 캐시 updates/에 받는다(진행은 "progress" 알림).
 *   받은 파일이 같은 패키지(kr.lessondeck.app)이고, 지금 앱과 서명이 같고, versionCode가 더 클 때만 성공 — 아니면 지운다
 * - install(): 받아 둔 파일로 안드로이드 설치 화면을 연다. 설치 허용이 꺼져 있으면 그 설정 화면을 열고 { status: "permission" }
 */
@CapacitorPlugin(name = "AppUpdate")
public class AppUpdatePlugin extends Plugin {

    private static final String DIR = "updates";
    private static final String FILE = "lessondeck-update.apk";
    private static final int TIMEOUT_MS = 30000;
    /** 너무 큰 파일은 받지 않는다 (지금 APK는 약 20MB) */
    private static final long MAX_BYTES = 200L * 1024L * 1024L;

    private volatile boolean downloading = false;

    /** 앱이 켜질 때: 이미 설치한(또는 더 오래된) 업데이트 파일은 지운다 (캐시 약 20MB) */
    @Override
    public void load() {
        Context context = getContext();
        new Thread(() -> {
            File file = new File(new File(context.getCacheDir(), DIR), FILE);
            if (!file.exists()) return;
            try {
                PackageInfo apk = context.getPackageManager().getPackageArchiveInfo(file.getAbsolutePath(), 0);
                if (apk == null || versionCode(apk) <= versionCode(selfInfo(context))) file.delete();
            } catch (Exception e) {
                file.delete();
            }
        }).start();
    }

    @PluginMethod
    public void info(PluginCall call) {
        JSObject out = new JSObject();
        try {
            PackageInfo me = selfInfo(getContext());
            out.put("versionName", me.versionName);
            out.put("versionCode", versionCode(me));
        } catch (Exception e) {
            call.reject("앱 정보를 읽지 못했습니다");
            return;
        }
        out.put("canInstall", canInstall(getContext()));
        call.resolve(out);
    }

    @PluginMethod
    public void download(PluginCall call) {
        String url = call.getString("url", "");
        if (url == null || !url.startsWith("https://")) {
            call.reject("업데이트 주소가 올바르지 않습니다");
            return;
        }
        if (downloading) {
            call.reject("이미 받는 중입니다");
            return;
        }
        downloading = true;
        Context context = getContext();
        new Thread(() -> {
            File file = updateFile(context);
            try {
                fetch(url, file);
                JSObject checked = verify(context, file);
                checked.put("bytes", file.length());
                call.resolve(checked);
            } catch (Exception e) {
                file.delete();
                String msg = e.getMessage();
                call.reject(msg != null && !msg.isEmpty() ? msg : "새 버전을 받지 못했습니다");
            } finally {
                downloading = false;
            }
        }).start();
    }

    @PluginMethod
    public void install(PluginCall call) {
        Activity activity = getActivity();
        Context context = getContext();
        File file = updateFile(context);
        if (!file.exists()) {
            call.reject("받아 둔 새 버전이 없습니다");
            return;
        }
        // 안드로이드 8부터: 이 앱이 설치 화면을 열려면 "이 출처의 앱 설치 허용"이 켜져 있어야 한다
        if (!canInstall(context)) {
            try {
                Intent settings = new Intent(Settings.ACTION_MANAGE_UNKNOWN_APP_SOURCES, Uri.parse("package:" + context.getPackageName()));
                activity.startActivity(settings);
            } catch (Exception e) {
                activity.startActivity(new Intent(Settings.ACTION_SECURITY_SETTINGS));
            }
            JSObject out = new JSObject();
            out.put("status", "permission");
            call.resolve(out);
            return;
        }
        try {
            Uri uri = FileProvider.getUriForFile(context, context.getPackageName() + ".fileprovider", file);
            Intent intent = new Intent(Intent.ACTION_VIEW);
            intent.setDataAndType(uri, "application/vnd.android.package-archive");
            intent.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION | Intent.FLAG_ACTIVITY_NEW_TASK);
            activity.startActivity(intent);
            JSObject out = new JSObject();
            out.put("status", "started");
            call.resolve(out);
        } catch (Exception e) {
            call.reject("설치 화면을 열지 못했습니다");
        }
    }

    private static File updateFile(Context context) {
        File dir = new File(context.getCacheDir(), DIR);
        if (!dir.exists()) dir.mkdirs();
        return new File(dir, FILE);
    }

    private static boolean canInstall(Context context) {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return true;
        return context.getPackageManager().canRequestPackageInstalls();
    }

    /** 주소에서 파일로 받는다. GitHub 릴리스는 다른 주소로 넘겨주므로(302) https끼리 몇 번까지 따라간다 */
    private void fetch(String start, File file) throws Exception {
        String url = start;
        for (int hop = 0; hop < 6; hop++) {
            HttpURLConnection conn = (HttpURLConnection) new URL(url).openConnection();
            conn.setInstanceFollowRedirects(false);
            conn.setConnectTimeout(TIMEOUT_MS);
            conn.setReadTimeout(TIMEOUT_MS);
            conn.setRequestProperty("User-Agent", "LessonDeck-Updater");
            conn.setRequestProperty("Accept", "application/octet-stream");
            int code = conn.getResponseCode();
            if (code >= 300 && code < 400) {
                String next = conn.getHeaderField("Location");
                conn.disconnect();
                if (next == null) throw new Exception("새 버전 주소를 따라가지 못했습니다");
                URL resolved = new URL(new URL(url), next);
                if (!"https".equals(resolved.getProtocol())) throw new Exception("안전하지 않은 주소라 받지 않습니다");
                url = resolved.toString();
                continue;
            }
            if (code != 200) {
                conn.disconnect();
                throw new Exception("새 버전을 받지 못했습니다 (" + code + ")");
            }
            long total = conn.getContentLengthLong();
            if (total > MAX_BYTES) {
                conn.disconnect();
                throw new Exception("파일이 너무 큽니다");
            }
            try (InputStream in = conn.getInputStream(); OutputStream out = new FileOutputStream(file)) {
                byte[] buf = new byte[64 * 1024];
                long received = 0;
                long lastSent = 0;
                int n;
                while ((n = in.read(buf)) > 0) {
                    out.write(buf, 0, n);
                    received += n;
                    if (received > MAX_BYTES) throw new Exception("파일이 너무 큽니다");
                    // 진행: 약 256KB마다 화면에 알린다
                    if (received - lastSent >= 256 * 1024) {
                        lastSent = received;
                        JSObject p = new JSObject();
                        p.put("received", received);
                        p.put("total", total);
                        notifyListeners("progress", p);
                    }
                }
                JSObject p = new JSObject();
                p.put("received", received);
                p.put("total", total > 0 ? total : received);
                notifyListeners("progress", p);
            } finally {
                conn.disconnect();
            }
            return;
        }
        throw new Exception("새 버전 주소를 따라가지 못했습니다");
    }

    /** 받은 파일이 이 앱의 새 버전인지: 같은 패키지 · 같은 서명 · 더 큰 versionCode */
    private static JSObject verify(Context context, File file) throws Exception {
        PackageManager pm = context.getPackageManager();
        int flags = Build.VERSION.SDK_INT >= Build.VERSION_CODES.P ? PackageManager.GET_SIGNING_CERTIFICATES : PackageManager.GET_SIGNATURES;
        PackageInfo apk = pm.getPackageArchiveInfo(file.getAbsolutePath(), flags);
        if (apk == null) throw new Exception("받은 파일이 앱 설치 파일이 아닙니다");
        if (!context.getPackageName().equals(apk.packageName)) throw new Exception("다른 앱의 설치 파일입니다");
        PackageInfo me = selfInfo(context);
        if (!sameSigner(signers(me), signers(apk))) {
            throw new Exception("서명이 지금 앱과 달라 설치할 수 없습니다. 레슨덱을 지우고 새로 설치해 주세요");
        }
        if (versionCode(apk) <= versionCode(me)) throw new Exception("이미 최신 버전입니다");
        JSObject out = new JSObject();
        out.put("versionName", apk.versionName);
        out.put("versionCode", versionCode(apk));
        return out;
    }

    private static PackageInfo selfInfo(Context context) throws Exception {
        PackageManager pm = context.getPackageManager();
        int flags = Build.VERSION.SDK_INT >= Build.VERSION_CODES.P ? PackageManager.GET_SIGNING_CERTIFICATES : PackageManager.GET_SIGNATURES;
        return pm.getPackageInfo(context.getPackageName(), flags);
    }

    private static long versionCode(PackageInfo info) {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.P) return info.getLongVersionCode();
        return info.versionCode;
    }

    private static Signature[] signers(PackageInfo info) {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.P) {
            if (info.signingInfo == null) return new Signature[0];
            return info.signingInfo.hasMultipleSigners() ? info.signingInfo.getApkContentsSigners() : info.signingInfo.getSigningCertificateHistory();
        }
        return info.signatures != null ? info.signatures : new Signature[0];
    }

    /** 새 파일의 서명 중 하나라도 지금 앱의 서명과 같으면 같은 서명 (키를 바꾼 기록이 있어도) */
    private static boolean sameSigner(Signature[] mine, Signature[] theirs) {
        if (mine.length == 0 || theirs.length == 0) return false;
        for (Signature a : mine) {
            for (Signature b : theirs) {
                if (Arrays.equals(a.toByteArray(), b.toByteArray())) return true;
            }
        }
        return false;
    }
}
