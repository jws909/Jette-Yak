/**
 * 파일 역할: 사용자 등록 약 통합, 복용 상태 변경, 활성 약 간 DUR 비교를 담당합니다.
 * 핵심 규칙: 처방약과 직접 추가 약의 서로 다른 키를 하나의 화면 모델로 합치되 소유권 검사를 유지합니다.
 */
package com.app.guide.service;
import java.util.*;
import java.util.stream.Collectors;
import org.springframework.stereotype.Service;
import com.app.guide.dao.MedicationGuideDao;
import com.app.guide.dto.*;

@Service
public class MedicationManagementService {
    private final MedicationGuideDao dao;
    private final DurGuideService dur;
    private final com.app.chatbot.client.GeminiService gemini;
    private final com.app.prescription.dao.PrescriptionDAO prescriptionDAO;

    public MedicationManagementService(MedicationGuideDao dao, DurGuideService dur) {
        this(dao, dur, null, null);
    }

    public MedicationManagementService(MedicationGuideDao dao, DurGuideService dur, com.app.chatbot.client.GeminiService gemini) {
        this(dao, dur, gemini, null);
    }

    @org.springframework.beans.factory.annotation.Autowired
    public MedicationManagementService(
            MedicationGuideDao dao,
            DurGuideService dur,
            com.app.chatbot.client.GeminiService gemini,
            @org.springframework.context.annotation.Lazy com.app.prescription.dao.PrescriptionDAO prescriptionDAO) {
        this.dao = dao;
        this.dur = dur;
        this.gemini = gemini;
        this.prescriptionDAO = prescriptionDAO;
    }

    public List<RegisteredMedicationDto> collection(long userId) { return dao.collection(userId); }

    public void update(long userId,String registrationId,String status) {
        // registrationId의 P/C/R 접두사는 서로 다른 등록 출처를 구분한다.
        // userId를 SQL 조건에 함께 넘겨 다른 사용자의 등록 행이 변경되지 않게 한다.
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
        // 종료·보관·중지 상태는 현재 복약 분석에서 제외하고 ACTIVE 등록만 AI 입력으로 사용한다.
        var all = collection(userId);
        var active = all.stream().filter(r -> "ACTIVE".equals(r.getUseStatus())).toList();
        if (active.isEmpty()) {
            return Map.of(
                "hasActiveMeds", false,
                "activeCount", 0,
                "message", "현재 복용 중인 처방약, 상비약 또는 영양제가 없습니다."
            );
        }

        // 활성 약의 ID·이름·복용시간을 정렬한 서명을 캐시 키로 사용한다.
        // 약 목록이 그대로라면 저장된 AI 결과를 반환해 호출 시간과 비용을 줄인다.
        String currentSignature = calculateActiveSignature(active);
        var cached = dao.findOverallGuide(userId);
        if (!forceRefresh && cached != null && cached.getAiGuide() != null && !cached.getAiGuide().isBlank()) {
            String cachedSignature = extractSignature(cached.getAiGuide());
            // 복용 중인 약 목록에 변화가 없으면 기존 분석 결과 반환 (불필요한 AI 재호출 방지)
            if (!cachedSignature.isBlank() && currentSignature.equals(cachedSignature)) {
                return Map.of(
                    "hasActiveMeds", true,
                    "activeCount", active.size(),
                    "aiGuide", cached.getAiGuide(),
                    "medUpdatedAt", cached.getMedUpdatedAt() != null ? cached.getMedUpdatedAt() : "",
                    "cached", true
                );
            }
        }

        // 처방전 요약은 현재 날짜가 복용 기간 안이고 ACTIVE 처방약과 연결된 경우에만 포함한다.
        List<com.app.prescription.dto.PrescriptionDTO> activeRxList = new ArrayList<>();
        if (prescriptionDAO != null) {
            try {
                var rxList = prescriptionDAO.getPrescriptionListByUserId(userId);
                if (rxList != null && !rxList.isEmpty()) {
                    Date now = new Date();
                    for (var rx : rxList) {
                        populatePrescriptionAiGuide(rx);
                        if (isActivePrescription(rx, now)) {
                            // 현재 복용 중인 active 약품 목록에 포함된 처방전만 연동
                            boolean hasActiveMedInRx = active.stream().anyMatch(
                                a -> "PRESCRIPTION".equals(a.getSource()) &&
                                     rx.getItems() != null &&
                                     rx.getItems().stream().anyMatch(it -> Objects.equals(it.getMedicationId(), a.getMedicationId()))
                            );
                            if (hasActiveMedInRx) {
                                activeRxList.add(rx);
                            }
                        }
                    }
                }
            } catch (Exception ignored) {}
        }

        var comparison = myComparison(userId);
        String generatedGuide = (gemini != null)
            ? gemini.generateOverallGuide(active, activeRxList, comparison)
            : (gemini != null ? gemini.createFallbackOverallGuide(active, activeRxList, comparison) : "{}");

        String guideWithSignature = injectSignature(generatedGuide, currentSignature);
        dao.saveOverallGuide(userId, guideWithSignature);
        var updated = dao.findOverallGuide(userId);

        return Map.of(
            "hasActiveMeds", true,
            "activeCount", active.size(),
            "aiGuide", guideWithSignature,
            "medUpdatedAt", (updated != null && updated.getMedUpdatedAt() != null) ? updated.getMedUpdatedAt() : "",
            "cached", false
        );
    }

    private String calculateActiveSignature(List<RegisteredMedicationDto> activeMeds) {
        if (activeMeds == null || activeMeds.isEmpty()) {
            return "";
        }
        return activeMeds.stream()
            .map(m -> String.format("%s|%s|%s|%s",
                Objects.toString(m.getRegistrationId(), ""),
                Objects.toString(m.getMedicationId(), ""),
                Objects.toString(m.getItemName(), "").trim(),
                Objects.toString(m.getTakeTime(), "").trim()
            ))
            .sorted()
            .collect(Collectors.joining(";"));
    }

    private String extractSignature(String jsonStr) {
        if (jsonStr == null || jsonStr.isBlank()) return "";
        try {
            com.fasterxml.jackson.databind.ObjectMapper mapper = new com.fasterxml.jackson.databind.ObjectMapper();
            com.fasterxml.jackson.databind.JsonNode node = mapper.readTree(jsonStr);
            if (node.has("activeSignature") && !node.get("activeSignature").isNull()) {
                return node.get("activeSignature").asText();
            }
        } catch (Exception ignored) {}
        return "";
    }

    private String injectSignature(String jsonStr, String signature) {
        if (jsonStr == null || jsonStr.isBlank()) return jsonStr;
        try {
            com.fasterxml.jackson.databind.ObjectMapper mapper = new com.fasterxml.jackson.databind.ObjectMapper();
            com.fasterxml.jackson.databind.JsonNode node = mapper.readTree(jsonStr);
            if (node.isObject()) {
                ((com.fasterxml.jackson.databind.node.ObjectNode) node).put("activeSignature", signature);
                return mapper.writeValueAsString(node);
            }
        } catch (Exception ignored) {}
        return jsonStr;
    }

    private void populatePrescriptionAiGuide(com.app.prescription.dto.PrescriptionDTO rx) {
        if (rx == null || rx.getAiSummaryJson() == null || rx.getAiSummaryJson().isBlank()) return;
        try {
            com.fasterxml.jackson.databind.ObjectMapper mapper = new com.fasterxml.jackson.databind.ObjectMapper();
            var node = mapper.readTree(rx.getAiSummaryJson());
            if (node.has("aiGuide") && !node.get("aiGuide").isNull()) {
                rx.setAiGuide(node.get("aiGuide"));
            }
            if ((rx.getHospitalName() == null || rx.getHospitalName().isBlank()) && node.has("hospitalName")) {
                rx.setHospitalName(node.get("hospitalName").asText());
            }
            if ((rx.getDoctorName() == null || rx.getDoctorName().isBlank()) && node.has("doctorName")) {
                rx.setDoctorName(node.get("doctorName").asText());
            }
        } catch (Exception ignored) {}
    }

    private boolean isActivePrescription(com.app.prescription.dto.PrescriptionDTO rx, Date now) {
        if (rx == null || rx.getDispensedDate() == null) return false;
        int days = (rx.getTotalDays() != null && rx.getTotalDays() > 0) ? rx.getTotalDays() : 14;
        Calendar cal = Calendar.getInstance();
        cal.setTime(rx.getDispensedDate());
        cal.set(Calendar.HOUR_OF_DAY, 0);
        cal.set(Calendar.MINUTE, 0);
        cal.set(Calendar.SECOND, 0);
        cal.set(Calendar.MILLISECOND, 0);
        Date start = cal.getTime();
        cal.add(Calendar.DAY_OF_YEAR, days);
        cal.set(Calendar.HOUR_OF_DAY, 23);
        cal.set(Calendar.MINUTE, 59);
        cal.set(Calendar.SECOND, 59);
        Date end = cal.getTime();
        return !now.before(start) && !now.after(end);
    }
    public Map<String,Object> myComparison(long userId) {
        // 현재 복용 중인 제품만 DUR 비교 대상으로 삼고, 공식 제품과 연결되지 않은 등록은
        // unlinked 목록으로 별도 반환해 "주의정보 없음"으로 오해하지 않게 한다.
        var all=collection(userId);
        var active=all.stream().filter(r->"ACTIVE".equals(r.getUseStatus())).toList();
        var ids=active.stream().map(RegisteredMedicationDto::getMedicationId).filter(Objects::nonNull).distinct().toList();
        var result=compare(ids);
        result.put("unlinked",active.stream().filter(r->r.getMedicationId()==null).map(RegisteredMedicationDto::getItemName).distinct().toList());
        result.put("unconfirmedCount",all.stream().filter(r->"UNCONFIRMED".equals(r.getUseStatus())).count());
        return result;
    }
    public Map<String,Object> compare(List<String> input) {
        // 클라이언트가 보낸 제품 ID를 DB에서 다시 확인하고 중복을 제거한다.
        // 최대 50개 제한은 조합 비교량과 응답 크기가 급격히 증가하는 것을 막기 위한 상한이다.
        if(input==null || input.size()>50 || input.stream().anyMatch(id->id==null||id.isBlank()||id.length()>20))
            throw new IllegalArgumentException("비교할 제품은 최대 50개까지 선택해주세요.");
        var medicines=new ArrayList<MedicationGuideDto>();
        for(String id:new LinkedHashSet<>(input)) {
            var med=dao.find(id);if(med==null)throw new IllegalArgumentException("등록되지 않은 제품입니다. 다시 선택해주세요.");medicines.add(med);
        }
        var keys=new ArrayList<Set<String>>();
        var canonicalNames=new LinkedHashMap<String,Long>();
        var ingredientLabels=new LinkedHashMap<String,String>();
        var records=new LinkedHashMap<String,DurInfoDto>();
        var unresolved=new ArrayList<Map<String,Object>>();
        var singleDurAlerts = new ArrayList<Map<String, Object>>();
        for(var med:medicines) {
            var result=dur.find(med.getMedicationId(), med.getMaterialName());
            canonicalNames.putAll(result.canonicalIngredientIds());
            var medicineKeys=new LinkedHashSet<String>();
            for(String name:result.queriedIngredients()){
                String key=ingredientKey(name,result.canonicalIngredientIds());
                medicineKeys.add(key);ingredientLabels.putIfAbsent(key,name);
            }
            keys.add(medicineKeys);
            if(!result.unmatchedIngredients().isEmpty()||result.queriedIngredients().isEmpty())
                unresolved.add(Map.of("medicationId",med.getMedicationId(),"itemName",med.getItemName(),"ingredients",result.unmatchedIngredients(),"status",result.status()));
            for(var row:result.items()) {
                if(row.getTabooType()==4) {
                    records.put(row.getIngrAName()+"|"+row.getIngrBName()+"|"+row.getTabooEffect(),row);
                } else if(row.getTabooType() >= 1 && row.getTabooType() <= 3) {
                    Map<String, Object> alert = new LinkedHashMap<>();
                    alert.put("medicationId", med.getMedicationId());
                    alert.put("itemName", med.getItemName());
                    alert.put("ingrName", row.getIngrAName());
                    alert.put("tabooType", row.getTabooType());
                    alert.put("typeName", row.getTabooType() == 1 ? "임부금기" : (row.getTabooType() == 2 ? "노인주의" : "특정연령대금기"));
                    alert.put("grade", row.getGrade() != null ? row.getGrade() : "");
                    alert.put("ageBase", row.getAgeBase() != null ? row.getAgeBase() : "");
                    alert.put("tabooEffect", row.getTabooEffect() != null ? row.getTabooEffect() : "");
                    singleDurAlerts.add(alert);
                }
            }
        }
        var pairs=new ArrayList<Map<String,Object>>();var duplicateIngredients=new ArrayList<Map<String,Object>>();
        for(int i=0;i<medicines.size();i++)for(int j=i+1;j<medicines.size();j++) {
            final var left=keys.get(i);final var right=keys.get(j);
            var common=new LinkedHashSet<>(left);common.retainAll(right);
            var a=medicines.get(i);var b=medicines.get(j);
            if(!common.isEmpty())duplicateIngredients.add(Map.of("left",a.getItemName(),"right",b.getItemName(),"ingredients",
                    common.stream().map(key->ingredientLabels.getOrDefault(key,key)).toList()));
            var matched=records.values().stream().filter(r->{
                var x=ingredientKey(r.getIngrAName(),canonicalNames);
                var y=ingredientKey(r.getIngrBName(),canonicalNames);
                return left.contains(x)&&right.contains(y)||left.contains(y)&&right.contains(x);
            }).toList();
            if(!matched.isEmpty())pairs.add(Map.of("left",a,"right",b,"items",matched));
        }
        var result=new LinkedHashMap<String,Object>();
        result.put("medications",medicines);result.put("pairs",pairs);result.put("duplicates",duplicateIngredients);
        result.put("singleDurAlerts",singleDurAlerts);
        result.put("unresolved",unresolved);result.put("unlinked",List.of());
        result.put("notice","DB의 성분명과 일치하는 기록만 비교했습니다. 조회된 기록이 없어도 안전하다는 뜻은 아닙니다. 같은 성분 표시는 중복 사실이며 용량 적정성 판정이 아닙니다.");
        return result;
    }

    private static String ingredientKey(String name, Map<String,Long> canonicalIds) {
        String normalized=DurGuideService.normalize(name);
        Long id=canonicalIds.get(normalized);
        return id==null ? "name:"+normalized : "id:"+id;
    }
}
