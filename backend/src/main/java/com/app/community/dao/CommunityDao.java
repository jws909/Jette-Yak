/**
 * 역할: 커뮤니티 서비스와 MyBatis SQL 사이의 호출 창구
 * 주의: 사용자 소유권과 관리자 권한 검사는 서비스에서 끝낸 뒤 변경 SQL 호출
 */
package com.app.community.dao;

import java.util.List;
import java.util.Map;
import org.apache.ibatis.session.SqlSession;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Repository;

@Repository
public class CommunityDao {
    private static final String NS = "com.app.community.CommunityMapper.";
    private final SqlSession session;
    @Autowired public CommunityDao(SqlSession session) { this.session = session; }

    // 게시글 목록·상세·작성·수정·삭제
    public List<Map<String,Object>> posts(Map<String,Object> p) { return session.selectList(NS+"posts", p); }
    public List<Map<String,Object>> myPosts(long userId) { return session.selectList(NS+"myPosts", userId); }
    public int countPosts(Map<String,Object> p) { return session.selectOne(NS+"countPosts", p); }
    public Map<String,Object> post(long id, Long viewerId, boolean admin) { return session.selectOne(NS+"post", Map.of("postId",id,"viewerId",viewerId == null ? -1L : viewerId,"isAdmin",admin?1:0)); }
    public long insertPost(Map<String,Object> p) { session.insert(NS+"insertPost",p); return ((Number)p.get("postId")).longValue(); }
    public int updatePost(Map<String,Object> p) { return session.update(NS+"updatePost",p); }
    public int deletePost(long id,long userId) { return session.update(NS+"deletePost",Map.of("postId",id,"userId",userId)); }
    // 댓글과 도움 표시
    public List<Map<String,Object>> comments(long postId,Long viewerId) { return session.selectList(NS+"comments",Map.of("postId",postId,"viewerId",viewerId==null?-1L:viewerId)); }
    public long insertComment(Map<String,Object> p) { session.insert(NS+"insertComment",p); return ((Number)p.get("commentId")).longValue(); }
    public int deleteComment(long id,long userId) { return session.update(NS+"deleteComment",Map.of("commentId",id,"userId",userId)); }
    public int helpfulCount(long postId,long userId) { return session.selectOne(NS+"helpfulCount",Map.of("postId",postId,"userId",userId)); }
    public void addHelpful(long postId,long userId) { session.insert(NS+"addHelpful",Map.of("postId",postId,"userId",userId)); }
    public void removeHelpful(long postId,long userId) { session.delete(NS+"removeHelpful",Map.of("postId",postId,"userId",userId)); }
    public int helpfulTotal(long postId) { return session.selectOne(NS+"helpfulTotal",postId); }
    public int commentHelpfulCount(long commentId,long userId) { return session.selectOne(NS+"commentHelpfulCount",Map.of("commentId",commentId,"userId",userId)); }
    public void addCommentHelpful(long commentId,long userId) { session.insert(NS+"addCommentHelpful",Map.of("commentId",commentId,"userId",userId)); }
    public void removeCommentHelpful(long commentId,long userId) { session.delete(NS+"removeCommentHelpful",Map.of("commentId",commentId,"userId",userId)); }
    public int commentHelpfulTotal(long commentId) { return session.selectOne(NS+"commentHelpfulTotal",commentId); }
    public Map<String,Object> postOwner(long postId) { return session.selectOne(NS+"postOwner",postId); }
    public Map<String,Object> commentOwner(long commentId) { return session.selectOne(NS+"commentOwner",commentId); }
    public Map<String,Object> report(long reportId) { return session.selectOne(NS+"report",reportId); }
    public Map<String,Object> infoPost(long postId) { return session.selectOne(NS+"infoPost",postId); }
    // 사용자 신고와 관리자 처리
    public void insertReport(Map<String,Object> p) { session.insert(NS+"insertReport",p); }
    public List<Map<String,Object>> reports() { return session.selectList(NS+"reports"); }
    public List<Map<String,Object>> pendingInfoReports() { return session.selectList(NS+"pendingInfoReports"); }
    public List<Map<String,Object>> moderatedContent() { return session.selectList(NS+"moderatedContent"); }
    public int moderatePost(Map<String,Object> p) { return session.update(NS+"moderatePost",p); }
    public int moderateComment(Map<String,Object> p) { return session.update(NS+"moderateComment",p); }
    public int reviewInfoPost(Map<String,Object> p) { return session.update(NS+"reviewInfoPost",p); }
    public int resolveReport(Map<String,Object> p) { return session.update(NS+"resolveReport",p); }
    // 게시글과 공식 의약품 연결에 쓰는 검색
    public List<Map<String,Object>> medications(String q) { return session.selectList(NS+"medications",q); }
    // 첨부파일 소유권 확인·메타데이터 저장·조회·삭제
    public int ownsPost(long postId,long userId) { return session.selectOne(NS+"ownsPost",Map.of("postId",postId,"userId",userId)); }
    public int attachmentCount(long postId,String type) { return session.selectOne(NS+"attachmentCount",Map.of("postId",postId,"type",type)); }
    public long insertAttachment(Map<String,Object> p) { session.insert(NS+"insertAttachment",p); return ((Number)p.get("attachmentId")).longValue(); }
    public List<Map<String,Object>> attachments(long postId) { return session.selectList(NS+"attachments",postId); }
    public Map<String,Object> attachment(long id) { return session.selectOne(NS+"attachment",id); }
    public int deleteAttachment(long id,long userId,boolean admin) { return session.delete(NS+"deleteAttachment",Map.of("attachmentId",id,"userId",userId,"admin",admin?1:0)); }
}
