/**
 * 역할: DB 연결 없이 커뮤니티의 5개 단위 페이지 경계와 목록 조회 범위를 점검
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
        checkMappedOrdering(args.length==0?Path.of("backend"):Path.of(args[0]));
        System.out.println("PASS: "+checks+" community pagination checks (mock DAO, offline mapper, no DB writes)");
    }

    private static void checkMappedOrdering(Path backend) throws Exception {
        Configuration config=new Configuration();
        Path mapper=backend.resolve("src/main/webapp/WEB-INF/mybatis/mapper/community/community_mapper.xml");
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
    }

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
