/**
 * 역할: 제품 원문 성분을 표준 성분과 검증된 별칭 인덱스로 변환
 * 트랜잭션 기준: 부모 동기화와 같은 연결을 사용하고, 인덱싱 실패는 저장점으로 복구
 */
package com.app.medication.service;

import java.util.LinkedHashMap;
import java.util.Map;
import org.apache.logging.log4j.LogManager;
import org.apache.logging.log4j.Logger;
import org.springframework.dao.DataAccessException;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.interceptor.TransactionAspectSupport;
import com.app.guide.service.DurGuideService;
import com.app.medication.dao.MedicationDao;

@Service
public class IngredientIndexService {
    private static final Logger log=LogManager.getLogger(IngredientIndexService.class);
    private final MedicationDao dao;
    private volatile boolean schemaAvailable=true;
    public IngredientIndexService(MedicationDao dao){this.dao=dao;}

    // 신규 품목 INSERT가 아직 커밋되지 않아도 같은 연결에서 FK를 확인할 수 있음.
    // 실패 시 저장점 이후의 인덱스 작업만 되돌리고 부모의 품목 저장은 유지.
    @Transactional(propagation=Propagation.NESTED)
    public synchronized boolean indexMedication(String medicationId,String materialName){
        if(!schemaAvailable||medicationId==null||medicationId.isBlank()) return false;
        try{
            dao.deleteMedicationIngredients(medicationId);
            for(String raw:DurGuideService.ingredients(materialName)){
                String normalized=DurGuideService.normalize(raw);
                if(normalized.isBlank()) continue;
                Long ingredientId=dao.findIngredientIdByAlias(normalized);
                if(ingredientId==null){
                    ingredientId=dao.nextIngredientId();
                    Map<String,Object> ingredient=new LinkedHashMap<>();
                    ingredient.put("ingredientId",ingredientId);ingredient.put("rawName",raw);ingredient.put("normalizedName",normalized);
                    dao.insertIngredientMaster(ingredient);dao.insertIngredientAlias(ingredient);
                }
                Map<String,Object> mapping=new LinkedHashMap<>();
                mapping.put("medicationId",medicationId);mapping.put("ingredientId",ingredientId);
                mapping.put("rawName",raw);mapping.put("normalizedName",normalized);
                dao.insertMedicationIngredient(mapping);
            }
            return true;
        }catch(DataAccessException ex){
            TransactionAspectSupport.currentTransactionStatus().setRollbackOnly();
            if (schemaMissing(ex)) {
                schemaAvailable=false;
                log.warn("성분 인덱스 테이블을 사용할 수 없습니다. 성분 마이그레이션 실행 후 서버를 재시작하세요.");
            } else {
                // 일시적인 충돌이나 특정 품목 데이터 오류가 다음 품목까지 차단하지 않게 분리.
                // SQL 예외 원문에는 데이터가 포함될 수 있어 로그에 기록하지 않음.
                log.warn("품목 성분 인덱싱을 완료하지 못해 해당 작업을 되돌렸습니다. 다음 동기화에서 다시 시도합니다.");
            }
            return false;
        }
    }

    private static boolean schemaMissing(Throwable error) {
        for (Throwable cause=error; cause!=null; cause=cause.getCause()) {
            if (cause instanceof java.sql.SQLException sql
                    && (sql.getErrorCode()==942 || sql.getErrorCode()==904)) return true;
        }
        return false;
    }

}
