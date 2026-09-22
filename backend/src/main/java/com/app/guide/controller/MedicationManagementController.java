package com.app.guide.controller;
import java.util.*;
import javax.servlet.http.HttpServletRequest;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;
import org.springframework.dao.DataAccessException;
import com.app.guide.service.MedicationManagementService;

@RestController
@RequestMapping("/api/guides")
public class MedicationManagementController {
    private final MedicationManagementService service;
    public MedicationManagementController(MedicationManagementService service){this.service=service;}
    private Long user(HttpServletRequest request){var session=request.getSession(false);var id=session==null?null:session.getAttribute("userId");return id instanceof Long&&(Long)id>0?(Long)id:null;}
    private ResponseEntity<?> call(java.util.function.Supplier<Object> action){
        try{return ResponseEntity.ok().header("Cache-Control","no-store").body(action.get());}
        catch(IllegalArgumentException e){return ResponseEntity.badRequest().body(Map.of("error",e.getMessage()));}
        catch(DataAccessException e){org.apache.logging.log4j.LogManager.getLogger(getClass()).error("내 약 관리 조회/저장 실패",e);return ResponseEntity.status(500).body(Map.of("error","약 정보를 처리하지 못했습니다. 잠시 후 다시 시도해주세요."));}
    }
    private ResponseEntity<?> unauthorized(){return ResponseEntity.status(401).header("Cache-Control","no-store").body(Map.of("error","로그인이 필요합니다."));}
    @GetMapping("/collection")
    public ResponseEntity<?> collection(HttpServletRequest request){var id=user(request);return id==null?unauthorized():call(()->Map.of("items",service.collection(id)));}
    public record StatusRequest(String status){}
    @PatchMapping("/collection/{registrationId}")
    public ResponseEntity<?> update(@PathVariable("registrationId") String registrationId,@RequestBody StatusRequest body,HttpServletRequest request){
        var id=user(request);if(id==null)return unauthorized();
        return call(()->{service.update(id,registrationId,body.status());return Map.of("message","복용 상태를 저장했습니다.");});
    }
    @GetMapping("/collection/dur")
    public ResponseEntity<?> mine(HttpServletRequest request){var id=user(request);return id==null?unauthorized():call(()->service.myComparison(id));}
    public record CompareRequest(List<String> medicationIds){}
    @PostMapping("/compare")
    public ResponseEntity<?> compare(@RequestBody CompareRequest body){return call(()->service.compare(body.medicationIds()));}
}
