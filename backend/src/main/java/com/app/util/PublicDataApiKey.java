package com.app.util;

/**
 * 공공데이터포털 인증키를 소스 코드 밖에서 읽는다.
 */
public final class PublicDataApiKey {
    public static final String SETTING_NAME = "DATA_GO_KR_SERVICE_KEY";

    private PublicDataApiKey() {
    }

    public static String get() {
        String key = System.getenv(SETTING_NAME);
        if (key == null || key.isBlank()) {
            key = System.getProperty(SETTING_NAME);
        }
        if (key == null || key.isBlank()) {
            throw new IllegalStateException(
                    "공공데이터 API 키가 설정되지 않았습니다. Tomcat 실행 환경에 "
                            + SETTING_NAME + "를 추가해주세요.");
        }
        return key.trim();
    }
}
