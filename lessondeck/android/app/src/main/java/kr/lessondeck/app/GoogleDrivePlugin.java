package kr.lessondeck.app;

import android.app.Activity;
import androidx.activity.result.ActivityResultLauncher;
import androidx.activity.result.IntentSenderRequest;
import androidx.activity.result.contract.ActivityResultContracts;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.google.android.gms.auth.api.identity.AuthorizationRequest;
import com.google.android.gms.auth.api.identity.AuthorizationResult;
import com.google.android.gms.auth.api.identity.Identity;
import com.google.android.gms.common.api.ApiException;
import com.google.android.gms.common.api.Scope;
import java.util.Collections;

/**
 * 구글 드라이브 "앱 전용 숨김 폴더"(drive.appdata) 권한을 받아 액세스 토큰을 돌려준다.
 * 웹뷰 안에서는 구글 로그인이 막혀 있어서 안드로이드 Google Identity(AuthorizationClient)를 쓴다.
 * Google Cloud에 패키지 이름 + 서명 SHA-1로 만든 Android OAuth 클라이언트가 있어야 한다.
 */
@CapacitorPlugin(name = "GoogleDrive")
public class GoogleDrivePlugin extends Plugin {

    private static final String DRIVE_APPDATA = "https://www.googleapis.com/auth/drive.appdata";

    private ActivityResultLauncher<IntentSenderRequest> consentLauncher;
    private PluginCall pendingCall;

    @Override
    public void load() {
        // 동의 화면 결과를 받는 런처는 화면이 시작되기 전(플러그인 등록 시점)에 만들어야 한다
        consentLauncher = getActivity().registerForActivityResult(
            new ActivityResultContracts.StartIntentSenderForResult(),
            result -> {
                PluginCall call = pendingCall;
                pendingCall = null;
                if (call == null) return;
                if (result.getResultCode() != Activity.RESULT_OK) {
                    call.reject("구글 계정 연결을 취소했습니다", "CANCELED");
                    return;
                }
                try {
                    AuthorizationResult auth = Identity.getAuthorizationClient(getActivity())
                        .getAuthorizationResultFromIntent(result.getData());
                    resolveToken(call, auth);
                } catch (ApiException e) {
                    call.reject("구글 계정 연결에 실패했습니다 (" + e.getStatusCode() + ")", "API_" + e.getStatusCode());
                }
            }
        );
    }

    @PluginMethod
    public void authorize(PluginCall call) {
        boolean interactive = Boolean.TRUE.equals(call.getBoolean("interactive", true));
        AuthorizationRequest request = AuthorizationRequest.builder()
            .setRequestedScopes(Collections.singletonList(new Scope(DRIVE_APPDATA)))
            .build();
        Identity.getAuthorizationClient(getActivity())
            .authorize(request)
            .addOnSuccessListener(auth -> {
                if (auth.hasResolution()) {
                    if (!interactive || auth.getPendingIntent() == null) {
                        call.reject("구글 계정 연결(동의)이 필요합니다", "NEED_CONSENT");
                        return;
                    }
                    pendingCall = call;
                    consentLauncher.launch(new IntentSenderRequest.Builder(auth.getPendingIntent().getIntentSender()).build());
                } else {
                    resolveToken(call, auth);
                }
            })
            .addOnFailureListener(e -> {
                String code = e instanceof ApiException ? "API_" + ((ApiException) e).getStatusCode() : "FAILED";
                call.reject(e.getMessage() != null ? e.getMessage() : "구글 계정 연결에 실패했습니다", code);
            });
    }

    private void resolveToken(PluginCall call, AuthorizationResult auth) {
        String token = auth.getAccessToken();
        if (token == null) {
            call.reject("구글 액세스 토큰을 받지 못했습니다", "NO_TOKEN");
            return;
        }
        JSObject ret = new JSObject();
        ret.put("accessToken", token);
        call.resolve(ret);
    }
}
