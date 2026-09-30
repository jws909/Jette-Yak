package com.app.service;

import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import com.app.dao.ScheduleDAO;
import com.app.guide.dao.MedicationGuideDao;

/** 마이페이지의 상비약·영양제와 그 하위 일정을 한 작업으로 삭제한다. */
@Service
public class EverydayMedicationService {
    private final ScheduleDAO scheduleDao;
    private final MedicationGuideDao guideDao;

    public EverydayMedicationService(ScheduleDAO scheduleDao, MedicationGuideDao guideDao) {
        this.scheduleDao=scheduleDao;
        this.guideDao=guideDao;
    }

    @Transactional
    public void delete(long userId,String source,long registrationId) {
        if(userId<=0||registrationId<=0) throw new IllegalArgumentException("삭제할 약 정보를 확인해주세요.");
        String normalized=source==null?"":source.trim().toUpperCase();
        String stateId;
        int deleted;
        if("CABINET".equals(normalized)||"C".equals(normalized)) {
            // FK_SCHEDULES_CABINET 때문에 반드시 자식 일정부터 삭제한다.
            scheduleDao.deleteSchedulesByCabinetId(userId,registrationId);
            stateId="C:"+registrationId;
            guideDao.deleteUseState(userId,stateId);
            deleted=scheduleDao.deleteCabinetMedication(userId,registrationId);
        } else if("ROUTINE".equals(normalized)||"R".equals(normalized)) {
            scheduleDao.deleteSchedulesByRoutineId(userId,registrationId);
            stateId="R:"+registrationId;
            guideDao.deleteUseState(userId,stateId);
            deleted=scheduleDao.deleteRoutineMedication(userId,registrationId);
        } else {
            throw new IllegalArgumentException("삭제할 약 종류를 확인해주세요.");
        }
        if(deleted!=1) throw new IllegalArgumentException("삭제할 약이 없거나 이미 삭제되었습니다. 목록을 새로고침해주세요.");
        guideDao.saveOverallGuide(userId,null);
    }
}
