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

/** 제품 원문 성분을 검증 가능한 표준 성분 인덱스로 변환한다. */
@Service
public class IngredientIndexService {
    private static final Logger log=LogManager.getLogger(IngredientIndexService.class);
    private final MedicationDao dao;
    private volatile boolean schemaAvailable=true;
    public IngredientIndexService(MedicationDao dao){this.dao=dao;}

    @Transactional(propagation=Propagation.REQUIRES_NEW)
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
            schemaAvailable=false;
            log.warn("성분 인덱스 테이블을 사용할 수 없습니다. 20260930 마이그레이션 실행 후 서버를 재시작하세요.");
            return false;
        }
    }

}
