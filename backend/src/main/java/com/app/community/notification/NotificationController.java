/**
 * 역할: 로그인 사용자의 저장형 알림 조회와 읽음 처리 API 제공
 * 인증 기준: URL이나 요청 본문의 사용자 번호를 받지 않고 세션 userId만 사용
 */
package com.app.community.notification;

import java.util.Map;
import javax.servlet.http.HttpServletRequest;
import javax.servlet.http.HttpSession;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api/notifications")
public class NotificationController {
    private final NotificationService service;
    public NotificationController(NotificationService service){this.service=service;}
    @GetMapping public Map<String,Object> list(HttpServletRequest request){return Map.of("items",service.list(userId(request)));}
    @PatchMapping("/{id}/read") public Map<String,Object> read(@PathVariable("id") long id,HttpServletRequest request){service.markRead(id,userId(request));return Map.of("success",true);}
    @PatchMapping("/read-all") public Map<String,Object> readAll(HttpServletRequest request){service.markAllRead(userId(request));return Map.of("success",true);}
    @ExceptionHandler(SecurityException.class) public ResponseEntity<?> unauthorized(SecurityException e){return ResponseEntity.status(401).body(Map.of("message",e.getMessage()));}
    @ExceptionHandler(IllegalArgumentException.class) public ResponseEntity<?> bad(IllegalArgumentException e){return ResponseEntity.badRequest().body(Map.of("message",e.getMessage()));}
    private static long userId(HttpServletRequest request){HttpSession session=request.getSession(false);Object value=session==null?null:session.getAttribute("userId");if(!(value instanceof Number))throw new SecurityException("로그인이 필요합니다.");return ((Number)value).longValue();}
}
