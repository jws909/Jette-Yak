/**
 * 역할: 표준 성분과 별칭 우선 조회, 기존 원문 조회 호환성을 DB 없이 점검
 * 실행 방식: 모의 MedicationGuideDao 사용
 */
package com.app.guide;

import java.util.ArrayList;
import java.util.List;
import com.app.guide.dao.MedicationGuideDao;
import com.app.guide.dto.DurInfoDto;
import com.app.guide.dto.MedicationIngredientDto;
import com.app.guide.service.DurGuideService;

public class IngredientMatchingCheck {
    private static int checks;
    private static void check(boolean condition,String message){if(!condition)throw new AssertionError(message);checks++;}
    private static MedicationIngredientDto mapping(long id,String raw){
        var value=new MedicationIngredientDto();value.setIngredientId(id);value.setRawName(raw);
        value.setNormalizedName(DurGuideService.normalize(raw));value.setMatchStatus("ALIAS");return value;
    }
    public static void main(String[] args){
        var row=new DurInfoDto();row.setTabooType(4);row.setIngrAName("성분-A");row.setIngrBName("Ingredient B");
        var dao=new MedicationGuideDao(null){
            @Override public List<MedicationIngredientDto> findMedicationIngredients(String id){
                return List.of(mapping(10,"Ingredient A"),mapping(20,"Ingredient-B"));
            }
            @Override public List<MedicationIngredientDto> resolveIngredientAliases(List<String> names){
                var result=new ArrayList<MedicationIngredientDto>();
                if(names.contains("성분a"))result.add(mapping(10,"성분-A"));
                if(names.contains("ingredientb"))result.add(mapping(20,"Ingredient B"));
                return result;
            }
            @Override public List<DurInfoDto> findDurByIngredientIds(List<Long> ids){return List.of(row);}
            @Override public List<Long> findDurMatchedIngredientIds(List<Long> ids){return List.of(10L,20L);}
        };
        var result=new DurGuideService(dao).find("M1","Ingredient A/Ingredient-B");
        check("MATCHED".equals(result.status()),"canonical lookup status");
        check(result.unmatchedIngredients().isEmpty(),"all product ingredients linked");
        check(result.canonicalIngredientIds().get("성분a")==10L,"Korean alias shares canonical id");
        check(DurGuideService.ingredients(" A ; a|B /").equals(List.of("A","B")),"supported delimiters and deduplication");
        check("ingredienta".equals(DurGuideService.normalize(" Ingredient-A ")),"space and punctuation normalization");
        System.out.println("PASS: "+checks+" ingredient matching checks");
    }
}
