package com.app.easydrug.dto;

import java.util.List;

import com.fasterxml.jackson.annotation.JsonIgnoreProperties;

/*
 * =========================================================
 * e약은요 API 전체 응답 DTO
 * =========================================================
 *
 * API 응답 구조
 *
 * {
 *     "header" : {
 *         "resultCode" : "00",
 *         "resultMsg" : "NORMAL SERVICE."
 *     },
 *
 *     "body" : {
 *         "pageNo" : 1,
 *         "totalCount" : 4779,
 *         "numOfRows" : 100,
 *         "items" : [
 *             ...
 *         ]
 *     }
 * }
 * =========================================================
 */
@JsonIgnoreProperties(ignoreUnknown = true)
public class MedicationEasyApiResponse {

	private Header header;

	private Body body;

	/*
	 * =====================================================
	 * HEADER
	 * =====================================================
	 *
	 * API 요청이 정상적으로 처리됐는지 확인한다.
	 */
	@JsonIgnoreProperties(ignoreUnknown = true)
	public static class Header {

		private String resultCode;

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
	 * =====================================================
	 * BODY
	 * =====================================================
	 */
	@JsonIgnoreProperties(ignoreUnknown = true)
	public static class Body {

		/*
		 * 현재 페이지
		 */
		private int pageNo;

		/*
		 * API 전체 데이터 개수
		 */
		private int totalCount;

		/*
		 * 한 페이지 데이터 개수
		 */
		private int numOfRows;

		/*
		 * 실제 e약은요 데이터 목록
		 */
		private List<MedicationEasyDto> items;

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

		public List<MedicationEasyDto> getItems() {
			return items;
		}

		public void setItems(List<MedicationEasyDto> items) {

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