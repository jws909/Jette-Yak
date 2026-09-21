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
