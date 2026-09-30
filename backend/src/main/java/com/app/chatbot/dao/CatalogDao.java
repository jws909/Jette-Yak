/**
 * 파일 역할: 성분·효능·분류·DUR 등 조건 검색에 필요한 DB 조회 계약입니다.
 * 핵심 규칙: CatalogService가 만든 안전한 필터만 받아 MyBatis 매퍼로 전달합니다.
 */
package com.app.chatbot.dao;
import java.util.*;
import org.springframework.stereotype.Repository;
import org.apache.ibatis.session.SqlSession;
import com.app.chatbot.service.CatalogQuery;
@Repository
public class CatalogDao {
    private final SqlSession session;
    public CatalogDao(SqlSession session) { this.session = session; }
    public List<Map<String,Object>> search(CatalogQuery query, int page) {
        return session.selectList("com.app.chatbot.dao.CatalogDao." + (query.kind().equals("DUR") ? "dur" : "medications"), query.parameters(page));
    }
    public int count(CatalogQuery query) {
        return session.selectOne("com.app.chatbot.dao.CatalogDao." + (query.kind().equals("DUR") ? "countDur" : "countMedications"), query.parameters(1));
    }
}
