package com.app.medication.dto;

import java.util.List;

import com.fasterxml.jackson.annotation.JsonIgnoreProperties;

/*
 * 식약처 의약품 허가정보 API 전체 응답 DTO
 */
@JsonIgnoreProperties(ignoreUnknown = true)
public class MedicationPermitApiResponse {


    private Header header;

    private Body body;


    /*
     * API 응답의 header 영역
     */
    @JsonIgnoreProperties(ignoreUnknown = true)
    public static class Header {

        // 00이면 정상
        private String resultCode;

        // NORMAL SERVICE. 등 결과 메시지
        private String resultMsg;


        public String getResultCode() {
            return resultCode;
        }

        public void setResultCode(String resultCode) {
            this.resultCode = resultCode;
        }


        public String getResultMsg() {
            return resultMsg;
        }

        public void setResultMsg(String resultMsg) {
            this.resultMsg = resultMsg;
        }
    }


    /*
     * API 응답의 body 영역
     */
    @JsonIgnoreProperties(ignoreUnknown = true)
    public static class Body {

        // 현재 페이지 번호
        private int pageNo;

        // API에 존재하는 전체 데이터 개수
        private int totalCount;

        // 현재 한 페이지당 데이터 개수
        private int numOfRows;

        // 현재 페이지의 실제 약 목록
        private List<MedicationPermitDto> items;


        public int getPageNo() {
            return pageNo;
        }

        public void setPageNo(int pageNo) {
            this.pageNo = pageNo;
        }


        public int getTotalCount() {
            return totalCount;
        }

        public void setTotalCount(int totalCount) {
            this.totalCount = totalCount;
        }


        public int getNumOfRows() {
            return numOfRows;
        }

        public void setNumOfRows(int numOfRows) {
            this.numOfRows = numOfRows;
        }


        public List<MedicationPermitDto> getItems() {
            return items;
        }

        public void setItems(List<MedicationPermitDto> items) {
            this.items = items;
        }
    }


    public Header getHeader() {
        return header;
    }

    public void setHeader(Header header) {
        this.header = header;
    }


    public Body getBody() {
        return body;
    }

    public void setBody(Body body) {
        this.body = body;
    }
}