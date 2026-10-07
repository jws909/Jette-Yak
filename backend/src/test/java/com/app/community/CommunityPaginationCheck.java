/**
 * 역할: DB 연결 없이 커뮤니티의 페이지 경계와 약명·성분 검색 범위 점검
 */
package com.app.community;

import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.nio.file.Files;
import java.nio.file.Path;
import org.apache.ibatis.builder.xml.XMLMapperBuilder;
import org.apache.ibatis.session.Configuration;
import com.app.community.dao.CommunityDao;
import com.app.community.service.CommunityService;

public class CommunityPaginationCheck {
    private static int checks;

    private static void check(boolean passed,String description) {
        if(!passed)throw new AssertionError(description);
        checks++;
    }

    public static void main(String[] args) throws Exception {
        FixtureDao dao=new FixtureDao();
        CommunityService service=new CommunityService(dao,null);

        dao.total=5;
        var first=service.posts("  aspirin  ","QUESTION","123","LATEST",1,42L);
        check(number(first,"pageSize")==5,"each page contains at most five posts");
        check(number(first,"totalPages")==1&&!Boolean.TRUE.equals(first.get("hasMore")),"five posts end on page one");
        check(items(first).size()==5,"first page returns all five boundary posts");
        check(number(dao.params,"offset")==0&&number(dao.params,"limit")==5,"first page query starts at zero and fetches five");
        check("aspirin".equals(dao.params.get("keyword"))&&"QUESTION".equals(dao.params.get("category"))&&"123".equals(dao.params.get("medicationId")),"filters remain attached to the page query");
        check(number(dao.params,"viewerId")==42,"authenticated viewer remains attached to the page query");

        dao.total=6;
        first=service.posts("","","","LATEST",1,null);
        check(number(first,"totalPages")==2&&Boolean.TRUE.equals(first.get("hasMore")),"sixth post creates a second page");
        check(items(first).size()==5,"six-post first page still returns only five");
        check(number(dao.params,"viewerId")==-1,"anonymous viewer uses the existing sentinel");
        var second=service.posts("","","","LATEST",2,null);
        check(number(second,"page")==2&&number(dao.params,"offset")==5,"second page starts after the first five posts");
        check(items(second).size()==1&&number(items(second).get(0),"postId")==6,"second page contains only the sixth post");
        check(!Boolean.TRUE.equals(second.get("hasMore")),"last page disables forward navigation");

        dao.total=5;
        var afterDeletion=service.posts("","","","LATEST",2,null);
        check(number(afterDeletion,"page")==1&&number(dao.params,"offset")==0,"deleting the only page-two post returns the remaining page");
        check(items(afterDeletion).size()==5,"clamped page returns its posts rather than an empty removed page");

        dao.total=0;
        var empty=service.posts("","","","LATEST",99,null);
        check(number(empty,"page")==1&&number(empty,"totalPages")==1&&items(empty).isEmpty(),"empty results retain one navigable empty page");
        check(!Boolean.TRUE.equals(empty.get("hasMore"))&&number(dao.params,"offset")==0,"empty results do not offer another page");

        dao.total=Integer.MAX_VALUE;
        var last=service.posts("","","","LATEST",Integer.MAX_VALUE,null);
        check(number(last,"totalPages")==429496730&&number(dao.params,"offset")==2147483645,"page calculation avoids integer overflow on large counts");
        check(items(last).size()==2&&!Boolean.TRUE.equals(last.get("hasMore")),"large-count final page uses its exact remaining rows");

        int calls=dao.countCalls;
        try {
            service.posts("","","","LATEST",0,null);
            throw new AssertionError("invalid page did not fail");
        } catch(IllegalArgumentException expected) { checks++; }
        check(dao.countCalls==calls,"invalid page fails before DAO access");
        dao.total=5;
        service.posts("  텐%_'  ","","","LATEST",1,null);
        check("텐%_'".equals(dao.params.get("keyword")),"search trims outer spaces and preserves literal punctuation");
        service.posts("x".repeat(100),"","","LATEST",1,null);
        check(String.valueOf(dao.params.get("keyword")).length()==100,"search accepts the existing 100-character limit");
        calls=dao.countCalls;
        try {
            service.posts("x".repeat(101),"","","LATEST",1,null);
            throw new AssertionError("overlong search accepted");
        } catch(IllegalArgumentException expected) { checks++; }
        check(dao.countCalls==calls,"overlong search fails before DAO access");
        checkMappedOrdering(args.length==0?Path.of("backend"):Path.of(args[0]),args.length>1?Path.of(args[1]):null);
        System.out.println("PASS: "+checks+" community pagination and search checks (mock DAO, offline mapper, no DB access)");
    }

    private static void checkMappedOrdering(Path backend,Path mapperOverride) throws Exception {
        Configuration config=new Configuration();
        Path mapper=mapperOverride==null?backend.resolve("src/main/webapp/WEB-INF/mybatis/mapper/community/community_mapper.xml"):mapperOverride;
        try(var in=Files.newInputStream(mapper)) {
            new XMLMapperBuilder(in,config,mapper.toString(),config.getSqlFragments()).parse();
        }
        for(String sort:List.of("LATEST","HELPFUL","COMMENTS")) {
            var bound=config.getMappedStatement("com.app.community.CommunityMapper.posts")
                .getBoundSql(Map.of("sort",sort,"offset",5,"limit",5,"viewerId",-1L));
            String primary="HELPFUL".equals(sort)?"\"helpfulCount\" DESC, ":"COMMENTS".equals(sort)?"\"commentCount\" DESC, ":"";
            String sql=bound.getSql().replaceAll("\\s+"," ").trim();
            var bindings=bound.getParameterMappings().stream().map(mapping->mapping.getProperty()).toList();
            check(sql.endsWith("ORDER BY "+primary+"p.created_at DESC, p.post_id DESC OFFSET ? ROWS FETCH NEXT ? ROWS ONLY")
                &&bindings.equals(List.of("viewerId","offset","limit")),
                sort+" uses a unique final post order and bound offset/limit pagination");
        }
        checkMappedSearch(config);
    }

    private static void checkMappedSearch(Configuration config) {
        String namespace="com.app.community.CommunityMapper.";
        String keyword="텐%_' OR 1=1--";
        var params=Map.of("keyword",keyword,"category","QUESTION","medicationId","M1","sort","LATEST","offset",0,"limit",5,"viewerId",-1L);
        var count=config.getMappedStatement(namespace+"countPosts").getBoundSql(params);
        var posts=config.getMappedStatement(namespace+"posts").getBoundSql(params);
        String countSql=compact(count.getSql()),postsSql=compact(posts.getSql());
        String scope="WHEREp.status='VISIBLE'ANDp.category=?ANDp.medication_id=?AND(";
        check(countSql.contains(scope)&&postsSql.contains(scope),"search alternatives stay inside visible, category and medication filters");
        check(countSql.contains("INSTR(LOWER(p.title),LOWER(?))>0")
            &&countSql.contains("INSTR(LOWER(p.medication_name),LOWER(?))>0")
            &&countSql.contains("DBMS_LOB.INSTR(LOWER(p.content),LOWER(?))>0"),"existing title, saved medication name and full-content search preserved");
        check(countSql.contains("EXISTS(SELECT1FROMmedicationssearch_medWHEREsearch_med.medication_id=p.medication_idAND("),"official search matches the linked medication without multiplying post rows");
        check(countSql.contains("INSTR(LOWER(search_med.item_name),LOWER(?))>0")
            &&countSql.contains("INSTR(LOWER(search_med.material_name),LOWER(?))>0"),"official name and ingredient both support case-insensitive partial search");
        check(count.getParameterMappings().stream().filter(mapping->"keyword".equals(mapping.getProperty())).count()==5
            &&!countSql.contains(keyword)&&!countSql.contains("LIKE"),"all search terms are bound and percent, underscore and quote remain literal");
        String postWhere=postsSql.substring(postsSql.indexOf("WHEREp.status='VISIBLE'"),postsSql.lastIndexOf("ORDERBY"));
        check(countSql.endsWith(postWhere),"count and list share exactly the same search predicate");
        String blank=compact(config.getMappedStatement(namespace+"countPosts").getBoundSql(Map.of("keyword","","category","","medicationId","")).getSql());
        check(blank.equals("SELECTCOUNT(*)FROMcommunity_postspWHEREp.status='VISIBLE'"),"empty keyword keeps the public list without extra medication lookups");
        var detail=config.getMappedStatement(namespace+"post").getBoundSql(Map.of("postId",1L,"viewerId",-1L,"isAdmin",0));
        String detailSql=compact(detail.getSql());
        String fallback="NVL(p.medication_name,(SELECTlinked.item_nameFROMmedicationslinkedWHERElinked.medication_id=p.medication_id))AS\"medicationName\"";
        check(postsSql.contains(fallback)&&detailSql.contains(fallback),"list and detail fill only missing saved medication names from the official product");
        check(detailSql.contains("WHEREp.post_id=?ANDp.status<>'DELETED'AND(p.status='VISIBLE'OR?=1)"),"detail retains deleted exclusion and hidden-content administrator guard");
    }

    private static String compact(String sql) { return sql.replaceAll("\\s+",""); }

    private static long number(Map<String,Object> values,String key) { return ((Number)values.get(key)).longValue(); }
    @SuppressWarnings("unchecked")
    private static List<Map<String,Object>> items(Map<String,Object> result) { return (List<Map<String,Object>>)result.get("items"); }

    private static final class FixtureDao extends CommunityDao {
        private int total;
        private int countCalls;
        private Map<String,Object> params;
        private FixtureDao() { super(null); }
        @Override public int countPosts(Map<String,Object> values) { countCalls++;return total; }
        @Override public List<Map<String,Object>> posts(Map<String,Object> values) {
            params=new HashMap<>(values);
            long offset=number(values,"offset");
            int length=(int)Math.min(number(values,"limit"),Math.max(0L,(long)total-offset));
            var posts=new ArrayList<Map<String,Object>>();
            for(int i=0;i<length;i++)posts.add(Map.of("postId",offset+i+1));
            return posts;
        }
    }
}
