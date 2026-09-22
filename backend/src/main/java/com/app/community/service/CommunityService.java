package com.app.community.service;

import java.util.*;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import com.app.community.dao.CommunityDao;
import com.app.community.dto.*;

@Service
public class CommunityService {
    private static final Set<String> CATEGORIES = Set.of("EXPERIENCE","QUESTION","SIDE_EFFECT","INFO_REPORT");
    private static final Set<String> REPORT_REASONS = Set.of("MISINFORMATION","DANGEROUS_ADVICE","DRUG_SALE","ADVERTISEMENT","ABUSE","PRIVACY","OTHER");
    private final CommunityDao dao;
    @Autowired public CommunityService(CommunityDao dao) { this.dao=dao; }

    public Map<String,Object> posts(String q,String category,String medicationId,String sort,int page,Long viewerId) {
        if(page<1) throw new IllegalArgumentException("페이지 번호를 확인해주세요.");
        String cat=clean(category,20); if(!cat.isEmpty()&&!CATEGORIES.contains(cat)) throw new IllegalArgumentException("게시글 유형을 확인해주세요.");
        String order=Set.of("LATEST","HELPFUL","COMMENTS").contains(sort)?sort:"LATEST";
        Map<String,Object> p=new HashMap<>();p.put("keyword",clean(q,100));p.put("category",cat);p.put("medicationId",clean(medicationId,30));p.put("sort",order);p.put("offset",(page-1)*12);p.put("limit",12);p.put("viewerId",viewerId==null?-1L:viewerId);
        int total=dao.countPosts(p);return Map.of("items",dao.posts(p),"total",total,"page",page,"hasMore",page*12<total);
    }
    public Map<String,Object> post(long id,Long viewerId) {
        Map<String,Object> post=dao.post(id,viewerId);if(post==null) throw new NoSuchElementException("게시글을 찾을 수 없습니다.");
        Map<String,Object> result=new LinkedHashMap<>(post);result.put("comments",dao.comments(id));return result;
    }
    @Transactional public Map<String,Object> create(long userId,CommunityPostRequest r) {
        Map<String,Object> p=values(r);p.put("userId",userId);long id=dao.insertPost(p);return post(id,userId);
    }
    @Transactional public Map<String,Object> update(long id,long userId,CommunityPostRequest r) {
        Map<String,Object> p=values(r);p.put("postId",id);p.put("userId",userId);
        if(dao.updatePost(p)==0) throw new SecurityException("수정할 수 없는 게시글입니다.");return post(id,userId);
    }
    @Transactional public void delete(long id,long userId) { if(dao.deletePost(id,userId)==0) throw new SecurityException("삭제할 수 없는 게시글입니다."); }
    @Transactional public Map<String,Object> comment(long postId,long userId,CommunityCommentRequest r) {
        String content=required(r==null?null:r.getContent(),1000,"댓글을 입력해주세요.");
        Map<String,Object> p=new HashMap<>();p.put("postId",postId);p.put("userId",userId);p.put("content",content);long id=dao.insertComment(p);return Map.of("commentId",id);
    }
    @Transactional public void deleteComment(long id,long userId) { if(dao.deleteComment(id,userId)==0) throw new SecurityException("삭제할 수 없는 댓글입니다."); }
    @Transactional public Map<String,Object> helpful(long postId,long userId) {
        boolean active=dao.helpfulCount(postId,userId)==0;if(active)dao.addHelpful(postId,userId);else dao.removeHelpful(postId,userId);
        return Map.of("active",active,"count",dao.helpfulTotal(postId));
    }
    @Transactional public void report(long userId,CommunityReportRequest r) {
        if(r==null||r.getTargetId()==null||!Set.of("POST","COMMENT").contains(r.getTargetType())||!REPORT_REASONS.contains(r.getReason())) throw new IllegalArgumentException("신고 항목을 확인해주세요.");
        String detail=required(r.getDetail(),500,"신고 사유를 입력해주세요.");
        Map<String,Object> p=new HashMap<>();p.put("userId",userId);p.put("targetType",r.getTargetType());p.put("targetId",r.getTargetId());p.put("reason",r.getReason());p.put("detail",detail);dao.insertReport(p);
    }
    public List<Map<String,Object>> reports(){return dao.reports();}
    public List<Map<String,Object>> pendingInfoReports(){return dao.pendingInfoReports();}
    @Transactional public void moderatePost(long id,String status,long adminId){if(!Set.of("VISIBLE","HIDDEN","DELETED").contains(status)||dao.moderatePost(Map.of("postId",id,"status",status,"adminId",adminId))==0)throw new IllegalArgumentException("처리할 게시글을 확인해주세요.");}
    @Transactional public void reviewInfoPost(long id,String status,long adminId){if(!Set.of("APPROVED","REJECTED").contains(status)||dao.reviewInfoPost(Map.of("postId",id,"status",status,"adminId",adminId))==0)throw new IllegalArgumentException("검토할 정보 제보를 확인해주세요.");}
    @Transactional public void resolveReport(long id,CommunityModerationRequest r,long adminId){if(r==null||!Set.of("RESOLVED","DISMISSED").contains(r.getStatus())||dao.resolveReport(Map.of("reportId",id,"status",r.getStatus(),"note",clean(r.getResolutionNote(),500),"adminId",adminId))==0)throw new IllegalArgumentException("신고 처리 내용을 확인해주세요.");}
    public List<Map<String,Object>> medications(String q){String keyword=clean(q,80);return keyword.length()<1?List.of():dao.medications(keyword);}

    private Map<String,Object> values(CommunityPostRequest r){if(r==null)throw new IllegalArgumentException("게시글 내용을 입력해주세요.");String category=clean(r.getCategory(),20);if(!CATEGORIES.contains(category))throw new IllegalArgumentException("게시글 유형을 선택해주세요.");Map<String,Object> p=new HashMap<>();p.put("medicationId",nullable(clean(r.getMedicationId(),30)));p.put("medicationName",nullable(clean(r.getMedicationName(),150)));p.put("category",category);p.put("title",required(r.getTitle(),150,"제목을 입력해주세요."));p.put("content",required(r.getContent(),4000,"내용을 입력해주세요."));p.put("experienceDuration",nullable(clean(r.getExperienceDuration(),50)));p.put("ageGroup",nullable(clean(r.getAgeGroup(),30)));p.put("purpose",nullable(clean(r.getPurpose(),100)));p.put("occurrenceTiming",nullable(clean(r.getOccurrenceTiming(),80)));p.put("currentlyTaking",Boolean.TRUE.equals(r.getCurrentlyTaking())?1:0);return p;}
    private static String required(String v,int max,String message){String s=clean(v,max);if(s.isEmpty())throw new IllegalArgumentException(message);return s;}
    private static String clean(String v,int max){String s=v==null?"":v.trim();if(s.length()>max)throw new IllegalArgumentException("입력 가능한 글자 수를 초과했습니다.");return s;}
    private static String nullable(String s){return s.isEmpty()?null:s;}
}
