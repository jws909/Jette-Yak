package com.app.guide.service;
import java.util.*;
import org.springframework.stereotype.Service;
import com.app.guide.dao.MedicationGuideDao;
import com.app.guide.dto.DurInfoDto;

@Service
public class DurGuideService {
    private final MedicationGuideDao dao;
    public DurGuideService(MedicationGuideDao dao) { this.dao = dao; }
    public record DurResult(String status, List<DurInfoDto> items, List<String> queriedIngredients,
            List<String> matchedIngredients, List<String> unmatchedIngredients) {}
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
    public static List<String> ingredients(String text) {
        if (text == null || text.isBlank()) return List.of();
        Map<String,String> distinct = new LinkedHashMap<>();
        for (String part : text.split("/")) {
            String name = part.trim();
            if (!name.isEmpty()) distinct.putIfAbsent(normalize(name), name);
        }
        return List.copyOf(distinct.values());
    }
    public static String normalize(String text) {
        return text == null ? "" : text.replaceAll("\\s+", "").toLowerCase(Locale.ROOT);
    }
}
