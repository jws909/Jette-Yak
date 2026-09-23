package com.app.guide.service;
import java.util.*;
import org.springframework.stereotype.Service;
import com.app.guide.dao.MedicationGuideDao;
import com.app.guide.dto.*;

@Service
public class MedicationManagementService {
    private final MedicationGuideDao dao;
    private final DurGuideService dur;
    private final com.app.chatbot.client.GeminiService gemini;

    public MedicationManagementService(MedicationGuideDao dao, DurGuideService dur) {
        this(dao, dur, null);
    }

    @org.springframework.beans.factory.annotation.Autowired
    public MedicationManagementService(MedicationGuideDao dao, DurGuideService dur, com.app.chatbot.client.GeminiService gemini) {
        this.dao = dao;
        this.dur = dur;
        this.gemini = gemini;
    }

    public List<RegisteredMedicationDto> collection(long userId) { return dao.collection(userId); }

    public void update(long userId,String registrationId,String status) {
        if (registrationId==null || !registrationId.matches("[PCR]:[0-9]{1,30}") || status==null
                || !Set.of("ACTIVE","PAUSED","ENDED","STORED").contains(status)) throw new IllegalArgumentException("복용 상태를 확인해주세요.");
        if (dao.updateStatus(userId,registrationId,status)!=1)
            throw new IllegalArgumentException("변경할 등록 약이 없거나 처방 기간이 종료·시작 전입니다. 목록을 새로고침해주세요.");
        try {
            // 약 복용 상태 변경 시 통합 복약 가이드 자동 재분석
            getOverallGuide(userId, true);
        } catch (Exception ignored) {}
    }

    public Map<String, Object> getOverallGuide(long userId, boolean forceRefresh) {
        var all = collection(userId);
        var active = all.stream().filter(r -> "ACTIVE".equals(r.getUseStatus())).toList();
        if (active.isEmpty()) {
            return Map.of(
                "hasActiveMeds", false,
                "activeCount", 0,
                "message", "현재 복용 중인 처방약, 상비약 또는 영양제가 없습니다."
            );
        }

        var cached = dao.findOverallGuide(userId);
        if (!forceRefresh && cached != null && cached.getAiGuide() != null && !cached.getAiGuide().isBlank()) {
            return Map.of(
                "hasActiveMeds", true,
                "activeCount", active.size(),
                "aiGuide", cached.getAiGuide(),
                "medUpdatedAt", cached.getMedUpdatedAt() != null ? cached.getMedUpdatedAt() : "",
                "cached", true
            );
        }

        var comparison = myComparison(userId);
        String generatedGuide = (gemini != null)
            ? gemini.generateOverallGuide(active, comparison)
            : (gemini != null ? gemini.createFallbackOverallGuide(active, comparison) : "{}");

        dao.saveOverallGuide(userId, generatedGuide);
        var updated = dao.findOverallGuide(userId);

        return Map.of(
            "hasActiveMeds", true,
            "activeCount", active.size(),
            "aiGuide", generatedGuide,
            "medUpdatedAt", (updated != null && updated.getMedUpdatedAt() != null) ? updated.getMedUpdatedAt() : "",
            "cached", false
        );
    }
    public Map<String,Object> myComparison(long userId) {
        var all=collection(userId);
        var active=all.stream().filter(r->"ACTIVE".equals(r.getUseStatus())).toList();
        var ids=active.stream().map(RegisteredMedicationDto::getMedicationId).filter(Objects::nonNull).distinct().toList();
        var result=compare(ids);
        result.put("unlinked",active.stream().filter(r->r.getMedicationId()==null).map(RegisteredMedicationDto::getItemName).distinct().toList());
        result.put("unconfirmedCount",all.stream().filter(r->"UNCONFIRMED".equals(r.getUseStatus())).count());
        return result;
    }
    public Map<String,Object> compare(List<String> input) {
        if(input==null || input.size()>50 || input.stream().anyMatch(id->id==null||id.isBlank()||id.length()>20))
            throw new IllegalArgumentException("비교할 제품은 최대 50개까지 선택해주세요.");
        var medicines=new ArrayList<MedicationGuideDto>();
        for(String id:new LinkedHashSet<>(input)) {
            var med=dao.find(id);if(med==null)throw new IllegalArgumentException("등록되지 않은 제품입니다. 다시 선택해주세요.");medicines.add(med);
        }
        var keys=new ArrayList<Set<String>>();
        var records=new LinkedHashMap<String,DurInfoDto>();
        var unresolved=new ArrayList<Map<String,Object>>();
        for(var med:medicines) {
            var result=dur.find(med.getMaterialName());
            keys.add(new LinkedHashSet<>(result.queriedIngredients().stream().map(DurGuideService::normalize).toList()));
            if(!result.unmatchedIngredients().isEmpty()||result.queriedIngredients().isEmpty())
                unresolved.add(Map.of("medicationId",med.getMedicationId(),"itemName",med.getItemName(),"ingredients",result.unmatchedIngredients(),"status",result.status()));
            for(var row:result.items()) if(row.getTabooType()==4)
                records.put(row.getIngrAName()+"|"+row.getIngrBName()+"|"+row.getTabooEffect(),row);
        }
        var pairs=new ArrayList<Map<String,Object>>();var duplicateIngredients=new ArrayList<Map<String,Object>>();
        for(int i=0;i<medicines.size();i++)for(int j=i+1;j<medicines.size();j++) {
            final var left=keys.get(i);final var right=keys.get(j);
            var common=new LinkedHashSet<>(left);common.retainAll(right);
            var a=medicines.get(i);var b=medicines.get(j);
            if(!common.isEmpty())duplicateIngredients.add(Map.of("left",a.getItemName(),"right",b.getItemName(),"ingredients",common));
            var matched=records.values().stream().filter(r->{var x=DurGuideService.normalize(r.getIngrAName());var y=DurGuideService.normalize(r.getIngrBName());return left.contains(x)&&right.contains(y)||left.contains(y)&&right.contains(x);}).toList();
            if(!matched.isEmpty())pairs.add(Map.of("left",a,"right",b,"items",matched));
        }
        var result=new LinkedHashMap<String,Object>();
        result.put("medications",medicines);result.put("pairs",pairs);result.put("duplicates",duplicateIngredients);
        result.put("unresolved",unresolved);result.put("unlinked",List.of());
        result.put("notice","DB의 성분명과 일치하는 기록만 비교했습니다. 조회된 기록이 없어도 안전하다는 뜻은 아닙니다. 같은 성분 표시는 중복 사실이며 용량 적정성 판정이 아닙니다.");
        return result;
    }
}
