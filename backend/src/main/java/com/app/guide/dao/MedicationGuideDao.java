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
}
