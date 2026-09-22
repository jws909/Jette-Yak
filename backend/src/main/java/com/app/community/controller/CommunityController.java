package com.app.community.controller;

import java.util.*;
import javax.servlet.http.*;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.*;
import org.springframework.web.bind.annotation.*;
import com.app.community.dto.*;
import com.app.community.service.CommunityService;

@RestController
@RequestMapping("/api/community")
public class CommunityController {
    private final CommunityService service;
    @Autowired public CommunityController(CommunityService service){this.service=service;}

    @GetMapping("/posts") public Map<String,Object> posts(@RequestParam(value="q",required=false)String q,@RequestParam(value="category",required=false)String category,@RequestParam(value="medicationId",required=false)String medicationId,@RequestParam(value="sort",defaultValue="LATEST")String sort,@RequestParam(value="page",defaultValue="1")int page,HttpServletRequest req){return service.posts(q,category,medicationId,sort,page,userId(req,false));}
    @GetMapping("/posts/{id}") public Map<String,Object> post(@PathVariable long id,HttpServletRequest req){return service.post(id,userId(req,false));}
    @PostMapping("/posts") public ResponseEntity<?> create(@RequestBody CommunityPostRequest body,HttpServletRequest req){return ResponseEntity.status(201).body(service.create(userId(req,true),body));}
    @PatchMapping("/posts/{id}") public Map<String,Object> update(@PathVariable long id,@RequestBody CommunityPostRequest body,HttpServletRequest req){return service.update(id,userId(req,true),body);}
    @DeleteMapping("/posts/{id}") public ResponseEntity<Void> delete(@PathVariable long id,HttpServletRequest req){service.delete(id,userId(req,true));return ResponseEntity.noContent().build();}
    @PostMapping("/posts/{id}/helpful") public Map<String,Object> helpful(@PathVariable long id,HttpServletRequest req){return service.helpful(id,userId(req,true));}
    @PostMapping("/posts/{id}/comments") public ResponseEntity<?> comment(@PathVariable long id,@RequestBody CommunityCommentRequest body,HttpServletRequest req){return ResponseEntity.status(201).body(service.comment(id,userId(req,true),body));}
    @DeleteMapping("/comments/{id}") public ResponseEntity<Void> deleteComment(@PathVariable long id,HttpServletRequest req){service.deleteComment(id,userId(req,true));return ResponseEntity.noContent().build();}
    @PostMapping("/reports") public ResponseEntity<?> report(@RequestBody CommunityReportRequest body,HttpServletRequest req){service.report(userId(req,true),body);return ResponseEntity.status(201).body(Map.of("message","신고가 접수되었습니다."));}
    @GetMapping("/medications") public List<Map<String,Object>> medications(@RequestParam("q")String q){return service.medications(q);}

    @GetMapping("/admin/reports") public List<Map<String,Object>> reports(HttpServletRequest req){admin(req);return service.reports();}
    @GetMapping("/admin/info-reports") public List<Map<String,Object>> infoReports(HttpServletRequest req){admin(req);return service.pendingInfoReports();}
    @PatchMapping("/admin/posts/{id}/status") public Map<String,String> moderatePost(@PathVariable long id,@RequestBody CommunityModerationRequest body,HttpServletRequest req){long admin=admin(req);service.moderatePost(id,body.getStatus(),admin);return Map.of("message","게시글 상태를 변경했습니다.");}
    @PatchMapping("/admin/posts/{id}/review") public Map<String,String> reviewPost(@PathVariable long id,@RequestBody CommunityModerationRequest body,HttpServletRequest req){long admin=admin(req);service.reviewInfoPost(id,body.getStatus(),admin);return Map.of("message","정보 제보를 검토했습니다.");}
    @PatchMapping("/admin/reports/{id}") public Map<String,String> resolve(@PathVariable long id,@RequestBody CommunityModerationRequest body,HttpServletRequest req){service.resolveReport(id,body,admin(req));return Map.of("message","신고를 처리했습니다.");}

    @ExceptionHandler(IllegalArgumentException.class) public ResponseEntity<?> bad(IllegalArgumentException e){return ResponseEntity.badRequest().body(Map.of("message",e.getMessage()));}
    @ExceptionHandler(NoSuchElementException.class) public ResponseEntity<?> missing(NoSuchElementException e){return ResponseEntity.status(404).body(Map.of("message",e.getMessage()));}
    @ExceptionHandler(SecurityException.class) public ResponseEntity<?> forbidden(SecurityException e){return ResponseEntity.status(403).body(Map.of("message",e.getMessage()));}

    private static Long userId(HttpServletRequest req,boolean required){HttpSession s=req.getSession(false);Object v=s==null?null:s.getAttribute("userId");Long id=v instanceof Number?((Number)v).longValue():null;if(required&&id==null)throw new SecurityException("로그인이 필요한 기능입니다.");return id;}
    private static long admin(HttpServletRequest req){HttpSession s=req.getSession(false);Object role=s==null?null:s.getAttribute("role");if(!"ADMIN".equals(String.valueOf(role)))throw new SecurityException("관리자만 사용할 수 있습니다.");return userId(req,true);}
}
