/**
 * 파일 역할: 의약품 상세, DUR, 사용자 등록 약과 상태 변경에 필요한 DB 조회 계약입니다.
 * 핵심 규칙: 복용 중 비교 쿼리는 ACTIVE 상태와 사용자 소유 조건을 모두 포함해야 합니다.
 */
package com.app.guide.dao;
import java.util.Map;
import java.util.List;
import com.app.guide.dto.DurInfoDto;
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
    public MedicationGuideDto find(String id) {
        return session.selectOne("com.app.guide.dao.MedicationGuideDao.find", Map.of("id", id));
    }
    public List<DurInfoDto> findDur(List<String> names) {
        if (names.isEmpty()) return List.of();
        return session.selectList("com.app.guide.dao.MedicationGuideDao.findDur", Map.of("names", names));
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
