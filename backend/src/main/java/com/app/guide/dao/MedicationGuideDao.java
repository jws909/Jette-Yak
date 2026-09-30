package com.app.guide.dao;
import java.util.Map;
import java.util.List;
import com.app.guide.dto.DurInfoDto;
import com.app.guide.dto.MedicationIngredientDto;
import org.apache.ibatis.session.SqlSession;
import org.springframework.stereotype.Repository;
import com.app.guide.dto.MedicationGuideDto;
@Repository
public class MedicationGuideDao {
    private final SqlSession session;
    public MedicationGuideDao(SqlSession session) { this.session = session; }
    public List<com.app.guide.dto.RegisteredMedicationDto> findRegistered(long userId) {
        return session.selectList("com.app.guide.dao.MedicationGuideDao.findRegistered", Map.of("userId", userId));
    }
    public List<com.app.guide.dto.RegisteredMedicationDto> collection(long userId) {
        return session.selectList("com.app.guide.dao.MedicationGuideDao.collection", Map.of("userId", userId));
    }
    public int updateStatus(long userId, String registrationId, String status) {
        return session.update("com.app.guide.dao.MedicationGuideDao.updateStatus", Map.of("userId",userId,"registrationId",registrationId,"status",status));
    }
    public int deleteUseState(long userId,String registrationId) {
        return session.delete("com.app.guide.dao.MedicationGuideDao.deleteUseState",
                Map.of("userId",userId,"registrationId",registrationId));
    }
    public MedicationGuideDto find(String id) {
        return session.selectOne("com.app.guide.dao.MedicationGuideDao.find", Map.of("id", id));
    }
    public List<DurInfoDto> findDur(List<String> names) {
        if (names.isEmpty()) return List.of();
        return session.selectList("com.app.guide.dao.MedicationGuideDao.findDur", Map.of("names", names));
    }
    public List<MedicationIngredientDto> findMedicationIngredients(String medicationId) {
        return session.selectList("com.app.guide.dao.MedicationGuideDao.findMedicationIngredients",
                Map.of("medicationId", medicationId));
    }
    public List<MedicationIngredientDto> resolveIngredientAliases(List<String> names) {
        if (names.isEmpty()) return List.of();
        return session.selectList("com.app.guide.dao.MedicationGuideDao.resolveIngredientAliases",
                Map.of("names", names));
    }
    public List<DurInfoDto> findDurByIngredientIds(List<Long> ingredientIds) {
        if (ingredientIds.isEmpty()) return List.of();
        return session.selectList("com.app.guide.dao.MedicationGuideDao.findDurByIngredientIds",
                Map.of("ingredientIds", ingredientIds));
    }
    public List<Long> findDurMatchedIngredientIds(List<Long> ingredientIds) {
        if (ingredientIds.isEmpty()) return List.of();
        return session.selectList("com.app.guide.dao.MedicationGuideDao.findDurMatchedIngredientIds",
                Map.of("ingredientIds", ingredientIds));
    }
    public int updateAiSummary(String medicationId, String aiSummaryJson) {
        return session.update("com.app.guide.dao.MedicationGuideDao.updateAiSummary", Map.of("medicationId", medicationId, "aiSummaryJson", aiSummaryJson));
    }
    public com.app.guide.dto.OverallGuideDto findOverallGuide(long userId) {
        return session.selectOne("com.app.guide.dao.MedicationGuideDao.findOverallGuide", userId);
    }
    public int saveOverallGuide(long userId, String aiGuide) {
        Map<String, Object> params = new java.util.HashMap<>();
        params.put("userId", userId);
        params.put("aiGuide", aiGuide);
        return session.update("com.app.guide.dao.MedicationGuideDao.saveOverallGuide", params);
    }
}
