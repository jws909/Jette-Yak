package com.app.community.service;

import java.io.IOException;
import java.nio.file.*;
import java.util.*;
import javax.imageio.ImageIO;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.multipart.MultipartFile;
import com.app.community.dao.CommunityDao;
import com.app.community.dto.*;

@Service
public class CommunityService {
    private static final Set<String> CATEGORIES = Set.of("EXPERIENCE","QUESTION","SIDE_EFFECT","INFO_REPORT");
    private static final Set<String> REPORT_REASONS = Set.of("MISINFORMATION","DANGEROUS_ADVICE","DRUG_SALE","ADVERTISEMENT","ABUSE","PRIVACY","OTHER");
    private static final Set<String> IMAGE_TYPES = Set.of("image/jpeg","image/png","image/gif","image/webp");
    private static final Set<String> BLOCKED_FILE_EXTENSIONS = Set.of("exe","com","bat","cmd","msi","scr","js","jar","ps1","vbs","sh","dll");
    private static final int MAX_ATTACHMENTS_PER_TYPE = 5;
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
        Map<String,Object> result=new LinkedHashMap<>(post);result.put("comments",dao.comments(id));result.put("attachments",dao.attachments(id));return result;
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

    @Transactional
    public List<Map<String,Object>> addAttachments(long postId,long userId,String type,List<MultipartFile> files) {
        String normalized=clean(type,10).toUpperCase(Locale.ROOT);
        if(!Set.of("IMAGE","FILE").contains(normalized)) throw new IllegalArgumentException("첨부파일 종류를 확인해주세요.");
        if(dao.ownsPost(postId,userId)==0) throw new SecurityException("첨부파일을 등록할 수 없는 게시글입니다.");
        List<MultipartFile> usable=files==null?List.of():files.stream().filter(f->f!=null&&!f.isEmpty()).toList();
        if(usable.isEmpty()) throw new IllegalArgumentException("첨부할 파일을 선택해주세요.");
        if(dao.attachmentCount(postId,normalized)+usable.size()>MAX_ATTACHMENTS_PER_TYPE) throw new IllegalArgumentException((normalized.equals("IMAGE")?"이미지":"일반 파일")+"는 게시글당 5개까지 등록할 수 있습니다.");
        Path directory=attachmentDirectory();
        try { Files.createDirectories(directory); } catch(IOException e) { throw new IllegalStateException("첨부파일 저장 폴더를 만들 수 없습니다.",e); }
        for(MultipartFile file:usable) saveAttachment(postId,userId,normalized,file,directory);
        return dao.attachments(postId);
    }

    public CommunityAttachmentFile downloadAttachment(long id) {
        Map<String,Object> item=dao.attachment(id);
        if(item==null) throw new NoSuchElementException("첨부파일을 찾을 수 없습니다.");
        Path path=attachmentDirectory().resolve(String.valueOf(item.get("storedName"))).normalize();
        if(!path.startsWith(attachmentDirectory())||!Files.isRegularFile(path)) throw new NoSuchElementException("첨부파일을 찾을 수 없습니다.");
        try { return new CommunityAttachmentFile(Files.readAllBytes(path),String.valueOf(item.get("originalName")),String.valueOf(item.get("contentType")),"IMAGE".equals(item.get("attachmentType"))); }
        catch(IOException e) { throw new IllegalStateException("첨부파일을 읽을 수 없습니다.",e); }
    }

    @Transactional public void deleteAttachment(long id,long userId,boolean admin) {
        Map<String,Object> item=dao.attachment(id);
        if(item==null) throw new NoSuchElementException("첨부파일을 찾을 수 없습니다.");
        if(dao.deleteAttachment(id,userId,admin)==0) throw new SecurityException("삭제할 수 없는 첨부파일입니다.");
        try { Files.deleteIfExists(attachmentDirectory().resolve(String.valueOf(item.get("storedName"))).normalize()); }
        catch(IOException ignored) { }
    }

    private void saveAttachment(long postId,long userId,String type,MultipartFile file,Path directory) {
        long max=type.equals("IMAGE")?5L*1024*1024:10L*1024*1024;
        if(file.getSize()>max) throw new IllegalArgumentException(type.equals("IMAGE")?"이미지는 파일당 5MB까지 등록할 수 있습니다.":"일반 파일은 파일당 10MB까지 등록할 수 있습니다.");
        String original=safeOriginalName(file.getOriginalFilename());
        String contentType=file.getContentType()==null?"application/octet-stream":file.getContentType().toLowerCase(Locale.ROOT);
        String extension=extension(original);
        if(type.equals("IMAGE")) {
            if(!IMAGE_TYPES.contains(contentType)||!Set.of("jpg","jpeg","png","gif","webp").contains(extension)) throw new IllegalArgumentException("JPG, PNG, GIF, WEBP 이미지만 등록할 수 있습니다.");
            if(!extension.equals("webp")) try { if(ImageIO.read(file.getInputStream())==null) throw new IllegalArgumentException("올바른 이미지 파일이 아닙니다."); } catch(IOException e) { throw new IllegalArgumentException("이미지 파일을 확인해주세요."); }
        } else if(BLOCKED_FILE_EXTENSIONS.contains(extension)) throw new IllegalArgumentException("실행 가능한 파일은 첨부할 수 없습니다.");
        String stored=UUID.randomUUID()+ (extension.isEmpty()?"":"."+extension);
        Path target=directory.resolve(stored).normalize();
        try {
            Files.copy(file.getInputStream(),target,StandardCopyOption.REPLACE_EXISTING);
            Map<String,Object> p=new HashMap<>();p.put("postId",postId);p.put("userId",userId);p.put("type",type);p.put("originalName",original);p.put("storedName",stored);p.put("contentType",contentType);p.put("fileSize",file.getSize());dao.insertAttachment(p);
        } catch(RuntimeException|IOException e) {
            try { Files.deleteIfExists(target); } catch(IOException ignored) { }
            if(e instanceof RuntimeException runtime) throw runtime;
            throw new IllegalStateException("첨부파일을 저장하지 못했습니다.",e);
        }
    }

    private static String safeOriginalName(String name) {
        String cleaned=name==null?"첨부파일":name.replaceAll("[\\p{Cntrl}]","").trim();
        String value=cleaned.isEmpty()?"첨부파일":Path.of(cleaned).getFileName().toString();
        if(value.isEmpty()) value="첨부파일";
        return value.length()>255?value.substring(value.length()-255):value;
    }
    private static String extension(String name){int dot=name.lastIndexOf('.');return dot<0?"":name.substring(dot+1).toLowerCase(Locale.ROOT);}
    private static Path attachmentDirectory(){return Path.of(System.getProperty("user.home"),".jette_yak","uploads","community").toAbsolutePath().normalize();}

    private Map<String,Object> values(CommunityPostRequest r){if(r==null)throw new IllegalArgumentException("게시글 내용을 입력해주세요.");String category=clean(r.getCategory(),20);if(!CATEGORIES.contains(category))throw new IllegalArgumentException("게시글 유형을 선택해주세요.");Map<String,Object> p=new HashMap<>();p.put("medicationId",nullable(clean(r.getMedicationId(),30)));p.put("medicationName",nullable(clean(r.getMedicationName(),150)));p.put("category",category);p.put("title",required(r.getTitle(),150,"제목을 입력해주세요."));p.put("content",required(r.getContent(),4000,"내용을 입력해주세요."));p.put("experienceDuration",nullable(clean(r.getExperienceDuration(),50)));p.put("ageGroup",nullable(clean(r.getAgeGroup(),30)));p.put("purpose",nullable(clean(r.getPurpose(),100)));p.put("occurrenceTiming",nullable(clean(r.getOccurrenceTiming(),80)));p.put("currentlyTaking",Boolean.TRUE.equals(r.getCurrentlyTaking())?1:0);return p;}
    private static String required(String v,int max,String message){String s=clean(v,max);if(s.isEmpty())throw new IllegalArgumentException(message);return s;}
    private static String clean(String v,int max){String s=v==null?"":v.trim();if(s.length()>max)throw new IllegalArgumentException("입력 가능한 글자 수를 초과했습니다.");return s;}
    private static String nullable(String s){return s.isEmpty()?null:s;}
}
