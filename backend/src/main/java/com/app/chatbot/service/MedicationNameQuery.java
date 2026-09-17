package com.app.chatbot.service;

import java.util.*;
import java.util.regex.Pattern;

/** Conservative name hints: unknown hints require clarification, never reuse the selected drug silently. */
public final class MedicationNameQuery {
    private MedicationNameQuery() {}
    private static final Set<String> COMMON = Set.of(
        "이", "그", "저", "이거", "그거", "저거", "이건", "그건", "약", "약품", "의약품",
        "제품", "정보", "등록된", "등록", "효능", "효과", "성분", "용법", "용량", "사용법",
        "복용법", "복용량", "부작용", "주의사항", "음식", "궁합", "병용금기", "금기",
        "제조사", "업체", "이름", "분류", "일반의약품", "전문의약품", "알려줘", "알려주세요",
        "설명해줘", "설명해주세요", "설명", "쉽게", "간단히", "자세히", "조금", "좀",
        "어때", "어때요", "어떤", "어떻게", "무엇", "뭐", "뭐야", "뭔가요", "뭐예요",
        "먹어", "먹어도", "먹는", "먹고", "먹는데", "먹으면", "먹나요", "먹어요",
        "복용", "가능", "가능해", "가능한가요", "같이", "함께", "둘", "둘다", "두", "두개",
        "비교", "비교해줘", "차이", "차이점", "찾아줘", "찾아주세요", "검색", "대해",
        "대한", "대해서", "궁금해", "궁금해요", "있어", "있나요", "있어요", "없어",
        "없나요", "안전해", "안전한가요", "괜찮아", "괜찮나요", "되나요", "돼",
        "그리고", "그럼", "그러면", "또", "다른", "현재", "선택한", "지금", "나",
        "내가", "나는", "제가", "저는", "알고", "싶어", "싶어요"
    );
    private static final Pattern SUFFIX = Pattern.compile(
        "(?:알려주세요|설명해주세요|알려줘|설명해줘|먹는데|먹어요|먹는|어때요|어때|인가요|이랑|하고|으로|에서|보다|처럼|이야|이요|은|는|을|를|의|에|도|과|와|랑|이|가|요)$"
    );
    public static List<String> hints(String question) {
        LinkedHashSet<String> result = new LinkedHashSet<>();
        for (String raw : question.toLowerCase(Locale.ROOT).split("[^\\p{L}\\p{N}.]+")) {
            if (raw.isBlank() || raw.matches("[0-9.]+") || COMMON.contains(raw)) continue;
            String word = raw;
            for (int i = 0; i < 3; i++) {
                String stripped = SUFFIX.matcher(word).replaceFirst("");
                if (stripped.equals(word) || stripped.isEmpty()) break;
                word = stripped;
                if (COMMON.contains(word)) break;
            }
            if (!word.isBlank() && !COMMON.contains(word)) result.add(word);
        }
        return new ArrayList<>(result);
    }
}
