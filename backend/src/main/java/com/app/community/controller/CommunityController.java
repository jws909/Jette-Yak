/**
 * 역할: 게시글·댓글·첨부파일·신고·관리자 처리 HTTP API
 * 보안 기준: 요청 본문의 사용자 번호를 쓰지 않고 로그인 세션으로 작성자와 관리자 판별
 */
package com.app.community.controller;

import java.util.*;
import javax.servlet.http.*;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.*;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.multipart.MultipartFile;
import java.nio.charset.StandardCharsets;
import com.app.community.dto.*;
import com.app.community.service.CommunityService;
import com.app.util.AdminSession;

@RestController
@RequestMapping("/api/community")
public class CommunityController {
    private final CommunityService service;
    @Autowired public CommunityController(CommunityService service){this.service=service;}

    // 일반 사용자 영역: 목록과 상세는 공개, 작성·변경·신고는 로그인 필수
    @GetMapping("/posts") public Map<String,Object> posts(@RequestParam(value="q",required=false)String q,@RequestParam(value="category",required=false)String category,@RequestParam(value="medicationId",required=false)String medicationId,@RequestParam(value="sort",defaultValue="LATEST")String sort,@RequestParam(value="page",defaultValue="1")int page,HttpServletRequest req){return service.posts(q,category,medicationId,sort,page,userId(req,false));}
    @GetMapping("/my-posts") public List<Map<String,Object>> myPosts(HttpServletRequest req){return service.myPosts(userId(req,true));}
    @GetMapping("/posts/{id}") public Map<String,Object> post(@PathVariable long id,HttpServletRequest req){return service.post(id,userId(req,false),AdminSession.isAdmin(req));}
    @PostMapping("/posts") public ResponseEntity<?> create(@RequestBody CommunityPostRequest body,HttpServletRequest req){return ResponseEntity.status(201).body(service.create(userId(req,true),body));}
    @PatchMapping("/posts/{id}") public Map<String,Object> update(@PathVariable long id,@RequestBody CommunityPostRequest body,HttpServletRequest req){return service.update(id,userId(req,true),body);}
    @DeleteMapping("/posts/{id}") public ResponseEntity<Void> delete(@PathVariable long id,HttpServletRequest req){service.delete(id,userId(req,true));return ResponseEntity.noContent().build();}
    @PostMapping("/posts/{id}/helpful") public Map<String,Object> helpful(@PathVariable long id,HttpServletRequest req){return service.helpful(id,userId(req,true));}
    @PostMapping("/posts/{id}/comments") public ResponseEntity<?> comment(@PathVariable long id,@RequestBody CommunityCommentRequest body,HttpServletRequest req){return ResponseEntity.status(201).body(service.comment(id,userId(req,true),body));}
    @PostMapping("/comments/{id}/helpful") public Map<String,Object> commentHelpful(@PathVariable long id,HttpServletRequest req){return service.commentHelpful(id,userId(req,true));}
    @DeleteMapping("/comments/{id}") public ResponseEntity<Void> deleteComment(@PathVariable long id,HttpServletRequest req){service.deleteComment(id,userId(req,true));return ResponseEntity.noContent().build();}
    @PostMapping("/reports") public ResponseEntity<?> report(@RequestBody CommunityReportRequest body,HttpServletRequest req){service.report(userId(req,true),body);return ResponseEntity.status(201).body(Map.of("message","신고가 접수되었습니다."));}
    @GetMapping("/medications") public List<Map<String,Object>> medications(@RequestParam("q")String q){return service.medications(q);}
    @PostMapping(value="/posts/{id}/attachments",consumes=MediaType.MULTIPART_FORM_DATA_VALUE) public ResponseEntity<?> attachments(@PathVariable long id,@RequestParam("type")String type,@RequestParam("files")List<MultipartFile> files,HttpServletRequest req){return ResponseEntity.status(201).body(service.addAttachments(id,userId(req,true),type,files));}
    @GetMapping("/attachments/{id}") public ResponseEntity<byte[]> attachment(@PathVariable long id){CommunityAttachmentFile file=service.downloadAttachment(id);MediaType media;try{media=MediaType.parseMediaType(file.contentType());}catch(Exception e){media=MediaType.APPLICATION_OCTET_STREAM;}ContentDisposition disposition=(file.image()?ContentDisposition.inline():ContentDisposition.attachment()).filename(file.originalName(),StandardCharsets.UTF_8).build();return ResponseEntity.ok().contentType(media).header(HttpHeaders.CONTENT_DISPOSITION,disposition.toString()).header("X-Content-Type-Options","nosniff").body(file.bytes());}
    @DeleteMapping("/attachments/{id}") public ResponseEntity<Void> deleteAttachment(@PathVariable long id,HttpServletRequest req){long user=userId(req,true);service.deleteAttachment(id,user,AdminSession.isAdmin(req));return ResponseEntity.noContent().build();}

    // 관리자 영역: 세션의 is_admin 값을 통과한 요청만 서비스 호출
    @GetMapping("/admin/reports") public List<Map<String,Object>> reports(HttpServletRequest req){admin(req);return service.reports();}
    @GetMapping("/admin/info-reports") public List<Map<String,Object>> infoReports(HttpServletRequest req){admin(req);return service.pendingInfoReports();}
    @GetMapping("/admin/moderated-content") public List<Map<String,Object>> moderatedContent(HttpServletRequest req){admin(req);return service.moderatedContent();}
    @PatchMapping("/admin/posts/{id}/status") public Map<String,String> moderatePost(@PathVariable long id,@RequestBody CommunityModerationRequest body,HttpServletRequest req){long admin=admin(req);service.moderatePost(id,body.getStatus(),admin);return Map.of("message","게시글 상태를 변경했습니다.");}
    @PatchMapping("/admin/comments/{id}/status") public Map<String,String> moderateComment(@PathVariable long id,@RequestBody CommunityModerationRequest body,HttpServletRequest req){long admin=admin(req);service.moderateComment(id,body.getStatus(),admin);return Map.of("message","댓글 상태를 변경했습니다.");}
    @PatchMapping("/admin/posts/{id}/review") public Map<String,String> reviewPost(@PathVariable long id,@RequestBody CommunityModerationRequest body,HttpServletRequest req){long admin=admin(req);service.reviewInfoPost(id,body,admin);return Map.of("message","정보 제보를 검토했습니다.");}
    @PatchMapping("/admin/reports/{id}") public Map<String,String> resolve(@PathVariable long id,@RequestBody CommunityModerationRequest body,HttpServletRequest req){service.resolveReport(id,body,admin(req));return Map.of("message","신고를 처리했습니다.");}

    // 서비스 예외를 화면에서 처리할 수 있는 JSON 메시지와 HTTP 상태로 변환
    @ExceptionHandler(IllegalArgumentException.class) public ResponseEntity<?> bad(IllegalArgumentException e){return ResponseEntity.badRequest().body(Map.of("message",e.getMessage()));}
    @ExceptionHandler(NoSuchElementException.class) public ResponseEntity<?> missing(NoSuchElementException e){return ResponseEntity.status(404).body(Map.of("message",e.getMessage()));}
    @ExceptionHandler(SecurityException.class) public ResponseEntity<?> forbidden(SecurityException e){return ResponseEntity.status(403).body(Map.of("message",e.getMessage()));}
    @ExceptionHandler(IllegalStateException.class) public ResponseEntity<?> serverError(IllegalStateException e){return ResponseEntity.status(500).body(Map.of("message",e.getMessage()));}

    // 프로필 조회만으로 만들어진 세션과 실제 로그인 세션 구분. 인증이 끝난 양수 사용자 번호만 신뢰
    private static Long userId(HttpServletRequest req,boolean required){
        HttpSession session=req==null?null:req.getSession(false);
        Object value=session==null?null:session.getAttribute("userId");
        boolean authenticated=session!=null&&Boolean.TRUE.equals(session.getAttribute("authenticated"));
        Long id=authenticated&&value instanceof Number?((Number)value).longValue():null;
        if(id!=null&&id<=0)id=null;
        if(required&&id==null)throw new SecurityException("로그인이 필요한 기능입니다.");
        return id;
    }
    private static long admin(HttpServletRequest req){if(!AdminSession.isAdmin(req))throw new SecurityException("관리자만 사용할 수 있습니다.");return userId(req,true);}
}
