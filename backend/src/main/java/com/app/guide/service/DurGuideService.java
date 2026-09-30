/**
 * 파일 역할: 제품 성분을 DUR 테이블 성분명과 연결하여 약별 주의정보를 조회합니다.
 * 핵심 규칙: 성분 표기 차이로 누락될 수 있으므로 결과 0건을 안전하다는 뜻으로 해석하지 않습니다.
 */
package com.app.guide.service;
import java.util.*;
import org.springframework.stereotype.Service;
import org.springframework.dao.DataAccessException;
import com.app.guide.dao.MedicationGuideDao;
import com.app.guide.dto.DurInfoDto;

@Service
public class DurGuideService {
    private final MedicationGuideDao dao;
    public DurGuideService(MedicationGuideDao dao) { this.dao = dao; }
    public record DurResult(String status, List<DurInfoDto> items, List<String> queriedIngredients,
            List<String> matchedIngredients, List<String> unmatchedIngredients,
            Map<String, Long> canonicalIngredientIds) {
        public DurResult(String status, List<DurInfoDto> items, List<String> queriedIngredients,
                List<String> matchedIngredients, List<String> unmatchedIngredients) {
            this(status, items, queriedIngredients, matchedIngredients, unmatchedIngredients, Map.of());
        }
    }

    /** 기존 호출부와 마이그레이션 전 DB를 위한 정확 일치 조회다. */
    public DurResult find(String materialName) {
        List<String> ingredients = ingredients(materialName);
        if (ingredients.isEmpty()) return new DurResult("NO_INGREDIENTS", List.of(), ingredients, List.of(), List.of());
        List<String> keys = ingredients.stream().map(DurGuideService::normalize).distinct().toList();
        List<DurInfoDto> rows = dao.findDur(keys);
        Set<String> matched = new HashSet<>();
        for (DurInfoDto row : rows) {
            if (keys.contains(normalize(row.getIngrAName()))) matched.add(normalize(row.getIngrAName()));
            if (row.getTabooType() == 4 && keys.contains(normalize(row.getIngrBName()))) matched.add(normalize(row.getIngrBName()));
        }
        return new DurResult(rows.isEmpty() ? "NO_MATCH" : "MATCHED", rows, ingredients,
            ingredients.stream().filter(v -> matched.contains(normalize(v))).toList(),
            ingredients.stream().filter(v -> !matched.contains(normalize(v))).toList());
    }

    /**
     * 제품 ID가 있으면 표준 성분/검증된 별칭 인덱스를 우선 사용한다.
     * 새 DB 마이그레이션을 아직 실행하지 않은 환경에서는 기존 정확 일치 방식으로 안전하게 돌아간다.
     */
    public DurResult find(String medicationId, String materialName) {
        if (medicationId == null || medicationId.isBlank()) return find(materialName);
        List<String> rawIngredients = ingredients(materialName);
        if (rawIngredients.isEmpty())
            return new DurResult("NO_INGREDIENTS", List.of(), List.of(), List.of(), List.of(), Map.of());
        try {
            List<com.app.guide.dto.MedicationIngredientDto> mappings = dao.findMedicationIngredients(medicationId);
            if (mappings.isEmpty()) {
                mappings = dao.resolveIngredientAliases(rawIngredients.stream().map(DurGuideService::normalize).toList());
            }
            Map<String, Long> canonical = new LinkedHashMap<>();
            for (var mapping : mappings) {
                if (mapping.getIngredientId() != null)
                    canonical.put(normalize(mapping.getNormalizedName()), mapping.getIngredientId());
            }
            List<Long> ids = canonical.values().stream().distinct().toList();
            if (ids.isEmpty()) return find(materialName);

            List<DurInfoDto> rows = dao.findDurByIngredientIds(ids);
            Set<Long> matchedIds = new HashSet<>(dao.findDurMatchedIngredientIds(ids));

            // 병용 상대 성분까지 같은 표준 ID로 비교할 수 있도록 DUR 원문 별칭도 한 번에 해석한다.
            List<String> durNames = rows.stream()
                    .flatMap(row -> java.util.stream.Stream.of(row.getIngrAName(), row.getIngrBName()))
                    .filter(Objects::nonNull).map(DurGuideService::normalize).filter(v -> !v.isBlank())
                    .distinct().toList();
            for (var mapping : dao.resolveIngredientAliases(durNames)) {
                if (mapping.getIngredientId() != null)
                    canonical.put(normalize(mapping.getNormalizedName()), mapping.getIngredientId());
            }

            List<String> matched = rawIngredients.stream()
                    .filter(raw -> matchedIds.contains(canonical.get(normalize(raw)))).toList();
            List<String> unmatched = rawIngredients.stream()
                    .filter(raw -> !matchedIds.contains(canonical.get(normalize(raw)))).toList();
            return new DurResult(rows.isEmpty() ? "NO_MATCH" : "MATCHED", rows, rawIngredients,
                    matched, unmatched, Map.copyOf(canonical));
        } catch (DataAccessException | org.apache.ibatis.exceptions.PersistenceException ex) {
            return find(materialName);
        }
    }
    public static List<String> ingredients(String text) {
        if (text == null || text.isBlank()) return List.of();
        Map<String,String> distinct = new LinkedHashMap<>();
        for (String part : text.split("[/;|]+")) {
            String name = part.trim();
            if (!name.isEmpty()) distinct.putIfAbsent(normalize(name), name);
        }
        return List.copyOf(distinct.values());
    }
    public static String normalize(String text) {
        return text == null ? "" : text.trim()
                .replaceAll("[\\p{Z}\\p{P}\\s]+", "")
                .toLowerCase(Locale.ROOT);
    }
}
