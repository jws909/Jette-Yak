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

    public List<Map<String,Object>> posts(Map<String,Object> p) { return session.selectList(NS+"posts", p); }
    public int countPosts(Map<String,Object> p) { return session.selectOne(NS+"countPosts", p); }
    public Map<String,Object> post(long id, Long viewerId) { return session.selectOne(NS+"post", Map.of("postId",id,"viewerId",viewerId == null ? -1L : viewerId)); }
    public long insertPost(Map<String,Object> p) { session.insert(NS+"insertPost",p); return ((Number)p.get("postId")).longValue(); }
    public int updatePost(Map<String,Object> p) { return session.update(NS+"updatePost",p); }
    public int deletePost(long id,long userId) { return session.update(NS+"deletePost",Map.of("postId",id,"userId",userId)); }
    public List<Map<String,Object>> comments(long postId) { return session.selectList(NS+"comments",postId); }
    public long insertComment(Map<String,Object> p) { session.insert(NS+"insertComment",p); return ((Number)p.get("commentId")).longValue(); }
    public int deleteComment(long id,long userId) { return session.update(NS+"deleteComment",Map.of("commentId",id,"userId",userId)); }
    public int helpfulCount(long postId,long userId) { return session.selectOne(NS+"helpfulCount",Map.of("postId",postId,"userId",userId)); }
    public void addHelpful(long postId,long userId) { session.insert(NS+"addHelpful",Map.of("postId",postId,"userId",userId)); }
    public void removeHelpful(long postId,long userId) { session.delete(NS+"removeHelpful",Map.of("postId",postId,"userId",userId)); }
    public int helpfulTotal(long postId) { return session.selectOne(NS+"helpfulTotal",postId); }
    public void insertReport(Map<String,Object> p) { session.insert(NS+"insertReport",p); }
    public List<Map<String,Object>> reports() { return session.selectList(NS+"reports"); }
    public List<Map<String,Object>> pendingInfoReports() { return session.selectList(NS+"pendingInfoReports"); }
    public int moderatePost(Map<String,Object> p) { return session.update(NS+"moderatePost",p); }
    public int reviewInfoPost(Map<String,Object> p) { return session.update(NS+"reviewInfoPost",p); }
    public int resolveReport(Map<String,Object> p) { return session.update(NS+"resolveReport",p); }
    public List<Map<String,Object>> medications(String q) { return session.selectList(NS+"medications",q); }
    public int ownsPost(long postId,long userId) { return session.selectOne(NS+"ownsPost",Map.of("postId",postId,"userId",userId)); }
    public int attachmentCount(long postId,String type) { return session.selectOne(NS+"attachmentCount",Map.of("postId",postId,"type",type)); }
    public long insertAttachment(Map<String,Object> p) { session.insert(NS+"insertAttachment",p); return ((Number)p.get("attachmentId")).longValue(); }
    public List<Map<String,Object>> attachments(long postId) { return session.selectList(NS+"attachments",postId); }
    public Map<String,Object> attachment(long id) { return session.selectOne(NS+"attachment",id); }
    public int deleteAttachment(long id,long userId,boolean admin) { return session.delete(NS+"deleteAttachment",Map.of("attachmentId",id,"userId",userId,"admin",admin?1:0)); }
}
