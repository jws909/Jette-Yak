package com.app.chatbot.service;
import java.util.*;
import org.springframework.stereotype.Service;
import com.app.chatbot.dao.CatalogDao;
@Service
public class CatalogService {
    private final CatalogDao dao;
    private final com.app.guide.service.DurGuideService dur;
    public CatalogService(CatalogDao dao, com.app.guide.service.DurGuideService dur) { this.dao=dao; this.dur=dur; }
    public Map<String,Object> search(CatalogQuery query,int page) {
        query.parameters(page);
        int total=dao.count(query);
        var result=new LinkedHashMap<String,Object>();
        var rows=dao.search(query,page);
        if(query.kind().equals("MEDICATIONS") && query.tabooType()!=0) for(var row:rows) {
            var evidence=dur.find((String)row.get("itemSeq"),(String)row.get("materialName")).items().stream().filter(r -> r.getTabooType()==query.tabooType()
                && (query.grade().isEmpty() || query.grade().equals(r.getGrade()))
                && (query.ageBase().isEmpty() || r.getAgeBase()!=null && r.getAgeBase().contains(query.ageBase()))).toList();
            row.put("durEvidence",evidence.stream().limit(10).toList()); row.put("durEvidenceTotal",evidence.size());
        }
        result.put("kind",query.kind()); result.put("query",query); result.put("items",rows);
        result.put("page",page); result.put("total",total); result.put("hasMore",(long)page*20<total);
        result.put("notice", "MEDICATIONS".equals(query.kind())
            ? "DB에 등록된 검색 결과이며 복용을 추천하는 목록이 아닙니다. 성분 검색은 제품 원문과 검증된 성분 별칭을 사용합니다. DUR 조건은 표준 성분으로 연결하며, 아직 검증되지 않은 별칭은 누락될 수 있습니다. 허가 상태 표시는 저장된 동기화 값입니다."
            : "DB에 등록된 DUR 원문입니다. 등급·연령·조건을 함께 확인해주세요. 검색 결과가 없다는 것은 금기가 없거나 안전하다는 뜻이 아닙니다.");
        return result;
    }
}
